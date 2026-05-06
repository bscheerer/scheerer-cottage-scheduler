import { defineAuth } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource";

/**
 * Same sender as the reservation `send-emails` Lambda (`COTTAGE_FROM_EMAIL` in
 * Amplify Hosting). Must already be a verified SES identity in your backend
 * region before Cognito can send sign-up / forgot-password mail through SES.
 * Optional: set `COGNITO_FROM_EMAIL` to use a different verified address.
 */
const cognitoSesFromEmail =
  process.env.COTTAGE_FROM_EMAIL?.trim() ||
  process.env.COGNITO_FROM_EMAIL?.trim() ||
  "";

/**
 * Cognito user pool for the Scheerer Cottage Scheduler.
 *
 * Three groups model the role system from the design plan:
 *   - SuperUser  : Ben (and any successor). Full control, manages roles.
 *   - Admin      : Approves/denies requests, edits reservations.
 *   - Viewer     : Sees the calendar, submits date requests.
 *
 * Phase 4 wires up a post-confirmation trigger that auto-adds new sign-ups
 * to the Viewer group, so the only manual step ever needed is the very
 * first promotion to SuperUser (done once, via Cognito console).
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  ...(cognitoSesFromEmail
    ? {
        senders: {
          email: {
            fromEmail: cognitoSesFromEmail,
            fromName: "Scheerer Cottage",
          },
        },
      }
    : {}),
  userAttributes: {
    email: { required: true, mutable: false },
    preferredUsername: { required: false, mutable: true },
    profilePicture: { required: false, mutable: true },
    // NOTE: phone is stored as the custom attribute `custom:phone`, added to
    // the user pool via a one-time CLI command (see PHASE5.md). Cognito does
    // not allow adding *standard* attributes to an existing pool, but it does
    // allow adding custom ones. The custom attribute lives in the pool but is
    // intentionally not declared here — declaring it would trigger a Cognito
    // schema-update that's also disallowed for existing pools.
  },
  groups: ["SuperUser", "Admin", "Viewer"],
  triggers: {
    postConfirmation,
  },
});
