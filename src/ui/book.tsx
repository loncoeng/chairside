// Taking a booking.
//
// The shape of this form follows how it actually happens: somebody is on the
// phone, the receptionist picks a time, a stylist and what they are having,
// and everything else is filled in afterwards. Fields that can wait are not
// asked for here — a seat is decided on the day, and the price when they pay.

import { useEffect, useMemo, useState } from "preact/hooks";
import type { Person } from "./types.ts";

export type Service = {
  id: number;
  nameJa: string;
  nameZh: string | null;
  nameEn: string | null;
  durationMin: number;
  seatKind: "styling" | "shampoo" | null;
  price: number | null;
};

export type Customer = { id: number; name: string; searchKey: string | null };

type Verdict = { level: "stop" | "warn"; code: string; message: string };

type Reply = {
  ok?: boolean;
  bookingId?: number;
  verdicts?: Verdict[];
  needsConfirmation?: boolean;
  error?: string;
};

export function BookingForm({
  date,
  staff,
  services,
  customers,
  onBooked,
  onClose,
}: {
  date: string;
  staff: Person[];
  services: Service[];
  customers: Customer[];
  onBooked: () => void;
  onClose: () => void;
}) {
  const [startsAt, setStartsAt] = useState("10:00");
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

  // Any edit invalidates the answer the server gave about the previous
  // version. Leaving the warnings on screen would let somebody confirm a
  // booking they had since changed.
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
      if (reply.error) setError(reply.error);
      if (!reply.verdicts && !reply.error) setError(`HTTP ${response.status}`);
    } catch (problem: unknown) {
      setError(String(problem));
    } finally {
      setSending(false);
    }
  }

  const stopped = verdicts.some((v) => v.level === "stop");

  return (
    <div class="sheet" role="dialog" aria-label="予約を取る">
      <div class="sheet-head">
        <h3>{date} に予約を取る</h3>
        <button type="button" class="sheet-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>

      <div class="field-row">
        <label class="field">
          <span>開始</span>
          <input
            type="time"
            step={900}
            value={startsAt}
            onInput={(e) => setStartsAt((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="field">
          <span>担当</span>
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

        <label class="field">
          <span>お客様</span>
          <select
            value={customerId ?? ""}
            onChange={(e) => setCustomerId(Number((e.target as HTMLSelectElement).value) || null)}
          >
            <option value="">（未登録）</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset class="menu">
        <legend>
          メニュー
          {minutes > 0 && <span class="menu-total">合計 {minutes} 分</span>}
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
                {/* The order is shown because it decides the times: the lines
                    run back to back from the start, shampoo first. */}
                {order >= 0 && <span class="menu-order">{order + 1}</span>}
                <span class="menu-name">{service.nameJa}</span>
                <span class="menu-min">{service.durationMin}分</span>
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
          <span>指名</span>
        </label>
        <label class="field grow">
          <span>メモ</span>
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
              <span class="verdict-tag">{v.level === "stop" ? "不可" : "確認"}</span>
              {v.message}
            </li>
          ))}
        </ul>
      )}

      <div class="sheet-actions">
        <button type="button" onClick={onClose}>
          やめる
        </button>

        {/* Two buttons rather than one that changes meaning. Confirming a
            warning is a decision, and it should not be made by pressing the
            same button twice without noticing. */}
        {needsConfirmation && !stopped ? (
          <button type="button" class="primary" disabled={sending} onClick={() => send(true)}>
            確認のうえ入れる
          </button>
        ) : (
          <button
            type="button"
            class="primary"
            disabled={sending || chosen.length === 0}
            onClick={() => send(false)}
          >
            {sending ? "送信中…" : "予約を入れる"}
          </button>
        )}
      </div>
    </div>
  );
}
