// Writes seed/demo-bookings.sql: a week of invented bookings for the public
// instance.
//
// Generated rather than typed out, because a hand-written week puts two
// guests in one chair by the third day. This places every treatment against
// the seats and the stylists that are actually free, which is the same
// constraint the booking screen enforces — so the sample data cannot
// contradict the rules the app is about.
//
// Run it with `npm run demo:bookings`. The output is committed.
//
//   node scripts/generate-demo-bookings.ts

import { writeFileSync } from "node:fs";

/** Monday of the sample week. Deliberately fixed: see DESIGN.md. */
const WEEK_START = "2026-09-21";

const OPEN = { 0: ["10:00", "19:00"], 2: ["10:00", "20:00"], 3: ["10:00", "20:00"], 4: ["10:00", "20:00"], 5: ["10:00", "20:00"], 6: ["10:00", "20:00"] } as Record<number, [string, string]>;
// Monday (1) is missing on purpose — the shop is closed.

const STYLING_SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SHAMPOO_SEATS = [10, 11, 12];
/** Stylists who take bookings. 1 is the owner, 8 is an assistant. */
const STYLISTS = [1, 2, 3, 4, 5, 6, 7];
const ASSISTANT = 8;

type Service = { id: number; minutes: number; seat: "styling" | "shampoo" };
const SERVICE: Record<number, Service> = {
  1: { id: 1, minutes: 45, seat: "styling" },
  2: { id: 2, minutes: 30, seat: "styling" },
  3: { id: 3, minutes: 15, seat: "styling" },
  4: { id: 4, minutes: 20, seat: "shampoo" },
  5: { id: 5, minutes: 25, seat: "styling" },
  6: { id: 6, minutes: 90, seat: "styling" },
  7: { id: 7, minutes: 120, seat: "styling" },
  8: { id: 8, minutes: 180, seat: "styling" },
  9: { id: 9, minutes: 30, seat: "shampoo" },
  10: { id: 10, minutes: 40, seat: "shampoo" },
};

/**
 * What people actually book: a shampoo, then the treatment itself.
 *
 * The shampoo is a separate line on a different seat, which is the reason
 * booking_items is one-to-many. A single service per booking could not say
 * that the guest moves.
 */
const MENUS: { items: number[]; weight: number }[] = [
  { items: [4, 1], weight: 30 }, // shampoo then cut
  { items: [2], weight: 14 }, // men's cut, straight to the chair
  { items: [4, 6], weight: 12 }, // shampoo then colour
  { items: [4, 1, 9], weight: 8 }, // cut with a treatment after
  { items: [3], weight: 7 }, // fringe trim
  { items: [4, 5], weight: 7 }, // shampoo and blow-dry
  { items: [10, 1], weight: 6 }, // head spa then cut
  { items: [4, 7], weight: 5 }, // perm
  { items: [4, 8], weight: 3 }, // straightening, most of an afternoon
  { items: [9], weight: 4 }, // treatment only
  { items: [4, 6, 1], weight: 4 }, // colour and cut
];

