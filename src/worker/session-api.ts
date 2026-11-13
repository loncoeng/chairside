// Sign in/out. Issues a signed cookie token (staff id + role, 12 hours); later
// requests trust the token without a DB lookup.

import { and, eq, isNull } from "drizzle-orm";

import { staff } from "../db/schema.ts";
import { checkPassword, clearCookie, issue, setCookie } from "../db/session.ts";
import type { Database as Db } from "../db/database.ts";
import { json, fail } from "./http.ts";

/**
 * Failed sign-ins allowed per IP per window. In-memory per isolate, so not a
 * global limit (that would need a Durable Object); it stops a word list run
 * against one instance.
 */
const ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();

function tooMany(who: string): boolean {
  const now = Date.now();
  const tries = (recent.get(who) ?? []).filter((at) => now - at < WINDOW_MS);
  // Delete empty entries so a long-lived isolate doesn't keep every IP.
  if (tries.length === 0) recent.delete(who);
  else recent.set(who, tries);
  return tries.length >= ATTEMPTS;
}

function record(who: string): void {
  const tries = recent.get(who) ?? [];
  tries.push(Date.now());
  recent.set(who, tries);
}

export async function signIn(
  db: Db,
  request: Request,
  secret: string | undefined,
): Promise<Response> {
  // No secret: refuse sign-in rather than issue forgeable tokens.
  if (!secret) {
    return fail(503, "not-configured", "The server is not set up yet.");
  }

  const who = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (tooMany(who)) {
    return json(
      {
        ok: false,
        code: "too-many-attempts",
        error: "Too many attempts. Wait a while and try again.",
      },
      429,
    );
  }

  const body = (await request.json().catch(() => null)) as {
    loginId?: unknown;
    password?: unknown;
  } | null;

  const loginId = typeof body?.loginId === "string" ? body.loginId.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const [person] = await db
    .select({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      grade: staff.grade,
      passwordHash: staff.passwordHash,
    })
    .from(staff)
    // Staff who have left cannot sign in.
    .where(and(eq(staff.loginId, loginId), isNull(staff.leftOn)))
    .limit(1);

  const ok = await checkPassword(password, person?.passwordHash ?? null);

  // Same reply for unknown ID and wrong password.
  if (!person || !ok) {
    record(who);
    return fail(401, "wrong-credentials", "The ID or password is wrong.");
  }

  const token = await issue(secret, person.id, person.role);

  return json(
    {
      ok: true,
      staff: { id: person.id, name: person.name, role: person.role, grade: person.grade },
    },
    200,
    { "set-cookie": setCookie(token) },
  );
}

export function signOut(): Response {
  return json({ ok: true }, 200, { "set-cookie": clearCookie() });
}

/** The signed-in staff member. */
export async function whoAmI(db: Db, staffId: number): Promise<Response> {
  const [person] = await db
    .select({ id: staff.id, name: staff.name, role: staff.role, grade: staff.grade })
    .from(staff)
    .where(and(eq(staff.id, staffId), isNull(staff.leftOn)))
    .limit(1);

  return person
    ? json({ ok: true, staff: person })
    : fail(401, "staff-not-found", "That staff member was not found.");
}
