import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { standingOf } from "./standing.ts";

type Booking = { id: number; date: string; startsAt: string; status: string };
type Event = { bookingId: number; at: number; kind: string; after: string | null };

/** Unix seconds from a local (+08:00) time. */
const when = (iso: string) => Date.parse(`${iso}+08:00`) / 1000;

test("a guest who simply comes has nothing against them", () => {
  const s = standingOf(
    [
      { id: 1, date: "2026-08-01", startsAt: "10:00", status: "done" },
      { id: 2, date: "2026-09-01", startsAt: "10:00", status: "done" },
      { id: 3, date: "2026-10-01", startsAt: "10:00", status: "booked" },
    ],
    [],
  );

  strictEqual(s.visits, 2);
  strictEqual(s.bookings, 3);
  strictEqual(s.cancelled, 0);
  strictEqual(s.moves, 0);
  strictEqual(s.lastVisitOn, "2026-09-01");
});

test("every move is counted, including several on one booking", () => {
  const s = standingOf(
    [{ id: 1, date: "2026-09-01", startsAt: "10:00", status: "done" }],
    [
      { bookingId: 1, at: when("2026-08-20T10:00:00"), kind: "created", after: null },
      { bookingId: 1, at: when("2026-08-22T10:00:00"), kind: "moved", after: null },
      { bookingId: 1, at: when("2026-08-25T10:00:00"), kind: "moved", after: null },
      { bookingId: 1, at: when("2026-08-28T10:00:00"), kind: "restaffed", after: null },
    ],
  );

  strictEqual(s.moves, 2);
});

test("cancelling and putting it back is not a cancellation", () => {
  // Counted from current status, not from events.
  const s = standingOf(
    [{ id: 1, date: "2026-09-01", startsAt: "10:00", status: "booked" }],
    [
      { bookingId: 1, at: when("2026-08-30T10:00:00"), kind: "status", after: "cancelled" },
      { bookingId: 1, at: when("2026-08-30T10:01:00"), kind: "status", after: "booked" },
    ],
  );

  strictEqual(s.cancelled, 0);
});

test("a cancellation the morning of counts as short notice", () => {
  const s = standingOf(
    [{ id: 1, date: "2026-09-01", startsAt: "14:00", status: "cancelled" }],
    [{ bookingId: 1, at: when("2026-09-01T09:00:00"), kind: "status", after: "cancelled" }],
  );

  strictEqual(s.cancelled, 1);
  strictEqual(s.shortNotice, 1);
});

test("a cancellation a week out does not", () => {
  const s = standingOf(
    [{ id: 1, date: "2026-09-01", startsAt: "14:00", status: "cancelled" }],
    [{ bookingId: 1, at: when("2026-08-25T14:00:00"), kind: "status", after: "cancelled" }],
  );

  strictEqual(s.cancelled, 1);
  strictEqual(s.shortNotice, 0);
});

test("exactly a day before is not short notice", () => {
  // Boundary: exactly 24 hours is not short notice.
  const s = standingOf(
    [{ id: 1, date: "2026-09-02", startsAt: "14:00", status: "cancelled" }],
    [{ bookingId: 1, at: when("2026-09-01T14:00:00"), kind: "status", after: "cancelled" }],
  );

  strictEqual(s.shortNotice, 0);
});

test("the last cancellation is the one measured", () => {
  // Cancelled early, restored, cancelled again on the day.
  const s = standingOf(
    [{ id: 1, date: "2026-09-01", startsAt: "14:00", status: "cancelled" }],
    [
      { bookingId: 1, at: when("2026-08-10T10:00:00"), kind: "status", after: "cancelled" },
      { bookingId: 1, at: when("2026-08-11T10:00:00"), kind: "status", after: "booked" },
      { bookingId: 1, at: when("2026-09-01T11:00:00"), kind: "status", after: "cancelled" },
    ],
  );

  strictEqual(s.shortNotice, 1);
});

test("a cancellation with no event behind it is counted but not judged", () => {
  // Imported rows have no events, so short notice can't be judged.
  const s = standingOf(
    [{ id: 1, date: "2026-09-01", startsAt: "14:00", status: "cancelled" }],
    [],
  );

  strictEqual(s.cancelled, 1);
  strictEqual(s.shortNotice, 0);
});

test("a no-show is its own thing", () => {
  const s = standingOf(
    [
      { id: 1, date: "2026-09-01", startsAt: "14:00", status: "no_show" },
      { id: 2, date: "2026-09-08", startsAt: "14:00", status: "cancelled" },
    ],
    [],
  );

  strictEqual(s.noShow, 1);
  strictEqual(s.cancelled, 1);
});

test("somebody with no bookings at all reads as zero, not as missing", () => {
  const s = standingOf([], []);
  strictEqual(s.bookings, 0);
  strictEqual(s.visits, 0);
  strictEqual(s.lastVisitOn, null);
});
