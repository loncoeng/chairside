// The Worker, and the only file here that names D1. It hands Cloudflare's
// database to the router and gets out of the way.
//
// DESIGN.md, "One schema, three places to run it". src/db/portable.test.ts
// runs the real queries on sql.js so that claim cannot rot quietly.

import { drizzle } from "drizzle-orm/d1";

import { route } from "./router.ts";

/**
 * The secret, which `wrangler types` cannot see because it is not in the
 * configuration file — that is the point of it being a secret.
 *
 * Declared here so the code that reads it is still type-checked.
 */
type Secrets = { SESSION_SECRET?: string };

export default {
  async fetch(request: Request, env: Env & Secrets): Promise<Response> {
    return await route(drizzle(env.DB), request, env.BUILD, env.SESSION_SECRET);
  },
} satisfies ExportedHandler<Env>;
