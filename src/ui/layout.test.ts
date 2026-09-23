import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { clock, place, usage } from "./layout.ts";
import type { Day, Line, Seat, Status } from "./types.ts";

const SEATS: Seat[] = [
  { id: 1, name: "A1", kind: "styling" },
  { id: 2, name: "A2", kind: "styling" },
  { id: 10, name: "S1", kind: "shampoo" },
  { id: 11, name: "S2", kind: "shampoo" },
];

function line(over: Partial<Line> & Pick<Line, "startsAt" | "endsAt">): Line {
  return {
    itemId: 1,
    bookingId: 1,
    seatId: 1,
    staffId: 1,
    staffName: "Aoi",
    staffColor: null,
    serviceId: 1,
    serviceJa: "カット",
    serviceEn: "Cut",
    customerId: 1,
    customerName: "—",
    status: "booked" as Status,
    nominated: false,
    source: "staff",
    ...over,
  };
}

function day(lines: Line[], hours: Day["hours"] = { opensAt: "10:00", closesAt: "20:00", closed: false }): Day {
  return { date: "2026-09-23", weekday: 3, hours, closure: null, holidays: [], lines };
}

test("the first quarter hour is row 2, under the header", () => {
  deepStrictEqual(place({ startsAt: "10:00", endsAt: "10:15" }, 600, 1200), { row: 2, span: 1 });
});

test("a 45 minute treatment spans three rows", () => {
  deepStrictEqual(place({ startsAt: "11:00", endsAt: "11:45" }, 600, 1200), { row: 6, span: 3 });
});

test("something running past closing is clipped, not pushed off the grid", () => {
  // 19:30 to 21:00 against a 20:00 close: six rows would stretch the grid
  // and put the block outside the room.
  deepStrictEqual(place({ startsAt: "19:30", endsAt: "21:00" }, 600, 1200), { row: 40, span: 2 });
});

test("something shorter than a row still gets one", () => {
  const { span } = place({ startsAt: "10:00", endsAt: "10:05" }, 600, 1200);
  strictEqual(span, 1);
});

test("the peak counts seats in use at once, not treatments in the day", () => {
  const busy = day([
    line({ itemId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" }),
    line({ itemId: 2, seatId: 2, startsAt: "13:30", endsAt: "14:30" }),
    // Later, and on its own — six treatments in a day is not a peak of six.
    line({ itemId: 3, seatId: 1, startsAt: "17:00", endsAt: "17:30" }),
  ]);

  const styling = usage(busy, SEATS).find((u) => u.kind === "styling")!;
  strictEqual(styling.peak, 2);
  strictEqual(clock(styling.at), "13:30");
  strictEqual(styling.full, true); // two styling chairs in this fixture
});

test("a handover is not a double booking", () => {
  // One ends exactly when the next begins. Counting the boundary twice would
  // report the room as fuller than it can be.
  const handover = day([
    line({ itemId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" }),
    line({ itemId: 2, seatId: 1, startsAt: "14:00", endsAt: "15:00" }),
  ]);

  strictEqual(usage(handover, SEATS).find((u) => u.kind === "styling")!.peak, 1);
});

test("a cancellation does not occupy a chair", () => {
  const withCancelled = day([
    line({ itemId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00", status: "cancelled" }),
    line({ itemId: 2, seatId: 2, startsAt: "13:00", endsAt: "14:00", status: "no_show" }),
    line({ itemId: 3, seatId: 10, startsAt: "13:00", endsAt: "14:00" }),
  ]);

  const counts = usage(withCancelled, SEATS);
  strictEqual(counts.find((u) => u.kind === "styling")!.peak, 0);
  strictEqual(counts.find((u) => u.kind === "shampoo")!.peak, 1);
});

test("the shampoo stations fill before the chairs do", () => {
  // The point the whole schema is built around: two shampoo stations against
  // four seats total, and the shampoos are the ones that run out.
  const evening = day([
    line({ itemId: 1, seatId: 10, startsAt: "18:00", endsAt: "18:20" }),
    line({ itemId: 2, seatId: 11, startsAt: "18:00", endsAt: "18:20" }),
    line({ itemId: 3, seatId: 1, startsAt: "18:20", endsAt: "19:05" }),
  ]);

  const counts = usage(evening, SEATS);
  strictEqual(counts.find((u) => u.kind === "shampoo")!.full, true);
  strictEqual(counts.find((u) => u.kind === "styling")!.full, false);
});

test("a closed day reports nothing rather than zeroes", () => {
  const shut = day([], { opensAt: null, closesAt: null, closed: true });
  deepStrictEqual(usage(shut, SEATS), []);
});
