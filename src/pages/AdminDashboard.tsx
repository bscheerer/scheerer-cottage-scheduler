import { type ReactNode, useMemo, useState } from "react";
import { format, parseISO } from "../lib/dates";
import { useReservations, useRequests } from "../lib/data";
import Avatar from "../components/Avatar";

type Period = "season" | "year" | "all";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getInitials(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  if (!t) return "?";
  const parts = t.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0][0] ?? "";
    const last  = parts[parts.length - 1][0] ?? "";
    const combo = (first + last).toUpperCase();
    if (combo) return combo;
  }
  return t.slice(0, 2).toUpperCase();
}

/** Inclusive day count between two ISO date strings (1 day for same-day). */
function daysBetweenISO(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const ms = parseISO(endISO).getTime() - parseISO(startISO).getTime();
  return Math.max(0, Math.round(ms / 86400000)) + 1;
}

function inPeriod(startISO: string | null | undefined, period: Period, now: Date): boolean {
  if (!startISO) return false;
  if (period === "all") return true;
  const dt = parseISO(startISO);
  if (period === "season") return dt.getFullYear() === now.getFullYear();
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return dt >= cutoff;
}

function formatDateRange(startISO: string, endISO: string): string {
  if (!startISO || !endISO) return "\u2014";
  const s = parseISO(startISO);
  const e = parseISO(endISO);
  if (startISO === endISO) return format(s, "MMM d, yyyy");
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return format(s, "MMM d") + " \u2013 " + format(e, "d, yyyy");
  }
  return format(s, "MMM d") + " \u2013 " + format(e, "MMM d, yyyy");
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Super User-only operations dashboard. Aggregates reservation + request
 * data into KPIs, per-user day tallies, per-Cottage-Elder sponsor tallies,
 * and a sortable activity table. Period filter at the top scopes everything
 * to the current season, the last 12 months, or all time.
 */
