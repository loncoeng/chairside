// The arithmetic behind the grid, kept out of the component so it can be
// tested. Whether the blocks look right needs eyes; whether they land on the
// right rows does not.

import type { Day, Line, Seat } from "./types.ts";
import { minutesOf } from "./types.ts";

/** One row per quarter hour. */
export const STEP = 15;

/**
 * Rows above the treatments: the kind of seat, then the seat itself.
 *
 * "A1" and "S1" are made up. A salon does not have industry-standard seat
 * names — one numbers its mirrors, another calls them by position — so the
 * grid says which group a column belongs to rather than relying on the letter
 * to carry it.
 */
export const HEADER_ROWS = 2;

/**
 * When the grid starts and ends.
 *
 * Opening hours where there are any, widened to cover anything booked outside
 * them. Where there are none — a Monday the shop opened anyway — the bookings
 * themselves decide.
 *
 * A day with a booking on it has to be able to show that booking. Returning
 * "closed, nothing to see" hides the very thing somebody opened the day to
 * look at, and the booking screen deliberately lets such bookings be made.
 */
export function span(day: Day): { open: number; close: number } {
  const { opensAt, closesAt, closed } = day.hours;
  const usual = !closed && opensAt !== null && closesAt !== null;

  let open = usual ? minutesOf(opensAt!) : 24 * 60;
  let close = usual ? minutesOf(closesAt!) : 0;

  for (const line of day.lines) {
    open = Math.min(open, Math.floor(minutesOf(line.startsAt) / 60) * 60);
    close = Math.max(close, Math.ceil(minutesOf(line.endsAt) / 60) * 60);
  }

  return close > open ? { open, close } : { open: 0, close: 0 };
}

/**
 * Where a treatment sits in the grid.
 *
 * The header takes the first rows, so the first quarter hour is the one after
 * them. Anything running past closing is clipped rather than pushed outside
 * the grid, where CSS would silently stretch the last row to hold it.
 *
 * The height rounds **up**. A twenty-minute shampoo drawn as fifteen is a
 * block that ends before the guest does, and it left the name with nowhere to
 * sit — two lines of text in one row's worth of space, sliced through the
 * middle. Overstating by five minutes is the safe direction on a calendar
 * anyway: nobody is double-booked by a block that looks too long.
 */
export function place(
  line: Pick<Line, "startsAt" | "endsAt">,
  open: number,
  close: number,
): { row: number; span: number } {
  const from = Math.max(minutesOf(line.startsAt), open);
  const to = Math.min(minutesOf(line.endsAt), close);
  return {
    row: Math.round((from - open) / STEP) + HEADER_ROWS + 1,
    span: Math.max(1, Math.ceil((to - from) / STEP)),
  };
}

/**
 * How many lines of text a block has room for.
 *
 * Worked out rather than guessed: a row is 1.3rem, the text is 0.72rem at
 * 1.25 line height, and a block loses about 4px to padding and borders. A
 * quarter-hour block therefore holds one line and no more.
 *
 * Getting this wrong does not look like a bug. It looks like a name with its
 * bottom half sliced off, which reads as a rendering glitch rather than as
 * too much text in too small a box.
 */
export function linesFor(span: number): 1 | 2 | 3 {
  if (span <= 1) return 1;
  if (span === 2) return 2;
  return 3;
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
  // Measured over whatever the grid covers, not over the opening hours, so a
  // day the shop opened outside its pattern still gets counted.
  const { open, close } = span(day);
  if (close <= open) return [];

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
