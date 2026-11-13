// Booking endpoints. The rules in ../db/booking-rules.ts also run in the UI,
// but the server re-checks every request.
//
// D1 cannot hold a transaction open while JavaScript runs those rules, so two
// requests can both pass the check and both write. Every write is therefore
// checked once more after it lands: if it now clashes with a booking that has a
// lower id, it withdraws. Of two bookings that collide, exactly one survives, and
// it is the same one whichever request looks first.

import { asc, eq, inArray, sql } from "drizzle-orm";

import { atomically } from "../db/atomic.ts";
import type { Draft, Existing, Room, Verdict } from "../db/booking-rules.ts";
import { blocked, check } from "../db/booking-rules.ts";
import type { Database as Db } from "../db/database.ts";
import { isDate, isTime } from "../db/dates.ts";
import {
  bookingEvents,
  bookingItems,
  bookings,
  businessHours,
  closures,
  customers,
  seats,
  servicePrices,
  services,
  staff,
} from "../db/schema.ts";
import { bad, fail, json } from "./http.ts";

/** Active services with per-grade prices in cents (`byGrade`, null when the price doesn't vary). */
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
        priceCents: services.priceCents,
      })
      .from(services)
      .where(eq(services.active, true))
      .orderBy(asc(services.sortOrder), asc(services.id)),
    db
      .select({
        serviceId: servicePrices.serviceId,
        grade: servicePrices.grade,
        priceCents: servicePrices.priceCents,
      })
      .from(servicePrices),
  ]);

  const byService = new Map<number, Record<string, number>>();
  for (const row of graded) {
    const found = byService.get(row.serviceId) ?? {};
    found[row.grade] = row.priceCents;
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
  status?: unknown;
};

/** One treatment as it will be written. */
type Line = { serviceId: number; staffId: number | null; startsAt: string; endsAt: string };

const STATUSES = ["booked", "arrived", "done", "cancelled", "no_show"] as const;
type Status = (typeof STATUSES)[number];

/** Statuses that no longer hold a chair or a stylist. Matches booking-rules.ts. */
const gone = (status: string) => status === "cancelled" || status === "no_show";

export async function createBooking(
  db: Db,
  request: Request,
  byStaffId: number | null,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Proposal | null;
  if (!body || typeof body !== "object") {
    return bad("unreadable-body", "The request body could not be read.");
  }

  const date = typeof body.date === "string" ? body.date : "";
  if (!isDate(date)) return bad("bad-date", "Send the date as YYYY-MM-DD.");

  // Strict range check, or "25:99" would be refused later as crossing midnight.
  const startsAt = typeof body.startsAt === "string" ? body.startsAt : "";
  if (!isTime(startsAt)) return bad("bad-start-time", "The start time is not in HH:MM form.");

  const serviceIds = idsFrom(body.serviceIds);
  if (serviceIds === null) return bad("no-services", "Choose at least one treatment.");

  const customerId = intOrNull(body.customerId);
  const staffId = intOrNull(body.staffId);
  const refused = await refusedReference(db, date, customerId, [staffId]);
  if (refused) return refused;

  const planned = await plan(db, serviceIds, startsAt, () => staffId);
  if (planned instanceof Response) return planned;
  const { drafts, lines } = planned;

  const [existing, room] = await Promise.all([existingOn(db, date), roomFor(db, date)]);
  const verdicts = check(drafts, existing, room);

  if (blocked(verdicts)) return json({ ok: false, verdicts }, 409);
  // Warnings must be confirmed with acceptWarnings before saving.
  if (verdicts.length > 0 && body.acceptWarnings !== true) {
    return json({ ok: false, verdicts, needsConfirmation: true }, 409);
  }

  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  // The lines and the event name the booking by the highest id rather than by a
  // value read back in between: inside one batch nothing else can insert, so the
  // highest id is the row just written.
  const justWritten = sql`(SELECT max(${bookings.id}) FROM ${bookings})`;

  const [inserted] = await atomically(db, [
    db
      .insert(bookings)
      .values({
        customerId,
        date,
        startsAt: first.startsAt,
        endsAt: last.endsAt,
        status: "booked",
        nominated: body.nominated === true,
        source: "staff",
        note: note === "" ? null : note,
      })
      .returning({ id: bookings.id }),
    db.insert(bookingItems).values(
      lines.map((line, index) => ({
        bookingId: justWritten,
        serviceId: line.serviceId,
        staffId: line.staffId,
        // Assigned on the day. See Draft.seatId.
        seatId: null,
        startsAt: line.startsAt,
        endsAt: line.endsAt,
        sortOrder: index,
      })),
    ),
    db.insert(bookingEvents).values({
      bookingId: justWritten,
      kind: "created",
      byStaffId,
      before: null,
      after: `${date} ${first.startsAt}`,
    }),
  ]);

  const id = (inserted as { id: number }[] | undefined)?.[0]?.id;
  if (id === undefined) return fail(500, "create-failed", "It could not be saved.");

  const lost = await beaten(db, id, date, drafts, room);
  if (lost) {
    // Never shown to anybody, so it goes entirely rather than staying as cancelled.
    await atomically(db, [
      db.delete(bookingEvents).where(eq(bookingEvents.bookingId, id)),
      db.delete(bookingItems).where(eq(bookingItems.bookingId, id)),
      db.delete(bookings).where(eq(bookings.id, id)),
    ]);
    return json({ ok: false, verdicts: lost }, 409);
  }

  return json({ ok: true, bookingId: id, verdicts }, 201);
}

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
 * Status change or reschedule. Bookings are never deleted; cancelled ones stay
 * in the history.
 */
