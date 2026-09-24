// Stage three: the day. The room from stage two is still here, further down,
// because the calendar only makes sense once you know what the columns are.

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { Calendar, Peak } from "./calendar.tsx";
import { BookingForm } from "./book.tsx";
import { BookingPanel } from "./booking-panel.tsx";
import type { Customer, Service } from "./book.tsx";
import type { Day, Line, Room } from "./types.ts";
import { shiftDate, todayInShop } from "./types.ts";
import { LANGS, LANG_LABEL } from "./i18n.ts";
import type { Lang } from "./i18n.ts";
import { LangContext, initialLang, rememberLang, useText } from "./lang-context.ts";

type Load<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "failed"; reason: string };

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * The language lives here so that everything under it can read it, and the
 * screen itself is a separate component — a hook cannot read a context its
 * own component provides.
 */
export function App() {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const value = useMemo(
    () => ({
      lang,
      setLang: (next: Lang) => {
        setLangState(next);
        rememberLang(next);
        // So that a screen reader and the browser's own furniture agree with
        // what is on the page.
        document.documentElement.lang = next === "zh" ? "zh-Hant" : next;
      },
    }),
    [lang],
  );

  return (
    <LangContext.Provider value={value}>
      <Screen />
    </LangContext.Provider>
  );
}

