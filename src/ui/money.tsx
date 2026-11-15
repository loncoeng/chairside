// Monthly takings report.

import { useEffect, useState } from "preact/hooks";
import { useText } from "./lang-context.ts";
import { serviceName } from "./i18n.ts";

/** Every amount is in cents of the base currency. */
type Revenue = {
  month: string;
  totalCents: number;
  bills: number;
  nominated: number;
  byDay: { date: string; totalCents: number; n: number }[];
  byCurrency: { currency: string; amountCents: number; totalCents: number; n: number }[];
  byMethod: { method: string; totalCents: number; n: number }[];
  byStaff: { staffId: number | null; name: string | null; totalCents: number; n: number }[];
  byService: {
    serviceId: number | null;
    nameJa: string | null;
    nameZh: string | null;
    nameEn: string | null;
    n: number;
  }[];
};

/** Whole patacas: a takings report has no use for the cents. */
const mop = (cents: number) => Math.round(cents / 100).toLocaleString("en-US");

/** Every day of the month, zero-filled. The API returns only days with takings. */
function everyDay(month: string, taken: { date: string; totalCents: number; n: number }[]) {
  const found = new Map(taken.map((d) => [d.date, d]));
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const out: { date: string; day: number; weekday: number; totalCents: number; n: number }[] = [];
  for (let day = 1; day <= days; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const row = found.get(date);
    out.push({
      date,
      day,
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      totalCents: row?.totalCents ?? 0,
      n: row?.n ?? 0,
    });
  }
  return out;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export function Money({ month, onMonth }: { month: string; onMonth: (month: string) => void }) {
  const { t, lang, weekday } = useText();
  const [data, setData] = useState<Revenue | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const stop = new AbortController();
    setData(null);
    setFailed(null);

    fetch(`/api/revenue?month=${month}`, { signal: stop.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Revenue;
      })
      .then(setData)
      .catch((problem: unknown) => {
        if (!stop.signal.aborted) setFailed(String(problem));
      });

    return () => stop.abort();
  }, [month]);

  const days = data ? everyDay(month, data.byDay) : [];
  const busiest = Math.max(1, ...days.map((d) => d.totalCents));
  // Average over days with takings only, so closed days don't drag it down.
  const open = days.filter((d) => d.n > 0);
  const average =
    open.length === 0 ? 0 : open.reduce((sum, d) => sum + d.totalCents, 0) / open.length;

  return (
    <div class="money">
      <div class="day-bar">
        <h2>{month}</h2>
        <div class="day-nav">
          <button
            type="button"
            onClick={() => onMonth(shiftMonth(month, -1))}
            aria-label={t("prevMonth")}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onMonth(shiftMonth(month, 1))}
            aria-label={t("nextMonth")}
          >
            →
          </button>
        </div>
      </div>

      {failed && (
        <p class="failed" role="alert">
          {failed}
        </p>
      )}
      {data === null && !failed && <p class="lede">{t("loading")}</p>}

      {data && data.bills === 0 && <p class="lede">{t("noTakings")}</p>}

      {data && data.bills > 0 && (
        <>
          <dl class="standing">
            <div class="stat">
              <dt>{t("takings")}</dt>
              <dd class="big">{mop(data.totalCents)}</dd>
            </div>
            <div class="stat">
              <dt>{t("bills")}</dt>
              <dd>{data.bills}</dd>
            </div>
            <div class="stat">
              <dt>{t("perBill")}</dt>
              <dd>{mop(data.totalCents / data.bills)}</dd>
            </div>
            <div class="stat">
              <dt>{t("nominatedShare")}</dt>
              <dd>{Math.round((data.nominated / data.bills) * 100)}%</dd>
            </div>
          </dl>

          {/* Plain CSS columns instead of a chart library (~90KB of JS). */}
          <section>
            <h4>{t("byDay")}</h4>
            <div class="chart">
              {/* The line and the bars share one box, so a share of its height
                  means the same thing to both. The day labels sit below it. */}
              <div class="chart-plot">
                {average > 0 && (
                  <div
                    class="chart-mean"
                    style={{ bottom: `${(average / busiest) * 100}%` }}
                    title={`${t("average")} ${mop(average)}`}
                  >
                    <span>{t("average")}</span>
                  </div>
                )}
                <ul class="chart-bars">
                  {days.map((d) => (
                    <li
                      key={d.date}
                      class={`chart-day${d.n === 0 ? " is-shut" : ""}${d.weekday === 0 || d.weekday === 6 ? " is-weekend" : ""}`}
                      title={
                        d.n === 0
                          ? `${d.date}（${weekday(d.weekday)}）${t("noTakingsThatDay")}`
                          : `${d.date}（${weekday(d.weekday)}）${mop(d.totalCents)} / ${d.n}`
                      }
                    >
                      <span
                        class="chart-fill"
                        style={{ height: `${(d.totalCents / busiest) * 100}%` }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
              <ul class="chart-labels" aria-hidden="true">
                {days.map((d) => (
                  <li
                    key={d.date}
                    class={`chart-label${d.n === 0 ? " is-shut" : ""}${d.weekday === 0 || d.weekday === 6 ? " is-weekend" : ""}`}
                  >
                    {String(d.day).padStart(2, "0")}
                    <em>{weekday(d.weekday)}</em>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <div class="money-cols">
            <section>
              <h4>{t("byStylist")}</h4>
              <ul class="rows">
                {data.byStaff.map((s) => (
                  <li key={s.staffId ?? "none"}>
                    <span>{s.name ?? "—"}</span>
                    <span class="rows-n">{s.n}</span>
                    <span class="rows-value">{mop(s.totalCents)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h4>{t("byCurrency")}</h4>
              <ul class="rows">
                {data.byCurrency.map((c) => (
                  <li key={c.currency}>
                    <span>{c.currency}</span>
                    <span class="rows-n">{c.n}</span>
                    {/* Amount in the currency received; the converted figure is in the total. */}
                    <span class="rows-value">{mop(c.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h4>{t("byMethod")}</h4>
              <ul class="rows">
                {data.byMethod.map((m) => (
                  <li key={m.method}>
                    <span>{t(`method.${m.method}` as "method.cash")}</span>
                    <span class="rows-n">{m.n}</span>
                    <span class="rows-value">{mop(m.totalCents)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h4>{t("byService")}</h4>
              <ul class="rows">
                {data.byService.slice(0, 8).map((s) => (
                  <li key={s.serviceId ?? "none"}>
                    <span>
                      {s.nameJa
                        ? serviceName(lang, {
                            nameJa: s.nameJa,
                            nameZh: s.nameZh,
                            nameEn: s.nameEn,
                          })
                        : "—"}
                    </span>
                    <span class="rows-n">{s.n}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <p class="lede money-note">{t("takingsNote")}</p>
        </>
      )}
    </div>
  );
}
