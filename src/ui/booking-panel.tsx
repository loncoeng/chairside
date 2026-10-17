// Panel for one booking: status buttons, payment, reschedule and history.
// Nothing is deleted; cancellations and no-shows stay on record as statuses.

import { useEffect, useState } from "preact/hooks";
import type { Line, Person, Status } from "./types.ts";
import { useText } from "./lang-context.ts";
import { serviceName } from "./i18n.ts";
import type { Key } from "./i18n.ts";
import type { Service } from "./book.tsx";
import { priceFor } from "./book.tsx";
import { METHODS } from "../db/payment-methods.ts";

type Payment = {
  id: number;
  amount: number;
  currency: string;
  rateToBase: number;
  method: string;
  paidAt: number;
};

type Verdict = {
  level: "stop" | "warn";
  code: string;
  message: string;
  data?: Record<string, string | number>;
};

type Event = {
  id: number;
  /** Unix seconds. */
  at: number;
  kind: "created" | "status" | "moved" | "restaffed" | "edited";
  before: string | null;
  after: string | null;
};

type Detail = {
  id: number;
  date: string;
  startsAt: string;
  endsAt: string;
  status: Status;
  nominated: boolean;
  note: string | null;
  customerId: number | null;
  customerName: string | null;
  items: {
    id: number;
    serviceId: number | null;
    staffId: number | null;
    seatId: number | null;
    startsAt: string;
    endsAt: string;
  }[];
  history: Event[];
  payments: Payment[];
};

/** Display name for a stored status, from the same table as the buttons. Unknown values pass through. */
function statusName(value: string | null, t: (key: Key) => string): string {
  if (value === null) return "—";
  const known = MOVES.find((move) => move.status === value);
  return known ? t(known.key) : value;
}

/** Status buttons. */
const MOVES: { status: Status; key: "markArrived" | "markDone" | "markCancelled" | "markNoShow" | "markBooked" }[] = [
  { status: "booked", key: "markBooked" },
  { status: "arrived", key: "markArrived" },
  { status: "done", key: "markDone" },
  { status: "cancelled", key: "markCancelled" },
  { status: "no_show", key: "markNoShow" },
];

