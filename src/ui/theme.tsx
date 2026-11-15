// Light or dark, chosen in the page. Until a choice is made it follows the
// system setting. The choice is a convenience, so a browser that refuses
// storage simply forgets it.

import { useState } from "preact/hooks";
import { useText } from "./lang-context.ts";

export type Theme = "light" | "dark";

const KEY = "chairside.theme";

export function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Puts a saved choice on <html>; with none, the stylesheet follows the system. */
export function applyTheme(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function ThemeSwitch() {
  const { t } = useText();
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? systemTheme());
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? t("themeDark") : t("themeLight");

  return (
    <button
      type="button"
      class="theme-switch"
      aria-label={label}
      title={label}
      onClick={() => {
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // Not remembered; it still applies to this page.
        }
        applyTheme(next);
        setTheme(next);
      }}
    >
      {/* Shows what a press switches to. */}
      {next === "dark" ? (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
          </g>
        </svg>
      )}
    </button>
  );
}
