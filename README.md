# Scheerer Cottage Scheduler

Multi-user web app for scheduling reservations of the Scheerer family
cottage on Lake Michigan. Three roles: **Super User**, **Administrator**,
and **Viewer / Requester**.

This repository contains the **Phase 1 foundation**: AWS Amplify Gen 2
backend (Cognito + AppSync + DynamoDB) and a React + Tailwind front-end
shell with sign-in, role-aware routing, and placeholder pages for the
features that arrive in Phases 2–4. See `DEPLOY.md` for end-to-end
deployment instructions and the design plan
(`Lakeside_Scheduler_Design_Plan.docx`) for the full spec.

## Stack

- **Hosting** AWS Amplify Hosting (S3 + CloudFront)
- **Auth**    Amazon Cognito User Pool (groups: SuperUser, Admin, Viewer)
- **API**     AWS AppSync (GraphQL) with `@auth` rules
- **Data**    Amazon DynamoDB (one table per entity)
- **Front**   Vite + React 18 + TypeScript + Tailwind CSS
- **Auth UI** `@aws-amplify/ui-react` Authenticator, themed to the brand palette

## Layout

```
.
├── amplify/                  # Amplify Gen 2 backend (TypeScript IaC)
│   ├── backend.ts            # backend entrypoint
│   ├── auth/resource.ts      # Cognito user pool + groups
│   └── data/resource.ts      # GraphQL schema + @auth rules
├── src/
│   ├── App.tsx               # router + Authenticator wrapper
│   ├── main.tsx              # Amplify.configure, mount React
│   ├── components/           # BrandBar, ProtectedRoute, PhaseStub
│   ├── pages/                # Calendar, MyRequests, ApprovalQueue, UsersAndRoles
│   └── lib/                  # auth helpers, Data client
├── tailwind.config.js        # design-plan colors as Tailwind tokens
├── vite.config.ts
├── package.json
└── DEPLOY.md                 # step-by-step AWS deployment
```

## Local development

```bash
# 1. Install
npm install

# 2. Start a sandbox backend (provisions a personal copy of Cognito + AppSync
#    + DynamoDB in your AWS account). Leave running in one terminal.
npx ampx sandbox

# 3. In another terminal, start the dev server
npm run dev
```

Open http://localhost:5173, sign up with your email, then promote yourself to
the SuperUser group via the Cognito console (one-time bootstrap — see
`DEPLOY.md`). After that, every other role change happens in-app.

## What's in / out for v0.1 (Phase 1)

In: AWS scaffolding, sign-up / sign-in, role-aware navigation, theme tokens, schema for all five tables.

Out (lands in later phases): the calendar grid, request form, approval queue,
users & roles page, email notifications, audit log UI.

## License

Private. Do not redistribute outside the Scheerer family.
