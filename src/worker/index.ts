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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await route(drizzle(env.DB), request, env.BUILD);
  },
} satisfies ExportedHandler<Env>;
