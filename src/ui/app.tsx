// App shell: sign-in, navigation, and the day view with the room summary below.

import { Avatar } from "./avatar.tsx";
import { ThemeSwitch } from "./theme.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Calendar, Peak } from "./calendar.tsx";
import { BookingForm } from "./book.tsx";
import { BookingPanel } from "./booking-panel.tsx";
import { Customers } from "./customers.tsx";
import { Money } from "./money.tsx";
import { Shop } from "./shop.tsx";
import { DEMO_LOGIN, startDemo, stopDemo } from "./demo.ts";
import { SignIn } from "./sign-in.tsx";
import type { Signed } from "./sign-in.tsx";
import type { Customer, Service } from "./book.tsx";
import type { Day, Line, Room } from "./types.ts";
import { shiftDate, timeInShop, todayInShop } from "./types.ts";
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

/** Provides the language. Screen is separate because a hook cannot read a context its own component provides. */
export function App() {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const value = useMemo(
    () => ({
      lang,
      setLang: (next: Lang) => {
        setLangState(next);
        rememberLang(next);
        // Keep <html lang> in sync for screen readers and the browser.
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

/**
 * Current screen from the hash (e.g. "#/people/3"), so reload and Back work.
 * A hash, not a path, because static assets are served by filename.
 */
function readHash(): {
  view: "day" | "people" | "money" | "shop";
  id: number | null;
  month: string | null;
} {
  if (/^#\/shop/.test(window.location.hash)) return { view: "shop", id: null, month: null };

  const people = /^#\/people(?:\/(\d+))?/.exec(window.location.hash);
  if (people) return { view: "people", id: people[1] ? Number(people[1]) : null, month: null };

  const money = /^#\/money(?:\/(\d{4}-\d{2}))?/.exec(window.location.hash);
  if (money) return { view: "money", id: null, month: money[1] ?? null };

  return { view: "day", id: null, month: null };
}

function Screen() {
  const { t, lang, setLang, weekday } = useText();
  const [route, setRoute] = useState(readHash);
  const [demo, setDemo] = useState<"off" | "loading" | "on" | "failed">("off");
  // undefined while the app is asking; null when nobody is signed in.
  const [me, setMe] = useState<Signed | null | undefined>(undefined);
  // Error message shown with the demo failure.
  const [demoWhy, setDemoWhy] = useState<string | null>(null);
  // Demo step log, shown on the sign-in screen to debug browser-only failures.
  const [trail, setTrail] = useState<string[]>([]);
  const note = useCallback((what: string) => setTrail((was) => [...was, what]), []);
  const [date, setDate] = useState(todayInShop);
  const [room, setRoom] = useState<Load<Room>>({ status: "loading" });
  const [day, setDay] = useState<Load<Day>>({ status: "loading" });
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  // Bumped on customer add/rename so the booking form's picker refetches.
  const [peopleRevision, setPeopleRevision] = useState(0);
  const [booking, setBooking] = useState(false);
  /** Where a new booking starts, when it was opened from the grid. */
  const [startAt, setStartAt] = useState<string | null>(null);
  const [picked, setPicked] = useState<Line | null>(null);
  // Bumped after a booking change to refetch the day.
  const [revision, setRevision] = useState(0);

  // Data fetches key on `session` (user + database). Null means signed out and
  // nothing is fetched; a fetch before sign-in gets 401 and would never retry.
  // `source` ignores the demo's "loading" state, which is not a new database
  // and would send a stale session check.
  const source = demo === "on" ? "demo" : "server";
  const session = me == null ? null : `${me.id}:${source}`;

  useEffect(() => {
    if (session === null) return;
    const stop = new AbortController();
    get<Room>("/api/room", stop.signal)
      .then((value) => {
        if (!stop.signal.aborted) setRoom({ status: "ready", value });
      })
      .catch((error: unknown) => {
        if (!stop.signal.aborted) setRoom({ status: "failed", reason: String(error) });
      });
    return () => stop.abort();
  }, [session]);

  useEffect(() => {
    if (session === null) return;
    const stop = new AbortController();
    Promise.all([
      get<Service[]>("/api/services", stop.signal),
      get<Customer[]>("/api/customers", stop.signal),
    ])
      .then(([menu, people]) => {
        setServices(menu);
        setCustomers(people);
      })
      // Only the form needs these; a failure must not break the calendar.
      .catch(() => undefined);
    return () => stop.abort();
  }, [peopleRevision, session]);

  useEffect(() => {
    if (session === null) return;
    const stop = new AbortController();
    setDay({ status: "loading" });
    get<Day>(`/api/day?date=${date}`, stop.signal)
      .then((value) => {
        if (!stop.signal.aborted) setDay({ status: "ready", value });
      })
      .catch((error: unknown) => {
        if (!stop.signal.aborted) setDay({ status: "failed", reason: String(error) });
      });
    return () => stop.abort();
  }, [date, revision, session]);

  // Session check, rerun when the data source changes (the demo has its own accounts).
  // Both paths must check `aborted`: a stale check returns 401, which is an
  // answer, not a failure, and would sign the visitor out after sign-in.
  useEffect(() => {
    const stop = new AbortController();
    fetch("/api/session", { signal: stop.signal })
      .then(async (r) => {
        const staff = r.ok ? (((await r.json()) as { staff?: Signed }).staff ?? null) : null;
        // Log only demo rejections, the case worth debugging.
        if (source === "demo" && staff === null) note(`session recheck: HTTP ${r.status}`);
        return staff;
      })
      .then((staff) => {
        if (!stop.signal.aborted) setMe(staff ?? null);
      })
      .catch((problem: unknown) => {
        if (source === "demo") note(`session recheck threw: ${String(problem)}`);
        if (!stop.signal.aborted) setMe(null);
      });
    return () => stop.abort();
  }, [revision, source, note]);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((days: number) => setDate((d) => shiftDate(d, days)), []);

  /**
   * Load the demo and sign in through the real POST /api/session. State changes
   * wait until sign-in completes: setting demo "on" earlier runs the effects
   * against an unsigned database and their 401s undo the sign-in.
   */
  const openDemo = useCallback(async () => {
    setDemo("loading");
    setDemoWhy(null);
    setTrail([]);

    let who: Signed | null = null;
    try {
      await startDemo(note);

      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(DEMO_LOGIN),
      });
      const reply = (await response.json()) as { ok?: boolean; staff?: Signed };
      note(`sign-in: HTTP ${response.status}${reply.staff ? ` as ${reply.staff.name}` : ""}`);
      if (!reply.ok || !reply.staff) throw new Error(`HTTP ${response.status}`);
      who = reply.staff;
    } catch (problem: unknown) {
      // Leave the demo running so the sign-in form can still be used by hand.
      setDemoWhy(String(problem));
      setDemo("failed");
      return;
    }

    setDemo("on");
    setMe(who);
    setRevision((n) => n + 1);
  }, [note]);

  const leaveDemo = useCallback(() => {
    stopDemo();
    setDemo("off");
    setMe(null);
    setRevision((n) => n + 1);
  }, []);

  if (me === undefined)
    return (
      <main class="wide">
        <p class="lede">{t("loading")}</p>
      </main>
    );

  if (me === null) {
    return (
      <SignIn
        demo={demo === "on" ? DEMO_LOGIN : null}
        onSignedIn={(who) => {
          setMe(who);
          setRevision((n) => n + 1);
        }}
        onOpenDemo={() => void openDemo()}
        demoState={demo}
        demoWhy={demoWhy}
        trail={trail}
      />
    );
  }

  const owner = me.role === "owner";

  return (
    <main class="wide">
      <header ref={useHeaderHeight()}>
        <div class="title">
          <h1>chairside</h1>
          {demo === "on" && (
            <span class="demo-badge" title={t("demoBanner")}>
              {t("demoBadge")}
            </span>
          )}
        </div>

        <nav class="views" aria-label="View">
          <a href="#/" class={route.view === "day" ? "is-on" : undefined}>
            {t("navDay")}
          </a>
          <a href="#/people" class={route.view === "people" ? "is-on" : undefined}>
            {t("navPeople")}
          </a>
          {/* Hidden for non-owners. The server enforces it too. */}
          {owner && (
            <>
              <a href="#/money" class={route.view === "money" ? "is-on" : undefined}>
                {t("navMoney")}
              </a>
              <a href="#/shop" class={route.view === "shop" ? "is-on" : undefined}>
                {t("navShop")}
              </a>
            </>
          )}
        </nav>

        <span class="whoami">
          <Avatar
            name={me.name}
            color={
              room.status === "ready" ? room.value.staff.find((p) => p.id === me.id)?.color : null
            }
          />
          {me.name}
          {/* In the demo, leaving is the way out. It is entered from the sign-in screen. */}
          {demo === "on" ? (
            <button type="button" onClick={leaveDemo}>
              {t("demoLeave")}
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/session", { method: "DELETE" });
                setMe(null);
              }}
            >
              {t("signOut")}
            </button>
          )}
        </span>

        <ThemeSwitch />
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

      {route.view === "people" && (
        <section aria-labelledby="people">
          <h2 id="people" class="sr-only">
            {t("navPeople")}
          </h2>
          <Customers
            openId={route.id}
            onOpen={(id) => {
              window.location.hash = id === null ? "#/people" : `#/people/${id}`;
            }}
            onChanged={() => setPeopleRevision((n) => n + 1)}
          />
        </section>
      )}

      {demo === "failed" && (
        <p class="failed" role="alert">
          {t("demoFailed")} {demoWhy && <span class="reason">{demoWhy}</span>}
        </p>
      )}

      {route.view === "shop" && !owner && <p class="failed">{t("ownerOnly")}</p>}
      {route.view === "shop" && owner && (
        <section aria-labelledby="shop">
          <h2 id="shop" class="sr-only">
            {t("navShop")}
          </h2>
          <Shop />
        </section>
      )}

      {route.view === "money" && !owner && <p class="failed">{t("ownerOnly")}</p>}
      {route.view === "money" && owner && (
        <section aria-labelledby="money">
          <h2 id="money" class="sr-only">
            {t("navMoney")}
          </h2>
          <Money
            month={route.month ?? todayInShop().slice(0, 7)}
            onMonth={(month) => {
              window.location.hash = `#/money/${month}`;
            }}
          />
        </section>
      )}

      {route.view === "day" && (
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
              <button
                type="button"
                onClick={() => setDate(todayInShop())}
                disabled={date === todayInShop()}
              >
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
                  setStartAt(null);
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
              key={startAt ?? ""}
              date={date}
              startsAt={startAt}
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
                <ul class="holiday-note">
                  {day.value.holidays.map((h) => (
                    <li key={h.region}>
                      {/* Regions differ: mainland Golden Week runs a week past Macau's two days. */}
                      <span class={`region is-${h.region}`}>{t(`region.${h.region}`)}</span>
                      {h.name}
                    </li>
                  ))}
                </ul>
              )}

              {/* Past holidaysKnownTo, no holidays means the year is not imported. */}
              {day.value.holidaysKnownTo && date > day.value.holidaysKnownTo && (
                <p class="holiday-note is-unknown">
                  {t("holidaysUnknown", { to: day.value.holidaysKnownTo })}
                </p>
              )}

              <DaySummary day={day.value} />
              <Peak day={day.value} seats={room.value.seats} />
              <Calendar
                day={day.value}
                seats={room.value.seats}
                services={services}
                onPick={(line) => {
                  // One panel at a time.
                  setBooking(false);
                  setPicked(line);
                }}
                onEmpty={(at) => {
                  setPicked(null);
                  setStartAt(at);
                  setBooking(true);
                }}
                picked={picked?.bookingId ?? null}
              />

              {/* On an empty day, link to the dates that have bookings. */}
              {day.value.lines.length > 0 || !day.value.bookedRange?.from ? null : (
                <p class="lede">
                  {t("nothingBooked")}{" "}
                  <button
                    type="button"
                    class="link"
                    onClick={() => setDate(day.value.bookedRange!.from!)}
                  >
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
      )}

      {route.view === "day" && (
        <section aria-labelledby="room">
          <h2 id="room">{t("room")}</h2>
          {room.status === "ready" && <RoomSummary room={room.value} />}
          {room.status === "failed" && (
            <p class="failed" role="alert">
              {t("roomFailed")} <span class="reason">{room.reason}</span>
            </p>
          )}
        </section>
      )}
    </main>
  );
}

/** Counts bookings, not treatments: one visit can be shampoo, then cut. */
function DaySummary({ day }: { day: Day }) {
  const { t } = useText();
  const visits = new Map<number, { status: string; startsAt: string }>();
  for (const line of day.lines) {
    const seen = visits.get(line.bookingId);
    if (!seen || line.startsAt < seen.startsAt) {
      visits.set(line.bookingId, { status: line.status, startsAt: line.startsAt });
    }
  }
  const all = [...visits.values()];
  const booked = all.filter((v) => v.status !== "cancelled" && v.status !== "no_show").length;
  if (booked === 0) return null;

  // Who is in now and what is left only mean something for today.
  const today = day.date === todayInShop();
  const time = timeInShop();
  const inChair = all.filter((v) => v.status === "arrived").length;
  const ahead = all.filter((v) => v.status === "booked" && v.startsAt > time).length;

  return (
    <p class="day-summary">
      <span>{t("summaryBooked", { n: booked })}</span>
      {today && <span class="is-in">{t("summaryInChair", { n: inChair })}</span>}
      {today && <span>{t("summaryAhead", { n: ahead })}</span>}
    </p>
  );
}

function RoomSummary({ room }: { room: Room }) {
  const { t } = useText();
  const styling = room.seats.filter((s) => s.kind === "styling").length;
  const shampoo = room.seats.filter((s) => s.kind === "shampoo").length;

  return (
    <>
      <p class="lede">{t("roomSummary", { styling, shampoo, staff: room.staff.length })}</p>
      <ul class="staff">
        {room.staff.map((person) => (
          <li key={person.id}>
            <Avatar name={person.name} color={person.color} />
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

/**
 * Keeps --header-h on <html> equal to the header's height, so what sticks
 * below it (the calendar's seat row, the customer card) knows where to stop.
 */
function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const watch = new ResizeObserver(() => {
      root.style.setProperty("--header-h", `${el.offsetHeight}px`);
    });
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.style.removeProperty("--header-h");
    };
  }, []);
  return ref;
}
