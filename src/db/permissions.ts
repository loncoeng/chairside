// Role-based access. Revenue and shop settings are owner-only; everything else
// is open to all staff. Checked centrally by path, not per handler.

export type Role = "owner" | "stylist" | "assistant";

/** Owner-only paths. */
const OWNER_ONLY = [/^\/api\/revenue/, /^\/api\/shop/];

/** Paths that need no session. Everything else requires sign-in. */
const OPEN = [/^\/api\/version$/, /^\/api\/session$/];

const ROLES: readonly string[] = ["owner", "stylist", "assistant"];

export function isOpen(path: string): boolean {
  return OPEN.some((rule) => rule.test(path));
}

/**
 * Whether this role may make this request. Unknown roles get nothing, so a role
 * renamed in the database fails closed. `method` is unused for now.
 */
export function mayReach(role: string, path: string, _method: string): boolean {
  if (!ROLES.includes(role)) return false;
  if (OWNER_ONLY.some((rule) => rule.test(path))) return role === "owner";
  return true;
}
