// Renders the real app in happy-dom and clicks through the demo, to cover the
// screen-to-API wiring. Only the network is faked: the real router over a database with no logins.

import { ok, strictEqual } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { Window } from "happy-dom";
import { drizzle } from "drizzle-orm/sql-js";

import { route } from "../worker/router.ts";
import { TEXT } from "./i18n.ts";
import { migrated } from "../db/test-database.ts";

/** Japanese strings from the dictionary. */
const JA = {
  demoOpen: TEXT.demoOpen.ja,
  demoLeave: TEXT.demoLeave.ja,
  roomFailed: TEXT.roomFailed.ja,
  dayFailed: TEXT.dayFailed.ja,
};

const SERVER_SECRET = "the-server-secret-for-these-tests";

/**
 * Built by `npm run demo:db` (run by `npm test`). Checked up front so a missing
 * file fails with a clear message instead of "still on the first screen".
 */
const NEEDED = ["public/demo.sqlite.gz", "public/sql-wasm-browser.wasm"];
const missing = NEEDED.filter((file) => !existsSync(file));

/** Like the live instance: schema and shop rows, no logins (see seed/demo-no-logins.sql). */
function server() {
  const raw = migrated();
  raw.run(`
    INSERT INTO seats (id, name, kind, active, sort_order) VALUES (1, 'A1', 'styling', 1, 1);
    INSERT INTO staff (id, name, role, grade, color) VALUES (1, 'Aoi', 'owner', 'owner', '#B4553F');
  `);
  return drizzle(raw);
}

/**
 * DOM globals from happy-dom on globalThis. Request, Response, Headers and fetch
 * stay as Node's so the test does not exercise another implementation.
 */
function browser() {
  const window = new Window({ url: "https://demo.invalid/" });
  const dom = window as unknown as Record<string, unknown>;

  const names = [
    "window",
    "document",
    "navigator",
    "location",
    "localStorage",
    "sessionStorage",
    "HTMLElement",
    "Element",
    "Node",
    "Text",
    "Event",
    "CustomEvent",
    "MouseEvent",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "getComputedStyle",
    "DOMParser",
  ];
  // defineProperty: some are getter-only on Node's global (navigator), so assignment throws.
  const restore: [string, PropertyDescriptor | undefined][] = [];
  for (const name of names) {
    restore.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    try {
      Object.defineProperty(globalThis, name, {
        value: dom[name],
        writable: true,
        configurable: true,
      });
    } catch {
      // Not every name exists in every Node version.
    }
  }

  // happy-dom reports an English locale; the assertions use Japanese.
  (dom.localStorage as Storage).setItem("chairside.lang", "ja");

  const db = server();
  const asked: string[] = [];

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      String(input instanceof Request ? input.url : input),
      "https://demo.invalid/",
    );
    asked.push(
      `${(input instanceof Request ? input.method : init?.method) ?? "GET"} ${url.pathname}`,
    );

    // Static files from public/, the same bytes the Worker serves.
    if (!url.pathname.startsWith("/api/")) {
      const onDisk = `public${url.pathname}`;
      try {
        const bytes = readFileSync(onDisk);
        return new Response(bytes, { status: 200 });
      } catch {
        return new Response("not found", { status: 404 });
      }
    }

    // A page cannot set Cookie on a Request it builds, so none may arrive here.
    const request = input instanceof Request ? input : new Request(url, init);
    ok(request.headers.get("cookie") === null, "a page cannot send a Cookie header");
    return await route(db, request, "test", SERVER_SECRET);
  }) as typeof fetch;

  return {
    window,
    asked,
    done() {
      globalThis.fetch = previousFetch;
      for (const [name, was] of restore) {
        if (was) Object.defineProperty(globalThis, name, was);
        else delete (globalThis as Record<string, unknown>)[name];
      }
      window.happyDOM.close();
    },
  };
}

/** Let effects run and their promises land. */
async function settle(times = 40): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 5));
}

/** Poll until `ready()` or time out. Fixed tick counts were too short on CI (WASM load). */
async function waitFor(what: string, ready: () => boolean, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (ready()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`${what} — after ${ms}ms the page read: ${text().slice(0, 400)}`);
}

const text = (): string =>
  (globalThis as unknown as { document: Document }).document.body.textContent ?? "";

function button(label: string): HTMLElement | null {
  const doc = (globalThis as unknown as { document: Document }).document;
  for (const node of Array.from(doc.querySelectorAll("button"))) {
    if ((node.textContent ?? "").includes(label)) return node as HTMLElement;
  }
  return null;
}

test("a visitor lands on the first screen, opens the demo, and stays in it", async () => {
  ok(missing.length === 0, `run \`npm run demo:db\` first — missing: ${missing.join(", ")}`);

  const web = browser();
  try {
    const { h, render } = await import("preact");
    const { App } = await import("./app.tsx");
    const root = web.window.document.createElement("div");
    web.window.document.body.appendChild(root);

    render(h(App, null), root as never);

    // No accounts, so the sign-in screen.
    await waitFor("the first screen never appeared", () => text().includes(JA.demoOpen));
    ok(web.asked.includes("GET /api/session"), "the app never asked who was signed in");

    const open = button(JA.demoOpen);
    ok(open !== null, "there is no button to open the demo");
    open.click();

    // Engine, database and sign-in. The exit button exists only once signed in.
    // 60s because CI is slow; later waits use the default.
    await waitFor(
      "the demo never opened",
      () => !text().includes(JA.demoOpen) && text().includes(JA.demoLeave),
      60_000,
    );

    // Must stay signed in: a stale pre-session check must not sign the visitor out.
    // This catches the ordering bug. Removing the `aborted` guard on the session
    // check's success path alone does not fail it, since that request no longer goes out.
    await settle(80);
    ok(!text().includes(JA.demoOpen), "the demo signed the visitor back out");

    // The room summary needs /api/room, which requires a session. Checked in the
    // page because startDemo now owns fetch. Not the seat columns: on Mondays
    // (closed) the grid draws no headers. Japanese only; browser() pins it.
    await waitFor("the room never loaded", () => /セット面\s*\d+\s*台/.test(text()));
    const page = text();
    ok(!page.includes(JA.roomFailed), `the room failed to load: ${page.slice(0, 300)}`);
    ok(!page.includes(JA.dayFailed), `the day failed to load: ${page.slice(0, 300)}`);

    // Leaving returns to the sign-in screen.
    const leave = button(JA.demoLeave);
    ok(leave !== null, "there is no way out of the demo");
    leave.click();
    await waitFor("leaving the demo did not go back", () => text().includes(JA.demoOpen));
  } finally {
    web.done();
  }
});

test("nothing is asked of the API before somebody is signed in", async () => {
  ok(missing.length === 0, `run \`npm run demo:db\` first — missing: ${missing.join(", ")}`);

  // Requests sent before sign-in get 401 and are never retried.
  const web = browser();
  try {
    const { h, render } = await import("preact");
    const { App } = await import("./app.tsx");
    const root = web.window.document.createElement("div");
    web.window.document.body.appendChild(root);

    render(h(App, null), root as never);
    await settle();

    strictEqual(
      web.asked.filter((one) => one !== "GET /api/session").length,
      0,
      `asked for data with nobody signed in: ${web.asked.join(", ")}`,
    );
  } finally {
    web.done();
  }
});
