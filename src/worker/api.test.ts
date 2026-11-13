// The rules the API holds that no screen can check for it: what happens when two
// requests race, when a request is repeated, and when the person behind a token
// has changed since it was issued. Uses the real router on sql.js.

import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { drizzle } from "drizzle-orm/sql-js";

import { atomically } from "../db/atomic.ts";
import { bookingItems, bookings } from "../db/schema.ts";
import { issue } from "../db/session.ts";
import { migrated } from "../db/test-database.ts";
import { beaten } from "./booking-api.ts";
import { route } from "./router.ts";

const SECRET = "a-secret-for-the-tests-only-and-nothing-else";
/** A Wednesday the shop is open. */
const DAY = "2026-09-23";

function shop() {
  const raw = migrated();
  raw.run(`
    INSERT INTO seats (id, name, kind, active, sort_order) VALUES
      (1, 'A1', 'styling', 1, 1), (10, 'S1', 'shampoo', 1, 10);

    INSERT INTO staff (id, name, role, grade, color, login_id, left_on) VALUES
      (1, 'Aoi', 'owner', 'owner', '#B4553F', NULL, NULL),
      (2, 'Ren', 'stylist', 'stylist1', '#3F6BB4', NULL, NULL),
      (3, 'Mei', 'stylist', 'stylist2', NULL, NULL, '2026-09-01');

    INSERT INTO services (id, name_ja, name_zh, name_en, duration_min, seat_kind, price_cents, active, sort_order)
      VALUES (1, 'カット', '剪髮', 'Cut', 45, 'styling', 45000, 1, 1);

    INSERT INTO currencies (code, rate_to_base_bp, active, sort_order) VALUES
      ('MOP', 10000, 1, 1), ('HKD', 10300, 1, 2);

    INSERT INTO business_hours (id, weekday, opens_at, closes_at, closed) VALUES
      (1, 0, '10:00', '19:00', 0), (2, 1, NULL, NULL, 1), (3, 2, '10:00', '20:00', 0),
      (4, 3, '10:00', '20:00', 0), (5, 4, '10:00', '20:00', 0), (6, 5, '10:00', '20:00', 0),
      (7, 6, '10:00', '20:00', 0);

    INSERT INTO customers (id, name) VALUES (1, 'Guest One'), (2, 'Guest Two');
  `);
  return { raw, db: drizzle(raw) };
}

type Shop = ReturnType<typeof shop>;

