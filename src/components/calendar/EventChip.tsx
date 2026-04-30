import { rangePosition } from "../../lib/dates";

export type EventKind = "approved" | "pending" | "denied" | "blocked";

interface Props {
  /** Day this chip is being rendered into. */
  day: Date;
  /** Inclusive ISO date range of the event. */
  startISO: string;
  endISO: string;
  /** Display label (party name / requester / "Maintenance"). */
  label: string;
  kind: EventKind;
}

const PALETTE: Record<EventKind, string> = {
  approved: "bg-approved text-white",
  pending:  "bg-sunset-amber text-driftwood",
  denied:   "bg-denied text-white",
  blocked:  "bg-[#8FA3AE] text-white",
};

/**
 * A single reservation/request chip rendered inside a day cell.
 *
 * Multi-day visual continuity is achieved by suppressing the corner radius on
 * the side that connects to the next/previous day. The day cells are tight,
 * so the chip visually reads as one continuous bar across the row.
 */
export default function EventChip({ day, startISO, endISO, label, kind }: Props) {
  const pos = rangePosition(day, startISO, endISO);
  if (pos === "outside") return null;

  const radius =
    pos === "single" ? "rounded-md"
    : pos === "start" ? "rounded-l-md rounded-r-none"
    : pos === "end"   ? "rounded-r-md rounded-l-none"
    :                   "rounded-none";

  // For multi-day events, only the start cell shows the label; the others
  // render an empty colored bar that visually continues the chip.
  const showLabel = pos === "single" || pos === "start";

  return (
    <div
      className={[
        "mt-1 px-1.5 py-0.5 text-[11px] font-semibold leading-tight truncate",
        PALETTE[kind],
        radius,
      ].join(" ")}
      title={`${label} · ${startISO}${startISO === endISO ? "" : ` → ${endISO}`}`}
    >
      {showLabel ? label : " "}
    </div>
  );
}
