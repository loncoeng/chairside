// Calendar grid arithmetic, kept out of the component so it can be unit tested.

import type { Day, Line, Seat } from "./types.ts";
import { minutesOf } from "./types.ts";

/** One row per quarter hour. */
export const STEP = 15;

/**
 * Header rows: seat kind, then seat name. Seat names have no standard, so the
 * kind gets its own row instead of relying on a prefix letter.
 */
export const HEADER_ROWS = 2;

/**
 * Grid range in minutes: opening hours widened to whole hours covering every
 * booking. On a closed day the bookings alone decide, since bookings on closed
 * days are allowed and must stay visible.
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
 * Grid row and span for a treatment (1-based, after the header rows). Clipped
 * to the range, since CSS would otherwise stretch the last row to fit. Height
 * rounds up so a 20-minute block isn't drawn shorter than the treatment.
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
 * Lines of text that fit in a block of `span` rows. A row is 1.3rem, text is
 * 0.72rem at 1.25 line height, minus ~4px padding and borders, so one row
 * holds one line.
 */
export function linesFor(span: number): 1 | 2 | 3 {
  if (span <= 1) return 1;
  if (span === 2) return 2;
  return 3;
}

export type Usage = {
  kind: "styling" | "shampoo";
  /** Most seats of this kind in use at once. */
  peak: number;
  /** When the peak occurred, in minutes from midnight. */
  at: number;
  total: number;
  full: boolean;
};

/**
 * Peak usage per seat kind, sampled every STEP minutes. Cancelled and no-show
 * treatments occupy nothing.
 */
export function usage(day: Day, seats: Seat[]): Usage[] {
  // Measure over the grid range, not opening hours, so off-pattern days count.
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
      // Half-open: a treatment ending at 14:00 does not occupy the seat at 14:00.
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
