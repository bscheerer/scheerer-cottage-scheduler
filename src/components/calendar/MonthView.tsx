import { format, isSameMonth, isToday, monthGridDays, toISODate } from "../../lib/dates";
import type { Reservation, Request } from "../../lib/data";

interface Props {
  cursor: Date;
  reservations: Reservation[];
  requests: Request[];
  /** Fires when any reserved cell is clicked. Calendar opens the details modal. */
  onReservationClick?: (r: Reservation) => void;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Default monthly grid: 7 columns × 6 rows. Reserved days fully fill their
 * cell with the approved-teal color and show the party name + their emoji
 * (snapshotted at request time, set in profile Settings). Pending requests
 * fill in warm sunset amber. Multi-day stays render the name + emoji on the
 * start day only and just-color the rest of the span — quick to scan.
 */
export default function MonthView({ cursor, reservations, requests, onReservationClick }: Props) {
  const days = monthGridDays(cursor);

  return (
    <div className="px-5 pt-4 pb-5">
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {DOW.map((d) => (
          <div
            key={d}
            className="text-center text-[11px] tracking-widest uppercase font-bold text-muted py-1.5"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 auto-rows-[110px]">
        {days.map((day) => {
          const inMonth = isSameMonth(day, cursor);
          const today   = isToday(day);
          const dayISO  = toISODate(day);

          // Approved reservation overlapping this day, if any.
          const reservation = reservations.find(
            (r) => r.startDate && r.endDate &&
                   dayISO >= r.startDate && dayISO <= r.endDate
          );
          // Pending request overlapping this day, if any (and only when no
          // reservation occupies the cell).
          const pending = !reservation && requests.find(
            (r) => r.status === "Pending" && r.startDate && r.endDate &&
                   dayISO >= r.startDate && dayISO <= r.endDate
          );

          // The "start day" of the span is where we render the label.
          const reservationIsStart = reservation && dayISO === reservation.startDate;
          const pendingIsStart     = pending     && dayISO === pending.startDate;

          // Cell background + text colors per state.
          let cellBg = "bg-white border-deep/10";
          let dayNumColor = inMonth ? "text-deep" : "text-driftwood/60";
          if (reservation) {
            cellBg = "bg-approved border-approved";
            dayNumColor = "text-white/80";
          } else if (pending) {
            cellBg = "bg-sunset-amber border-sunset-amber";
            dayNumColor = "text-driftwood/80";
          } else if (!inMonth) {
            cellBg = "bg-sand-light text-muted border-sand-deep/30";
          }

          const clickable = !!reservation && !!onReservationClick;
          const Tag = clickable ? "button" : "div";
          const interactiveProps = clickable
            ? {
                type: "button" as const,
                onClick: () => onReservationClick(reservation!),
                "aria-label": `Open ${reservation!.partyName} reservation details`,
              }
            : {};

          return (
            <Tag
              key={day.toISOString()}
              {...interactiveProps}
              className={[
                "rounded-xl border px-2 pt-1 pb-1 overflow-hidden flex flex-col transition text-left w-full",
                cellBg,
                today ? "ring-2 ring-aqua ring-offset-1 ring-offset-white" : "",
                clickable ? "cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua" : "",
              ].join(" ")}
            >
              {/* Top row: day number + today pill */}
              <div className="flex items-center justify-between">
                <span className={`text-[13px] font-bold ${dayNumColor}`}>
                  {format(day, "d")}
                </span>
                {today && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-aqua text-white rounded px-1.5 py-px">
                    Today
                  </span>
                )}
              </div>

              {/* Body: party label only on the start day of a span */}
              <div className="flex-1 flex items-center justify-center text-center px-1">
                {reservationIsStart && (
                  <ReservationLabel
                    name={reservation.partyName ?? "Reserved"}
                    emoji={reservation.partyEmoji ?? ""}
                    tone="approved"
                  />
                )}
                {pendingIsStart && (
                  <ReservationLabel
                    name={pending.partyName ?? "Pending"}
                    emoji={pending.requesterEmoji ?? ""}
                    tone="pending"
                  />
                )}
              </div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

function ReservationLabel({
  name, emoji, tone,
}: { name: string; emoji: string; tone: "approved" | "pending" }) {
  const text = tone === "approved" ? "text-white" : "text-driftwood";
  return (
    <div className={`flex flex-col items-center gap-0.5 leading-tight ${text}`}>
      {emoji && <span className="text-2xl leading-none" aria-hidden>{emoji}</span>}
      <span className="text-[11px] font-bold truncate max-w-[100px]" title={name}>
        {name}
      </span>
      {tone === "pending" && (
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">Pending</span>
      )}
    </div>
  );
}
