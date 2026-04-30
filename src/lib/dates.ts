import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek,
} from "date-fns";

/** Tiny ergonomic re-export so the rest of the app only imports from here. */
export {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek,
};

/**
 * Returns the 6-week (42-day) grid for the month containing `cursor`.
 * Always starts on Sunday and ends on Saturday so the grid is rectangular.
 */
export function monthGridDays(cursor: Date): Date[] {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd   = endOfWeek(monthEnd,   { weekStartsOn: 0 });
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

/** The 7 days of the week containing `cursor`, Sunday → Saturday. */
export function weekDays(cursor: Date): Date[] {
  const weekStart = startOfWeek(cursor, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** ISO date (YYYY-MM-DD) — what the GraphQL `date` scalar expects. */
export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * True if `day` falls within [startISO, endISO] inclusive.
 * Both endpoints are ISO date strings (no time component).
 */
export function dayInRange(day: Date, startISO: string, endISO: string): boolean {
  const dayISO = toISODate(day);
  return dayISO >= startISO && dayISO <= endISO;
}

/** Where `day` sits inside an inclusive range — used for chip border-radius. */
export function rangePosition(
  day: Date,
  startISO: string,
  endISO: string
): "single" | "start" | "middle" | "end" | "outside" {
  const dayISO = toISODate(day);
  if (dayISO < startISO || dayISO > endISO) return "outside";
  if (startISO === endISO) return "single";
  if (dayISO === startISO) return "start";
  if (dayISO === endISO)   return "end";
  return "middle";
}
