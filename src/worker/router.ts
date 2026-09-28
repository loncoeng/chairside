// Every path the API answers, and nothing about where it runs.
//
// Kept apart from the Worker so the browser demo can use the same table. A
// second copy of "which path does what" would drift the first time an
// endpoint was added, and the demo would answer 404 for a screen that works
// in production.

import { asc, eq, isNull, max, min } from "drizzle-orm";
import type { Database as Db } from "../db/database.ts";
import { isDate, isMonth } from "../db/dates.ts";
import { isOpen, mayReach } from "../db/permissions.ts";
import { read, tokenFrom } from "../db/session.ts";
import { signIn, signOut, whoAmI } from "./session-api.ts";
import {
  bookingItems,
  bookings,
  businessHours,
  closures,
  customers,
  holidays,
  seats,
  services,
  staff,
} from "../db/schema.ts";
import { createBooking, customerList, getBooking, menu, updateBooking } from "./booking-api.ts";
import { addRecord, getCustomer, listCustomers, saveCustomer } from "./customer-api.ts";
import { currencyList, paymentsFor, revenue, takePayment } from "./money-api.ts";
import { setClosure, setHours, setStaff, shopSettings } from "./shop-api.ts";

/**
 * The API.
 *
 * **This is the only file that names D1.** Everything it calls takes a
 * drizzle SQLite database and does not care which one — see ../db/database.ts
 * — which is what makes the same code run on a shop PC and in the browser
 * demo. src/db/portable.test.ts runs these very functions on sql.js so the
 * claim cannot rot quietly.
 */
export async function route(
  db: Db,
  request: Request,
  build: string,
  secret?: string,
): Promise<Response> {
    const url = new URL(request.url);

    try {
      // Which commit is answering. Asked for by the deploy check, which
      // otherwise cannot tell new code from old.
      if (url.pathname === "/api/version") {
        return json({ build });
      }

      // --- Everything below this line needs somebody signed in ------------
      //
      // The check is here rather than in each handler. A permission you have
      // to remember to write is a permission somebody forgets on the next
      // endpoint, and the endpoint that forgot it is a customer list on the
      // open internet.

      if (url.pathname === "/api/session") {
        if (request.method === "POST") return await signIn(db, request, secret);
        if (request.method === "DELETE") return signOut();
        if (request.method === "GET") {
          const open = await read(secret, tokenFrom(request));
          return open ? await whoAmI(db, open.staffId) : json({ ok: false }, 401);
        }
        return json({ error: "method not allowed" }, 405);
      }

      const session = await read(secret, tokenFrom(request));

      if (!isOpen(url.pathname) && session === null) {
        return json({ error: "サインインしてください。" }, 401);
      }

      if (session !== null && !mayReach(session.role, url.pathname, request.method)) {
        return json({ error: "この操作は許可されていません。" }, 403);
      }
      if (url.pathname === "/api/room") {
        return json(await room(db));
      }
      // The endpoints that write.
      if (url.pathname === "/api/bookings" && request.method === "POST") {
        return await createBooking(db, request, session?.staffId ?? null);
      }

      // /api/bookings/123 — read one, or change it.
      const booking = /^\/api\/bookings\/(\d+)$/.exec(url.pathname);
      if (booking) {
        const id = Number(booking[1]);
        if (request.method === "GET") {
          const found = await getBooking(db, id);
          if (!found) return json({ error: "その予約は見つかりません。" }, 404);
          return json({ ...found, payments: await paymentsFor(db, id) });
        }
        if (request.method === "PATCH") {
          return await updateBooking(db, request, id, session?.staffId ?? null);
        }
        return json({ error: "method not allowed" }, 405);
      }
      if (url.pathname === "/api/services") {
        return json(await menu(db));
      }
      // The picker on the booking form wants every name; the customers
      // screen wants a search. Two shapes, two paths — one endpoint that
      // changed behaviour by query string would be worse to read.
      if (url.pathname === "/api/customers") {
        return json(await customerList(db));
      }
      if (url.pathname === "/api/people" && request.method === "POST") {
        return await saveCustomer(db, request, null);
      }
      if (url.pathname === "/api/people") {
        return json(await listCustomers(db, url.searchParams.get("q") ?? ""));
      }
      if (url.pathname === "/api/records" && request.method === "POST") {
        return await addRecord(db, request);
      }
      if (url.pathname === "/api/shop") {
        return json(await shopSettings(db, today()));
      }
      if (url.pathname === "/api/shop/hours" && request.method === "PUT") {
        return await setHours(db, request);
      }
      if (url.pathname === "/api/shop/closures" && request.method === "POST") {
        return await setClosure(db, request);
      }
      if (url.pathname === "/api/shop/staff" && request.method === "POST") {
        return await setStaff(db, request);
      }
      if (url.pathname === "/api/currencies") {
        return json(await currencyList(db));
      }
      if (url.pathname === "/api/payments" && request.method === "POST") {
        return await takePayment(db, request, session?.staffId ?? null);
      }
      if (url.pathname === "/api/revenue") {
        const month = url.searchParams.get("month") ?? today().slice(0, 7);
        if (!isMonth(month)) {
          return json({ error: "month must be a real YYYY-MM" }, 400);
        }
        return json(await revenue(db, month));
      }

      const person = /^\/api\/people\/(\d+)$/.exec(url.pathname);
      if (person) {
        if (request.method === "PATCH") {
          return await saveCustomer(db, request, Number(person[1]));
        }
        const found = await getCustomer(db, Number(person[1]));
        return found ? json(found) : json({ error: "そのお客様は見つかりません。" }, 404);
      }
      if (url.pathname === "/api/day") {
        const date = url.searchParams.get("date") ?? today();
        if (!isDate(date)) {
          return json({ error: "date must be a real YYYY-MM-DD" }, 400);
        }
        return json(await day(db, date));
      }
    } catch (error) {
      // The screen tells the guest something is wrong either way; this is so
      // that what went wrong is visible in the logs rather than guessed at.
      console.error(error);
      return json({ error: "the database did not answer" }, 500);
    }

    // Reached only for /api/*: run_worker_first in wrangler.toml sends
    // everything else to the static files without waking this up.
    return json({ error: "not found" }, 404);
}

