import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../lib/client";
import { format, parseISO } from "../lib/dates";
import type { Schema } from "../../amplify/data/resource";

type BookableSlot = Schema["BookableSlot"]["type"];

/**
 * Public landing page — accessible WITHOUT a Cognito session.
 *
 * Queries BookableSlot via the AppSync API key auth mode so anonymous
 * visitors can see open paid slots. Clicking "Book now" routes to /
 * which lands them in the Authenticator (sign-up flow).
 */
export default function Availability() {
  const [slots,   setSlots]   = useState<BookableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, errors } = await client.models.BookableSlot.list({
          authMode: "apiKey",
        });
        if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
        if (cancelled) return;
        const all = (data ?? []) as BookableSlot[];
        const open = all
          .filter((s) => s && s.status === "Open")
          .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
        setSlots(open);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAF3E3" }}>
      <PublicHeader />
      <main className="max-w-3xl w-full mx-auto px-6 py-8 flex-1">
        <div className="bg-white rounded-2xl border border-deep/10 shadow-soft p-8 mb-6 text-center">
          <h1 className="font-display text-3xl text-deep mb-2">
            Book a day at Scheerer Cottage
          </h1>
          <p className="text-muted text-sm leading-relaxed">
            Single-day Lake Michigan retreats hosted by the Scheerer family.
            Pick a date — create a free account to reserve and pay.
          </p>
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <div className="bg-white rounded-2xl border border-denied/40 p-6 text-center text-sm text-[#7A2F18]">
            Could not load availability right now.{" "}
            <button onClick={() => window.location.reload()} className="underline">
              Try again
            </button>
          </div>
        ) : slots.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3">
            {slots.map((s) => <SlotCard key={s.id} slot={s} />)}
          </div>
        )}

        <p className="text-center text-xs text-muted mt-8">
          Questions?{" "}
          <a href="mailto:scheduler@morben.net" className="text-mid hover:underline">
            scheduler@morben.net
          </a>
        </p>
      </main>
      <footer className="text-center text-xs text-muted py-6">
        Scheerer Cottage Scheduler  ©️2026 - All rights reserved
      </footer>
    </div>
  );
}

function PublicHeader() {
  return (
    <header
      className="text-white shadow-lift"
      style={{
        background: "linear-gradient(135deg, #0F2C40 0%, #1B4965 35%, #2C7DA0 65%, #F7B267 95%, #E76F51 100%)",
      }}
    >
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/40 flex items-center justify-center backdrop-blur">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <path d="M14 3 L25 24 H3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,.18)" />
              <path d="M11 24 V14 H17 V24" stroke="white" strokeWidth="1.6" fill="none" />
              <path d="M3 24 H25" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-xl leading-tight">Scheerer Cottage Scheduler</h1>
            <p className="text-xs text-white/80">Lake Michigan · book a day</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="bg-white/15 hover:bg-white/25 transition border border-white/35 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Sign in
          </Link>
          <Link
            to="/"
            className="text-white text-xs font-semibold rounded-lg px-3 py-1.5 shadow-soft"
            style={{ background: "#E76F51" }}
          >
            Create account
          </Link>
        </div>
      </div>
    </header>
  );
}

function SlotCard({ slot }: { slot: BookableSlot }) {
  const date = slot.startDate ? parseISO(slot.startDate) : null;
  const price = ((slot.priceCents ?? 0) / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });
  return (
    <div className="bg-white rounded-2xl border border-deep/10 shadow-soft p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
      <div className="bg-foam rounded-xl px-3 py-2 text-center min-w-[64px] flex-shrink-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-mid">
          {date ? format(date, "MMM") : "—"}
        </div>
        <div className="font-display text-2xl text-deep leading-none">
          {date ? format(date, "d") : "?"}
        </div>
        <div className="text-[10px] text-muted">
          {date ? format(date, "yyyy") : ""}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-deep">{slot.title}</h3>
        {slot.description && (
          <p className="text-sm text-muted leading-snug mt-1">{slot.description}</p>
        )}
      </div>
      <div className="text-right ml-auto">
        <div className="font-display text-xl text-deep">{price}</div>
        <Link
          to="/"
          className="inline-block mt-1 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-soft"
          style={{ background: "#E76F51" }}
        >
          Book now →
        </Link>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="text-center py-10 text-muted">
      <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-2" />
      <div>Loading available dates…</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-deep/10 shadow-soft p-10 text-center">
      <p className="text-deep font-semibold mb-2">No open dates right now.</p>
      <p className="text-sm text-muted mb-4">
        Check back soon, or sign in if you already have an account.
      </p>
      <Link
        to="/"
        className="inline-block text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-soft"
        style={{ background: "#E76F51" }}
      >
        Sign in
      </Link>
    </div>
  );
}
