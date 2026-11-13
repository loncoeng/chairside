// Database type for all queries. Never names D1, so the same queries run on D1
// and on sql.js in the browser. See DESIGN.md.

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/** Any drizzle SQLite database. D1 is async and sql.js is sync, so the result types differ. */
// biome-ignore lint/suspicious/noExplicitAny: the two drivers share no narrower result type.
export type Database = BaseSQLiteDatabase<"async" | "sync", any, any>;
