// Taking a booking. The only place in the API that writes.
//
// The rules live in ../db/booking-rules.ts and run here, next to the
// database. The screen runs the same ones so it can warn before the round
// trip, but a check that only happens in the browser is decoration — anything
// that reaches this endpoint has to be judged again.

import { drizzle } from "drizzle-orm/d1";
import { asc, eq, inArray } from "drizzle-orm";

import {
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

type Db = ReturnType<typeof drizzle>;

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

export async function createBooking(env: Env, request: Request): Promise<Response> {
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

  const db = drizzle(env.DB);

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
  if (cursor >= 24 * 60) return bad("その開始時刻では日付をまたぎます。");

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
