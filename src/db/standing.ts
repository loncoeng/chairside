// A customer's booking history summary. Kept out of the query so it can be tested.

/** A cancellation less than this many hours before the appointment is short notice. */
const SHORT_NOTICE_HOURS = 24;

export type Standing = {
  bookings: number;
  visits: number;
  cancelled: number;
  noShow: number;
  /** Total "moved" events across all their bookings. */
  moves: number;
  /** Cancellations made under SHORT_NOTICE_HOURS before the appointment. */
  shortNotice: number;
  lastVisitOn: string | null;
};

/**
 * Cancellations come from current status, so a cancel that was undone doesn't
 * count. Moves come from events, since the booking row doesn't record them.
 */
export function standingOf(
  theirBookings: { id: number; date: string; startsAt: string; status: string }[],
  events: { bookingId: number; at: number; kind: string; after: string | null }[],
): Standing {
  const cancelledAt = new Map<number, number>();
  let moves = 0;

  for (const event of events) {
    if (event.kind === "moved") moves++;
    // Keep the latest cancel event; it is the one in effect.
    if (event.kind === "status" && event.after === "cancelled") {
      cancelledAt.set(event.bookingId, Math.max(cancelledAt.get(event.bookingId) ?? 0, event.at));
    }
  }

  let visits = 0;
  let cancelled = 0;
  let noShow = 0;
  let shortNotice = 0;
  let lastVisitOn: string | null = null;

  for (const booking of theirBookings) {
    if (booking.status === "done") {
      visits++;
      if (lastVisitOn === null || booking.date > lastVisitOn) lastVisitOn = booking.date;
    }
    if (booking.status === "no_show") noShow++;
    if (booking.status !== "cancelled") continue;

    cancelled++;

    // Appointment is local time (+08:00); event `at` is unix seconds.
    const at = cancelledAt.get(booking.id);
    if (at === undefined) continue;

    const due = Date.parse(`${booking.date}T${booking.startsAt}:00+08:00`) / 1000;
    if (Number.isFinite(due) && due - at < SHORT_NOTICE_HOURS * 3600) shortNotice++;
  }

  return {
    bookings: theirBookings.length,
    visits,
    cancelled,
    noShow,
    moves,
    shortNotice,
    lastVisitOn,
  };
}

