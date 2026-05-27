import { format, isToday, toISODate, weekDays } from "../../lib/dates";
import type { Reservation, Request } from "../../lib/data";
import Avatar from "../Avatar";
import { initialsFromName } from "../../lib/profile";

interface Props {
  cursor: Date;
  reservations: Reservation[];
  requests: Request[];
  onReservationClick?: (r: Reservation) => void;
  onOpenDayClick?: (day: Date) => void;
}

/**
 * Weekly view — 7 wide day cards. Reserved days are fully filled with the
 * approved-teal color and show the party emoji + name; pending requests
 * use sunset amber.
 */
export default function WeekView({
  cursor, reservations, requests, onReservationClick, onOpenDayClick,
}: Props) {
  const days = weekDays(cursor);

  return (
    <div className="px-5 pt-3 pb-5">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayISO = toISODate(day);
          const today  = isToday(day);

          const reservation = reservations.find(
            (r) => r.startDate && r.endDate &&
                   dayISO >= r.startDate && dayISO <= r.endDate
          );
          const pending = !reservation && requests.find(
            (r) => r.status === "Pending" && r.startDate && r.endDate &&
                   dayISO >= r.startDate && dayISO <= r.endDate
          );

          let bg = "bg-white border-deep/10";
          let dowColor = "text-muted";
          let numColor = "text-deep";
          if (reservation) {
            bg = "bg-approved border-approved";
            dowColor = "text-white/80";
            numColor = "text-white";
          } else if (pending) {
            bg = "bg-sunset-amber border-sunset-amber";
            dowColor = "text-driftwood/70";
            numColor = "text-driftwood";
          }

          const clickableForReservation = !!reservation && !!onReservationClick;
          const clickableForOpenDay     = !reservation && !pending && !!onOpenDayClick;
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
                "rounded-2xl border p-3 min-h-[260px] flex flex-col transition text-left w-full",
                bg,
                today ? "ring-2 ring-aqua ring-offset-1 ring-offset-white" : "",
                clickableForReservation
                  ? "cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
                  : clickableForOpenDay
                  ? "cursor-pointer hover:bg-foam hover:border-aqua focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
                  : "",
              ].join(" ")}
            >
              <div className={`text-center pb-2 mb-2 border-b ${reservation || pending ? "border-white/20" : "border-deep/5"}`}>
                <div className={`text-[11px] font-bold tracking-widest uppercase ${dowColor}`}>
                  {format(day, "EEE")}
                </div>
                <div className={`font-display text-2xl leading-tight ${numColor}`}>
                  {format(day, "d")}
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center text-center">
                {reservation ? (
                  <CellLabel
                    name={reservation.partyName ?? "Reserved"}
                    emoji={reservation.partyEmoji ?? ""}
                    tone="approved"
                  />
                ) : pending ? (
                  <CellLabel
                    name={pending.partyName ?? "Pending"}
                    emoji={pending.requesterEmoji ?? ""}
                    tone="pending"
                  />
                ) : (
                  <span className="text-xs text-muted/70 italic">Open</span>
                )}
              </div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

function CellLabel({
  name, emoji, tone,
}: { name: string; emoji: string; tone: "approved" | "pending" }) {
  const text = tone === "approved" ? "text-white" : "text-driftwood";
  const initials = initialsFromName(name);
  return (
    <div className={`flex flex-col items-center gap-1 ${text}`}>
      <Avatar
          picture={emoji}
          fallbackInitials={initials}
          size={48}
          className="border border-white/30"
        />
      <span className="text-sm font-bold text-center px-1" title={name}>
        {name}
      </span>
      {tone === "pending" && (
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Pending</span>
      )}
    </div>
  );
}
