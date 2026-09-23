// The API. Static files are served straight from the assets bundle; this
// handles /api/ and nothing else.
//
// Queries go through the same src/db/schema.ts that generated the tables, so
// a column renamed in the schema stops this from compiling rather than
// returning nulls at runtime.

import { drizzle } from "drizzle-orm/d1";
import { asc, isNull } from "drizzle-orm";
import { seats, staff } from "../db/schema.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/room") {
      return json(await room(env));
    }

    // Reached only for /api/*: run_worker_first in wrangler.toml sends
    // everything else to the static files without waking this up.
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/**
 * The shape of the room: which seats exist, and who is currently here.
 *
 * Staff who have left keep `left_on` set and drop out here, but stay in the
 * table — past bookings still point at them.
 */
async function room(env: Env) {
  const db = drizzle(env.DB);

  const [allSeats, present] = await Promise.all([
    db
      .select({ id: seats.id, name: seats.name, kind: seats.kind })
      .from(seats)
      .orderBy(asc(seats.sortOrder), asc(seats.id)),
    db
      .select({ id: staff.id, name: staff.name, role: staff.role, color: staff.color })
      .from(staff)
      .where(isNull(staff.leftOn))
      .orderBy(asc(staff.id)),
  ]);

  return { seats: allSeats, staff: present };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The data is read fresh on every load. A booking screen showing a
      // cached seat list is worse than a slightly slower one.
      "cache-control": "no-store",
    },
  });
}
