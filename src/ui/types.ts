// API response shapes. Written out by hand because the UI and the Worker compile separately.

export type Seat = { id: number; name: string; kind: "styling" | "shampoo" };
export type Person = {
  id: number;
  name: string;
  role: string;
  /** Price grade. Separate from `role`, which sets permissions. */
  grade?: string;
  color: string | null;
};
export type Room = { seats: Seat[]; staff: Person[] };

export type Status = "booked" | "arrived" | "done" | "cancelled" | "no_show";

/** One treatment, not one booking. A booking may have several, on different seats. */
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
  /** The last date the imported holiday list reaches, or null if empty. */
  holidaysKnownTo?: string | null;
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

const MACAU = 8 * 60 * 60 * 1000;

/** Today's date in Macau (fixed UTC+8, no daylight saving), not the visitor's zone. */
export function todayInShop(now = Date.now()): string {
  return new Date(now + MACAU).toISOString().slice(0, 10);
}

/** The time in Macau as "HH:MM". */
export function timeInShop(now = Date.now()): string {
  return new Date(now + MACAU).toISOString().slice(11, 16);
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
export const weekdayName = (n: number) => WEEKDAYS[n] ?? "";
