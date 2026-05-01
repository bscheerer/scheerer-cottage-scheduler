# Phase 9 — Email notifications + queue badge

## What's new

- **Pending-count badge** on the Queue nav item (admin/super-user only).
  Shows the number of pending requests as a small sunset-coral bubble. Reads
  live from the same `useRequests` subscription the queue page uses, so it
  updates the moment a request comes in or gets decided.
- **Three lifecycle emails** via Amazon SES, sent fire-and-forget after the
  triggering action succeeds:
  1. **Request submitted** → email to the requester confirming the request.
  2. **Request submitted** → email to every admin/super-user with a link to
     the approval queue.
  3. **Request approved or denied** → email to the requester with the
     decision (and the optional reason if denied).

## Heads up — backend deploy + one-time SES setup

Adding the `send-emails` Lambda + SES IAM means a full provisioning deploy
(~10 min). Then there are a couple of one-time AWS console / CLI steps
to actually let SES send your emails. If you skip the SES setup the deploy
still succeeds, but emails just won't go out (the Lambda logs each attempt
in CloudWatch).

## Files added / changed

```
amplify/
├── functions/send-emails/      # NEW — SES + Cognito email Lambda
│   ├── resource.ts
│   └── handler.ts
├── data/resource.ts            # CHANGED — adds notifyRequestCreated,
│                               #   notifyRequestDecided + requesterEmail/Name
│                               #   snapshots on Request
└── backend.ts                  # CHANGED — registers send-emails, IAM,
                                #   FROM_EMAIL/APP_URL/USER_POOL_ID env vars

src/
├── components/BrandBar.tsx     # CHANGED — pending-count badge
├── lib/notifications.ts        # NEW — fire-and-forget mutation wrappers
├── lib/data.ts                 # CHANGED — fires emails on create/approve/deny
└── components/RequestModal.tsx # CHANGED — passes email + name to createRequest
```

## How to deploy

```bash
cd ~/scheerer-cottage-scheduler

SRC="/Users/bscheere/Library/Application Support/Claude/local-agent-mode-sessions/bd361a23-ac1c-460b-8854-a6b370cbc8c2/094923a6-4b71-4fea-bff8-69a101039866/local_0ee4350a-a632-487e-a577-6ef7c344f940/outputs/scheerer-cottage-scheduler"
cp -R "$SRC"/. ./

git add .
git commit -m "Phase 9: SES email notifications + queue pending-count badge"
git push
```

Wait for the build to land green (~10–15 min for the backend phase), then do
the SES setup below.

## SES setup (one-time, post-deploy)

### 1. Verify a sender identity

SES requires the email address you send *from* to be verified. The simplest
choice for a family app is to verify your own email and use it as the FROM
address. (You can later move to a verified domain if you want a cleaner
sender like `cottage@yourdomain.com`.)

```bash
aws ses verify-email-identity \
  --email-address bscheerer@gmail.com \
  --region us-east-2
```

AWS sends a verification link to that inbox. Click it. Confirm with:

```bash
aws ses get-identity-verification-attributes \
  --identities bscheerer@gmail.com \
  --region us-east-2
```

`VerificationStatus` should read `Success`.

### 2. Verify each recipient (only required while in the SES sandbox)

By default new AWS accounts are in the SES sandbox: you can only send to
verified addresses. For a small family, the easiest path is to verify each
member's email (their reply will come from your verified sender, so no
domain-reputation work needed).

For each family email:

```bash
aws ses verify-email-identity \
  --email-address aunt.karen@example.com \
  --region us-east-2
```

Each person clicks the link in their inbox. Done.

To request **production access** (send to anyone without verification),
follow <https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html>.
Approval typically takes 24 hours. Worth it if you have a lot of family
members or if verification is logistically annoying.

### 3. Tell the Lambda which FROM address to use

The send-emails Lambda reads its FROM address from the `FROM_EMAIL`
environment variable. Find the Lambda's name (it's auto-generated):

```bash
aws lambda list-functions --region us-east-2 \
  --query "Functions[?contains(FunctionName, 'send-emails')].FunctionName" \
  --output text
```

Then set the variables:

```bash
LAMBDA_NAME=<paste-the-name>
APP_URL="https://main.d36w6s31xr4tvc.amplifyapp.com"   # your live URL
FROM_EMAIL="bscheerer@gmail.com"

aws lambda update-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --region us-east-2 \
  --environment "Variables={USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 50 --region us-east-2 --query \"UserPools[?contains(Name, 'amplifyAuthUserPool')].Id | [0]\" --output text),FROM_EMAIL=$FROM_EMAIL,APP_URL=$APP_URL}"
```

(USER_POOL_ID was already set during deploy; including it here so the
update doesn't drop it.)

You can also do this from the Lambda console: Configuration → Environment
variables → Edit.

## Test plan

1. Sign in as a viewer; submit a request. Within ~1 minute you should
   receive a confirmation email at the address you signed up with. The
   admin's mailbox should also have a "new cottage request" email.
2. Sign in as the super user; approve the request. The viewer should
   receive an "approved" email.
3. Submit and deny a different request, optionally entering a reason at the
   prompt. The viewer should receive the denial email with the reason.
4. Watch the queue badge: as you submit / approve, the small bubble next to
   "Queue" in the brand bar updates within ~2 seconds.

If emails don't arrive, check the Lambda's CloudWatch log:

```bash
aws logs tail /aws/lambda/$LAMBDA_NAME --since 10m --region us-east-2
```

The most common failures are (in order): `MessageRejected` because the
sender or recipient isn't verified, or `FROM_EMAIL env var not set` if Step 3
hasn't been done yet.

## Implementation notes

- The notify mutations are **fire-and-forget**. If SES is misconfigured, the
  request action still succeeds — only the email is missed. The viewer/admin
  experience inside the app is never blocked on email.
- `requesterEmail` and `requesterName` are now stored on each `Request`
  row (Cognito's `email` is immutable, so the snapshot is stable). This
  saves an extra Cognito lookup on approve/deny.
- The Lambda fetches admin emails on every notify call. For a family-scale
  pool this is fast (one or two `ListUsersInGroup` calls). If the admin set
  ever grows, we can cache.
- The pending-count bubble caps at "9+" so the layout doesn't shift.

## Future polish

- **iCal/Google Calendar links** in the approval email body so requesters
  can drop the dates straight into their calendar.
- **Daily digest** instead of per-event emails for active periods (Memorial
  Day to Labor Day) to reduce inbox noise.
- **Reminder email** 7 days before an approved stay.
- **Domain-based sender** (`no-reply@scheerercottage.com`) once you set up
  domain verification in SES.
