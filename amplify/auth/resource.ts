import { defineAuth } from "@aws-amplify/backend";

/**
 * Cognito user pool for the Scheerer Cottage Scheduler.
 *
 * Three groups model the role system from the design plan:
 *   - SuperUser  : Ben (and any successor). Full control, manages roles.
 *   - Admin      : Approves/denies requests, edits reservations.
 *   - Viewer     : Sees the calendar, submits date requests.
 *
 * After the first deploy you will need to:
 *   1. Sign up your own account from the app's sign-in page.
 *   2. Open the AWS Cognito console, find this user pool, find your user,
 *      and add it to the "SuperUser" group. (One-time bootstrap.)
 *   3. From then on, you can promote/demote others from the Users & Roles
 *      page in the app.
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
  // The default group new sign-ups land in. SuperUser must be added manually
  // by an existing super user (or via the Cognito console for the very first one).
  // Amplify Gen 2 does not auto-assign groups, so we add a post-confirmation
  // trigger in a later phase. For now, viewers must be invited by the super user.
});
