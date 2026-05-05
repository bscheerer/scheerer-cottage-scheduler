# Deploying Scheerer Cottage Scheduler

This guide takes you from "fresh codebase on disk" to "live URL your family
can sign into" in about 30 minutes. You'll do four things:

1. Push the code to a new GitHub repo.
2. Connect the repo to AWS Amplify Hosting (one click).
3. Wait ~10 minutes for AWS to provision Cognito, AppSync, DynamoDB, and
   CloudFront, then deploy the front-end.
4. Bootstrap yourself as SuperUser (one-time, two minutes).

Optional fifth step: attach a custom domain.

---

## Prerequisites

- An AWS account (you said you have one — good).
- A GitHub account.
- Node.js 20 or newer installed locally.
- AWS CLI installed and configured with an IAM user that has `AdministratorAccess`
  for the duration of this setup. (You can scope it down after.)
  - Verify with: `aws sts get-caller-identity`

If you don't have the AWS CLI yet:
<https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>

---

## Step 1 — Push to GitHub

From the `scheerer-cottage-scheduler/` folder:

```bash
git init -b main
git add .
git commit -m "Phase 1 foundation"

# Create the repo on GitHub (web UI or `gh` CLI), then:
git remote add origin https://github.com/<your-username>/scheerer-cottage-scheduler.git
git push -u origin main
```

---

## Step 2 — (Optional but recommended) Sandbox locally first

Before connecting to Amplify Hosting, spin up a sandbox backend in your AWS
account so you can verify everything works locally:

```bash
npm install
npx ampx sandbox
```

The first sandbox run takes ~5 minutes. When it finishes, it writes
`amplify_outputs.json` at the project root. Keep the sandbox running and, in
another terminal:

```bash
npm run dev
```

Visit <http://localhost:5173>. You should see the brand sign-in screen. Try
signing up with your email — Cognito will email you a verification code.

Stop the sandbox with `Ctrl+C` when done. To delete the sandbox resources:
`npx ampx sandbox delete`.

---

## Step 3 — Connect to Amplify Hosting

1. Open the AWS console → **AWS Amplify**.
2. Click **Create new app** → **Host web app**.
3. Choose **GitHub** as the source. Authorize AWS to read your repo.
4. Pick the `scheerer-cottage-scheduler` repo and the `main` branch.
5. Amplify auto-detects the build settings. Confirm they look like:

   ```yaml
   version: 1
   backend:
     phases:
       build:
         commands:
           - npm ci --cache .npm --prefer-offline
           - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
   frontend:
     phases:
       preBuild:
         commands:
           - npm ci --cache .npm --prefer-offline
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: dist
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
         - .npm/**/*
   ```

   If Amplify proposes a different config, click **Edit** and paste the YAML
   above (or save it as `amplify.yml` in the repo root).

6. Click **Save and deploy**. The first deploy takes ~10–15 minutes — Amplify
   provisions Cognito, AppSync, DynamoDB, S3, CloudFront, and IAM roles, then
   builds and uploads the React bundle.

When it's green, you'll see a URL like
`https://main.d1abcxyz.amplifyapp.com`. That's your app.

---

## Step 4 — Bootstrap yourself as SuperUser

The first time you visit the app, sign up with your email. Cognito emails you
a verification code; enter it. You're now a Cognito user with **no group
membership**, so the app shows "Pending role" in the brand bar and only
exposes the calendar.

Promote yourself to SuperUser one of two ways:

**Option A — AWS console (60 seconds):**
1. AWS console → **Cognito** → **User pools**.
2. Click into the pool created by Amplify (named like
   `amplifyAuthUserPool-...`).
3. **Users** → click your email.
4. **Group memberships** → **Add user to group** → choose `SuperUser`.
5. Sign out of the app and back in. The brand bar should now read "Super User"
   and you'll see the **Queue** and **Users** nav items.

**Option B — CLI:**

