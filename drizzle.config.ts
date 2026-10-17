// Generates SQL under migrations/ from src/db/schema.ts. Run by hand; the output is
// committed and shared by Cloudflare (`wrangler d1 migrations apply`), on-premise and browser builds.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  // No Drizzle journal: wrangler already tracks applied migrations.
  migrations: { prefix: "index" },
});
