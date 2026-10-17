// Customer list with search, and a detail view with booking stats, records and history.

import { useEffect, useState } from "preact/hooks";
import { useText } from "./lang-context.ts";
import type { Lang } from "./i18n.ts";
import { todayInShop } from "./types.ts";

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
  address: string | null;
  birthday: string | null;
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

/** Customer form fields, for both new and existing customers. */
type Details = {
  name: string;
  searchKey: string;
  phone: string;
  address: string;
  birthday: string;
  note: string;
  firstVisitOn: string;
};

const BLANK: Details = {
  name: "",
  searchKey: "",
  phone: "",
  address: "",
  birthday: "",
  note: "",
  firstVisitOn: "",
};

type Saved = { customerId: number; samePhone: { id: number; name: string }[] };

export function Customers({
  openId,
  onOpen,
  onChanged,
}: {
  openId: number | null;
  onOpen: (id: number | null) => void;
  /** Called after an add or rename, since the booking form's customer list is now stale. */
  onChanged?: () => void;
}) {
  const { t } = useText();
  const [query, setQuery] = useState("");
  const [list, setList] = useState<Summary[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Bumped after a save to refetch the list and the open customer.
  const [revision, setRevision] = useState(0);
  const [said, setSaid] = useState<Saved | null>(null);

  const saved = (reply: Saved) => {
    setAdding(false);
    setSaid(reply);
    setRevision((n) => n + 1);
    onChanged?.();
    if (reply.customerId !== openId) onOpen(reply.customerId);
  };

  useEffect(() => {
    const stop = new AbortController();
    // Debounce: D1's free tier is metered in rows read.
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
  }, [query, revision]);

  return (
    <div class="people">
      <div class="people-list">
        <button
          type="button"
          class="primary people-add"
          onClick={() => {
            setSaid(null);
            setAdding(true);
          }}
        >
          ＋ {t("newCustomer")}
        </button>

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
                onClick={() => {
                  setAdding(false);
                  setSaid(null);
                  onOpen(person.id === openId ? null : person.id);
                }}
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
        {said && (
          <p class="said">
            {t("customerSaved")}
            {said.samePhone.length > 0 && (
              <>
                {" "}
                {t("samePhone", { names: "" })}
                {said.samePhone.map((other, i) => (
                  <span key={other.id}>
                    {i > 0 && "、"}
                    <button type="button" class="link" onClick={() => onOpen(other.id)}>
                      {other.name}
                    </button>
                  </span>
                ))}
              </>
            )}
          </p>
        )}
        {adding ? (
          <CustomerForm
            title={t("newCustomer")}
            initial={BLANK}
            onSaved={saved}
            onCancel={() => setAdding(false)}
          />
        ) : openId === null ? (
          <p class="lede">{t("pickSomeone")}</p>
        ) : (
          <PersonDetail id={openId} revision={revision} onSaved={saved} />
        )}
      </div>
    </div>
  );
}

function PersonDetail({
  id,
  revision,
  onSaved,
}: {
  id: number;
  revision: number;
  onSaved: (reply: Saved) => void;
}) {
  const { t, lang } = useText();
  const [person, setPerson] = useState<Person | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => setEditing(false), [id]);

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
  }, [id, revision]);

  if (failed) {
    return (
      <p class="failed" role="alert">
        {failed}
      </p>
    );
  }
  if (person === null) return <p class="lede">{t("loading")}</p>;

  if (editing) {
    return (
      <CustomerForm
        title={t("editCustomer")}
        id={person.id}
        initial={{
          name: person.name,
          searchKey: person.searchKey ?? "",
          phone: person.phone ?? "",
          address: person.address ?? "",
          birthday: person.birthday ?? "",
          note: person.note ?? "",
          firstVisitOn: person.firstVisitOn ?? "",
        }}
        onSaved={(reply) => {
          setEditing(false);
          onSaved(reply);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const s = person.standing;

  return (
    <article class="person">
      <header class="person-head">
        <h3>{person.name}</h3>
        {person.phone && (
          <span class="person-phone">
            <span class="person-phone-label">{t("phone")}</span>
            <a href={`tel:${person.phone.replace(/\s+/g, "")}`}>{person.phone}</a>
          </span>
        )}
        <button type="button" class="link person-edit" onClick={() => setEditing(true)}>
          {t("editCustomer")}
        </button>
      </header>

      {person.birthday && (
        <p class="person-address">
          <span class="person-phone-label">{t("birthday")}</span>
          {person.birthday}
          {/* Birthday month flag, in text so it doesn't rely on colour alone. */}
          {person.birthday.slice(5, 7) === todayInShop().slice(5, 7) && (
            <span class="birthday-month">{t("birthdayThisMonth")}</span>
          )}
        </p>
      )}

      {person.address && (
        <p class="person-address">
          <span class="person-phone-label">{t("address")}</span>
          {person.address}
        </p>
      )}

      {/* Cautions apply to the person, not one visit, so they go near the top. */}
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
        {/* Shown only when non-zero. */}
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

/** Add or edit a customer. Only the name is required; the rest is often unknown at first. */
function CustomerForm({
  title,
  id,
  initial,
  onSaved,
  onCancel,
}: {
  title: string;
  /** Undefined for a new customer. */
  id?: number;
  initial: Details;
  onSaved: (reply: Saved) => void;
  onCancel: () => void;
}) {
  const { t, failure } = useText();
  const [form, setForm] = useState<Details>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const set = (key: keyof Details) => (e: Event) =>
    setForm({ ...form, [key]: (e.target as HTMLInputElement | HTMLTextAreaElement).value });

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch(id === undefined ? "/api/people" : `/api/people/${id}`, {
        method: id === undefined ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const reply = (await response.json()) as { ok?: boolean; error?: string } & Partial<Saved>;
      if (reply.ok !== true || typeof reply.customerId !== "number") {
        setFailed(failure(reply, response.status));
        return;
      }
      onSaved({ customerId: reply.customerId, samePhone: reply.samePhone ?? [] });
    } catch (problem: unknown) {
      setFailed(String(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="sheet person-form" onSubmit={submit}>
      <div class="sheet-head">
        <h3>{title}</h3>
      </div>

      <div class="field-row">
        <label class="field grow">
          <span>{t("customerName")} *</span>
          <input type="text" required maxLength={100} value={form.name} onInput={set("name")} />
        </label>
        <label class="field grow">
          <span>{t("searchKeyLabel")}</span>
          <input
            type="text"
            maxLength={100}
            value={form.searchKey}
            placeholder={t("searchKeyHint")}
            onInput={set("searchKey")}
          />
        </label>
      </div>

      <div class="field-row">
        <label class="field grow">
          <span>{t("phone")}</span>
          <input type="tel" maxLength={40} value={form.phone} onInput={set("phone")} />
        </label>
        <label class="field">
          <span>{t("birthday")}</span>
          <input type="date" value={form.birthday} onInput={set("birthday")} />
        </label>
        <label class="field">
          <span>{t("firstVisit")}</span>
          <input type="date" value={form.firstVisitOn} onInput={set("firstVisitOn")} />
        </label>
      </div>

      <label class="field">
        <span>{t("address")}</span>
        <textarea rows={2} maxLength={300} value={form.address} onInput={set("address")} />
      </label>

      <label class="field">
        <span>{t("note")}</span>
        <textarea rows={3} maxLength={2000} value={form.note} onInput={set("note")} />
      </label>

      {failed && (
        <p class="failed" role="alert">
          {failed}
        </p>
      )}

      <div class="field-row">
        <button type="submit" class="primary" disabled={busy || form.name.trim() === ""}>
          {busy ? t("sending") : t("saveCustomer")}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
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
