import { useEffect, useRef, useState } from "react";
import {
  addMonths, format, isSameDay, isSameMonth, monthGridDays, toISODate,
} from "../../lib/dates";

interface Props {
  cursor: Date;
  onPickDate: (d: Date) => void;
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * Parse common typed date forms:
 *   "2026-05-24" / "2026/5/24"   (ISO)
 *   "5/24"  "5/24/26"  "5/24/2026" (US slash)
 *   "May 24" / "May 24, 2026" / "May 24th"
 *   "24 May" / "24 May 2026"
 * Returns null if the input doesn't resolve to a real date.
 */
export function parseFlexibleDate(raw: string, now: Date = new Date()): Date | null {
  const s = raw.trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;

  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return makeDate(+m[1], +m[2] - 1, +m[3]);

  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (m) {
    let y = now.getFullYear();
    if (m[3]) { y = +m[3]; if (y < 100) y += 2000; }
    return makeDate(y, +m[1] - 1, +m[2]);
  }

  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{2,4}))?$/);
  if (m) {
    const idx = MONTH_NAMES.indexOf(m[1].toLowerCase().slice(0, 3));
    if (idx >= 0) {
      let y = now.getFullYear();
      if (m[3]) { y = +m[3]; if (y < 100) y += 2000; }
      return makeDate(y, idx, +m[2]);
    }
  }

  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:[,\s]+(\d{2,4}))?$/);
  if (m) {
    const idx = MONTH_NAMES.indexOf(m[2].toLowerCase().slice(0, 3));
    if (idx >= 0) {
      let y = now.getFullYear();
      if (m[3]) { y = +m[3]; if (y < 100) y += 2000; }
      return makeDate(y, idx, +m[1]);
    }
  }
  return null;
}

function makeDate(y: number, mo: number, d: number): Date | null {
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) return dt;
  return null;
}

/**
 * Compact date-jump control. A text input that parses common forms, plus a
 * calendar icon that opens a small mini month picker. Both routes call
 * `onPickDate(date)` which the parent uses to move the calendar cursor.
 */
export default function DateJump({ cursor, onPickDate }: Props) {
  const [text, setText]           = useState("");
  const [open, setOpen]           = useState(false);
  const [popCursor, setPopCursor] = useState(cursor);
  const [error, setError]         = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPopCursor(cursor); }, [cursor]);

  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("mousedown", onMouse);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouse);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function submit() {
    const parsed = parseFlexibleDate(text);
    if (parsed) {
      onPickDate(parsed);
      setText(""); setError(false); setOpen(false);
    } else {
      setError(true);
    }
  }
  function pick(day: Date) {
    onPickDate(day);
    setOpen(false); setText(""); setError(false);
  }

  const today = new Date();
  const days = monthGridDays(popCursor);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-center">
        <input
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(false); }}
          placeholder="Jump to date…"
          aria-label="Jump to date"
          className={[
            "border rounded-l-lg px-3 py-1.5 text-sm w-36 bg-white",
            "focus:outline-none focus:ring-2 focus:ring-aqua",
            error ? "border-denied" : "border-deep/15",
          ].join(" ")}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Open date picker"
          title="Pick from calendar"
          className="border border-l-0 border-deep/15 rounded-r-lg px-2.5 py-1.5 bg-white text-mid hover:bg-foam transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8"  y1="2" x2="8"  y2="6" />
            <line x1="3"  y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </form>

      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 w-72 bg-white border border-deep/10 rounded-2xl shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setPopCursor((c) => addMonths(c, -1))}
              aria-label="Previous month"
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-mid hover:bg-foam transition"
            >‹</button>
            <div className="font-display text-sm text-deep">{format(popCursor, "MMMM yyyy")}</div>
            <button
              type="button"
              onClick={() => setPopCursor((c) => addMonths(c, 1))}
              aria-label="Next month"
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-mid hover:bg-foam transition"
            >›</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DOW.map((d, i) => (
              <div key={i} className="text-center text-[10px] tracking-widest uppercase font-bold text-muted py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const inMonth    = isSameMonth(day, popCursor);
              const isCursor   = isSameDay(day, cursor);
              const isTodayBtn = isSameDay(day, today);
              return (
                <button
                  key={toISODate(day)}
                  type="button"
                  onClick={() => pick(day)}
                  className={[
                    "h-8 text-xs rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua",
                    inMonth ? "text-deep" : "text-driftwood/40",
                    isCursor ? "bg-aqua text-white font-bold"
                      : isTodayBtn ? "ring-1 ring-aqua text-deep"
                      : "hover:bg-foam",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={() => pick(today)}
              className="text-xs text-mid font-semibold border border-deep/15 rounded-lg px-2.5 py-1 hover:bg-foam transition"
            >Today</button>
          </div>
        </div>
      )}
    </div>
  );
}
