import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { creditedStaff } from "./credit.ts";
import type { Line } from "./credit.ts";

const line = (over: Partial<Line> & Pick<Line, "sortOrder">): Line => ({
  staffId: 1,
  seatKind: "styling",
  ...over,
});

test("a shampoo then a cut belongs to whoever did the cut", () => {
  // The bug this replaces: the shampoo is first, the assistant does it, and
  // the assistant ended the month with three times any stylist's takings.
  const cut = creditedStaff([
    line({ sortOrder: 0, staffId: 8, seatKind: "shampoo" }),
    line({ sortOrder: 1, staffId: 2, seatKind: "styling" }),
  ]);

  strictEqual(cut, 2);
});

test("the order the lines arrive in does not matter", () => {
  const cut = creditedStaff([
    line({ sortOrder: 1, staffId: 2, seatKind: "styling" }),
    line({ sortOrder: 0, staffId: 8, seatKind: "shampoo" }),
  ]);

  strictEqual(cut, 2);
});

test("a wash on its own belongs to whoever did it", () => {
  // Somebody who comes in only for a shampoo was served by that person and
  // nobody else. Returning null here would lose the takings entirely.
  strictEqual(creditedStaff([line({ sortOrder: 0, staffId: 8, seatKind: "shampoo" })]), 8);
});

test("the first styling line wins, not the longest", () => {
  // Shampoo, cut, then a treatment. The cut is what they came for.
  const who = creditedStaff([
    line({ sortOrder: 0, staffId: 8, seatKind: "shampoo" }),
    line({ sortOrder: 1, staffId: 3, seatKind: "styling" }),
    line({ sortOrder: 2, staffId: 8, seatKind: "shampoo" }),
  ]);

  strictEqual(who, 3);
});

test("a line with nobody against it is skipped", () => {
  const who = creditedStaff([
    line({ sortOrder: 0, staffId: null, seatKind: "styling" }),
    line({ sortOrder: 1, staffId: 5, seatKind: "styling" }),
  ]);

  strictEqual(who, 5);
});

test("a booking with nobody against any line credits nobody", () => {
  // Rather than picking somebody. An unattributed bill shows up as "—" on
  // the screen, which is true; guessing would put money on a payslip.
  strictEqual(creditedStaff([line({ sortOrder: 0, staffId: null })]), null);
  strictEqual(creditedStaff([]), null);
});
