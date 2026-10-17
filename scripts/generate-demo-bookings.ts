// Generates about three months of sample bookings, with history and payments, into seed/.
// Every treatment is placed on a free seat and stylist, as the booking screen requires.
//
// Run with `npm run demo:bookings`. The output is committed.

import { writeFileSync } from "node:fs";

/** Date range of the sample. */
const FROM = "2026-07-01";
const TO = "2026-09-30";
/** Bookings on or after this date stay `booked`. */
const TODAY = "2026-09-24";

const OPEN: Record<number, [string, string]> = {
  0: ["10:00", "19:00"],
  2: ["10:00", "20:00"],
  3: ["10:00", "20:00"],
  4: ["10:00", "20:00"],
  5: ["10:00", "20:00"],
  6: ["10:00", "20:00"],
};
// Closed on Monday (1).

const STYLING_SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SHAMPOO_SEATS = [10, 11, 12];
const STYLISTS = [1, 2, 3, 4, 5, 6, 7];
const ASSISTANT = 8;

type Service = { minutes: number; seat: "styling" | "shampoo"; price: number };
/** Must match seed/demo.sql. `price` is the flat price. */
const SERVICE: Record<number, Service> = {
  1: { minutes: 45, seat: "styling", price: 450 },
  3: { minutes: 15, seat: "styling", price: 150 },
  4: { minutes: 20, seat: "shampoo", price: 180 },
  5: { minutes: 25, seat: "styling", price: 280 },
  6: { minutes: 90, seat: "styling", price: 980 },
  7: { minutes: 120, seat: "styling", price: 1280 },
  8: { minutes: 180, seat: "styling", price: 2200 },
  9: { minutes: 30, seat: "shampoo", price: 580 },
  10: { minutes: 40, seat: "shampoo", price: 680 },
};

/** Per-grade prices for services that depend on the stylist. Must match seed/demo.sql. */
const BY_GRADE: Record<number, Record<string, number>> = {
  1: { owner: 750, stylist1: 450, stylist2: 300 },
  5: { owner: 380, stylist1: 280, stylist2: 220 },
  6: { owner: 1500, stylist1: 980, stylist2: 780 },
  7: { owner: 1800, stylist1: 1280, stylist2: 980 },
  8: { owner: 2800, stylist1: 2200, stylist2: 1800 },
};

/** Staff id to grade. Must match seed/demo.sql. */
const GRADE: Record<number, string> = {
  1: "owner",
  2: "stylist1",
  3: "stylist1",
  4: "stylist2",
  5: "stylist2",
  6: "stylist2",
  7: "stylist2",
  8: "assistant",
};

const priceOf = (serviceId: number, staffId: number | null): number => {
  const grade = staffId === null ? undefined : GRADE[staffId];
  const byGrade = grade === undefined ? undefined : BY_GRADE[serviceId]?.[grade];
  return byGrade ?? SERVICE[serviceId]?.price ?? 0;
};

/**
 * Accepted currencies and payment methods. All currencies at 1:1, as most Macau shops do.
 * The rate is stored on each payment so a later policy change does not alter past takings.
 */
const CURRENCIES: { code: string; weight: number }[] = [
  { code: "MOP", weight: 70 },
  { code: "HKD", weight: 25 },
  { code: "CNY", weight: 5 },
];
const METHODS: { name: string; weight: number }[] = [
  { name: "mpay", weight: 26 },
  { name: "cash", weight: 22 },
  { name: "wechat", weight: 18 },
  { name: "card", weight: 15 },
  { name: "boc", weight: 11 },
  { name: "alipay", weight: 8 },
];

function weighted<T extends { weight: number }>(list: T[]): T {
  const total = list.reduce((sum, x) => sum + x.weight, 0);
  let point = random() * total;
  for (const item of list) {
    point -= item.weight;
    if (point <= 0) return item;
  }
  return list[0]!;
}

