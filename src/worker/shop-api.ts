// Shop settings: opening hours, closures and staff.

import { and, asc, eq, gte, isNull, ne, or } from "drizzle-orm";

import { bookingItems, bookings, businessHours, closures, staff } from "../db/schema.ts";

import { isDate, isTime } from "../db/dates.ts";
import { atomically } from "../db/atomic.ts";
import type { Database as Db } from "../db/database.ts";
import { json, fail, bad } from "./http.ts";

/** All data for the settings screen. */
export async function shopSettings(db: Db, from: string) {
  const [hours, shut, people] = await Promise.all([
    db
      .select({
        weekday: businessHours.weekday,
        opensAt: businessHours.opensAt,
        closesAt: businessHours.closesAt,
        closed: businessHours.closed,
      })
      .from(businessHours)
      .orderBy(asc(businessHours.weekday)),
    // Upcoming closures only.
    db
      .select({ id: closures.id, date: closures.date, reason: closures.reason })
      .from(closures)
      .where(gte(closures.date, from))
      .orderBy(asc(closures.date)),
    db
      .select({
        id: staff.id,
        name: staff.name,
        role: staff.role,
        grade: staff.grade,
        color: staff.color,
        joinedOn: staff.joinedOn,
        leftOn: staff.leftOn,
      })
      .from(staff)
      .orderBy(asc(staff.leftOn), asc(staff.id)),
  ]);

  return { hours, closures: shut, staff: people };
}

/** Replaces the weekly hours. All seven days must be sent together. */
export async function setHours(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { hours?: unknown } | null;
  const rows = Array.isArray(body?.hours) ? body.hours : null;
  if (rows?.length !== 7) return bad("hours-need-seven-days", "Send all seven days together.");

  const parsed: {
    weekday: number;
    opensAt: string | null;
    closesAt: string | null;
    closed: boolean;
  }[] = [];

  for (const row of rows as Record<string, unknown>[]) {
    const weekday = Number(row.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
      return bad("bad-weekday", "The day of the week is not valid.");

    const closed = row.closed === true;
    const opensAt = typeof row.opensAt === "string" ? row.opensAt : null;
    const closesAt = typeof row.closesAt === "string" ? row.closesAt : null;

    if (!closed) {
      if (!opensAt || !isTime(opensAt))
        return bad("bad-opening-time", "The opening time is not in HH:MM form.");
      if (!closesAt || !isTime(closesAt))
        return bad("bad-closing-time", "The closing time is not in HH:MM form.");
      // Every reader assumes closesAt > opensAt (no overnight hours).
      if (closesAt <= opensAt) return bad("closes-before-opens", "Closing is before opening.");
    }

    parsed.push({
      weekday,
      opensAt: closed ? null : opensAt,
      closesAt: closed ? null : closesAt,
      closed,
    });
  }

  if (new Set(parsed.map((p) => p.weekday)).size !== 7)
    return bad("duplicate-weekday", "A day of the week appears twice.");

  // All seven or none, so a failure cannot leave half a week changed.
  const [first, ...rest] = parsed.map((row) =>
    db
      .update(businessHours)
      .set({ opensAt: row.opensAt, closesAt: row.closesAt, closed: row.closed })
      .where(eq(businessHours.weekday, row.weekday)),
  );
  await atomically(db, [first!, ...rest]);

  return json({ ok: true });
}

/** Adds, updates or (with `remove`) deletes a closure. */
export async function setClosure(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    date?: unknown;
    reason?: unknown;
    remove?: unknown;
  } | null;

  const date = typeof body?.date === "string" ? body.date : "";
  if (!isDate(date)) return bad("bad-date", "Send the date as YYYY-MM-DD.");

  if (body?.remove === true) {
    await db.delete(closures).where(eq(closures.date, date));
    return json({ ok: true });
  }

  const [already] = await db
    .select({ id: closures.id })
    .from(closures)
    .where(eq(closures.date, date))
    .limit(1);

  const reason =
    typeof body?.reason === "string" && body.reason.trim() !== ""
      ? body.reason.trim().slice(0, 200)
      : null;

  if (already) {
    await db.update(closures).set({ reason }).where(eq(closures.id, already.id));
  } else {
    await db.insert(closures).values({ date, reason });
  }

  // Existing bookings are kept so the shop can contact the guests; only the count is returned.
  const standing = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.date, date),
        or(eq(bookings.status, "booked"), eq(bookings.status, "arrived")),
      ),
    );

  return json({ ok: true, bookingsOnThatDay: standing.length });
}

