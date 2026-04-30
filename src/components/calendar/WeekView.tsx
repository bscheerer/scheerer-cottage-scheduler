import { format, isToday, toISODate, weekDays } from "../../lib/dates";
import type { Reservation, Request } from "../../lib/data";

interface Props {
  cursor: Date;
  reservations: Reservation[];
  requests: Request[];
}

/**
 * Compact weekly view — 7 columns, one tall column per day. Reservations
 * render as full-day blocks; pending requests show stacked beneath. We
 * deliberately don't render hour rows in v0.2 because the cottage is booked
 * by the day, not the hour.
 */
export default function WeekView({ cursor, reservations, requests }: Props) {
  const days = weekDays(cursor);

  return (
    <div className="px-5 pt-3 pb-5">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayISO = toISODate(day);
          const today  = isToday(day);

          const dayReservations = reservations.filter(
            (r) => r.startDate && r.endDate &&
                   dayISO >= r.startDate && dayISO <= r.endDate
          );
          const dayRequests = requests.filter(
            (r) => r.status === "Pending" && r.startDate && r.endDate &&
                   dayISO >= r.startDate && dayISO <= r.endDate
          );

          return (
            <div
              key={day.toISOString()}
              className={[
                "rounded-2xl border bg-white p-3 min-h-[260px] transition",
                today ? "ring-2 ring-aqua border-aqua" : "border-deep/10",
              ].join(" ")}
            >
              <div className="text-center pb-2 mb-2 border-b border-deep/5">
                <div className="text-[11px] font-bold tracking-widest uppercase text-muted">
                  {format(day, "EEE")}
                </div>
                <div className="font-display text-2xl text-deep leading-tight">
                  {format(day, "d")}
                </div>
              </div>

              <div className="space-y-2">
                {dayReservations.length === 0 && dayRequests.length === 0 && (
                  <div className="text-center text-xs text-muted/70 italic pt-6">
                    Open
                  </div>
                )}
                {dayReservations.map((r) => (
                  <div
                    key={`r-${r.id}`}
                    className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold bg-approved text-white shadow-soft"
                    title={`${r.partyName ?? "Reserved"} · ${r.startDate} → ${r.endDate}`}
                  >
                    {r.partyName ?? "Reserved"}
                  </div>
                ))}
                {dayRequests.map((r) => (
                  <div
                    key={`q-${r.id}`}
                    className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold bg-sunset-amber text-driftwood shadow-soft"
                    title={`${r.partyName ?? "Request"} · pending`}
                  >
                    {r.partyName ?? "Request"} · pending
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
