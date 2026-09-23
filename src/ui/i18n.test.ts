import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { LANGS, TEXT, say, serviceName, verdictText, weekday } from "./i18n.ts";
import type { Lang } from "./i18n.ts";

test("every string exists in every language", () => {
  // A missing translation renders as a blank rather than an error, and nobody
  // reviewing a diff reads three columns looking for the gap.
  const missing: string[] = [];

  for (const [key, entry] of Object.entries(TEXT)) {
    for (const lang of LANGS) {
      const value = (entry as Record<Lang, string>)[lang];
      if (typeof value !== "string" || value.trim() === "") missing.push(`${key}.${lang}`);
    }
  }

  strictEqual(missing.join(", "), "");
});

test("a translation keeps the placeholders the Japanese has", () => {
  // Dropping {who} from a translation loses the name and leaves a sentence
  // that reads fine and says nothing useful.
  const wrong: string[] = [];
  const holders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

  for (const [key, entry] of Object.entries(TEXT)) {
    const dict = entry as Record<Lang, string>;
    for (const lang of LANGS) {
      if (holders(dict[lang]) !== holders(dict.ja)) wrong.push(`${key}.${lang}`);
    }
  }

  strictEqual(wrong.join(", "), "");
});

test("values are filled in", () => {
  strictEqual(say("en", "totalMinutes", { n: 75 }), "75 min total");
  strictEqual(say("ja", "totalMinutes", { n: 75 }), "合計 75 分");
});

test("a placeholder with nothing to fill it is left visible", () => {
  // Blanking it would produce a complete sentence that is quietly untrue.
  strictEqual(say("en", "busiestAt").includes("{at}"), true);
});

test("a service falls back to its Japanese name", () => {
  const partly = { nameJa: "ヘッドスパ", nameZh: null, nameEn: null };
  strictEqual(serviceName("zh", partly), "ヘッドスパ");
  strictEqual(serviceName("en", partly), "ヘッドスパ");
  strictEqual(serviceName("ja", partly), "ヘッドスパ");
});

test("a rule is said in the reader's language", () => {
  const verdict = {
    code: "staff-double-booked",
    message: "Renは 10:15–10:35 に別の施術が入っています。",
    data: { who: "Ren", from: "10:15", to: "10:35" },
  };
  strictEqual(verdictText("en", verdict), "Ren already has something at 10:15–10:35.");
  strictEqual(verdictText("zh", verdict), "Ren 在 10:15–10:35 已有其他服務。");
});

test("a code this build does not know falls back to what the server said", () => {
  // An older screen against a newer API says something true rather than
  // nothing at all.
  const verdict = { code: "invented-later", message: "サーバが返した文章。" };
  strictEqual(verdictText("en", verdict), "サーバが返した文章。");
});

test("Sunday is Sunday in all three", () => {
  strictEqual(weekday("ja", 0), "日");
  strictEqual(weekday("zh", 0), "日");
  strictEqual(weekday("en", 0), "Sun");
  // Chinese numbers the weekdays; Monday is 一, not 月.
  strictEqual(weekday("zh", 1), "一");
});
