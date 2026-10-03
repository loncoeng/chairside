// The demo: the whole shop, running inside the visitor's browser.
//
// SQLite is compiled to WebAssembly, the database arrives as one file, and
// the API answers from memory — the same router, the same queries, the same
// rules. Nothing is a second implementation, which is the only way a demo
// stays true to the thing it demonstrates.
//
// What that buys:
//
//   It costs nothing to run.       No requests reach Cloudflare at all.
//   Nobody can spoil it.           Every visitor has their own copy.
//   Taking a booking really works. The rules fire, because they are the
//                                  rules — not a script pretending.
//
// Everything here loads on demand. A shop using this for real never fetches
// any of it, and neither does a visitor who does not ask.

import { todayInShop } from "./types.ts";
import type { Database } from "../db/database.ts";

/**
 * Where the built database sits. Produced by scripts/build-demo-db.ts.
 *
 * Compressed, because Cloudflare compresses by content type and does not
 * know what a .sqlite is — it went over the wire at its full 640KB. Unpacked
 * here with DecompressionStream, which every browser this app already needs
 * has had for years.
 */
const DB_FILE = "/demo.sqlite.gz";

let ready: Promise<Database> | null = null;
let realFetch: typeof fetch | null = null;

/**
 * The session token, carried by hand — and nowhere near a header.
 *
 * Cookies do not work here in either direction, and both directions cost a
 * release to learn.
 *
 * **A page cannot put `Set-Cookie` on a Response it constructs.** The name is
 * forbidden on response-guarded headers, so the browser drops it at
 * construction without saying anything.
 *
 * **A page cannot put `Cookie` on a Request it constructs either.** That name
 * is forbidden too. The demo signed in, minted a token, set it on the next
 * request — and the browser quietly removed it, so everything after the
 * sign-in came back 401 and the app returned to the sign-in screen.
 *
 * Node does both. Every test passed. Both times.
 *
 * So the token is kept here as a plain string and handed to route() as an
 * argument. read() still checks the signature and the expiry, which is the
 * part that matters; what is skipped is a browser rule about two header
 * names, not the session.
 */
let demoToken: string | null = null;

/** The account the demo signs in with. Invented, and printed on the screen. */
export const DEMO_LOGIN = { loginId: "aoi", password: "chairside-demo" };

/**
 * The demo's signing secret.
 *
 * In the page, in plain sight, and that is correct: the database it protects
 * is invented and lives in this browser. Forging a token here grants access
 * to a copy of nothing, belonging to the person doing the forging.
 */
const DEMO_SECRET = "demo-only-secret";

/** A day is this many seconds; the file stores times in seconds, not milliseconds. */
const DAY = 86_400;

const asDate = (text: string): number => Date.parse(`${text}T00:00:00Z`);

/**
 * How far to move the sample so that the visitor's own today is a working day.
 *
 * **Always a whole number of weeks.** The shop closes on Mondays, and the
 * sample has no bookings on one. Move it by three days and a Tuesday's work
 * lands on the closed day, Wednesdays go quiet, and every rule about how busy
 * a Saturday is becomes nonsense. A multiple of seven keeps the week's shape
 * exactly as it was generated.
 *
 * The target is a week past today rather than today itself, so the calendar
 * opens with something still to come as well as a month behind it — a salon
 * with no future bookings is a salon in trouble, which is not what this is
 * meant to show.
 *
 * Returns 0 when the sample is already far enough ahead. It never moves
 * anything backwards: a demo built this morning should be left alone.
 */
export function weeksToShift(lastDay: string, today: string): number {
  const behind = (asDate(today) - asDate(lastDay)) / (DAY * 1000) + 7;
  if (behind <= 0) return 0;
  return Math.ceil(behind / 7) * 7;
}

/**
 * Move the sample forward, in place.
 *
 * The file is built once and the world keeps going. A demo opened a month
 * later opened on an empty calendar, which reads as "this does not work"
 * rather than "this data is from September". Everything moves together, so
 * who comes back, who cancels late and what each visit cost are all still the
 * same rows — nothing is regenerated and no rule is re-run.
 *
 * **Holidays do not move.** They are real days in a real calendar: 國慶日 is
 * the first of October whatever this demo does.
 */
export function moveToNow(raw: {
  run: (sql: string) => void;
  exec: (sql: string) => { values: unknown[][] }[];
}): void {
  const found = raw.exec("SELECT max(date) FROM bookings")[0]?.values[0]?.[0];
  if (typeof found !== "string") return;

  const days = weeksToShift(found, todayInShop());
  if (days === 0) return;

  const seconds = days * DAY;
  // date(x, '+N days') leaves NULL alone, which is what a guest with no first
  // visit on file and a member of staff who has not left both need.
  raw.run(`
    UPDATE bookings SET date = date(date, '+${days} days'), created_at = created_at + ${seconds};
    UPDATE booking_events SET at = at + ${seconds};
    UPDATE payments SET paid_at = paid_at + ${seconds};
    UPDATE records SET recorded_on = date(recorded_on, '+${days} days'), created_at = created_at + ${seconds};
    UPDATE customers SET first_visit_on = date(first_visit_on, '+${days} days'), created_at = created_at + ${seconds};
    UPDATE closures SET date = date(date, '+${days} days');
    UPDATE staff SET joined_on = date(joined_on, '+${days} days'), left_on = date(left_on, '+${days} days');
  `);
}