function Screen() {
  const { t, lang, setLang, weekday } = useText();
  const [date, setDate] = useState(todayInShop);
  const [room, setRoom] = useState<Load<Room>>({ status: "loading" });
  const [day, setDay] = useState<Load<Day>>({ status: "loading" });
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [booking, setBooking] = useState(false);
  const [picked, setPicked] = useState<Line | null>(null);
  // Bumped after a booking goes in, to pull the day again.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const stop = new AbortController();
    get<Room>("/api/room", stop.signal)
      .then((value) => setRoom({ status: "ready", value }))
      .catch((error: unknown) => {
        if (!stop.signal.aborted) setRoom({ status: "failed", reason: String(error) });
      });
    return () => stop.abort();
  }, []);

  useEffect(() => {
    const stop = new AbortController();
    Promise.all([
      get<Service[]>("/api/services", stop.signal),
      get<Customer[]>("/api/customers", stop.signal),
    ])
      .then(([menu, people]) => {
        setServices(menu);
        setCustomers(people);
      })
      // The form is the only thing that needs these. Failing to load them
      // should not take the calendar down with it.
      .catch(() => undefined);
    return () => stop.abort();
  }, []);

  useEffect(() => {
    const stop = new AbortController();
    setDay({ status: "loading" });
    get<Day>(`/api/day?date=${date}`, stop.signal)
      .then((value) => setDay({ status: "ready", value }))
      .catch((error: unknown) => {
        if (!stop.signal.aborted) setDay({ status: "failed", reason: String(error) });
      });
    return () => stop.abort();
  }, [date, revision]);

  const go = useCallback((days: number) => setDate((d) => shiftDate(d, days)), []);

  return (
    <main class="wide">
      <header>
        <div class="title">
          <h1>chairside</h1>
          <p class="tagline">{t("tagline")}</p>
        </div>

        {/* Three buttons rather than a dropdown. There are only three, they
            are short, and a guest at the desk can see which one is on without
            opening anything. */}
        <div class="langs" role="group" aria-label="Language">
          {LANGS.map((code) => (
            <button
              type="button"
              key={code}
              class={code === lang ? "is-on" : undefined}
              aria-pressed={code === lang}
              onClick={() => setLang(code)}
              lang={code === "zh" ? "zh-Hant" : code}
            >
              {LANG_LABEL[code]}
            </button>
          ))}
        </div>
      </header>

      <section aria-labelledby="day">
        <div class="day-bar">
          <h2 id="day">
            {date}
            <span class="day-weekday">
              （{weekday(new Date(`${date}T00:00:00Z`).getUTCDay())}）
            </span>
          </h2>
          <div class="day-nav">
            <button type="button" onClick={() => go(-1)} aria-label={t("prevDay")}>
              ←
            </button>
            <button type="button" onClick={() => setDate(todayInShop())} disabled={date === todayInShop()}>
              {t("today")}
            </button>
            <button type="button" onClick={() => go(1)} aria-label={t("nextDay")}>
              →
            </button>
            <button
              type="button"
              class="primary"
              onClick={() => {
                setPicked(null);
                setBooking(true);
              }}
              disabled={services.length === 0}
            >
              {t("takeBooking")}
            </button>
          </div>
        </div>

        {booking && (
          <BookingForm
            date={date}
            staff={room.status === "ready" ? room.value.staff : []}
            services={services}
            customers={customers}
            onBooked={() => {
              setBooking(false);
              setRevision((n) => n + 1);
            }}
            onClose={() => setBooking(false)}
          />
        )}

        {picked !== null && room.status === "ready" && (
          <BookingPanel
            line={picked}
            staff={room.value.staff}
            services={services}
            onChanged={() => {
              setPicked(null);
              setRevision((n) => n + 1);
            }}
            onClose={() => setPicked(null)}
          />
        )}

        {day.status === "loading" && <p class="lede">{t("loading")}</p>}

        {day.status === "failed" && (
          <p class="failed" role="alert">
            {t("dayFailed")} <span class="reason">{day.reason}</span>
          </p>
        )}

        {day.status === "ready" && room.status === "ready" && (
          <>
            {day.value.holidays.length > 0 && (
              <p class="holiday-note">
                {day.value.holidays.map((h) => `${h.region}：${h.name}`).join("　")}
              </p>
            )}

            <Peak day={day.value} seats={room.value.seats} />
            <Calendar
              day={day.value}
              seats={room.value.seats}
              services={services}
              onPick={(line) => {
                // Only one panel at a time. Taking a booking and editing a
                // different one at once is two answers to the same question.
                setBooking(false);
                setPicked(line);
              }}
              picked={picked?.bookingId ?? null}
            />

            {/* Sample data sits on a fixed week, so a visitor arriving later
                lands on an empty day. Saying where the data is beats showing
                an empty grid and leaving them to guess. */}
            {day.value.lines.length > 0 || !day.value.bookedRange?.from ? null : (
              <p class="lede">
                {t("nothingBooked")}{" "}
                <button type="button" class="link" onClick={() => setDate(day.value.bookedRange!.from!)}>
                  {t("sampleIs", {
                    from: day.value.bookedRange.from ?? "",
                    to: day.value.bookedRange.to ?? "",
                  })}
                </button>
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="room">
        <h2 id="room">{t("room")}</h2>
        {room.status === "ready" && <RoomSummary room={room.value} />}
        {room.status === "failed" && (
          <p class="failed" role="alert">
            {t("roomFailed")} <span class="reason">{room.reason}</span>
          </p>
        )}
      </section>

      <footer>
        <p>
          Stage three. The grid is one column per seat and one row per quarter
          hour, reading from D1. Why the room is counted this way is in{" "}
          <code>DESIGN.md</code>.
        </p>
      </footer>
    </main>
  );
}

function RoomSummary({ room }: { room: Room }) {
  const { t } = useText();
  const styling = room.seats.filter((s) => s.kind === "styling").length;
  const shampoo = room.seats.filter((s) => s.kind === "shampoo").length;

  return (
    <>
      <p class="lede">
        {t("roomSummary", { styling, shampoo, staff: room.staff.length })}
      </p>
      <ul class="staff">
        {room.staff.map((person) => (
          <li key={person.id}>
            <span class="dot" style={{ background: person.color ?? "#888" }} aria-hidden="true" />
            {person.name}
            <span class="role">
              {person.role === "owner" || person.role === "stylist" || person.role === "assistant"
                ? t(person.role)
                : person.role}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
