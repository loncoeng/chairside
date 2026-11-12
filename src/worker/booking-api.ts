// Booking endpoints. The rules in ../db/booking-rules.ts also run in the UI,
// but the server re-checks every request.

import { asc, eq, inArray } from "drizzle-orm";

import {
  bookingEvents,
  bookingItems,
  bookings,
  businessHours,
  closures,
  customers,
  seats,
  services,
  staff,
  servicePrices,
} from "../db/schema.ts";
import { blocked, check } from "../db/booking-rules.ts";
import type { Draft, Existing } from "../db/booking-rules.ts";

import { isDate, isTime } from "../db/dates.ts";
import type { Database as Db } from "../db/database.ts";

/** Active services with per-grade prices (`byGrade`, null when the price doesn't vary). */
export async function menu(db: Db) {
  const [rows, graded] = await Promise.all([
    db
      .select({
        id: services.id,
        nameJa: services.nameJa,
        nameZh: services.nameZh,
        nameEn: services.nameEn,
        durationMin: services.durationMin,
        seatKind: services.seatKind,
        price: services.price,
      })
      .from(services)
      .where(eq(services.active, true))
      .orderBy(asc(services.sortOrder), asc(services.id)),
    db
      .select({
        serviceId: servicePrices.serviceId,
        grade: servicePrices.grade,
        price: servicePrices.price,
      })
      .from(servicePrices),
  ]);

  const byService = new Map<number, Record<string, number>>();
  for (const row of graded) {
    const found = byService.get(row.serviceId) ?? {};
    found[row.grade] = row.price;
    byService.set(row.serviceId, found);
  }

  return rows.map((row) => ({ ...row, byGrade: byService.get(row.id) ?? null }));
}

/** Customer list for the booking form picker. */
export async function customerList(db: Db) {
  return await db
    .select({
      id: customers.id,
      name: customers.name,
      searchKey: customers.searchKey,
      phone: customers.phone,
    })
    .from(customers)
    .orderBy(asc(customers.name));
}

/** Fields a client may send. Durations come from the menu, never the request. */
type Proposal = {
  date?: unknown;
  customerId?: unknown;
  staffId?: unknown;
  nominated?: unknown;
  note?: unknown;
  acceptWarnings?: unknown;
  startsAt?: unknown;
  serviceIds?: unknown;
};

export async function createBooking(
  db: Db,
  request: Request,
  byStaffId: number | null,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Proposal | null;
  if (!body || typeof body !== "object") return bad("unreadable-body", "The request body could not be read.");

  const date = typeof body.date === "string" ? body.date : "";
  if (!isDate(date)) return bad("bad-date", "Send the date as YYYY-MM-DD.");

  // Strict range check, or "25:99" would be refused later as crossing midnight.
  const startsAt = typeof body.startsAt === "string" ? body.startsAt : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)) return bad("bad-start-time", "The start time is not in HH:MM form.");

  const serviceIds = Array.isArray(body.serviceIds)
    ? body.serviceIds.filter((id): id is number => Number.isInteger(id))
    : [];
  if (serviceIds.length === 0) return bad("no-services", "Choose at least one treatment.");
  if (serviceIds.length > 8) return bad("too-many-services", "A booking can hold at most eight treatments.");


  const chosen = await db
    .select({ id: services.id, durationMin: services.durationMin, seatKind: services.seatKind })
    .from(services)
    .where(inArray(services.id, serviceIds));

  const byId = new Map(chosen.map((s) => [s.id, s]));
  if (serviceIds.some((id) => !byId.has(id))) return bad("unknown-service", "A treatment is not on the menu.");

  const staffId = intOrNull(body.staffId);

  // Treatments run back to back from the start time.
  let cursor = toMinutes(startsAt);
  const drafts: Draft[] = [];
  const plan: { serviceId: number; startsAt: string; endsAt: string }[] = [];

  for (const id of serviceIds) {
    const service = byId.get(id)!;
    const from = cursor;
    const to = cursor + service.durationMin;

    drafts.push({
      seatId: null,
      seatKind: service.seatKind,
      staffId,
      startsAt: clockOf(from),
      endsAt: clockOf(to),
    });
    plan.push({ serviceId: id, startsAt: clockOf(from), endsAt: clockOf(to) });
    cursor = to;
  }

  // Refuse past midnight so day arithmetic doesn't wrap.
  if (cursor >= 24 * 60) return bad("crosses-midnight", "Starting then, it would run past midnight.");

  const [existing, room] = await Promise.all([existingOn(db, date), roomFor(db, date)]);
  const verdicts = check(drafts, existing, room);

  if (blocked(verdicts)) {
    return json({ ok: false, verdicts }, 409);
  }

  // Warnings must be confirmed with acceptWarnings before saving.
  if (verdicts.length > 0 && body.acceptWarnings !== true) {
    return json({ ok: false, verdicts, needsConfirmation: true }, 409);
  }

  const first = plan[0]!;
  const last = plan[plan.length - 1]!;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  const [created] = await db
    .insert(bookings)
    .values({
      customerId: intOrNull(body.customerId),
      date,
      startsAt: first.startsAt,
      endsAt: last.endsAt,
      status: "booked",
      nominated: body.nominated === true,
      source: "staff",
      note: note === "" ? null : note,
    })
    .returning({ id: bookings.id });

  if (!created) return json({ code: "create-failed", error: "It could not be saved." }, 500);

  await db.insert(bookingItems).values(
    plan.map((line, index) => ({
      bookingId: created.id,
      serviceId: line.serviceId,
      staffId,
      // Assigned on the day. See Draft.seatId.
      seatId: null,
      startsAt: line.startsAt,
      endsAt: line.endsAt,
      sortOrder: index,
    })),
  );

  await db.insert(bookingEvents).values({
    bookingId: created.id,
    kind: "created",
    byStaffId,
    before: null,
    after: `${date} ${first.startsAt}`,
  });

  return json({ ok: true, bookingId: created.id, verdicts }, 201);
}