```bash
USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 50 \
  --query "UserPools[?contains(Name, 'amplifyAuthUserPool')].Id | [0]" \
  --output text)

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username "your-email@example.com" \
  --group-name "SuperUser"
```

You only do this once. After Phase 4 ships, all subsequent role changes happen
from the in-app **Users & roles** page.

---

## Step 5 — (Optional) Custom domain

In the Amplify console → your app → **Hosting** → **Custom domains** →
**Add domain**. If you bought your domain via Route 53, the wiring is one
click. For external registrars Amplify shows you the CNAME records to add.

ACM (TLS certificates) provisions automatically, free.

---

## Cost

For a family-scale app, expect **\$0–1/month** in the first 12 months (free
tier covers Cognito, AppSync, DynamoDB, S3, CloudFront, and Lambda). Steady
state is **~\$5–10/month**. The only certain charge is the Route 53 hosted
zone if you use a custom domain (~\$0.50/month).

---

## Updating the app

```bash
git pull
# make changes
git commit -am "Phase 2: monthly calendar"
git push
```

Amplify watches `main` and redeploys automatically. Pull-request branches get
their own preview URLs — useful for trying changes before merging.

---

## Email notifications (reservation queue)

Request submit, admin queue alerts, and approve/deny confirmations are sent by
the `send-emails` Lambda via **Amazon SES**. If this was never configured,
**the app still works** — you just get no mail.

### Required: environment variables (backend build)

The sender address is wired at **deploy time**. In **Amplify Console** → your app
→ **Hosting** → **Environment variables**, add for the **same branch** your
backend deploy uses:

| Variable | Example | Purpose |
|---------|---------|--------|
| `COTTAGE_FROM_EMAIL` | `noreply@your-verified-domain.com` | **Verified** SES sender (`From`). Also accepts aliases `SES_FROM_EMAIL` or `FROM_EMAIL`. |
| `COTTAGE_APP_URL` | `https://morben.net` | Use **https://** — bare hostnames are auto-normalized now, but explicit is clearer. |

Then **redeploy** (or trigger a new build) so `npx ampx pipeline-deploy`
picks them up.

### Required: SES in the Lambda region

Lambdas send SES from **`AWS_REGION` for that function** — usually the region
Amplify deployed the backend into. In **SES** (`us-east-1`, `us-east-2`, …):

1. **Verify** the `COTTAGE_FROM_EMAIL` identity (single address or domain).
2. If the account is still in the **SES sandbox**, verify **every recipient**
   (admins + requesters), or exit sandbox / request production — otherwise SES
   returns `MessageRejected` (see Lambda CloudWatch logs: `SES send failed`).

### Debugging

CloudWatch → log group for **`send-emails`**:

- **`FROM_EMAIL env var not set`** → add `COTTAGE_FROM_EMAIL` in Amplify and redeploy backend.
- **`SES send failed` + sandbox / unverified identity** → verify identities in SES.
- **`getAdminEmails failed`** → Lambda IAM must allow `cognito-idp:ListUsersInGroup`
  on your user pool (already in `amplify/backend.ts`).

---

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails with "amplify_outputs.json not found" | Backend phase didn't run | Confirm the `backend:` block is present in `amplify.yml`. |
| Can sign up but can't see anything | No Cognito group assigned | Add yourself to a group (Step 4). |
| "Not Authorized" on data calls | Group not in JWT yet | Sign out and back in to refresh the ID token. |
| Sandbox stuck "deploying" | First-time CDK bootstrap | `npx ampx configure profile` then retry; or run `cdk bootstrap` once. |
| No reservation emails anywhere | Missing `COTTAGE_FROM_EMAIL` or SES sandbox | See **Email notifications (SES)** above; check `send-emails` logs. |

---

## Next steps after Phase 1

1. Confirm the open questions in the design plan (section 12).
2. Greenlight Phase 2 — the monthly + weekly calendar, real reservation reads.
3. Then Phase 3 — the request flow and approval queue.
