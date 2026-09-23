// Turns src/db/schema.ts into SQL under migrations/.
//
// The generated files are committed. Cloudflare applies them with
// `wrangler d1 migrations apply`, and the on-premise and browser builds read
// the same files, so a schema change reaches all three from one place.
//
// This config is only ever run by hand, on a developer's machine. It holds no
// credentials: `wrangler` already knows which database to talk to.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  // Plain CREATE TABLE, no Drizzle-specific journal, because wrangler tracks
  // which migrations it has applied and would otherwise track it twice.
  migrations: { prefix: "index" },
});
