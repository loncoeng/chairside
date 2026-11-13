// All-or-nothing writes on both engines. D1 has no transaction a Worker can hold
// open across awaits; batch() is its transaction. sql.js has ordinary
// transactions and no batch(). Either way the statements land together or not
// at all, so a failure halfway cannot leave a booking with no treatments.

import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./database.ts";

type Statement = BatchItem<"sqlite"> & { all: () => unknown };

/**
 * Runs the statements as one unit and returns each one's rows, in order (an
 * insert with `.returning()` gives its new rows; anything else gives nothing
 * useful).
 */
export async function atomically(
  db: Database,
  statements: [Statement, ...Statement[]],
): Promise<unknown[]> {
  if ("batch" in db && typeof db.batch === "function") {
    return (await db.batch(statements)) as unknown[];
  }
  // sql.js runs synchronously, so nothing else can interleave between begin and commit.
  return db.transaction(() => statements.map((statement) => statement.all())) as unknown[];
}
