import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  deleteReservation, updateReservation, type Reservation, type Request,
} from "../lib/data";
import { matchesCognitoIdentity, useIdentity } from "../lib/identity";
import { type Role } from "../lib/auth";
import { format, parseISO, toISODate } from "../lib/dates";
import Avatar from "./Avatar";
import { initialsFromName } from "../lib/profile";

interface Props {
  reservation: Reservation | null;
  open: boolean;
  onClose: () => void;
  /** Live request list — used to find the original requester for ownership checks. */
  requests: Request[];
  role: Role;
  /** Called when the owner clicks "Request a change" — Calendar bridges to RequestModal. */
  onRequestChange: (r: Reservation) => void;
}

/**
 * Reservation details modal. Opens when any reserved cell on the calendar
 * is clicked.
 *
 * Behavior depends on the current user's role:
 *   - Admin / Super User : can switch into edit mode (dates + party name +
 *     notes) or cancel the reservation outright.
 *   - The original requester : can request a change (re-uses the standard
 *     request flow, which an admin then approves or denies).
 *   - Anyone else signed in : view-only.
 *
 * All admin actions write audit log entries via data.ts.
 */
export default function ReservationModal({
  reservation, open, onClose, requests, role, onRequestChange,
}: Props) {
  const { userId, label, username, email } = useIdentity();
  const isAdmin = role === "Admin" || role === "SuperUser";

  // Find the original requester's user id via the source request.
  const sourceRequest = reservation?.sourceRequestId
    ? requests.find((r) => r.id === reservation.sourceRequestId)
    : undefined;
  const isOwner =
    !!sourceRequest &&
    matchesCognitoIdentity(sourceRequest.requesterId, { userId, username, email });

  const [editing, setEditing]   = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]   = useState("");
  const [partyName, setPartyName] = useState("");
  const [notes, setNotes]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Reset whenever the reservation we're displaying changes or the modal opens.
  useEffect(() => {
    if (open && reservation) {
      setEditing(false);
      setStartDate(reservation.startDate ?? "");
      setEndDate(reservation.endDate ?? "");
      setPartyName(reservation.partyName ?? "");
      setNotes(reservation.notes ?? "");
      setError(null);
    }
  }, [open, reservation]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !reservation) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!userId || !reservation) return;
    setBusy(true);
    setError(null);
    try {
      await updateReservation(reservation, {
        startDate, endDate,
        partyName: partyName.trim() || reservation.partyName || "Reserved",
        notes:     notes.trim() || null,
      }, userId, label ?? undefined);
      setEditing(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!userId || !reservation) return;
    if (!confirm(`Cancel ${reservation.partyName ?? "this reservation"} (${reservation.startDate} → ${reservation.endDate})?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteReservation(reservation, userId, label ?? undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

  const headerPicture = reservation.partyEmoji || sourceRequest?.requesterEmoji || "";
  const headerInitials = initialsFromName(reservation.partyName);
  const dateRange = formatDateRange(reservation.startDate ?? "", reservation.endDate ?? "");
  const today = toISODate(new Date());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15, 44, 64, 0.45)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-lift border border-deep/10 w-full max-w-lg p-6 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-start gap-4 pb-4 border-b border-deep/5">
          <Avatar
            picture={headerPicture}
            fallbackInitials={headerInitials}
            size={64}
            className="border border-approved/30"
          />
          <div className="min-w-0">
            <h3 id="reservation-modal-title" className="font-display text-2xl text-deep truncate">
              {reservation.partyName ?? "Reserved"}
            </h3>
            <div className="text-sm text-mid mt-1">{dateRange}</div>
            <span className="inline-block mt-2 text-[11px] font-bold tracking-wide rounded-full px-2 py-0.5 uppercase bg-[#D8F0EC] text-[#1F7A6F]">
              Approved
            </span>
          </div>
        </div>

        {/* View mode */}
        {!editing && (
          <>
            <DetailRow label="Description">
              {reservation.notes ? (
                <p className="text-ink whitespace-pre-wrap">{reservation.notes}</p>
              ) : (
                <p className="text-muted italic">No description.</p>
              )}
            </DetailRow>

            <DetailRow label="Cottage Elder Sponsor">
              {reservation.sponsors && reservation.sponsors.length > 0 ? (
                <ul className="space-y-1">
                  {reservation.sponsors.map((s) => (
                    <li key={s} className="flex items-center gap-2 text-ink">
                      <span className="w-1.5 h-1.5 rounded-full bg-aqua flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted italic">No sponsor recorded.</p>
              )}
            </DetailRow>

            {sourceRequest && (
              <DetailRow label="Originally requested by">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    picture={sourceRequest.requesterEmoji}
                    fallbackInitials={initialsFromName(sourceRequest.requesterName || sourceRequest.partyName)}
                    size={32}
                  />
                  <span className="text-ink font-medium">
                    {sourceRequest.requesterName ?? sourceRequest.partyName ?? "—"}
                  </span>
                </div>
              </DetailRow>
            )}

            {error && (
              <div className="rounded-xl border border-denied/40 bg-[#F4DAD0] px-3 py-2 text-sm text-[#7A2F18] mt-4">
                {error}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 mt-5 pt-4 border-t border-deep/5">
              <button
                onClick={onClose}
                className="text-mid hover:bg-foam rounded-lg px-3 py-2 text-sm font-semibold transition"
              >
                Close
              </button>

              {isOwner && !isAdmin && (
                <button
                  onClick={() => onRequestChange(reservation)}
                  className="text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft transition hover:brightness-105"
                  style={{ background: "linear-gradient(180deg, #F7B267, #E76F51)" }}
                >
                  Request a change
                </button>
              )}

              {isAdmin && (
                <>
                  <button
                    onClick={handleCancel}
                    disabled={busy}
                    className="text-white text-sm font-semibold px-4 py-2 rounded-xl bg-denied disabled:opacity-50 transition hover:brightness-105"
                  >
                    {busy ? "…" : "Cancel reservation"}
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    className="text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft transition hover:brightness-105"
                    style={{ background: "linear-gradient(180deg, #2C7DA0, #1B4965)" }}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Edit mode (admin only) */}
        {editing && (
          <form onSubmit={handleSave} className="mt-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Arrive">
                <input
                  type="date"
                  value={startDate}
                  min={today < startDate ? today : startDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDate(v);
                    if (v && endDate < v) setEndDate(v);
                  }}
                  className={inputCls}
                  required
                />
              </Field>
              <Field label="Depart">
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputCls}
                  required
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Party / family name">
                <input
                  type="text"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  maxLength={60}
                  className={inputCls}
                  required
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Description">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className={inputCls + " resize-y"}
                  placeholder="Visible to the whole family"
                />
              </Field>
            </div>

            {error && (
              <div className="rounded-xl border border-denied/40 bg-[#F4DAD0] px-3 py-2 text-sm text-[#7A2F18] mt-4">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-deep/5">
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null); }}
                className="text-mid hover:bg-foam rounded-lg px-3 py-2 text-sm font-semibold transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={busy}
                className="text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft transition disabled:opacity-50"
                style={{ background: "linear-gradient(180deg, #2C7DA0, #1B4965)" }}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full border border-deep/15 rounded-lg px-3 py-2 bg-offwhite text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-aqua focus:border-transparent text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mid mb-1">{label}</div>
      {children}
    </label>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mid mb-1">{label}</div>
      {children}
    </div>
  );
}

function formatDateRange(startISO: string, endISO: string): string {
  if (!startISO || !endISO) return "—";
  const s = parseISO(startISO);
  const e = parseISO(endISO);
  if (startISO === endISO) return format(s, "EEE, MMM d, yyyy");
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${format(s, "MMM d")} – ${format(e, "d, yyyy")}`;
  }
  return `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}`;
}