export default function AdminDashboard() {
  const { items: reservations, loading: lr } = useReservations();
  const { items: requests, loading: lq }     = useRequests();
  const [period, setPeriod] = useState<Period>("season");

  const now  = new Date();
  const year = now.getFullYear();
  const loading = lr || lq;

  const filteredReservations = useMemo(
    () => reservations.filter((r) => inPeriod(r.startDate, period, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reservations, period]
  );
  const filteredRequests = useMemo(
    () => requests.filter((r) => inPeriod(r.startDate, period, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requests, period]
  );
  const pendingRequests = useMemo(
    () => filteredRequests.filter((r) => r.status === "Pending"),
    [filteredRequests]
  );

  const totalDays = useMemo(
    () => filteredReservations.reduce(
      (sum, r) => sum + daysBetweenISO(r.startDate ?? "", r.endDate ?? ""),
      0
    ),
    [filteredReservations]
  );

  // Days per user — keyed off partyName (the user-facing label that already
  // appears on the calendar). Pending requests contribute to a "pending" tally
  // so the same family rolls up cleanly across both buckets.
  const daysPerUser = useMemo(() => {
    type Entry = { name: string; emoji: string; approved: number; pending: number; stays: number };
    const map = new Map<string, Entry>();
    const ensure = (name: string, emoji: string): Entry => {
      const key = name.trim() || "Unknown";
      let entry = map.get(key);
      if (!entry) {
        entry = { name: key, emoji: "", approved: 0, pending: 0, stays: 0 };
        map.set(key, entry);
      }
      if (!entry.emoji && emoji) entry.emoji = emoji;
      return entry;
    };
    for (const r of filteredReservations) {
      const entry = ensure(r.partyName ?? "", r.partyEmoji ?? "");
      entry.approved += daysBetweenISO(r.startDate ?? "", r.endDate ?? "");
      entry.stays   += 1;
    }
    for (const r of pendingRequests) {
      const entry = ensure(r.partyName ?? "", r.requesterEmoji ?? "");
      entry.pending += daysBetweenISO(r.startDate ?? "", r.endDate ?? "");
    }
    return Array.from(map.values()).sort(
      (a, b) => (b.approved + b.pending) - (a.approved + a.pending)
    );
  }, [filteredReservations, pendingRequests]);

  // Days by Cottage Elder — a stay is counted once per elder, so totals across
  // elders may exceed the Days-booked KPI (noted in the card footer).
  const daysPerElder = useMemo(() => {
    const map = new Map<string, { name: string; days: number; stays: number }>();
    for (const r of filteredReservations) {
      const days = daysBetweenISO(r.startDate ?? "", r.endDate ?? "");
      const sponsors = (r.sponsors ?? []).filter((s): s is string => Boolean(s));
      for (const sponsor of sponsors) {
        const entry = map.get(sponsor) ?? { name: sponsor, days: 0, stays: 0 };
        entry.days  += days;
        entry.stays += 1;
        map.set(sponsor, entry);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.days - a.days);
  }, [filteredReservations]);

  type ActivityRow = {
    key: string;
    sortKey: string;
    dates: string;
    partyName: string;
    status: string;
    sponsors: string[];
  };
  const activityRows: ActivityRow[] = useMemo(() => {
    const rows: ActivityRow[] = [];
    for (const r of filteredReservations) {
      rows.push({
        key: "R-" + r.id,
        sortKey: r.startDate ?? "",
        dates: formatDateRange(r.startDate ?? "", r.endDate ?? ""),
        partyName: r.partyName ?? "Reserved",
        status: "Approved",
        sponsors: (r.sponsors ?? []).filter((s): s is string => Boolean(s)),
      });
    }
    for (const r of filteredRequests) {
      if (r.status === "Approved") continue; // already represented by Reservation
      rows.push({
        key: "Q-" + r.id,
        sortKey: r.startDate ?? "",
        dates: formatDateRange(r.startDate ?? "", r.endDate ?? ""),
        partyName: r.partyName ?? "\u2014",
        status: r.status ?? "Pending",
        sponsors: (r.sponsors ?? []).filter((s): s is string => Boolean(s)),
      });
    }
    rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return rows;
  }, [filteredReservations, filteredRequests]);

  const activeFamilies = daysPerUser.length;
  const maxUserDays  = Math.max(1, ...daysPerUser.map((u) => u.approved + u.pending));
  const maxElderDays = Math.max(1, ...daysPerElder.map((e) => e.days));

  const periodLabel =
    period === "season" ? year + " season" :
    period === "year"   ? "Last 12 months" : "All time";

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-2xl text-deep">Administrator dashboard</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-sunset-coral/15 text-[#7A2F18] rounded-full px-2 py-0.5">
              Super user
            </span>
          </div>
          <p className="text-sm text-muted mt-1">
            Reservation activity, days per family, and Cottage Elder sponsor totals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-mid">Period</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="border border-deep/15 rounded-lg px-2 py-1.5 bg-white text-sm font-semibold text-deep"
          >
            <option value="season">{year} season</option>
            <option value="year">Last 12 months</option>
            <option value="all">All time</option>
          </select>
        </div>
      </header>

      {loading ? (
        <div className="text-center py-16 text-muted">
          <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-2" />
          <div className="text-sm">Loading reservations\u2026</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Approved stays"   value={filteredReservations.length} />
            <Kpi label="Days booked"      value={totalDays} />
            <Kpi label="Pending requests" value={pendingRequests.length} tone="warn" />
            <Kpi label="Active families"  value={activeFamilies} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <BarCard title="Days per user" subtitle={periodLabel}>
              {daysPerUser.length === 0 ? (
                <EmptyRow>No reservations or pending requests yet.</EmptyRow>
              ) : daysPerUser.map((u) => (
                <BarRow
                  key={u.name}
                  emoji={u.emoji}
                  initials={getInitials(u.name)}
                  title={u.name}
                  subtitle={u.stays + " stay" + (u.stays === 1 ? "" : "s") + (u.pending ? " \u00b7 " + u.pending + "d pending" : "")}
                  value={u.approved + u.pending}
                  max={maxUserDays}
                  accent={u.approved ? "blue" : "amber"}
                />
              ))}
            </BarCard>

            <BarCard title="Days by Cottage Elder" subtitle="Sponsorships">
              {daysPerElder.length === 0 ? (
                <EmptyRow>No sponsored stays yet.</EmptyRow>
              ) : (
                <>
                  {daysPerElder.map((e) => (
                    <BarRow
                      key={e.name}
                      initials={getInitials(e.name)}
                      title={e.name}
                      subtitle={e.stays + " stay" + (e.stays === 1 ? "" : "s") + " sponsored"}
                      value={e.days}
                      max={maxElderDays}
                      accent="blue"
                    />
                  ))}
                  <p className="px-5 py-2.5 text-[11px] text-muted border-t border-deep/5 leading-relaxed">
                    A stay can have multiple elders, so totals across elders may exceed the Days-booked KPI.
                  </p>
                </>
              )}
            </BarCard>
          </div>

          <div className="bg-white rounded-2xl border border-deep/10 shadow-soft overflow-hidden">
            <div className="px-5 py-3 border-b border-deep/5 bg-gradient-to-b from-white to-foam flex items-center justify-between">
              <h3 className="font-display text-deep">All requests &amp; reservations</h3>
              <span className="text-xs text-muted">{activityRows.length} total</span>
            </div>
            {activityRows.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted">No activity in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-foam text-[11px] tracking-widest uppercase font-bold text-muted">
                      <th className="text-left px-4 py-2.5">Dates</th>
                      <th className="text-left px-4 py-2.5">Party</th>
                      <th className="text-left px-4 py-2.5">Status</th>
                      <th className="text-left px-4 py-2.5">Sponsors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityRows.map((row) => (
                      <tr key={row.key} className="border-t border-deep/5">
                        <td className="px-4 py-2.5 whitespace-nowrap">{row.dates}</td>
                        <td className="px-4 py-2.5 font-semibold text-deep">{row.partyName}</td>
                        <td className="px-4 py-2.5"><StatusPill status={row.status} /></td>
                        <td className="px-4 py-2.5 text-muted">{row.sponsors.join(", ") || "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return (
    <div className="bg-white rounded-xl border border-deep/10 px-4 py-3 shadow-soft">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mid">{label}</div>
      <div className={["font-display text-2xl mt-1", tone === "warn" ? "text-[#8a5a17]" : "text-deep"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function BarCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-deep/10 shadow-soft overflow-hidden">
      <div className="px-5 py-3 border-b border-deep/5 bg-gradient-to-b from-white to-foam flex items-center justify-between">
        <h3 className="font-display text-deep">{title}</h3>
        <span className="text-xs text-muted">{subtitle}</span>
      </div>
      <div className="divide-y divide-deep/5">{children}</div>
    </div>
  );
}

function BarRow({
  emoji, initials, title, subtitle, value, max, accent,
}: {
  emoji?: string;
  initials: string;
  title: string;
  subtitle: string;
  value: number;
  max: number;
  accent: "blue" | "amber";
}) {
  const pct = Math.max(2, Math.round((value / max) * 100));
  const barClass = accent === "amber"
    ? "bg-gradient-to-r from-sunset-amber to-sunset-coral"
    : "bg-gradient-to-r from-aqua to-mid";
  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <Avatar picture={emoji ?? ""} fallbackInitials={initials} size={32} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-deep text-sm truncate">{title}</div>
        <div className="text-[11px] text-muted truncate">{subtitle}</div>
      </div>
      <div className="flex-[1.2] min-w-[60px] h-2 bg-foam rounded-full overflow-hidden">
        <div className={"h-full rounded-full " + barClass} style={{ width: pct + "%" }} />
      </div>
      <div className="font-display text-deep font-semibold text-[15px] min-w-[28px] text-right">{value}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <div className="px-5 py-6 text-center text-sm text-muted">{children}</div>;
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "Approved" ? "bg-[#D8F0EC] text-[#1F7A6F]" :
    status === "Pending"  ? "bg-[#FCEACB] text-[#8a5a17]" :
    status === "Denied"   ? "bg-[#F4DAD0] text-[#7A2F18]" :
                            "bg-foam text-muted";
  return (
    <span className={"text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 " + cls}>
      {status}
    </span>
  );
}