// A fixed sequence, so regenerating produces the same week. Math.random would
// make every run a diff.
let seed = 20260921;
function random(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(list: readonly T[]): T {
  return list[Math.floor(random() * list.length)]!;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}
function clock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Span = { from: number; to: number };
const overlaps = (a: Span, b: Span) => a.from < b.to && b.from < a.to;

type Item = { serviceId: number; staffId: number; seatId: number; from: number; to: number };

/**
 * How busy each hour is. Evenings fill up and the shampoo stations are the
 * first thing to run out — three of them against nine chairs is the whole
 * reason they are counted separately.
 */
function demandAt(hour: number): number {
  if (hour < 11) return 0.35;
  if (hour < 14) return 0.75;
  if (hour < 17) return 0.6;
  return 1;
}

function buildDay(date: string, weekday: number) {
  const hours = OPEN[weekday];
  if (!hours) return { bookings: [], items: [] as Item[][] };

  const [opensAt, closesAt] = hours;
  const open = minutes(opensAt);
  const close = minutes(closesAt);

  const seatBusy = new Map<number, Span[]>();
  const staffBusy = new Map<number, Span[]>();
  const free = (busy: Map<number, Span[]>, id: number, span: Span) =>
    !(busy.get(id) ?? []).some((b) => overlaps(b, span));
  const take = (busy: Map<number, Span[]>, id: number, span: Span) => {
    const list = busy.get(id) ?? [];
    list.push(span);
    busy.set(id, list);
  };

  const bookings: { start: number; end: number; items: Item[] }[] = [];

  // Walk the day in quarter hours and try to start several things at each
  // one. One attempt per slot leaves nine chairs looking half empty, which
  // hides the thing this schema exists to show: the shampoo stations run out
  // long before the chairs do.
  for (let at = open; at < close; at += 15) {
    const wanted = demandAt(Math.floor(at / 60));
    for (let attempt = 0; attempt < 4; attempt++) {
      if (random() > wanted * 0.55) continue;
      tryBooking(at);
    }
  }

  function tryBooking(at: number) {
    const menu = weightedMenu();
    const stylist = pick(STYLISTS);

    const items: Item[] = [];
    let cursor = at;
    let placed = true;

    for (const serviceId of menu) {
      const service = SERVICE[serviceId]!;
      const span = { from: cursor, to: cursor + service.minutes };
      if (span.to > close) {
        placed = false;
        break;
      }

      // A shampoo is done by whoever is free, often the assistant. The
      // treatment itself stays with the stylist the guest came for.
      const who = service.seat === "shampoo" && random() < 0.6 ? ASSISTANT : stylist;
      if (!free(staffBusy, who, span)) {
        placed = false;
        break;
      }

      const pool = service.seat === "styling" ? STYLING_SEATS : SHAMPOO_SEATS;
      const seat = pool.find((id) => free(seatBusy, id, span));
      if (seat === undefined) {
        placed = false;
        break;
      }

      items.push({ serviceId, staffId: who, seatId: seat, from: span.from, to: span.to });
      cursor = span.to;
    }

    if (!placed || items.length === 0) return;

    for (const item of items) {
      take(staffBusy, item.staffId, { from: item.from, to: item.to });
      take(seatBusy, item.seatId, { from: item.from, to: item.to });
    }
    bookings.push({ start: items[0]!.from, end: items[items.length - 1]!.to, items });
  }

  return { bookings };
}

function weightedMenu(): number[] {
  const total = MENUS.reduce((sum, m) => sum + m.weight, 0);
  let point = random() * total;
  for (const menu of MENUS) {
    point -= menu.weight;
    if (point <= 0) return menu.items;
  }
  return MENUS[0]!.items;
}

// ---------------------------------------------------------------------------

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const bookingRows: string[] = [];
const itemRows: string[] = [];

let bookingId = 1;
let itemId = 1;

for (let offset = 0; offset < 7; offset++) {
  const date = addDays(WEEK_START, offset);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const { bookings } = buildDay(date, weekday);

  for (const booking of bookings) {
    // Most days are done; today and later are still booked. The sample week
    // is fixed, so this is decided by position in the week rather than by
    // the clock.
    const status = offset <= 1 ? "done" : offset === 2 ? pick(["done", "arrived", "booked"]) : "booked";
    const customerId = 1 + Math.floor(random() * 12);
    const nominated = random() < 0.55 ? 1 : 0;
    const source = pick(["staff", "staff", "phone", "wechat"]);

    bookingRows.push(
      `  (${bookingId}, ${customerId}, ${quote(date)}, ${quote(clock(booking.start))}, ` +
        `${quote(clock(booking.end))}, ${quote(status)}, ${nominated}, ${quote(source)}, NULL)`,
    );

    booking.items.forEach((item, index) => {
      itemRows.push(
        `  (${itemId}, ${bookingId}, ${item.serviceId}, ${item.staffId}, ${item.seatId}, ` +
          `${quote(clock(item.from))}, ${quote(clock(item.to))}, ${index})`,
      );
      itemId++;
    });

    bookingId++;
  }
}

const sql = `-- Generated by scripts/generate-demo-bookings.ts. Do not edit by hand.
--
-- A week of invented bookings for the public instance, ${WEEK_START} to
-- ${addDays(WEEK_START, 6)}. Monday is missing because the shop is closed.
--
-- Every treatment is placed against a seat and a stylist that were free at
-- the time, so the sample week obeys the same rules the booking screen
-- enforces. ${bookingRows.length} bookings, ${itemRows.length} lines.
--
-- INSERT OR IGNORE with the ids written out, so re-running it on every deploy
-- adds nothing the second time.

INSERT OR IGNORE INTO bookings (id, customer_id, date, starts_at, ends_at, status, nominated, source, note) VALUES
${bookingRows.join(",\n")};

INSERT OR IGNORE INTO booking_items (id, booking_id, service_id, staff_id, seat_id, starts_at, ends_at, sort_order) VALUES
${itemRows.join(",\n")};
`;

writeFileSync(new URL("../seed/demo-bookings.sql", import.meta.url), sql);
console.log(`seed/demo-bookings.sql: ${bookingRows.length} bookings, ${itemRows.length} lines`);
