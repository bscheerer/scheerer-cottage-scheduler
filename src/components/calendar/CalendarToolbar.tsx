import type { ReactNode } from "react";
import { format } from "../../lib/dates";

export type ViewMode = "month" | "week";

interface Props {
  cursor: Date;
  view: ViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onView: (v: ViewMode) => void;
  onRequest: () => void;
}

/**
 * Top-of-calendar toolbar: prev/next/today, the title (month or week range),
 * a segmented control to switch between Month and Week, and the warm CTA
 * for requesting dates.
 */
export default function CalendarToolbar({
  cursor, view, onPrev, onNext, onToday, onView, onRequest,
}: Props) {
  const title =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : `${format(cursor, "MMM d")} – ${format(addToWeekEnd(cursor), "MMM d, yyyy")}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-deep/10 bg-gradient-to-b from-white to-foam">
      <div className="flex items-center gap-2">
        <IconBtn onClick={onPrev} label="Previous">‹</IconBtn>
        <IconBtn onClick={onNext} label="Next">›</IconBtn>
        <h2 className="font-display text-xl text-deep mx-1">{title}</h2>
        <button
          onClick={onToday}
          className="ml-1 text-xs font-semibold border border-deep/15 rounded-lg px-3 py-1.5 text-mid hover:bg-foam transition"
        >
          Today
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="inline-flex bg-foam border border-deep/10 rounded-xl p-0.5">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onView(v)}
              className={[
                "px-3.5 py-1.5 rounded-lg text-sm font-semibold transition capitalize",
                view === v
                  ? "bg-white text-deep shadow-soft"
                  : "text-muted hover:text-deep",
              ].join(" ")}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          onClick={onRequest}
          className="inline-flex items-center gap-2 text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-soft transition hover:brightness-105"
          style={{ background: "linear-gradient(180deg, #F7B267, #E76F51)" }}
        >
          + Request dates
        </button>
      </div>
    </div>
  );
}

function IconBtn({
  onClick, label, children,
}: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-9 h-9 inline-flex items-center justify-center bg-white border border-deep/15 rounded-lg text-mid hover:bg-foam transition text-lg leading-none"
    >
      {children}
    </button>
  );
}

// Local helper to compute a week's end without polluting dates.ts
function addToWeekEnd(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + 6);
  return r;
}
