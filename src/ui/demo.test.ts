// The demo's session, with no cookie in either direction.
//
// This exists because of two bugs Node cannot reproduce, one per release.
//
// **A page cannot put `Set-Cookie` on a Response it constructs.** The name is
// forbidden on response-guarded headers and the browser drops it at
// construction, silently. The demo read that header to learn its session, so
// it could not sign in at all — while every test passed.
//
// **A page cannot put `Cookie` on a Request it constructs either.** Also
// forbidden, also dropped silently. With the first bug fixed, the demo signed
// in, minted a token, set it on the next request — and the browser removed it.
// Everything after the sign-in came back 401 and the app returned to the
// sign-in screen, showing the booking screen for a frame on the way. Every
// test passed again.
//
// Node does both, which is what made both of them invisible here. So this
// harness takes both away — strips `Set-Cookie` off every reply and refuses to
// carry a `Cookie` on any request — and proves the demo signs in and stays
// signed in regardless. The token travels as an argument to route(), which is
// what demo.ts does and the only part of this that is not the production
// path.

import { strictEqual, ok } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";

import { route } from "../worker/router.ts";
import { DEMO_LOGIN, keepSession } from "./demo.ts";

const SQL = await initSqlJs();
const SECRET = "demo-only-secret";

/** The schema, one member of staff, and the demo's own login. */
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

/**
 * The demo's fetch, with both of the browser's cookie rules applied.
 *
 * Requests lose any `Cookie` and replies lose any `Set-Cookie`, which is what
 * a browser does to a Request and a Response a page built. Anything that
 * depended on either fails here the way it failed there.
 */
function browser(db: ReturnType<typeof database>) {
  let token: string | null = null;

  return async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    // Whatever anybody put there, the browser would not have carried it.
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

  // Nobody yet, which is the sign-in screen.
  strictEqual((await call("/api/session")).status, 401);

  const signedIn = await call("/api/session", asJson(DEMO_LOGIN));
  strictEqual(signedIn.status, 200);

  // And it holds for the next request, which is the half that was broken: the
  // reply said ok, and everything after it came back 401.
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
  // The router signs out by sending an empty cookie — one of the two headers
  // the browser will not carry — so this is handled by the method, not by
  // reading anything back.
  strictEqual((await call("/api/room")).status, 401);
});

test("the token the demo mints is one the router accepts", async () => {
  // Not a token shaped like one. keepSession signs with the same issue() the
  // Worker uses, and the check is that read() on the other side takes it.
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
// The file is built once. Opened a month later it opened on an empty calendar,
// which reads as "this does not work" rather than "this data is from
// September" — so the whole sample is moved forward when it loads.
//
// The checks below run on the real file, because the thing that can go wrong
// here is arithmetic against real dates: the shop closes on Mondays and the
// sample has no bookings on one, so a shift of any size that is not a whole
// number of weeks puts a Tuesday's work on the closed day.

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
  // A demo built this morning should not be shuffled about.
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

  // Nothing on the shop's day off. This is what a shift of three days would
  // break, silently and plausibly.
  strictEqual(
    one(`SELECT count(*) FROM bookings WHERE strftime('%w', date) = '${String(closed)}'`),
    0,
    "bookings landed on the day the shop is shut",
  );

  // And today has a day's work in it, unless today is the day off.
  const todayIsClosed = new Date(`${today}T00:00:00Z`).getUTCDay() === Number(closed);
  const booked = Number(one(`SELECT count(*) FROM bookings WHERE date = '${today}'`));
  if (todayIsClosed) strictEqual(booked, 0, "the shop is shut today and yet has bookings");
  else ok(booked > 0, `today (${today}) came out empty`);

  // Holidays are real days in a real calendar and do not move with the sample.
  strictEqual(one("SELECT min(date) FROM holidays WHERE date >= '2026-10-01'"), before);
});
