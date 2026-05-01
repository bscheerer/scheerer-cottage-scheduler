import { defineStorage } from "@aws-amplify/backend";

/**
 * S3-backed storage for the Scheerer Cottage Scheduler.
 *
 * Single path used today:
 *   profile-pictures/{entity_id}/*
 *     - read  : any authenticated family member (so other users see avatars
 *               on the calendar / approval queue)
 *     - write : only the user whose Cognito identity matches {entity_id}
 *
 * Uploaded files are referenced from Cognito's `picture` attribute with an
 * "upload:" prefix, e.g. "upload:profile-pictures/abc-123/avatar.jpg".
 * Resolution to a usable URL happens client-side via `getUrl`.
 */
export const storage = defineStorage({
  name: "cottageStorage",
  access: (allow) => ({
    "profile-pictures/{entity_id}/*": [
      allow.authenticated.to(["read"]),
      allow.entity("identity").to(["read", "write", "delete"]),
    ],
  }),
});
