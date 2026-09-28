// The shop's own settings: when it opens, when it does not, and who works
// there.
//
// Small screens, rarely used, and the place where a mistake is quietest. An
// opening hour typed wrong does not throw anything — it just means bookings
// stop being offered at six, and nobody notices for a week.

import { and, asc, eq, gte, isNull, or } from "drizzle-orm";

import { bookingItems, bookings, businessHours, closures, staff } from "../db/schema.ts";

import { isDate, isTime } from "../db/dates.ts";
import type { Database as Db } from "../db/database.ts";


/** Everything the settings screen shows at once. */
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
    // Only from today. A shop that closed for a day in March does not need
    // to scroll past it every time it closes for one in October.
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

/**
 * The week's pattern.
 *
 * Sent whole, all seven days, rather than a day at a time. The shop thinks
 * "we open at ten except Sunday", and seven separate saves is seven chances
 * to leave it half changed.
 */
export async function setHours(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { hours?: unknown } | null;
  const rows = Array.isArray(body?.hours) ? body.hours : null;
  if (!rows || rows.length !== 7) return bad("7日分をまとめて送ってください。");

  const parsed: { weekday: number; opensAt: string | null; closesAt: string | null; closed: boolean }[] = [];

  for (const row of rows as Record<string, unknown>[]) {
    const weekday = Number(row.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return bad("曜日が不正です。");

    const closed = row.closed === true;
    const opensAt = typeof row.opensAt === "string" ? row.opensAt : null;
    const closesAt = typeof row.closesAt === "string" ? row.closesAt : null;

    if (!closed) {
      if (!opensAt || !isTime(opensAt)) return bad("開店時刻の形式が違います。");
      if (!closesAt || !isTime(closesAt)) return bad("閉店時刻の形式が違います。");
      // Refused rather than stored and worked around later. Every screen
      // that reads these assumes the day runs forwards.
      if (closesAt <= opensAt) return bad("閉店が開店より前になっています。");
    }

    parsed.push({ weekday, opensAt: closed ? null : opensAt, closesAt: closed ? null : closesAt, closed });
  }

  if (new Set(parsed.map((p) => p.weekday)).size !== 7) return bad("曜日が重複しています。");

  for (const row of parsed) {
    await db
      .update(businessHours)
      .set({ opensAt: row.opensAt, closesAt: row.closesAt, closed: row.closed })
      .where(eq(businessHours.weekday, row.weekday));
  }

  return json({ ok: true });
}

/** Close for a day, or open one back up. */
export async function setClosure(db: Db, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    date?: unknown;
    reason?: unknown;
    remove?: unknown;
  } | null;

  const date = typeof body?.date === "string" ? body.date : "";
  if (!isDate(date)) return bad("日付は YYYY-MM-DD で送ってください。");


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

  // Bookings on the day are left alone on purpose. A closure is the shop's
  // decision and the guests are somebody's to ring; deleting their
  // appointments here would make that call impossible to make.
  const standing = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.date, date), or(eq(bookings.status, "booked"), eq(bookings.status, "arrived"))));

  return json({ ok: true, bookingsOnThatDay: standing.length });
}

/**
 * Add somebody, change them, or record that they have left.
 *
 * **Nobody is deleted.** Removing a stylist takes them out of bookings that
 * already happened and stops per-stylist takings adding up. Leaving is a date
 * on the row, which is why `left_on` exists.
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

  if (!body) return bad("本文が読み取れません。");

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const role = typeof body.role === "string" ? body.role : "stylist";
  if (!["owner", "stylist", "assistant"].includes(role)) return bad("役割が不正です。");

  const color = typeof body.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(body.color) ? body.color : null;
  const joinedOn = typeof body.joinedOn === "string" && isDate(body.joinedOn) ? body.joinedOn : null;
  const leftOn = typeof body.leftOn === "string" && isDate(body.leftOn) ? body.leftOn : null;

  const id = Number.isInteger(body.id) ? (body.id as number) : null;

  if (id === null) {
    if (name === "") return bad("名前を入れてください。");
    const [created] = await db
      .insert(staff)
      .values({ name, role: role as "owner" | "stylist" | "assistant", color, joinedOn, leftOn })
      .returning({ id: staff.id });
    return json({ ok: true, staffId: created?.id ?? null }, 201);
  }

  const [exists] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, id)).limit(1);
  if (!exists) return json({ ok: false, error: "その人は見つかりません。" }, 404);

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

  // What is still booked with somebody who has left. Not moved automatically:
  // who takes over is the shop's call, and guessing would put a guest with a
  // stylist they did not ask for.
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

/** Everyone still here, for the pickers. */
export async function activeStaff(db: Db) {
  return await db
    .select({ id: staff.id, name: staff.name, role: staff.role, color: staff.color })
    .from(staff)
    .where(isNull(staff.leftOn))
    .orderBy(asc(staff.id));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const bad = (message: string) => json({ ok: false, error: message }, 400);
