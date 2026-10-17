// Worker entry, and the only file that names D1. See DESIGN.md, "One schema,
// three places to run it"; src/db/portable.test.ts runs the same queries on sql.js.

import { drizzle } from "drizzle-orm/d1";

import { route } from "./router.ts";

/** Secrets are not in wrangler.toml, so `wrangler types` does not generate them. */
type Secrets = { SESSION_SECRET?: string };

export default {
  async fetch(request: Request, env: Env & Secrets): Promise<Response> {
    return await route(drizzle(env.DB), request, env.BUILD, env.SESSION_SECRET);
  },
} satisfies ExportedHandler<Env>;
