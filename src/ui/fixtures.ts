// Invented sample data. Nothing here corresponds to a real person or a real
// shop — the counts match the room this was built for, and nothing else does.
//
// Real records never enter this repository. See DESIGN.md.

export const SEATS = [
  { id: 1, name: "A1", kind: "styling" },
  { id: 2, name: "A2", kind: "styling" },
  { id: 3, name: "A3", kind: "styling" },
  { id: 4, name: "A4", kind: "styling" },
  { id: 5, name: "A5", kind: "styling" },
  { id: 6, name: "B1", kind: "styling" },
  { id: 7, name: "B2", kind: "styling" },
  { id: 8, name: "B3", kind: "styling" },
  { id: 9, name: "B4", kind: "styling" },
  { id: 10, name: "S1", kind: "shampoo" },
  { id: 11, name: "S2", kind: "shampoo" },
  { id: 12, name: "S3", kind: "shampoo" },
] as const satisfies readonly { id: number; name: string; kind: "styling" | "shampoo" }[];

export const STAFF = [
  { id: 1, name: "Aoi", role: "owner", color: "#B4553F" },
  { id: 2, name: "Ren", role: "stylist", color: "#4B6FA8" },
  { id: 3, name: "Mei", role: "stylist", color: "#4E7F5E" },
  { id: 4, name: "Kai", role: "stylist", color: "#8A6510" },
  { id: 5, name: "Sora", role: "stylist", color: "#7A5490" },
  { id: 6, name: "Yuna", role: "stylist", color: "#3F7F8A" },
  { id: 7, name: "Riku", role: "stylist", color: "#A04A6B" },
  { id: 8, name: "Hana", role: "assistant", color: "#6B7A45" },
] as const satisfies readonly {
  id: number;
  name: string;
  role: "owner" | "stylist" | "assistant";
  color: string;
}[];
