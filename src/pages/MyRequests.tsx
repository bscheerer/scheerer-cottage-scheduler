import { useState } from "react";
import { useReservations, useRequests, cancelRequest, type Request } from "../lib/data";
import { useIdentity } from "../lib/identity";
import RequestModal from "../components/RequestModal";
import Avatar from "../components/Avatar";

const STATUS_BADGE: Record<string, string> = {
  Pending:   "bg-[#FCEACB] text-[#8a5a17]",
  Approved:  "bg-[#D8F0EC] text-[#1F7A6F]",
  Denied:    "bg-[#F4DAD0] text-[#87391F]",
  Cancelled: "bg-foam text-muted",
};

/**
 * "My Requests" — current user's request history. Pending requests can be
 * cancelled. Newest first.
 */
export default function MyRequests() {
  const { userId, label, loading: identityLoading } = useIdentity();
  const { items: requests, loading: requestsLoading } = useRequests();
  const { items: reservations } = useReservations();
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = identityLoading || requestsLoading;
  const mine = requests
    .filter((r) => r.requesterId === userId)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  async function onCancel(req: Request) {
    if (!userId) return;
    if (!confirm(`Cancel your request for ${req.startDate} → ${req.endDate}?`)) return;
    setBusyId(req.id);
    setError(null);
    try {
      await cancelRequest(req.id, userId, label ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display text-2xl text-deep">My requests</h2>
          <p className="text-sm text-muted mt-1">
            Hi {label ?? "there"} — every date you've requested, in one place.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft transition hover:brightness-105"
          style={{ background: "linear-gradient(180deg, #F7B267, #E76F51)" }}
        >
          + Request dates
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-denied/40 bg-[#F4DAD0] px-3 py-2 text-sm text-[#7A2F18]">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-deep/10 shadow-soft overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-muted">
            <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-3" />
            <div>Loading…</div>
          </div>
        ) : mine.length === 0 ? (
          <div className="text-center py-12 px-6 text-muted">
            <div className="font-display text-xl text-deep mb-1">No requests yet</div>
            <div className="text-sm">When you request a stay, it'll show up here with its status.</div>
          </div>
        ) : (
          <ul className="divide-y divide-deep/5">
            {mine.map((r) => (
              <li key={r.id} className="px-5 py-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[220px] flex items-start gap-3">
                  <Avatar
                    picture={r.requesterEmoji}
                    fallbackInitials={(r.partyName || r.requesterName || "?").slice(0, 2).toUpperCase()}
                    size={36}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-deep">{r.partyName ?? "Request"}</span>
                      <span className={[
                        "text-[11px] font-bold tracking-wide rounded-full px-2 py-0.5 uppercase",
                        STATUS_BADGE[r.status ?? "Pending"] ?? "",
                      ].join(" ")}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-sm text-muted mt-1">
                      {r.startDate} → {r.endDate}
                    </div>
                    {r.note && <div className="text-sm text-ink/70 mt-1 italic">"{r.note}"</div>}
                    {r.status === "Denied" && r.decisionReason && (
                      <div className="text-xs text-denied mt-1">Reason: {r.decisionReason}</div>
                    )}
                  </div>
                </div>
                {r.status === "Pending" && (
                  <button
                    onClick={() => onCancel(r)}
                    disabled={busyId === r.id}
                    className="text-mid hover:bg-foam border border-deep/15 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50"
                  >
                    {busyId === r.id ? "Cancelling…" : "Cancel"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <RequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        reservations={reservations}
      />
    </section>
  );
}
