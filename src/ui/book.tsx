// New booking form: time, stylist, guest and services only.
// Seat is assigned on the day and the price is set at payment.

import { useEffect, useMemo, useState } from "preact/hooks";
import type { Person } from "./types.ts";
import { useText } from "./lang-context.ts";
import { serviceName } from "./i18n.ts";
import { GuestPicker } from "./guest-picker.tsx";
import { shown } from "../db/money.ts";

const price = (cents: number | null) => (cents === null ? null : shown(cents));

export type Service = {
  id: number;
  nameJa: string;
  nameZh: string | null;
  nameEn: string | null;
  durationMin: number;
  seatKind: "styling" | "shampoo" | null;
  /** Price in cents when it doesn't depend on the stylist. */
  priceCents: number | null;
  /** Price in cents per stylist grade, when it does. */
  byGrade: Record<string, number> | null;
};

/** Price in cents for a stylist grade, falling back to the flat price. */
export function priceFor(service: Service, grade: string | null | undefined): number | null {
  if (grade && service.byGrade && grade in service.byGrade) return service.byGrade[grade]!;
  return service.priceCents;
}

export type Customer = { id: number; name: string; searchKey: string | null; phone: string | null };

type Verdict = {
  level: "stop" | "warn";
  code: string;
  /** English fallback from the server, used only for unknown codes. */
  message: string;
  data?: Record<string, string | number>;
};

type Reply = {
  ok?: boolean;
  bookingId?: number;
  verdicts?: Verdict[];
  needsConfirmation?: boolean;
  error?: string;
};

export function BookingForm({
  date,
  startsAt: firstStart,
  staff,
  services,
  customers,
  onBooked,
  onClose,
}: {
  date: string;
  /** "HH:MM" to start from, e.g. where the grid was clicked. */
  startsAt?: string | null;
  staff: Person[];
  services: Service[];
  customers: Customer[];
  onBooked: () => void;
  onClose: () => void;
}) {
  const { t, lang, verdict: sayVerdict, failure } = useText();
  const [startsAt, setStartsAt] = useState(firstStart ?? "10:00");
  const [staffId, setStaffId] = useState<number | null>(staff[0]?.id ?? null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [nominated, setNominated] = useState(false);
  const [note, setNote] = useState("");

  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const minutes = chosen.reduce((sum, id) => sum + (byId.get(id)?.durationMin ?? 0), 0);

  // Price for the selected stylist's grade.
  const grade = staff.find((p) => p.id === staffId)?.grade ?? null;
  const total = chosen.reduce((sum, id) => {
    const service = byId.get(id);
    return sum + (service ? (priceFor(service, grade) ?? 0) : 0);
  }, 0);

  // Clear stale warnings on edit so a changed booking can't be confirmed against them.
  useEffect(() => {
    setVerdicts([]);
    setNeedsConfirmation(false);
    setError(null);
  }, [startsAt, staffId, customerId, chosen, nominated]);

  function toggle(id: number) {
    setChosen((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function send(acceptWarnings: boolean) {
    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          startsAt,
          staffId,
          customerId,
          serviceIds: chosen,
          nominated,
          note,
          acceptWarnings,
        }),
      });

      const reply = (await response.json()) as Reply;

      if (reply.ok) {
        onBooked();
        return;
      }

      setVerdicts(reply.verdicts ?? []);
      setNeedsConfirmation(reply.needsConfirmation === true);
      if (reply.error) setError(failure(reply, response.status));
      if (!reply.verdicts && !reply.error) setError(`HTTP ${response.status}`);
    } catch (problem: unknown) {
      setError(String(problem));
    } finally {
      setSending(false);
    }
  }

  const stopped = verdicts.some((v) => v.level === "stop");

  return (
    <div class="sheet" role="dialog" aria-label={t("takeBooking")}>
      <div class="sheet-head">
        <h3>{t("bookOn", { date })}</h3>
        <button type="button" class="sheet-close" onClick={onClose} aria-label={t("close")}>
          ×
        </button>
      </div>

      <div class="field-row">
        <label class="field">
          <span>{t("startsAt")}</span>
          <input
            type="time"
            step={900}
            value={startsAt}
            onInput={(e) => setStartsAt((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="field">
          <span>{t("withWhom")}</span>
          <select
            value={staffId ?? ""}
            onChange={(e) => setStaffId(Number((e.target as HTMLSelectElement).value) || null)}
          >
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <div class="field grow">
          <span>{t("guest")}</span>
          <GuestPicker customers={customers} value={customerId} onChange={setCustomerId} />
        </div>
      </div>

      <fieldset class="menu">
        <legend>
          {t("menu")}
          {minutes > 0 && (
            <span class="menu-total">
              {t("totalMinutes", { n: minutes })}
              {total > 0 && <b> {shown(total)}</b>}
            </span>
          )}
        </legend>
        <div class="menu-grid">
          {services.map((service) => {
            const order = chosen.indexOf(service.id);
            return (
              <button
                type="button"
                key={service.id}
                class={`menu-item${order >= 0 ? " is-on" : ""}`}
                onClick={() => toggle(service.id)}
                aria-pressed={order >= 0}
              >
                {/* Order decides the times: lines run back to back from the start, shampoo first. */}
                {order >= 0 && <span class="menu-order">{order + 1}</span>}
                <span class="menu-name">{serviceName(lang, service)}</span>
                <span class="menu-min">{t("minutes", { n: service.durationMin })}</span>
                <span class="menu-price">{price(priceFor(service, grade))}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div class="field-row">
        <label class="field check">
          <input
            type="checkbox"
            checked={nominated}
            onChange={(e) => setNominated((e.target as HTMLInputElement).checked)}
          />
          <span>{t("nominated")}</span>
        </label>
        <label class="field grow">
          <span>{t("note")}</span>
          <input
            type="text"
            value={note}
            maxLength={500}
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      {error && (
        <p class="failed" role="alert">
          {error}
        </p>
      )}

      {verdicts.length > 0 && (
        <ul class="verdicts">
          {verdicts.map((v) => (
            <li key={v.code + v.message} class={`verdict is-${v.level}`}>
              <span class="verdict-tag">{v.level === "stop" ? t("tagStop") : t("tagWarn")}</span>
              {sayVerdict(v)}
            </li>
          ))}
        </ul>
      )}

      <div class="sheet-actions">
        {/* Says why the button is greyed out, rather than leaving it to be guessed. */}
        {chosen.length === 0 && <span class="sheet-hint">{t("pickMenuFirst")}</span>}
        <button type="button" onClick={onClose}>
          {t("cancel")}
        </button>

        {/* A separate "book anyway" button so warnings aren't accepted by pressing twice. */}
        {needsConfirmation && !stopped ? (
          <button type="button" class="primary" disabled={sending} onClick={() => send(true)}>
            {t("submitAnyway")}
          </button>
        ) : (
          <button
            type="button"
            class="primary"
            disabled={sending || chosen.length === 0}
            onClick={() => send(false)}
          >
            {sending ? t("sending") : t("submit")}
          </button>
        )}
      </div>
    </div>
  );
}
