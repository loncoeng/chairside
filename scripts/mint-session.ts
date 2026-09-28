// A session token, printed, for a deploy check to use.
//
// The public instance has no account anybody can sign into — seed/logins.sql
// is applied to the browser demo's database and not to D1 — so the check
// after a deploy cannot sign in with a password. It does not need to: it
// holds the signing key, which is more than a password would give it.
//
// This is the same issue() the Worker calls. A second way of making a token,
// written for the check, would pass while the real one was broken.
//
//   SESSION_SECRET=… node scripts/mint-session.ts <staffId> <role>

import { issue } from "../src/db/session.ts";

const secret = process.env.SESSION_SECRET;
if (!secret) {
  console.error("SESSION_SECRET is not set, so there is nothing to sign with.");
  process.exit(1);
}

const staffId = Number(process.argv[2] ?? "1");
const role = process.argv[3] ?? "owner";
if (!Number.isInteger(staffId)) {
  console.error(`"${process.argv[2]}" is not a staff id.`);
  process.exit(1);
}

process.stdout.write(await issue(secret, staffId, role));
