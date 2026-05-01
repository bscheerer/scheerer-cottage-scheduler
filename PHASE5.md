# Phase 5 — User settings

A small but high-touch addition: every signed-in user now has a Settings page
to manage their own profile.

## What's new

- **`/settings` route**, linked from the avatar in the top-right of the
  brand bar. Click your avatar anywhere in the app → Settings.
- **Email** is shown read-only (it's the Cognito sign-in identifier and
  can't be changed from the app).
- **Display name** (`preferred_username`) is editable. Updates show up
  immediately on requests, the approval queue, and the Users & Roles page.
- **Profile picture picker**: 6 options total —
  - Default initials (gradient avatar from your name's first two letters)
  - 🌊 Wave
  - 🌅 Sunset
  - ⛵ Sailboat
  - 🛶 Canoe
  - 🏖️ Beach
- **Live preview** at the top of the form updates as you change either
  field, so you can see the avatar before saving.
- **Identity context**: the brand bar avatar updates within a fraction of a
  second after Save — no page reload needed. (Implemented as a React Context
  so every component sharing identity state refetches together.)

## Files added / changed

```
src/
├── lib/
│   ├── profile.ts                # NEW — AVATAR_EMOJIS + updateProfile()
│   └── identity.tsx              # REPLACES identity.ts — context provider
└── pages/
    └── Settings.tsx              # NEW

src/App.tsx                       # CHANGED — wraps in IdentityProvider, adds /settings
src/components/BrandBar.tsx       # CHANGED — emoji avatar + Settings link
```

Plus the manage-users handler dispatch fix from the earlier round, which
should land in this same push if it wasn't committed yet.

## How to deploy

```bash
cd ~/scheerer-cottage-scheduler

SRC="/Users/bscheere/Library/Application Support/Claude/local-agent-mode-sessions/bd361a23-ac1c-460b-8854-a6b370cbc8c2/094923a6-4b71-4fea-bff8-69a101039866/local_0ee4350a-a632-487e-a577-6ef7c344f940/outputs/scheerer-cottage-scheduler"
cp -R "$SRC"/. ./

# IMPORTANT: cp -R never deletes files. Remove the old identity.ts so
# TypeScript/Vite don't see two copies of the module.
rm -f src/lib/identity.ts

# No new dependencies — package.json is unchanged.
git add .
git status
git commit -m "Phase 5: settings page + identity context"
git push
```

Backend changed (the Lambda handler dispatch fix is in this push too), so
expect ~10 minutes for full provisioning. After that it'll be frontend-only
again for any further Phase 5 tweaks.

## Test plan

After deploy:

1. Hard-refresh (Cmd+Shift+R), sign in.
2. Click your avatar (top-right) → Settings.
3. Email should show, read-only.
4. Type a new display name. Click 🌊. The preview at the top updates live.
5. Save. Banner says "Saved." within a second.
6. Look at the brand bar — the avatar there should now show 🌊.
7. Try the Calendar → "+ Request dates" — the modal's party-name field
   should pre-fill with your new display name.
8. Open the Approval Queue (if you're admin) — your name in any audit log
   entry you generate from here uses the new display name.

## Implementation notes

- The profile picture is stored in Cognito's `picture` standard attribute.
  We store either the emoji character or empty string (= use initials).
  Cognito doesn't enforce URL-format on this attribute by default, so the
  emoji is fine.
- `IdentityProvider` lives just inside the Authenticator, so all signed-in
  routes share the same Cognito attribute snapshot. `refetch()` is exposed
  via the context and called by Settings on save.
- Display names are read by `useIdentity()` — every consumer now sees the
  same value. Other users' display names in the Users & Roles list still
  come from the manage-users Lambda (which reads `preferred_username` from
  Cognito on each refresh).

## Future polish

- Show other users' chosen avatars on the Users & Roles list (the Lambda
  already returns `preferred_username`; would just need to also fetch the
  `picture` attribute and display it).
- Sync the display name onto past Audit Log entries (currently they capture
  the actor's label at the time of the action, which is also fine — it's a
  historical record).
- Allow uploading a real photo (would need an S3 bucket + presigned URLs).
