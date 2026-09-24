// Builds public/demo.sqlite: the whole shop in one file, for the browser.
//
// The demo runs the real queries against SQLite compiled to WebAssembly, so
// it needs a database. Shipping the seed as SQL and building it in the
// visitor's browser would work and would take several seconds; shipping the
// built file takes one request.
//
// **A shorter period than the live instance.** Three months is 3,400
// bookings and a file measured in megabytes, which is a lot to send somebody
// who clicked a link out of curiosity. Five weeks is enough to show a busy
// calendar, a guest who reschedules, and a month of takings.
//
//   node scripts/build-demo-db.ts

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";

const FROM = "2026-08-24";
const TO = "2026-09-30";

const OUT = new URL("../public/demo.sqlite", import.meta.url);
const WORK = new URL("../public/.demo-build.sqlite", import.meta.url);

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
rmSync(WORK, { force: true });

const db = new DatabaseSync(WORK.pathname.replace(/^\//, ""));
db.exec("PRAGMA foreign_keys = ON");

for (const file of ["migrations/0000_initial_schema.sql", "migrations/0001_booking_events.sql"]) {
  for (const statement of readFileSync(file, "utf8").split("--> statement-breakpoint")) {
    if (statement.trim() !== "") db.exec(statement);
  }
}

// The same files the live instance is seeded from. No second copy of the
// sample to keep in step.
for (const file of [
  "seed/demo.sql",
  "seed/holidays.sql",
  "seed/demo-clear.sql",
  "seed/demo-customers.sql",
  "seed/demo-bookings.sql",
  "seed/demo-items.sql",
  "seed/demo-events.sql",
  "seed/demo-payments.sql",
]) {
  db.exec(readFileSync(file, "utf8"));
}

const before = db.prepare("SELECT count(*) AS n FROM bookings").get() as { n: number };

// Trim to the window. The order matters: the children go before the parents,
// because the references that have no cascade are there on purpose.
db.exec(`
  DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE date < '${FROM}' OR date > '${TO}');
  DELETE FROM booking_events WHERE booking_id IN (SELECT id FROM bookings WHERE date < '${FROM}' OR date > '${TO}');
  DELETE FROM booking_items WHERE booking_id IN (SELECT id FROM bookings WHERE date < '${FROM}' OR date > '${TO}');
  UPDATE records SET booking_id = NULL WHERE booking_id IN (SELECT id FROM bookings WHERE date < '${FROM}' OR date > '${TO}');
  DELETE FROM bookings WHERE date < '${FROM}' OR date > '${TO}';
`);

// Guests nobody in the window ever booked. Keeping them would put three
// hundred names in a search that can only ever show five weeks of visits.
db.exec(`
  DELETE FROM customers
   WHERE id >= 101
     AND id NOT IN (SELECT customer_id FROM bookings WHERE customer_id IS NOT NULL);
`);

// Holidays outside a couple of years either side: 927 rows to look up three.
db.exec("DELETE FROM holidays WHERE date < '2026-01-01' OR date > '2027-12-31';");

const after = db.prepare("SELECT count(*) AS n FROM bookings").get() as { n: number };
const people = db.prepare("SELECT count(*) AS n FROM customers").get() as { n: number };

// Reclaim the space the deletes left, or the file ships at its full size
// with holes in it.
db.exec("VACUUM");
db.close();

const bytes = statSync(WORK.pathname.replace(/^\//, "")).size;
writeFileSync(OUT, readFileSync(WORK));
rmSync(WORK, { force: true });

// SQLite itself, beside the page rather than from a CDN: one origin, no
// third party, and it still works where that CDN is blocked — which, for a
// page aimed partly at readers in the mainland, is not hypothetical.
//
// Copied at build time rather than committed. It is a file from
// node_modules; keeping a second copy in the repository means the two can
// disagree about which version is being shipped.
const wasm = new URL("../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
writeFileSync(new URL("../public/sql-wasm.wasm", import.meta.url), readFileSync(wasm));

console.log(
  `public/demo.sqlite: ${after.n} bookings (from ${before.n}), ${people.n} guests, ` +
    `${(bytes / 1024).toFixed(0)}KB, ${FROM} to ${TO}` +
    ` (+ sql-wasm.wasm, ${(statSync(wasm).size / 1024).toFixed(0)}KB)`,
);
