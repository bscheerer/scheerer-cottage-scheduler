import { updateUserAttributes } from "aws-amplify/auth";

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
