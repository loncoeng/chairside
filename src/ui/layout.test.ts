import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { clock, linesFor, place, span, usage } from "./layout.ts";
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

function day(
  lines: Line[],
  hours: Day["hours"] = { opensAt: "10:00", closesAt: "20:00", closed: false },
): Day {
  return { date: "2026-09-23", weekday: 3, hours, closure: null, holidays: [], lines };
}

test("the first quarter hour sits under the header rows", () => {
  deepStrictEqual(place({ startsAt: "10:00", endsAt: "10:15" }, 600, 1200), { row: 3, span: 1 });
});

test("a 45 minute treatment spans three rows", () => {
  deepStrictEqual(place({ startsAt: "11:00", endsAt: "11:45" }, 600, 1200), { row: 7, span: 3 });
});

test("something running past closing is clipped, not pushed off the grid", () => {
  // 19:30-21:00 with a 20:00 close: clip to 2 rows, not 6.
  deepStrictEqual(place({ startsAt: "19:30", endsAt: "21:00" }, 600, 1200), { row: 41, span: 2 });
});

test("something shorter than a row still gets one", () => {
  const { span } = place({ startsAt: "10:00", endsAt: "10:05" }, 600, 1200);
  strictEqual(span, 1);
});

test("a twenty-minute treatment gets two rows, not one", () => {
  // Round up: one row would cut the text off.
  const { span } = place({ startsAt: "10:00", endsAt: "10:20" }, 600, 1200);
  strictEqual(span, 2);
});

test("a quarter-hour block holds one line, and says so", () => {
  // One row fits one line of text.
  strictEqual(linesFor(1), 1);
  strictEqual(linesFor(2), 2);
  strictEqual(linesFor(3), 3);
  strictEqual(linesFor(12), 3);
});

test("the peak counts seats in use at once, not treatments in the day", () => {
  const busy = day([
    line({ itemId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" }),
    line({ itemId: 2, seatId: 2, startsAt: "13:30", endsAt: "14:30" }),
    // Later and alone, so it does not raise the peak.
    line({ itemId: 3, seatId: 1, startsAt: "17:00", endsAt: "17:30" }),
  ]);

  const styling = usage(busy, SEATS).find((u) => u.kind === "styling")!;
  strictEqual(styling.peak, 2);
  strictEqual(clock(styling.at), "13:30");
  strictEqual(styling.full, true); // two styling chairs in this fixture
});

test("a handover is not a double booking", () => {
  // End time equal to the next start time is not an overlap.
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
  // Shampoo stations are the bottleneck the schema is built around.
  const evening = day([
    line({ itemId: 1, seatId: 10, startsAt: "18:00", endsAt: "18:20" }),
    line({ itemId: 2, seatId: 11, startsAt: "18:00", endsAt: "18:20" }),
    line({ itemId: 3, seatId: 1, startsAt: "18:20", endsAt: "19:05" }),
  ]);

  const counts = usage(evening, SEATS);
  strictEqual(counts.find((u) => u.kind === "shampoo")!.full, true);
  strictEqual(counts.find((u) => u.kind === "styling")!.full, false);
});

test("a closed day with nothing on it reports nothing rather than zeroes", () => {
  const shut = day([], { opensAt: null, closesAt: null, closed: true });
  deepStrictEqual(usage(shut, SEATS), []);
  deepStrictEqual(span(shut), { open: 0, close: 0 });
});

test("a closed day that has bookings still gets a grid", () => {
  // Bookings on a closed day are allowed, so the grid must still show them.
  const monday = day([line({ itemId: 1, seatId: 1, startsAt: "13:00", endsAt: "13:45" })], {
    opensAt: null,
    closesAt: null,
    closed: true,
  });

  deepStrictEqual(span(monday), { open: 13 * 60, close: 14 * 60 });
  strictEqual(usage(monday, SEATS).find((u) => u.kind === "styling")!.peak, 1);
});

test("something booked past closing widens the grid to hold it", () => {
  const late = day([line({ itemId: 1, seatId: 1, startsAt: "19:45", endsAt: "21:15" })]);
  deepStrictEqual(span(late), { open: 10 * 60, close: 22 * 60 });
});
