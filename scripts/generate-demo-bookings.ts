// Writes seed/demo-bookings.sql: about three months of invented bookings for
// the public instance, with the history behind them.
//
// Generated rather than typed out, for two reasons.
//
// A hand-written week puts two guests in one chair by the third day. This
// places every treatment against a seat and a stylist that were actually
// free, which is the same constraint the booking screen enforces — so the
// sample data cannot contradict the rules the app is about.
//
// And the customers screen is only worth looking at if the guests behave like
// guests. One of them reschedules constantly; one cancels the morning of; one
// does not turn up. Those are the numbers that page exists to surface, and a
// week of tidy bookings shows none of them.
//
// Run it with `npm run demo:bookings`. The output is committed.

import { writeFileSync } from "node:fs";

/** The window the sample covers. The last week is still ahead. */
const FROM = "2026-07-01";
const TO = "2026-09-30";
/** Anything on or after this is still to come, so it is booked rather than done. */
const TODAY = "2026-09-24";

const OPEN: Record<number, [string, string]> = {
  0: ["10:00", "19:00"],
  2: ["10:00", "20:00"],
  3: ["10:00", "20:00"],
  4: ["10:00", "20:00"],
  5: ["10:00", "20:00"],
  6: ["10:00", "20:00"],
};
// Monday (1) is missing on purpose — the shop is closed.

const STYLING_SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SHAMPOO_SEATS = [10, 11, 12];
const STYLISTS = [1, 2, 3, 4, 5, 6, 7];
const ASSISTANT = 8;

type Service = { minutes: number; seat: "styling" | "shampoo" };
const SERVICE: Record<number, Service> = {
  1: { minutes: 45, seat: "styling" },
  2: { minutes: 30, seat: "styling" },
  3: { minutes: 15, seat: "styling" },
  4: { minutes: 20, seat: "shampoo" },
  5: { minutes: 25, seat: "styling" },
  6: { minutes: 90, seat: "styling" },
  7: { minutes: 120, seat: "styling" },
  8: { minutes: 180, seat: "styling" },
  9: { minutes: 30, seat: "shampoo" },
  10: { minutes: 40, seat: "shampoo" },
};

/**
 * How the twelve invented guests behave.
 *
 * `every` is roughly how many days between visits; `usual` is the stylist
 * they ask for. The rest are the things the customers screen counts, given as
 * the chance of it happening on any one booking.
 *
 * Deliberately uneven. If everybody reschedules a little, the screen shows
 * twelve people who all look the same and the numbers say nothing.
 */
const GUESTS: {
  id: number;
  every: number;
  usual: number;
  menu: number[];
  /** Chance this booking gets moved at least once. */
  moves: number;
  /** Chance it ends up cancelled. */
  cancels: number;
  /** Of those cancellations, the chance it came within a day. */
  late: number;
  /** Chance they simply do not turn up. */
  noShow: number;
}[] = [
  { id: 1, every: 30, usual: 3, menu: [4, 6, 1], moves: 0.1, cancels: 0.04, late: 0.3, noShow: 0 },
  { id: 2, every: 28, usual: 2, menu: [4, 1], moves: 0.05, cancels: 0.03, late: 0.2, noShow: 0 },
  // Reschedules constantly. The one the screen should make obvious.
  { id: 3, every: 13, usual: 4, menu: [4, 1], moves: 0.9, cancels: 0.1, late: 0.4, noShow: 0 },
  { id: 4, every: 38, usual: 6, menu: [4, 5], moves: 0.1, cancels: 0.05, late: 0.2, noShow: 0 },
  { id: 5, every: 34, usual: 5, menu: [4, 8], moves: 0.15, cancels: 0.05, late: 0.2, noShow: 0 },
  // Cancels, and nearly always on the day.
  { id: 6, every: 13, usual: 7, menu: [10, 1], moves: 0.2, cancels: 0.5, late: 0.9, noShow: 0 },
  { id: 7, every: 31, usual: 2, menu: [4, 1, 9], moves: 0.1, cancels: 0.04, late: 0.2, noShow: 0 },
  { id: 8, every: 21, usual: 3, menu: [2], moves: 0.08, cancels: 0.03, late: 0.2, noShow: 0 },
  { id: 9, every: 44, usual: 1, menu: [4, 1], moves: 0.12, cancels: 0.06, late: 0.3, noShow: 0 },
  // Does not turn up. A different problem from cancelling, and counted apart.
  { id: 10, every: 14, usual: 6, menu: [4, 1], moves: 0.15, cancels: 0.08, late: 0.5, noShow: 0.4 },
  { id: 11, every: 27, usual: 5, menu: [4, 6], moves: 0.1, cancels: 0.04, late: 0.2, noShow: 0 },
  { id: 12, every: 40, usual: 4, menu: [3], moves: 0.06, cancels: 0.04, late: 0.2, noShow: 0 },
];

