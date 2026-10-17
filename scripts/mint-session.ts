// Prints a session token for the post-deploy check. D1 has no login accounts
// (seed/logins.sql only goes into the browser demo), so the check signs a token itself.
// Uses the Worker's own issue() so the check exercises the real code path.
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
