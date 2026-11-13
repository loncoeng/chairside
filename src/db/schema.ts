// Table definitions, shared by D1 (production), Node + a SQLite file (on-premise)
// and sql.js in the browser (demo). All three are SQLite.

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/**
 * Staff. Never deleted: past bookings and per-stylist revenue reference them.
 * Set `leftOn` instead.
 */
export const staff = sqliteTable(
  "staff",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    /** Access level. See permissions.ts. */
    role: text("role", { enum: ["owner", "stylist", "assistant"] })
      .notNull()
      .default("stylist"),
    /**
     * Price tier (see `service_prices`). Separate from `role` so a promotion
     * doesn't change permissions.
     */
    grade: text("grade", { enum: ["owner", "stylist1", "stylist2", "assistant"] })
      .notNull()
      .default("stylist2"),
    /** Colour on the calendar. */
    color: text("color"),
    /** Sign-in name. null for staff who don't use the system but appear on bookings. */
    loginId: text("login_id"),
    /** Salted PBKDF2, `pbkdf2$<rounds>$<salt>$<hash>`. Never the plain password. */
    passwordHash: text("password_hash"),
    joinedOn: text("joined_on"),
    /** null while employed. Once set, they are hidden from new bookings. */
    leftOn: text("left_on"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("staff_left_on_idx").on(t.leftOn), uniqueIndex("staff_login_key").on(t.loginId)],
);

/** Seats. Styling chairs and shampoo stations are counted separately for capacity. */
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
    /** Stored as typed (kanji, kana or Latin). */
    name: text("name").notNull(),
    /** Optional alternate spelling for search (a reading or romanisation). */
    searchKey: text("search_key"),
    phone: text("phone"),
    /** Free text. Macau addresses mix Portuguese and Chinese and don't fit split fields. */
    address: text("address"),
    /** YYYY-MM-DD, optional. */
    birthday: text("birthday"),
    note: text("note"),
    firstVisitOn: text("first_visit_on"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("customers_name_idx").on(t.name), index("customers_phone_idx").on(t.phone)],
);

/** The menu. Names are shop-entered data, so each language is a column. */
export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameJa: text("name_ja").notNull(),
  nameZh: text("name_zh"),
  nameEn: text("name_en"),
  /** Default duration in minutes. */
  durationMin: integer("duration_min").notNull().default(30),
  /** Seat kind this occupies; null for none. */
  seatKind: text("seat_kind", { enum: ["styling", "shampoo"] }),
  /**
   * Flat list price, and the fallback when `service_prices` has no row for the
   * grade. Amounts actually paid are in `payments`.
   */
  price: real("price"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Bookings. Only `source = "staff"` is written today; the column is for online booking later. */
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
    /** Whether the guest requested a specific stylist. */
    nominated: integer("nominated", { mode: "boolean" }).notNull().default(false),
    source: text("source", { enum: ["staff", "wechat", "phone", "online"] })
      .notNull()
      .default("staff"),
    note: text("note"),
    createdAt: integer("created_at").notNull().default(now),
  },
  // The calendar queries by date; without this index D1's rows-examined limit
  // is eventually hit as bookings accumulate.
  (t) => [index("bookings_date_idx").on(t.date), index("bookings_customer_idx").on(t.customerId)],
);

/** One row per treatment; a booking has several, possibly with different staff. */
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
 * Accepted currencies at shop-set rates, not market rates (Macau shops commonly
 * use 1:1, sometimes 1:1.03). Nothing is fetched, so it works offline.
 */
export const currencies = sqliteTable("currencies", {
  code: text("code").primaryKey(),
  /** Against the base currency (MOP). */
  rateToBase: real("rate_to_base").notNull().default(1),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Payments. The rate is copied at payment time so later rate changes don't alter past takings. */
export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    /** Amount in `currency`. */
    amount: real("amount").notNull(),
    currency: text("currency").notNull(),
    /** Snapshot of the configured rate at payment time. */
    rateToBase: real("rate_to_base").notNull(),
    /** MPay and BOC Pay are Macau wallets; WeChat Pay and Alipay are mainland. See payment-methods.ts. */
    method: text("method", {
      enum: ["cash", "card", "mpay", "boc", "wechat", "alipay"],
    })
      .notNull()
      .default("cash"),
    paidAt: integer("paid_at").notNull().default(now),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    index("payments_paid_at_idx").on(t.paidAt),
  ],
);

/** Treatment records (formulas, notes), used to repeat a previous treatment. */
export const records = sqliteTable(
  "records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    bookingId: integer("booking_id").references(() => bookings.id),
    /** Colour mix, perm solution, processing time, etc. */
    formula: text("formula"),
    note: text("note"),
    /** Allergies, sensitive scalp, etc. */
    caution: text("caution"),
    recordedOn: text("recorded_on").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("records_customer_idx").on(t.customerId)],
);

/** Opening hours, one row per weekday. */
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
 * Macau, Hong Kong and mainland holidays, imported yearly from Google's calendar
 * feeds (`date-holidays` and Nager.Date lack Macau; Nager has ~6 of ~15 for CN).
 * A year with no rows shows a notice instead of an empty calendar.
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

/**
 * Append-only change log per booking (never updated or deleted). Used to count
 * moves and short-notice cancellations, which the booking row can't show.
 * `at` is unix seconds when the change was made.
 */
export const bookingEvents = sqliteTable(
  "booking_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    at: integer("at").notNull().default(now),
    kind: text("kind", {
      enum: ["created", "status", "moved", "restaffed", "edited"],
    }).notNull(),
    /** Previous value; null when there was none. */
    before: text("before"),
    /** New value. */
    after: text("after"),
    /** Staff who made the change; null when unknown. */
    byStaffId: integer("by_staff_id").references(() => staff.id),
  },
  (t) => [
    index("booking_events_booking_idx").on(t.bookingId),
    // For counting a guest's changes over time.
    index("booking_events_at_idx").on(t.at),
  ],
);

/**
 * Per-grade prices, only for services where price varies by stylist. A separate
 * table so grades can change without a migration on `services`.
 */
export const servicePrices = sqliteTable(
  "service_prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    grade: text("grade", { enum: ["owner", "stylist1", "stylist2", "assistant"] }).notNull(),
    price: real("price").notNull(),
  },
  (t) => [uniqueIndex("service_prices_key").on(t.serviceId, t.grade)],
);