type Role = "owner" | "stylist" | "assistant";
type Grade = "owner" | "stylist1" | "stylist2" | "assistant";
const ROLES: readonly string[] = ["owner", "stylist", "assistant"];
const GRADES: readonly string[] = ["owner", "stylist1", "stylist2", "assistant"];

/**
 * Creates or updates a staff member. On an update only the fields sent change;
 * a field left out keeps its value. Staff are never deleted (past bookings and
 * per-stylist takings reference them); set `leftOn` instead.
 *
 * The last owner cannot be demoted or marked as left: nobody could reach the
 * settings to undo it.
 */
export async function setStaff(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return bad("unreadable-body", "The request body could not be read.");
  }

  const sent = (key: string) => key in body;
  const changes: Partial<typeof staff.$inferInsert> = {};

  if (sent("name")) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    if (name === "") return bad("name-required", "Enter a name.");
    changes.name = name;
  }
  if (sent("role")) {
    if (typeof body.role !== "string" || !ROLES.includes(body.role)) {
      return bad("bad-role", "The role is not valid.");
    }
    changes.role = body.role as Role;
  }
  if (sent("grade")) {
    if (typeof body.grade !== "string" || !GRADES.includes(body.grade)) {
      return bad("bad-grade", "The grade is not valid.");
    }
    changes.grade = body.grade as Grade;
  }
  if (sent("color")) {
    if (
      body.color !== null &&
      !(typeof body.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(body.color))
    ) {
      return bad("bad-color", "The colour is not a #RRGGBB value.");
    }
    changes.color = body.color as string | null;
  }
  for (const key of ["joinedOn", "leftOn"] as const) {
    if (!sent(key)) continue;
    const value = body[key];
    if (value !== null && !isDate(value)) return bad("bad-date", "Send the date as YYYY-MM-DD.");
    changes[key] = value as string | null;
  }

  const id = Number.isInteger(body.id) ? (body.id as number) : null;

  if (id === null) {
    if (changes.name === undefined) return bad("name-required", "Enter a name.");
    const [created] = await db
      .insert(staff)
      .values({ ...changes, name: changes.name })
      .returning({ id: staff.id });
    return json({ ok: true, staffId: created?.id ?? null }, 201);
  }

  const [person] = await db
    .select({ id: staff.id, role: staff.role, joinedOn: staff.joinedOn, leftOn: staff.leftOn })
    .from(staff)
    .where(eq(staff.id, id))
    .limit(1);
  if (!person) return fail(404, "staff-not-found", "That staff member was not found.");

  const after = { ...person, ...changes };
  if (after.joinedOn && after.leftOn && after.leftOn < after.joinedOn) {
    return bad("left-before-joined", "The leaving date is before the joining date.");
  }

  const wasOwner = person.role === "owner" && person.leftOn === null;
  const stillOwner = after.role === "owner" && after.leftOn === null;
  if (wasOwner && !stillOwner) {
    const [other] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.role, "owner"), isNull(staff.leftOn), ne(staff.id, id)))
      .limit(1);
    if (!other) {
      return fail(409, "last-owner", "Somebody else has to be an owner first.");
    }
  }

  if (Object.keys(changes).length > 0) {
    await db.update(staff).set(changes).where(eq(staff.id, id));
  }

  // Bookings still assigned after leftOn. Returned, not reassigned: the shop decides who takes over.
  const leftOn = after.leftOn ?? null;
  const pending =
    leftOn === null
      ? []
      : await db
          .select({
            bookingId: bookings.id,
            date: bookings.date,
            startsAt: bookings.startsAt,
          })
          .from(bookingItems)
          .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
          .where(
            and(
              eq(bookingItems.staffId, id),
              gte(bookings.date, leftOn),
              or(eq(bookings.status, "booked"), eq(bookings.status, "arrived")),
            ),
          )
          .orderBy(asc(bookings.date));

  return json({ ok: true, staffId: id, stillBooked: pending });
}
