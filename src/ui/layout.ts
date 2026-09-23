// The arithmetic behind the grid, kept out of the component so it can be
// tested. Whether the blocks look right needs eyes; whether they land on the
// right rows does not.

import type { Day, Line, Seat } from "./types.ts";
import { minutesOf } from "./types.ts";

/** One row per quarter hour. */
export const STEP = 15;

/**
 * Where a treatment sits in the grid.
 *
 * Row 1 is the header, so the first quarter hour of the day is row 2.
 * Anything running past closing is clipped rather than pushed outside the
 * grid, where CSS would silently stretch the last row to hold it.
 */
export function place(
  line: Pick<Line, "startsAt" | "endsAt">,
  open: number,
  close: number,
): { row: number; span: number } {
  const from = Math.max(minutesOf(line.startsAt), open);
  const to = Math.min(minutesOf(line.endsAt), close);
  return {
    row: Math.round((from - open) / STEP) + 2,
    span: Math.max(1, Math.round((to - from) / STEP)),
  };
}

export type Usage = {
  kind: "styling" | "shampoo";
  /** The most seats of this kind in use at once. */
  peak: number;
  /** When that happened, in minutes from midnight. */
  at: number;
  total: number;
  full: boolean;
};

/**
 * How full each kind of seat gets, and when.
 *
 * The peak is what matters, not the average. A shampoo station idle all
 * morning does nothing for the guest who arrives at six — which is the whole
 * argument for counting the two kinds separately.
 *
 * Cancelled treatments do not occupy anything. Counting them would report a
 * room busier than it was and make the number useless for planning.
 */
export function usage(day: Day, seats: Seat[]): Usage[] {
  const { opensAt, closesAt } = day.hours;
  if (day.hours.closed || !opensAt || !closesAt) return [];

  const open = minutesOf(opensAt);
  const close = minutesOf(closesAt);
  const kindOf = new Map(seats.map((s) => [s.id, s.kind]));

  const peak: Record<string, { n: number; at: number }> = {
    styling: { n: 0, at: open },
    shampoo: { n: 0, at: open },
  };

  for (let at = open; at < close; at += STEP) {
    const busy: Record<string, number> = { styling: 0, shampoo: 0 };

    for (const line of day.lines) {
      if (line.seatId === null) continue;
      if (line.status === "cancelled" || line.status === "no_show") continue;
      // Half-open: a treatment ending at 14:00 is not occupying the chair at
      // 14:00, or every handover would read as a double booking.
      if (minutesOf(line.startsAt) > at || minutesOf(line.endsAt) <= at) continue;

      const kind = kindOf.get(line.seatId);
      if (kind) busy[kind] = (busy[kind] ?? 0) + 1;
    }

    for (const kind of ["styling", "shampoo"] as const) {
      if ((busy[kind] ?? 0) > peak[kind]!.n) peak[kind] = { n: busy[kind] ?? 0, at };
    }
  }

  return (["styling", "shampoo"] as const).map((kind) => {
    const total = seats.filter((s) => s.kind === kind).length;
    return {
      kind,
      peak: peak[kind]!.n,
      at: peak[kind]!.at,
      total,
      full: total > 0 && peak[kind]!.n >= total,
    };
  });
}

export function clock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
