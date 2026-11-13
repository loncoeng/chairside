// For tests: an empty in-memory SQLite (sql.js, the demo's engine) with every
// migration applied, read from disk so a new one is never missed.

import { readdirSync, readFileSync } from "node:fs";

import type { Database as SqlJsDatabase } from "sql.js";
import initSqlJs from "sql.js";

const SQL = await initSqlJs();

const statements = readdirSync("migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .flatMap((name) => readFileSync(`migrations/${name}`, "utf8").split("--> statement-breakpoint"))
  .filter((statement) => statement.trim() !== "");

export function migrated(): SqlJsDatabase {
  const raw = new SQL.Database();
  // As the demo and D1 run: SQLite leaves foreign keys off unless asked.
  raw.run("PRAGMA foreign_keys = ON");
  for (const statement of statements) raw.run(statement);
  return raw;
}
