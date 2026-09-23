// The day, as a grid: one column per seat, one row per quarter hour.
//
// Seats are the columns rather than stylists, because the seats are what runs
// out. Nine styling chairs against eight stylists is almost never the
// binding constraint; three shampoo stations against the same eight is, and
// laying the room out this way puts that on screen instead of in a document.

import type { Day, Line, Seat } from "./types.ts";
import { STEP, clock, linesFor, place, span as gridSpan, usage } from "./layout.ts";
import { useText } from "./lang-context.ts";
import { serviceName } from "./i18n.ts";
import type { Service } from "./book.tsx";

/** The column for treatments that have no seat yet. */
const UNASSIGNED = -1;

export function Calendar({
  day,
  seats,
  services,
}: {
  day: Day;
  seats: Seat[];
  services: Service[];
}) {
  const { t, lang } = useText();
  const { open, close } = gridSpan(day);

  const unusual = day.hours.closed || day.closure !== null;
  const notice = unusual ? <ClosedNotice day={day} hasBookings={day.lines.length > 0} /> : null;

  if (close <= open) {
    return <div class="cal-closed">{notice ?? <p class="lede">{t("noSchedule")}</p>}</div>;
  }

  const rows = Math.ceil((close - open) / STEP);

  const styling = seats.filter((s) => s.kind === "styling");
  const shampoo = seats.filter((s) => s.kind === "shampoo");
  const columns: { id: number; name: string; kind: string }[] = [...styling, ...shampoo];

  // A treatment booked without a station is not an error and must not vanish.
  // It gets a column of its own rather than being dropped, which is what the
  // first version did: the booking went in, the API returned it, and the
  // screen quietly had nowhere to put it.
  if (day.lines.some((line) => line.seatId === null)) {
    columns.push({ id: UNASSIGNED, name: t("unassigned"), kind: "unassigned" });
  }

  const column = new Map(columns.map((seat, index) => [seat.id, index + 2]));

  // Every whole hour gets a label. Labelling every quarter turns the left
  // edge into noise at the width this has to work at.
  const hourMarks: number[] = [];
  for (let at = Math.ceil(open / 60) * 60; at < close; at += 60) hourMarks.push(at);

  return (
    <>
      {notice}
      <div class="cal-scroll">
        <div
          class="cal"
          style={{
            gridTemplateColumns: `4rem repeat(${columns.length}, minmax(5.5rem, 1fr))`,
            gridTemplateRows: `auto repeat(${rows}, 1.3rem)`,
          }}
        >
          <div class="cal-corner" />

          {columns.map((seat) => (
            <div
              key={seat.id}
              class={`cal-head cal-head-${seat.kind}`}
              style={{ gridColumn: column.get(seat.id) }}
            >
              {seat.name}
            </div>
          ))}

          {hourMarks.map((at) => (
            <div
              key={`t${at}`}
              class="cal-time"
              style={{ gridRow: (at - open) / STEP + 2, gridColumn: 1 }}
            >
              {clock(at)}
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
            const col = column.get(line.seatId ?? UNASSIGNED);
            if (col === undefined) return null;

            const cell = place(line, open, close);
            const service = services.find((s) => s.id === line.serviceId);

            return (
              <Block
                key={line.itemId}
                line={line}
                what={service ? serviceName(lang, service) : (line.serviceJa ?? "")}
                lines={linesFor(cell.span)}
                style={{ gridColumn: col, gridRow: `${cell.row} / span ${cell.span}` }}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

function Block({
  line,
  what,
  lines,
  style,
}: {
  line: Line;
  what: string;
  lines: 1 | 2 | 3;
  style: Record<string, string | number>;
}) {
  return (
    <div
      class={`cal-block is-${line.status} rows-${lines}`}
      style={{ ...style, borderLeftColor: line.staffColor ?? "var(--ink-faint)" }}
      title={`${line.startsAt}–${line.endsAt}　${line.customerName ?? "—"}　${what}　${line.staffName ?? ""}`}
    >
      <span class="cal-who">
        {line.nominated && (
          <span class="cal-nom">
            ★
          </span>
        )}
        {line.customerName ?? "—"}
      </span>
      {lines >= 2 && <span class="cal-what">{what}</span>}
      {lines >= 3 && <span class="cal-by">{line.staffName}</span>}
    </div>
  );
}

/**
 * Why the day is not a normal one.
 *
 * Three different things, said separately. A closed Monday is a rule, a
 * closure is a decision somebody made, and a holiday is information the shop
 * may well open through. "Closed" as a catch-all leaves whoever is looking
 * unable to tell them apart.
 *
 * Said above the grid rather than instead of it. An earlier version returned
 * this in place of the calendar, so a Monday the shop opened for a wedding
 * party showed "closed" and hid the bookings.
 */
function ClosedNotice({ day, hasBookings }: { day: Day; hasBookings: boolean }) {
  const { t } = useText();

  return (
    <p class="closed-note" role="note">
      {day.hours.closed && <strong>{t("closedDay")}</strong>}
      {day.closure && (
        <strong>
          {t("closure")}
          {day.closure.reason ? `：${day.closure.reason}` : ""}
        </strong>
      )}
      {hasBookings ? t("butBooked") : t("fullStop")}
    </p>
  );
}

/** How full it gets, and when. The arithmetic is in layout.ts, under test. */
export function Peak({ day, seats }: { day: Day; seats: Seat[] }) {
  const { t } = useText();
  const counts = usage(day, seats);
  if (counts.length === 0 || day.lines.length === 0) return null;

  return (
    <ul class="peak">
      {counts.map((u) => (
        <li key={u.kind} class={u.full ? "is-full" : undefined}>
          <span class={`peak-dot peak-${u.kind}`} aria-hidden="true" />
          <span class="peak-label">{t(u.kind)}</span>
          <span class="peak-n">
            {u.peak} / {u.total}
          </span>
          <span class="peak-at">{t("busiestAt", { at: clock(u.at) })}</span>
          {u.full && <span class="peak-note">{t("full")}</span>}
        </li>
      ))}
    </ul>
  );
}
