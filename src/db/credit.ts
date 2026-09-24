// Who a bill belongs to.
//
// A booking has several treatments and they are not all done by the same
// person. The obvious rule — credit whoever did the first one — puts the
// month's takings on the assistant, because the first treatment is nearly
// always the shampoo and the assistant is nearly always the one doing it.
//
// It looked right. Every stylist had a number, the numbers added up to the
// month's total, and the assistant was quietly top of the list with three
// times anybody else's.
//
// So the bill goes to whoever did the treatment the guest came in for: the
// first one that occupies a styling chair. A shampoo on its own still belongs
// to the person who did it — somebody who only comes in for a wash was served
// by that person and nobody else.

export type Line = {
  staffId: number | null;
  sortOrder: number;
  /** What kind of seat the service needs. NULL when it needs none. */
  seatKind: "styling" | "shampoo" | null;
};

/**
 * The stylist a booking's takings belong to, or null when nothing says.
 *
 * Splitting a bill between the stylist and the assistant would need a rule
 * the shop has not been asked for — a share, or a price per line — and
 * inventing one would put numbers on a payslip that nobody agreed to.
 */
export function creditedStaff(lines: Line[]): number | null {
  if (lines.length === 0) return null;

  const inOrder = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const chair = inOrder.find((line) => line.seatKind === "styling" && line.staffId !== null);
  if (chair) return chair.staffId;

  // No styling line: a wash, a treatment, a head spa. Whoever did the first
  // thing did the whole visit.
  return inOrder.find((line) => line.staffId !== null)?.staffId ?? null;
}