/**
 * Today in the shop's time.
 *
 * Macau does not observe daylight saving, so a fixed +8 is correct and stays
 * correct. Workers run in UTC, and defaulting to the runtime's date would put
 * the calendar on yesterday for the whole morning.
 */
function today(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The shape of the room: which seats exist, and who is currently here.
 *
 * Staff who have left keep `left_on` set and drop out here, but stay in the
 * table — past bookings still point at them.
 */
async function room(db: Db) {
  const [allSeats, present] = await Promise.all([
    db
      .select({ id: seats.id, name: seats.name, kind: seats.kind })
      .from(seats)
      .where(eq(seats.active, true))
      .orderBy(asc(seats.sortOrder), asc(seats.id)),
    db
      .select({
        id: staff.id,
        name: staff.name,
        role: staff.role,
        grade: staff.grade,
        color: staff.color,
      })
      .from(staff)
      .where(isNull(staff.leftOn))
      .orderBy(asc(staff.id)),
  ]);

  return { seats: allSeats, staff: present };
}

/**
 * One day: every treatment, and what the day itself is.
 *
 * Opening hours, a one-off closure and a public holiday are three different
 * things and are kept apart. A closed Monday is a rule; a closure is a
 * decision; a holiday is information — the shop may well open on one.
 */
async function day(db: Db, date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  const [lines, hours, closedFor, publicHolidays, known] = await Promise.all([
    db
      .select({
        itemId: bookingItems.id,
        bookingId: bookings.id,
        seatId: bookingItems.seatId,
        staffId: bookingItems.staffId,
        staffName: staff.name,
        staffColor: staff.color,
        serviceId: bookingItems.serviceId,
        serviceJa: services.nameJa,
        serviceEn: services.nameEn,
        startsAt: bookingItems.startsAt,
        endsAt: bookingItems.endsAt,
        customerId: bookings.customerId,
        customerName: customers.name,
        status: bookings.status,
        nominated: bookings.nominated,
        source: bookings.source,
      })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .leftJoin(staff, eq(staff.id, bookingItems.staffId))
      .leftJoin(services, eq(services.id, bookingItems.serviceId))
      .leftJoin(customers, eq(customers.id, bookings.customerId))
      .where(eq(bookings.date, date))
      .orderBy(asc(bookingItems.startsAt), asc(bookingItems.seatId)),
    db
      .select({
        opensAt: businessHours.opensAt,
        closesAt: businessHours.closesAt,
        closed: businessHours.closed,
      })
      .from(businessHours)
      .where(eq(businessHours.weekday, weekday))
      .limit(1),
    db
      .select({ reason: closures.reason })
      .from(closures)
      .where(eq(closures.date, date))
      .limit(1),
    db
      .select({ region: holidays.region, name: holidays.name })
      .from(holidays)
      .where(eq(holidays.date, date)),
    // How far the imported list reaches. A year past the end of it should
    // say so rather than showing a clean calendar that means "no holidays"
    // when it means "nobody has imported that year".
    db.select({ to: max(holidays.date) }).from(holidays),
  ]);

  // Only when there is nothing to show. It is two aggregates over an indexed
  // column, but running it on every weekday of a busy month is work nobody
  // asked for.
  const span = lines.length === 0 ? await bookedRange(db) : null;

  return {
    date,
    weekday,
    hours: hours[0] ?? { opensAt: null, closesAt: null, closed: true },
    closure: closedFor[0] ?? null,
    holidays: publicHolidays,
    holidaysKnownTo: known[0]?.to ?? null,
    lines,
    ...(span ? { bookedRange: span } : {}),
  };
}

/**
 * The first and last dates that have anything booked.
 *
 * Sent only when the requested day is empty, so that the screen can say where
 * the data is instead of showing a blank grid and leaving it at that.
 */
async function bookedRange(db: Db) {
  const [row] = await db
    .select({ from: min(bookings.date), to: max(bookings.date) })
    .from(bookings);
  return row?.from ? row : null;
}

/**
 * Every reply the API makes.
 *
 * The headers are here rather than on each handler, for the same reason the
 * session check is: one that has to be remembered is one that gets forgotten
 * on the next endpoint. `no-store` matters more than usual — these replies
 * carry names, phone numbers and what was done to somebody's hair, and a
 * shared browser on the shop's PC should not keep them.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