export function BookingPanel({
  line,
  staff,
  services,
  onChanged,
  onClose,
}: {
  line: Line;
  staff: Person[];
  services: Service[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const { t, lang, verdict: sayVerdict, failure } = useText();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [movingTo, setMovingTo] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MOP");
  const [payMethod, setPayMethod] = useState("cash");
  const [currencyCodes, setCurrencyCodes] = useState<string[]>(["MOP"]);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  useEffect(() => {
    const stop = new AbortController();
    setDetail(null);
    setVerdicts([]);
    setNeedsConfirmation(false);

    fetch(`/api/bookings/${line.bookingId}`, { signal: stop.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Detail;
      })
      .then((found) => {
        setDetail(found);
        setMovingTo(found.startsAt);
        setStaffId(found.items[0]?.staffId ?? null);

        // Prefill with the list price; the stored amount is what was actually paid.
        // Each line is priced by its own stylist's grade.
        const listed = found.items.reduce((sum, item) => {
          const service = services.find((sv) => sv.id === item.serviceId);
          const grade = staff.find((p) => p.id === item.staffId)?.grade ?? null;
          return sum + (service ? (priceFor(service, grade) ?? 0) : 0);
        }, 0);
        if (listed > 0) setAmount(String(listed));
      })
      .catch((problem: unknown) => {
        if (!stop.signal.aborted) setFailed(String(problem));
      });

    return () => stop.abort();
  }, [line.bookingId, services, staff]);

  useEffect(() => {
    const stop = new AbortController();
    fetch("/api/currencies", { signal: stop.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { code: string }[]) => {
        if (list.length > 0) setCurrencyCodes(list.map((c) => c.code));
      })
      .catch(() => undefined);
    return () => stop.abort();
  }, []);

  async function pay() {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId: line.bookingId,
          amount: Number(amount),
          currency,
          method: payMethod,
        }),
      });
      const reply = (await response.json()) as { ok?: boolean; error?: string };
      if (reply.ok) {
        onChanged();
        return;
      }
      setFailed(failure(reply, response.status));
    } catch (problem: unknown) {
      setFailed(String(problem));
    } finally {
      setBusy(false);
    }
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setFailed(null);

    try {
      const response = await fetch(`/api/bookings/${line.bookingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const reply = (await response.json()) as {
        ok?: boolean;
        verdicts?: Verdict[];
        needsConfirmation?: boolean;
        error?: string;
      };

      if (reply.ok) {
        onChanged();
        return;
      }

      setVerdicts(reply.verdicts ?? []);
      setNeedsConfirmation(reply.needsConfirmation === true);
      if (reply.error) setFailed(failure(reply, response.status));
    } catch (problem: unknown) {
      setFailed(String(problem));
    } finally {
      setBusy(false);
    }
  }

  const stopped = verdicts.some((v) => v.level === "stop");
  // Send only changed fields so the server keeps per-line stylists when the stylist isn't edited.
  const moved = detail !== null && movingTo !== detail.startsAt;
  const restaffed = detail !== null && staffId !== (detail.items[0]?.staffId ?? null);

  return (
    <div class="sheet" role="dialog" aria-label={t("bookingDetail")}>
      <div class="sheet-head">
        <h3>
          {/* Prefer the booking's times over the clicked treatment's once loaded. */}
          {detail?.customerName ?? line.customerName ?? t("noGuest")}
          <span class="sheet-when">
            {detail ? `${detail.startsAt}–${detail.endsAt}` : `${line.startsAt}–${line.endsAt}`}
          </span>
        </h3>
        <button type="button" class="sheet-close" onClick={onClose} aria-label={t("close")}>
          ×
        </button>
      </div>

      {detail === null && failed === null && <p class="lede">{t("loading")}</p>}

      {detail !== null && (
        <>
          <ul class="detail-lines">
            {detail.items.map((item) => {
              const service = services.find((s) => s.id === item.serviceId);
              const who = staff.find((p) => p.id === item.staffId);
              return (
                <li key={item.id}>
                  <span class="detail-time">
                    {item.startsAt}–{item.endsAt}
                  </span>
                  <span class="detail-what">{service ? serviceName(lang, service) : "—"}</span>
                  <span class="detail-who">{who?.name ?? "—"}</span>
                </li>
              );
            })}
          </ul>

          {detail.note && <p class="detail-note">{detail.note}</p>}

          <div class="moves" role="group" aria-label={t("status")}>
            {MOVES.map((move) => (
              <button
                type="button"
                key={move.status}
                class={`move is-${move.status}${detail.status === move.status ? " is-on" : ""}`}
                disabled={busy || detail.status === move.status}
                onClick={() => send({ status: move.status })}
              >
                {t(move.key)}
              </button>
            ))}
          </div>

          {/* Taking payment finishes the visit. There is no separate paid status, by the shop's request. */}
          {detail.status !== "cancelled" && detail.status !== "no_show" && (
            <div class="till">
              {detail.payments.length > 0 ? (
                <ul class="paid-lines">
                  {detail.payments.map((p) => (
                    <li key={p.id}>
                      <span class="paid-tag">{t("paid")}</span>
                      {p.currency} {p.amount.toLocaleString("en-US")}
                      <span class="paid-method">{t(`method.${p.method}` as "method.cash")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div class="field-row">
                  <label class="field">
                    <span>{t("amount")}</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={amount}
                      onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
                    />
                  </label>
                  <label class="field">
                    <span>{t("currency")}</span>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency((e.target as HTMLSelectElement).value)}
                    >
                      {currencyCodes.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label class="field">
                    <span>{t("method")}</span>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod((e.target as HTMLSelectElement).value)}
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {t(`method.${m}` as "method.cash")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    class="primary"
                    disabled={busy || Number(amount) <= 0}
                    onClick={pay}
                  >
                    {t("takePayment")}
                  </button>
                </div>
              )}
            </div>
          )}

          <details class="reschedule">
            <summary>{t("reschedule")}</summary>

            <div class="field-row">
              <label class="field">
                <span>{t("startsAt")}</span>
                <input
                  type="time"
                  step={900}
                  value={movingTo}
                  onInput={(e) => setMovingTo((e.target as HTMLInputElement).value)}
                />
              </label>

              <label class="field">
                <span>{t("withWhom")}</span>
                <select
                  value={staffId ?? ""}
                  onChange={(e) =>
                    setStaffId(Number((e.target as HTMLSelectElement).value) || null)
                  }
                >
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div class="sheet-actions">
              {needsConfirmation && !stopped ? (
                <button
                  type="button"
                  class="primary"
                  disabled={busy}
                  onClick={() =>
                    send({
                      ...(moved ? { startsAt: movingTo } : {}),
                      ...(restaffed ? { staffId } : {}),
                      acceptWarnings: true,
                    })
                  }
                >
                  {t("submitAnyway")}
                </button>
              ) : (
                <button
                  type="button"
                  class="primary"
                  disabled={busy || (!moved && !restaffed)}
                  onClick={() =>
                    send({
                      ...(moved ? { startsAt: movingTo } : {}),
                      ...(restaffed ? { staffId } : {}),
                    })
                  }
                >
                  {busy ? t("sending") : t("applyChange")}
                </button>
              )}
            </div>
          </details>
        </>
      )}

      {detail !== null && detail.history.length > 0 && (
        <History events={detail.history} staff={staff} />
      )}

      {failed && (
        <p class="failed" role="alert">
          {failed}
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
    </div>
  );
}

/** Change log for a booking, with the number of moves shown in the summary. */
function History({ events, staff }: { events: Event[]; staff: Person[] }) {
  const { t, lang } = useText();
  const moves = events.filter((e) => e.kind === "moved").length;
  const nameOf = (id: string | null) =>
    staff.find((p) => String(p.id) === id)?.name ?? id ?? "—";

  const when = (at: number) =>
    new Date(at * 1000).toLocaleString(lang === "zh" ? "zh-Hant" : lang, {
      timeZone: "Asia/Macau",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <details class="history">
      <summary>
        {t("history")}
        {moves > 0 && <span class="history-count">{t("movedTimes", { n: moves })}</span>}
      </summary>

      <ol class="history-list">
        {events.map((event) => (
          <li key={event.id}>
            <span class="history-when">{when(event.at)}</span>
            <span class="history-what">
              {event.kind === "restaffed"
                ? t("event.restaffed", {
                    before: nameOf(event.before),
                    after: nameOf(event.after),
                  })
                : t(`event.${event.kind}`, {
                    // Stored statuses are raw English values ("booked"); translate them.
                    before: statusName(event.before, t),
                    after: statusName(event.after, t),
                  })}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
