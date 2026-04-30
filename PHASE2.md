# Phase 2 — Calendar core

## What's new

- **Live monthly calendar**, default view. 7×6 grid, today highlighted, days
  outside the current month muted. Approved reservations render as continuous
  chips that span their full date range; pending requests show in warm sunset.
- **Weekly view**, accessible via the segmented control in the toolbar.
- **Real-time updates** via AppSync subscriptions (`observeQuery`). Approving
  a reservation in one tab updates every other open tab within ~1 second.
- **Toolbar**: Prev / Next / Today, current period title, view switcher,
  warm "Request dates" CTA (placeholder until Phase 3 ships).
- Empty-state message when there are no reservations or requests.

## Files added

```
src/
├── lib/
│   ├── dates.ts         # date-fns helpers + month-grid generator
│   └── data.ts          # useReservations() and useRequests() hooks
├── components/calendar/
│   ├── CalendarToolbar.tsx
│   ├── EventChip.tsx
│   ├── MonthView.tsx
│   └── WeekView.tsx
└── pages/Calendar.tsx   # rewritten to use the above
```

## Files changed

- `package.json` — adds `date-fns@^3.6.0`.
- `src/pages/Calendar.tsx` — replaces the Phase 2 placeholder.

## How to deploy

```bash
cd ~/scheerer-cottage-scheduler

# Copy the new/changed files from the Cowork outputs folder
SRC="/Users/bscheere/Library/Application Support/Claude/local-agent-mode-sessions/bd361a23-ac1c-460b-8854-a6b370cbc8c2/094923a6-4b71-4fea-bff8-69a101039866/local_0ee4350a-a632-487e-a577-6ef7c344f940/outputs/scheerer-cottage-scheduler"
cp -R "$SRC"/. ./

# Refresh the lockfile for the new date-fns dep
npm install

# Push
git add .
git commit -m "Phase 2: live monthly + weekly calendar"
git push
```

Amplify auto-rebuilds. Backend hasn't changed (no schema edits), so this
should be a frontend-only redeploy — usually 3–5 minutes.

## How to test

1. After deploy, visit your URL and sign in.
2. You'll land on the calendar. Confirm:
   - Header reads the current month.
   - Today's cell has the aqua "Today" pill.
   - Empty-state hint appears since no reservations exist yet.
3. Click **Week** in the segmented control. Confirm 7-column day strip with
   "Open" hint in each column.
4. Click **Today**, then ‹ / › to navigate. Title should update.
5. Smoke-test live data: in the AWS DynamoDB console, find the table named
   `Reservation-...` and add a row with:
   - `id` = any unique string (UUID v4 works)
   - `startDate` = today's ISO date (e.g. `2026-04-30`)
   - `endDate`   = a few days from today
   - `partyName` = "Test family"
   - `guestCount` = 2
   - `petsAllowed` = false
   - `createdById` = your Cognito sub (any UUID for testing)
   - `__typename` = `Reservation` (DynamoDB needs this for AppSync auto-resolvers)

   Save. Within ~2 seconds, the calendar should render an approved chip
   spanning those dates without any reload.

## Known gaps (intentional, land in later phases)

- "Request dates" button shows a placeholder alert (Phase 3).
- Approval queue and Users & Roles pages are still stubs (Phase 3 / 4).
- No notification emails yet (Phase 3).
- No drag-to-create or drag-to-resize on the calendar (post-launch polish).
