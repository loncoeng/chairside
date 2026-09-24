// Taking a booking. The only place in the API that writes.
//
// The rules live in ../db/booking-rules.ts and run here, next to the
// database. The screen runs the same ones so it can warn before the round
// trip, but a check that only happens in the browser is decoration — anything
// that reaches this endpoint has to be judged again.

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
} from "../db/schema.ts";
import { blocked, check } from "../db/booking-rules.ts";
import type { Draft, Existing } from "../db/booking-rules.ts";

import type { Database as Db } from "../db/database.ts";

/** The menu, for the booking form. */
export async function menu(db: Db) {
  return await db
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
    .orderBy(asc(services.sortOrder), asc(services.id));
}

/** The customer list, for picking one on the booking form. */
export async function customerList(db: Db) {
  return await db
    .select({ id: customers.id, name: customers.name, searchKey: customers.searchKey })
    .from(customers)
    .orderBy(asc(customers.name));
}

/**
 * What a client is allowed to send. Everything else on the row is decided
 * here.
 *
 * Durations come from the menu rather than the request: a client that asked
 * for a ten-hour cut would otherwise be given one, and every capacity check
 * downstream would be reasoning about a fiction.
 */
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

export async function createBooking(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Proposal | null;
  if (!body || typeof body !== "object") return bad("本文が読み取れません。");

  const date = typeof body.date === "string" ? body.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("日付は YYYY-MM-DD で送ってください。");

  // Two digits either side is not enough: "25:99" passes that and then gets
  // refused further down for crossing midnight, which tells whoever typed it
  // the wrong thing about what they did wrong.
  const startsAt = typeof body.startsAt === "string" ? body.startsAt : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)) return bad("開始時刻の形式が違います。");

  const serviceIds = Array.isArray(body.serviceIds)
    ? body.serviceIds.filter((id): id is number => Number.isInteger(id))
    : [];
  if (serviceIds.length === 0) return bad("施術を1つ以上選んでください。");
  if (serviceIds.length > 8) return bad("1件の予約に入れられる施術は8つまでです。");


  const chosen = await db
    .select({ id: services.id, durationMin: services.durationMin, seatKind: services.seatKind })
    .from(services)
    .where(inArray(services.id, serviceIds));

  const byId = new Map(chosen.map((s) => [s.id, s]));
  if (serviceIds.some((id) => !byId.has(id))) return bad("メニューにない施術が含まれています。");

  const staffId = intOrNull(body.staffId);

  // Lines run back to back from the start time, which is how a booking is
  // taken at the desk: a shampoo, then the cut, then whatever follows.
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

  // A booking that runs past midnight is not a long appointment, it is a
  // typo. Refusing here keeps the day's arithmetic from wrapping.
  if (cursor >= 24 * 60) return bad("その開始時刻だと日付をまたぎます。");

  const [existing, room] = await Promise.all([existingOn(db, date), roomFor(db, date)]);
  const verdicts = check(drafts, existing, room);

  if (blocked(verdicts)) {
    return json({ ok: false, verdicts }, 409);
  }

  // Warnings are shown, and only then accepted. Writing on the first attempt
  // would mean the shop never reads them.
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

  if (!created) return json({ error: "予約を作成できませんでした。" }, 500);

  await db.insert(bookingItems).values(
    plan.map((line, index) => ({
      bookingId: created.id,
      serviceId: line.serviceId,
      staffId,
      // Left unset on purpose. Which station it turns out to be is decided on
      // the day — see the note on Draft.seatId.
      seatId: null,
      startsAt: line.startsAt,
      endsAt: line.endsAt,
      sortOrder: index,
    })),
  );

  await db.insert(bookingEvents).values({
    bookingId: created.id,
    kind: "created",
    before: null,
    after: `${date} ${first.startsAt}`,
  });

  return json({ ok: true, bookingId: created.id, verdicts }, 201);
}

/**
 * Everything already on the books that day.
 *
 * A treatment with no seat still occupies one of its kind, which is the whole
 * reason the capacity warning exists — so the service's kind stands in when
 * the seat is not chosen yet.
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

const bad = (message: string) => json({ ok: false, error: message }, 400);

/** The statuses a booking can be moved to. */
const STATUSES = ["booked", "arrived", "done", "cancelled", "no_show"] as const;
type Status = (typeof STATUSES)[number];

