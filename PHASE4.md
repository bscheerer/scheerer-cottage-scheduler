# Phase 4 — People & roles

The biggest backend change since Phase 1. We're adding a Lambda function for
Cognito user management, a post-confirmation trigger that auto-assigns new
sign-ups to the Viewer group, custom GraphQL operations, and the audit log
UI. Read the **Heads up on deploy** section before you push.

## What's new

- **Users & Roles page** rebuilt from a stub:
  - Live list of every user pulled from the Cognito user pool.
  - Role selector per user (`SuperUser` ↔ `Admin` ↔ `Viewer`) — changes are
    enforced via `cognito-idp:AdminAddUserToGroup` / `Remove`.
  - **Invite a family member** form: enter email + display name + role,
    Cognito sends them an automatic one-time-password email.
  - **Disable** a user (their account stays for audit purposes; they just
    can't sign in until re-enabled).
  - Self-protection: you can't change your own role or disable yourself.
- **Auto-Viewer on sign-up**: a new post-confirmation Lambda trigger adds
  every newly-verified user to the Viewer group, so they have a useful
  default role from the very first sign-in.
- **Audit log live feed** at the bottom of the Users page — newest 20 entries.
  Approving, denying, cancelling, role changes, invites, and disables all
  write entries automatically.

## Files added / changed

```
amplify/
├── auth/
│   ├── post-confirmation/        # NEW — auto-assign new users to Viewer
│   │   ├── resource.ts
│   │   └── handler.ts
│   └── resource.ts               # CHANGED — wires the trigger
├── functions/
│   └── manage-users/             # NEW — Cognito admin Lambda
│       ├── resource.ts
│       └── handler.ts
├── data/
│   └── resource.ts               # CHANGED — adds FamilyUser type and 4 custom ops
└── backend.ts                    # CHANGED — IAM policies + env vars on both Lambdas

src/
├── lib/
│   ├── audit.ts                  # NEW — writeAudit() + useAuditFeed() hook
│   ├── data.ts                   # CHANGED — approve/deny/cancel now write audit
│   └── users.ts                  # NEW — typed wrappers for the new GraphQL ops
└── pages/
    └── UsersAndRoles.tsx         # REWRITTEN — full users page + audit feed

package.json                      # CHANGED — adds @aws-sdk/client-cognito-identity-provider,
                                  #   @types/aws-lambda, aws-cdk-lib (devDependencies)
```

## Heads up on deploy

This phase modifies `amplify/auth/`, adds two new Lambda functions, and
attaches new IAM policies. Amplify will run **full CDK provisioning** for
this build instead of the fast frontend-only path you've had since Phase 2.
Expect **10–15 minutes** for the first deploy.

After it succeeds, normal frontend-only changes will be fast again.

## How to deploy

```bash
cd ~/scheerer-cottage-scheduler

SRC="/Users/bscheere/Library/Application Support/Claude/local-agent-mode-sessions/bd361a23-ac1c-460b-8854-a6b370cbc8c2/094923a6-4b71-4fea-bff8-69a101039866/local_0ee4350a-a632-487e-a577-6ef7c344f940/outputs/scheerer-cottage-scheduler"
cp -R "$SRC"/. ./

# Three new dependencies — refresh the lockfile
npm install

# Push
git add .
git commit -m "Phase 4: users, roles, post-confirm trigger, audit log"
git push
```

## End-to-end test (10 minutes)

After the deploy finishes:

1. Sign out, then sign up with a fresh test email. Verify the email code.
2. Sign in. Notice the brand bar now shows **Viewer** instead of "Pending
   role" — the post-confirmation trigger worked.
3. Sign back in as your Super User. Open **Users**.
4. Confirm both your Super User account and the test account appear.
5. Change the test account's role to **Admin** via the dropdown. The badge
   updates and an audit entry appears at the bottom: "ChangeUserRole — ...".
6. Click **+ Invite family member**, enter an email you can receive at, a
   display name, role = Viewer. Submit. Cognito will email them a one-time
   password (sender: `no-reply@verificationemail.com` by default).
7. Use that one-time password to sign in as the invitee. Confirm they land
   on the calendar with role = Viewer.
8. Submit a request as the invitee. Switch to your Super User window,
   approve it. Audit feed shows: "ApproveRequest — Approved ... for ..."
9. Click **Disable** next to the test Admin account. Sign in as that user
   in another window — Cognito will refuse with "User is disabled."
10. (Optional) Re-enable from the Cognito console (no in-app re-enable yet
    — easy add later).

## Known gaps & deferred items

- **Email templates** for request submitted / approved / denied still use
  no email (in-app only). Adding them via SES is a small follow-up but
  requires verifying a domain or sender address. We'll do it as a Phase 4.5
  if you want notifications outside the app.
- **Google sign-in** is straightforward to add (Cognito federated identity)
  but requires you to set up Google OAuth credentials in Google Cloud Console.
  Skipped here; we can wire it in 30 minutes when you're ready.
- **Re-enable user** isn't surfaced in the UI yet — disabling a user is
  reversible from the Cognito console. Easy to add a button later.
- **Per-user audit detail** view (click an entry to see before/after JSON)
  not built yet; the feed is summary-only.

## Verifying the AppSync schema after deploy

If anything in `data/resource.ts` doesn't compile cleanly into AppSync,
the build will fail with a `[BackendBuildError] @auth ...` message similar
to the one we hit at the start of Phase 1. The most likely cause this round
would be a malformed custom mutation declaration. The local parse check passed,
so we expect a clean build, but watch the log just in case.
