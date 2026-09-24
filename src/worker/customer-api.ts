// Customers, and what the shop knows about them.
//
// The interesting part is not the name and the phone number. It is what the
// bookings add up to: somebody who has moved their appointment five times
// this year, or who cancels the morning of, is a fact the desk can feel but
// cannot prove — and cannot hand over to whoever is covering tomorrow.
//
// So the counts are computed from booking_events rather than stored on the
// customer. A stored counter is a second copy of the truth, and the two drift
// the first time a row is corrected.

import { drizzle } from "drizzle-orm/d1";
import { asc, desc, eq, inArray, like, or } from "drizzle-orm";

import { standingOf } from "../db/standing.ts";
import {
  bookingEvents,
  bookingItems,
  bookings,
  customers,
  records,
  services,
  staff,
} from "../db/schema.ts";

type Db = ReturnType<typeof drizzle>;

/**
 * The list, with an optional search.
 *
 * Searches the name and the second spelling both, because a guest written in
 * kanji is looked up by whoever is at the desk, and that is not always the
 * person who typed the name in. The phone number is searched too: it is what
 * the shop has in front of them when the phone rings.
 */
export async function listCustomers(db: Db, query: string) {
  const q = query.trim();
  const base = db
    .select({
      id: customers.id,
      name: customers.name,
      searchKey: customers.searchKey,
      phone: customers.phone,
      firstVisitOn: customers.firstVisitOn,
    })
    .from(customers);

  const rows = q
    ? await base
        .where(
          or(
            like(customers.name, `%${q}%`),
            like(customers.searchKey, `%${q}%`),
            like(customers.phone, `%${q}%`),
          ),
        )
        .orderBy(asc(customers.name))
        .limit(50)
    : await base.orderBy(asc(customers.name)).limit(50);

  return rows;
}

/**
 * One customer: who they are, how they have behaved, and what was done to
 * their hair.
 */
export async function getCustomer(db: Db, id: number) {
  const [person] = await db
    .select({
      id: customers.id,
      name: customers.name,
      searchKey: customers.searchKey,
      phone: customers.phone,
      note: customers.note,
      firstVisitOn: customers.firstVisitOn,
    })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (!person) return null;

  // Newest first: what happened last time is what the desk wants before the
  // guest sits down.
  const theirBookings = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      nominated: bookings.nominated,
      note: bookings.note,
    })
    .from(bookings)
    .where(eq(bookings.customerId, id))
    .orderBy(desc(bookings.date), desc(bookings.startsAt))
    .limit(60);

  const ids = theirBookings.map((b) => b.id);

  const [events, lines, theirRecords] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({
            bookingId: bookingEvents.bookingId,
            at: bookingEvents.at,
            kind: bookingEvents.kind,
            after: bookingEvents.after,
          })
          .from(bookingEvents)
          .where(inArray(bookingEvents.bookingId, ids)),
    ids.length === 0
      ? []
      : db
          .select({
            bookingId: bookingItems.bookingId,
            serviceJa: services.nameJa,
            serviceZh: services.nameZh,
            serviceEn: services.nameEn,
            staffName: staff.name,
            sortOrder: bookingItems.sortOrder,
          })
          .from(bookingItems)
          .leftJoin(services, eq(services.id, bookingItems.serviceId))
          .leftJoin(staff, eq(staff.id, bookingItems.staffId))
          .where(inArray(bookingItems.bookingId, ids))
          .orderBy(asc(bookingItems.sortOrder)),
    db
      .select({
        id: records.id,
        bookingId: records.bookingId,
        formula: records.formula,
        note: records.note,
        caution: records.caution,
        recordedOn: records.recordedOn,
      })
      .from(records)
      .where(eq(records.customerId, id))
      .orderBy(desc(records.recordedOn), desc(records.id))
      .limit(40),
  ]);

  const byBooking = new Map<number, typeof lines>();
  for (const line of lines) {
    const list = byBooking.get(line.bookingId) ?? [];
    list.push(line);
    byBooking.set(line.bookingId, list);
  }

  return {
    ...person,
    standing: standingOf(theirBookings, events),
    bookings: theirBookings.map((b) => ({ ...b, lines: byBooking.get(b.id) ?? [] })),
    records: theirRecords,
    /** Anything on the person rather than a single visit, newest first. */
    cautions: theirRecords.filter((r) => r.caution && r.caution.trim() !== ""),
  };
}

/** Add a record against a visit. */
export async function addRecord(env: Env, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    customerId?: unknown;
    bookingId?: unknown;
    formula?: unknown;
    note?: unknown;
    caution?: unknown;
    recordedOn?: unknown;
  } | null;

  if (!body) return json({ ok: false, error: "本文が読み取れません。" }, 400);

  const customerId = Number.isInteger(body.customerId) ? (body.customerId as number) : null;
  if (customerId === null) return json({ ok: false, error: "お客様が指定されていません。" }, 400);

  const recordedOn = typeof body.recordedOn === "string" ? body.recordedOn : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedOn)) {
    return json({ ok: false, error: "日付は YYYY-MM-DD で送ってください。" }, 400);
  }

  const text = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, 2000) : null;

  const formula = text(body.formula);
  const note = text(body.note);
  const caution = text(body.caution);

  // An empty record is not a record. Writing one would put a date in the
  // history with nothing behind it.
  if (formula === null && note === null && caution === null) {
    return json({ ok: false, error: "内容が空です。" }, 400);
  }

  const db = drizzle(env.DB);
  const [exists] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!exists) return json({ ok: false, error: "そのお客様は見つかりません。" }, 404);

  const [created] = await db
    .insert(records)
    .values({
      customerId,
      bookingId: Number.isInteger(body.bookingId) ? (body.bookingId as number) : null,
      formula,
      note,
      caution,
      recordedOn,
    })
    .returning({ id: records.id });

  return json({ ok: true, recordId: created?.id ?? null }, 201);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
