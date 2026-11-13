// Password hashing and signed session tokens, on Web Crypto (Workers and browsers).
// Fails closed: a missing secret or a bad, expired or forged token means no session.

const ROUNDS = 100_000;
const SESSION_HOURS = 12;

/**
 * Shortest signing key accepted. Anything shorter is treated as no key at all,
 * so a placeholder left in a secret store fails closed instead of signing
 * tokens somebody could guess. `openssl rand -base64 32` gives 44 characters.
 */
export const MIN_SECRET_LENGTH = 32;

/** Whether this key is long enough to sign with. */
export const usable = (secret: string | undefined): secret is string =>
  typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Constant-time comparison, so timing doesn't reveal how many bytes matched. */
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

let standIn: Promise<string> | null = null;

/**
 * Whether a password matches the stored hash. No stored hash means no sign-in,
 * but the hash is still computed, against a throwaway one: answering fast for
 * an unknown login id would tell somebody which ids exist.
 */
export async function checkPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    standIn ??= hashPassword(crypto.randomUUID());
    await checkPassword(password, await standIn);
    return false;
  }

  const [scheme, rounds, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !rounds || !salt || !hash) return false;
  if (Number(rounds) !== ROUNDS) return false;

  return sameBytes(await derive(password, fromBase64Url(salt)), fromBase64Url(hash));
}

// --- Sessions ---------------------------------------------------------------

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
 * Token `<staffId>.<role>.<expiry>.<signature>`, HMAC over the rest. The role
 * is not re-read from the database, so a role change can take up to
 * SESSION_HOURS (12) to apply. Expiry is in milliseconds.
 */
export async function issue(secret: string, staffId: number, role: string): Promise<string> {
  if (!usable(secret)) throw new Error(`the signing key must be ${MIN_SECRET_LENGTH}+ characters`);
  const expiresAt = Date.now() + SESSION_HOURS * 3600 * 1000;
  const body = `${staffId}.${role}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await signer(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The session a token carries, or null if it is invalid. Wrapped in try because
 * `atob` throws on non-base64, which would otherwise be a 500 instead of a 401.
 */
export async function read(
  secret: string | undefined,
  token: string | null,
): Promise<Session | null> {
  // No usable key configured: nobody is signed in.
  if (!usable(secret) || !token) return null;

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

/**
 * `__Host-` makes the browser refuse the cookie unless it is Secure, has Path=/
 * and names no Domain, so nothing on another subdomain can set or widen it.
 */
export const COOKIE = "__Host-chairside_session";

/** Session token from the request's Cookie header. */
export function tokenFrom(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
}

/** SameSite=Strict is safe because the app is never opened via a link from another site. */
export const setCookie = (token: string): string =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`;

export const clearCookie = (): string =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
