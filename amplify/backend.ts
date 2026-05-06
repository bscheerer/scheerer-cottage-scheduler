import { defineBackend, secret } from "@aws-amplify/backend";
import { Aws } from "aws-cdk-lib";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { postConfirmation } from "./auth/post-confirmation/resource";
import { data } from "./data/resource";
import { manageUsers } from "./functions/manage-users/resource";
import { sendEmails } from "./functions/send-emails/resource";
import { storage } from "./storage/resource";

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
  sendEmails,
  storage,
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

// --- post-confirmation Lambda: IAM ------------------------------------------
//
// IMPORTANT: don't reference `userPoolArn` here. The post-confirmation Lambda
// lives in the same nested stack as the user pool (because it's an auth
// trigger), and the user pool already references the Lambda. Pointing the
// Lambda's IAM policy back at the specific pool ARN creates an intra-stack
// circular dependency that CloudFormation refuses.
//
// Using CloudFormation pseudo-parameters builds the same effective ARN at
// runtime without recording a CDK dependency edge. Scoped to user pools in
// THIS account/region, which is the strictest you can be without the cycle.
const userPoolWildcardArn = `arn:${Aws.PARTITION}:cognito-idp:${Aws.REGION}:${Aws.ACCOUNT_ID}:userpool/*`;

backend.postConfirmation.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["cognito-idp:AdminAddUserToGroup"],
    resources: [userPoolWildcardArn],
  })
);

// --- send-emails Lambda: env + IAM ------------------------------------------
//
// FROM_EMAIL must be a verified SES identity (a single email address or a
// verified domain). After deploy, set this on the Lambda — see PHASE9.md.
// APP_URL provides hyperlinks back into the calendar; if blank, emails just
// omit the links.

backend.sendEmails.addEnvironment("USER_POOL_ID", userPoolId);

// Sender + app URL — set in Amplify Console → Hosting → Environment variables
// before backend deploy (`ampx pipeline-deploy` reads Node process.env during synth).
const cottageFromEmail =
  process.env.COTTAGE_FROM_EMAIL?.trim() ||
  process.env.SES_FROM_EMAIL?.trim() ||
  process.env.FROM_EMAIL?.trim() ||
  "";

/** Amplify console entries like "morben.net" — treat as https for email links */
function normalizePublicAppUrl(raw: string): string {
  const u = raw.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

const cottageAppUrl = normalizePublicAppUrl(
  process.env.COTTAGE_APP_URL?.trim() || process.env.APP_URL?.trim() || ""
);

if (cottageFromEmail) {
  backend.sendEmails.addEnvironment("FROM_EMAIL", cottageFromEmail);
} else {
  backend.sendEmails.addEnvironment("FROM_EMAIL", secret("COTTAGE_FROM_EMAIL"));
  console.warn(
    "[cottage-send-emails] process.env.COTTAGE_FROM_EMAIL was empty at deploy — resolving FROM_EMAIL from " +
      "Amplify **Secret** `COTTAGE_FROM_EMAIL` (Amplify Console → Hosting → Secrets). " +
      "If email still fails, add COTTAGE_FROM_EMAIL as an Environment variable OR set that secret.",
  );
}

backend.sendEmails.addEnvironment("APP_URL", cottageAppUrl);
// SES API region (identity must exist here). Defaults to the stack region so it
// matches verified identities in the same region as the Lambda, even when
// Amplify's *build* runs in a different region.
const sesRegionForEnv = process.env.COTTAGE_SES_REGION?.trim() || Aws.REGION;
backend.sendEmails.addEnvironment("SES_REGION", sesRegionForEnv);

// SES SendEmail is authorized per identity ARN region. Include both the stack
// region and any explicit COTTAGE_SES_REGION so IAM matches the SES client when
// they differ (otherwise sends fail with AccessDenied even though the Lambda
// calls the right regional endpoint).
const sesIdentityArnRegions = [
  ...new Set([Aws.REGION, sesRegionForEnv].filter(Boolean)),
];

// IAM: list users in groups (to find admin emails) and send via SES.
backend.sendEmails.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["cognito-idp:ListUsersInGroup"],
    resources: [userPoolArn],
  })
);
backend.sendEmails.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["ses:SendEmail", "ses:SendRawEmail"],
    // Wildcard scoping: limited to identities in this account / region(s).
    resources: sesIdentityArnRegions.map(
      (reg) =>
        `arn:${Aws.PARTITION}:ses:${reg}:${Aws.ACCOUNT_ID}:identity/*`,
    ),
  })
);

// --- Storage access for Cognito group roles --------------------------------
//
// `defineStorage` with `allow.entity('identity')` attaches the storage policy
// to the *default* authenticated identity-pool role. But our Cognito groups
// (SuperUser, Admin, Viewer) each get their own IAM role, and a user in a
// group assumes the group role instead of the default. Result: writes fail
// with "not authorized to perform s3:PutObject" until we extend each group
// role with the same storage permissions.
//
// IMPORTANT: do NOT reference `backend.storage.resources.bucket.bucketArn`
// here. The group roles live in the auth stack; referencing the storage
// stack's resolved ARN creates an `auth → storage` dependency. The storage
// stack already depends on auth (it uses identityId). That round trip is a
// circular dependency CloudFormation refuses to deploy.
//
// Instead we build a literal ARN string with wildcards. We restrict the
// bucket name to the `amplify-*` prefix (only Amplify-created buckets in
// this account), and scope writes to the user's own folder via the IAM
// policy variable ${cognito-identity.amazonaws.com:sub}.

const identityVar = "${cognito-identity.amazonaws.com:sub}"; // IAM policy variable, NOT JS interpolation
const amplifyBucketPrefix = `arn:${Aws.PARTITION}:s3:::amplify-*`;
const ownObjectsArn  = `${amplifyBucketPrefix}/profile-pictures/${identityVar}/*`;
const anyProfilePicArn = `${amplifyBucketPrefix}/profile-pictures/*`;

const ownerWritePolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
  resources: [ownObjectsArn],
});
const everyoneReadPolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["s3:GetObject"],
  resources: [anyProfilePicArn],
});
const listProfilesPolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["s3:ListBucket"],
  resources: [amplifyBucketPrefix],
  conditions: {
    StringLike: {
      "s3:prefix": ["profile-pictures/", "profile-pictures/*"],
    },
  },
});

const groupNames = ["SuperUser", "Admin", "Viewer"] as const;
for (const name of groupNames) {
  // The `groups` map type isn't strictly typed by Amplify Gen 2; cast loosely.
  const role = (backend.auth.resources.groups as Record<string, { role?: { addToPrincipalPolicy: (p: PolicyStatement) => void } }>)[name]?.role;
  if (!role) continue;
  role.addToPrincipalPolicy(ownerWritePolicy);
  role.addToPrincipalPolicy(everyoneReadPolicy);
  role.addToPrincipalPolicy(listProfilesPolicy);
}
