// Payments and revenue. The exchange rate is copied onto each payment (shops set
// their own, e.g. 1:1:1 or 1:1.03) so later rate changes don't alter past takings.
// Taking payment marks the booking done; there is no separate "paid" status.

import { and, asc, eq, gte, lte } from "drizzle-orm";

import {
  bookingEvents,
  bookingItems,
  bookings,
  currencies,
  payments,
  services,
  staff,
} from "../db/schema.ts";
import { creditedStaff } from "../db/credit.ts";
import { isMethod } from "../db/payment-methods.ts";
import type { Method } from "../db/payment-methods.ts";

import type { Database as Db } from "../db/database.ts";



/** Accepted currencies and their rates. */
export async function currencyList(db: Db) {
  return await db
    .select({ code: currencies.code, rateToBase: currencies.rateToBase })
    .from(currencies)
    .where(eq(currencies.active, true))
    .orderBy(asc(currencies.sortOrder));
}

/** Payments for one booking. */
export async function paymentsFor(db: Db, bookingId: number) {
  return await db
    .select({
      id: payments.id,
      amount: payments.amount,
      currency: payments.currency,
      rateToBase: payments.rateToBase,
      method: payments.method,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.bookingId, bookingId))
    .orderBy(asc(payments.paidAt));
}

/** Records a payment at the current rate and marks the booking done. */
export async function takePayment(
  db: Db,
  request: Request,
  byStaffId: number | null,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    bookingId?: unknown;
    amount?: unknown;
    currency?: unknown;
    method?: unknown;
  } | null;

  if (!body) return json({ ok: false, code: "unreadable-body", error: "The request body could not be read." }, 400);

  const bookingId = Number.isInteger(body.bookingId) ? (body.bookingId as number) : null;
  if (bookingId === null) return json({ ok: false, code: "no-booking", error: "No booking was given." }, 400);

  const amount = typeof body.amount === "number" ? body.amount : NaN;
  // Refunds (negative amounts) are not supported yet.
  if (!Number.isFinite(amount) || amount <= 0) return json({ ok: false, code: "bad-amount", error: "The amount is not valid." }, 400);
  if (amount > 1_000_000) return json({ ok: false, code: "amount-too-large", error: "The amount is too large." }, 400);

  const method = body.method === undefined ? "cash" : body.method;
  if (!isMethod(method)) {
    return json({ ok: false, code: "bad-method", error: "That payment method is not accepted." }, 400);
  }

  const code = typeof body.currency === "string" ? body.currency : "";

  const [currency] = await db
    .select({ code: currencies.code, rateToBase: currencies.rateToBase })
    .from(currencies)
    .where(eq(currencies.code, code))
    .limit(1);

  if (!currency) return json({ ok: false, code: "bad-currency", error: "That currency is not accepted." }, 400);

  const [booking] = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return json({ ok: false, code: "booking-not-found", error: "That booking was not found." }, 404);
  if (booking.status === "cancelled" || booking.status === "no_show") {
    return json({ ok: false, code: "booking-cancelled", error: "A cancelled booking cannot be paid." }, 409);
  }

  await db.insert(payments).values({
    bookingId,
    amount,
    currency: currency.code,
    // Copied, not referenced. See the file header.
    rateToBase: currency.rateToBase,
    method: method as Method,
  });

  if (booking.status !== "done") {
    await db.update(bookings).set({ status: "done" }).where(eq(bookings.id, bookingId));
    await db.insert(bookingEvents).values({
      bookingId,
      kind: "status",
      byStaffId,
      before: booking.status,
      after: "done",
    });
  }

  return json({ ok: true, bookingId }, 201);
}

/**
 * A month's takings, summed in JS rather than SQL so staff credit can use the
 * tested rule in ../db/credit.ts. Converts with each payment's stored rate.
 */
