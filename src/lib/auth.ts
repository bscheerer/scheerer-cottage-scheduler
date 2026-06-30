import { useEffect, useState } from "react";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

export type Role = "SuperUser" | "Admin" | "Viewer" | "Patron" | "Unknown";

function normalizeGroupToken(g: string): string {
  return g.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Map JWT group names to app roles. Supports common console typos / aliases
 * (e.g. "Super Admin"); AppSync rules still use the exact pool group names.
 */
function resolveRoleFromGroups(groups: string[]): Role {
  const normalized = groups.map(normalizeGroupToken);
  const superNames = new Set(["superuser", "super user", "super admin", "superadmin"]);
  const adminNames = new Set(["admin", "administrator"]);
  if (normalized.some((g) => superNames.has(g))) return "SuperUser";
  if (normalized.some((g) => adminNames.has(g))) return "Admin";
  if (normalized.some((g) => g === "viewer")) return "Viewer";
  return "Unknown";
}

/**
 * Returns the current user's role, derived from their Cognito group membership.
 *
 * The Cognito JWT exposes `cognito:groups` once a user has been added to one or
 * more groups. We resolve the strongest group present, in priority order.
 *
 * Re-evaluates on sign-in, sign-out, and token refresh so new group membership
 * is picked up without a full page reload.
 *
 * NOTE: Group assignment is the source of truth for authorization, both client-
 * and server-side (AppSync @auth rules check the same JWT claim).
 */
export function useCurrentRole(): Role {
  const [role, setRole] = useState<Role>("Unknown");

  useEffect(() => {
    let cancelled = false;

    const refresh = async (forceRefresh = false) => {
      try {
        await getCurrentUser();
        const session = await fetchAuthSession({ forceRefresh });
        const groupsClaim = session.tokens?.idToken?.payload["cognito:groups"];
        const groups: string[] = Array.isArray(groupsClaim)
          ? (groupsClaim as string[])
          : [];

        const resolved = resolveRoleFromGroups(groups);
        if (!cancelled) setRole(resolved);
      } catch {
        if (!cancelled) setRole("Unknown");
      }
    };

    void refresh();

    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      const e = payload.event;
      if (e === "signedOut") {
        if (!cancelled) setRole("Unknown");
        return;
      }
      if (e === "signedIn") void refresh(true);
      else if (e === "tokenRefresh") void refresh(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return role;
}

/** Returns a friendly human-readable role label. */
export function roleLabel(role: Role): string {
  switch (role) {
    case "SuperUser": return "Super User";
    case "Admin":     return "Administrator";
    case "Viewer":    return "Viewer";
    case "Patron":    return "Patron";
    default:          return "Pending role";
  }
}
