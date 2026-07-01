import { type ReactNode, useMemo, useState } from "react";
import {
  useBookableSlots, createBookableSlot, cancelBookableSlot, deleteBookableSlot,
  type BookableSlot,
} from "../lib/bookings";
import { useIdentity } from "../lib/identity";
import { format, parseISO } from "../lib/dates";

/**
 * SuperUser-only paid-slot management. Create new bookable single-day
 * events that show up on the public /availability page once published.
 * Stripe Checkout (Phase C) will flip slots to Sold when payment lands.
 */
export default function PaidSlots() {
  const { userId }          = useIdentity();
  const { items, loading }  = useBookableSlots();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  // Form state
  const [startDate,     setStartDate]    = useState("");
  const [endDate,       setEndDate]      = useState("");
  const [title,         setTitle]        = useState("");
  const [description,   setDescription]  = useState("");
  const [priceDollars,  setPriceDollars] = useState("");
  const [submitting,    setSubmitting]   = useState(false);

  const stats = useMemo(() => {
    const open  = items.filter((s) => s.status === "Open").length;
    const sold  = items.filter((s) => s.status === "Sold");
    const revenueCents = sold.reduce((sum, s) => sum + (s.priceCents ?? 0), 0);
    return { open, sold: sold.length, revenue: revenueCents / 100 };
  }, [items]);

  async function submitSlot() {
    if (!userId)                             { setError("Missing user session."); return; }
    if (!startDate || !title || !priceDollars) {
      setError("Date, title, and price are required.");
      return;
    }
    const cents = Math.round(parseFloat(priceDollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("Price must be a positive number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createBookableSlot({
        startDate,
        endDate: endDate || startDate,
        title,
        description: description || undefined,
        priceCents: cents,
        createdById: userId,
      });
      setStartDate(""); setEndDate(""); setTitle(""); setDescription(""); setPriceDollars("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create slot.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel(slot: BookableSlot) {
    if (!confirm(`Cancel "${slot.title}"? It will no longer appear on /availability.`)) return;
    setBusyId(slot.id); setError(null);
    try   { await cancelBookableSlot(slot.id); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not cancel."); }
    finally { setBusyId(null); }
  }

  async function onDelete(slot: BookableSlot) {
    if (slot.status === "Sold") {
      setError("Sold slots can't be deleted \u2014 keep them for the audit trail.");
      return;
    }
    if (!confirm(`Permanently delete "${slot.title}"? This can't be undone.`)) return;
    setBusyId(slot.id); setError(null);
    try   { await deleteBookableSlot(slot.id); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete."); }
    finally { setBusyId(null); }
  }

  return (
    <section className="space-y-6">
      <header>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display text-2xl text-deep">Paid slots</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-sunset-coral/15 text-[#7A2F18] rounded-full px-2 py-0.5">
            Super user
          </span>
        </div>
        <p className="text-sm text-muted mt-1">
          Create and manage single-day events patrons can purchase. Open slots appear on the public{" "}
          <a href="/availability" className="text-mid hover:underline">availability page</a>.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-denied/40 bg-[#F4DAD0] px-3 py-2 text-sm text-[#7A2F18]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Open"    value={stats.open} />
        <Stat label="Sold"    value={stats.sold} />
        <Stat label="Revenue" value={"$" + stats.revenue.toLocaleString()} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submitSlot(); }}
        className="bg-white rounded-2xl border border-deep/10 shadow-soft p-5 space-y-3"
      >
        <h3 className="font-display text-deep">Create a new slot</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
              }}
              className={inputCls}
              required
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Price (USD, total)">
            <input
              type="number"
              min="1"
              step="1"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              className={inputCls}
              placeholder="450"
              required
            />
          </Field>
        </div>
        {startDate && endDate && (() => {
          const d0 = Date.parse(startDate);
          const d1 = Date.parse(endDate);
          if (!Number.isFinite(d0) || !Number.isFinite(d1) || d1 < d0) return null;
          const days = Math.round((d1 - d0) / 86400000) + 1;
          const avgLabel = priceDollars && days > 0
            ? " \u00b7 $" + Math.round(parseFloat(priceDollars) / days) + "/day avg"
            : "";
          return (
            <p className="text-xs text-muted -mt-1">
              {days === 1 ? "Single day" : days + " days"}{avgLabel}
            </p>
          );
        })()}
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="Independence Day Beach Party"
            required
          />
        </Field>
        <Field label="Description (shown on public page)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls + " min-h-[80px]"}
            placeholder="All-day cottage + private beach. Up to 30 guests."
          />
        </Field>
        <div className="text-right">
          <button
            type="submit"
            disabled={submitting}
            className="text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-soft transition hover:brightness-105 disabled:opacity-60"
            style={{ background: "linear-gradient(180deg, #F7B267, #E76F51)" }}
          >
            {submitting ? "Publishing\u2026" : "+ Publish slot"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-2xl border border-deep/10 shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-deep/5 bg-gradient-to-b from-white to-foam">
          <h3 className="font-display text-deep">Existing slots ({items.length})</h3>
        </div>
        {loading ? (
          <div className="text-center py-10 text-muted">
            <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-2" />
            <div className="text-sm">Loading\u2026</div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm">
            No slots yet. Create your first one above.
          </div>
        ) : (
          <ul className="divide-y divide-deep/5">
            {items.map((s) => (
              <SlotRow
                key={s.id}
                slot={s}
                busy={busyId === s.id}
                onCancel={() => onCancel(s)}
                onDelete={() => onDelete(s)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-deep/10 px-4 py-3 shadow-soft">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mid">{label}</div>
      <div className="font-display text-2xl text-deep mt-1">{value}</div>
    </div>
  );
}

function SlotRow({
  slot, busy, onCancel, onDelete,
}: {
  slot: BookableSlot;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const date = slot.startDate ? parseISO(slot.startDate) : null;
  const price = ((slot.priceCents ?? 0) / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });
  return (
    <li className="px-5 py-3 flex items-center gap-4 flex-wrap">
      <div className="bg-foam rounded-lg px-3 py-1.5 text-center min-w-[56px]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-mid">
          {date ? format(date, "MMM") : "\u2014"}
        </div>
        <div className="font-display text-xl text-deep leading-none">
          {date ? format(date, "d") : "?"}
        </div>
        <div className="text-[10px] text-muted">
          {date ? format(date, "yyyy") : ""}
        </div>
      </div>
      <div className="flex-1 min-w-[160px]">
        <div className="font-semibold text-deep">{slot.title}</div>
        {slot.description && (
          <div className="text-xs text-muted truncate max-w-md">{slot.description}</div>
        )}
      </div>
      <div className="font-display text-deep">{price}</div>
      <StatusPill status={slot.status ?? "Open"} />
      <div className="flex gap-1">
        {slot.status === "Open" && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-mid hover:bg-foam border border-deep/10 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {slot.status !== "Sold" && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="text-denied hover:bg-foam border border-deep/10 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "Open"     ? "bg-[#D8F0EC] text-[#1F7A6F]" :
    status === "Sold"     ? "bg-[#FCEACB] text-[#8a5a17]" :
    status === "Reserved" ? "bg-foam text-mid" :
                            "bg-[#F4DAD0] text-[#7A2F18]";
  return (
    <span className={"text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 " + cls}>
      {status}
    </span>
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
