// JSON replies. Every endpoint answers through here, so every reply carries the
// same headers and no handler can forget one.

/**
 * `no-store` keeps customer data out of the cache on a shared shop PC. `nosniff`
 * and `no-referrer` matter less for JSON than for pages, but cost nothing.
 */
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, private",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
}

/** A refusal: `code` is what the UI translates, `error` the English for everyone else. */
export const fail = (status: number, code: string, message: string): Response =>
  json({ ok: false, code, error: message }, status);

export const bad = (code: string, message: string): Response => fail(400, code, message);
