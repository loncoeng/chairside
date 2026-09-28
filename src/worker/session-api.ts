// Signing in and out.
//
// The password is checked against the row; the reply carries a signed token
// in a cookie and nothing else. No row is looked up again on later requests —
// the token says who and what role, and it lasts twelve hours.

import { and, eq, isNull } from "drizzle-orm";

import { staff } from "../db/schema.ts";
import { checkPassword, clearCookie, issue, setCookie } from "../db/session.ts";
import type { Database as Db } from "../db/database.ts";

/**
 * How many attempts one address gets, and over what.
 *
 * Held in the isolate, so it is per-instance rather than global — a
 * determined attacker spread across enough of Cloudflare's edge would get
 * more than five. It costs nothing and stops the obvious thing, which is
 * somebody running a word list at one Worker. A real limit would be a
 * Durable Object, and that is a decision for a shop that has been attacked
 * rather than one that has not.
 */
const ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();

function tooMany(who: string): boolean {
  const now = Date.now();
  const tries = (recent.get(who) ?? []).filter((at) => now - at < WINDOW_MS);
  // Dropped rather than left as an empty array. An isolate that answers for
  // hours would otherwise keep a key for every address that ever asked.
  if (tries.length === 0) recent.delete(who);
  else recent.set(who, tries);
  return tries.length >= ATTEMPTS;
}

function record(who: string): void {
  const tries = recent.get(who) ?? [];
  tries.push(Date.now());
  recent.set(who, tries);
}

export async function signIn(db: Db, request: Request, secret: string | undefined): Promise<Response> {
  // Without a secret nothing can be signed, so nothing is. Better a shop that
  // cannot sign in than one whose tokens anybody can mint.
  if (!secret) {
    return json({ ok: false, error: "サーバの設定が未完了です。" }, 503);
  }

  const who = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (tooMany(who)) {
    return json({ ok: false, error: "試行が多すぎます。しばらく待ってください。" }, 429);
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
    // Somebody who has left cannot sign in. The row stays — past bookings
    // point at it — but the door closes with the leaving date.
    .where(and(eq(staff.loginId, loginId), isNull(staff.leftOn)))
    .limit(1);

  const ok = await checkPassword(password, person?.passwordHash ?? null);

  // The same answer whether the name is wrong or the password is. Saying
  // which hands over half the pair.
  if (!person || !ok) {
    record(who);
    return json({ ok: false, error: "IDかパスワードが違います。" }, 401);
  }

  const token = await issue(secret, person.id, person.role);

  return new Response(
    JSON.stringify({
      ok: true,
      staff: { id: person.id, name: person.name, role: person.role, grade: person.grade },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": setCookie(token),
      },
    },
  );
}

export function signOut(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": clearCookie(),
    },
  });
}

/** Who is signed in, for a screen that has just loaded. */
export async function whoAmI(db: Db, staffId: number): Promise<Response> {
  const [person] = await db
    .select({ id: staff.id, name: staff.name, role: staff.role, grade: staff.grade })
    .from(staff)
    .where(and(eq(staff.id, staffId), isNull(staff.leftOn)))
    .limit(1);

  return person
    ? json({ ok: true, staff: person })
    : json({ ok: false, error: "その職員は見つかりません。" }, 401);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