/**
 * Existing booking lines for a date. An unseated line still takes a seat of
 * its kind, so the service's seat kind stands in for capacity checks.
 */
async function existingOn(db: Db, date: string): Promise<Existing[]> {
  const rows = await db
    .select({
      itemId: bookingItems.id,
      bookingId: bookings.id,
      status: bookings.status,
      seatId: bookingItems.seatId,
      seatName: seats.name,
      bySeat: seats.kind,
      byService: services.seatKind,
      staffId: bookingItems.staffId,
      staffName: staff.name,
      startsAt: bookingItems.startsAt,
      endsAt: bookingItems.endsAt,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .leftJoin(seats, eq(seats.id, bookingItems.seatId))
    .leftJoin(staff, eq(staff.id, bookingItems.staffId))
    .leftJoin(services, eq(services.id, bookingItems.serviceId))
    .where(eq(bookings.date, date));

  return rows.map(({ bySeat, byService, ...rest }) => ({
    ...rest,
    seatKind: bySeat ?? byService,
  }));
}

async function roomFor(db: Db, date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  const [allSeats, hours, shut] = await Promise.all([
    db
      .select({ id: seats.id, kind: seats.kind, name: seats.name })
      .from(seats)
      .where(eq(seats.active, true)),
    db
      .select({
        opensAt: businessHours.opensAt,
        closesAt: businessHours.closesAt,
        closed: businessHours.closed,
      })
      .from(businessHours)
      .where(eq(businessHours.weekday, weekday))
      .limit(1),
    db.select({ id: closures.id }).from(closures).where(eq(closures.date, date)).limit(1),
  ]);

  return {
    seats: allSeats,
    hours: hours[0] ?? { opensAt: null, closesAt: null, closed: true },
    closure: shut.length > 0,
  };
}

const intOrNull = (value: unknown): number | null =>
  Number.isInteger(value) ? (value as number) : null;

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const clockOf = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const bad = (code: string, message: string) => json({ ok: false, code, error: message }, 400);

const STATUSES = ["booked", "arrived", "done", "cancelled", "no_show"] as const;
type Status = (typeof STATUSES)[number];

/** One booking with its items and history, for the edit panel. */
export async function getBooking(db: Db, id: number) {
  const [booking] = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      nominated: bookings.nominated,
      source: bookings.source,
      note: bookings.note,
      customerId: bookings.customerId,
      customerName: customers.name,
    })
    .from(bookings)
    .leftJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!booking) return null;

  const items = await db
    .select({
      id: bookingItems.id,
      serviceId: bookingItems.serviceId,
      staffId: bookingItems.staffId,
      seatId: bookingItems.seatId,
      startsAt: bookingItems.startsAt,
      endsAt: bookingItems.endsAt,
    })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, id))
    .orderBy(asc(bookingItems.sortOrder), asc(bookingItems.id));

  // Oldest first.
  const history = await db
    .select({
      id: bookingEvents.id,
      at: bookingEvents.at,
      kind: bookingEvents.kind,
      before: bookingEvents.before,
      after: bookingEvents.after,
    })
    .from(bookingEvents)
    .where(eq(bookingEvents.bookingId, id))
    .orderBy(asc(bookingEvents.at), asc(bookingEvents.id));

  return { ...booking, items, history };
}

/**
 * Status change (no checks) or reschedule (same rules as a new booking, minus
 * its own rows). Bookings are never deleted; cancelled ones stay in the history.
 */
