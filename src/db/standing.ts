// What a customer's bookings add up to.
//
// Pulled out of the query so it can be tested. Whether the numbers are right
// matters more than almost anything else here: "cancels at short notice" is
// something a shop might say to a guest, and a count that is quietly wrong is
// worse than no count at all.

/**
 * How close to the appointment a cancellation counts as short notice.
 *
 * A day. Not a universal truth — a shop that books three weeks out might set
 * it higher — but it is the line between "they let us know" and "that slot is
 * gone", which is the distinction the number exists to make.
 */
const SHORT_NOTICE_HOURS = 24;

export type Standing = {
  bookings: number;
  visits: number;
  cancelled: number;
  noShow: number;
  /** How many times a booking of theirs was moved. */
  moves: number;
  /** Cancellations made within a day of the appointment. */
  shortNotice: number;
  lastVisitOn: string | null;
};

/**
 * What the bookings add up to.
 *
 * Cancellations are counted from the booking's current state rather than from
 * every event that ever said "cancelled" — somebody taps the wrong button and
 * puts it back, and that is not a cancellation. Moves are counted from the
 * events, because a booking that was moved three times looks identical to one
 * that was not.
 */
export function standingOf(
  theirBookings: { id: number; date: string; startsAt: string; status: string }[],
  events: { bookingId: number; at: number; kind: string; after: string | null }[],
): Standing {
  const cancelledAt = new Map<number, number>();
  let moves = 0;

  for (const event of events) {
    if (event.kind === "moved") moves++;
    // The last time it was cancelled, which is the one that stuck if the
    // booking is cancelled now.
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

    // How much notice it gave. The appointment is in the shop's +8; the event
    // is a unix time, so both are turned into the same thing before they are
    // compared.
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

