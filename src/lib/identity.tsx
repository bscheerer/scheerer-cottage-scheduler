import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import { fetchUserAttributes, getCurrentUser } from "aws-amplify/auth";

export interface Identity {
  /** Cognito `sub` — stable unique ID. */
  userId: string | null;
  /** Cognito username (email, in our pool). */
  username: string | null;
  /** Cognito `email` attribute (read-only). */
  email: string | null;
  /** Cognito `preferred_username` attribute (editable in Settings). */
  preferredUsername: string | null;
  /** Cognito `picture` attribute — we store an emoji or empty string. */
  picture: string | null;
  /** Cognito `phone_number` attribute in E.164 form, e.g. "+12125551234". */
  phoneNumber: string | null;
  /** Best display label: preferred_username || email. */
  label: string | null;
  /** True until the first auth check completes. */
  loading: boolean;
}

interface IdentityValue extends Identity {
  /** Re-pull attributes from Cognito. Call after Settings save. */
  refetch: () => Promise<void>;
}

const IdentityContext = createContext<IdentityValue | null>(null);

const EMPTY: Identity = {
  userId: null, username: null, email: null,
  preferredUsername: null, picture: null, phoneNumber: null,
  label: null, loading: true,
};

/**
 * App-level Identity provider. Wrap the signed-in app with this so the
 * BrandBar avatar / Settings page / RequestModal etc. all share the same
 * Cognito attribute snapshot — and a Settings save instantly updates the
 * BrandBar without a page reload.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Identity>(EMPTY);

  const refetch = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      const preferredUsername = attrs.preferred_username ?? null;
      const email             = attrs.email ?? user.signInDetails?.loginId ?? user.username ?? null;
      const picture           = attrs.picture ?? null;
      // Stored as a custom attribute (added to the pool out-of-band — see
      // amplify/auth/resource.ts).
      const phoneNumber       = (attrs as Record<string, string | undefined>)["custom:phone"] ?? null;
      setState({
        userId:            user.userId,
        username:          user.username,
        email,
        preferredUsername,
        picture,
        phoneNumber,
        label:             preferredUsername || email || user.username,
        loading:           false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const value = useMemo<IdentityValue>(() => ({ ...state, refetch }), [state, refetch]);
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    // Convenience fallback: outside a Provider (e.g. during sign-in screen)
    // return a sane default so consumers don't crash.
    return { ...EMPTY, refetch: async () => undefined };
  }
  return ctx;
}