export async function updateBooking(
  db: Db,
  request: Request,
  id: number,
  byStaffId: number | null,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as (Proposal & { status?: unknown }) | null;
  if (!body || typeof body !== "object") return bad("unreadable-body", "The request body could not be read.");

  const current = await getBooking(db, id);
  if (!current) return json({ ok: false, code: "booking-not-found", error: "That booking was not found." }, 404);

  // Status only.

  if (typeof body.status === "string") {
    if (!(STATUSES as readonly string[]).includes(body.status)) {
      return bad("bad-status", "That status is not valid.");
    }

    // Any transition is allowed so mis-taps can be undone. The rules read the
    // status, so cancelling frees the seat.
    await db
      .update(bookings)
      .set({ status: body.status as Status })
      .where(eq(bookings.id, id));

    // Logged even when repeating a previous state.
    await db.insert(bookingEvents).values({
      bookingId: id,
      kind: "status",
      byStaffId,
      before: current.status,
      after: body.status,
    });

    return json({ ok: true, bookingId: id, status: body.status });
  }

  // Reschedule.

  const startsAt = typeof body.startsAt === "string" ? body.startsAt : current.startsAt;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)) return bad("bad-start-time", "The start time is not in HH:MM form.");

  const date = typeof body.date === "string" ? body.date : current.date;
  if (!isDate(date)) return bad("bad-date", "Send the date as YYYY-MM-DD.");

  const serviceIds = Array.isArray(body.serviceIds)
    ? body.serviceIds.filter((sid): sid is number => Number.isInteger(sid))
    : current.items.map((item) => item.serviceId).filter((sid): sid is number => sid !== null);

  if (serviceIds.length === 0) return bad("no-services", "Choose at least one treatment.");
  if (serviceIds.length > 8) return bad("too-many-services", "A booking can hold at most eight treatments.");

  const chosen = await db
    .select({ id: services.id, durationMin: services.durationMin, seatKind: services.seatKind })
    .from(services)
    .where(inArray(services.id, serviceIds));

  const byId = new Map(chosen.map((s) => [s.id, s]));
  if (serviceIds.some((sid) => !byId.has(sid))) return bad("unknown-service", "A treatment is not on the menu.");

  // Staff is per line (e.g. assistant shampoos, stylist cuts). If no staffId is sent
  // and the services are unchanged, each line keeps its staff; otherwise one
  // person takes every line.
  const sameServices =
    body.serviceIds === undefined ||
    (serviceIds.length === current.items.length &&
      serviceIds.every((sid, i) => current.items[i]?.serviceId === sid));

  const keepPerLine = body.staffId === undefined && sameServices;
  const oneStaffId =
    body.staffId === undefined ? (current.items[0]?.staffId ?? null) : intOrNull(body.staffId);

  const staffFor = (index: number): number | null =>
    keepPerLine ? (current.items[index]?.staffId ?? oneStaffId) : oneStaffId;

  let cursor = toMinutes(startsAt);
  const drafts: Draft[] = [];
  const plan: { serviceId: number; staffId: number | null; startsAt: string; endsAt: string }[] = [];

  for (const [index, sid] of serviceIds.entries()) {
    const service = byId.get(sid)!;
    const from = cursor;
    const to = cursor + service.durationMin;
    const who = staffFor(index);

    drafts.push({
      seatId: null,
      seatKind: service.seatKind,
      staffId: who,
      startsAt: clockOf(from),
      endsAt: clockOf(to),
    });
    plan.push({ serviceId: sid, staffId: who, startsAt: clockOf(from), endsAt: clockOf(to) });
    cursor = to;
  }

  if (cursor >= 24 * 60) return bad("crosses-midnight", "Starting then, it would run past midnight.");

  const [existing, room] = await Promise.all([existingOn(db, date), roomFor(db, date)]);
  // Exclude its own rows so a move doesn't clash with itself.
  const verdicts = check(drafts, existing, room, { ignoreBookingId: id });

  if (blocked(verdicts)) return json({ ok: false, verdicts }, 409);
  if (verdicts.length > 0 && body.acceptWarnings !== true) {
    return json({ ok: false, verdicts, needsConfirmation: true }, 409);
  }

  const first = plan[0]!;
  const last = plan[plan.length - 1]!;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : current.note;

  await db
    .update(bookings)
    .set({
      date,
      startsAt: first.startsAt,
      endsAt: last.endsAt,
      customerId: body.customerId === undefined ? current.customerId : intOrNull(body.customerId),
      nominated: body.nominated === undefined ? current.nominated : body.nominated === true,
      note: note === "" ? null : note,
    })
    .where(eq(bookings.id, id));

  // Replace rather than diff the lines (at most eight).
  await db.delete(bookingItems).where(eq(bookingItems.bookingId, id));
  await db.insert(bookingItems).values(
    plan.map((lineItem, index) => ({
      bookingId: id,
      serviceId: lineItem.serviceId,
      staffId: lineItem.staffId,
      seatId: null,
      startsAt: lineItem.startsAt,
      endsAt: lineItem.endsAt,
      sortOrder: index,
    })),
  );

  // One event per kind of change, so moves can be counted.
  const changes: { kind: "moved" | "restaffed"; before: string; after: string }[] = [];

  if (date !== current.date || first.startsAt !== current.startsAt) {
    changes.push({
      kind: "moved",
      before: `${current.date} ${current.startsAt}`,
      after: `${date} ${first.startsAt}`,
    });
  }

  const wasStaff = current.items[0]?.staffId ?? null;
  const nowStaff = plan[0]?.staffId ?? null;
  if (wasStaff !== nowStaff) {
    changes.push({
      kind: "restaffed",
      before: String(wasStaff ?? ""),
      after: String(nowStaff ?? ""),
    });
  }

  if (changes.length > 0) {
    await db.insert(bookingEvents).values(changes.map((c) => ({ bookingId: id, byStaffId, ...c })));
  }

  return json({ ok: true, bookingId: id, verdicts });
}
