// Builds the prebuilt SQLite file the browser demo loads (one request instead of
// seeding in the browser). Covers five weeks, not the live three months, to keep it small.
//
//   node scripts/build-demo-db.ts

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync, rmSync } from "node:fs";
// Use fileURLToPath, not URL.pathname: the pathname is wrong on Windows ("/C:/...").
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

// All migrations in order, so a new one is never missed.
const migrations = readdirSync("migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort();

for (const name of migrations) {
  for (const statement of readFileSync(`migrations/${name}`, "utf8").split(
    "--> statement-breakpoint",
  )) {
    if (statement.trim() !== "") db.exec(statement);
  }
}

// Same seed files as the live instance.
for (const file of [
  "seed/demo.sql",
  "seed/holidays.sql",
  // The demo signs in for real, so it needs accounts.
  "seed/logins.sql",
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

// Trim to the window. Children first: some references deliberately have no cascade.
db.exec(`
  DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE date < '${FROM}' OR date > '${TO}');
  DELETE FROM booking_events WHERE booking_id IN (SELECT id FROM bookings WHERE date < '${FROM}' OR date > '${TO}');
  DELETE FROM booking_items WHERE booking_id IN (SELECT id FROM bookings WHERE date < '${FROM}' OR date > '${TO}');
  UPDATE records SET booking_id = NULL WHERE booking_id IN (SELECT id FROM bookings WHERE date < '${FROM}' OR date > '${TO}');
  DELETE FROM bookings WHERE date < '${FROM}' OR date > '${TO}';
`);

// Drop sample guests with no booking in the window.
db.exec(`
  DELETE FROM customers
   WHERE id >= 101
     AND id NOT IN (SELECT customer_id FROM bookings WHERE customer_id IS NOT NULL);
`);

// Keep only 2026-2027 holidays.
db.exec("DELETE FROM holidays WHERE date < '2026-01-01' OR date > '2027-12-31';");

const after = db.prepare("SELECT count(*) AS n FROM bookings").get() as { n: number };
const people = db.prepare("SELECT count(*) AS n FROM customers").get() as { n: number };

// Reclaim the space freed by the deletes.
db.exec("VACUUM");
db.close();

const bytes = statSync(fileURLToPath(WORK)).size;

// Gzipped here and unpacked in the browser: Cloudflare does not compress .sqlite
// by content type. Gzip cuts it by about two thirds.
const packed = gzipSync(readFileSync(WORK), { level: 9 });
writeFileSync(OUT, packed);
rmSync(WORK, { force: true });

// Serve the wasm from the same origin, not a CDN (CDNs can be blocked in mainland China).
// The browser build of sql.js asks for `sql-wasm-browser.wasm`, not `sql-wasm.wasm`.
// Copied from node_modules at build time; scripts/check-demo-assets.ts checks the name.
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