/**
 * What the demo's cookie should be after this exchange, or undefined to leave
 * it as it was.
 *
 * Separate from the shim and exported so it can be tested, because the bug it
 * exists for cannot be reproduced in Node: the browser drops `Set-Cookie`
 * from a Response the page built, and Node does not. A test that read the
 * header would pass here and fail there — which is what happened. So nothing
 * here reads that header at all, and src/ui/demo.test.ts proves the demo
 * signs in with no `Set-Cookie` anywhere in the exchange.
 *
 * The token is signed with the same issue() the router uses, and every later
 * request is still checked by the real read(). What is stepped around is a
 * browser rule about one header, not the session.
 */
export async function keepSession(
  method: string,
  pathname: string,
  response: Response,
): Promise<string | null | undefined> {
  if (pathname !== "/api/session") return undefined;

  // Signing out. The router clears the cookie by sending an empty one, which
  // is the same header the browser will not let it send.
  if (method === "DELETE") return null;
  if (method !== "POST") return undefined;
  if (!response.ok) return undefined;

  const { issue } = await import("../db/session.ts");
  const reply = (await response.clone().json()) as {
    staff?: { id?: unknown; role?: unknown };
  };

  const id = reply.staff?.id;
  const role = reply.staff?.role;
  if (typeof id !== "number" || typeof role !== "string") return null;

  // The token itself, not a cookie line. Nothing here ever becomes a header.
  return await issue(DEMO_SECRET, id, role);
}

/**
 * Load SQLite, load the shop, and answer the API from here on.
 *
 * Idempotent: turning the demo on twice does not load it twice, and the
 * original fetch is kept so it can be handed back.
 */
export async function startDemo(onProgress?: (what: string) => void): Promise<void> {
  if (ready === null) {
    ready = build(onProgress);
  }
  const db = await ready;

  if (realFetch === null) {
    realFetch = globalThis.fetch.bind(globalThis);

    // The screens call fetch("/api/..."). Rather than threading a data source
    // through every component, the demo answers those calls where they are
    // made — so no screen has to know which mode it is in.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(new URL(String(input), location.origin), init);
      const { pathname } = new URL(request.url);

      if (!pathname.startsWith("/api/")) {
        return realFetch!(input as RequestInfo, init);
      }

      const { route } = await import("../worker/router.ts");

      // The request goes through untouched, and the session is handed over
      // beside it. Setting a Cookie header here is what the browser refuses.
      const response = await route(db, request, "demo", DEMO_SECRET, demoToken);

      const kept = await keepSession(request.method, pathname, response);
      if (kept !== undefined) demoToken = kept;

      return response;
    }) as typeof fetch;
  }
}

/** Hand the network back. Used when the demo is switched off. */
export function stopDemo(): void {
  if (realFetch !== null) {
    globalThis.fetch = realFetch;
    realFetch = null;
  }
}

async function build(onProgress?: (what: string) => void): Promise<Database> {
  onProgress?.("engine");

  // Both of these are dynamic so they land in their own chunk. Together they
  // are about half a megabyte over the wire, and somebody who only wants to
  // read the calendar should not pay for it.
  const [{ default: initSqlJs }, { drizzle }] = await Promise.all([
    import("sql.js"),
    import("drizzle-orm/sql-js"),
  ]);

  const SQL = await initSqlJs({
    // Served beside the page rather than from a CDN: one origin, no third
    // party, and it still works if that CDN is blocked — which, for a page
    // aimed partly at readers in the mainland, is not hypothetical.
    locateFile: (file: string) => `/${file}`,
  });

  onProgress?.("data");
  const response = await (realFetch ?? fetch)(DB_FILE);
  if (!response.ok) throw new Error(`${DB_FILE}: HTTP ${response.status}`);

  const unpacked = response.body?.pipeThrough(new DecompressionStream("gzip"));
  if (!unpacked) throw new Error("the demo database did not arrive");

  const bytes = new Uint8Array(await new Response(unpacked).arrayBuffer());
  const raw = new SQL.Database(bytes);

  // Foreign keys are off by default in SQLite and the schema leans on them:
  // cancelling relies on cascades, and the references without one are there
  // to stop a delete rather than to follow it.
  raw.run("PRAGMA foreign_keys = ON");

  // Today should be a working day, however long ago this file was built.
  moveToNow(raw);

  onProgress?.("ready");
  return drizzle(raw) as unknown as Database;
}
