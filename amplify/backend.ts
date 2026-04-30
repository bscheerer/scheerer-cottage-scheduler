import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { postConfirmation } from "./auth/post-confirmation/resource";
import { data } from "./data/resource";
import { manageUsers } from "./functions/manage-users/resource";

/**
 * Scheerer Cottage Scheduler — Amplify Gen 2 backend entrypoint.
 *
 * Resources provisioned on deploy:
 *   - Cognito user pool + identity pool          (auth/resource.ts)
 *   - Post-confirmation Lambda trigger           (auth/post-confirmation)
 *   - AppSync GraphQL API + DynamoDB tables      (data/resource.ts)
 *   - manage-users Lambda + Cognito IAM grants   (functions/manage-users)
 *
 * Both Lambdas are declared as top-level resources so we can attach IAM
 * policies and environment variables explicitly. The post-confirmation
 * trigger is *also* referenced from auth/resource.ts via `triggers`, which
 * is what tells Cognito to invoke it on user verification.
 */
export const backend = defineBackend({
  auth,
  data,
  manageUsers,
  postConfirmation,
});

const userPoolArn = backend.auth.resources.userPool.userPoolArn;
const userPoolId  = backend.auth.resources.userPool.userPoolId;

// --- manage-users Lambda: env + IAM ----------------------------------------

backend.manageUsers.addEnvironment("USER_POOL_ID", userPoolId);

backend.manageUsers.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminListGroupsForUser",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminRemoveUserFromGroup",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminDisableUser",
      "cognito-idp:AdminEnableUser",
      "cognito-idp:AdminDeleteUser",
    ],
    resources: [userPoolArn],
  })
);

// --- post-confirmation Lambda: IAM (event already provides userPoolId) -----

backend.postConfirmation.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["cognito-idp:AdminAddUserToGroup"],
    resources: [userPoolArn],
  })
);
