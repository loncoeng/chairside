// UI language, in a context. The choice is stored per browser in localStorage,
// not in the database.

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
 * Saved choice, then browser languages, then Japanese. Wrapped in try because
 * localStorage can throw in a private window.
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
    // Not persisted; the screen still works.
  }
}

/** Translation helpers bound to the current language. */
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
