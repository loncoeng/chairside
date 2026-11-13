// Payments and revenue, in cents throughout (see ../db/money.ts). The exchange
// rate is copied onto each payment (shops set their own, e.g. 1:1:1 or 1:1.03) so
// later rate changes don't alter past takings. Taking payment marks the booking
// done; there is no separate "paid" status.

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
import { atomically } from "../db/atomic.ts";
import { creditedStaff } from "../db/credit.ts";
import { toBase } from "../db/money.ts";
import { isMethod } from "../db/payment-methods.ts";
import type { Method } from "../db/payment-methods.ts";

import type { Database as Db } from "../db/database.ts";
import { bad, fail, json } from "./http.ts";

/** Accepted currencies and their rates. */
export async function currencyList(db: Db) {
  return await db
    .select({ code: currencies.code, rateToBaseBp: currencies.rateToBaseBp })
    .from(currencies)
    .where(eq(currencies.active, true))
    .orderBy(asc(currencies.sortOrder));
}

/** Payments for one booking. */
export async function paymentsFor(db: Db, bookingId: number) {
  return await db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      currency: payments.currency,
      rateToBaseBp: payments.rateToBaseBp,
      method: payments.method,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.bookingId, bookingId))
    .orderBy(asc(payments.paidAt));
}

/** Optional, so a client that sends none still works; it just isn't protected from repeats. */
const isRequestKey = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);

/**
 * Records a payment at the current rate and marks the booking done, as one
 * write. Sending the same `requestKey` again records nothing and answers as if
 * it had: the till sends one per opening, so a double press cannot charge twice.
 */
export async function takePayment(
  db: Db,
  request: Request,
  byStaffId: number | null,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    bookingId?: unknown;
    amountCents?: unknown;
    currency?: unknown;
    method?: unknown;
    requestKey?: unknown;
  } | null;

  if (!body) return fail(400, "unreadable-body", "The request body could not be read.");

  const bookingId = Number.isInteger(body.bookingId) ? (body.bookingId as number) : null;
  if (bookingId === null) return fail(400, "no-booking", "No booking was given.");

  const amountCents = Number.isSafeInteger(body.amountCents) ? (body.amountCents as number) : 0;
  // Refunds (negative amounts) are not supported yet.
  if (amountCents <= 0) return fail(400, "bad-amount", "The amount is not valid.");
  // A million patacas.
  if (amountCents > 100_000_000) return fail(400, "amount-too-large", "The amount is too large.");

  if (body.requestKey !== undefined && !isRequestKey(body.requestKey)) {
    return bad("bad-request-key", "The request key is not valid.");
  }
  const requestKey = body.requestKey ?? null;
  if (requestKey !== null && (await alreadyPaid(db, requestKey))) {
    return json({ ok: true, bookingId, repeated: true }, 200);
  }

  const method = body.method === undefined ? "cash" : body.method;
  if (!isMethod(method)) {
    return fail(400, "bad-method", "That payment method is not accepted.");
  }

  const code = typeof body.currency === "string" ? body.currency : "";

  const [currency] = await db
    .select({ code: currencies.code, rateToBaseBp: currencies.rateToBaseBp })
    .from(currencies)
    .where(eq(currencies.code, code))
    .limit(1);

  if (!currency) return fail(400, "bad-currency", "That currency is not accepted.");

  const [booking] = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return fail(404, "booking-not-found", "That booking was not found.");
  if (booking.status === "cancelled" || booking.status === "no_show") {
    return fail(409, "booking-cancelled", "A cancelled booking cannot be paid.");
  }

  const pay = db.insert(payments).values({
    bookingId,
    amountCents,
    currency: currency.code,
    // Copied, not referenced. See the file header.
    rateToBaseBp: currency.rateToBaseBp,
    method: method as Method,
    requestKey,
  });

  try {
    if (booking.status === "done") {
      await atomically(db, [pay]);
    } else {
      await atomically(db, [
        pay,
        db.update(bookings).set({ status: "done" }).where(eq(bookings.id, bookingId)),
        db.insert(bookingEvents).values({
          bookingId,
          kind: "status",
          byStaffId,
          before: booking.status,
          after: "done",
        }),
      ]);
    }
  } catch (problem) {
    // Two presses that both got past the check above: the unique key refuses the
    // second, and the whole write is rolled back with it.
    if (requestKey !== null && (await alreadyPaid(db, requestKey))) {
      return json({ ok: true, bookingId, repeated: true }, 200);
    }
    throw problem;
  }

  return json({ ok: true, bookingId }, 201);
}

