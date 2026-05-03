import { useState } from "react";
import { useRequests, approveRequest, denyRequest, type Request } from "../lib/data";
import { useIdentity } from "../lib/identity";
import Avatar from "../components/Avatar";

const STATUS_BADGE: Record<string, string> = {
  Pending:   "bg-[#FCEACB] text-[#8a5a17]",
  Approved:  "bg-[#D8F0EC] text-[#1F7A6F]",
  Denied:    "bg-[#F4DAD0] text-[#87391F]",
  Cancelled: "bg-foam text-muted",
};

/**
 * Admin-only approval queue. Pending requests at the top with approve/deny.
 * Recently decided requests are shown beneath for context. Approving runs
 * a client-side conflict check and auto-denies overlapping pendings.
 */
export default function ApprovalQueue() {
  const { userId, label } = useIdentity();
  const { items: requests, loading } = useRequests();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pending = requests
    .filter((r) => r.status === "Pending")
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  const recent = requests
    .filter((r) => r.status !== "Pending")
    .sort((a, b) => (b.decidedAt ?? b.updatedAt ?? "").localeCompare(a.decidedAt ?? a.updatedAt ?? ""))
    .slice(0, 10);

  async function onApprove(req: Request) {
    if (!userId) return;
    setBusyId(req.id);
    setError(null);
    setToast(null);
    try {
      const result = await approveRequest(req, userId, label ?? undefined);
      const denied = result.autoDeniedRequestIds.length;
      setToast(
        denied > 0
          ? `Approved. ${denied} overlapping request${denied > 1 ? "s" : ""} auto-denied.`
          : "Approved."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDeny(req: Request) {
    if (!userId) return;
    const reason = prompt(`Deny request from ${req.partyName}? Optional reason:`);
    if (reason === null) return; // user cancelled prompt
    setBusyId(req.id);
    setError(null);
    setToast(null);
    try {
      await denyRequest(req, userId, label ?? undefined, reason || undefined);
      setToast("Denied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deny failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display text-2xl text-deep">Approval queue</h2>
          <p className="text-sm text-muted mt-1">
            Review and decide on pending date requests. Approving creates a
            reservation and auto-denies any overlapping pendings.
          </p>
        </div>
        <span className="bg-sunset-amber/20 text-driftwood text-xs font-bold uppercase tracking-wide rounded-full px-3 py-1.5">
          {pending.length} pending
        </span>
      </header>

      {toast && (
        <div className="mb-4 rounded-xl border border-approved/40 bg-[#D8F0EC] px-3 py-2 text-sm text-[#1F7A6F]">
          {toast}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-denied/40 bg-[#F4DAD0] px-3 py-2 text-sm text-[#7A2F18]">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-deep/10 shadow-soft overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-deep/5 bg-gradient-to-b from-white to-foam">
          <h3 className="font-display text-deep">Pending</h3>
        </div>
        {loading ? (
          <div className="text-center py-12 text-muted">
            <div className="inline-block w-5 h-5 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-2" />
            <div className="text-sm">Loading…</div>
          </div>
        ) : pending.length === 0 ? (
          <div className="text-center py-10 px-6 text-muted">
            <div className="font-display text-lg text-deep mb-1">All caught up</div>
            <div className="text-sm">No requests waiting on you.</div>
          </div>
        ) : (
          <ul className="divide-y divide-deep/5">
            {pending.map((r) => (
              <li key={r.id} className="px-5 py-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[260px] flex items-start gap-3">
                  <Avatar
                    picture={r.requesterEmoji}
                    fallbackInitials={(r.partyName || r.requesterName || "?").slice(0, 2).toUpperCase()}
                    size={36}
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-deep">{r.partyName ?? "Request"}</div>
                    <div className="text-sm text-muted mt-0.5">
                      {r.startDate} → {r.endDate}
                    </div>
                    {r.note && <div className="text-sm text-ink/70 mt-1 italic">"{r.note}"</div>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onDeny(r)}
                    disabled={busyId === r.id}
                    className="text-white text-sm font-semibold px-3 py-1.5 rounded-lg bg-denied disabled:opacity-50 transition hover:brightness-105"
                  >
                    {busyId === r.id ? "…" : "Deny"}
                  </button>
                  <button
                    onClick={() => onApprove(r)}
                    disabled={busyId === r.id}
                    className="text-white text-sm font-semibold px-3 py-1.5 rounded-lg bg-approved disabled:opacity-50 transition hover:brightness-105"
                  >
                    {busyId === r.id ? "…" : "Approve"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-deep/10 shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-deep/5 bg-gradient-to-b from-white to-foam">
          <h3 className="font-display text-deep">Recently decided</h3>
        </div>
        {recent.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted">Nothing yet.</div>
        ) : (
          <ul className="divide-y divide-deep/5">
            {recent.map((r) => (
              <li key={r.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px] flex items-start gap-3">
                  <Avatar
                    picture={r.requesterEmoji}
                    fallbackInitials={(r.partyName || r.requesterName || "?").slice(0, 2).toUpperCase()}
                    size={28}
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
                    <div className="text-sm text-muted mt-0.5">
                      {r.startDate} → {r.endDate}
                      {r.decisionReason && <span className="italic"> · {r.decisionReason}</span>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
