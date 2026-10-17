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
  // Crediting the first line would give the assistant's shampoo the whole bill.
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
  // Returning null here would lose the takings.
  strictEqual(creditedStaff([line({ sortOrder: 0, staffId: 8, seatKind: "shampoo" })]), 8);
});

test("the first styling line wins, not the longest", () => {
  // Shampoo, cut, then a treatment.
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
  // No guessing. The UI shows an unattributed bill as a dash.
  strictEqual(creditedStaff([line({ sortOrder: 0, staffId: null })]), null);
  strictEqual(creditedStaff([]), null);
});
