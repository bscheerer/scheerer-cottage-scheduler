import { defineBackend } from "@aws-amplify/backend";
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

// --- Self-signup re-enabled + branded admin-invite email -------------------
//
// Anyone can register from the sign-in screen. Admins can also still send
// invites from the Users & Roles page; this template controls what those
// invite emails look like. Both flows go through SES (using the verified
// scheduler@morben.net sender) once production access is approved.
//
// Cognito placeholders inside `emailMessage`:
//   {username}  — the invited user's email
//   {####}      — their one-time temporary password
const cfnUserPool = backend.auth.resources.cfnResources.cfnUserPool;
cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: false,
  inviteMessageTemplate: {
    emailSubject: "You're invited to the Scheerer Cottage Scheduler",
    emailMessage: `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#FAF3E3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1F2A33;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
      <tr>
        <td style="background:linear-gradient(135deg,#0F2C40 0%,#1B4965 35%,#2C7DA0 65%,#F7B267 95%,#E76F51 100%);padding:32px 24px;border-radius:16px 16px 0 0;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);border-radius:14px;margin-bottom:12px;line-height:56px;">
            <span style="font-size:30px;">⛵</span>
          </div>
          <h1 style="color:#ffffff;font-family:Georgia,'Iowan Old Style',serif;font-size:26px;font-weight:700;margin:0;letter-spacing:-0.01em;">Scheerer Cottage Scheduler</h1>
          <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:6px 0 0;">Lake Michigan family booking</p>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;padding:32px 28px;border-radius:0 0 16px 16px;box-shadow:0 4px 14px rgba(28,55,75,0.10);">
          <p style="color:#1F2A33;font-size:16px;line-height:1.5;margin:0 0 12px;">You're in 🌊</p>
          <p style="color:#1F2A33;font-size:15px;line-height:1.6;margin:0 0 20px;">An admin has invited you to the family cottage scheduler. Here are your sign-in details:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#E8F4F8;border:2px solid #61A5C2;border-radius:12px;margin:20px 0;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid rgba(97,165,194,0.25);">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2C7DA0;margin-bottom:4px;">Email</div>
                <div style="font-family:Georgia,serif;font-size:16px;color:#1B4965;word-break:break-all;">{username}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2C7DA0;margin-bottom:4px;">Temporary password</div>
                <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:2px;color:#1B4965;">{####}</div>
              </td>
            </tr>
          </table>
          <div style="text-align:center;margin:28px 0 18px;">
            <a href="https://www.morben.net" style="display:inline-block;background:linear-gradient(180deg,#F7B267,#E76F51);color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:12px;box-shadow:0 6px 14px rgba(231,111,81,0.25);">Sign in to the cottage</a>
          </div>
          <p style="color:#6B7C85;font-size:13px;line-height:1.6;margin:0 0 8px;">When you sign in for the first time, you'll be prompted to set your own permanent password.</p>
          <p style="color:#6B7C85;font-size:13px;line-height:1.6;margin:0 0 24px;">If you weren't expecting this invitation, you can ignore this email.</p>
          <hr style="border:none;border-top:1px solid #E8F4F8;margin:24px 0 18px;">
          <p style="color:#5C3A21;font-size:12px;text-align:center;margin:0;">Sent from <strong>Scheerer Cottage Scheduler</strong> · Lake Michigan</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  },
};

// --- send-emails Lambda: env + IAM ------------------------------------------
//
// FROM_EMAIL must be a verified SES identity (a single email address or a
// verified domain). After deploy, set this on the Lambda — see PHASE9.md.
// APP_URL provides hyperlinks back into the calendar; if blank, emails just
// omit the links.

backend.sendEmails.addEnvironment("USER_POOL_ID", userPoolId);
backend.sendEmails.addEnvironment(
  "FROM_EMAIL",
  process.env.COTTAGE_FROM_EMAIL ?? ""
);
backend.sendEmails.addEnvironment(
  "APP_URL",
  process.env.COTTAGE_APP_URL ?? ""
);

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
    // Wildcard scoping: limited to identities in this account / region.
    resources: [
      `arn:${Aws.PARTITION}:ses:${Aws.REGION}:${Aws.ACCOUNT_ID}:identity/*`,
    ],
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
