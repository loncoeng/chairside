// Browser demo: the real router and queries running on sql.js (SQLite in WASM),
// one private copy per visitor. Loaded on demand only.

import { todayInShop } from "./types.ts";
import type { Database } from "../db/database.ts";

/**
 * Built by scripts/build-demo-db.ts. Gzipped because Cloudflare does not
 * compress .sqlite (640KB otherwise); unpacked with DecompressionStream.
 */
const DB_FILE = "/demo.sqlite.gz";

let ready: Promise<Database> | null = null;
let realFetch: typeof fetch | null = null;

/**
 * Session token, passed to route() as an argument. `Cookie` and `Set-Cookie`
 * are forbidden headers: browsers drop them silently from a Request/Response
 * built in the page (Node does not). read() still checks signature and expiry.
 * See DESIGN.md, "Cookies do not work inside a page, in either direction".
 */
let demoToken: string | null = null;

/** Demo account. Invented and shown on screen. */
export const DEMO_LOGIN = { loginId: "aoi", password: "chairside-demo" };

/** Public on purpose: it only protects invented data in the visitor's own browser. */
const DEMO_SECRET = "demo-only-secret";

/** Seconds per day. The file stores timestamps in seconds, not milliseconds. */
const DAY = 86_400;

const asDate = (text: string): number => Date.parse(`${text}T00:00:00Z`);

/**
 * Days to shift the sample so it reaches a week past today. Always whole weeks:
 * the shop is closed on Mondays, so any other shift puts bookings on a closed
 * day. Returns 0 when the sample is already ahead (never shifts backwards).
 */
export function weeksToShift(lastDay: string, today: string): number {
  const behind = (asDate(today) - asDate(lastDay)) / (DAY * 1000) + 7;
  if (behind <= 0) return 0;
  return Math.ceil(behind / 7) * 7;
}

/**
 * Shift all sample dates forward in place so the calendar is not empty.
 * Rows move together; nothing is regenerated. Holidays are real dates and
 * do not move (國慶日 stays on October 1).
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
  // date(NULL, '+N days') stays NULL (no first visit, staff not left).
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
 * New demo token after this exchange: a token, null (signed out), or undefined
 * (unchanged). Never reads `Set-Cookie`, which browsers drop from page-built
 * Responses but Node keeps; demo.test.ts covers this. Signed with issue().
 */
export async function keepSession(
  method: string,
  pathname: string,
  response: Response,
): Promise<string | null | undefined> {
  if (pathname !== "/api/session") return undefined;

  // Sign-out. The router's empty Set-Cookie would be dropped by the browser.
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

  return await issue(DEMO_SECRET, id, role);
}

/** Load the demo and answer /api/* from it. Idempotent; keeps the real fetch for stopDemo(). */
export async function startDemo(onProgress?: (what: string) => void): Promise<void> {
  if (ready === null) {
    ready = build(onProgress);
  }
  const db = await ready;

  if (realFetch === null) {
    realFetch = globalThis.fetch.bind(globalThis);

    // Patch fetch so screens need no knowledge of demo mode.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(new URL(String(input), location.origin), init);
      const { pathname } = new URL(request.url);

      if (!pathname.startsWith("/api/")) {
        return realFetch!(input as RequestInfo, init);
      }

      const { route } = await import("../worker/router.ts");

      // Token goes as an argument: a Cookie header set here would be dropped.
      const response = await route(db, request, "demo", DEMO_SECRET, demoToken);

      const kept = await keepSession(request.method, pathname, response);
      if (kept !== undefined) demoToken = kept;

      return response;
    }) as typeof fetch;
  }
}

/** Restore the real fetch. */
export function stopDemo(): void {
  if (realFetch !== null) {
    globalThis.fetch = realFetch;
    realFetch = null;
  }
}

async function build(onProgress?: (what: string) => void): Promise<Database> {
  onProgress?.("engine");

  // Dynamic imports keep ~0.5MB out of the main bundle.
  const [{ default: initSqlJs }, { drizzle }] = await Promise.all([
    import("sql.js"),
    import("drizzle-orm/sql-js"),
  ]);

  const SQL = await initSqlJs({
    // Same origin instead of a CDN, which may be blocked in mainland China.
    locateFile: (file: string) => `/${file}`,
  });

  onProgress?.("data");
  const response = await (realFetch ?? fetch)(DB_FILE);
  if (!response.ok) throw new Error(`${DB_FILE}: HTTP ${response.status}`);

  const unpacked = response.body?.pipeThrough(new DecompressionStream("gzip"));
  if (!unpacked) throw new Error("the demo database did not arrive");

  const bytes = new Uint8Array(await new Response(unpacked).arrayBuffer());
  const raw = new SQL.Database(bytes);

  // Off by default in SQLite. Needed for cascades and to block deletes.
  raw.run("PRAGMA foreign_keys = ON");

  moveToNow(raw);

  onProgress?.("ready");
  return drizzle(raw) as unknown as Database;
}
