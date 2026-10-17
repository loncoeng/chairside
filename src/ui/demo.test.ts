// Demo session without cookies. Browsers silently drop `Set-Cookie` from a
// Response and `Cookie` from a Request built in the page; Node keeps both.
// This harness strips both and checks the demo still signs in and stays in.
// The token goes to route() as an argument, as in demo.ts.

import { strictEqual, ok } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";

import { route } from "../worker/router.ts";
import { DEMO_LOGIN, keepSession } from "./demo.ts";

const SQL = await initSqlJs();
const SECRET = "demo-only-secret";

/** Schema, one staff member, and the demo login. */
function database() {
  const raw = new SQL.Database();
  for (const name of readdirSync("migrations").filter((n) => n.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(`migrations/${name}`, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim() !== "") raw.run(statement);
    }
  }
  raw.run(`
    INSERT INTO seats (id, name, kind, active, sort_order) VALUES (1, 'A1', 'styling', 1, 1);
    INSERT INTO staff (id, name, role, grade, color) VALUES (1, 'Aoi', 'owner', 'owner', '#B4553F');
  `);
  for (const statement of readFileSync("seed/logins.sql", "utf8").split(";")) {
    if (statement.trim() !== "") raw.run(statement);
  }
  return drizzle(raw);
}

/** Demo fetch with browser rules applied: no `Cookie` on requests, no `Set-Cookie` on replies. */
function browser(db: ReturnType<typeof database>) {
  let token: string | null = null;

  return async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    headers.delete("cookie");
    const sent = new Request(`https://demo.invalid${path}`, { ...init, headers });
    strictEqual(sent.headers.get("cookie"), null, "the browser would have dropped this");

    const answer = await route(db, sent, "demo", SECRET, token);

    const stripped = new Headers(answer.headers);
    stripped.delete("set-cookie");
    const seen = new Response(await answer.clone().arrayBuffer(), {
      status: answer.status,
      headers: stripped,
    });
    strictEqual(seen.headers.get("set-cookie"), null, "the browser would have dropped this too");

    const kept = await keepSession(init.method ?? "GET", path, seen);
    if (kept !== undefined) token = kept;

    return seen;
  };
}

const asJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("the demo signs in with no cookie in either direction", async () => {
  const call = browser(database());

  // Not signed in yet.
  strictEqual((await call("/api/session")).status, 401);

  const signedIn = await call("/api/session", asJson(DEMO_LOGIN));
  strictEqual(signedIn.status, 200);

  // The session must hold for later requests, not just the sign-in reply.
  strictEqual((await call("/api/session")).status, 200);
  strictEqual((await call("/api/room")).status, 200);
});

test("the wrong password still gets nobody in", async () => {
  const call = browser(database());
  strictEqual(
    (await call("/api/session", asJson({ loginId: DEMO_LOGIN.loginId, password: "wrong" }))).status,
    401,
  );
  strictEqual((await call("/api/room")).status, 401);
});

test("signing out of the demo puts the session back to nothing", async () => {
  const call = browser(database());
  await call("/api/session", asJson(DEMO_LOGIN));
  strictEqual((await call("/api/room")).status, 200);

  await call("/api/session", { method: "DELETE" });
  // The router's empty Set-Cookie is dropped, so sign-out is detected by method.
  strictEqual((await call("/api/room")).status, 401);
});

test("the token the demo mints is one the router accepts", async () => {
  // keepSession signs with the Worker's issue(); read() must accept it.
  const call = browser(database());
  const signedIn = await call("/api/session", asJson(DEMO_LOGIN));
  const who = (await signedIn.json()) as { staff?: { id?: number; role?: string } };
  strictEqual(who.staff?.id, 1);
  strictEqual(who.staff?.role, "owner");

  const room = await call("/api/room");
  const body = (await room.json()) as { seats?: unknown[] };
  ok(Array.isArray(body.seats) && body.seats.length > 0, "the room came back empty");
});

// --- Moving the sample to the visitor's today -----------------------------
//
// Runs on the real file. The shop is closed on Mondays, so any shift that is
// not whole weeks puts bookings on the closed day.

import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { moveToNow, weeksToShift } from "./demo.ts";
import { todayInShop } from "./types.ts";

const DEMO_FILE = "public/demo.sqlite.gz";

test("the sample is only ever moved forward, and only by whole weeks", () => {
  for (const [last, today] of [
    ["2026-09-30", "2026-10-03"],
    ["2026-09-30", "2026-09-30"],
    ["2026-09-30", "2027-03-01"],
    ["2026-09-30", "2029-12-31"],
  ]) {
    const days = weeksToShift(last!, today!);
    strictEqual(days % 7, 0, `${last} → ${today} moved by ${days} days, which is not whole weeks`);

    const end = new Date(Date.parse(`${last}T00:00:00Z`) + days * 86_400_000);
    const lead = (end.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
    ok(lead >= 7, `${today} would have only ${lead} days of bookings ahead of it`);
  }
});

test("a sample that is already ahead is left alone", () => {
  strictEqual(weeksToShift("2026-09-30", "2026-09-20"), 0);
  strictEqual(weeksToShift("2026-09-30", "2026-01-01"), 0);
});

test("the real sample lands on the visitor's today, and not on the closed day", () => {
  ok(existsSync(DEMO_FILE), `run \`npm run demo:db\` first — missing: ${DEMO_FILE}`);

  const raw = new SQL.Database(new Uint8Array(gunzipSync(readFileSync(DEMO_FILE))));
  const one = (sql: string): unknown => raw.exec(sql)[0]?.values[0]?.[0];

  const closed = one("SELECT weekday FROM business_hours WHERE closed = 1");
  const before = one("SELECT min(date) FROM holidays WHERE date >= '2026-10-01'");

  moveToNow(raw);

  const today = todayInShop();
  const last = String(one("SELECT max(date) FROM bookings"));
  ok(last >= today, `the last booking is ${last}, which is behind today (${today})`);

  // Nothing on the day off (a non-week shift would break this).
  strictEqual(
    one(`SELECT count(*) FROM bookings WHERE strftime('%w', date) = '${String(closed)}'`),
    0,
    "bookings landed on the day the shop is shut",
  );

  // Today has bookings unless it is the day off.
  const todayIsClosed = new Date(`${today}T00:00:00Z`).getUTCDay() === Number(closed);
  const booked = Number(one(`SELECT count(*) FROM bookings WHERE date = '${today}'`));
  if (todayIsClosed) strictEqual(booked, 0, "the shop is shut today and yet has bookings");
  else ok(booked > 0, `today (${today}) came out empty`);

  // Holidays are real dates and do not move.
  strictEqual(one("SELECT min(date) FROM holidays WHERE date >= '2026-10-01'"), before);
});
