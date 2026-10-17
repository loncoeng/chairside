// Database type for all queries. Never names D1, so the same queries run on D1,
// a SQLite file and sql.js in the browser. See DESIGN.md.

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/** Any drizzle SQLite database. `any` because D1 is async and sql.js is sync. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = BaseSQLiteDatabase<"async" | "sync", any, any>;