export async function updateBooking(
  db: Db,
  request: Request,
  id: number,
  byStaffId: number | null,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Proposal | null;
  if (!body || typeof body !== "object") {
    return bad("unreadable-body", "The request body could not be read.");
  }

  const current = await getBooking(db, id);
  if (!current) return fail(404, "booking-not-found", "That booking was not found.");

  if (typeof body.status === "string") return await setStatus(db, current, body.status, byStaffId);

  // Reschedule: the same rules as a new booking, minus its own rows.

  const startsAt = typeof body.startsAt === "string" ? body.startsAt : current.startsAt;
  if (!isTime(startsAt)) return bad("bad-start-time", "The start time is not in HH:MM form.");

  const date = typeof body.date === "string" ? body.date : current.date;
  if (!isDate(date)) return bad("bad-date", "Send the date as YYYY-MM-DD.");

  const serviceIds =
    body.serviceIds === undefined
      ? current.items.map((item) => item.serviceId).filter((sid): sid is number => sid !== null)
      : idsFrom(body.serviceIds);
  if (serviceIds === null || serviceIds.length === 0) {
    return bad("no-services", "Choose at least one treatment.");
  }

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

  const customerId =
    body.customerId === undefined ? current.customerId : intOrNull(body.customerId);
  // Only what changed is checked: a stylist who has since left can stay on an old booking.
  const refused = await refusedReference(
    db,
    date,
    customerId === current.customerId ? null : customerId,
    body.staffId === undefined ? [] : [oneStaffId],
  );
  if (refused) return refused;

  const planned = await plan(db, serviceIds, startsAt, staffFor);
  if (planned instanceof Response) return planned;
  const { drafts, lines } = planned;

  const [existing, room] = await Promise.all([existingOn(db, date), roomFor(db, date)]);
  // Exclude its own rows so a move doesn't clash with itself.
  const verdicts = check(drafts, existing, room, { ignoreBookingId: id });

  if (blocked(verdicts)) return json({ ok: false, verdicts }, 409);
  if (verdicts.length > 0 && body.acceptWarnings !== true) {
    return json({ ok: false, verdicts, needsConfirmation: true }, 409);
  }

  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : current.note;

  await writeLines(db, id, {
    date,
    startsAt: first.startsAt,
    endsAt: last.endsAt,
    customerId,
    nominated: body.nominated === undefined ? current.nominated : body.nominated === true,
    note: note === "" ? null : note,
    lines,
  });

  const lost = await beaten(db, id, date, drafts, room);
  if (lost) {
    // Put it back exactly as it was. Nothing was logged yet, so the history needs no repair.
    await writeLines(db, id, {
      ...current,
      lines: current.items,
    });
    return json({ ok: false, verdicts: lost }, 409);
  }

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
  const nowStaff = first.staffId;
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

/**
 * Any status may follow any other, so a mis-tap can be undone. Bringing a
 * cancelled or no-show booking back is the exception that is checked: while it
 * was gone, somebody else may have been given its stylist or its seat.
 */
async function setStatus(
  db: Db,
  current: NonNullable<Awaited<ReturnType<typeof getBooking>>>,
  status: string,
  byStaffId: number | null,
): Promise<Response> {
  if (!(STATUSES as readonly string[]).includes(status)) {
    return bad("bad-status", "That status is not valid.");
  }

  if (gone(current.status) && !gone(status)) {
    const [existing, room] = await Promise.all([
      existingOn(db, current.date),
      roomFor(db, current.date),
    ]);
    // Its own lines, as the rules see them, standing in for a new booking.
    const own: Draft[] = existing.filter((e) => e.bookingId === current.id);
    // Only what stops a booking. Warnings were seen and accepted when it was made.
    const stops = check(own, existing, room, { ignoreBookingId: current.id }).filter(
      (v) => v.level === "stop",
    );
    if (stops.length > 0) return json({ ok: false, verdicts: stops }, 409);
  }

  await atomically(db, [
    db
      .update(bookings)
      .set({ status: status as Status })
      .where(eq(bookings.id, current.id)),
    // Logged even when repeating a previous state.
    db.insert(bookingEvents).values({
      bookingId: current.id,
      kind: "status",
      byStaffId,
      before: current.status,
      after: status,
    }),
  ]);

  return json({ ok: true, bookingId: current.id, status });
}

/** Replaces a booking's row and lines together (at most eight, so no diffing). */
async function writeLines(
  db: Db,
  id: number,
  to: {
    date: string;
    startsAt: string;
    endsAt: string;
    customerId: number | null;
    nominated: boolean;
    note: string | null;
    /** A restored line may have lost its service (null) and keeps the seat it had. */
    lines: (Omit<Line, "serviceId"> & { serviceId: number | null; seatId?: number | null })[];
  },
): Promise<void> {
  await atomically(db, [
    db
      .update(bookings)
      .set({
        date: to.date,
        startsAt: to.startsAt,
        endsAt: to.endsAt,
        customerId: to.customerId,
        nominated: to.nominated,
        note: to.note,
      })
      .where(eq(bookings.id, id)),
    db.delete(bookingItems).where(eq(bookingItems.bookingId, id)),
    db.insert(bookingItems).values(
      to.lines.map((line, index) => ({
        bookingId: id,
        serviceId: line.serviceId,
        staffId: line.staffId,
        seatId: line.seatId ?? null,
        startsAt: line.startsAt,
        endsAt: line.endsAt,
        sortOrder: index,
      })),
    ),
  ]);
}

/**
 * The second look, after the write has landed. Only bookings with a lower id
 * count: a higher one is the other half of the same collision and will step
 * aside when it looks. Returns the verdicts that beat it, or null if it stands.
 */
export async function beaten(
  db: Db,
  id: number,
  date: string,
  drafts: Draft[],
  room: Room,
): Promise<Verdict[] | null> {
  const older = (await existingOn(db, date)).filter((e) => e.bookingId < id);
  const stops = check(drafts, older, room).filter((v) => v.level === "stop");
  return stops.length > 0 ? stops : null;
}

/** Up to eight whole-number ids, or null when there are none. */
function idsFrom(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((id): id is number => Number.isInteger(id));
  return ids.length === 0 ? null : ids;
}

/**
 * Lays the treatments end to end from the start time, with durations from the
 * menu. A Response when the request cannot be planned.
 */
async function plan(
  db: Db,
  serviceIds: number[],
  startsAt: string,
  staffFor: (index: number) => number | null,
): Promise<{ drafts: Draft[]; lines: Line[] } | Response> {
  if (serviceIds.length > 8) {
    return bad("too-many-services", "A booking can hold at most eight treatments.");
  }

  const chosen = await db
    .select({ id: services.id, durationMin: services.durationMin, seatKind: services.seatKind })
    .from(services)
    .where(inArray(services.id, serviceIds));
  const byId = new Map(chosen.map((s) => [s.id, s]));
  if (serviceIds.some((sid) => !byId.has(sid))) {
    return bad("unknown-service", "A treatment is not on the menu.");
  }

  let cursor = toMinutes(startsAt);
  const drafts: Draft[] = [];
  const lines: Line[] = [];

  for (const [index, sid] of serviceIds.entries()) {
    const service = byId.get(sid)!;
    const from = clockOf(cursor);
    cursor += service.durationMin;
    const to = clockOf(cursor);
    const who = staffFor(index);

    drafts.push({
      seatId: null,
      seatKind: service.seatKind,
      staffId: who,
      startsAt: from,
      endsAt: to,
    });
    lines.push({ serviceId: sid, staffId: who, startsAt: from, endsAt: to });
  }

  // Refuse past midnight so day arithmetic doesn't wrap.
  if (cursor >= 24 * 60) {
    return bad("crosses-midnight", "Starting then, it would run past midnight.");
  }

  return { drafts, lines };
}

/**
 * A guest who is not on file, or a stylist who is not, or who has left by that
 * date. Without this a typo'd id saves happily and the booking shows nobody.
 */
async function refusedReference(
  db: Db,
  date: string,
  customerId: number | null,
  staffIds: (number | null)[],
): Promise<Response | null> {
  if (customerId !== null) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!found) return bad("unknown-customer", "That guest is not on file.");
  }

  const wanted = [...new Set(staffIds.filter((sid): sid is number => sid !== null))];
  if (wanted.length === 0) return null;

  const people = await db
    .select({ id: staff.id, leftOn: staff.leftOn })
    .from(staff)
    .where(inArray(staff.id, wanted));
  const working = new Set(
    people.filter((p) => p.leftOn === null || p.leftOn > date).map((p) => p.id),
  );
  if (wanted.some((sid) => !working.has(sid))) {
    return bad("unknown-staff", "That stylist is not on the team on that date.");
  }
  return null;
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

async function roomFor(db: Db, date: string): Promise<Room> {
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
