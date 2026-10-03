// Who may see what.
//
// Three roles, and the line that matters runs between the owner and everybody
// else: takings and settings on one side, the day's work on the other. A
// stylist has no business reading what the shop earned last month, and an
// assistant has no business changing the opening hours.
//
// Kept as a function of (role, path, method) rather than a check scattered
// through the handlers, because a permission you have to remember to write is
// a permission somebody forgets on the next endpoint.

export type Role = "owner" | "stylist" | "assistant";

/** What only the owner may reach. */
const OWNER_ONLY = [/^\/api\/revenue/, /^\/api\/shop/];

/** What answers with no session at all: the sign-in itself, and which
 *  commit is live. Everything not listed here needs somebody signed in. */
const OPEN = [/^\/api\/version$/, /^\/api\/session$/];

const ROLES: readonly string[] = ["owner", "stylist", "assistant"];

export function isOpen(path: string): boolean {
  return OPEN.some((rule) => rule.test(path));
}

/**
 * Whether this role may make this request.
 *
 * Everybody who works here reads the customer list, takes a booking and rings
 * up a bill. A role this file does not recognise gets nothing: a role renamed
 * in the database and not here should stop working rather than pass.
 *
 * `method` is in the signature and not yet in the body — the line that
 * matters runs between endpoints, not between reading and writing one.
 */
export function mayReach(role: string, path: string, _method: string): boolean {
  if (!ROLES.includes(role)) return false;
  if (OWNER_ONLY.some((rule) => rule.test(path))) return role === "owner";
  return true;
}
