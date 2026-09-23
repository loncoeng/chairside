// Stage one: the shell, deployed and reachable, with no database behind it
// yet. Building everything and deploying once at the end leaves nothing
// standing when a step goes wrong partway.
//
// What this screen shows is the shape of the room — the seats and their
// kinds — because that is what the schema is built around and the first
// thing worth seeing on a calendar.

import { SEATS, STAFF } from "./fixtures.ts";

export function App() {
  const styling = SEATS.filter((s) => s.kind === "styling");
  const shampoo = SEATS.filter((s) => s.kind === "shampoo");

  return (
    <main>
      <header>
        <h1>chairside</h1>
        <p class="tagline">Booking and customer records for one hair salon.</p>
      </header>

      <section aria-labelledby="room">
        <h2 id="room">The room</h2>
        <p class="lede">
          Nine styling chairs, three shampoo stations, {STAFF.length} stylists. The
          ceilings are different for each, which is why they are not one kind of seat.
        </p>

        <div class="rows">
          <SeatRow label="Styling chairs" seats={styling} note="one more than there are stylists" />
          <SeatRow label="Shampoo stations" seats={shampoo} note="contested in the evening" />
        </div>
      </section>

      <section aria-labelledby="staff">
        <h2 id="staff">On the team</h2>
        <ul class="staff">
          {STAFF.map((person) => (
            <li key={person.id}>
              <span class="dot" style={{ background: person.color }} aria-hidden="true" />
              {person.name}
              <span class="role">{person.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer>
        <p>
          Stage one. No database yet — everything above is invented sample data.
          The schema, and why it is shaped this way, is in <code>DESIGN.md</code>.
        </p>
      </footer>
    </main>
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
