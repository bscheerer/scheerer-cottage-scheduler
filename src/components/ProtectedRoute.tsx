import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Role } from "../lib/auth";

interface Props {
  role: Role;
  allow: Role[];
  children: ReactNode;
}

/**
 * Renders children only if the current user's role is in the allow list.
 * Otherwise sends them back to the calendar (which everyone can see).
 *
 * NOTE: This is UI gating only. The real authorization is enforced by
 * AppSync @auth rules in amplify/data/resource.ts — a malicious client
 * cannot bypass these by editing the front-end.
 */
export default function ProtectedRoute({ role, allow, children }: Props) {
  if (role === "Unknown") {
    return (
      <div className="text-center py-16 text-muted">Checking your access…</div>
    );
  }
  if (!allow.includes(role)) {
    return <Navigate to="/calendar" replace />;
  }
  return <>{children}</>;
}