/**
 * The rest of the shop's book.
 *
 * Twelve guests is not a salon. Three months at this size is a few thousand
 * appointments, and if all but thirty of them have no name against them then
 * the customers screen has nothing to show and the day looks like it is run
 * for strangers.
 *
 * So the generator invents the rest of the clientele as well: surnames and
 * given names combined, mostly Cantonese with some Portuguese and Japanese,
 * which is what a salon in Macau looks like. None of them is anybody.
 */
const ZH_SURNAMES = "陳李黃張梁何吳劉蔡楊鄭謝許羅高林周葉朱馮".split("");
const ZH_GIVEN = [
  "嘉欣", "俊傑", "美玲", "志强", "詩華", "偉明", "曉晴", "family", "文健", "雅婷",
  "家豪", "淑芬", "建華", "芷若", "少聰", "慧敏", "國強", "秀蘭", "子軒", "雨桐",
].filter((n) => n !== "family");
const ZH_ROMAN = [
  "ka yan", "chun kit", "mei ling", "chi keung", "sze wah", "wai ming", "hiu ching",
  "man kin", "nga ting", "ka ho", "suk fan", "kin wah", "tsz yeuk", "siu chung",
  "wai man", "kwok keung", "sau lan", "tsz hin", "yu tung",
];
const PT_NAMES = [
  ["Ana", "Silva"], ["João", "Pereira"], ["Rita", "Costa"], ["Carlos", "Lopes"],
  ["Sofia", "Martins"], ["Miguel", "Ferreira"], ["Inês", "Rocha"], ["Paulo", "Dias"],
];
const JA_NAMES = [
  ["佐藤", "健", "sato ken"], ["鈴木", "花", "suzuki hana"], ["高橋", "翔", "takahashi sho"],
  ["伊藤", "凛", "ito rin"], ["中村", "葵", "nakamura aoi"], ["小林", "蓮", "kobayashi ren"],
];

/** How many invented guests the shop has on file, beyond the named twelve. */
const EXTRA_GUESTS = 240;
/** The first id they take. The hand-written twelve keep 1 to 12. */
const EXTRA_FROM = 101;

/** What everybody else books. Bulk, to fill the room. */
const WALK_IN_MENUS: { items: number[]; weight: number }[] = [
  { items: [4, 1], weight: 30 },
  { items: [2], weight: 16 },
  { items: [4, 6], weight: 12 },
  { items: [3], weight: 8 },
  { items: [4, 5], weight: 8 },
  { items: [10, 1], weight: 6 },
  { items: [4, 7], weight: 5 },
  { items: [4, 8], weight: 3 },
  { items: [9], weight: 5 },
  { items: [4, 1, 9], weight: 7 },
];