/** One booking, with its treatments, for the edit panel. */
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

  // Oldest first: this is read as a story, and a story that starts at the end
  // has to be read backwards.
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
 * Change a booking.
 *
 * Two quite different things share this endpoint, and the difference matters:
 *
 *   a status change   the guest arrived, or did not. Nothing about the
 *                     schedule moves, so there is nothing to check.
 *   a reschedule      the time, the stylist or the treatments change. This
 *                     goes through the same rules as a new booking, with
 *                     the booking's own rows left out of the comparison —
 *                     otherwise moving it by fifteen minutes reads as a
 *                     clash with itself.
 *
 * **Nothing is ever deleted.** A booking that was cancelled is a fact about
 * the day: a slot was held and then freed, and a shop looking back at a quiet
 * Tuesday needs to be able to tell that from a Tuesday nobody called.
 */
export async function updateBooking(db: Db, request: Request, id: number): Promise<Response> {
  const body = (await request.json().catch(() => null)) as (Proposal & { status?: unknown }) | null;
  if (!body || typeof body !== "object") return bad("本文が読み取れません。");

  const current = await getBooking(db, id);
  if (!current) return json({ ok: false, error: "その予約は見つかりません。" }, 404);

  // --- Just the status -----------------------------------------------------

  if (typeof body.status === "string") {
    if (!(STATUSES as readonly string[]).includes(body.status)) {
      return bad("その状態は使えません。");
    }

    // Any status to any status, on purpose. Somebody at the desk taps the
    // wrong one, and a system that refuses to undo it is a system they work
    // around. Cancelling frees the seat either way, because the rules read
    // the status rather than the row's existence.
    await db
      .update(bookings)
      .set({ status: body.status as Status })
      .where(eq(bookings.id, id));

    // Recorded even when it is the same state coming round again, because
    // "cancelled, then put back, then cancelled" is the thing worth seeing.
    await db.insert(bookingEvents).values({
      bookingId: id,
      kind: "status",
      before: current.status,
      after: body.status,
    });

    return json({ ok: true, bookingId: id, status: body.status });
  }

  // --- A reschedule --------------------------------------------------------

  const startsAt = typeof body.startsAt === "string" ? body.startsAt : current.startsAt;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)) return bad("開始時刻の形式が違います。");

  const date = typeof body.date === "string" ? body.date : current.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("日付は YYYY-MM-DD で送ってください。");

  const serviceIds = Array.isArray(body.serviceIds)
    ? body.serviceIds.filter((sid): sid is number => Number.isInteger(sid))
    : current.items.map((item) => item.serviceId).filter((sid): sid is number => sid !== null);

  if (serviceIds.length === 0) return bad("施術を1つ以上選んでください。");
  if (serviceIds.length > 8) return bad("1件の予約に入れられる施術は8つまでです。");

  const chosen = await db
    .select({ id: services.id, durationMin: services.durationMin, seatKind: services.seatKind })
    .from(services)
    .where(inArray(services.id, serviceIds));

  const byId = new Map(chosen.map((s) => [s.id, s]));
  if (serviceIds.some((sid) => !byId.has(sid))) return bad("メニューにない施術が含まれています。");

  /**
   * Who does each treatment.
   *
   * A booking's lines do not all belong to the same person: an assistant
   * shampoos and the stylist cuts, which is ordinary and is what the schema's
   * per-line staff_id is for.
   *
   * So when the caller says nothing about the stylist, and the treatments are
   * the same ones in the same order, each line keeps whoever had it. Moving a
   * booking half an hour must not quietly reassign the shampoo.
   *
   * When the caller does name a stylist, or the treatments changed, there is
   * nothing to carry over and one person takes the lot.
   */
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

  if (cursor >= 24 * 60) return bad("その開始時刻だと日付をまたぎます。");

  const [existing, room] = await Promise.all([existingOn(db, date), roomFor(db, date)]);
  // Its own rows are left out, or moving a booking reads as a clash with the
  // place it is moving from.
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

  // The lines are replaced rather than patched. Working out which of three
  // rows became which of four is a great deal of code for a table that holds
  // at most eight, and every version of that code has a case it gets wrong.
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

  // One row per thing that changed, rather than one row saying "edited".
  // Counting how often a guest moves their appointment means counting moves,
  // and a single catch-all kind would make that impossible to ask for.
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
    await db.insert(bookingEvents).values(changes.map((c) => ({ bookingId: id, ...c })));
  }

  return json({ ok: true, bookingId: id, verdicts });
}
