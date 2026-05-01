import { defineFunction } from "@aws-amplify/backend";

/**
 * Lambda backing the email-notification GraphQL mutations:
 *   - notifyRequestCreated  (callable by any signed-in user when they
 *     submit a request — emails the requester + all admins/super-users)
 *   - notifyRequestDecided  (callable by admins after approve/deny —
 *     emails the requester)
 *
 * Permissions, env vars, and the SES sender identity are wired up in
 * amplify/backend.ts.
 *
 * Lives in the data resource group to share the AppSync nested stack and
 * avoid a circular dependency with the auth/data stacks (same pattern as
 * manage-users from Phase 4).
 */
export const sendEmails = defineFunction({
  name: "send-emails",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  resourceGroupName: "data",
});
