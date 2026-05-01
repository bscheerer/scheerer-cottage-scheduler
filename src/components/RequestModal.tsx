import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createRequest, overlaps, type Reservation } from "../lib/data";
import { useIdentity } from "../lib/identity";
import { toISODate } from "../lib/dates";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional pre-fills (e.g. when user clicks a specific day in the calendar
   *  or asks for a modification of an existing reservation). */
  initialStart?: string;
  initialEnd?: string;
  initialPartyName?: string;
  initialNote?: string;
  /** Optional override for the modal title (e.g. "Request a change"). */
  title?: string;
  /** Live list of approved reservations — used to warn about conflicts before submit. */
  reservations: Reservation[];
  onSuccess?: () => void;
}

/**
 * Modal form for submitting a date request. Trimmed to the essentials:
 * arrive / depart, party name, optional note. The requester's emoji avatar
 * (chosen in Settings) is captured at submit time so the calendar can show
 * it on the reservation chip later.
 */
export default function RequestModal({
  open, onClose, initialStart, initialEnd, initialPartyName, initialNote,
  title, reservations, onSuccess,
}: Props) {
  const today = toISODate(new Date());
  const { userId, label, picture, email, loading: identityLoading } = useIdentity();

  const [startDate, setStartDate] = useState(initialStart ?? today);
  const [endDate, setEndDate]     = useState(initialEnd ?? today);
  const [partyName, setPartyName] = useState(initialPartyName ?? label ?? "");
  const [note, setNote]           = useState(initialNote ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (label && !partyName) setPartyName(label); }, [label, partyName]);

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      if (initialStart)     setStartDate(initialStart);
      if (initialEnd)       setEndDate(initialEnd);
      if (initialPartyName) setPartyName(initialPartyName);
      if (initialNote)      setNote(initialNote);
      setTimeout(() => firstInput.current?.focus(), 0);
    }
  }, [open, initialStart, initialEnd, initialPartyName, initialNote]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const conflict = reservations.find(
    (r) => r.startDate && r.endDate && overlaps(startDate, endDate, r.startDate, r.endDate)
  );

  const datesValid = startDate && endDate && startDate <= endDate;
  const partyValid = partyName.trim().length > 0;
  const canSubmit  = datesValid && partyValid && !submitting && !identityLoading && userId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createRequest({
        startDate,
        endDate,
        partyName: partyName.trim(),
        note: note.trim() || undefined,
        requesterId: userId!,
        requesterEmoji: picture || undefined,
        requesterEmail: email || undefined,
        requesterName:  label || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the request.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15, 44, 64, 0.45)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-lift border border-deep/10 w-full max-w-lg p-6 max-h-[90vh] overflow-auto"
      >
        <h3 id="request-modal-title" className="font-display text-2xl text-deep mb-1">
          {title ?? "Request the cottage"}
        </h3>
        <p className="text-sm text-muted mb-5">
          Pick the dates you want. The admin team will review and let you know.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Arrive">
            <input
              ref={firstInput}
              type="date"
              min={today}
              value={startDate}
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
              min={startDate || today}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
              required
            />
          </Field>
        </div>

        <Field label="Party / family name">
          <input
            type="text"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="e.g. The Patel family"
            className={inputCls}
            maxLength={60}
            required
          />
        </Field>

        <div className="mt-3">
          <Field label="Note for the admin (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the admin should know"
              rows={3}
              maxLength={500}
              className={inputCls + " resize-y"}
            />
          </Field>
        </div>

        {conflict && !error && (
          <div className="mt-4 rounded-xl border border-sunset-amber/40 bg-sand-light px-3 py-2 text-sm text-driftwood">
            <strong>Heads up —</strong> these dates overlap an approved reservation
            ({conflict.partyName ?? "another party"}, {conflict.startDate} → {conflict.endDate}).
            The admin will likely deny. Pick different dates if you can.
          </div>
        )}
        {!conflict && datesValid && (
          <div className="mt-4 rounded-xl border border-aqua/30 bg-foam px-3 py-2 text-sm text-deep">
            <strong>Looks open.</strong> Submitting will create a pending request.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-denied/40 bg-[#F4DAD0] px-3 py-2 text-sm text-[#7A2F18]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="text-mid hover:bg-foam rounded-lg px-3 py-2 text-sm font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-soft transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(180deg, #F7B267, #E76F51)" }}
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
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
