// What the API sends back. Written out here rather than inferred, because the
// screen and the Worker are compiled separately and a shape that only exists
// in one of them is how the two drift apart.

export type Seat = { id: number; name: string; kind: "styling" | "shampoo" };
export type Person = { id: number; name: string; role: string; color: string | null };
export type Room = { seats: Seat[]; staff: Person[] };

export type Status = "booked" | "arrived" | "done" | "cancelled" | "no_show";

/**
 * One treatment, not one booking. A guest who is shampooed and then cut
 * appears twice, on two different seats — which is the thing a single row
 * per booking could not say.
 */
export type Line = {
  itemId: number;
  bookingId: number;
  seatId: number | null;
  staffId: number | null;
  staffName: string | null;
  staffColor: string | null;
  serviceId: number | null;
  serviceJa: string | null;
  serviceEn: string | null;
  startsAt: string;
  endsAt: string;
  customerId: number | null;
  customerName: string | null;
  status: Status;
  nominated: boolean;
  source: string;
};

export type Day = {
  date: string;
  weekday: number;
  hours: { opensAt: string | null; closesAt: string | null; closed: boolean };
  closure: { reason: string | null } | null;
  holidays: { region: "MO" | "HK" | "CN"; name: string }[];
  lines: Line[];
  /** Only present when the requested day has nothing on it. */
  bookedRange?: { from: string | null; to: string | null };
};

/** "14:30" to 870. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Today in the shop's time, not the visitor's.
 *
 * Someone looking at this from Tokyo or Lisbon should see the shop's day.
 * Macau does not observe daylight saving, so a fixed +8 stays correct.
 */
export function todayInShop(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
export const weekdayName = (n: number) => WEEKDAYS[n] ?? "";
