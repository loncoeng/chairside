// Signing in.
//
// Written against Web Crypto, which the Worker runtime and every browser both
// have, so the demo runs the same code as the shop rather than a version of
// it that skips the interesting part.
//
// **Nothing here fails open.** A missing secret, a malformed token, an
// expired one and a forged one all come back the same way: nobody is signed
// in. The version of this that returns "probably fine" when the secret is
// unset is the version that ships with the secret unset.

const ROUNDS = 100_000;
const SESSION_HOURS = 12;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/**
 * Compare without leaking how far the comparison got.
 *
 * `a === b` on a token returns sooner for a wrong first character than for a
 * wrong last one, and that difference is measurable over enough attempts.
 */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i++) differences |= a[i]! ^ b[i]!;
  return differences === 0;
}

// --- Passwords -------------------------------------------------------------

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ROUNDS },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** `pbkdf2$<rounds>$<salt>$<hash>`, all base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `pbkdf2$${ROUNDS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/**
 * Whether a password matches what is stored.
 *
 * Somebody with no password set cannot sign in — not "signs in with an empty
 * one". That is the difference between an account that is not ready and an
 * account anybody can use.
 */
export async function checkPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const [scheme, rounds, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !rounds || !salt || !hash) return false;
  if (Number(rounds) !== ROUNDS) return false;

  return sameBytes(await derive(password, fromBase64Url(salt)), fromBase64Url(hash));
}

// --- The session itself ----------------------------------------------------

export type Session = { staffId: number; role: string; expiresAt: number };

async function signer(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * A token the shop's browser keeps.
 *
 * `<staffId>.<role>.<expiry>.<signature>` — readable, and useless to change,
 * because the signature covers the rest of it. A row is not looked up on
 * every request: the role is in the token, and it lasts twelve hours.
 *
 * The trade is that a demotion takes up to twelve hours to bite. For a shop
 * of eight people that is the right side of the trade; for anything larger it
 * would not be.
 */
export async function issue(secret: string, staffId: number, role: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_HOURS * 3600 * 1000;
  const body = `${staffId}.${role}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await signer(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Who a token says is signed in, or null for every kind of no.
 *
 * Wrapped, because `atob` throws on anything that is not base64 and a
 * malformed cookie would otherwise come back as a 500 rather than a 401. An
 * exception is a worse answer than a refusal: it says the server broke, when
 * what happened is that somebody sent rubbish.
 */
export async function read(secret: string | undefined, token: string | null): Promise<Session | null> {
  // No secret configured means nobody is signed in, rather than everybody.
  if (!secret || !token) return null;

  try {
    const at = token.lastIndexOf(".");
    if (at <= 0) return null;

    const body = token.slice(0, at);
    const given = token.slice(at + 1);
    if (given === "") return null;

    const expected = await crypto.subtle.sign("HMAC", await signer(secret), encoder.encode(body));
    if (!sameBytes(new Uint8Array(expected), fromBase64Url(given))) return null;

    const [staffId, role, expiresAt] = body.split(".");
    if (!staffId || !role || !expiresAt) return null;

    const id = Number(staffId);
    const expiry = Number(expiresAt);
    if (!Number.isInteger(id) || !Number.isFinite(expiry) || expiry < Date.now()) return null;

    return { staffId: id, role, expiresAt: expiry };
  } catch {
    return null;
  }
}

export const COOKIE = "chairside_session";

/** The session cookie out of a request's Cookie header. */
export function tokenFrom(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
}

/**
 * How the cookie is set.
 *
 * HttpOnly so a script cannot read it, Secure so it never crosses plain HTTP,
 * SameSite=Strict so another site cannot make the browser send it — this app
 * is opened directly and never linked into from anywhere.
 */
export const setCookie = (token: string): string =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`;

export const clearCookie = (): string =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
