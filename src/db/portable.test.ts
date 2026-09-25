// The claim this repository makes in its README is that one schema and one
// set of queries run in three places: Cloudflare's D1, a SQLite file on a
// shop PC, and SQLite compiled to WebAssembly in a browser.
//
// A claim like that rots quietly. Somebody reaches for a D1-only method, it
// works in production, and the sentence in the README stays true-looking for
// a year. So the queries are run here against sql.js — the same engine the
// browser demo uses, and not D1 by any stretch — and if that stops working
// this test says so.

import { strictEqual, ok } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";

import { getBooking, menu } from "../worker/booking-api.ts";
import { getCustomer, listCustomers } from "../worker/customer-api.ts";
import { revenue } from "../worker/money-api.ts";
import { shopSettings } from "../worker/shop-api.ts";

const SQL = await initSqlJs();

/** The schema and a handful of rows, built in memory. */
function database() {
  const raw = new SQL.Database();

  // Every migration, not a list to keep up to date. A list gets out of step
  // and the test then checks last month's schema.
  for (const name of readdirSync("migrations").filter((n) => n.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(`migrations/${name}`, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim() !== "") raw.run(statement);
    }
  }

  raw.run(`
    INSERT INTO seats (id, name, kind, active, sort_order) VALUES
      (1, 'A1', 'styling', 1, 1), (10, 'S1', 'shampoo', 1, 10);

    INSERT INTO staff (id, name, role, grade, color) VALUES
      (1, 'Aoi', 'owner', 'owner', '#B4553F'),
      (8, 'Hana', 'assistant', 'assistant', '#6B7A45');

    INSERT INTO services (id, name_ja, name_zh, name_en, duration_min, seat_kind, price, active, sort_order)
      VALUES (1, 'カット', '剪髮', 'Cut', 45, 'styling', 280, 1, 1),
             (4, 'シャンプー', '洗髮', 'Shampoo', 20, 'shampoo', 180, 1, 4);

    INSERT INTO service_prices (id, service_id, grade, price) VALUES
      (1, 1, 'owner', 750), (2, 1, 'stylist1', 450), (3, 1, 'stylist2', 300);

    INSERT INTO currencies (code, rate_to_base, active, sort_order) VALUES ('MOP', 1, 1, 1);

    INSERT INTO business_hours (id, weekday, opens_at, closes_at, closed) VALUES
      (1, 0, '10:00', '19:00', 0), (2, 1, NULL, NULL, 1), (3, 2, '10:00', '20:00', 0),
      (4, 3, '10:00', '20:00', 0), (5, 4, '10:00', '20:00', 0), (6, 5, '10:00', '20:00', 0),
      (7, 6, '10:00', '20:00', 0);

    INSERT INTO customers (id, name, search_key, phone) VALUES (1, '陳 嘉雯', 'chan ka man', '6612 3401');

    INSERT INTO bookings (id, customer_id, date, starts_at, ends_at, status, nominated, source)
      VALUES (1, 1, '2026-08-12', '10:00', '11:05', 'done', 1, 'staff');

    INSERT INTO booking_items (id, booking_id, service_id, staff_id, seat_id, starts_at, ends_at, sort_order)
      VALUES (1, 1, 4, 8, 10, '10:00', '10:20', 0),
             (2, 1, 1, 1, 1, '10:20', '11:05', 1);

    INSERT INTO payments (id, booking_id, amount, currency, rate_to_base, method, paid_at)
      VALUES (1, 1, 400, 'MOP', 1, 'card', 1786000000);

    INSERT INTO booking_events (id, booking_id, at, kind, before, after)
      VALUES (1, 1, 1785000000, 'created', NULL, '2026-08-12 10:00');
  `);

  return drizzle(raw);
}

test("the menu reads on sql.js, prices and all", async () => {
  const rows = await menu(database());
  strictEqual(rows.length, 2);
  strictEqual(rows[0]?.nameJa, "カット");

  // A cut costs 750 with the owner and 300 with a junior. The menu carries
  // both, because the screen cannot price a booking without knowing who is
  // doing it.
  strictEqual(rows[0]?.byGrade?.owner, 750);
  strictEqual(rows[0]?.byGrade?.stylist2, 300);
  // A shampoo is a shampoo — no rows, and the flat price stands.
  strictEqual(rows[1]?.byGrade, null);
  strictEqual(rows[1]?.price, 180);
});

test("a booking reads, joins and all", async () => {
  const booking = await getBooking(database(), 1);
  ok(booking);
  strictEqual(booking.customerName, "陳 嘉雯");
  strictEqual(booking.items.length, 2);
  strictEqual(booking.history.length, 1);
});

test("a customer's standing is computed the same way", async () => {
  const person = await getCustomer(database(), 1);
  ok(person);
  strictEqual(person.standing.visits, 1);
  strictEqual(person.bookings[0]?.lines.length, 2);
});

test("searching finds by the second spelling", async () => {
  const found = await listCustomers(database(), "chan");
  strictEqual(found.length, 1);
  strictEqual(found[0]?.name, "陳 嘉雯");
});

test("the month's takings add up, and go to the stylist", async () => {
  // The shampoo is first and the assistant did it; the bill belongs to Aoi.
  // This is the rule from credit.ts, reached through the real query.
  const month = await revenue(database(), "2026-08");
  strictEqual(month.total, 400);
  strictEqual(month.bills, 1);
  strictEqual(month.byStaff[0]?.name, "Aoi");
});

test("the shop's settings read", async () => {
  const shop = await shopSettings(database(), "2026-08-01");
  strictEqual(shop.hours.length, 7);
  strictEqual(shop.hours[1]?.closed, true);
  strictEqual(shop.staff.length, 2);
});
