// Shop settings: opening hours, closures and staff.

import { and, asc, eq, gte, or } from "drizzle-orm";

import { bookingItems, bookings, businessHours, closures, staff } from "../db/schema.ts";

import { isDate, isTime } from "../db/dates.ts";
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

  for (const row of parsed) {
    await db
      .update(businessHours)
      .set({ opensAt: row.opensAt, closesAt: row.closesAt, closed: row.closed })
      .where(eq(businessHours.weekday, row.weekday));
  }

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

/**
 * Creates or updates a staff member. Staff are never deleted (past bookings and
 * per-stylist takings reference them); set `leftOn` instead.
 */
export async function setStaff(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    name?: unknown;
    role?: unknown;
    color?: unknown;
    joinedOn?: unknown;
    leftOn?: unknown;
  } | null;

  if (!body) return bad("unreadable-body", "The request body could not be read.");

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const role = typeof body.role === "string" ? body.role : "stylist";
  if (!["owner", "stylist", "assistant"].includes(role))
    return bad("bad-role", "The role is not valid.");

  const color =
    typeof body.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(body.color) ? body.color : null;
  const joinedOn =
    typeof body.joinedOn === "string" && isDate(body.joinedOn) ? body.joinedOn : null;
  const leftOn = typeof body.leftOn === "string" && isDate(body.leftOn) ? body.leftOn : null;

  const id = Number.isInteger(body.id) ? (body.id as number) : null;

  if (id === null) {
    if (name === "") return bad("name-required", "Enter a name.");
    const [created] = await db
      .insert(staff)
      .values({ name, role: role as "owner" | "stylist" | "assistant", color, joinedOn, leftOn })
      .returning({ id: staff.id });
    return json({ ok: true, staffId: created?.id ?? null }, 201);
  }

  const [exists] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, id)).limit(1);
  if (!exists) return fail(404, "staff-not-found", "That staff member was not found.");

  await db
    .update(staff)
    .set({
      ...(name === "" ? {} : { name }),
      role: role as "owner" | "stylist" | "assistant",
      color,
      joinedOn,
      leftOn,
    })
    .where(eq(staff.id, id));

  // Bookings still assigned after leftOn. Returned, not reassigned: the shop decides who takes over.
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
