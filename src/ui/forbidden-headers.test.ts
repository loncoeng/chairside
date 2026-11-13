// Browsers silently drop forbidden headers (`Cookie`, `Set-Cookie`, ...) on a
// Request/Response built in the page, and Node keeps them, so tests cannot catch
// it at runtime. This scans src/ui source instead. The Worker is exempt.

import { ok } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

/**
 * Forbidden header names from the Fetch spec, trimmed to plausible ones.
 * `Sec-` and `Proxy-` prefixes are matched separately below.
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
      // Ignore comments.
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
  // The regex must match the line that broke the demo.
  const shipped = `if (demoCookie !== null) carried.headers.set("cookie", demoCookie);`;
  const written = /(?:set|append)\s*\(\s*(['"`])cookie\1/i;
  ok(written.test(shipped), "the check would not have found the line that broke the demo");

  const alsoShipped = `const issued = response.headers.get("set-cookie");`;
  ok(!written.test(alsoShipped), "reading is not setting");
});
