// The Worker.
//
// **The only file in the repository that names D1.** It takes the request,
// hands Cloudflare's database to the router, and gets out of the way.
//
// Everything the router calls is typed against ../db/database.ts — any of
// drizzle's SQLite databases — which is what lets the same code answer from a
// SQLite file on a shop PC and from SQLite compiled to WebAssembly in a
// visitor's browser. src/db/portable.test.ts runs those functions on sql.js
// so the claim cannot rot quietly.

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
