// Customers.
//
// A list you search, and one person at a time. What makes this worth having
// over a spreadsheet is the second half of the page: what their bookings add
// up to, and what was done to their hair last time.

import { useEffect, useState } from "preact/hooks";
import { useText } from "./lang-context.ts";
import type { Lang } from "./i18n.ts";

type Summary = {
  id: number;
  name: string;
  searchKey: string | null;
  phone: string | null;
  firstVisitOn: string | null;
};

type Standing = {
  bookings: number;
  visits: number;
  cancelled: number;
  noShow: number;
  moves: number;
  shortNotice: number;
  lastVisitOn: string | null;
};

type Visit = {
  id: number;
  date: string;
  startsAt: string;
  endsAt: string;
  status: string;
  nominated: boolean;
  note: string | null;
  lines: {
    serviceJa: string | null;
    serviceZh: string | null;
    serviceEn: string | null;
    staffName: string | null;
  }[];
};

type Record_ = {
  id: number;
  bookingId: number | null;
  formula: string | null;
  note: string | null;
  caution: string | null;
  recordedOn: string;
};

type Person = Summary & {
  note: string | null;
  standing: Standing;
  bookings: Visit[];
  records: Record_[];
  cautions: Record_[];
};

const nameIn = (
  lang: Lang,
  line: { serviceJa: string | null; serviceZh: string | null; serviceEn: string | null },
): string => {
  if (lang === "zh") return line.serviceZh ?? line.serviceJa ?? "—";
  if (lang === "en") return line.serviceEn ?? line.serviceJa ?? "—";
  return line.serviceJa ?? "—";
};

export function Customers({
  openId,
  onOpen,
}: {
  openId: number | null;
  onOpen: (id: number | null) => void;
}) {
  const { t } = useText();
  const [query, setQuery] = useState("");
  const [list, setList] = useState<Summary[]>([]);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const stop = new AbortController();
    // Waits for typing to stop. Without it every keystroke is a query, and
    // D1's free allowance is counted in rows read.
    const timer = setTimeout(() => {
      fetch(`/api/people?q=${encodeURIComponent(query)}`, { signal: stop.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as Summary[];
        })
        .then(setList)
        .catch((problem: unknown) => {
          if (!stop.signal.aborted) setFailed(String(problem));
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [query]);

  return (
    <div class="people">
      <div class="people-list">
        <label class="field grow">
          <span>{t("search")}</span>
          <input
            type="search"
            value={query}
            placeholder={t("searchHint")}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </label>

        {failed && (
          <p class="failed" role="alert">
            {failed}
          </p>
        )}

        <ul>
          {list.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                class={person.id === openId ? "is-on" : undefined}
                onClick={() => onOpen(person.id === openId ? null : person.id)}
              >
                <span class="people-name">{person.name}</span>
                {person.searchKey && <span class="people-key">{person.searchKey}</span>}
              </button>
            </li>
          ))}
        </ul>

        {list.length === 0 && !failed && <p class="lede">{t("noneFound")}</p>}
      </div>

      <div class="people-detail">
        {openId === null ? (
          <p class="lede">{t("pickSomeone")}</p>
        ) : (
          <PersonDetail id={openId} />
        )}
      </div>
    </div>
  );
}

function PersonDetail({ id }: { id: number }) {
  const { t, lang } = useText();
  const [person, setPerson] = useState<Person | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const stop = new AbortController();
    setPerson(null);
    setFailed(null);

    fetch(`/api/people/${id}`, { signal: stop.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Person;
      })
      .then(setPerson)
      .catch((problem: unknown) => {
        if (!stop.signal.aborted) setFailed(String(problem));
      });

    return () => stop.abort();
  }, [id]);

  if (failed) {
    return (
      <p class="failed" role="alert">
        {failed}
      </p>
    );
  }
  if (person === null) return <p class="lede">{t("loading")}</p>;

  const s = person.standing;

  return (
    <article class="person">
      <header class="person-head">
        <h3>{person.name}</h3>
        {person.phone && <span class="person-phone">{person.phone}</span>}
      </header>

      {/* Anything on the person rather than a single visit comes first, and
          stays visible. A tender scalp read three screens down is a tender
          scalp nobody read. */}
      {person.cautions.length > 0 && (
        <ul class="cautions">
          {person.cautions.map((r) => (
            <li key={r.id}>{r.caution}</li>
          ))}
        </ul>
      )}

      {person.note && <p class="detail-note">{person.note}</p>}

      <dl class="standing">
        <Stat label={t("visits")} value={s.visits} />
        <Stat label={t("lastVisit")} value={s.lastVisitOn ?? "—"} />
        {/* Shown only when there is something to show. A row of zeroes reads
            as an accusation nobody made. */}
        {s.moves > 0 && <Stat label={t("moves")} value={s.moves} warn />}
        {s.cancelled > 0 && <Stat label={t("cancelledCount")} value={s.cancelled} warn />}
        {s.shortNotice > 0 && <Stat label={t("shortNotice")} value={s.shortNotice} warn />}
        {s.noShow > 0 && <Stat label={t("noShowCount")} value={s.noShow} warn />}
      </dl>

      {person.records.length > 0 && (
        <section>
          <h4>{t("records")}</h4>
          <ul class="records">
            {person.records.map((r) => (
              <li key={r.id}>
                <span class="record-on">{r.recordedOn}</span>
                <div class="record-body">
                  {r.formula && <p class="record-formula">{r.formula}</p>}
                  {r.note && <p>{r.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4>{t("pastVisits")}</h4>
        <ul class="visits">
          {person.bookings.map((visit) => (
            <li key={visit.id} class={`visit is-${visit.status}`}>
              <span class="visit-when">
                {visit.date} {visit.startsAt}
              </span>
              <span class="visit-what">
                {visit.lines.map((line) => nameIn(lang, line)).join(" → ") || "—"}
              </span>
              <span class="visit-who">{visit.lines[0]?.staffName ?? "—"}</span>
              <span class={`visit-status is-${visit.status}`}>{t(statusKey(visit.status))}</span>
            </li>
          ))}
        </ul>
        {person.bookings.length === 0 && <p class="lede">{t("noVisitsYet")}</p>}
      </section>
    </article>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div class={`stat${warn ? " is-warn" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function statusKey(status: string) {
  switch (status) {
    case "arrived":
      return "markArrived" as const;
    case "done":
      return "markDone" as const;
    case "cancelled":
      return "markCancelled" as const;
    case "no_show":
      return "markNoShow" as const;
    default:
      return "markBooked" as const;
  }
}