/**
 * The twelve named guests. `every` is days between visits, `usual` the preferred stylist,
 * the rest are per-booking probabilities. Deliberately uneven so the customers screen shows differences.
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
  // Reschedules constantly.
  { id: 3, every: 13, usual: 4, menu: [4, 1], moves: 0.9, cancels: 0.1, late: 0.4, noShow: 0 },
  { id: 4, every: 38, usual: 6, menu: [4, 5], moves: 0.1, cancels: 0.05, late: 0.2, noShow: 0 },
  { id: 5, every: 34, usual: 5, menu: [4, 8], moves: 0.15, cancels: 0.05, late: 0.2, noShow: 0 },
  // Cancels, usually on the day.
  { id: 6, every: 13, usual: 7, menu: [10, 1], moves: 0.2, cancels: 0.5, late: 0.9, noShow: 0 },
  { id: 7, every: 31, usual: 2, menu: [4, 1, 9], moves: 0.1, cancels: 0.04, late: 0.2, noShow: 0 },
  { id: 8, every: 21, usual: 3, menu: [3], moves: 0.08, cancels: 0.03, late: 0.2, noShow: 0 },
  { id: 9, every: 44, usual: 1, menu: [4, 1], moves: 0.12, cancels: 0.06, late: 0.3, noShow: 0 },
  // No-shows, counted separately from cancellations.
  { id: 10, every: 14, usual: 6, menu: [4, 1], moves: 0.15, cancels: 0.08, late: 0.5, noShow: 0.4 },
  { id: 11, every: 27, usual: 5, menu: [4, 6], moves: 0.1, cancels: 0.04, late: 0.2, noShow: 0 },
  { id: 12, every: 40, usual: 4, menu: [3], moves: 0.06, cancels: 0.04, late: 0.2, noShow: 0 },
];

/**
 * Name pools for the other generated guests: mostly Cantonese, some Portuguese and
 * Japanese, matching a Macau salon. All names are fictional.
 */
const ZH_SURNAMES =
  "陳李黃張梁何吳劉蔡楊鄭謝許羅高林周葉朱馮曾徐胡盧邱蘇余潘杜江".split("");
const ZH_GIVEN: [string, string][] = [
  ["嘉欣", "ka yan"], ["俊傑", "chun kit"], ["美玲", "mei ling"], ["志强", "chi keung"],
  ["詩華", "sze wah"], ["偉明", "wai ming"], ["曉晴", "hiu ching"], ["文健", "man kin"],
  ["雅婷", "nga ting"], ["家豪", "ka ho"], ["淑芬", "suk fan"], ["建華", "kin wah"],
  ["芷若", "tsz yeuk"], ["少聰", "siu chung"], ["慧敏", "wai man"], ["國強", "kwok keung"],
  ["秀蘭", "sau lan"], ["子軒", "tsz hin"], ["雨桐", "yu tung"], ["浩然", "ho yin"],
  ["佩珊", "pui shan"], ["敏儀", "man yee"], ["志偉", "chi wai"], ["麗珍", "lai chun"],
  ["家儀", "ka yee"], ["國榮", "kwok wing"], ["穎琳", "wing lam"], ["天佑", "tin yau"],
  ["嘉輝", "ka fai"], ["月娥", "yuet ngo"],
];

const PT_FIRST = [
  "Ana", "João", "Rita", "Carlos", "Sofia", "Miguel", "Inês", "Paulo",
  "Marta", "Tiago", "Beatriz", "Rui", "Helena", "Nuno", "Catarina", "André",
];
const PT_LAST = [
  "Silva", "Pereira", "Costa", "Lopes", "Martins", "Ferreira", "Rocha", "Dias",
  "Sousa", "Almeida", "Gomes", "Carvalho", "Teixeira", "Moreira", "Azevedo", "Barbosa",
];

const JA_SURNAMES: [string, string][] = [
  ["佐藤", "sato"], ["鈴木", "suzuki"], ["高橋", "takahashi"], ["伊藤", "ito"],
  ["中村", "nakamura"], ["小林", "kobayashi"], ["山田", "yamada"], ["松本", "matsumoto"],
  ["井上", "inoue"], ["木村", "kimura"], ["清水", "shimizu"], ["森田", "morita"],
];
const JA_GIVEN: [string, string][] = [
  ["健", "ken"], ["花", "hana"], ["翔", "sho"], ["凛", "rin"], ["葵", "aoi"],
  ["蓮", "ren"], ["結衣", "yui"], ["大和", "yamato"], ["咲", "saki"], ["悠真", "yuma"],
  ["美月", "mizuki"], ["陽向", "hinata"],
];

/** Number of generated guests beyond the named twelve. */
const EXTRA_GUESTS = 240;
/** First generated guest id. The named twelve use 1 to 12. */
const EXTRA_FROM = 101;

/** Menus for the generated guests' bookings. */
const WALK_IN_MENUS: { items: number[]; weight: number }[] = [
  { items: [4, 1], weight: 38 },
  { items: [4, 6], weight: 12 },
  { items: [3], weight: 8 },
  { items: [4, 5], weight: 8 },
  { items: [10, 1], weight: 6 },
  { items: [4, 7], weight: 5 },
  { items: [4, 8], weight: 3 },
  { items: [9], weight: 5 },
  { items: [4, 1, 9], weight: 7 },
];

// Seeded PRNG so regeneration is deterministic (Math.random would change the output every run).
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

/** Names already used. A duplicate is redrawn so customer search stays usable. */
const takenNames = new Set<string>();

