// Stage two: the same screen, now reading from D1 instead of a file of
// constants. The shape of the room is the first thing a calendar needs, so
// it is the first thing to come off the database.

import { useEffect, useState } from "preact/hooks";

type Seat = { id: number; name: string; kind: "styling" | "shampoo" };
type Person = { id: number; name: string; role: string; color: string | null };
type Room = { seats: Seat[]; staff: Person[] };

type State =
  | { status: "loading" }
  | { status: "ready"; room: Room }
  | { status: "failed"; reason: string };

export function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    // Abandoned if the component goes away mid-request, so a late response
    // cannot write into a screen that has moved on.
    const stop = new AbortController();

    fetch("/api/room", { signal: stop.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as Room;
      })
      .then((room) => setState({ status: "ready", room }))
      .catch((error: unknown) => {
        if (stop.signal.aborted) return;
        setState({ status: "failed", reason: String(error) });
      });

    return () => stop.abort();
  }, []);

  return (
    <main>
      <header>
        <h1>chairside</h1>
        <p class="tagline">Booking and customer records for one hair salon.</p>
      </header>

      {state.status === "loading" && <p class="lede">Reading the room…</p>}

      {/* Said plainly rather than shown as an empty room. A screen that
          quietly renders nothing is read as "no bookings today". */}
      {state.status === "failed" && (
        <p class="failed" role="alert">
          The database did not answer. <span class="reason">{state.reason}</span>
        </p>
      )}

      {state.status === "ready" && <Room room={state.room} />}

      <footer>
        <p>
          Stage two. The rows above come from D1 — the same SQLite schema that
          runs on a shop PC and in the browser demo. Why it is shaped this way
          is in <code>DESIGN.md</code>.
        </p>
      </footer>
    </main>
  );
}

function Room({ room }: { room: Room }) {
  const styling = room.seats.filter((s) => s.kind === "styling");
  const shampoo = room.seats.filter((s) => s.kind === "shampoo");

  return (
    <>
      <section aria-labelledby="room">
        <h2 id="room">The room</h2>
        <p class="lede">
          {styling.length} styling chairs, {shampoo.length} shampoo stations,{" "}
          {room.staff.length} on the team. The ceilings are different for each, which
          is why they are not one kind of seat.
        </p>

        <div class="rows">
          <SeatRow
            label="Styling chairs"
            seats={styling}
            note="one more than there are stylists"
          />
          <SeatRow
            label="Shampoo stations"
            seats={shampoo}
            note="contested in the evening"
          />
        </div>
      </section>

      <section aria-labelledby="staff">
        <h2 id="staff">On the team</h2>
        <ul class="staff">
          {room.staff.map((person) => (
            <li key={person.id}>
              <span
                class="dot"
                style={{ background: person.color ?? "#888" }}
                aria-hidden="true"
              />
              {person.name}
              <span class="role">{person.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function SeatRow(props: {
  label: string;
  note: string;
  seats: readonly { id: number; name: string }[];
}) {
  return (
    <div class="row">
      <div class="row-head">
        <span class="row-label">{props.label}</span>
        <span class="row-count">{props.seats.length}</span>
        <span class="row-note">{props.note}</span>
      </div>
      <div class="seats">
        {props.seats.map((seat) => (
          <span class="seat" key={seat.id}>
            {seat.name}
          </span>
        ))}
      </div>
    </div>
  );
}
