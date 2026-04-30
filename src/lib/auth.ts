import { useEffect, useState } from "react";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

export type Role = "SuperUser" | "Admin" | "Viewer" | "Unknown";

/**
 * Returns the current user's role, derived from their Cognito group membership.
 *
 * The Cognito JWT exposes `cognito:groups` once a user has been added to one or
 * more groups. We resolve the strongest group present, in priority order.
 *
 * NOTE: Group assignment is the source of truth for authorization, both client-
 * and server-side (AppSync @auth rules check the same JWT claim).
 */
export function useCurrentRole(): Role {
  const [role, setRole] = useState<Role>("Unknown");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getCurrentUser();
        const session = await fetchAuthSession();
        const groupsClaim = session.tokens?.idToken?.payload["cognito:groups"];
        const groups: string[] = Array.isArray(groupsClaim)
          ? (groupsClaim as string[])
          : [];

        const resolved: Role = groups.includes("SuperUser")
          ? "SuperUser"
          : groups.includes("Admin")
          ? "Admin"
          : groups.includes("Viewer")
          ? "Viewer"
          : "Unknown";

        if (!cancelled) setRole(resolved);
      } catch {
        if (!cancelled) setRole("Unknown");
      }
    })();
    return () => {
      cancelled = true;
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
    default:          return "Pending role";
  }
}
