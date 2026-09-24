// The API. Static files are served straight from the assets bundle; this
// handles /api/ and nothing else.
//
// Queries go through the same src/db/schema.ts that generated the tables, so
// a column renamed in the schema stops this from compiling rather than
// returning nulls at runtime.

import { drizzle } from "drizzle-orm/d1";
import { asc, eq, isNull, max, min } from "drizzle-orm";
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      // Which commit is answering. Asked for by the deploy check, which
      // otherwise cannot tell new code from old.
      if (url.pathname === "/api/version") {
        return json({ build: env.BUILD });
      }
      if (url.pathname === "/api/room") {
        return json(await room(env));
      }
      // The endpoints that write.
      if (url.pathname === "/api/bookings" && request.method === "POST") {
        return await createBooking(env, request);
      }

      // /api/bookings/123 — read one, or change it.
      const booking = /^\/api\/bookings\/(\d+)$/.exec(url.pathname);
      if (booking) {
        const id = Number(booking[1]);
        if (request.method === "GET") {
          const found = await getBooking(drizzle(env.DB), id);
          return found ? json(found) : json({ error: "その予約は見つかりません。" }, 404);
        }
        if (request.method === "PATCH") {
          return await updateBooking(env, request, id);
        }
        return json({ error: "method not allowed" }, 405);
      }
      if (url.pathname === "/api/services") {
        return json(await menu(drizzle(env.DB)));
      }
      if (url.pathname === "/api/customers") {
        return json(await customerList(drizzle(env.DB)));
      }
      if (url.pathname === "/api/day") {
        const date = url.searchParams.get("date") ?? today();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return json({ error: "date must be YYYY-MM-DD" }, 400);
        }
        return json(await day(env, date));
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
  },
} satisfies ExportedHandler<Env>;

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
async function room(env: Env) {
  const db = drizzle(env.DB);

  const [allSeats, present] = await Promise.all([
    db
      .select({ id: seats.id, name: seats.name, kind: seats.kind })
      .from(seats)
      .where(eq(seats.active, true))
      .orderBy(asc(seats.sortOrder), asc(seats.id)),
    db
      .select({ id: staff.id, name: staff.name, role: staff.role, color: staff.color })
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
async function day(env: Env, date: string) {
  const db = drizzle(env.DB);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  const [lines, hours, closedFor, publicHolidays] = await Promise.all([
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
async function bookedRange(db: ReturnType<typeof drizzle>) {
  const [row] = await db
    .select({ from: min(bookings.date), to: max(bookings.date) })
    .from(bookings);
  return row?.from ? row : null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The data is read fresh on every load. A booking screen showing a
      // cached seat list is worse than a slightly slower one.
      "cache-control": "no-store",
    },
  });
}
