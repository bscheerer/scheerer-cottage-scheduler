import { defineFunction } from "@aws-amplify/backend";

/**
 * Lambda backing the Super User-only user-management GraphQL operations.
 * Performs Cognito admin actions: list users, change role (group membership),
 * invite (create user + auto-send default email), and remove (disable user).
 *
 * Permissions and the USER_POOL_ID environment variable are wired up in
 * amplify/backend.ts.
 */
export const manageUsers = defineFunction({
  name: "manage-users",
  entry: "./handler.ts",
  timeoutSeconds: 20,
});
