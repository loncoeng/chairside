// Stage three: the day. The room from stage two is still here, further down,
// because the calendar only makes sense once you know what the columns are.

import { useCallback, useEffect, useState } from "preact/hooks";
import { Calendar, Peak } from "./calendar.tsx";
import { BookingForm } from "./book.tsx";
import type { Customer, Service } from "./book.tsx";
import type { Day, Room } from "./types.ts";
import { shiftDate, todayInShop, weekdayName } from "./types.ts";

type Load<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "failed"; reason: string };

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export function App() {
  const [date, setDate] = useState(todayInShop);
  const [room, setRoom] = useState<Load<Room>>({ status: "loading" });
  const [day, setDay] = useState<Load<Day>>({ status: "loading" });
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [booking, setBooking] = useState(false);
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
        <h1>chairside</h1>
        <p class="tagline">Booking and customer records for one hair salon.</p>
      </header>

      <section aria-labelledby="day">
        <div class="day-bar">
          <h2 id="day">
            {date}
            <span class="day-weekday">（{weekdayName(new Date(`${date}T00:00:00Z`).getUTCDay())}）</span>
          </h2>
          <div class="day-nav">
            <button type="button" onClick={() => go(-1)} aria-label="前の日">
              ←
            </button>
            <button type="button" onClick={() => setDate(todayInShop())} disabled={date === todayInShop()}>
              今日
            </button>
            <button type="button" onClick={() => go(1)} aria-label="次の日">
              →
            </button>
            <button
              type="button"
              class="primary"
              onClick={() => setBooking(true)}
              disabled={services.length === 0}
            >
              予約を取る
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

        {day.status === "loading" && <p class="lede">読み込み中…</p>}

        {day.status === "failed" && (
          <p class="failed" role="alert">
            この日の予約を読み込めませんでした。<span class="reason">{day.reason}</span>
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
            <Calendar day={day.value} seats={room.value.seats} />

            {/* Sample data sits on a fixed week, so a visitor arriving later
                lands on an empty day. Saying where the data is beats showing
                an empty grid and leaving them to guess. */}
            {day.value.lines.length > 0 || !day.value.bookedRange?.from ? null : (
              <p class="lede">
                この日に予約はありません。サンプルは{" "}
                <button type="button" class="link" onClick={() => setDate(day.value.bookedRange!.from!)}>
                  {day.value.bookedRange.from} 〜 {day.value.bookedRange.to}
                </button>{" "}
                に入っています。
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="room">
        <h2 id="room">The room</h2>
        {room.status === "ready" && <RoomSummary room={room.value} />}
        {room.status === "failed" && (
          <p class="failed" role="alert">
            The database did not answer. <span class="reason">{room.reason}</span>
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
  const styling = room.seats.filter((s) => s.kind === "styling").length;
  const shampoo = room.seats.filter((s) => s.kind === "shampoo").length;

  return (
    <>
      <p class="lede">
        セット面 {styling} 台、シャンプー台 {shampoo} 台、在籍 {room.staff.length} 名。
        上限になるものが種類ごとに違うので、ひとまとめの「席」にはしていません。
      </p>
      <ul class="staff">
        {room.staff.map((person) => (
          <li key={person.id}>
            <span class="dot" style={{ background: person.color ?? "#888" }} aria-hidden="true" />
            {person.name}
            <span class="role">{person.role}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
