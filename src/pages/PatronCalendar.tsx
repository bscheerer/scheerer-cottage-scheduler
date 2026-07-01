import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMonths, format, isSameMonth, isToday, monthGridDays, toISODate,
} from "../lib/dates";
import { useReservations } from "../lib/data";
import { useBookableSlots, type BookableSlot } from "../lib/bookings";
import { useIdentity } from "../lib/identity";

type DayStatus =
  | { kind: "muted";    day: Date }
  | { kind: "open";     day: Date }
  | { kind: "blocked";  day: Date }
  | { kind: "bookable"; day: Date; slot: BookableSlot; isFirst: boolean };

/**
 * Read-only calendar shown to Patrons. Three anonymized states per day:
 *   - Bookable (coral) -> click to run Stripe checkout
 *   - Reserved (gray)  -> family has it; no names or details shown
 *   - Open (white)     -> nothing scheduled; not for sale
 *
 * Sidebar shows the Patron's own bookings (empty for now until Phase C.2
 * webhook ships) and a note about role upgrades.
 */
export default function PatronCalendar() {
  const { label } = useIdentity();
  const { items: reservations, loading: lr } = useReservations();
  const { items: slots,        loading: ls } = useBookableSlots();
  const navigate = useNavigate();

  const [cursor, setCursor] = useState(() => new Date());
  const loading = lr || ls;

  const days = monthGridDays(cursor);

  const dayStatuses: DayStatus[] = useMemo(() => {
    return days.map((day): DayStatus => {
      const dayISO = toISODate(day);
      if (!isSameMonth(day, cursor)) return { kind: "muted", day };

      const slot = slots.find((s) =>
        s.status === "Open" &&
        s.startDate && s.endDate &&
        dayISO >= s.startDate && dayISO <= s.endDate
      );
      if (slot) {
        return { kind: "bookable", day, slot, isFirst: dayISO === slot.startDate };
      }

      const hasReservation = reservations.some((r) =>
        r.startDate && r.endDate &&
        dayISO >= r.startDate && dayISO <= r.endDate
      );
      if (hasReservation) return { kind: "blocked", day };

      return { kind: "open", day };
    });
  }, [days, cursor, slots, reservations]);

  const firstName = (label || "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
      <aside className="bg-white rounded-2xl shadow-soft border border-deep/10 p-4 self-start">
        <div className="bg-foam border-l-4 border-aqua rounded-r-lg p-3 mb-3">
          <p className="text-sm font-semibold text-deep">Welcome, {firstName} 🌊</p>
          <p className="text-xs text-muted mt-0.5">Signed in as Patron</p>
        </div>
        <p className="font-display text-sm text-deep mb-2">My bookings</p>
        <p className="text-xs text-muted italic mb-4">No bookings yet.</p>
        <p className="font-display text-sm text-deep mb-2">Need more access?</p>
        <p className="text-xs text-muted leading-relaxed">
          Family members see full names and can request dates for free. Ask an admin to upgrade your role.
        </p>
      </aside>

      <section className="bg-white rounded-2xl shadow-soft border border-deep/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-deep/10 flex items-center justify-between bg-gradient-to-b from-white to-foam flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor((c) => addMonths(c, -1))}
              aria-label="Previous month"
              className="w-9 h-9 inline-flex items-center justify-center bg-white border border-deep/15 rounded-lg text-mid hover:bg-foam transition text-lg leading-none"
            >‹</button>
            <button
              onClick={() => setCursor((c) => addMonths(c, 1))}
              aria-label="Next month"
              className="w-9 h-9 inline-flex items-center justify-center bg-white border border-deep/15 rounded-lg text-mid hover:bg-foam transition text-lg leading-none"
            >›</button>
            <h2 className="font-display text-xl text-deep mx-1">{format(cursor, "MMMM yyyy")}</h2>
            <button
              onClick={() => setCursor(new Date())}
              className="ml-1 text-xs font-semibold border border-deep/15 rounded-lg px-3 py-1.5 text-mid hover:bg-foam transition"
            >
              Today
            </button>
          </div>
          <p className="text-xs text-muted">
            Click a coral day to book. Gray days are family-reserved.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted">
            <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-2" />
            <div className="text-sm">Loading calendar…</div>
          </div>
        ) : (
          <div className="px-5 pt-4 pb-5">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d} className="text-center text-[11px] tracking-widest uppercase font-bold text-muted py-1.5">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 auto-rows-[100px]">
              {dayStatuses.map((s, i) => (
                <DayCell
                  key={i}
                  status={s}
                  isTodayCell={isToday(s.day)}
                  onBook={(slot) => navigate(`/book/start?slotId=${slot.id}`)}
                />
              ))}
            </div>

            <div className="flex gap-5 flex-wrap mt-5 text-xs text-ink">
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block w-4 h-4 rounded-md"
                  style={{ background: "linear-gradient(135deg, #F7B267, #E76F51)" }}
                />
                Bookable (click to reserve)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-4 h-4 rounded-md bg-[#C7CFD5]" />
                Reserved
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-4 h-4 rounded-md bg-white border border-deep/15" />
                Open (family only)
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DayCell({
  status, isTodayCell, onBook,
}: {
  status: DayStatus;
  isTodayCell: boolean;
  onBook: (slot: BookableSlot) => void;
}) {
  if (status.kind === "muted") {
    return (
      <div className="rounded-xl bg-sand-light text-driftwood/50 px-2 pt-1 pb-1 flex flex-col">
        <span className="text-[13px] font-bold">{format(status.day, "d")}</span>
      </div>
    );
  }
  if (status.kind === "blocked") {
    return (
      <div className="rounded-xl bg-[#C7CFD5] text-[#4B5A63] px-2 pt-1 pb-1 flex flex-col justify-between">
        <span className="text-[13px] font-bold">{format(status.day, "d")}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-75 text-center">Reserved</span>
      </div>
    );
  }
  if (status.kind === "bookable") {
    const price = ((status.slot.priceCents ?? 0) / 100).toLocaleString("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 0,
    });
    return (
      <button
        type="button"
        onClick={() => onBook(status.slot)}
        title={status.slot.title ?? ""}
        aria-label={`Book ${status.slot.title} for ${price}`}
        className={[
          "rounded-xl px-2 pt-1 pb-1 flex flex-col justify-between text-white text-left w-full",
          "hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua transition",
          isTodayCell ? "ring-2 ring-aqua ring-offset-1 ring-offset-white" : "",
        ].join(" ")}
        style={{ background: "linear-gradient(135deg, #F7B267, #E76F51)" }}
      >
        <span className="text-[13px] font-bold">{format(status.day, "d")}</span>
        {status.isFirst && (
          <span className="text-center">
            <span className="block text-[12px] font-bold">{price}</span>
            <span className="block text-[9px] uppercase tracking-wider opacity-90">Book now</span>
          </span>
        )}
      </button>
    );
  }
  return (
    <div
      className={[
        "rounded-xl bg-white border border-deep/10 text-deep px-2 pt-1 pb-1 flex flex-col",
        isTodayCell ? "ring-2 ring-aqua ring-offset-1 ring-offset-white" : "",
      ].join(" ")}
    >
      <span className="text-[13px] font-bold">{format(status.day, "d")}</span>
    </div>
  );
}
