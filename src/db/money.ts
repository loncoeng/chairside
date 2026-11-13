// Money is held in whole cents and rates in basis points (see schema.ts), so
// these are the only places a decimal point appears: reading what was typed at
// the till, and showing an amount.

/** 10,000 basis points is a rate of 1. */
export const PAR = 10_000;

/** An amount in another currency, in cents of the base currency, rounded once. */
export const toBase = (amountCents: number, rateToBaseBp: number): number =>
  Math.round((amountCents * rateToBaseBp) / PAR);

/**
 * What was typed at the till, in cents: "450", "450.5" and "1,280.00" all
 * read. null for anything else, including more than two decimals, so 450.555
 * is refused rather than quietly rounded.
 */
export function centsFrom(typed: string): number | null {
  const plain = typed.trim().replace(/,/g, "");
  const found = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(plain);
  if (!found) return null;
  return Number(found[1]) * 100 + Number((found[2] ?? "").padEnd(2, "0"));
}

/** For a form field: 45000 → "450", 45050 → "450.50". */
export const typedFrom = (cents: number): string =>
  cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

/** For display: 128000 → "1,280", 128050 → "1,280.50". Whole amounts drop the cents. */
export const shown = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
