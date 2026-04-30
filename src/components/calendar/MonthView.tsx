import { format, isSameMonth, isToday, monthGridDays, toISODate } from "../../lib/dates";
import EventChip, { type EventKind } from "./EventChip";
import type { Reservation, Request } from "../../lib/data";

interface Props {
  cursor: Date;
  reservations: Reservation[];
  requests: Request[];
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Default monthly grid: 7 columns × 6 rows (always — keeps row heights stable
 * across months). Days outside the cursor month render in muted sand tone so
 * the eye stays inside the current month at a glance.
 */
export default function MonthView({ cursor, reservations, requests }: Props) {
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

          // Match each day against existing reservations + requests.
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
                "rounded-xl border bg-white px-2 pt-1 pb-1 overflow-hidden transition",
                inMonth ? "border-deep/10" : "bg-sand-light text-muted border-sand-deep/30",
                today   ? "ring-2 ring-aqua border-aqua" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className={[
                  "text-[13px] font-bold",
                  inMonth ? "text-deep" : "text-driftwood/60",
                ].join(" ")}>
                  {format(day, "d")}
                </span>
                {today && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-aqua text-white rounded px-1.5 py-px">
                    Today
                  </span>
                )}
              </div>

              {dayReservations.map((r) => (
                <EventChip
                  key={`r-${r.id}`}
                  day={day}
                  startISO={r.startDate!}
                  endISO={r.endDate!}
                  label={r.partyName ?? "Reserved"}
                  kind="approved"
                />
              ))}
              {dayRequests.map((r) => (
                <EventChip
                  key={`q-${r.id}`}
                  day={day}
                  startISO={r.startDate!}
                  endISO={r.endDate!}
                  label={`${r.partyName ?? "Request"} · pending`}
                  kind={"pending" as EventKind}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
