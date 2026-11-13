// Day view: one column per seat, one row per quarter hour.
// Columns are seats, not stylists, because seats (especially shampoo stations) run out first.

import type { Day, Line, Seat } from "./types.ts";
import { HEADER_ROWS, STEP, clock, linesFor, place, span as gridSpan, usage } from "./layout.ts";
import { useText } from "./lang-context.ts";
import { serviceName } from "./i18n.ts";
import type { Service } from "./book.tsx";

/** Column id for treatments with no seat. */
const UNASSIGNED = -1;

export function Calendar({
  day,
  seats,
  services,
  onPick,
  picked,
}: {
  day: Day;
  seats: Seat[];
  services: Service[];
  onPick: (line: Line) => void;
  picked: number | null;
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

  // Treatments without a seat are valid and get their own column instead of being dropped.
  if (day.lines.some((line) => line.seatId === null)) {
    columns.push({ id: UNASSIGNED, name: t("unassigned"), kind: "unassigned" });
  }

  const column = new Map(columns.map((seat, index) => [seat.id, index + 2]));

  // Runs of the same seat kind, for the group header row.
  const groups: { kind: string; label: string; from: number; count: number }[] = [];
  for (const seat of columns) {
    const last = groups[groups.length - 1];
    if (last && last.kind === seat.kind) {
      last.count++;
      continue;
    }
    groups.push({
      kind: seat.kind,
      label: seat.kind === "unassigned" ? t("unassigned") : t(seat.kind as "styling"),
      from: column.get(seat.id)!,
      count: 1,
    });
  }

  // Label whole hours only.
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
            gridTemplateRows: `auto auto repeat(${rows}, 1.45rem)`,
          }}
        >
          <div class="cal-corner" style={{ gridRow: `1 / span ${HEADER_ROWS}` }} />

          {/* Seat kind header. Seat names have no standard, so the kind is spelled out. */}
          {groups.map((group) => (
            <div
              key={group.kind}
              class={`cal-group cal-head-${group.kind}`}
              style={{ gridRow: 1, gridColumn: `${group.from} / span ${group.count}` }}
            >
              {group.label}
            </div>
          ))}

          {columns.map((seat) => (
            <div
              key={seat.id}
              class={`cal-head cal-head-${seat.kind}`}
              style={{ gridRow: 2, gridColumn: column.get(seat.id) }}
            >
              {seat.name}
            </div>
          ))}

          {hourMarks.map((at) => (
            <div
              key={`t${at}`}
              class="cal-time"
              style={{ gridRow: (at - open) / STEP + HEADER_ROWS + 1, gridColumn: 1 }}
            >
              {clock(at)}
            </div>
          ))}

          {/* Hour rules across all columns. A separate pass avoids keyed fragments. */}
          {hourMarks.map((at) => (
            <div
              key={`r${at}`}
              class="cal-rule"
              style={{
                gridRow: (at - open) / STEP + HEADER_ROWS + 1,
                gridColumn: `2 / span ${columns.length}`,
              }}
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
                noGuest={t("noGuest")}
                nominatedLabel={t("nominated")}
                onPick={onPick}
                picked={picked === line.bookingId}
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
  noGuest,
  nominatedLabel,
  onPick,
  picked,
  style,
}: {
  line: Line;
  what: string;
  lines: 1 | 2 | 3;
  /** Label for a booking with no customer. */
  noGuest: string;
  /** Accessible label for the nomination star. */
  nominatedLabel: string;
  onPick: (line: Line) => void;
  picked: boolean;
  style: Record<string, string | number>;
}) {
  // A button so the grid is keyboard accessible.
  return (
    <button
      type="button"
      class={`cal-block is-${line.status} rows-${lines}${picked ? " is-picked" : ""}`}
      style={{ ...style, borderLeftColor: line.staffColor ?? "var(--ink-faint)" }}
      onClick={() => onPick(line)}
      title={`${line.startsAt}–${line.endsAt}　${line.customerName ?? noGuest}　${what}　${line.staffName ?? ""}`}
    >
      <span class="cal-who">
        {line.nominated && (
          <span class="cal-nom" role="img" aria-label={nominatedLabel} title={nominatedLabel}>
            ★
          </span>
        )}
        {line.customerName ?? <span class="cal-anon">{noGuest}</span>}
      </span>
      {lines >= 2 && <span class="cal-what">{what}</span>}
      {lines >= 3 && <span class="cal-by">{line.staffName}</span>}
    </button>
  );
}

/**
 * Notice for a regular closed day and/or a one-off closure, shown above the
 * grid (not instead of it) so bookings on that day stay visible. Labels and
 * the sentence are separate strings; concatenating fragments breaks in Japanese.
 */
function ClosedNotice({ day, hasBookings }: { day: Day; hasBookings: boolean }) {
  const { t } = useText();

  return (
    <p class="closed-note" role="note">
      {day.hours.closed && <strong>{t("closedDay")}</strong>}
      {day.closure && (
        <strong>
          {t("closure")}
          {day.closure.reason ? `（${day.closure.reason}）` : ""}
        </strong>
      )}
      {hasBookings && <span>{t("bookedAnyway")}</span>}
    </p>
  );
}

/** Peak seat usage. The arithmetic is in layout.ts. */
export function Peak({ day, seats }: { day: Day; seats: Seat[] }) {
  const { t } = useText();
  const counts = usage(day, seats);
  if (counts.length === 0 || day.lines.length === 0) return null;

  return (
    <ul class="peak">
      {/* Legend for the star (phones have no hover title). */}
      <li class="peak-key">
        <span class="cal-nom">★</span>
        {t("nominated")}
      </li>

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
