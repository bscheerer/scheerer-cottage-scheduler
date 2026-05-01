import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { signOut } from "aws-amplify/auth";
import { Role, roleLabel } from "../lib/auth";
import { useIdentity } from "../lib/identity";

interface Props {
  role: Role;
}

/**
 * Top brand bar — water + sunset gradient, role-aware navigation, signed-in
 * user's avatar (their chosen lake emoji, or their initials), and a quick
 * link to Settings.
 */
export default function BrandBar({ role }: Props) {
  const { picture, label, email } = useIdentity();
  const isAdmin = role === "Admin" || role === "SuperUser";
  const isSuper = role === "SuperUser";
  const initials = (label || email || "?").slice(0, 2).toUpperCase();

  return (
    <header
      className="text-white shadow-lift"
      style={{
        background:
          "linear-gradient(135deg, #0F2C40 0%, #1B4965 35%, #2C7DA0 65%, #F7B267 95%, #E76F51 100%)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/40 flex items-center justify-center backdrop-blur">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <path d="M14 3 L25 24 H3 Z" stroke="white" strokeWidth="2"
                strokeLinejoin="round" fill="rgba(255,255,255,.18)" />
              <path d="M11 24 V14 H17 V24" stroke="white" strokeWidth="1.6" fill="none" />
              <path d="M3 24 H25" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-xl leading-tight">Scheerer Cottage Scheduler</h1>
            <p className="text-xs text-white/80">Lake Michigan · family booking calendar</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 text-sm">
          <NavItem to="/calendar">Calendar</NavItem>
          <NavItem to="/my-requests">My requests</NavItem>
          {isAdmin && <NavItem to="/queue">Queue</NavItem>}
          {isSuper && <NavItem to="/users">Users</NavItem>}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-block bg-white/15 border border-white/35 rounded-full px-3 py-1 text-xs font-semibold tracking-wide">
            {roleLabel(role)}
          </span>
          {/* Avatar links to Settings */}
          <Link
            to="/settings"
            title="Settings"
            aria-label="Settings"
            className="rounded-full transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            {picture ? (
              <span className="w-9 h-9 rounded-full bg-white/15 border-2 border-white/50 flex items-center justify-center text-xl leading-none">
                <span aria-hidden>{picture}</span>
              </span>
            ) : (
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-sunset-amber to-sunset-coral text-white font-bold text-sm flex items-center justify-center border-2 border-white/50">
                {initials}
              </span>
            )}
          </Link>
          <button
            onClick={() => signOut()}
            className="bg-white/10 hover:bg-white/20 transition rounded-lg px-3 py-1.5 text-xs font-semibold border border-white/30"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "px-3 py-1.5 rounded-lg transition",
          isActive ? "bg-white/20 font-semibold" : "hover:bg-white/10",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
