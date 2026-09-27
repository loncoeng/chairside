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
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync, rmSync } from "node:fs";
// A file URL's pathname is not a path. On Windows it is "/C:/Users/..." and
// stripping the leading slash happens to work; on Linux the same trick turns
// "/home/runner/..." into a relative path that does not exist. This has a
// function, and the function knows the difference.
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const FROM = "2026-08-24";
const TO = "2026-09-30";

const OUT = new URL("../public/demo.sqlite.gz", import.meta.url);
const WORK = new URL("../public/.demo-build.sqlite", import.meta.url);

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
rmSync(WORK, { force: true });

const db = new DatabaseSync(fileURLToPath(WORK));
db.exec("PRAGMA foreign_keys = ON");

// Every migration there is, in order. Naming them one by one meant this
// script silently built last month's schema the first time a migration was
// added, and the failure came out as "table staff has no column named grade"
// two steps later.
const migrations = readdirSync("migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort();

for (const name of migrations) {
  for (const statement of readFileSync(`migrations/${name}`, "utf8").split("--> statement-breakpoint")) {
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
  "seed/demo-customer-details.sql",
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

const bytes = statSync(fileURLToPath(WORK)).size;

// Shipped compressed, and unpacked in the browser.
//
// Cloudflare compresses by content type and does not know what a .sqlite is,
// so it went over the wire at its full 640KB. A database is mostly text and
// gives up two thirds of itself to gzip; sending it raw is 450KB of somebody
// else's bandwidth for nothing.
const packed = gzipSync(readFileSync(WORK), { level: 9 });
writeFileSync(OUT, packed);
rmSync(WORK, { force: true });

// SQLite itself, beside the page rather than from a CDN: one origin, no
// third party, and it still works where that CDN is blocked — which, for a
// page aimed partly at readers in the mainland, is not hypothetical.
//
// **Both names.** The bundler picks sql.js's browser build, and that build
// asks for `sql-wasm-browser.wasm` — not `sql-wasm.wasm`, which is what the
// Node build wants and what this script used to copy. The demo failed with
// nothing to show for it because the file it asked for was not there.
//
// Copied at build time rather than committed. They are files from
// node_modules; a second copy in the repository is a second version to
// disagree about.
// Only the browser one. scripts/check-demo-assets.ts reads the built bundle
// and fails if the name it asks for is not here, so this list cannot drift
// out of step again without the build saying so.
const wasmFiles = ["sql-wasm-browser.wasm"];
let wasmBytes = 0;

for (const name of wasmFiles) {
  const from = new URL(`../node_modules/sql.js/dist/${name}`, import.meta.url);
  writeFileSync(new URL(`../public/${name}`, import.meta.url), readFileSync(from));
  wasmBytes += statSync(from).size;
}

console.log(
  `public/demo.sqlite.gz: ${after.n} bookings (from ${before.n}), ${people.n} guests, ` +
    `${(bytes / 1024).toFixed(0)}KB → ${(packed.length / 1024).toFixed(0)}KB, ${FROM} to ${TO}` +
    ` (+ ${wasmFiles.length} wasm, ${(wasmBytes / 1024).toFixed(0)}KB)`,
);
