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
 * Reading the customer list is allowed for everybody who works here: a
 * stylist checking what they did to somebody's hair last time is the job. So
 * is taking a booking, or ringing up a bill — an assistant on the phone does
 * both. Deleting is not something anybody can do, so it does not appear.
 *
 * A role this file does not recognise gets nothing. Tokens are signed, so one
 * cannot arrive by being made up — but a role renamed in the database and not
 * here should stop working rather than pass.
 *
 * `method` earns its place in the signature, not in the body: no rule turns on
 * it yet, because the one line that matters runs between whole endpoints
 * rather than between reading and writing one. Adding a rule that does is a
 * line here, which is the point of the table.
 */
export function mayReach(role: string, path: string, _method: string): boolean {
  if (!ROLES.includes(role)) return false;
  if (OWNER_ONLY.some((rule) => rule.test(path))) return role === "owner";
  return true;
}
