// Headers a page is not allowed to set.
//
// Two releases went out on this. `Set-Cookie` cannot be put on a Response the
// page constructs, and `Cookie` cannot be put on a Request the page
// constructs: both names are forbidden, the browser removes them in silence,
// and Node keeps them — so the code looked right, the tests passed, and the
// demo did not work.
//
// Silence is the problem. There is no error to catch and nothing in the
// network tab, so the only defence is not writing the line. This reads the
// files under src/ui and says so if one does.
//
// The Worker is not covered, and should not be: it answers over a network,
// where Set-Cookie is exactly how a session is handed out. The rule is about
// what a page builds for itself.

import { ok } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

/**
 * The names the Fetch specification forbids, in either direction.
 *
 * Trimmed to the ones this codebase could plausibly reach for — the full list
 * includes things like `Transfer-Encoding` that nobody sets by hand. `Sec-`
 * and `Proxy-` prefixed names are forbidden wholesale and are matched as
 * prefixes below.
 */
const FORBIDDEN = [
  "cookie",
  "cookie2",
  "set-cookie",
  "set-cookie2",
  "host",
  "origin",
  "referer",
  "connection",
  "content-length",
  "date",
  "expect",
  "keep-alive",
  "te",
  "trailer",
  "upgrade",
  "via",
  "accept-charset",
  "accept-encoding",
];

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts")) return [];
    return [path];
  });
}

test("nothing under src/ui sets a header the browser will not carry", () => {
  const offences: string[] = [];

  for (const file of filesUnder("src/ui")) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, at) => {
      // A comment saying why the name cannot be used is the point of this
      // file, not a violation of it.
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (code.trim() === "" || code.trim().startsWith("*")) return;

      for (const name of FORBIDDEN) {
        // `headers.set("cookie", …)`, `{ "cookie": … }`, `append('cookie', …)`
        const written = new RegExp(
          `(?:set|append)\\s*\\(\\s*(['"\`])${name}\\1|(['"\`])${name}\\2\\s*:`,
          "i",
        );
        if (written.test(code)) offences.push(`${file}:${at + 1} sets ${name}`);
      }
      if (/(?:set|append)\s*\(\s*(['"`])(?:sec|proxy)-/i.test(code)) {
        offences.push(`${file}:${at + 1} sets a Sec- or Proxy- header`);
      }
    });
  }

  ok(
    offences.length === 0,
    `a page cannot set these, and the browser drops them without a word:\n  ${offences.join("\n  ")}`,
  );
});

test("the list is a list of names, and the check can see one", () => {
  // A check that cannot fail is not a check. This is the shape of the line
  // that shipped twice, and the regex above has to find it.
  const shipped = `if (demoCookie !== null) carried.headers.set("cookie", demoCookie);`;
  const written = new RegExp(`(?:set|append)\\s*\\(\\s*(['"\`])cookie\\1`, "i");
  ok(written.test(shipped), "the check would not have found the line that broke the demo");

  const alsoShipped = `const issued = response.headers.get("set-cookie");`;
  ok(!written.test(alsoShipped), "reading is not setting");
});
