import { useEffect, useState } from "react";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

export interface Identity {
  /** Cognito user `sub` — stable unique ID. */
  userId: string | null;
  /** Username (email, in our pool). */
  username: string | null;
  /** Display label for UI. */
  label: string | null;
  /** True until the first auth check completes. */
  loading: boolean;
}

/**
 * Hook for the currently signed-in user's identity. Returns Cognito sub,
 * username, and a friendly label. Used to filter "my requests" and stamp
 * `requesterId` on new Request rows.
 */
export function useIdentity(): Identity {
  const [state, setState] = useState<Identity>({
    userId: null, username: null, label: null, loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getCurrentUser();
        const session = await fetchAuthSession();
        const claims = session.tokens?.idToken?.payload ?? {};
        const preferred = (claims["preferred_username"] as string) || undefined;
        const email     = (claims["email"] as string) || user.signInDetails?.loginId || user.username;
        if (!cancelled) {
          setState({
            userId:   user.userId,
            username: user.username,
            label:    preferred || email || user.username,
            loading:  false,
          });
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