async function alreadyPaid(db: Db, requestKey: string): Promise<boolean> {
  const [found] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.requestKey, requestKey))
    .limit(1);
  return found !== undefined;
}

/**
 * A month's takings in cents, summed in JS rather than SQL so staff credit can
 * use the tested rule in ../db/credit.ts. Converts with each payment's stored
 * rate. A month is about 1,700 payments, well inside a Worker's CPU budget.
 *
 * A bill is a booking, however many payments it was split into, so `bills` and
 * every `n` count bookings, never payment rows.
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
        amountCents: payments.amountCents,
        rateToBaseBp: payments.rateToBaseBp,
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

  // Each bucket keeps the bookings it has seen, so a split bill counts once.
  type Bucket = { totalCents: number; bills: Set<number> };
  const bucket = (): Bucket => ({ totalCents: 0, bills: new Set() });
  const add = (into: Bucket, cents: number, bookingId: number) => {
    into.totalCents += cents;
    into.bills.add(bookingId);
  };

  const all = bucket();
  const nominated = new Set<number>();
  const byDay = new Map<string, Bucket>();
  const byCurrency = new Map<string, Bucket & { amountCents: number }>();
  const byMethod = new Map<string, Bucket>();
  const byStaff = new Map<number | null, Bucket>();

  for (const p of paid) {
    const cents = toBase(p.amountCents, p.rateToBaseBp);
    add(all, cents, p.bookingId);
    if (p.nominated) nominated.add(p.bookingId);

    const day = byDay.get(p.date) ?? bucket();
    add(day, cents, p.bookingId);
    byDay.set(p.date, day);

    const cur = byCurrency.get(p.currency) ?? { ...bucket(), amountCents: 0 };
    add(cur, cents, p.bookingId);
    cur.amountCents += p.amountCents;
    byCurrency.set(p.currency, cur);

    const method = byMethod.get(p.method) ?? bucket();
    add(method, cents, p.bookingId);
    byMethod.set(p.method, method);

    const who = creditedStaff(byBooking.get(p.bookingId) ?? []);
    const credit = byStaff.get(who) ?? bucket();
    add(credit, cents, p.bookingId);
    byStaff.set(who, credit);
  }

  const out = ({ totalCents, bills }: Bucket) => ({ totalCents, n: bills.size });

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
    totalCents: all.totalCents,
    bills: all.bills.size,
    nominated: nominated.size,
    byDay: [...byDay.entries()]
      .map(([date, d]) => ({ date, ...out(d) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byCurrency: [...byCurrency.entries()].map(([currency, c]) => ({
      currency,
      amountCents: c.amountCents,
      ...out(c),
    })),
    byMethod: [...byMethod.entries()].map(([method, m]) => ({ method, ...out(m) })),
    byStaff: [...byStaff.entries()]
      .map(([staffId, c]) => ({
        staffId,
        name: staffId === null ? null : (nameOfStaff.get(staffId) ?? null),
        ...out(c),
      }))
      .sort((a, b) => b.totalCents - a.totalCents),
    byService: [...byService.entries()]
      .map(([serviceId, v]) => ({ serviceId, ...v }))
      .sort((a, b) => b.n - a.n),
  };
}
