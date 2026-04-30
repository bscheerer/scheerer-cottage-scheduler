import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";

/**
 * Scheerer Cottage Scheduler — Amplify Gen 2 backend entrypoint.
 *
 * This is the only file that wires resources together. Each resource is
 * defined in its own folder (auth/, data/) and re-exported here.
 *
 * On deploy, Amplify provisions:
 *   - Cognito user pool + identity pool (auth/resource.ts)
 *   - AppSync GraphQL API + DynamoDB tables (data/resource.ts)
 *   - All necessary IAM roles
 */
export const backend = defineBackend({
  auth,
  data,
});
