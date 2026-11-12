import { deepStrictEqual } from "node:assert/strict";
import { test } from "node:test";

import { matchGuests } from "./guest-match.ts";

const guests = [
  { id: 1, name: "陳 嘉雯", searchKey: "chan ka man", phone: "+853 6612 3401" },
  { id: 2, name: "Ana Ferreira", searchKey: "ferreira ana", phone: "+853 6612 3410" },
  { id: 3, name: "田中 美咲", searchKey: "tanaka misaki", phone: null },
];
const ids = (q: string) => matchGuests(guests, q).map((g) => g.id);

test("a guest is found by name, reading or phone", () => {
  deepStrictEqual(ids("嘉雯"), [1]);
  deepStrictEqual(ids("CHAN"), [1]);
  deepStrictEqual(ids("ferreira"), [2]);
  // "ana" is in "tanaka" too; a substring search finds both.
  deepStrictEqual(ids("ana"), [2, 3]);
  deepStrictEqual(ids("tanaka"), [3]);
});

test("a phone number matches with or without spaces and dialling code", () => {
  deepStrictEqual(ids("66123401"), [1]);
  deepStrictEqual(ids("6612 3410"), [2]);
  deepStrictEqual(ids("6612"), [1, 2]);
});

test("an empty or too-short number matches nobody", () => {
  deepStrictEqual(ids(""), []);
  deepStrictEqual(ids("  "), []);
  deepStrictEqual(ids("34"), []);
});
