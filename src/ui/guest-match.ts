// Which customers a search on the booking form matches.

type Searchable = { name: string; searchKey: string | null; phone: string | null };

/** Digits only, so "+853 6612 3401" matches "66123401". */
const digits = (s: string) => s.replace(/\D/g, "");

/** Name, reading or phone, ignoring case. An empty query matches nobody. */
export function matchGuests<T extends Searchable>(customers: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  const qDigits = digits(q);
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.searchKey ?? "").toLowerCase().includes(q) ||
      // At least three digits, or "1" would match every phone number.
      (qDigits.length >= 3 && digits(c.phone ?? "").includes(qDigits)),
  );
}
