// Money.
//
// Two rules decide the shape of this file.
//
// **The rate is copied onto the payment, not looked up.** The shop sets its
// own rates — most in Macau work at 1:1:1, some at 1:1.03 — and changing that
// policy next month must not move takings that already happened. A record of
// money received is not a calculation to be redone.
//
// **Taking payment finishes the visit.** There is no separate "paid" state.
// The shop asked for one button rather than two, and a status that only ever
// follows another status is a status nobody sets on purpose.

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

import type { Database as Db } from "../db/database.ts";

/**
 * What the shop takes.
 *
 * MPay and BOC Pay are the two local wallets and between them cover most of
 * Macau; WeChat and Alipay come over the border with the guests who use them.
 * A till that only knew cash and cards would be a till nobody could use here.
 */
const METHODS = ["cash", "card", "mpay", "boc", "wechat", "alipay"] as const;
type Method = (typeof METHODS)[number];

/** What the shop takes, and at what rate. */
export async function currencyList(db: Db) {
  return await db
    .select({ code: currencies.code, rateToBase: currencies.rateToBase })
    .from(currencies)
    .where(eq(currencies.active, true))
    .orderBy(asc(currencies.sortOrder));
}

/** What has been paid against one booking. */
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

/**
 * Take payment, and finish the visit.
 *
 * The rate is read from the shop's settings here and written onto the row, so
 * what is stored is what was true at the till.
 */
export async function takePayment(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    bookingId?: unknown;
    amount?: unknown;
    currency?: unknown;
    method?: unknown;
  } | null;

  if (!body) return json({ ok: false, error: "本文が読み取れません。" }, 400);

  const bookingId = Number.isInteger(body.bookingId) ? (body.bookingId as number) : null;
  if (bookingId === null) return json({ ok: false, error: "予約が指定されていません。" }, 400);

  const amount = typeof body.amount === "number" ? body.amount : NaN;
  // Zero is not a payment, and a negative one is a refund — which is a
  // different thing and does not exist yet. Saying so beats storing a number
  // the revenue screen would quietly subtract.
  if (!Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: "金額が不正です。" }, 400);
  if (amount > 1_000_000) return json({ ok: false, error: "金額が大きすぎます。" }, 400);

  const method = typeof body.method === "string" ? body.method : "cash";
  if (!(METHODS as readonly string[]).includes(method)) {
    return json({ ok: false, error: "その支払方法は使えません。" }, 400);
  }

  const code = typeof body.currency === "string" ? body.currency : "";

  const [currency] = await db
    .select({ code: currencies.code, rateToBase: currencies.rateToBase })
    .from(currencies)
    .where(eq(currencies.code, code))
    .limit(1);

  if (!currency) return json({ ok: false, error: "その通貨は扱っていません。" }, 400);

  const [booking] = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return json({ ok: false, error: "その予約は見つかりません。" }, 404);
  if (booking.status === "cancelled" || booking.status === "no_show") {
    return json({ ok: false, error: "取り消された予約には会計できません。" }, 409);
  }

  await db.insert(payments).values({
    bookingId,
    amount,
    currency: currency.code,
    // Copied, not referenced. See the note at the top of this file.
    rateToBase: currency.rateToBase,
    method: method as Method,
  });

  if (booking.status !== "done") {
    await db.update(bookings).set({ status: "done" }).where(eq(bookings.id, bookingId));
    await db.insert(bookingEvents).values({
      bookingId,
      kind: "status",
      before: booking.status,
      after: "done",
    });
  }

  return json({ ok: true, bookingId }, 201);
}

/**
 * A month's takings.
 *
 * Read out of the database and added up here rather than in SQL. The bill
 * belongs to the stylist, not to whoever did the first treatment, and that is
 * a rule with a test behind it (see ../db/credit.ts) rather than a join
 * condition nobody can check.
 *
 * Everything is converted with the rate stored on each payment, so a month
 * read today and the same month read next year come out the same.
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

  // How often each thing on the menu was done. Not money: one bill covers
  // several treatments, and dividing it between them would be inventing a
  // price the guest never saw.
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
