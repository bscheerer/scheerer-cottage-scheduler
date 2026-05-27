import { format, isSameMonth, isToday, monthGridDays, toISODate } from "../../lib/dates";
import type { Reservation, Request } from "../../lib/data";
import Avatar from "../Avatar";
import { initialsFromName } from "../../lib/profile";

interface Props {
  cursor: Date;
  reservations: Reservation[];
  requests: Request[];
  /** Fires when any reserved cell is clicked. Calendar opens the details modal. */
  onReservationClick?: (r: Reservation) => void;
  /** Fires when an unreserved in-month day is clicked. Calendar opens RequestModal pre-filled with that date. */
  onOpenDayClick?: (day: Date) => void;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Default monthly grid: 7 columns × 6 rows. Reserved days fully fill their
 * cell with the approved-teal color and show the party name + their emoji
 * (snapshotted at request time, set in profile Settings). Pending requests
 * fill in warm sunset amber. Multi-day stays render the name + emoji on the
 * start day only and just-color the rest of the span — quick to scan.
 */
export default function MonthView({
  cursor, reservations, requests, onReservationClick, onOpenDayClick,
}: Props) {
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

          // What kind of click should this cell respond to?
          const clickableForReservation = !!reservation && !!onReservationClick;
          const clickableForOpenDay     = !reservation && !pending && inMonth && !!onOpenDayClick;
          const clickable = clickableForReservation || clickableForOpenDay;
          const Tag = clickable ? "button" : "div";

          const interactiveProps = clickableForReservation
            ? {
                type: "button" as const,
                onClick: () => onReservationClick!(reservation!),
                "aria-label": `Open ${reservation!.partyName} reservation details`,
              }
            : clickableForOpenDay
            ? {
                type: "button" as const,
                onClick: () => onOpenDayClick!(day),
                "aria-label": `Request the cottage starting ${format(day, "EEE, MMM d")}`,
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
                clickableForReservation
                  ? "cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
                  : clickableForOpenDay
                  ? "cursor-pointer hover:bg-foam hover:border-aqua focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
                  : "",
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

              {/* Body: party label on every day of a span so multi-day stays
                  are identifiable at a glance without clicking. */}
              <div className="flex-1 flex items-center justify-center text-center px-1">
                {reservation && (
                  <ReservationLabel
                    name={reservation.partyName ?? "Reserved"}
                    emoji={reservation.partyEmoji ?? ""}
                    tone="approved"
                    note={reservation.notes ?? undefined}
                  />
                )}
                {pending && (
                  <ReservationLabel
                    name={pending.partyName ?? "Pending"}
                    emoji={pending.requesterEmoji ?? ""}
                    tone="pending"
                    note={pending.note ?? undefined}
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
  name, emoji, tone, note,
}: { name: string; emoji: string; tone: "approved" | "pending"; note?: string }) {
  const text = tone === "approved" ? "text-white" : "text-driftwood";
  // Hover/long-press tooltip surfaces the description without needing a click.
  const tooltip = note ? `${name}\n${note}` : name;
  const initials = initialsFromName(name);
  return (
    <div
      className={`flex flex-col items-center gap-0.5 leading-tight ${text}`}
      title={tooltip}
    >
      <Avatar
          picture={emoji}
          fallbackInitials={initials}
          size={28}
          className="border border-white/30"
        />
      <span className="text-[11px] font-bold truncate max-w-[100px]">{name}</span>
      {tone === "pending" && (
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">Pending</span>
      )}
    </div>
  );
}
