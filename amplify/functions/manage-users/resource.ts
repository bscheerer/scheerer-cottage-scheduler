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
  // Sit in the data nested stack — this Lambda backs custom GraphQL ops, so
  // grouping it with data avoids a circular dependency on first deploy.
  resourceGroupName: "data",
});
