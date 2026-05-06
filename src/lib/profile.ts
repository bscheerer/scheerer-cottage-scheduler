import { updateUserAttributes } from "aws-amplify/auth";
import { uploadData } from "aws-amplify/storage";

/**
 * Theme-aligned avatar emoji picks. Five distinct shapes/colors that read
 * well even at 28px, all riffing on the lake / sunset / cottage palette.
 */
export const AVATAR_EMOJIS = [
  { value: "🌊", label: "Wave" },
  { value: "🌅", label: "Sunset" },
  { value: "⛵", label: "Sailboat" },
  { value: "🛶", label: "Canoe" },
  { value: "🏖️", label: "Beach" },
] as const;

export type AvatarEmoji = (typeof AVATAR_EMOJIS)[number]["value"];

export interface ProfileUpdate {
  /** Cognito `preferred_username` — the friendly display name. */
  preferredUsername?: string;
  /** Cognito `picture` — emoji character or empty string for "use initials". */
  picture?: string;
  /**
   * Phone number, stored as the custom attribute `custom:phone`. Free-form
   * by design (no Cognito format constraint), but `normalizePhone()` is
   * provided to coerce US-style inputs into E.164 for consistency.
   */
  phoneNumber?: string;
}

/**
 * Update the signed-in user's Cognito profile attributes. Only the fields
 * you pass are written. Throws on any error so the caller can show a banner.
 */
export async function updateProfile(updates: ProfileUpdate): Promise<void> {
  const userAttributes: Record<string, string> = {};
  if (updates.preferredUsername !== undefined) {
    userAttributes["preferred_username"] = updates.preferredUsername;
  }
  if (updates.picture !== undefined) {
    userAttributes["picture"] = updates.picture;
  }
  if (updates.phoneNumber !== undefined) {
    // Stored as a custom attribute. See amplify/auth/resource.ts for why.
    userAttributes["custom:phone"] = updates.phoneNumber;
  }
  if (Object.keys(userAttributes).length === 0) return;

  await updateUserAttributes({ userAttributes });
}

/**
 * Coerce a user-typed phone number into Cognito's required E.164 format.
 *
 *   "(212) 555-1234"   → "+12125551234"
 *   "212-555-1234"     → "+12125551234"
 *   "1-212-555-1234"   → "+12125551234"
 *   "+44 20 7946 0958" → "+442079460958"
 *
 * Returns the empty string when the input is empty (used to clear the
 * attribute), or null when the input can't be normalized so the caller can
 * show a validation message.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Render an E.164 number nicely. US numbers get the (xxx) xxx-xxxx pattern. */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.startsWith("+1") && e164.length === 12) {
    const d = e164.slice(2);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return e164;
}

/* -------------------------------------------------------------------------- */
/*  Profile picture upload                                                     */
/* -------------------------------------------------------------------------- */

export const PICTURE_UPLOAD_PREFIX = "upload:";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;     // 5 MB
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
];

/** True if a `picture` / snapshot value points at an uploaded image in S3. */
export function isUploadedPicture(p: string | null | undefined): boolean {
  if (!p) return false;
  const t = p.replace(/^\uFEFF/, "").trim();
  if (!t) return false;
  // Prefix is sometimes a different case; some rows omit the prefix but keep the key.
  if (/^upload:/i.test(t)) return true;
  // Rare: BOM/whitespace or wrapping before "upload:"
  if (/\bupload:/i.test(t)) return true;
  if (t.includes("profile-pictures/")) return true;
  return false;
}

/** Strip the "upload:" prefix (any casing) to get the storage path for getUrl(). */
export function uploadedPicturePath(p: string): string {
  let t = p.replace(/^\uFEFF/, "").trim();
  const lower = t.toLowerCase();
  const u = lower.indexOf("upload:");
  if (u >= 0) {
    t = t.slice(u + "upload:".length).trimStart();
  }
  const pi = t.indexOf("profile-pictures/");
  if (pi > 0) {
    t = t.slice(pi);
  }
  return t;
}

/** Human-readable labels that accidentally contain storage keys (same heuristics as {@link isUploadedPicture}). */
export function looksLikeStoragePath(s: string | null | undefined): boolean {
  return isUploadedPicture(s);
}

/**
 * Upload a profile picture file to S3 under the user's identity-scoped path.
 * Returns the value to store in the `picture` attribute (with the
 * "upload:" prefix). Throws on validation or upload error.
 *
 * Path layout: `profile-pictures/{identityId}/avatar.{ext}`. Each user has
 * exactly one avatar slot — uploading replaces it.
 */
export async function uploadProfilePicture(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Please choose a JPG, PNG, WEBP, or GIF image.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(`Image must be under ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB.`);
  }

  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : (file.type.split("/")[1] ?? "jpg");
  const safeExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  // {identity_id} is filled in by Amplify Storage at upload time.
  const path = ({ identityId }: { identityId?: string }) =>
    `profile-pictures/${identityId}/avatar.${safeExt}`;

  const op = uploadData({
    path,
    data: file,
    options: {
      contentType: file.type,
      onProgress: (event) => {
        if (event.totalBytes && onProgress) {
          onProgress(event.transferredBytes / event.totalBytes);
        }
      },
    },
  });

  const result = await op.result;
  // `result.path` is the resolved path (with identityId substituted in).
  const finalPath = (result as unknown as { path: string }).path;
  return `${PICTURE_UPLOAD_PREFIX}${finalPath}`;
}

