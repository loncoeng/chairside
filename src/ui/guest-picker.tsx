// Guest picker for the booking form: type part of a name, reading or phone
// number and pick from the matches. Replaces a dropdown of every customer.

import { useMemo, useRef, useState } from "preact/hooks";
import { useText } from "./lang-context.ts";
import type { Customer } from "./book.tsx";
import { matchGuests } from "./guest-match.ts";

/** How many matches to show at once. More than this, keep typing. */
const SHOWN = 8;

export function GuestPicker({
  customers,
  value,
  onChange,
}: {
  customers: Customer[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { t } = useText();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const chosen = value === null ? null : (customers.find((c) => c.id === value) ?? null);
  const matches = useMemo(() => matchGuests(customers, query), [customers, query]);
  const shown = matches.slice(0, SHOWN);

  const pick = (c: Customer) => {
    onChange(c.id);
    setQuery("");
    setOpen(false);
  };

  if (chosen) {
    return (
      <div class="guest-chosen">
        <span class="guest-name">{chosen.name}</span>
        {chosen.phone && <span class="guest-sub">{chosen.phone}</span>}
        <button
          type="button"
          class="link"
          onClick={() => {
            onChange(null);
            // Straight back to typing: changing the guest usually means picking another.
            setTimeout(() => input.current?.focus(), 0);
          }}
        >
          {t("changeGuest")}
        </button>
      </div>
    );
  }

  return (
    <div class="guest-picker">
      <input
        ref={input}
        type="search"
        aria-label={t("guest")}
        value={query}
        placeholder={t("guestSearchHint")}
        onInput={(e) => {
          setQuery((e.target as HTMLInputElement).value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a match lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            // Never submits the booking form from here.
            e.preventDefault();
            const c = shown[active];
            if (c) pick(c);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && query.trim() !== "" && (
        // ARIA combobox: focus stays in the input, whose arrow keys move between options.
        <ul id="guest-matches" class="guest-matches" role="listbox">
          {shown.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              class={i === active ? "is-on" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            >
              <span class="guest-name">{c.name}</span>
              <span class="guest-sub">{[c.searchKey, c.phone].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
          {matches.length === 0 && <li class="guest-none">{t("noneFound")}</li>}
          {matches.length > SHOWN && (
            <li class="guest-none">{t("moreMatches", { n: matches.length - SHOWN })}</li>
          )}
        </ul>
      )}
    </div>
  );
}
