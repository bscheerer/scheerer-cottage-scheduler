import { useMemo } from "react";
import type { Reservation, Request } from "../lib/data";
import { isUploadedPicture } from "../lib/profile";
import Avatar from "./Avatar";

const STATUS_BADGE: Record<string, string> = {
  Pending:   "bg-[#FCEACB] text-[#8a5a17]",
  Approved:  "bg-[#D8F0EC] text-[#1F7A6F]",
  Denied:    "bg-[#F4DAD0] text-[#87391F]",
  Cancelled: "bg-foam text-muted",
};

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

function rowClasses(interactive: boolean): string {
  return [
    "w-full text-left rounded-xl border border-deep/10 px-3 py-2.5 transition",
    interactive
      ? "hover:bg-foam hover:border-aqua/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua/50 focus-visible:ring-offset-2"
      : "opacity-95",
  ].join(" ");
}

/**
 * Left column: welcome + profile, then every stay the user has requested with
 * its approval status. Approved rows that exist on the calendar open the same
 * ReservationModal as clicking the event.
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
  const reservationBySourceId = useMemo(() => {
    const m = new Map<string, Reservation>();
    for (const res of reservations) {
      if (res.sourceRequestId) m.set(res.sourceRequestId, res);
    }
    return m;
  }, [reservations]);

  const mine = useMemo(() => {
    if (!userId) return [];
    const list = requests.filter((q) => q.requesterId === userId);
    list.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    return list;
  }, [requests, userId]);

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
              Your requests and reservation status
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
            No requests yet. Use <strong>Request dates</strong> on the calendar — each
            submission will show here with Pending, Approved, or Denied.
          </p>
        ) : (
          <ul className="space-y-2">
            {mine.map((q) => {
              const res =
                q.status === "Approved"
                  ? reservationBySourceId.get(q.id) ?? null
                  : null;
              const interactive = Boolean(res);
              const chip =
                STATUS_BADGE[q.status ?? "Pending"] ?? STATUS_BADGE.Pending;
              const face = q.requesterEmoji?.trim() || "🏡";

              const body = (
                <>
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-lg shrink-0 leading-none pt-0.5" aria-hidden>
                      {face}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-deep text-sm truncate">
                          {q.partyName ?? "Stay"}
                        </span>
                        <span
                          className={[
                            "text-[10px] font-bold tracking-wide rounded-full px-2 py-0.5 uppercase shrink-0",
                            chip,
                          ].join(" ")}
                        >
                          {q.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {q.startDate === q.endDate
                          ? q.startDate
                          : `${q.startDate} → ${q.endDate}`}
                      </div>
                      {q.status === "Denied" && q.decisionReason && (
                        <div className="text-[11px] text-denied mt-1 line-clamp-2">
                          {q.decisionReason}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );

              return (
                <li key={q.id}>
                  {interactive && res ? (
                    <button
                      type="button"
                      onClick={() => onSelectReservation(res)}
                      className={rowClasses(true)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={rowClasses(false)} role="group">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
