import { defineAuth } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource";

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
  userAttributes: {
    email: { required: true, mutable: false },
    preferredUsername: { required: false, mutable: true },
    profilePicture: { required: false, mutable: true },
  },
  groups: ["SuperUser", "Admin", "Viewer"],
  triggers: {
    postConfirmation,
  },
});
