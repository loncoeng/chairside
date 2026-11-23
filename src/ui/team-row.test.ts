import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { Window } from "happy-dom";

import { TEXT } from "./i18n.ts";

// Marking somebody as left takes them off new bookings, so one click only asks.
test("marking somebody as left asks first, and cancelling changes nothing", async () => {
  const window = new Window({ url: "https://demo.invalid/" });
  const dom = window as unknown as Record<string, unknown>;
  const names = ["window", "document", "Node", "Element", "HTMLElement", "Text", "Event"];
  const restore = names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)] as const);
  for (const n of names) {
    Object.defineProperty(globalThis, n, { value: dom[n], writable: true, configurable: true });
  }

  try {
    const { h, render } = await import("preact");
    const { TeamRow } = await import("./shop.tsx");
    const root = window.document.createElement("div");
    window.document.body.appendChild(root);

    const saved: unknown[] = [];
    const person = {
      id: 8,
      name: "Ren",
      role: "stylist",
      grade: "stylist1",
      color: null,
      joinedOn: null,
      leftOn: null,
    };
    const draw = () =>
      render(
        h(TeamRow, { person, busy: false, onSave: (p: unknown) => saved.push(p) }),
        root as never,
      );
    const settle = () => new Promise((r) => setTimeout(r, 0));
    const button = (label: string) =>
      [...root.querySelectorAll("button")].find((b) => b.textContent === label) ?? null;
    const markLeft = TEXT.markLeft.ja;

    draw();
    button(markLeft)?.click();
    await settle();
    strictEqual(saved.length, 0, "one click marked them as left without asking");
    ok(root.textContent?.includes("Renさんを"), "the question did not appear");

    button(TEXT.cancel.ja)?.click();
    await settle();
    strictEqual(saved.length, 0, "cancelling still marked them as left");
    ok(!root.textContent?.includes("Renさんを"), "the question stayed after cancelling");

    button(markLeft)?.click();
    await settle();
    button(markLeft)?.click();
    await settle();
    strictEqual(saved.length, 1, "confirming did not mark them as left");
    deepStrictEqual(Object.keys(saved[0] as object), ["leftOn"]);
  } finally {
    for (const [n, was] of restore) {
      if (was) Object.defineProperty(globalThis, n, was);
      else delete (globalThis as Record<string, unknown>)[n];
    }
    await window.happyDOM.close();
  }
});
