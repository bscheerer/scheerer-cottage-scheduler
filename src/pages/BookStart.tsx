import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { client } from "../lib/client";

/**
 * Transition page that runs the moment a signed-in user lands here.
 * Calls createCheckoutSession({ slotId }) and redirects to the Stripe
 * Checkout URL. If the user wasn't signed in, the Authenticator handled
 * sign-in first; by the time this renders, they're authenticated.
 */
export default function BookStart() {
  const [params] = useSearchParams();
  const slotId = params.get("slotId");
  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState(true);

  useEffect(() => {
    if (!slotId) { setError("Missing slot ID."); setBusy(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, errors } = await client.mutations.createCheckoutSession({ slotId });
        if (errors?.length) throw new Error(errors[0].message);
        if (cancelled) return;
        if (data?.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        throw new Error("No checkout URL returned.");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not start checkout.");
        setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slotId]);

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl border border-deep/10 shadow-soft p-10 text-center">
      {busy && !error ? (
        <>
          <div className="inline-block w-8 h-8 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-4" />
          <p className="font-display text-xl text-deep mb-2">Setting up your booking\u2026</p>
          <p className="text-sm text-muted">You'll be redirected to Stripe in a moment.</p>
        </>
      ) : (
        <>
          <p className="font-display text-xl text-denied mb-2">Couldn't start checkout</p>
          <p className="text-sm text-muted mb-4">{error}</p>
          <Link to="/availability" className="text-mid underline">Back to available dates</Link>
        </>
      )}
    </div>
  );
}
