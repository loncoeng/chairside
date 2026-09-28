// Dates that exist.
//
// `/^\d{4}-\d{2}-\d{2}$/` accepts 9999-99-99, and the screen then asked for a
// day that has no weekday and no hours. The shape of a date is not the same
// question as whether it is one.

/** Whether this is a real calendar day, written the way the app writes them. */
export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const at = new Date(`${value}T00:00:00Z`);
  // Round-tripping catches the ones the parser quietly moves: 2026-02-30
  // becomes the second of March, and a check that only asked "did it parse"
  // would let it through.
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value;
}

/** Whether this is a real time of day. */
export const isTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Whether this is a real month. */
export function isMonth(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}
