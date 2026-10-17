// API routes. Separate from the Worker so the browser demo shares the same table.

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
 * Handles one API request. Takes any drizzle SQLite database (../db/database.ts),
 * so it runs on D1, a shop PC, or sql.js in the browser demo.
 */
export async function route(
  db: Db,
  request: Request,
  build: string,
  secret?: string,
  /**
   * Session token for callers that cannot send a Cookie header. The browser
   * demo needs this: `Cookie` is a forbidden request header and browsers drop
   * it silently (Node does not). Verified exactly like a cookie token.
   */
  token?: string | null,
): Promise<Response> {
    const url = new URL(request.url);

    try {
      // Live commit, polled by the deploy check.
      if (url.pathname === "/api/version") {
        return json({ build });
      }

      // Auth is checked once here, not per handler, so a new endpoint can't forget it.

      if (url.pathname === "/api/session") {
        if (request.method === "POST") return await signIn(db, request, secret);
        if (request.method === "DELETE") return signOut();
        if (request.method === "GET") {
          const open = await read(secret, token ?? tokenFrom(request));
          return open ? await whoAmI(db, open.staffId) : json({ ok: false }, 401);
        }
        return json({ error: "method not allowed" }, 405);
      }

      const session = await read(secret, token ?? tokenFrom(request));

      if (!isOpen(url.pathname) && session === null) {
        return json({ code: "signed-out", error: "Please sign in." }, 401);
      }

      if (session !== null && !mayReach(session.role, url.pathname, request.method)) {
        return json({ code: "forbidden", error: "You are not allowed to do that." }, 403);
      }
      if (url.pathname === "/api/room") {
        return json(await room(db));
      }
      if (url.pathname === "/api/bookings" && request.method === "POST") {
        return await createBooking(db, request, session?.staffId ?? null);
      }

      // /api/bookings/:id
      const booking = /^\/api\/bookings\/(\d+)$/.exec(url.pathname);
      if (booking) {
        const id = Number(booking[1]);
        if (request.method === "GET") {
          const found = await getBooking(db, id);
          if (!found) return json({ code: "booking-not-found", error: "That booking was not found." }, 404);
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
      // Full list for the booking form picker; /api/people is the searchable list.
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
        return found ? json(found) : json({ code: "customer-not-found", error: "That customer was not found." }, 404);
      }
      if (url.pathname === "/api/day") {
        const date = url.searchParams.get("date") ?? today();
        if (!isDate(date)) {
          return json({ error: "date must be a real YYYY-MM-DD" }, 400);
        }
        return json(await day(db, date));
      }
    } catch (error) {
      console.error(error);
      return json({ error: "the database did not answer" }, 500);
    }

    // Only /api/* reaches the Worker (run_worker_first in wrangler.toml).
    return json({ error: "not found" }, 404);
}

/** Today in Macau (UTC+8, no DST). Workers run in UTC. */
function today(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Active seats and current staff. Staff with `left_on` set are excluded here
 * but kept in the table, since past bookings reference them.
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
 * One day's treatments plus its hours, closure and holidays. These are kept
 * separate: a shop may open on a public holiday.
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
    // Last imported holiday date, so the UI can tell "no holidays" from "not imported".
    db.select({ to: max(holidays.date) }).from(holidays),
  ]);

  // Only computed for empty days.
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

/** First and last booked dates, sent on an empty day so the UI can point to the data. */
async function bookedRange(db: Db) {
  const [row] = await db
    .select({ from: min(bookings.date), to: max(bookings.date) })
    .from(bookings);
  return row?.from ? row : null;
}

/**
 * JSON response with shared headers. `no-store` keeps customer data out of the
 * cache on a shared shop PC.
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
