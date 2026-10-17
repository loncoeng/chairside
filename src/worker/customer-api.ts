// Customer endpoints. Move/cancel counts are computed from booking_events,
// not stored on the customer, so they can't drift.

import { and, asc, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";

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

import { isDate, isTime } from "../db/dates.ts";
import type { Database as Db } from "../db/database.ts";

/** Customer list (max 50). The search matches name, alternate spelling (searchKey) and phone. */
export async function listCustomers(db: Db, query: string) {
  // Escape LIKE wildcards (`%`, `_`) with `!` rather than strip them; names can contain them.
  const q = query.trim().replace(/[!%_]/g, (c) => `!${c}`);
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
            like(customers.name, sql`${`%${q}%`} ESCAPE '!'`),
            like(customers.searchKey, sql`${`%${q}%`} ESCAPE '!'`),
            like(customers.phone, sql`${`%${q}%`} ESCAPE '!'`),
          ),
        )
        .orderBy(asc(customers.name))
        .limit(50)
    : await base.orderBy(asc(customers.name)).limit(50);

  return rows;
}

/** One customer with standing, recent bookings and treatment records. */
export async function getCustomer(db: Db, id: number) {
  const [person] = await db
    .select({
      id: customers.id,
      name: customers.name,
      searchKey: customers.searchKey,
      phone: customers.phone,
      address: customers.address,
      birthday: customers.birthday,
      note: customers.note,
      firstVisitOn: customers.firstVisitOn,
    })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (!person) return null;

  // Newest first.
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
    /** Records with a caution, newest first. */
    cautions: theirRecords.filter((r) => r.caution && r.caution.trim() !== ""),
  };
}

/**
 * Creates (`id` null) or updates a customer. Omitted fields are left unchanged.
 * A phone number shared with another customer is returned in `samePhone`,
 * not refused (families share numbers; it also flags duplicates).
 */
export async function saveCustomer(db: Db, request: Request, id: number | null): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ ok: false, code: "unreadable-body", error: "The request body could not be read." }, 400);

  const field = (key: string, limit: number): string | null | undefined => {
    if (!(key in body)) return undefined;
    const value = body[key];
    if (value === null) return null;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed.slice(0, limit);
  };

  const name = field("name", 100);
  const searchKey = field("searchKey", 100);
  const phone = field("phone", 40);
  const address = field("address", 300);
  const note = field("note", 2000);

  const firstVisitRaw = field("firstVisitOn", 10);
  const birthday = field("birthday", 10);
  // isDate, not a shape match: 2026-02-30 has the right shape.
  for (const date of [firstVisitRaw, birthday]) {
    if (date && !isDate(date)) {
      return json({ ok: false, code: "bad-date", error: "Send the date as YYYY-MM-DD." }, 400);
    }
  }

  if (id === null ? !name : name === null) {
    return json({ ok: false, code: "name-required", error: "Enter a name." }, 400);
  }

  const values = {
    ...(name ? { name } : {}),
    ...(searchKey !== undefined ? { searchKey } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(birthday !== undefined ? { birthday } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(firstVisitRaw !== undefined ? { firstVisitOn: firstVisitRaw } : {}),
  };

  let customerId: number;
  if (id === null) {
    const [created] = await db
      .insert(customers)
      .values({ name: name as string, ...values })
      .returning({ id: customers.id });
    if (!created) return json({ ok: false, code: "create-failed", error: "It could not be saved." }, 500);
    customerId = created.id;
  } else {
    const [exists] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    if (!exists) return json({ ok: false, code: "customer-not-found", error: "That customer was not found." }, 404);
    if (Object.keys(values).length > 0) {
      await db.update(customers).set(values).where(eq(customers.id, id));
    }
    customerId = id;
  }

  // Compared without spaces: "6612 3401" and "66123401" are one number.
  const digits = phone ? phone.replace(/\s+/g, "") : "";
  const samePhone =
    digits === ""
      ? []
      : await db
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(
            and(
              ne(customers.id, customerId),
              sql`replace(${customers.phone}, ' ', '') = ${digits}`,
            ),
          )
          .limit(5);

  return json({ ok: true, customerId, samePhone }, id === null ? 201 : 200);
}

/** Adds a treatment record for a customer, optionally tied to a booking. */
export async function addRecord(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    customerId?: unknown;
    bookingId?: unknown;
    formula?: unknown;
    note?: unknown;
    caution?: unknown;
    recordedOn?: unknown;
  } | null;

  if (!body) return json({ ok: false, code: "unreadable-body", error: "The request body could not be read." }, 400);

  const customerId = Number.isInteger(body.customerId) ? (body.customerId as number) : null;
  if (customerId === null) return json({ ok: false, code: "no-customer", error: "No customer was given." }, 400);

  const recordedOn = typeof body.recordedOn === "string" ? body.recordedOn : "";
  if (!isDate(recordedOn)) {
    return json({ ok: false, code: "bad-date", error: "Send the date as YYYY-MM-DD." }, 400);
  }

  const text = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, 2000) : null;

  const formula = text(body.formula);
  const note = text(body.note);
  const caution = text(body.caution);

  if (formula === null && note === null && caution === null) {
    return json({ ok: false, code: "empty-record", error: "The record is empty." }, 400);
  }

  const [exists] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!exists) return json({ ok: false, code: "customer-not-found", error: "That customer was not found." }, 404);

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
