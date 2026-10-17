import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { isDate, isMonth, isTime } from "./dates.ts";

test("a real day passes", () => {
  strictEqual(isDate("2026-09-28"), true);
  strictEqual(isDate("2024-02-29"), true); // a leap year
});

test("a date-shaped string that is not a date does not", () => {
  // A shape-only regex accepts all of these.
  for (const value of ["9999-99-99", "2026-13-01", "2026-00-10", "2026-02-30", "2025-02-29"]) {
    strictEqual(isDate(value), false, value);
  }
});

test("the wrong shape does not", () => {
  for (const value of ["2026-9-28", "28/09/2026", "", "today", null, 20260928]) {
    strictEqual(isDate(value), false, String(value));
  }
});

test("times are checked to the hour and the minute", () => {
  strictEqual(isTime("00:00"), true);
  strictEqual(isTime("23:59"), true);
  strictEqual(isTime("24:00"), false);
  strictEqual(isTime("25:99"), false);
  strictEqual(isTime("9:00"), false);
});

test("months exist too", () => {
  strictEqual(isMonth("2026-09"), true);
  strictEqual(isMonth("2026-13"), false);
  strictEqual(isMonth("2026-00"), false);
  strictEqual(isMonth("2026-9"), false);
});
