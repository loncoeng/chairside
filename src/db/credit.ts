// Who a bill belongs to: whoever did the first treatment in a styling chair,
// not whoever went first. Crediting the first line puts the month on the
// assistant, because the first line is nearly always the shampoo.
//
// DESIGN.md, "A bill belongs to the stylist, not to whoever went first".

export type Line = {
  staffId: number | null;
  sortOrder: number;
  /** What kind of seat the service needs. NULL when it needs none. */
  seatKind: "styling" | "shampoo" | null;
};

/** The stylist a booking's takings belong to, or null when nothing says. */
export function creditedStaff(lines: Line[]): number | null {
  if (lines.length === 0) return null;

  const inOrder = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const chair = inOrder.find((line) => line.seatKind === "styling" && line.staffId !== null);
  if (chair) return chair.staffId;

  // No styling line: a wash, a treatment, a head spa. Whoever did the first
  // thing did the whole visit.
  return inOrder.find((line) => line.staffId !== null)?.staffId ?? null;
}
