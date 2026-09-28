import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { isOpen, mayReach } from "./permissions.ts";

test("the takings are the owner's", () => {
  // A stylist reading what the shop earned last month is the thing this line
  // exists to stop.
  strictEqual(mayReach("owner", "/api/revenue", "GET"), true);
  strictEqual(mayReach("stylist", "/api/revenue", "GET"), false);
  strictEqual(mayReach("assistant", "/api/revenue", "GET"), false);
});

test("so are the shop's settings", () => {
  strictEqual(mayReach("owner", "/api/shop", "GET"), true);
  strictEqual(mayReach("stylist", "/api/shop", "GET"), false);
  strictEqual(mayReach("stylist", "/api/shop/hours", "PUT"), false);
  strictEqual(mayReach("stylist", "/api/shop/staff", "POST"), false);
});

test("everybody who works here reads the customers", () => {
  // A stylist checking what they did to somebody's hair last time is the job,
  // not a privilege.
  for (const role of ["owner", "stylist", "assistant"]) {
    strictEqual(mayReach(role, "/api/people/3", "GET"), true);
    strictEqual(mayReach(role, "/api/day", "GET"), true);
  }
});

test("and everybody who works here can take a booking", () => {
  // The assistant answers the phone. A system where they cannot write the
  // booking down is a system with a paper diary beside it.
  for (const role of ["owner", "stylist", "assistant"]) {
    strictEqual(mayReach(role, "/api/bookings", "POST"), true);
    strictEqual(mayReach(role, "/api/payments", "POST"), true);
  }
});

test("only two paths answer without a session", () => {
  // Which version is live, and the sign-in itself. Everything else waits.
  strictEqual(isOpen("/api/version"), true);
  strictEqual(isOpen("/api/session"), true);

  for (const path of ["/api/day", "/api/people", "/api/room", "/api/revenue", "/api/shop"]) {
    strictEqual(isOpen(path), false);
  }
});

test("a path that merely starts the same is not open", () => {
  // "/api/versions-of-everything" is not "/api/version".
  strictEqual(isOpen("/api/version/all"), false);
  strictEqual(isOpen("/api/sessions"), false);
});

test("a role this file does not know gets nothing", () => {
  // Tokens are signed, so a made-up role cannot arrive from outside. This is
  // for the day somebody renames a role in the database and not here: it
  // should stop working, rather than quietly pass.
  for (const path of ["/api/people", "/api/day", "/api/revenue"]) {
    strictEqual(mayReach("manager", path, "GET"), false);
    strictEqual(mayReach("", path, "GET"), false);
  }
});
