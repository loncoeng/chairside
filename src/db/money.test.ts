import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { centsFrom, shown, toBase, typedFrom } from "./money.ts";

test("what the till types becomes whole cents", () => {
  strictEqual(centsFrom("450"), 45_000);
  strictEqual(centsFrom("450.5"), 45_050);
  strictEqual(centsFrom(" 1,280.00 "), 128_000);
  strictEqual(centsFrom("0.07"), 7);
});

test("anything that is not an amount is refused, not rounded", () => {
  for (const typed of ["", "abc", "-50", "450.555", "1e3", "4 50", ".5", "450."]) {
    strictEqual(centsFrom(typed), null, typed);
  }
});

test("a sum of cents is exact where the same sum in floating point is not", () => {
  // The bug this storage avoids: ten payments of 0.10 do not make 1.00 in a REAL column.
  let floating = 0;
  let cents = 0;
  for (let i = 0; i < 10; i++) {
    floating += 0.1;
    cents += centsFrom("0.10")!;
  }
  strictEqual(floating === 1, false);
  strictEqual(cents, 100);
});

test("a foreign payment is converted at its own rate and rounded once", () => {
  strictEqual(toBase(45_000, 10_000), 45_000);
  // HKD 450 at 1:1.03.
  strictEqual(toBase(45_000, 10_300), 46_350);
  // Half a cent rounds up, and only here.
  strictEqual(toBase(1, 15_000), 2);
});

test("amounts are shown without cents unless there are some", () => {
  strictEqual(shown(128_000), "1,280");
  strictEqual(shown(128_050), "1,280.50");
  strictEqual(typedFrom(45_000), "450");
  strictEqual(typedFrom(45_050), "450.50");
});