// A fixed sequence, so regenerating produces the same months. Math.random
// would make every run a diff.
let seed = 20260701;
function random(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
const chance = (p: number) => random() < p;

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const clock = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
/** Unix seconds for a moment in the shop's own time. */
const stamp = (date: string, hhmm: string) => Math.floor(Date.parse(`${date}T${hhmm}:00+08:00`) / 1000);

type Extra = { id: number; name: string; key: string; phone: string; since: string };

const extras: Extra[] = [];
for (let i = 0; i < EXTRA_GUESTS; i++) {
  const id = EXTRA_FROM + i;
  const roll = random();
  let name: string;
  let key: string;

  if (roll < 0.72) {
    const surname = pick(ZH_SURNAMES);
    const at = Math.floor(random() * ZH_GIVEN.length);
    name = `${surname} ${ZH_GIVEN[at]}`;
    key = `${ZH_ROMAN[at % ZH_ROMAN.length]}`;
  } else if (roll < 0.88) {
    const [first, last] = pick(PT_NAMES);
    name = `${first} ${last}`;
    key = `${last!.toLowerCase()} ${first!.toLowerCase()}`;
  } else {
    const [surname, given, roman] = pick(JA_NAMES);
    name = `${surname} ${given}`;
    key = roman!;
  }

  extras.push({
    id,
    name,
    key,
    phone: `66${String(10 + Math.floor(random() * 80))} ${String(1000 + Math.floor(random() * 8999))}`,
    since: addDays("2018-01-01", Math.floor(random() * 2900)),
  });
}

type Span = { from: number; to: number };
const overlaps = (a: Span, b: Span) => a.from < b.to && b.from < a.to;

type Placed = {
  id: number;
  date: string;
  customerId: number | null;
  startsAt: number;
  endsAt: number;
  nominated: boolean;
  items: { serviceId: number; staffId: number; seatId: number; from: number; to: number }[];
};

/** Who and what is busy, per day. */
const seatBusy = new Map<string, Map<number, Span[]>>();
const staffBusy = new Map<string, Map<number, Span[]>>();

function busyFor(store: Map<string, Map<number, Span[]>>, date: string) {
  let day = store.get(date);
  if (!day) {
    day = new Map();
    store.set(date, day);
  }
  return day;
}

const free = (store: Map<string, Map<number, Span[]>>, date: string, id: number, span: Span) =>
  !(busyFor(store, date).get(id) ?? []).some((b) => overlaps(b, span));

function take(store: Map<string, Map<number, Span[]>>, date: string, id: number, span: Span) {
  const day = busyFor(store, date);
  const list = day.get(id) ?? [];
  list.push(span);
  day.set(id, list);
}

let bookingId = 1;
const placed: Placed[] = [];

/**
 * Try to put a booking on a day.
 *
 * Returns null when there is nowhere for it, which is the honest outcome: the
 * room fills up, and a generator that forces a booking in anyway produces
 * sample data the app's own rules would reject.
 */
function place(
  date: string,
  menu: number[],
  preferStylist: number | null,
  preferAt: number | null,
  customerId: number | null,
  nominated: boolean,
): Placed | null {
  const hours = OPEN[weekdayOf(date)];
  if (!hours) return null;

  const open = minutes(hours[0]);
  const close = minutes(hours[1]);

  const starts: number[] = [];
  if (preferAt !== null) starts.push(preferAt);
  for (let at = open; at < close; at += 15) if (at !== preferAt) starts.push(at);

  const stylists = preferStylist === null ? STYLISTS : [preferStylist, ...STYLISTS];

  for (const at of starts) {
    for (const stylist of stylists) {
      const items: Placed["items"] = [];
      let cursor = at;
      let ok = true;

      for (const serviceId of menu) {
        const service = SERVICE[serviceId]!;
        const span = { from: cursor, to: cursor + service.minutes };
        if (span.to > close) {
          ok = false;
          break;
        }

        // A shampoo is done by whoever is free, often the assistant. The
        // treatment itself stays with the stylist the guest came for.
        const who = service.seat === "shampoo" && chance(0.6) ? ASSISTANT : stylist;
        if (!free(staffBusy, date, who, span)) {
          ok = false;
          break;
        }

        const pool = service.seat === "styling" ? STYLING_SEATS : SHAMPOO_SEATS;
        const seat = pool.find((id) => free(seatBusy, date, id, span));
        if (seat === undefined) {
          ok = false;
          break;
        }

        items.push({ serviceId, staffId: who, seatId: seat, from: span.from, to: span.to });
        cursor = span.to;
      }

      if (!ok || items.length === 0) continue;

      for (const item of items) {
        take(staffBusy, date, item.staffId, { from: item.from, to: item.to });
        take(seatBusy, date, item.seatId, { from: item.from, to: item.to });
      }

      const booking: Placed = {
        id: bookingId++,
        date,
        customerId,
        startsAt: items[0]!.from,
        endsAt: items[items.length - 1]!.to,
        nominated,
        items,
      };
      placed.push(booking);
      return booking;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// The twelve named guests first, so that their preferred times are available.

const bookingRows: string[] = [];
const itemRows: string[] = [];
const eventRows: string[] = [];

let itemId = 1;
let eventId = 1;

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

function record(
  booking: Placed,
  status: string,
  history: { at: number; kind: string; before: string | null; after: string | null }[],
  source: string,
) {
  bookingRows.push(
    `  (${booking.id}, ${booking.customerId ?? "NULL"}, ${quote(booking.date)}, ` +
      `${quote(clock(booking.startsAt))}, ${quote(clock(booking.endsAt))}, ${quote(status)}, ` +
      `${booking.nominated ? 1 : 0}, ${quote(source)}, NULL)`,
  );

  booking.items.forEach((item, index) => {
    itemRows.push(
      `  (${itemId++}, ${booking.id}, ${item.serviceId}, ${item.staffId}, ${item.seatId}, ` +
        `${quote(clock(item.from))}, ${quote(clock(item.to))}, ${index})`,
    );
  });

  for (const event of history) {
    eventRows.push(
      `  (${eventId++}, ${booking.id}, ${event.at}, ${quote(event.kind)}, ` +
        `${event.before === null ? "NULL" : quote(event.before)}, ` +
        `${event.after === null ? "NULL" : quote(event.after)}, NULL)`,
    );
  }
}

for (const guest of GUESTS) {
  // Start them at a scattered point in the first interval, so twelve people
  // do not all arrive in the same week.
  let date = addDays(FROM, Math.floor(random() * guest.every));

  while (date <= TO) {
    const wanted = date;
    let on = date;
    // Push to the next open day.
    for (let tries = 0; tries < 7 && !OPEN[weekdayOf(on)]; tries++) on = addDays(on, 1);

    const preferAt = [10 * 60 + 30, 13 * 60, 15 * 60, 17 * 60 + 30][Math.floor(random() * 4)]!;
    const booking = place(on, guest.menu, guest.usual, preferAt, guest.id, chance(0.8));

    if (booking) {
      const history: { at: number; kind: string; before: string | null; after: string | null }[] = [];

      // Taken somewhere between a fortnight and a day before.
      const takenOn = addDays(booking.date, -(1 + Math.floor(random() * 13)));
      history.push({
        at: stamp(takenOn, "11:00"),
        kind: "created",
        before: null,
        after: `${booking.date} ${clock(booking.startsAt)}`,
      });

      // Moves. The time it ended up at is the one in the row, so the earlier
      // times are invented backwards from it.
      if (chance(guest.moves)) {
        const times = 1 + (chance(0.4) ? 1 : 0);
        let previous = clock(booking.startsAt - 15 * (times + 1));
        for (let i = 0; i < times; i++) {
          const next = i === times - 1 ? clock(booking.startsAt) : clock(booking.startsAt - 15);
          history.push({
            at: stamp(addDays(booking.date, -(times - i) * 2), "15:00"),
            kind: "moved",
            before: `${booking.date} ${previous}`,
            after: `${booking.date} ${next}`,
          });
          previous = next;
        }
      }

      let status: string;
      if (booking.date >= TODAY) {
        status = "booked";
      } else if (chance(guest.noShow)) {
        status = "no_show";
        history.push({
          at: stamp(booking.date, clock(booking.endsAt)),
          kind: "status",
          before: "booked",
          after: "no_show",
        });
      } else if (chance(guest.cancels)) {
        status = "cancelled";
        // On the day, or a comfortable few days out. The gap is the whole
        // point of keeping `at`.
        const when = chance(guest.late)
          ? { date: booking.date, time: clock(Math.max(9 * 60, booking.startsAt - 120)) }
          : { date: addDays(booking.date, -(3 + Math.floor(random() * 5))), time: "12:00" };
        history.push({
          at: stamp(when.date, when.time),
          kind: "status",
          before: "booked",
          after: "cancelled",
        });
      } else {
        status = "done";
        history.push({
          at: stamp(booking.date, clock(booking.endsAt)),
          kind: "status",
          before: "booked",
          after: "done",
        });
      }

      record(booking, status, history, pick(["staff", "staff", "phone", "wechat"]));
    }

    date = addDays(wanted, guest.every + Math.floor(random() * 11) - 5);
  }
}

// Everybody else, to fill the room. No history beyond being taken: these
// stand for the shop's ordinary traffic, and giving all of them stories would
// make the twelve who have one impossible to pick out.
function weightedMenu(): number[] {
  const total = WALK_IN_MENUS.reduce((sum, m) => sum + m.weight, 0);
  let point = random() * total;
  for (const menu of WALK_IN_MENUS) {
    point -= menu.weight;
    if (point <= 0) return menu.items;
  }
  return WALK_IN_MENUS[0]!.items;
}

function demandAt(hour: number): number {
  if (hour < 11) return 0.35;
  if (hour < 14) return 0.75;
  if (hour < 17) return 0.6;
  return 1;
}

for (let date = FROM; date <= TO; date = addDays(date, 1)) {
  const hours = OPEN[weekdayOf(date)];
  if (!hours) continue;

  const open = minutes(hours[0]);
  const close = minutes(hours[1]);

  for (let at = open; at < close; at += 15) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (random() > demandAt(Math.floor(at / 60)) * 0.5) continue;

      // Most of the book belongs to somebody on file. A salon does take
      // walk-ins, so a fifth of them stay nameless rather than pretending
      // every guest was registered.
      const who = chance(0.8) ? pick(extras).id : null;
      const booking = place(date, weightedMenu(), null, at, who, chance(0.45));
      if (!booking) continue;

      const takenOn = addDays(booking.date, -(1 + Math.floor(random() * 10)));
      const history = [
        {
          at: stamp(takenOn, "11:00"),
          kind: "created",
          before: null,
          after: `${booking.date} ${clock(booking.startsAt)}`,
        },
      ];

      // A little ordinary churn, so that the twelve with a story stand out
      // against people rather than against a flat zero.
      if (chance(0.07)) {
        history.push({
          at: stamp(addDays(booking.date, -3), "15:00"),
          kind: "moved",
          before: `${booking.date} ${clock(Math.max(600, booking.startsAt - 30))}`,
          after: `${booking.date} ${clock(booking.startsAt)}`,
        });
      }

      let status = "booked";
      if (booking.date < TODAY) {
        const roll = random();
        status = roll < 0.04 ? "cancelled" : roll < 0.05 ? "no_show" : "done";
        history.push({
          at:
            status === "cancelled"
              ? stamp(addDays(booking.date, -2), "12:00")
              : stamp(booking.date, clock(booking.endsAt)),
          kind: "status",
          before: "booked",
          after: status,
        });
      }

      record(booking, status, history, pick(["staff", "staff", "staff", "phone", "wechat"]));
    }
  }
}

// ---------------------------------------------------------------------------

const sql = `-- Generated by scripts/generate-demo-bookings.ts. Do not edit by hand.
--
-- ${FROM} to ${TO}: ${bookingRows.length} bookings, ${itemRows.length} treatments,
-- ${eventRows.length} history rows. Mondays are missing because the shop is closed.
--
-- Every treatment sits on a seat and a stylist that were free at the time, so
-- the sample obeys the same rules the booking screen enforces.
--
-- Twelve of the guests behave like people rather than like rows: one
-- reschedules constantly, one cancels the morning of, one does not turn up.
-- Those are what the customers screen counts, and a week of tidy bookings
-- would show none of them.
--
-- **This file owns the sample.** It clears what is there and writes it again,
-- so that changing the generator changes what the public instance shows. A
-- booking somebody made by clicking around the demo does not survive the next
-- deploy — which is what a demo should do. A shop would never apply this file.

-- A record can point at the visit it was taken during, and the reference has
-- no cascade on it — deliberately, because losing the note when a booking is
-- tidied away would be the wrong trade. So the link is cut first, and the
-- records themselves stay.
UPDATE records SET booking_id = NULL;

DELETE FROM booking_events;
DELETE FROM booking_items;
DELETE FROM bookings;

INSERT INTO bookings (id, customer_id, date, starts_at, ends_at, status, nominated, source, note) VALUES
${bookingRows.join(",\n")};

INSERT INTO booking_items (id, booking_id, service_id, staff_id, seat_id, starts_at, ends_at, sort_order) VALUES
${itemRows.join(",\n")};

INSERT INTO booking_events (id, booking_id, at, kind, before, after, by_staff_id) VALUES
${eventRows.join(",\n")};
`;

const customerSql = `-- Generated by scripts/generate-demo-bookings.ts. Do not edit by hand.
--
-- ${extras.length} invented guests, beyond the twelve written by hand in
-- demo.sql. Surnames and given names combined at random, mostly Cantonese
-- with some Portuguese and Japanese — which is what a salon in Macau looks
-- like. **None of them is anybody.**
--
-- Ids start at ${EXTRA_FROM} so the twelve keep 1 to 12.

DELETE FROM customers WHERE id >= ${EXTRA_FROM};

INSERT INTO customers (id, name, search_key, phone, note, first_visit_on) VALUES
${extras
  .map((e) => `  (${e.id}, ${quote(e.name)}, ${quote(e.key)}, ${quote(e.phone)}, NULL, ${quote(e.since)})`)
  .join(",\n")};
`;

// How many bookings this file puts in. The deploy reads it and skips the
// whole thing when the database already holds exactly that many — a megabyte
// of DELETE and INSERT on every push is a quarter of a day's free writes for
// no change at all.
writeFileSync(new URL("../seed/demo-bookings.count", import.meta.url), `${bookingRows.length}
`);
writeFileSync(new URL("../seed/demo-customers.sql", import.meta.url), customerSql);
writeFileSync(new URL("../seed/demo-bookings.sql", import.meta.url), sql);
console.log(
  `seed/demo-bookings.sql: ${bookingRows.length} bookings, ${itemRows.length} treatments, ${eventRows.length} events`,
);
