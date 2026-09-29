// The app, driven the way a visitor drives it.
//
// Two bugs got past everything else because everything else tested pieces. The
// demo could not sign in, and then it signed in and was thrown straight back
// out — both of them in the wiring between the screen and the API, which no
// test touched. The deploy was green for both.
//
// So this one mounts the real component tree in a DOM, serves the real demo
// database and the real WebAssembly off disk, and presses the button. The
// only thing it stands in for is the network: `/api/*` is answered by the
// real router over a database with no accounts in it, which is what the live
// instance is.

import { ok, strictEqual } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { Window } from "happy-dom";
import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";

import { route } from "../worker/router.ts";
import { TEXT } from "./i18n.ts";

/** The Japanese column of the dictionary, so no wording is typed twice. */
const JA = {
  demoOpen: TEXT.demoOpen.ja,
  demoLeave: TEXT.demoLeave.ja,
  roomFailed: TEXT.roomFailed.ja,
  dayFailed: TEXT.dayFailed.ja,
};

const SQL = await initSqlJs();
const SERVER_SECRET = "the-server-secret-for-these-tests";

/**
 * The live instance: the schema, the shop's own rows, and no logins at all.
 *
 * seed/logins.sql is deliberately left out, because the deploy leaves it out —
 * see seed/demo-no-logins.sql. Nobody can sign in here, and the first screen
 * is what a visitor gets.
 */
function server() {
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
  return drizzle(raw);
}

/**
 * A browser, near enough.
 *
 * The DOM globals go on globalThis so Preact can render into them. Request,
 * Response, Headers and fetch are left as Node's: the demo builds Requests and
 * reads Responses, and swapping those for another implementation would be
 * testing that implementation.
 */
function browser() {
  const window = new Window({ url: "https://demo.invalid/" });
  const dom = window as unknown as Record<string, unknown>;

  const names = [
    "window", "document", "navigator", "location", "localStorage", "sessionStorage",
    "HTMLElement", "Element", "Node", "Text", "Event", "CustomEvent", "MouseEvent",
    "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "DOMParser",
  ];
  // defineProperty rather than assignment: some of these are getter-only on
  // Node's global (navigator is), and a plain assignment throws.
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
      // Not every name exists in every Node; the ones the app needs do.
    }
  }

  // Pinned, because happy-dom reports an English locale and the assertions
  // below would then be checking a different column of the dictionary than
  // the one they name.
  (dom["localStorage"] as Storage).setItem("chairside.lang", "ja");

  const db = server();
  const asked: string[] = [];

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input), "https://demo.invalid/");
    asked.push(`${(input instanceof Request ? input.method : init?.method) ?? "GET"} ${url.pathname}`);

    // The files the demo asks for, straight off disk — the same bytes the
    // Worker serves, including the gzip the page unpacks itself.
    if (!url.pathname.startsWith("/api/")) {
      const onDisk = `public${url.pathname}`;
      try {
        const bytes = readFileSync(onDisk);
        return new Response(bytes, { status: 200 });
      } catch {
        return new Response("not found", { status: 404 });
      }
    }

    const request = input instanceof Request ? input : new Request(url, init);
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

const text = (): string => (globalThis as unknown as { document: Document }).document.body.textContent ?? "";

function button(label: string): HTMLElement | null {
  const doc = (globalThis as unknown as { document: Document }).document;
  for (const node of Array.from(doc.querySelectorAll("button"))) {
    if ((node.textContent ?? "").includes(label)) return node as HTMLElement;
  }
  return null;
}

test("a visitor lands on the first screen, opens the demo, and stays in it", async () => {
  const web = browser();
  try {
    const { h, render } = await import("preact");
    const { App } = await import("./app.tsx");
    const root = web.window.document.createElement("div");
    web.window.document.body.appendChild(root);

    render(h(App, null), root as never);
    await settle();

    // The live instance has no accounts, so this is what anybody gets.
    ok(text().includes(JA.demoOpen), `no invitation on the first screen: ${text().slice(0, 200)}`);
    ok(web.asked.includes("GET /api/session"), "the app never asked who was signed in");

    const open = button(JA.demoOpen);
    ok(open !== null, "there is no button to open the demo");
    open.click();

    // Loading the engine, the database and signing in.
    await settle(120);

    // The booking screen. "予約" is the navigation; the calendar's own
    // furniture is what says the day actually loaded.
    ok(!text().includes(JA.demoOpen), "still on the first screen");
    ok(text().includes(JA.demoLeave), `the way out is missing: ${text().slice(0, 300)}`);

    // And it stays. The bug this is really for signed the visitor back out a
    // moment later, when a check sent before there was a session came back.
    //
    // What this catches is the ordering: data asked for before anybody had
    // signed in, and a demo switched on before it had a session. The guard on
    // the session check's success path is belt as well as braces — removing it
    // on its own does not fail this test, because the request it protects
    // against no longer goes out.
    await settle(80);
    ok(!text().includes(JA.demoOpen), "the demo signed the visitor back out");

    // The calendar's own contents, which is the proof that the data was
    // fetched with a session and not before. The seat columns come from
    // /api/room and the day from /api/day, and both are refused to a visitor
    // with no session — so their being here is the whole thing working.
    //
    // Checked in the page rather than in the recorder above, because by now
    // startDemo has taken over fetch: /api/* no longer reaches the recorder,
    // which is exactly what the demo is for.
    const page = text();
    ok(page.includes("A1"), `the seat columns are missing: ${page.slice(0, 300)}`);
    ok(!page.includes(JA.roomFailed), `the room failed to load: ${page.slice(0, 300)}`);
    ok(!page.includes(JA.dayFailed), `the day failed to load: ${page.slice(0, 300)}`);

    // And the way out puts the visitor back where they started. The header
    // button is only ever a way out now, because the demo is opened from the
    // first screen and a shop running this for real should not have a button
    // that swaps its database for an invented one.
    const leave = button(JA.demoLeave);
    ok(leave !== null, "there is no way out of the demo");
    leave.click();
    await settle();
    ok(text().includes(JA.demoOpen), `leaving the demo did not go back: ${text().slice(0, 200)}`);
  } finally {
    web.done();
  }
});

test("nothing is asked of the API before somebody is signed in", async () => {
  // Every one of these came back 401 on the first screen and was never asked
  // for again, which left the calendar broken after a successful sign-in.
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
