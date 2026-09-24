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

import type { Database } from "../db/database.ts";

/** Where the built database sits. Produced by scripts/build-demo-db.ts. */
const DB_FILE = "/demo.sqlite";

let ready: Promise<Database> | null = null;
let realFetch: typeof fetch | null = null;

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
      return await route(db, request, "demo");
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

  const bytes = new Uint8Array(await response.arrayBuffer());
  const raw = new SQL.Database(bytes);

  // Foreign keys are off by default in SQLite and the schema leans on them:
  // cancelling relies on cascades, and the references without one are there
  // to stop a delete rather than to follow it.
  raw.run("PRAGMA foreign_keys = ON");

  onProgress?.("ready");
  return drizzle(raw) as unknown as Database;
}
