import { strictEqual } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { LANGS, TEXT, errorText, say, serviceName, verdictText, weekday } from "./i18n.ts";
import type { Lang } from "./i18n.ts";

test("every string exists in every language", () => {
  // A missing translation renders blank, not as an error.
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
  // e.g. dropping {who} loses the name silently.
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
  // Blanking it would leave a plausible but wrong sentence.
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
    message: "Ren already has something at 10:15–10:35.",
    data: { who: "Ren", from: "10:15", to: "10:35" },
  };
  strictEqual(verdictText("en", verdict), "Ren already has something at 10:15–10:35.");
  strictEqual(verdictText("zh", verdict), "Ren 在 10:15–10:35 已有其他服務。");
  strictEqual(verdictText("ja", verdict), "Renは 10:15–10:35 に別の施術が入っています。");
});

test("a code this build does not know falls back to what the server said", () => {
  // Older UI against a newer API.
  const verdict = { code: "invented-later", message: "What the server said." };
  strictEqual(verdictText("ja", verdict), "What the server said.");
});

test("a refusal is said in the reader's language", () => {
  const reply = { ok: false, code: "wrong-credentials", error: "The ID or password is wrong." };
  strictEqual(errorText("ja", reply, 401), "IDかパスワードが違います。");
  strictEqual(errorText("zh", reply, 401), "帳號或密碼錯誤。");
  strictEqual(errorText("en", reply, 401), "The ID or password is wrong.");
});

test("a refusal falls back to the server's sentence, then to the status", () => {
  strictEqual(
    errorText("ja", { code: "invented-later", error: "What the server said." }, 400),
    "What the server said.",
  );
  strictEqual(errorText("ja", "<html>Bad Gateway</html>", 502), "HTTP 502");
  strictEqual(errorText("ja", null, 500), "HTTP 500");
});

test("every code the server can send has words on the screen", () => {
  // Codes from src/worker must have entries here, or the server's English shows.
  const dir = new URL("../worker/", import.meta.url);
  const codes = new Set<string>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const source = readFileSync(new URL(name, dir), "utf8");
    for (const m of source.matchAll(/(?:code: |bad\(|fail\(\d+, )"([a-z-]+)"/g)) codes.add(m[1]!);
  }

  const missing = [...codes].filter((code) => !(`error.${code}` in TEXT));
  strictEqual(missing.join(", "), "");
  // Sanity check that the scan finds codes.
  strictEqual(codes.has("wrong-credentials"), true);
});

test("Sunday is Sunday in all three", () => {
  strictEqual(weekday("ja", 0), "日");
  strictEqual(weekday("zh", 0), "日");
  strictEqual(weekday("en", 0), "Sun");
  // Chinese numbers the weekdays; Monday is 一, not 月.
  strictEqual(weekday("zh", 1), "一");
});
