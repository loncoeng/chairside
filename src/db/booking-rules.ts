// Booking validation, run on the server.
//   stop: impossible (e.g. one stylist in two places); the booking is refused.
//   warn: unusual (e.g. over capacity); shown, but the booking is allowed.

export type Verdict = {
  level: "stop" | "warn";
  code: string;
  /**
   * English fallback for logs and API clients. The UI localises from `code`
   * and `data` instead.
   */
  message: string;
  /** Message parameters for clients that build their own wording. */
  data?: Record<string, string | number>;
};

/** A treatment being placed, before it has an id. */
export type Draft = {
  /**
   * null when no seat is chosen yet, which is normal: the station is often
   * decided on the day. `seatKind` is still set.
   */
  seatId: number | null;
  seatKind: "styling" | "shampoo" | null;
  staffId: number | null;
  /** "HH:MM" in the shop's time. */
  startsAt: string;
  endsAt: string;
};

/** A treatment already on the books that day. */
export type Existing = Draft & {
  itemId: number;
  bookingId: number;
  status: string;
  staffName: string | null;
  seatName: string | null;
};

export type Room = {
  seats: { id: number; kind: "styling" | "shampoo"; name: string }[];
  hours: { opensAt: string | null; closesAt: string | null; closed: boolean };
  closure: boolean;
};

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Half-open intervals: one ending at 14:00 and one starting at 14:00 don't overlap. */
const clash = (a: Draft, b: Draft): boolean => at(a.startsAt) < at(b.endsAt) && at(b.startsAt) < at(a.endsAt);

/** Treatments that no longer occupy anything. */
const gone = (status: string) => status === "cancelled" || status === "no_show";

export function check(
  drafts: Draft[],
  existing: Existing[],
  room: Room,
  options: { ignoreBookingId?: number } = {},
): Verdict[] {
  const verdicts: Verdict[] = [];
  const live = existing.filter(
    (e) => !gone(e.status) && e.bookingId !== options.ignoreBookingId,
  );
  const nameOf = new Map(room.seats.map((s) => [s.id, s.name]));

  if (drafts.length === 0) {
    verdicts.push({ level: "stop", code: "empty", message: "Nothing has been chosen." });
    return verdicts;
  }

  for (const draft of drafts) {
    if (at(draft.endsAt) <= at(draft.startsAt)) {
      verdicts.push({
        level: "stop",
        code: "backwards",
        message: `It ends before it starts (${draft.startsAt}→${draft.endsAt}).`,
        data: { from: draft.startsAt, to: draft.endsAt },
      });
    }
  }

  // --- stop ---------------------------------------------------------------

  for (const draft of drafts) {
    if (draft.staffId === null) continue;
    const busy = live.find((e) => e.staffId === draft.staffId && clash(e, draft));
    if (busy) {
      verdicts.push({
        level: "stop",
        code: "staff-double-booked",
        message: `${busy.staffName ?? "The stylist"} already has something at ${busy.startsAt}–${busy.endsAt}.`,
        data: { who: busy.staffName ?? "", from: busy.startsAt, to: busy.endsAt },
      });
    }
  }

  for (const draft of drafts) {
    if (draft.seatId === null) continue;
    const taken = live.find((e) => e.seatId === draft.seatId && clash(e, draft));
    if (taken) {
      verdicts.push({
        level: "stop",
        code: "seat-taken",
        message: `${nameOf.get(draft.seatId) ?? "That seat"} is in use at ${taken.startsAt}–${taken.endsAt}.`,
        data: { seat: nameOf.get(draft.seatId) ?? "", from: taken.startsAt, to: taken.endsAt },
      });
    }
  }

  // Lines of the same booking must not overlap each other.
  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      if (clash(drafts[i]!, drafts[j]!)) {
        verdicts.push({
          level: "stop",
          code: "self-overlap",
          message: "Two treatments in this booking overlap.",
        });
      }
    }
  }

  // --- warn ---------------------------------------------------------------

  if (room.hours.closed) {
    verdicts.push({
      level: "warn",
      code: "closed-day",
      message: "The shop is closed that day. Check before taking it.",
    });
  }

  if (room.closure) {
    verdicts.push({ level: "warn", code: "closure", message: "The shop is closed that day." });
  }

  const { opensAt, closesAt } = room.hours;
  if (opensAt && closesAt) {
    const early = drafts.some((d) => at(d.startsAt) < at(opensAt));
    const late = drafts.some((d) => at(d.endsAt) > at(closesAt));
    if (early || late) {
      verdicts.push({
        level: "warn",
        code: "outside-hours",
        message: `This falls outside opening hours (${opensAt}–${closesAt}).`,
        data: { opensAt, closesAt },
      });
    }
  }

  // Capacity check, only for lines without a seat. A chosen seat is either free
  // or already refused above. Sampled every 5 minutes.
  for (const draft of drafts) {
    if (draft.seatId !== null || draft.seatKind === null) continue;

    const kind = draft.seatKind;
    const total = room.seats.filter((s) => s.kind === kind).length;
    if (total === 0) continue;

    let peak = 0;
    for (let t = at(draft.startsAt); t < at(draft.endsAt); t += 5) {
      const busy = live.filter(
        (e) => e.seatKind === kind && at(e.startsAt) <= t && at(e.endsAt) > t,
      ).length;
      peak = Math.max(peak, busy);
    }

    if (peak >= total) {
      verdicts.push({
        level: "warn",
        code: `over-capacity-${kind}`,
        message:
          kind === "shampoo"
            ? `All ${total} shampoo stations are taken at that time.`
            : `All ${total} styling chairs are taken at that time.`,
        data: { total },
      });
    }
  }

  return dedupe(verdicts);
}

/** Drops repeats of the same verdict from different lines. */
function dedupe(verdicts: Verdict[]): Verdict[] {
  const seen = new Set<string>();
  return verdicts.filter((v) => {
    const key = `${v.code}|${v.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const blocked = (verdicts: Verdict[]): boolean => verdicts.some((v) => v.level === "stop");
