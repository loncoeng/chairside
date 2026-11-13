// Checks every date-taking endpoint calls isDate, and with the right polarity
// (a missing `!` refuses every date). Uses the real router.

import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { drizzle } from "drizzle-orm/sql-js";

import { issue } from "../db/session.ts";
import { route } from "./router.ts";
import { migrated } from "../db/test-database.ts";

const SECRET = "a-secret-for-the-tests-only-and-nothing-else";

/** Minimal shop fixture. */
function database() {
  const raw = migrated();
  raw.run(`
    INSERT INTO seats (id, name, kind, active, sort_order) VALUES
      (1, 'A1', 'styling', 1, 1), (10, 'S1', 'shampoo', 1, 10);

    INSERT INTO staff (id, name, role, grade, color) VALUES
      (1, 'Aoi', 'owner', 'owner', '#B4553F');

    INSERT INTO services (id, name_ja, name_zh, name_en, duration_min, seat_kind, price_cents, active, sort_order)
      VALUES (1, 'カット', '剪髮', 'Cut', 45, 'styling', 28000, 1, 1);

    INSERT INTO business_hours (id, weekday, opens_at, closes_at, closed) VALUES
      (1, 0, '10:00', '19:00', 0), (2, 1, NULL, NULL, 1), (3, 2, '10:00', '20:00', 0),
      (4, 3, '10:00', '20:00', 0), (5, 4, '10:00', '20:00', 0), (6, 5, '10:00', '20:00', 0),
      (7, 6, '10:00', '20:00', 0);

    INSERT INTO customers (id, name, search_key, phone) VALUES (1, '陳 嘉雯', 'chan ka man', '6612 3401');
  `);
  return drizzle(raw);
}

/** One real date and three invalid ones. */
const GOOD = "2026-09-23";
const BAD = ["2026-02-30", "2026-13-01", "2026-09-31"];

async function ask(db: ReturnType<typeof database>, path: string, body: unknown, method = "POST") {
  const token = await issue(SECRET, 1, "owner");
  return await route(
    db,
    new Request(`https://example.test${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: `__Host-chairside_session=${token}` },
      body: method === "GET" ? undefined : JSON.stringify(body),
    }),
    "test",
    SECRET,
  );
}

test("a day that does not exist is refused wherever a date is taken", async () => {
  const db = database();

  for (const date of BAD) {
    strictEqual(
      (await ask(db, `/api/day?date=${date}`, null, "GET")).status,
      400,
      `GET /api/day ${date}`,
    );
    strictEqual(
      (await ask(db, "/api/bookings", { customerId: 1, date, startsAt: "10:00", serviceIds: [1] }))
        .status,
      400,
      `POST /api/bookings ${date}`,
    );
    strictEqual(
      (await ask(db, "/api/records", { customerId: 1, recordedOn: date, note: "x" })).status,
      400,
      `POST /api/records ${date}`,
    );
    strictEqual(
      (await ask(db, "/api/people", { name: "日付試験", birthday: date })).status,
      400,
      `POST /api/people ${date}`,
    );
    strictEqual(
      (await ask(db, "/api/shop/closures", { date, reason: "x" })).status,
      400,
      `POST /api/shop/closures ${date}`,
    );
  }
});

test("and a day that does exist is not", async () => {
  // Catches an inverted check.
  const db = database();

  strictEqual((await ask(db, `/api/day?date=${GOOD}`, null, "GET")).status, 200);
  strictEqual(
    (await ask(db, "/api/records", { customerId: 1, recordedOn: GOOD, note: "毛先だけ" })).status,
    201,
  );
  strictEqual((await ask(db, "/api/people", { name: "日付試験", birthday: GOOD })).status, 201);
  strictEqual((await ask(db, "/api/shop/closures", { date: GOOD, reason: "棚卸し" })).status, 200);
});