/** Phone number formats: Macau, Hong Kong and mainland China. */
const DIALLING: { code: string; weight: number; make: () => string }[] = [
  { code: "+853", weight: 72, make: () => `6${digits(3)} ${digits(4)}` },
  { code: "+852", weight: 20, make: () => `${pick(["9", "6", "5"])}${digits(3)} ${digits(4)}` },
  { code: "+86", weight: 8, make: () => `1${pick(["3", "5", "7", "8"])}${digits(1)} ${digits(4)} ${digits(4)}` },
];

function digits(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += String(Math.floor(random() * 10));
  return out;
}

for (let i = 0; i < EXTRA_GUESTS; i++) {
  let name = "";
  let key = "";

  // About 1,200 possible names for 240 guests. The cap keeps a small pool from looping forever.
  for (let attempt = 0; attempt < 10; attempt++) {
    const roll = random();

    if (roll < 0.72) {
      const surname = pick(ZH_SURNAMES);
      const [given, roman] = pick(ZH_GIVEN);
      name = `${surname} ${given}`;
      key = roman;
    } else if (roll < 0.88) {
      const first = pick(PT_FIRST);
      const last = pick(PT_LAST);
      name = `${first} ${last}`;
      key = `${last.toLowerCase()} ${first.toLowerCase()}`;
    } else {
      const [surname, sroman] = pick(JA_SURNAMES);
      const [given, groman] = pick(JA_GIVEN);
      name = `${surname} ${given}`;
      key = `${sroman} ${groman}`;
    }

    if (!takenNames.has(name)) break;
  }

  takenNames.add(name);
  const dialling = weighted(DIALLING);

  extras.push({
    id: EXTRA_FROM + i,
    name,
    key,
    phone: `${dialling.code} ${dialling.make()}`,
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

/** Places a booking on the given day, or returns null when no seat and stylist are free. */
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

        // Shampoo often goes to the assistant; other treatments stay with the chosen stylist.
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
// Named guests first, so their preferred times are still free.

const bookingRows: string[] = [];
const itemRows: string[] = [];
const eventRows: string[] = [];
const paymentRows: string[] = [];

let itemId = 1;
let eventId = 1;
let paymentId = 1;

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

  // Payments only for completed visits. A 0 row would count as a paid visit.
  if (status === "done") {
    // Priced by the grade of whoever did each line.
    const list = booking.items.reduce(
      (sum, item) => sum + priceOf(item.serviceId, item.staffId),
      0,
    );
    // Round to 10, with an occasional discount or surcharge.
    const roll = random();
    const adjusted = roll < 0.08 ? list * 0.9 : roll < 0.12 ? list + 50 : list;
    const amount = Math.round(adjusted / 10) * 10;

    const currency = weighted(CURRENCIES).code;
    const method = weighted(METHODS).name;

    paymentRows.push(
      `  (${paymentId++}, ${booking.id}, ${amount}, ${quote(currency)}, 1, ${quote(method)}, ` +
        `${stamp(booking.date, clock(booking.endsAt))})`,
    );
  }

  for (const event of history) {
    eventRows.push(
      `  (${eventId++}, ${booking.id}, ${event.at}, ${quote(event.kind)}, ` +
        `${event.before === null ? "NULL" : quote(event.before)}, ` +
        `${event.after === null ? "NULL" : quote(event.after)}, NULL)`,
    );
  }
}

for (const guest of GUESTS) {
  // Random first visit within the first interval, so guests don't cluster.
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

      // Booked 1 to 13 days ahead.
      const takenOn = addDays(booking.date, -(1 + Math.floor(random() * 13)));
      history.push({
        at: stamp(takenOn, "11:00"),
        kind: "created",
        before: null,
        after: `${booking.date} ${clock(booking.startsAt)}`,
      });

      // The final time is the one in the row, so earlier times are derived backwards from it.
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
        // Late (same day) or 3 to 7 days ahead.
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

// Background traffic. Little history, so the named guests stand out.
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

      // Always attach a customer. The UI still handles none (shows 「未登録」), but
      // many nameless bookings made the demo calendar look broken.
      const who = pick(extras).id;
      const booking = place(date, weightedMenu(), null, at, who, chance(0.45));
      if (!booking) continue;

      const takenOn = addDays(booking.date, -(1 + Math.floor(random() * 10)));
      // Explicit type: otherwise `before: null` narrows the array and later pushes fail to compile.
      const history: { at: number; kind: string; before: string | null; after: string | null }[] = [
        {
          at: stamp(takenOn, "11:00"),
          kind: "created",
          before: null,
          after: `${booking.date} ${clock(booking.startsAt)}`,
        },
      ];

      // A little ordinary rescheduling as a baseline.
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

/** One INSERT per chunk of rows. A single 3,000-row statement fails with SQLITE_TOOBIG. */
function inserts(into: string, columns: string, rows: string[], per = 100): string {
  const out: string[] = [];
  const br = String.fromCharCode(10);
  for (let at = 0; at < rows.length; at += per) {
    const body = rows.slice(at, at + per).join("," + br);
    out.push(`INSERT INTO ${into} (${columns}) VALUES` + br + body + ";");
  }
  return out.join(br + br);
}

/**
 * Split into several files applied in order. One large `wrangler d1 execute` call
 * fails with `{"D1_RESET_DO":true}` (a per-call size limit, not per statement).
 * The delete runs first so inserts never race the cascade.
 */
const header = (what: string) => `-- Generated by scripts/generate-demo-bookings.ts. Do not edit by hand.
--
-- ${what}
--
-- ${FROM} to ${TO}: ${bookingRows.length} bookings, ${itemRows.length} treatments,
-- ${eventRows.length} history rows, ${paymentRows.length} payments. Mondays are
-- missing because the shop is closed.
--
-- Every treatment sits on a seat and a stylist that were free at the time, so
-- the sample obeys the same rules the booking screen enforces.
--
-- Twelve of the guests behave like people rather than like rows: one
-- reschedules constantly, one cancels the morning of, one does not turn up.
-- Those are what the customers screen counts, and a week of tidy bookings
-- would show none of them.
--
-- **These files own the sample.** They clear what is there and write it
-- again, so that changing the generator changes what the public instance
-- shows. A booking somebody made by clicking around the demo does not
-- survive the next deploy — which is what a demo should do. A shop would
-- never apply them.

`;

const br = String.fromCharCode(10);
const files: [string, string][] = [
  [
    "demo-clear.sql",
    header("Clears the sample before it is written again.") +
      `-- A record can point at the visit it was taken during, and the reference
-- has no cascade on it — deliberately, because losing the note when a
-- booking is tidied away would be the wrong trade. So the link is cut
-- first, and the records themselves stay.
UPDATE records SET booking_id = NULL;

DELETE FROM payments;
DELETE FROM booking_events;
DELETE FROM booking_items;
DELETE FROM bookings;
`,
  ],
  [
    "demo-bookings.sql",
    header("The bookings themselves.") +
      inserts(
        "bookings",
        "id, customer_id, date, starts_at, ends_at, status, nominated, source, note",
        bookingRows,
      ) +
      br,
  ],
  [
    "demo-items.sql",
    header("One row per treatment.") +
      inserts(
        "booking_items",
        "id, booking_id, service_id, staff_id, seat_id, starts_at, ends_at, sort_order",
        itemRows,
      ) +
      br,
  ],
  [
    "demo-events.sql",
    header("What happened to each booking after it was taken.") +
      inserts("booking_events", "id, booking_id, at, kind, before, after, by_staff_id", eventRows) +
      br,
  ],
  [
    "demo-payments.sql",
    header("What was handed over, and in what.") +
      inserts("payments", "id, booking_id, amount, currency, rate_to_base, method, paid_at", paymentRows) +
      br,
  ],
];

const customerSql = `-- Generated by scripts/generate-demo-bookings.ts. Do not edit by hand.
--
-- ${extras.length} invented guests, beyond the twelve written by hand in
-- demo.sql. Surnames and given names combined at random, mostly Cantonese
-- with some Portuguese and Japanese — which is what a salon in Macau looks
-- like. **None of them is anybody.**
--
-- Ids start at ${EXTRA_FROM} so the twelve keep 1 to 12.

DELETE FROM customers WHERE id >= ${EXTRA_FROM};

${inserts(
  "customers",
  "id, name, search_key, phone, note, first_visit_on",
  extras.map(
    (e) => `  (${e.id}, ${quote(e.name)}, ${quote(e.key)}, ${quote(e.phone)}, NULL, ${quote(e.since)})`,
  ),
)}
`;

// Booking count. The deploy skips reseeding when the database already has this many,
// since a full reseed uses about a quarter of D1's free daily writes.
writeFileSync(new URL("../seed/demo-bookings.count", import.meta.url), `${bookingRows.length}
`);
writeFileSync(new URL("../seed/demo-customers.sql", import.meta.url), customerSql);
for (const [name, body] of files) {
  writeFileSync(new URL(`../seed/${name}`, import.meta.url), body);
}
console.log(
  `seed/demo-bookings.sql: ${bookingRows.length} bookings, ${itemRows.length} treatments, ` +
    `${eventRows.length} events, ${paymentRows.length} payments`,
);
