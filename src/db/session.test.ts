import { strictEqual, notStrictEqual } from "node:assert/strict";
import { test } from "node:test";

import { checkPassword, hashPassword, issue, read, tokenFrom } from "./session.ts";

const SECRET = "a-secret-for-the-tests-only";

test("a password checks against its own hash and nothing else", async () => {
  const stored = await hashPassword("correct horse");
  strictEqual(await checkPassword("correct horse", stored), true);
  strictEqual(await checkPassword("correct horse ", stored), false);
  strictEqual(await checkPassword("Correct horse", stored), false);
  strictEqual(await checkPassword("", stored), false);
});

test("the same password hashes differently every time", async () => {
  // Salted.
  notStrictEqual(await hashPassword("same"), await hashPassword("same"));
});

test("somebody with no password set cannot sign in", async () => {
  strictEqual(await checkPassword("", null), false);
  strictEqual(await checkPassword("anything", null), false);
  strictEqual(await checkPassword("", ""), false);
});

test("a hash in a shape this code does not recognise is refused", async () => {
  for (const stored of ["plaintext", "md5$1$a$b", "pbkdf2$1$a$b", "pbkdf2$$$"]) {
    strictEqual(await checkPassword("anything", stored), false);
  }
});

test("a token says who signed in", async () => {
  const token = await issue(SECRET, 3, "owner");
  const open = await read(SECRET, token);
  strictEqual(open?.staffId, 3);
  strictEqual(open?.role, "owner");
});

test("a token signed with another secret is nobody", async () => {
  const token = await issue("some other secret", 3, "owner");
  strictEqual(await read(SECRET, token), null);
});

test("changing the role in a token invalidates it", async () => {
  const token = await issue(SECRET, 3, "stylist");
  const forged = token.replace("stylist", "owner");
  notStrictEqual(forged, token);
  strictEqual(await read(SECRET, forged), null);
});

test("an expired token is nobody", async () => {
  const token = await issue(SECRET, 3, "owner");
  const [staffId, role, , signature] = token.split(".");
  // The signature covers the expiry, so this fails signature verification.
  strictEqual(await read(SECRET, `${staffId}.${role}.${Date.now() - 1000}.${signature}`), null);
});

test("no secret means nobody is signed in, rather than everybody", async () => {
  const token = await issue(SECRET, 3, "owner");
  strictEqual(await read(undefined, token), null);
  strictEqual(await read("", token), null);
});

test("nonsense is nobody", async () => {
  for (const token of ["", ".", "..", "1.owner.999", "not-a-token", "1.owner.9999999999999.x"]) {
    strictEqual(await read(SECRET, token), null);
  }
});

test("the cookie is picked out of a header with other cookies in it", () => {
  const request = new Request("https://example.test/", {
    headers: { cookie: "other=1; chairside_session=abc.def; another=2" },
  });
  strictEqual(tokenFrom(request), "abc.def");
});

test("no cookie is no token", () => {
  strictEqual(tokenFrom(new Request("https://example.test/")), null);
  strictEqual(
    tokenFrom(new Request("https://example.test/", { headers: { cookie: "other=1" } })),
    null,
  );
});
