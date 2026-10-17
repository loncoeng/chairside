// A bill is credited to whoever did the first styling-chair line. The first line
// is usually the assistant's shampoo. See DESIGN.md.

export type Line = {
  staffId: number | null;
  sortOrder: number;
  /** Seat the service needs; null when it needs none. */
  seatKind: "styling" | "shampoo" | null;
};

/** The stylist a booking's takings belong to, or null when nothing says. */
export function creditedStaff(lines: Line[]): number | null {
  if (lines.length === 0) return null;

  const inOrder = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const chair = inOrder.find((line) => line.seatKind === "styling" && line.staffId !== null);
  if (chair) return chair.staffId;

  // No styling line (wash, treatment, head spa): credit the first staffed line.
  return inOrder.find((line) => line.staffId !== null)?.staffId ?? null;
}
