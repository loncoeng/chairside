// The table definitions. This is the only copy, and all three environments
// use it:
//
//   Cloudflare Workers + D1        the shop's production
//   Node + a SQLite file           if the shop keeps it on one PC
//   SQLite in the browser (WASM)   the public demo
//
// D1 is SQLite underneath, so the schema and the queries carry across
// unchanged. Choosing MySQL or PostgreSQL here would close off both the
// on-premise option and the demo.

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/**
 * Staff.
 *
 * **Never deleted.** Removing someone takes them out of bookings that already
 * happened, and per-stylist revenue stops adding up. People who have left
 * simply stop appearing as a choice on new bookings.
 */
export const staff = sqliteTable(
  "staff",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    /** An owner sees settings and revenue; a stylist sees their own day. */
    role: text("role", { enum: ["owner", "stylist", "assistant"] }).notNull().default("stylist"),
    /** Colour on the calendar. */
    color: text("color"),
    joinedOn: text("joined_on"),
    /** NULL while they are still here. A date removes them from new bookings. */
    leftOn: text("left_on"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("staff_left_on_idx").on(t.leftOn)],
);

/**
 * Seats. The count and the ceiling differ by kind.
 *
 * There is only one more styling chair than there are stylists, and during a
 * colour's processing time one stylist occupies two of them. Shampoo stations
 * number three and are contested in the evening. Held together as one
 * undifferentiated "seat", that difference disappears.
 */
export const seats = sqliteTable("seats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["styling", "shampoo"] }).notNull(),
  /** Retired seats stay: past bookings still point at them. */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Customers. */
export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Held exactly as typed. Kanji, kana and Latin script all turn up. */
    name: text("name").notNull(),
    /** A second spelling to search by — a reading, or Latin. Optional. */
    searchKey: text("search_key"),
    phone: text("phone"),
    note: text("note"),
    firstVisitOn: text("first_visit_on"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("customers_name_idx").on(t.name), index("customers_phone_idx").on(t.phone)],
);

/**
 * The menu. Names carry three languages.
 *
 * Interface strings belong in a dictionary file, but menu names are data the
 * shop types in, so they have to be columns rather than translations.
 */
export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameJa: text("name_ja").notNull(),
  nameZh: text("name_zh"),
  nameEn: text("name_en"),
  /** Default length in minutes, used when building a booking. */
  durationMin: integer("duration_min").notNull().default(30),
  /** Which kind of seat this occupies. NULL takes no seat at all. */
  seatKind: text("seat_kind", { enum: ["styling", "shampoo"] }),
  /** The list price. What was actually taken lives in `payments`. */
  price: real("price"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Bookings.
 *
 * `source` exists so that adding online booking later is an addition rather
 * than a rewrite. Only `staff` is written today, but the column is there.
 */
export const bookings = sqliteTable(
  "bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").references(() => customers.id),
    /** YYYY-MM-DD in the shop's local time. */
    date: text("date").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    status: text("status", {
      enum: ["booked", "arrived", "done", "cancelled", "no_show"],
    })
      .notNull()
      .default("booked"),
    /** Requested by name, or whoever is free. Feeds commission and review. */
    nominated: integer("nominated", { mode: "boolean" }).notNull().default(false),
    source: text("source", { enum: ["staff", "wechat", "phone", "online"] })
      .notNull()
      .default("staff"),
    note: text("note"),
    createdAt: integer("created_at").notNull().default(now),
  },
  // The calendar reads by date. Without this index the first year runs fine
  // and the third year hits D1's examined-rows ceiling and stops.
  (t) => [index("bookings_date_idx").on(t.date), index("bookings_customer_idx").on(t.customerId)],
);

/**
 * One line per treatment. A booking holds several.
 *
 * A single service per booking cannot express a stylist changing partway
 * through — starting another guest while a colour processes, which is
 * ordinary here. One-to-many from the start avoids rebuilding it later.
 */
export const bookingItems = sqliteTable(
  "booking_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    serviceId: integer("service_id").references(() => services.id),
    staffId: integer("staff_id").references(() => staff.id),
    seatId: integer("seat_id").references(() => seats.id),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("booking_items_booking_idx").on(t.bookingId),
    index("booking_items_staff_idx").on(t.staffId),
  ],
);

/**
 * The currencies the shop takes, at the rate the shop sets.
 *
 * Not a market rate. Most shops in Macau work at 1:1:1 and 1:1.03 turns up
 * occasionally. Nothing is fetched, so this works offline.
 */
export const currencies = sqliteTable("currencies", {
  code: text("code").primaryKey(),
  /** Against the base currency (MOP). */
  rateToBase: real("rate_to_base").notNull().default(1),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Payments.
 *
 * **The rate is copied in at the moment of payment.** Change the configured
 * rate later and past takings stay where they were. A record of money
 * received must not move after the fact.
 */
export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    /** What was handed over, in the currency it was handed over in. */
    amount: real("amount").notNull(),
    currency: text("currency").notNull(),
    /** A copy of the configured rate as it stood at the time. */
    rateToBase: real("rate_to_base").notNull(),
    method: text("method", { enum: ["cash", "card", "wechat", "alipay", "other"] })
      .notNull()
      .default("cash"),
    paidAt: integer("paid_at").notNull().default(now),
  },
  (t) => [index("payments_booking_idx").on(t.bookingId), index("payments_paid_at_idx").on(t.paidAt)],
);

/**
 * Treatment records — the most valuable thing a salon keeps.
 *
 * "The same as last time" has to be answerable. This is most likely what the
 * spreadsheet was really for.
 */
export const records = sqliteTable(
  "records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    bookingId: integer("booking_id").references(() => bookings.id),
    /** Colour mix, perm solution and processing time, and so on. */
    formula: text("formula"),
    note: text("note"),
    /** Allergies, a tender scalp — anything that belongs to the person. */
    caution: text("caution"),
    recordedOn: text("recorded_on").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("records_customer_idx").on(t.customerId)],
);

/** Opening hours, one row per weekday. Settings do not go in one big blob. */
export const businessHours = sqliteTable(
  "business_hours",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** 0 = Sunday through 6 = Saturday. */
    weekday: integer("weekday").notNull(),
    opensAt: text("opens_at"),
    closesAt: text("closes_at"),
    closed: integer("closed", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [uniqueIndex("business_hours_weekday_key").on(t.weekday)],
);

/** One-off closures, kept apart from the weekly pattern. */
export const closures = sqliteTable("closures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  reason: text("reason"),
});

/**
 * Holidays for Macau, Hong Kong and the mainland.
 *
 * `date-holidays` covers 207 countries and omits Macau. Nager.Date has no
 * Macau either and returns six entries for China against a real figure near
 * fifteen. Google's calendar feeds cover all three, so they are imported once
 * a year.
 *
 * `source` and `fetchedOn` record **what this came from and when**. Entering
 * a year with nothing on file puts a notice on screen rather than showing an
 * empty calendar.
 */
export const holidays = sqliteTable(
  "holidays",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    region: text("region", { enum: ["MO", "HK", "CN"] }).notNull(),
    date: text("date").notNull(),
    name: text("name").notNull(),
    source: text("source").notNull(),
    fetchedOn: text("fetched_on").notNull(),
  },
  (t) => [
    uniqueIndex("holidays_region_date_key").on(t.region, t.date),
    index("holidays_date_idx").on(t.date),
  ],
);
