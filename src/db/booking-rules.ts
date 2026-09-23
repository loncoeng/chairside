// What a booking is allowed to be.
//
// Two kinds of answer, and the difference is the whole design:
//
//   stop   the booking cannot be true. One person cannot be in two places.
//   warn   the booking is unusual. The room is fuller than it normally goes.
//
// A booking is taken with the guest waiting — on the phone, or standing at
// the desk. A system that refuses at that moment is a system the shop stops
// using, and the receptionist knows more about the state of the room today
// than a table of capacities does. So only the impossible is refused, and
// everything else is said out loud and then allowed.
//
// This runs on the server. The screen shows the same messages, but the check
// that counts is the one next to the database.

export type Verdict = {
  level: "stop" | "warn";
  code: string;
  /**
   * Japanese, and a fallback.
   *
   * The screen builds its own wording from `code` and `data`, because the
   * shop works in three languages and a sentence assembled on the server can
   * only be in one of them. This stays so that anything not going through the
   * screen — curl, a log line, a future integration — still reads.
   */
  message: string;
  /** The parts of the message, for a client that wants to say it its own way. */
  data?: Record<string, string | number>;
};

/** A treatment being placed, before it has an id. */
export type Draft = {
  /**
   * Which seat, if one has been chosen.
   *
   * NULL is normal, not missing data: a booking taken a week out says "a
   * shampoo then a cut", and which station that turns out to be is decided
   * on the day. The seat kind still matters, so it is carried separately.
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

/**
 * Half-open. A treatment ending at 14:00 and one starting at 14:00 do not
 * overlap — that is a handover, and it happens every hour of every day.
 */
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
    verdicts.push({ level: "stop", code: "empty", message: "施術が1つも入っていません。" });
    return verdicts;
  }

  for (const draft of drafts) {
    if (at(draft.endsAt) <= at(draft.startsAt)) {
      verdicts.push({
        level: "stop",
        code: "backwards",
        message: `終わりが始まりより前になっています（${draft.startsAt}→${draft.endsAt}）。`,
        data: { from: draft.startsAt, to: draft.endsAt },
      });
    }
  }

  // --- Cannot be true ------------------------------------------------------

  for (const draft of drafts) {
    if (draft.staffId === null) continue;
    const busy = live.find((e) => e.staffId === draft.staffId && clash(e, draft));
    if (busy) {
      verdicts.push({
        level: "stop",
        code: "staff-double-booked",
        message: `${busy.staffName ?? "担当者"}は ${busy.startsAt}–${busy.endsAt} に別の施術が入っています。`,
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
        message: `${nameOf.get(draft.seatId) ?? "この席"}は ${taken.startsAt}–${taken.endsAt} に使用中です。`,
        data: { seat: nameOf.get(draft.seatId) ?? "", from: taken.startsAt, to: taken.endsAt },
      });
    }
  }

  // The lines of one booking against each other. A guest cannot be shampooed
  // and cut at the same moment either.
  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      if (clash(drafts[i]!, drafts[j]!)) {
        verdicts.push({
          level: "stop",
          code: "self-overlap",
          message: "同じ予約の中で時間が重なっています。",
        });
      }
    }
  }

  // --- Unusual, but the shop decides --------------------------------------

  if (room.hours.closed) {
    verdicts.push({
      level: "warn",
      code: "closed-day",
      message: "定休日です。入れる場合は確認してください。",
    });
  }

  if (room.closure) {
    verdicts.push({ level: "warn", code: "closure", message: "臨時休業の日です。" });
  }

  const { opensAt, closesAt } = room.hours;
  if (opensAt && closesAt) {
    const early = drafts.some((d) => at(d.startsAt) < at(opensAt));
    const late = drafts.some((d) => at(d.endsAt) > at(closesAt));
    if (early || late) {
      verdicts.push({
        level: "warn",
        code: "outside-hours",
        message: `営業時間（${opensAt}–${closesAt}）の外にかかります。`,
        data: { opensAt, closesAt },
      });
    }
  }

  // Capacity, for treatments that have not been given a seat yet.
  //
  // Once a seat is chosen there is nothing to warn about: it is either free,
  // or taken and refused above. The case that needs saying is a booking taken
  // without pinning a station — which is how most of them are taken — at an
  // hour when every station of that kind is already spoken for.
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
            ? `この時間はシャンプー台 ${total} 台がすべて埋まっています。`
            : `この時間はセット面 ${total} 台がすべて埋まっています。`,
        data: { total },
      });
    }
  }

  return dedupe(verdicts);
}

/** The same problem found on three lines is one problem, not three. */
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
