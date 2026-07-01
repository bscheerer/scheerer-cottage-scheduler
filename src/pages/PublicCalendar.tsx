import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addMonths, format, isSameMonth, isToday, monthGridDays, parseISO, toISODate,
} from "../lib/dates";
import { client } from "../lib/client";
import type { Schema } from "../../amplify/data/resource";

type Reservation  = Schema["Reservation"]["type"];
type BookableSlot = Schema["BookableSlot"]["type"];

type DayStatus =
  | { kind: "muted";    day: Date }
  | { kind: "open";     day: Date }
  | { kind: "blocked";  day: Date }
  | { kind: "bookable"; day: Date; slot: BookableSlot; isFirst: boolean };

/**
 * Public, unauthenticated calendar. Same 3-state grid the signed-in Patron
 * sees, without the personalized sidebar. Both queries use apiKey auth so
 * anonymous visitors can render the whole month. Clicking a bookable day
 * routes to /book/start, which is inside the Authenticator — that triggers
 * sign-up before the Stripe flow runs.
 */
export default function PublicCalendar() {
  const [cursor, setCursor]                 = useState(() => new Date());
  const [reservations, setReservations]     = useState<Reservation[]>([]);
  const [slots, setSlots]                   = useState<BookableSlot[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rRes, sRes] = await Promise.all([
          client.models.Reservation.list({ authMode: "apiKey" }),
          client.models.BookableSlot.list({ authMode: "apiKey" }),
        ]);
        if (cancelled) return;
        setReservations((rRes.data ?? []) as Reservation[]);
        setSlots((sRes.data ?? []) as BookableSlot[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load calendar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const days = monthGridDays(cursor);

  const openSlots = useMemo(() => {
    return slots
      .filter((s) => s?.status === "Open")
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  }, [slots]);

  const dayStatuses: DayStatus[] = useMemo(() => {
    return days.map((day): DayStatus => {
      const dayISO = toISODate(day);
      if (!isSameMonth(day, cursor)) return { kind: "muted", day };

      const slot = slots.find((s) =>
        s?.status === "Open" &&
        s.startDate && s.endDate &&
        dayISO >= s.startDate && dayISO <= s.endDate
      );
      if (slot) {
        return { kind: "bookable", day, slot, isFirst: dayISO === slot.startDate };
      }

      const hasReservation = reservations.some((r) =>
        r?.startDate && r?.endDate &&
        dayISO >= r.startDate && dayISO <= r.endDate
      );
      if (hasReservation) return { kind: "blocked", day };

      return { kind: "open", day };
    });
  }, [days, cursor, slots, reservations]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAF3E3" }}>
      <PublicHeader />
      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
          <aside className="bg-white rounded-2xl shadow-soft border border-deep/10 p-4 self-start">
            <div className="bg-foam border-l-4 border-aqua rounded-r-lg p-3 mb-3">
              <p className="text-sm font-semibold text-deep">Just browsing?</p>
              <p className="text-xs text-muted mt-0.5">
                Sign in or create an account to book a coral day.
              </p>
            </div>
            <Link
              to="/"
              className="block text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-soft text-center mb-4"
              style={{ background: "#E76F51" }}
            >
              Sign in / Sign up
            </Link>
            <p className="font-display text-sm text-deep mb-2">Legend</p>
            <ul className="text-xs text-muted leading-relaxed space-y-2">
              <li className="flex items-start gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-md flex-shrink-0 mt-0.5"
                  style={{ background: "linear-gradient(135deg, #F7B267, #E76F51)" }}
                />
                <span><strong className="text-deep">Bookable</strong> — click to purchase.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="inline-block w-3 h-3 rounded-md bg-[#C7CFD5] flex-shrink-0 mt-0.5" />
                <span><strong className="text-deep">Reserved</strong> — private booking.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="inline-block w-3 h-3 rounded-md bg-white border border-deep/15 flex-shrink-0 mt-0.5" />
                <span><strong className="text-deep">Open</strong> — not for sale.</span>
              </li>
            </ul>
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
                Click coral to book · gray is reserved · white is unavailable
              </p>
            </div>

            {loading ? (
              <div className="text-center py-16 text-muted">
                <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-2" />
                <div className="text-sm">Loading calendar…</div>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-sm text-denied">Could not load: {error}</div>
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
              </div>
            )}
          </section>
        </div>
        <div className="bg-white rounded-2xl shadow-soft border border-deep/10 overflow-hidden mt-5 p-5">
          <h3 className="font-display text-lg text-deep mb-3">Open dates</h3>
          {openSlots.length === 0 ? (
            <p className="text-sm text-muted italic">No open dates right now. Check back soon.</p>
          ) : (
            <div className="grid gap-2">
              {openSlots.map((slot) => (
                <SlotSummaryCard key={slot.id} slot={slot} />
              ))}
            </div>
          )}
        </div>
      </main>
      <footer className="text-center text-xs text-muted py-6">
        Scheerer Cottage Scheduler  ©️2026 - All rights reserved
      </footer>
    </div>
  );
}

function PublicHeader() {
  return (
    <header
      className="text-white shadow-lift"
      style={{
        background: "linear-gradient(135deg, #0F2C40 0%, #1B4965 35%, #2C7DA0 65%, #F7B267 95%, #E76F51 100%)",
      }}
    >
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/40 flex items-center justify-center backdrop-blur">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <path d="M14 3 L25 24 H3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,.18)" />
              <path d="M11 24 V14 H17 V24" stroke="white" strokeWidth="1.6" fill="none" />
              <path d="M3 24 H25" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-xl leading-tight">Scheerer Cottage Scheduler</h1>
            <p className="text-xs text-white/80">Public calendar · Lake Michigan</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/availability"
            className="bg-white/15 hover:bg-white/25 transition border border-white/35 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Open dates
          </Link>
          <Link
            to="/"
            className="text-white text-xs font-semibold rounded-lg px-3 py-1.5 shadow-soft"
            style={{ background: "#E76F51" }}
          >
            Sign in / Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}

function DayCell({ status, isTodayCell, onBook }: {
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


function SlotSummaryCard({ slot }: { slot: BookableSlot }) {
  const start = slot.startDate ? parseISO(slot.startDate) : null;
  const end   = slot.endDate   ? parseISO(slot.endDate)   : start;
  const isMultiDay = slot.startDate && slot.endDate && slot.startDate !== slot.endDate;
  const dayCount = start && end
    ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    : 1;
  const price = ((slot.priceCents ?? 0) / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });
  return (
    <div className="bg-foam/40 rounded-xl border border-deep/10 p-3 flex items-center gap-3 flex-wrap sm:flex-nowrap">
      <div className="bg-white rounded-lg px-3 py-1.5 text-center min-w-[84px] flex-shrink-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-mid">{start ? format(start, "MMM") : "--"}</div>
        <div className="font-display text-lg text-deep leading-tight">{start ? format(start, "d") : "?"}{isMultiDay && end ? " - " + format(end, start && start.getMonth() === end.getMonth() ? "d" : "MMM d") : ""}</div>
        <div className="text-[10px] text-muted">{start ? format(start, "yyyy") + (isMultiDay ? " · " + dayCount + " days" : "") : ""}</div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-deep text-sm">{slot.title}</h4>
        {slot.description && (
          <p className="text-xs text-muted leading-snug mt-0.5">{slot.description}</p>
        )}
      </div>
      <div className="text-right ml-auto">
        <div className="font-display text-lg text-deep">{price}</div>
        <Link to={`/book/start?slotId=${slot.id}`} className="inline-block mt-1 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-soft" style={{ background: "#E76F51" }}>Book now</Link>
      </div>
    </div>
  );
}
