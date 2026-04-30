# Phase 3 — Requests & approvals

## What's new

- **Request modal** with arrival/departure date pickers, party name, guest
  count, pets, optional note, and a live conflict warning if the chosen
  range overlaps any approved reservation.
- **My requests page** rebuilt: lists every request you've submitted (newest
  first), shows status badges, lets you cancel pending ones.
- **Approval queue** rebuilt (Admin / Super User only): pending requests at
  top with **Approve** and **Deny** actions, plus a "Recently decided" list
  for context.
- **Conflict detection on approve**: client-side check against all approved
  reservations. If any overlap, the approval is refused with a clear error.
- **Auto-deny of overlapping pendings**: when you approve a request,
  any other pending request whose dates overlap is automatically denied
  with reason "Date taken by an approved reservation."
- **Calendar wired up**: the "+ Request dates" button in the toolbar now
  opens the real modal.

## Files added / changed

```
src/
├── lib/
│   ├── identity.ts        # NEW — useIdentity() hook (Cognito sub + label)
│   └── data.ts            # CHANGED — adds createRequest, approveRequest,
│                          #   denyRequest, cancelRequest, overlaps()
├── components/
│   └── RequestModal.tsx   # NEW
└── pages/
    ├── Calendar.tsx       # CHANGED — wires up the request modal
    ├── MyRequests.tsx     # REWRITTEN — real list + cancel
    └── ApprovalQueue.tsx  # REWRITTEN — pending queue + approve/deny
```

## How to deploy

```bash
cd ~/scheerer-cottage-scheduler

SRC="/Users/bscheere/Library/Application Support/Claude/local-agent-mode-sessions/bd361a23-ac1c-460b-8854-a6b370cbc8c2/094923a6-4b71-4fea-bff8-69a101039866/local_0ee4350a-a632-487e-a577-6ef7c344f940/outputs/scheerer-cottage-scheduler"
cp -R "$SRC"/. ./

# No new dependencies — package.json unchanged from Phase 2
git add .
git commit -m "Phase 3: requests, approvals, and conflict detection"
git push
```

Frontend-only change; expect a 3–5 minute Amplify rebuild.

## End-to-end test (5 minutes)

You'll want **two browser windows** (or one regular + one incognito) signed
in as different accounts to fully exercise the flow. If you don't have a
second test user yet, create one quickly: sign up with a different email,
then add it to Cognito's `Viewer` group via the console.

1. **As a viewer**, open the calendar. Click **+ Request dates**.
2. Pick dates a few weeks out, fill in your party name + 2 guests, submit.
3. Open **My requests** — your new pending request appears with the amber
   "Pending" badge.
4. **As the super user** (you, in the other window), open **Queue**.
   The pending request appears within a few seconds.
5. Click **Approve**. A toast says "Approved" and the calendar instantly
   shows a teal chip on the requested dates.
6. Switch to **My requests** in the viewer window — status flips to
   "Approved" without a refresh.
7. Submit a *second* request that overlaps the first. In the queue, click
   **Approve** — you should see the conflict-check error refusing the
   approval.
8. Submit two overlapping pendings, approve one — the other should auto-flip
   to "Denied" with the reason "Date taken by an approved reservation."
9. As a viewer, submit a request, then open **My requests** and click
   **Cancel** on the pending row.

## Known gaps (intentional, land in later phases)

- **No emails yet**. Notifications via Amazon SES land in a Phase 3.5 / 4.
  For now the queue + real-time UI is the notification.
- **No invite flow** — admins still add users via the Cognito console or
  by creating a Cognito user with an admin password.
- **Users & Roles page** is still a stub (Phase 4).
- **Audit log** is still write-only (no UI yet).

## Implementation notes

- `approveRequest` performs three sequential operations: conflict check,
  reservation create + request update, and auto-deny of overlapping pendings.
  These are not atomic — if the auto-deny step fails, an admin can re-run.
  A future Phase can move this to a Lambda transaction.
- Client-side conflict detection is fast and works at family scale. If the
  reservation table ever exceeds ~1000 rows we'll switch to a date-range
  query against the `Reservation.startDate` GSI defined in Phase 1.
- The owner-based authorization in `amplify/data/resource.ts` lets a viewer
  cancel their own pending request (`allow.owner().to(["update", "delete"])`).
  Amplify Gen 2 auto-injects an `owner` field equal to the user's Cognito sub
  when records are created — that's why this works without any extra wiring.
