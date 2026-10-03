// What a query in this codebase talks to — never D1 by name, so the same
// queries run on D1, on a SQLite file and on SQLite in a browser.
//
// DESIGN.md, "One schema, three places to run it".

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/**
 * Any of drizzle's SQLite databases.
 *
 * `any` for the result kinds on purpose: D1 is async, sql.js is sync, and
 * pinning either one shuts out the other.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = BaseSQLiteDatabase<"async" | "sync", any, any>;
