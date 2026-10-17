// Date and time validators. A shape regex alone accepts 9999-99-99.

/** Whether this is a real calendar day in YYYY-MM-DD. */
export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const at = new Date(`${value}T00:00:00Z`);
  // Round-trip, since Date rolls 2026-02-30 over to March 2 instead of failing.
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value;
}

/** Whether this is a real time of day in HH:MM (24-hour). */
export const isTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Whether this is a real month in YYYY-MM. */
export function isMonth(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}
