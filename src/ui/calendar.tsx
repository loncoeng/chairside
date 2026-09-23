// The day, as a grid: one column per seat, one row per quarter hour.
//
// Seats are the columns rather than stylists, because the seats are what runs
// out. Nine styling chairs against eight stylists is almost never the
// binding constraint; three shampoo stations against the same eight is, and
// laying the room out this way puts that on screen instead of in a document.

import type { Day, Line, Seat } from "./types.ts";
import { minutesOf } from "./types.ts";
import { STEP, clock, place, usage } from "./layout.ts";

export function Calendar({ day, seats }: { day: Day; seats: Seat[] }) {
  const { opensAt, closesAt } = day.hours;
  if (day.hours.closed || !opensAt || !closesAt) {
    return <Closed day={day} />;
  }

  const open = minutesOf(opensAt);
  const close = minutesOf(closesAt);
  const rows = Math.ceil((close - open) / STEP);

  const styling = seats.filter((s) => s.kind === "styling");
  const shampoo = seats.filter((s) => s.kind === "shampoo");
  const columns = [...styling, ...shampoo];
  const column = new Map(columns.map((seat, index) => [seat.id, index + 2]));

  // Every whole hour gets a label. Labelling every quarter turns the left
  // edge into noise at the width this has to work at.
  const hourMarks: number[] = [];
  for (let at = Math.ceil(open / 60) * 60; at < close; at += 60) hourMarks.push(at);

  return (
    <div class="cal-scroll">
      <div
        class="cal"
        style={{
          gridTemplateColumns: `4rem repeat(${columns.length}, minmax(5.5rem, 1fr))`,
          gridTemplateRows: `auto repeat(${rows}, 1.15rem)`,
        }}
      >
        <div class="cal-corner" />

        {columns.map((seat) => (
          <div key={seat.id} class={`cal-head cal-head-${seat.kind}`} style={{ gridColumn: column.get(seat.id) }}>
            {seat.name}
          </div>
        ))}

        {hourMarks.map((at) => (
          <div
            key={`t${at}`}
            class="cal-time"
            style={{ gridRow: (at - open) / STEP + 2, gridColumn: 1 }}
          >
            {String(Math.floor(at / 60)).padStart(2, "0")}:00
          </div>
        ))}

        {/* One line across the whole row. Without it the eye cannot follow a
            time across twelve columns. Kept as its own pass rather than a
            fragment per hour, which would need a key on the fragment. */}
        {hourMarks.map((at) => (
          <div
            key={`r${at}`}
            class="cal-rule"
            style={{ gridRow: (at - open) / STEP + 2, gridColumn: `2 / span ${columns.length}` }}
            aria-hidden="true"
          />
        ))}

        {day.lines.map((line) => {
          const col = line.seatId === null ? undefined : column.get(line.seatId);
          if (col === undefined) return null;

          const { row, span } = place(line, open, close);

          return (
            <Block
              key={line.itemId}
              line={line}
              style={{ gridColumn: col, gridRow: `${row} / span ${span}` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Block({ line, style }: { line: Line; style: Record<string, string | number> }) {
  const short = minutesOf(line.endsAt) - minutesOf(line.startsAt) <= 20;

  return (
    <div
      class={`cal-block is-${line.status}${short ? " is-short" : ""}`}
      style={{ ...style, borderLeftColor: line.staffColor ?? "var(--ink-faint)" }}
      title={`${line.startsAt}–${line.endsAt}　${line.customerName ?? "—"}　${line.serviceJa ?? ""}　${line.staffName ?? ""}`}
    >
      <span class="cal-who">
        {line.nominated && <span class="cal-nom" title="指名">★</span>}
        {line.customerName ?? "—"}
      </span>
      {!short && <span class="cal-what">{line.serviceJa}</span>}
      <span class="cal-by">{line.staffName}</span>
    </div>
  );
}

/**
 * A day with no grid on it.
 *
 * Three different reasons, said separately. "Closed" as a catch-all leaves
 * whoever is looking unable to tell a regular day off from a decision
 * somebody made.
 */
function Closed({ day }: { day: Day }) {
  return (
    <div class="cal-closed">
      {day.hours.closed && <p class="cal-closed-why">定休日</p>}
      {day.closure && <p class="cal-closed-why">臨時休業{day.closure.reason ? `：${day.closure.reason}` : ""}</p>}
      <p class="lede">この日は予約を受け付けていません。</p>
    </div>
  );
}

/**
 * How full it gets, and when. The arithmetic is in layout.ts, under test.
 */
export function Peak({ day, seats }: { day: Day; seats: Seat[] }) {
  const counts = usage(day, seats);
  if (counts.length === 0 || day.lines.length === 0) return null;

  return (
    <ul class="peak">
      {counts.map((u) => (
        <li key={u.kind} class={u.full ? "is-full" : undefined}>
          <span class={`peak-dot peak-${u.kind}`} aria-hidden="true" />
          <span class="peak-label">{u.kind === "styling" ? "セット面" : "シャンプー台"}</span>
          <span class="peak-n">
            {u.peak} / {u.total}
          </span>
          <span class="peak-at">{clock(u.at)} が最も混む</span>
          {u.full && <span class="peak-note">満席</span>}
        </li>
      ))}
    </ul>
  );
}