export async function revenue(db: Db, month: string) {
  const from = `${month}-01`;
  const to = `${month}-31`;
  const inMonth = and(gte(bookings.date, from), lte(bookings.date, to));

  const [paid, lines] = await Promise.all([
    db
      .select({
        bookingId: payments.bookingId,
        date: bookings.date,
        amount: payments.amount,
        rateToBase: payments.rateToBase,
        currency: payments.currency,
        method: payments.method,
        nominated: bookings.nominated,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(inMonth),
    db
      .select({
        bookingId: bookingItems.bookingId,
        sortOrder: bookingItems.sortOrder,
        staffId: bookingItems.staffId,
        staffName: staff.name,
        seatKind: services.seatKind,
        serviceId: bookingItems.serviceId,
        nameJa: services.nameJa,
        nameZh: services.nameZh,
        nameEn: services.nameEn,
      })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .leftJoin(services, eq(services.id, bookingItems.serviceId))
      .leftJoin(staff, eq(staff.id, bookingItems.staffId))
      .where(and(inMonth, eq(bookings.status, "done"))),
  ]);

  const byBooking = new Map<number, typeof lines>();
  for (const line of lines) {
    const list = byBooking.get(line.bookingId) ?? [];
    list.push(line);
    byBooking.set(line.bookingId, list);
  }

  const nameOfStaff = new Map<number, string>();
  for (const line of lines) {
    if (line.staffId !== null && line.staffName) nameOfStaff.set(line.staffId, line.staffName);
  }

  const byDay = new Map<string, { total: number; n: number }>();
  const byCurrency = new Map<string, { amount: number; total: number; n: number }>();
  const byMethod = new Map<string, { total: number; n: number }>();
  const byStaff = new Map<number | null, { total: number; bills: Set<number> }>();

  let total = 0;
  let nominated = 0;

  for (const p of paid) {
    const base = p.amount * p.rateToBase;
    total += base;
    if (p.nominated) nominated++;

    const day = byDay.get(p.date) ?? { total: 0, n: 0 };
    day.total += base;
    day.n++;
    byDay.set(p.date, day);

    const cur = byCurrency.get(p.currency) ?? { amount: 0, total: 0, n: 0 };
    cur.amount += p.amount;
    cur.total += base;
    cur.n++;
    byCurrency.set(p.currency, cur);

    const method = byMethod.get(p.method) ?? { total: 0, n: 0 };
    method.total += base;
    method.n++;
    byMethod.set(p.method, method);

    const who = creditedStaff(byBooking.get(p.bookingId) ?? []);
    const credit = byStaff.get(who) ?? { total: 0, bills: new Set<number>() };
    credit.total += base;
    credit.bills.add(p.bookingId);
    byStaff.set(who, credit);
  }

  // Counts only, not money: one bill covers several treatments.
  const byService = new Map<
    number | null,
    { nameJa: string | null; nameZh: string | null; nameEn: string | null; n: number }
  >();
  for (const line of lines) {
    const seen = byService.get(line.serviceId) ?? {
      nameJa: line.nameJa,
      nameZh: line.nameZh,
      nameEn: line.nameEn,
      n: 0,
    };
    seen.n++;
    byService.set(line.serviceId, seen);
  }

  return {
    month,
    total,
    bills: paid.length,
    nominated,
    byDay: [...byDay.entries()].map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date)),
    byCurrency: [...byCurrency.entries()].map(([currency, c]) => ({ currency, ...c })),
    byMethod: [...byMethod.entries()].map(([method, m]) => ({ method, ...m })),
    byStaff: [...byStaff.entries()]
      .map(([staffId, c]) => ({
        staffId,
        name: staffId === null ? null : (nameOfStaff.get(staffId) ?? null),
        total: c.total,
        n: c.bills.size,
      }))
      .sort((a, b) => b.total - a.total),
    byService: [...byService.entries()]
      .map(([serviceId, v]) => ({ serviceId, ...v }))
      .sort((a, b) => b.n - a.n),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
