// The demo's session, with no Set-Cookie anywhere.
//
// This exists because of a bug Node cannot reproduce. The demo answers the API
// from inside the page, and **a page cannot put `Set-Cookie` on a Response it
// constructs** — the name is forbidden on response-guarded headers, so the
// browser drops it at construction and says nothing. Node keeps it.
//
// So the first version of the demo read that header to learn its session. Every
// test passed, the deploy was green, and signing in was impossible in a
// browser: the cookie was never picked up, the next request came back 401, and
// the app went straight back to the sign-in screen.
//
// The test below therefore strips the header before anything looks at it —
// which is what the browser does — and proves the demo still signs in and
// stays signed in. Reading a header Node hands over and a browser does not is
// exactly the assumption that broke, so nothing here reads one.

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
 * The demo's fetch, with the browser's rule about Set-Cookie applied.
 *
 * Every reply is rebuilt without that header, so anything downstream that
 * depended on it fails here the way it fails in a browser.
 */
function browser(db: ReturnType<typeof database>) {
  let cookie: string | null = null;

  return async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    if (cookie !== null) headers.set("cookie", cookie);

    const answer = await route(
      db,
      new Request(`https://demo.invalid${path}`, { ...init, headers }),
      "demo",
      SECRET,
    );

    const stripped = new Headers(answer.headers);
    stripped.delete("set-cookie");
    const seen = new Response(await answer.clone().arrayBuffer(), {
      status: answer.status,
      headers: stripped,
    });
    strictEqual(seen.headers.get("set-cookie"), null, "the browser would have dropped this");

    const kept = await keepSession(init.method ?? "GET", path, seen);
    if (kept !== undefined) cookie = kept;

    return seen;
  };
}

const asJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("the demo signs in with no Set-Cookie in the exchange", async () => {
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

test("signing out of the demo puts the cookie back to nothing", async () => {
  const call = browser(database());
  await call("/api/session", asJson(DEMO_LOGIN));
  strictEqual((await call("/api/room")).status, 200);

  await call("/api/session", { method: "DELETE" });
  // The router signs out by sending an empty cookie — the same header the
  // browser will not carry — so this is handled by method, not by reading it.
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
