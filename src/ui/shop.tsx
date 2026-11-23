// Shop settings: opening hours, closures and staff.
// Each save shows a confirmation, including side effects such as bookings left standing.

import { Avatar } from "./avatar.tsx";
import { useEffect, useState } from "preact/hooks";
import { useText } from "./lang-context.ts";
import { todayInShop } from "./types.ts";

type Hours = { weekday: number; opensAt: string | null; closesAt: string | null; closed: boolean };
type Closure = { id: number; date: string; reason: string | null };
type Person = {
  id: number;
  name: string;
  role: string;
  grade?: string;
  color: string | null;
  joinedOn: string | null;
  leftOn: string | null;
};
type Settings = { hours: Hours[]; closures: Closure[]; staff: Person[] };

export function Shop() {
  const { t, weekday, failure } = useText();
  const [data, setData] = useState<Settings | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const [closeOn, setCloseOn] = useState(todayInShop());
  const [closeWhy, setCloseWhy] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("stylist");

  useEffect(() => {
    const stop = new AbortController();
    fetch("/api/shop", { signal: stop.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Settings;
      })
      .then(setData)
      .catch((problem: unknown) => {
        if (!stop.signal.aborted) setFailed(String(problem));
      });
    return () => stop.abort();
  }, [revision]);

  async function send(
    path: string,
    method: string,
    body: unknown,
  ): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setFailed(null);
    setSaid(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const reply = (await response.json()) as Record<string, unknown>;
      if (reply.ok !== true) {
        setFailed(failure(reply, response.status));
        return null;
      }
      setRevision((n) => n + 1);
      return reply;
    } catch (problem: unknown) {
      setFailed(String(problem));
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (failed && data === null) {
    return (
      <p class="failed" role="alert">
        {failed}
      </p>
    );
  }
  if (data === null) return <p class="lede">{t("loading")}</p>;

  function editHours(weekdayNo: number, patch: Partial<Hours>) {
    setData((current) =>
      current === null
        ? current
        : {
            ...current,
            hours: current.hours.map((h) => (h.weekday === weekdayNo ? { ...h, ...patch } : h)),
          },
    );
  }

  return (
    <div class="shop">
      {failed && (
        <p class="failed" role="alert">
          {failed}
        </p>
      )}
      {said && <p class="said">{said}</p>}

      <section>
        <h3>{t("openingHours")}</h3>
        <ul class="hours">
          {data.hours.map((h) => (
            <li key={h.weekday}>
              <span class="hours-day">{weekday(h.weekday)}</span>
              <label class="hours-closed">
                <input
                  type="checkbox"
                  checked={h.closed}
                  onChange={(e) =>
                    editHours(h.weekday, { closed: (e.target as HTMLInputElement).checked })
                  }
                />
                <span>{t("closedDay")}</span>
              </label>
              <input
                type="time"
                step={900}
                disabled={h.closed}
                value={h.opensAt ?? ""}
                onInput={(e) =>
                  editHours(h.weekday, { opensAt: (e.target as HTMLInputElement).value })
                }
              />
              <span class="hours-dash">–</span>
              <input
                type="time"
                step={900}
                disabled={h.closed}
                value={h.closesAt ?? ""}
                onInput={(e) =>
                  editHours(h.weekday, { closesAt: (e.target as HTMLInputElement).value })
                }
              />
            </li>
          ))}
        </ul>

        {/* Saves all seven days at once. */}
        <div class="sheet-actions">
          <button
            type="button"
            class="primary"
            disabled={busy}
            onClick={async () => {
              const ok = await send("/api/shop/hours", "PUT", { hours: data.hours });
              if (ok) setSaid(t("hoursSaved"));
            }}
          >
            {t("saveHours")}
          </button>
        </div>
      </section>

      <section>
        <h3>{t("closures")}</h3>
        <div class="field-row">
          <label class="field">
            <span>{t("date")}</span>
            <input
              type="date"
              value={closeOn}
              onInput={(e) => setCloseOn((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field grow">
            <span>{t("reason")}</span>
            <input
              type="text"
              value={closeWhy}
              maxLength={200}
              onInput={(e) => setCloseWhy((e.target as HTMLInputElement).value)}
            />
          </label>
          <button
            type="button"
            class="primary"
            disabled={busy}
            onClick={async () => {
              const reply = await send("/api/shop/closures", "POST", {
                date: closeOn,
                reason: closeWhy,
              });
              if (!reply) return;
              setCloseWhy("");
              // Bookings on that day are kept (guests still need a call), so report the count.
              const standing = Number(reply.bookingsOnThatDay ?? 0);
              setSaid(standing > 0 ? t("closedWithBookings", { n: standing }) : t("closedSaved"));
            }}
          >
            {t("addClosure")}
          </button>
        </div>

        <ul class="closures">
          {data.closures.map((c) => (
            <li key={c.id}>
              <span>{c.date}</span>
              <span class="closure-why">{c.reason ?? "—"}</span>
              <button
                type="button"
                class="link"
                disabled={busy}
                onClick={() => send("/api/shop/closures", "POST", { date: c.date, remove: true })}
              >
                {t("reopen")}
              </button>
            </li>
          ))}
        </ul>
        {data.closures.length === 0 && <p class="lede">{t("noClosures")}</p>}
      </section>

      <section>
        <h3>{t("theTeam")}</h3>
        <ul class="team">
          {data.staff.map((person) => (
            <TeamRow
              key={person.id}
              person={person}
              busy={busy}
              onSave={async (patch) => {
                // Only what changed; the server keeps every field that is not sent.
                const reply = await send("/api/shop/staff", "POST", { id: person.id, ...patch });
                if (!reply) return;
                const pending = Array.isArray(reply.stillBooked) ? reply.stillBooked.length : 0;
                setSaid(pending > 0 ? t("leftWithBookings", { n: pending }) : t("staffSaved"));
              }}
            />
          ))}
        </ul>

        <div class="field-row">
          <label class="field grow">
            <span>{t("addPerson")}</span>
            <input
              type="text"
              value={newName}
              maxLength={100}
              onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>{t("role")}</span>
            <select
              value={newRole}
              onChange={(e) => setNewRole((e.target as HTMLSelectElement).value)}
            >
              {["owner", "stylist", "assistant"].map((r) => (
                <option key={r} value={r}>
                  {t(r as "stylist")}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            class="primary"
            disabled={busy || newName.trim() === ""}
            onClick={async () => {
              const ok = await send("/api/shop/staff", "POST", {
                name: newName,
                role: newRole,
                joinedOn: todayInShop(),
              });
              if (ok) {
                setNewName("");
                setSaid(t("staffSaved"));
              }
            }}
          >
            {t("add")}
          </button>
        </div>

        <p class="lede money-note">{t("nobodyDeleted")}</p>
      </section>
    </div>
  );
}

export function TeamRow({
  person,
  busy,
  onSave,
}: {
  person: Person;
  busy: boolean;
  onSave: (patch: Partial<Person>) => void;
}) {
  const { t } = useText();
  const gone = person.leftOn !== null;
  // One click takes somebody off new bookings, so ask first.
  const [asking, setAsking] = useState(false);

  return (
    <li class={gone ? "is-gone" : undefined}>
      <Avatar name={person.name} color={person.color} />
      <span class="team-name">{person.name}</span>
      {/* Role (permissions) and grade (price) are separate. */}
      <span class="role">{t(person.role as "stylist")}</span>
      <span class="grade">{t(`grade.${person.grade ?? "stylist2"}` as "grade.owner")}</span>

      {/* Everything on the right; on a phone it takes the line under the name. */}
      <span class="team-actions">
        {gone ? (
          <>
            <span class="team-left">{t("leftOn", { date: person.leftOn ?? "" })}</span>
            <button
              type="button"
              class="link"
              disabled={busy}
              onClick={() => onSave({ leftOn: null })}
            >
              {t("bringBack")}
            </button>
          </>
        ) : asking ? (
          <>
            <span class="team-ask">
              {t("markLeftAsk", { name: person.name, date: todayInShop() })}
            </span>
            <button
              type="button"
              class="link team-confirm"
              disabled={busy}
              onClick={() => {
                setAsking(false);
                onSave({ leftOn: todayInShop() });
              }}
            >
              {t("markLeft")}
            </button>
            <button type="button" class="link" onClick={() => setAsking(false)}>
              {t("cancel")}
            </button>
          </>
        ) : (
          <button type="button" class="link" disabled={busy} onClick={() => setAsking(true)}>
            {t("markLeft")}
          </button>
        )}
      </span>
    </li>
  );
}
