import { type ReactNode, useEffect, useState } from "react";
import {
  listFamilyUsers, changeUserRole, deleteFamilyUser, resendInvite,
  type FamilyUser, type Role,
} from "../lib/users";
import { useIdentity } from "../lib/identity";
import { useAuditFeed } from "../lib/audit";
import { format, parseISO } from "../lib/dates";

const ROLES: Role[] = ["SuperUser", "Admin", "Viewer"];

const STATUS_BADGE: Record<string, string> = {
  CONFIRMED:           "bg-[#D8F0EC] text-[#1F7A6F]",
  FORCE_CHANGE_PASSWORD: "bg-[#FCEACB] text-[#8a5a17]",
  RESET_REQUIRED:      "bg-[#FCEACB] text-[#8a5a17]",
  UNCONFIRMED:         "bg-foam text-muted",
};

/**
 * Super User-only Users & Roles page. Reads users live from Cognito via the
 * manage-users Lambda, lets the SuperUser change roles, delete accounts, and
 * resend confirmation emails to stuck users. New accounts come from the
 * sign-in screen's "Create Account" tab (or admin-create-user via CLI).
 * Audit feed at the bottom shows recent actions across the whole app.
 */
export default function UsersAndRoles() {
  const { userId, label } = useIdentity();
  const [users, setUsers]     = useState<FamilyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busyUsername, setBusy] = useState<string | null>(null);

  const { items: audit, loading: auditLoading } = useAuditFeed(20);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listFamilyUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onRoleChange(u: FamilyUser, next: Role) {
    if (!userId || u.role === next) return;
    setBusy(u.username);
    setError(null);
    try {
      await changeUserRole(u.username, next, userId, label ?? undefined, u.role);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role change failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(u: FamilyUser) {
    if (!userId) return;
    if (u.username === userId || u.role === "SuperUser") {
      setError("You can't delete a super user (or yourself) from this screen.");
      return;
    }
    if (!confirm(
      `Permanently delete ${u.displayName} (${u.email})?\n\n` +
      `This removes their account from Cognito. Their existing reservations and ` +
      `audit-log entries stay, but they'll need to register again to come back.`
    )) return;
    setBusy(u.username);
    setError(null);
    try {
      await deleteFamilyUser(u.username, userId, label ?? undefined);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setBusy(null);
    }
  }

  async function onResend(u: FamilyUser) {
    if (!userId) return;
    setBusy(u.username);
    setError(null);
    try {
      await resendInvite(u.username, userId, label ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend invite.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl text-deep">Users & roles</h2>
          <p className="text-sm text-muted mt-1">
            Manage who can see, request, and approve. Super User only.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="text-mid hover:bg-foam border border-deep/15 rounded-lg px-3 py-2 text-sm font-semibold transition"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-denied/40 bg-[#F4DAD0] px-3 py-2 text-sm text-[#7A2F18]">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-deep/10 shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-deep/5 bg-gradient-to-b from-white to-foam">
          <h3 className="font-display text-deep">Family members ({users.length})</h3>
        </div>
        {loading ? (
          <div className="text-center py-12 text-muted">
            <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-2" />
            <div className="text-sm">Loading users…</div>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm">No users yet.</div>
        ) : (
          <ul className="divide-y divide-deep/5">
            {users.map((u) => {
              const isSelf = u.username === userId;
              return (
                <li key={u.username} className="px-5 py-3 flex flex-wrap items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-mid to-deep text-white flex items-center justify-center font-bold text-sm">
                    {(u.displayName || u.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold text-deep">
                      {u.displayName} {isSelf && <span className="text-xs text-mid font-normal">(you)</span>}
                    </div>
                    <div className="text-sm text-muted">{u.email}</div>
                  </div>
                  <select
                    value={u.role ?? ""}
                    onChange={(e) => onRoleChange(u, e.target.value as Role)}
                    disabled={busyUsername === u.username || isSelf}
                    className="border border-deep/15 rounded-lg px-2 py-1.5 bg-white text-sm font-semibold text-deep disabled:opacity-60"
                    title={isSelf ? "You can't change your own role" : ""}
                  >
                    {!u.role && <option value="">— pending —</option>}
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <span className={[
                    "text-[11px] font-bold tracking-wide rounded-full px-2 py-0.5 uppercase",
                    !u.enabled ? "bg-foam text-muted" : (STATUS_BADGE[u.status] ?? "bg-foam text-muted"),
                  ].join(" ")}>
                    {!u.enabled ? "Disabled" : u.status.replace(/_/g, " ")}
                  </span>
                  {/* Resend invite — only meaningful for users that haven't
                      finished setting up their account. */}
                  {(u.status === "FORCE_CHANGE_PASSWORD" || u.status === "UNCONFIRMED" || u.status === "RESET_REQUIRED") && (
                    <button
                      onClick={() => onResend(u)}
                      disabled={busyUsername === u.username}
                      title="Resend invitation / verification email"
                      className="text-mid hover:bg-foam border border-deep/10 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {busyUsername === u.username ? "…" : "Resend invite"}
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(u)}
                    disabled={busyUsername === u.username || isSelf || u.role === "SuperUser"}
                    className="text-denied hover:bg-foam border border-deep/10 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Audit feed */}
      <div className="bg-white rounded-2xl border border-deep/10 shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-deep/5 bg-gradient-to-b from-white to-foam">
          <h3 className="font-display text-deep">Activity log</h3>
        </div>
        {auditLoading ? (
          <div className="text-center py-8 text-sm text-muted">Loading…</div>
        ) : audit.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted">Nothing logged yet.</div>
        ) : (
          <ul className="divide-y divide-deep/5">
            {audit.map((a) => (
              <li key={a.id} className="px-5 py-2.5 flex items-start gap-3 text-sm">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-aqua mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-ink">
                    <span className="font-semibold text-deep">{a.actorLabel ?? a.actorId.slice(0, 8)}</span>{" "}
                    <span className="text-muted">·</span>{" "}
                    <span className="text-mid font-medium">{a.action}</span>
                    {a.summary && <> <span className="text-muted">—</span> {a.summary}</>}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {a.timestamp ? format(parseISO(a.timestamp), "MMM d, yyyy h:mm a") : ""}
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
