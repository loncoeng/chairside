import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { blocked, check } from "./booking-rules.ts";
import type { Draft, Existing, Room } from "./booking-rules.ts";

const ROOM: Room = {
  seats: [
    { id: 1, kind: "styling", name: "A1" },
    { id: 2, kind: "styling", name: "A2" },
    { id: 10, kind: "shampoo", name: "S1" },
    { id: 11, kind: "shampoo", name: "S2" },
  ],
  hours: { opensAt: "10:00", closesAt: "20:00", closed: false },
  closure: false,
};

function existing(over: Partial<Existing> & Pick<Existing, "startsAt" | "endsAt">): Existing {
  return {
    itemId: 1,
    bookingId: 1,
    status: "booked",
    seatId: 1,
    seatKind: "styling",
    seatName: "A1",
    staffId: 1,
    staffName: "Aoi",
    ...over,
  };
}

const draft = (over: Partial<Draft> & Pick<Draft, "startsAt" | "endsAt">): Draft => ({
  seatId: 2,
  seatKind: "styling",
  staffId: 2,
  ...over,
});

const codes = (vs: { code: string }[]) => vs.map((v) => v.code).sort();

test("an ordinary booking passes with nothing to say", () => {
  const verdicts = check([draft({ startsAt: "13:00", endsAt: "13:45" })], [], ROOM);
  deepStrictEqual(verdicts, []);
  strictEqual(blocked(verdicts), false);
});

test("one stylist cannot be in two places, and that stops it", () => {
  const verdicts = check(
    [draft({ staffId: 1, seatId: 2, startsAt: "13:30", endsAt: "14:00" })],
    [existing({ staffId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" })],
    ROOM,
  );
  strictEqual(blocked(verdicts), true);
  strictEqual(verdicts[0]?.code, "staff-double-booked");
  // The message names who and when.
  strictEqual(verdicts[0]?.message.includes("13:00–14:00"), true);
});

test("a seat already in use stops it too", () => {
  const verdicts = check(
    [draft({ staffId: 3, seatId: 1, startsAt: "13:30", endsAt: "14:00" })],
    [existing({ staffId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" })],
    ROOM,
  );
  strictEqual(blocked(verdicts), true);
  strictEqual(codes(verdicts).includes("seat-taken"), true);
});

test("a handover is not a clash", () => {
  const verdicts = check(
    [draft({ staffId: 1, seatId: 1, startsAt: "14:00", endsAt: "14:45" })],
    [existing({ staffId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" })],
    ROOM,
  );
  deepStrictEqual(verdicts, []);
});

test("a cancelled treatment holds nothing", () => {
  const verdicts = check(
    [draft({ staffId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" })],
    [existing({ staffId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00", status: "cancelled" })],
    ROOM,
  );
  deepStrictEqual(verdicts, []);
});

test("editing a booking does not clash with itself", () => {
  // Its own old rows must be excluded, or a move reads as a clash.
  const verdicts = check(
    [draft({ staffId: 1, seatId: 1, startsAt: "13:15", endsAt: "14:15" })],
    [existing({ bookingId: 7, staffId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" })],
    ROOM,
    { ignoreBookingId: 7 },
  );
  deepStrictEqual(verdicts, []);
});

test("a booking with no seat yet warns when every station is spoken for", () => {
  // Both shampoo stations are busy at 18:00: warn, don't block.
  const busy: Existing[] = [10, 11].map((seatId, i) =>
    existing({
      itemId: i + 1,
      bookingId: i + 1,
      seatId,
      seatKind: "shampoo",
      staffId: 10 + i,
      startsAt: "18:00",
      endsAt: "18:30",
    }),
  );

  const verdicts = check(
    [{ seatId: null, seatKind: "shampoo", staffId: 5, startsAt: "18:00", endsAt: "18:20" }],
    busy,
    ROOM,
  );

  strictEqual(blocked(verdicts), false);
  strictEqual(
    verdicts.some((v) => v.code === "over-capacity-shampoo"),
    true,
  );
});

test("a booking with no seat yet says nothing when there is room", () => {
  const verdicts = check(
    [{ seatId: null, seatKind: "shampoo", staffId: 5, startsAt: "11:00", endsAt: "11:20" }],
    [existing({ seatId: 10, seatKind: "shampoo", staffId: 8, startsAt: "11:00", endsAt: "11:20" })],
    ROOM,
  );
  deepStrictEqual(verdicts, []);
});

test("a seat that is already chosen and free needs no capacity warning", () => {
  // The capacity warning is only for unassigned lines.
  const verdicts = check(
    [{ seatId: 11, seatKind: "shampoo", staffId: 5, startsAt: "18:00", endsAt: "18:20" }],
    [existing({ seatId: 10, seatKind: "shampoo", staffId: 8, startsAt: "18:00", endsAt: "18:30" })],
    ROOM,
  );
  deepStrictEqual(verdicts, []);
});

test("outside opening hours is a warning, not a refusal", () => {
  const verdicts = check([draft({ startsAt: "20:30", endsAt: "21:00" })], [], ROOM);
  strictEqual(blocked(verdicts), false);
  strictEqual(codes(verdicts).includes("outside-hours"), true);
});

test("a closed day warns rather than refusing", () => {
  // e.g. opening on a closed day for a wedding party.
  const shut: Room = { ...ROOM, hours: { opensAt: null, closesAt: null, closed: true } };
  const verdicts = check([draft({ startsAt: "13:00", endsAt: "13:45" })], [], shut);
  strictEqual(blocked(verdicts), false);
  strictEqual(codes(verdicts).includes("closed-day"), true);
});

test("times that run backwards are refused", () => {
  const verdicts = check([draft({ startsAt: "14:00", endsAt: "13:00" })], [], ROOM);
  strictEqual(blocked(verdicts), true);
  strictEqual(codes(verdicts).includes("backwards"), true);
});

test("a booking with no treatments in it is refused", () => {
  strictEqual(blocked(check([], [], ROOM)), true);
});

test("the lines of one booking are checked against each other", () => {
  const verdicts = check(
    [
      { seatId: 10, seatKind: "shampoo", staffId: 8, startsAt: "13:00", endsAt: "13:20" },
      { seatId: 1, seatKind: "styling", staffId: 2, startsAt: "13:10", endsAt: "13:55" },
    ],
    [],
    ROOM,
  );
  strictEqual(blocked(verdicts), true);
  strictEqual(codes(verdicts).includes("self-overlap"), true);
});

test("the same problem on three lines is reported once", () => {
  const verdicts = check(
    [
      { seatId: 1, seatKind: "styling", staffId: 1, startsAt: "13:00", endsAt: "13:20" },
      { seatId: 1, seatKind: "styling", staffId: 1, startsAt: "13:20", endsAt: "13:40" },
    ],
    [existing({ staffId: 1, seatId: 1, startsAt: "13:00", endsAt: "14:00" })],
    ROOM,
  );
  const staffClashes = verdicts.filter((v) => v.code === "staff-double-booked");
  strictEqual(staffClashes.length, 1);
});
