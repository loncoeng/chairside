// Which language the screen is in.
//
// Kept in a context rather than passed down, because it reaches almost every
// component and threading it through as a prop would mean touching every one
// of them to add a string.
//
// The choice is remembered per browser. It is a preference, not data — a
// second guest at the same desk should get the language that desk was left
// in, and nothing about it belongs in the database.

import { createContext } from "preact";
import { useContext } from "preact/hooks";

import { LANGS, errorText, say, verdictText, weekday } from "./i18n.ts";
import type { Key, Lang } from "./i18n.ts";

const STORAGE_KEY = "chairside.lang";

export const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: "ja",
  setLang: () => undefined,
});

/**
 * What to start in.
 *
 * What was chosen here before, then what the browser asks for, then Japanese.
 * Storage can throw outright in a private window, so the whole thing is
 * wrapped: a screen that will not render because it could not read a
 * preference is worse than one in the wrong language.
 */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGS as readonly string[]).includes(saved)) return saved as Lang;
  } catch {
    // Blocked or unavailable. Fall through.
  }

  try {
    for (const tag of navigator.languages ?? []) {
      const code = tag.toLowerCase();
      if (code.startsWith("ja")) return "ja";
      if (code.startsWith("zh")) return "zh";
      if (code.startsWith("en")) return "en";
    }
  } catch {
    // Not every runtime has it.
  }

  return "ja";
}

export function rememberLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // The screen still works; the choice just will not survive a reload.
  }
}

/** Everything a component needs to say something. */
export function useText() {
  const { lang, setLang } = useContext(LangContext);

  return {
    lang,
    setLang,
    t: (key: Key, values?: Record<string, string | number>) => say(lang, key, values),
    weekday: (n: number) => weekday(lang, n),
    verdict: (v: { code: string; message: string; data?: Record<string, string | number> }) =>
      verdictText(lang, v),
    failure: (reply: unknown, status: number) => errorText(lang, reply, status),
  };
}
