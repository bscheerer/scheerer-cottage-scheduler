import { defineFunction } from "@aws-amplify/backend";

/**
 * Post-confirmation Cognito trigger.
 *
 * Fires the moment a user verifies their email after sign-up. Adds them to
 * the Viewer group automatically so they have a useful default role from
 * the very first sign-in. Super Users can later promote them via the
 * Users & Roles page.
 *
 * Wired up in amplify/auth/resource.ts via the `triggers.postConfirmation`
 * option, and granted Cognito permissions in amplify/backend.ts.
 */
export const postConfirmation = defineFunction({
  name: "post-confirmation",
  entry: "./handler.ts",
  timeoutSeconds: 10,
});
