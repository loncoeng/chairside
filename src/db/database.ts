// What a query in this codebase talks to.
//
// Not D1. The same schema and the same queries are meant to run in three
// places — Cloudflare's D1, a SQLite file on a shop PC, and SQLite compiled
// to WebAssembly in a visitor's browser — and that claim is only true if the
// query code never names one of them.
//
// Drizzle's SQLite databases share a base class, so typing against it is
// enough. Each runtime hands one in; nothing below this line knows which.

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/**
 * Any of drizzle's SQLite databases.
 *
 * `any` for the result kinds on purpose: D1 returns async, sql.js returns
 * sync, and pinning either one here would shut out the other. What matters
 * is that the query builders are the same, which they are.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = BaseSQLiteDatabase<"async" | "sync", any, any>;
