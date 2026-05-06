import { useMemo } from "react";
import type { Reservation, Request } from "../lib/data";
import { isUploadedPicture } from "../lib/profile";
import Avatar from "./Avatar";

/** Chip for stays that are live on the calendar (approved + bookable). */
const APPROVED_CHIP = "bg-[#D8F0EC] text-[#1F7A6F]";

interface Props {
  reservations: Reservation[];
  requests: Request[];
  userId: string | null;
  /** Display name (preferred username or email). */
  displayName: string | null;
  /** Cognito picture: emoji, upload path, or null. */
  picture: string | null;
  loading: boolean;
  onSelectReservation: (r: Reservation) => void;
}

function firstNameFromDisplay(label: string | null | undefined): string {
  const t = label?.trim();
  if (!t) return "there";
  const part = t.split(/\s+/)[0];
  return part || "there";
}

const rowBtnClass =
  "w-full text-left rounded-xl border border-deep/10 px-3 py-2.5 transition " +
  "hover:bg-foam hover:border-aqua/40 focus:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-aqua/50 focus-visible:ring-offset-2";

/**
 * Left column: welcome + profile, then calendar reservations published from
 * this user's approved requests. Clicks open the same ReservationModal as the calendar.
 */
export default function MyReservationsGlance({
  reservations,
  requests,
  userId,
  displayName,
  picture,
  loading,
  onSelectReservation,
}: Props) {
  const requestById = useMemo(
    () => new Map(requests.map((q) => [q.id, q])),
    [requests],
  );

  /** Stays that are on the calendar because this user requested and was approved. */
  const mine = useMemo(() => {
    if (!userId) return [];
    const list = reservations.filter((res) => {
      if (!res.sourceRequestId) return false;
      const req = requestById.get(res.sourceRequestId);
      return req?.requesterId === userId && req.status === "Approved";
    });
    list.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    return list;
  }, [reservations, requestById, userId]);

  const firstName   = firstNameFromDisplay(displayName);
  const initials    = (displayName || "?").slice(0, 2).toUpperCase();
  const inlineEmoji =
    picture && !isUploadedPicture(picture) ? picture.trim() : null;

  return (
    <aside
      id="reservations-glance"
      className="
        w-full md:w-72 shrink-0
        bg-white rounded-2xl shadow-soft border border-deep/10 border-l-4 border-l-aqua overflow-hidden
        flex flex-col md:sticky md:top-24 md:self-start
      "
      aria-labelledby="glance-heading"
    >
      <div className="px-4 py-4 border-b border-deep/10 bg-gradient-to-br from-foam to-white">
        <div className="flex items-start gap-3">
          <Avatar picture={picture} fallbackInitials={initials} size={44} />
          <div className="min-w-0 flex-1">
            <h2 id="glance-heading" className="font-display text-lg text-deep leading-snug">
              Welcome,{" "}
              <span className="font-semibold">{firstName}</span>
              {inlineEmoji ? (
                <>
                  {" "}
                  <span className="not-italic" aria-hidden>{inlineEmoji}</span>
                </>
              ) : null}
            </h2>
            <p className="text-sm text-muted mt-1 leading-snug">
              Reservation summary
            </p>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 flex-1 min-h-[120px]">
        {loading ? (
          <div className="flex flex-col gap-2 animate-pulse py-1">
            <div className="h-14 rounded-xl bg-foam" />
            <div className="h-14 rounded-xl bg-foam" />
          </div>
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted px-1 py-2 leading-relaxed">
            No published reservations yet. When a request is approved, your stay appears
            here and on the calendar.
          </p>
        ) : (
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelectReservation(r)}
                  className={rowBtnClass}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-lg shrink-0 leading-none pt-0.5" aria-hidden>
                      {r.partyEmoji?.trim() || "🏡"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-deep text-sm truncate">
                          {r.partyName ?? "Stay"}
                        </span>
                        <span
                          className={[
                            "text-[10px] font-bold tracking-wide rounded-full px-2 py-0.5 uppercase shrink-0",
                            APPROVED_CHIP,
                          ].join(" ")}
                        >
                          Approved
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {r.startDate === r.endDate
                          ? r.startDate
                          : `${r.startDate} → ${r.endDate}`}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