async function ask(
  { db }: Shop,
  path: string,
  body?: unknown,
  {
    method = body === undefined ? "GET" : "POST",
    as = 1,
    role = "owner",
    type = "application/json",
  } = {},
) {
  const token = await issue(SECRET, as, role);
  const response = await route(
    db,
    new Request(`https://example.test${path}`, {
      method,
      headers: { "content-type": type, cookie: `__Host-chairside_session=${token}` },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    "test",
    SECRET,
  );
  return { status: response.status, reply: (await response.json()) as Record<string, unknown> };
}

const count = (s: Shop, table: string) =>
  s.raw.exec(`SELECT count(*) FROM ${table}`)[0]?.values[0]?.[0] as number;

const book = (s: Shop, staffId: number, startsAt = "11:00", customerId: number | null = 1) =>
  ask(s, "/api/bookings", { date: DAY, startsAt, staffId, customerId, serviceIds: [1] });

// --- Races ---------------------------------------------------------------

test("of two bookings that both got past the check, the later one withdraws", async () => {
  const s = shop();
  // Both written as if each had checked before the other landed.
  s.raw.run(`
    INSERT INTO bookings (id, customer_id, date, starts_at, ends_at) VALUES
      (5, 1, '${DAY}', '11:00', '11:45'), (6, 2, '${DAY}', '11:15', '12:00');
    INSERT INTO booking_items (booking_id, service_id, staff_id, starts_at, ends_at) VALUES
      (5, 1, 2, '11:00', '11:45'), (6, 1, 2, '11:15', '12:00');
  `);
  const room = {
    seats: [],
    hours: { opensAt: "10:00", closesAt: "20:00", closed: false },
    closure: false,
  };
  const draft = (startsAt: string, endsAt: string) => [
    { seatId: null, seatKind: "styling" as const, staffId: 2, startsAt, endsAt },
  ];

  // Whichever looks first, the answer is the same: 6 yields to 5, and 5 stands.
  strictEqual(await beaten(s.db, 5, DAY, draft("11:00", "11:45"), room), null);
  const lost = await beaten(s.db, 6, DAY, draft("11:15", "12:00"), room);
  strictEqual(lost?.[0]?.code, "staff-double-booked");
});

test("a booking is written whole or not at all", async () => {
  const s = shop();
  // The second statement breaks a foreign key, so the first must not survive it.
  await rejects(
    atomically(s.db, [
      s.db.insert(bookings).values({ date: DAY, startsAt: "10:00", endsAt: "10:45" }),
      s.db.insert(bookingItems).values({
        bookingId: 999,
        serviceId: 1,
        startsAt: "10:00",
        endsAt: "10:45",
      }),
    ]),
  );
  strictEqual(count(s, "bookings"), 0);
});

test("a new booking lands with its treatment and its history together", async () => {
  const s = shop();
  const made = await book(s, 2);
  strictEqual(made.status, 201);
  const id = made.reply.bookingId as number;
  deepStrictEqual(
    s.raw.exec(`SELECT count(*) FROM booking_items WHERE booking_id = ${id}`)[0]?.values,
    [[1]],
  );
  deepStrictEqual(
    s.raw.exec(`SELECT kind FROM booking_events WHERE booking_id = ${id}`)[0]?.values,
    [["created"]],
  );
});

// --- Status ----------------------------------------------------------------

test("a cancelled booking cannot come back over somebody who took its place", async () => {
  const s = shop();
  const first = (await book(s, 2)).reply.bookingId as number;
  strictEqual(
    (await ask(s, `/api/bookings/${first}`, { status: "cancelled" }, { method: "PATCH" })).status,
    200,
  );
  // Ren's 11:00 is free again and goes to somebody else.
  strictEqual((await book(s, 2, "11:00", 2)).status, 201);

  const back = await ask(s, `/api/bookings/${first}`, { status: "booked" }, { method: "PATCH" });
  strictEqual(back.status, 409);
  strictEqual((back.reply.verdicts as { code: string }[])[0]?.code, "staff-double-booked");
});

test("a cancelled booking whose time is still free comes back", async () => {
  const s = shop();
  const id = (await book(s, 2)).reply.bookingId as number;
  await ask(s, `/api/bookings/${id}`, { status: "cancelled" }, { method: "PATCH" });
  strictEqual(
    (await ask(s, `/api/bookings/${id}`, { status: "booked" }, { method: "PATCH" })).status,
    200,
  );
});

// --- References ------------------------------------------------------------

test("a booking for a guest or a stylist who is not there is refused", async () => {
  const s = shop();
  strictEqual((await book(s, 2, "11:00", 99)).reply.code, "unknown-customer");
  strictEqual((await book(s, 99)).reply.code, "unknown-staff");
  // Mei left on 1 September.
  strictEqual((await book(s, 3)).reply.code, "unknown-staff");
});

test("a treatment record cannot be tied to another guest's visit", async () => {
  const s = shop();
  const theirs = (await book(s, 2, "11:00", 2)).reply.bookingId;
  const record = await ask(s, "/api/records", {
    customerId: 1,
    bookingId: theirs,
    recordedOn: DAY,
    note: "x",
  });
  strictEqual(record.reply.code, "booking-not-theirs");
});

// --- Money -----------------------------------------------------------------

test("pressing pay twice records one payment", async () => {
  const s = shop();
  const bookingId = (await book(s, 2)).reply.bookingId;
  const pay = { bookingId, amountCents: 45_000, currency: "MOP", requestKey: "till-0001-abcd" };

  strictEqual((await ask(s, "/api/payments", pay)).status, 201);
  const again = await ask(s, "/api/payments", pay);
  strictEqual(again.status, 200);
  strictEqual(again.reply.repeated, true);
  strictEqual(count(s, "payments"), 1);
});

test("an amount must be whole cents", async () => {
  const s = shop();
  const bookingId = (await book(s, 2)).reply.bookingId;
  for (const amountCents of [450.5, "45000", -100, 0]) {
    const paid = await ask(s, "/api/payments", { bookingId, amountCents, currency: "MOP" });
    strictEqual(paid.reply.code, "bad-amount", String(amountCents));
  }
});

test("a split bill counts as one bill, converted at each payment's rate", async () => {
  const s = shop();
  const bookingId = (await book(s, 2)).reply.bookingId;
  await ask(s, "/api/payments", { bookingId, amountCents: 30_000, currency: "MOP" });
  await ask(s, "/api/payments", { bookingId, amountCents: 10_000, currency: "HKD" });

  const month = (await ask(s, "/api/revenue?month=2026-09")).reply;
  strictEqual(month.bills, 1);
  // 300 MOP, plus HKD 100 at 1:1.03.
  strictEqual(month.totalCents, 30_000 + 10_300);
  strictEqual((month.byDay as { n: number }[])[0]?.n, 1);
});

// --- Staff -----------------------------------------------------------------

test("changing one thing about a stylist leaves the rest alone", async () => {
  const s = shop();
  strictEqual((await ask(s, "/api/shop/staff", { id: 2, name: "Ren K" })).status, 200);
  deepStrictEqual(s.raw.exec("SELECT name, role, color FROM staff WHERE id = 2")[0]?.values, [
    ["Ren K", "stylist", "#3F6BB4"],
  ]);
});

test("the last owner can be neither demoted nor marked as left", async () => {
  const s = shop();
  strictEqual(
    (await ask(s, "/api/shop/staff", { id: 1, role: "stylist" })).reply.code,
    "last-owner",
  );
  strictEqual((await ask(s, "/api/shop/staff", { id: 1, leftOn: DAY })).reply.code, "last-owner");

  // With a second owner, either is fine.
  await ask(s, "/api/shop/staff", { id: 2, role: "owner" });
  strictEqual((await ask(s, "/api/shop/staff", { id: 1, role: "stylist" })).status, 200);
});

// --- Who is asking ---------------------------------------------------------

test("a token stops working the moment its holder leaves", async () => {
  const s = shop();
  strictEqual((await ask(s, "/api/room", undefined, { as: 2, role: "stylist" })).status, 200);
  s.raw.run(`UPDATE staff SET left_on = '${DAY}' WHERE id = 2`);
  strictEqual((await ask(s, "/api/room", undefined, { as: 2, role: "stylist" })).status, 401);
});

test("a role is read from the staff table, not from the token", async () => {
  const s = shop();
  // A token that still says owner, for somebody who is now a stylist.
  strictEqual(
    (await ask(s, "/api/revenue?month=2026-09", undefined, { as: 2, role: "owner" })).status,
    403,
  );
});

test("a write that is not JSON is refused before it is read", async () => {
  const s = shop();
  const sent = await ask(s, "/api/people", "name=probe", {
    type: "application/x-www-form-urlencoded",
  });
  strictEqual(sent.status, 415);
  strictEqual(count(s, "customers"), 2);
});

test("failed sign-ins are counted in the database, so every instance sees them", async () => {
  const s = shop();
  const attempt = () =>
    route(
      s.db,
      new Request("https://example.test/api/session", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.7" },
        body: JSON.stringify({ loginId: "nobody", password: "guess" }),
      }),
      "test",
      SECRET,
    );

  for (let i = 0; i < 5; i++) strictEqual((await attempt()).status, 401);
  strictEqual((await attempt()).status, 429);
  ok(count(s, "failed_sign_ins") >= 10);
});
