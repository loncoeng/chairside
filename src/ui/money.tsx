// Takings.
//
// A month at a time, because that is the unit a shop thinks in: the rent is
// monthly, the stylists are paid monthly, and a good Tuesday means nothing on
// its own.

import { useEffect, useState } from "preact/hooks";
import { useText } from "./lang-context.ts";
import { serviceName } from "./i18n.ts";

type Revenue = {
  month: string;
  total: number;
  bills: number;
  nominated: number;
  byDay: { date: string; total: number; n: number }[];
  byCurrency: { currency: string; amount: number; total: number; n: number }[];
  byMethod: { method: string; total: number; n: number }[];
  byStaff: { staffId: number | null; name: string | null; total: number; n: number }[];
  byService: {
    serviceId: number | null;
    nameJa: string | null;
    nameZh: string | null;
    nameEn: string | null;
    n: number;
  }[];
};

const mop = (value: number) => Math.round(value).toLocaleString("en-US");

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export function Money({ month, onMonth }: { month: string; onMonth: (month: string) => void }) {
  const { t, lang } = useText();
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

  const busiest = data ? Math.max(1, ...data.byDay.map((d) => d.total)) : 1;

  return (
    <div class="money">
      <div class="day-bar">
        <h2>{month}</h2>
        <div class="day-nav">
          <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label={t("prevMonth")}>
            ←
          </button>
          <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} aria-label={t("nextMonth")}>
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
              <dd class="big">{mop(data.total)}</dd>
            </div>
            <div class="stat">
              <dt>{t("bills")}</dt>
              <dd>{data.bills}</dd>
            </div>
            <div class="stat">
              <dt>{t("perBill")}</dt>
              <dd>{mop(data.total / data.bills)}</dd>
            </div>
            <div class="stat">
              <dt>{t("nominatedShare")}</dt>
              <dd>{Math.round((data.nominated / data.bills) * 100)}%</dd>
            </div>
          </dl>

          {/* Bars rather than a chart library. Twenty-six numbers of the same
              kind need a shape, not axes and a legend. */}
          <section>
            <h4>{t("byDay")}</h4>
            <ul class="bars">
              {data.byDay.map((d) => (
                <li key={d.date}>
                  <span class="bar-label">{d.date.slice(8)}</span>
                  <span class="bar-track">
                    <span class="bar-fill" style={{ width: `${(d.total / busiest) * 100}%` }} />
                  </span>
                  <span class="bar-value">{mop(d.total)}</span>
                </li>
              ))}
            </ul>
          </section>

          <div class="money-cols">
            <section>
              <h4>{t("byStylist")}</h4>
              <ul class="rows">
                {data.byStaff.map((s) => (
                  <li key={s.staffId ?? "none"}>
                    <span>{s.name ?? "—"}</span>
                    <span class="rows-n">{s.n}</span>
                    <span class="rows-value">{mop(s.total)}</span>
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
                    {/* What was handed over, in what it was handed over in.
                        The converted figure is in the total above. */}
                    <span class="rows-value">{mop(c.amount)}</span>
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
                    <span class="rows-value">{mop(m.total)}</span>
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
                        ? serviceName(lang, { nameJa: s.nameJa, nameZh: s.nameZh, nameEn: s.nameEn })
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
