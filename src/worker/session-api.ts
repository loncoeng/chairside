// Sign in/out. Issues a signed cookie token (staff id, 12 hours). The token
// proves who somebody is; what they may do is read from the staff table on
// every request, so a demotion or a departure applies at once.

import { and, eq, gte, isNull, lt, or } from "drizzle-orm";

import type { Database as Db } from "../db/database.ts";
import { failedSignIns, staff } from "../db/schema.ts";
import type { Session } from "../db/session.ts";
import { checkPassword, clearCookie, issue, setCookie, usable } from "../db/session.ts";
import { fail, json } from "./http.ts";

/**
 * Failed sign-ins allowed per window, counted in the database so the limit is
 * the same on every Worker instance. Per address it stops a word list from one
 * machine; per login id it stops the same list spread across many.
 */
const PER_ADDRESS = 5;
const PER_LOGIN = 10;
const WINDOW_MS = 10 * 60 * 1000;

export async function signIn(
  db: Db,
  request: Request,
  secret: string | undefined,
): Promise<Response> {
  // No usable key: refuse sign-in rather than issue forgeable tokens.
  if (!usable(secret)) {
    return fail(503, "not-configured", "The server is not set up yet.");
  }

  const body = (await request.json().catch(() => null)) as {
    loginId?: unknown;
    password?: unknown;
  } | null;

  const loginId = typeof body?.loginId === "string" ? body.loginId.trim().slice(0, 100) : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const address = `ip:${request.headers.get("cf-connecting-ip") ?? "unknown"}`;
  const account = `id:${loginId.toLowerCase()}`;
  if (await tooMany(db, address, account)) {
    return fail(429, "too-many-attempts", "Too many attempts. Wait a while and try again.");
  }

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

  // Hashes even when nobody has that id, so the time taken gives nothing away.
  const ok = await checkPassword(password, person?.passwordHash ?? null);

  // Same reply for unknown ID and wrong password.
  if (!person || !ok) {
    await remember(db, address, account);
    return fail(401, "wrong-credentials", "The ID or password is wrong.");
  }

  const token = await issue(secret, person.id, person.role);
  const { passwordHash: _, ...who } = person;
  return json({ ok: true, staff: who }, 200, { "set-cookie": setCookie(token) });
}

export function signOut(): Response {
  return json({ ok: true }, 200, { "set-cookie": clearCookie() });
}

/**
 * The staff member a verified token belongs to, as the table has them now:
 * null if they have since left or were removed, and their current role rather
 * than the one written into the token.
 */
export async function present(db: Db, session: Session) {
  const [person] = await db
    .select({ id: staff.id, name: staff.name, role: staff.role, grade: staff.grade })
    .from(staff)
    .where(and(eq(staff.id, session.staffId), isNull(staff.leftOn)))
    .limit(1);
  return person ?? null;
}

async function tooMany(db: Db, address: string, account: string): Promise<boolean> {
  const since = Date.now() - WINDOW_MS;
  const recent = await db
    .select({ who: failedSignIns.who })
    .from(failedSignIns)
    .where(
      and(
        or(eq(failedSignIns.who, address), eq(failedSignIns.who, account)),
        gte(failedSignIns.at, since),
      ),
    );
  const count = (who: string) => recent.filter((row) => row.who === who).length;
  return count(address) >= PER_ADDRESS || count(account) >= PER_LOGIN;
}

async function remember(db: Db, address: string, account: string): Promise<void> {
  const now = Date.now();
  // Clears out what has aged past the window, so the table stays a few rows long.
  await db.delete(failedSignIns).where(lt(failedSignIns.at, now - WINDOW_MS));
  await db.insert(failedSignIns).values([
    { who: address, at: now },
    { who: account, at: now },
  ]);
}
