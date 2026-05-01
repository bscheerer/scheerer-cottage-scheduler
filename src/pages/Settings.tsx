import { type FormEvent, useEffect, useState } from "react";
import { useIdentity } from "../lib/identity";
import { AVATAR_EMOJIS, formatPhoneForDisplay, normalizePhone, updateProfile } from "../lib/profile";

/**
 * User-settings page. Self-service profile management:
 *  - Email (read-only, since it's the Cognito identifier)
 *  - Display name (preferred_username, editable)
 *  - Profile picture: a default initials avatar plus 5 theme-aligned emojis
 *
 * Saves via Amplify's `updateUserAttributes`, then refetches the shared
 * Identity context so the BrandBar avatar updates instantly.
 */
export default function Settings() {
  const { email, preferredUsername, picture, phoneNumber, label, refetch, loading } = useIdentity();

  const [displayName, setDisplayName]     = useState(preferredUsername ?? "");
  const [chosenPicture, setChosenPicture] = useState<string>(picture ?? "");
  const [phoneInput, setPhoneInput]       = useState(formatPhoneForDisplay(phoneNumber));
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [savedAt, setSavedAt]             = useState<number | null>(null);

  // Sync form fields when identity finishes loading.
  useEffect(() => {
    if (!loading) {
      setDisplayName(preferredUsername ?? "");
      setChosenPicture(picture ?? "");
      setPhoneInput(formatPhoneForDisplay(phoneNumber));
    }
  }, [loading, preferredUsername, picture, phoneNumber]);

  // Compute the normalized phone (E.164) from what the user typed.
  // null = invalid, "" = clearing, "+..." = valid E.164.
  const normalizedPhone = normalizePhone(phoneInput);
  const phoneInvalid = phoneInput.trim().length > 0 && normalizedPhone === null;

  const dirty =
    displayName !== (preferredUsername ?? "") ||
    chosenPicture !== (picture ?? "") ||
    (normalizedPhone !== null && normalizedPhone !== (phoneNumber ?? ""));

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!dirty || saving || phoneInvalid) return;

    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      await updateProfile({
        preferredUsername: displayName.trim(),
        picture: chosenPicture, // empty string = "use initials"
        phoneNumber: normalizedPhone ?? undefined,
      });
      await refetch();
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  const initials = (preferredUsername || email || "?").slice(0, 2).toUpperCase();

  return (
    <section className="max-w-2xl mx-auto space-y-6">
      <header>
        <h2 className="font-display text-2xl text-deep">Settings</h2>
        <p className="text-sm text-muted mt-1">
          Update how the family sees you in the calendar and approval queue.
        </p>
      </header>

      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl border border-deep/10 shadow-soft p-6 space-y-6"
      >
        {/* Live preview */}
        <div className="flex items-center gap-3 pb-5 border-b border-deep/5">
          <AvatarPreview emoji={chosenPicture} initials={initials} />
          <div>
            <div className="font-display text-lg text-deep">
              {displayName.trim() || label || "Family member"}
            </div>
            <div className="text-sm text-muted">{email}</div>
          </div>
        </div>

        {/* Email */}
        <Field label="Email">
          <input
            type="email"
            value={email ?? ""}
            readOnly
            className={`${inputCls} bg-foam cursor-not-allowed text-muted`}
            aria-readonly="true"
          />
          <p className="text-xs text-muted mt-1">
            Email is your sign-in identifier and can't be changed here. Contact
            your Super User if it needs to move.
          </p>
        </Field>

        {/* Display name */}
        <Field label="Display name">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Aunt Karen"
            maxLength={60}
            className={inputCls}
          />
          <p className="text-xs text-muted mt-1">
            Shown on requests, the approval queue, and the Users & Roles page.
          </p>
        </Field>

        {/* Phone number */}
        <Field label="Phone number">
          <input
            type="tel"
            inputMode="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="(212) 555-1234"
            maxLength={30}
            className={[
              inputCls,
              phoneInvalid ? "border-denied focus:ring-denied" : "",
            ].join(" ")}
            aria-invalid={phoneInvalid}
          />
          {phoneInvalid ? (
            <p className="text-xs text-denied mt-1">
              Doesn't look like a valid phone number. Try a 10-digit US number
              or include the country code (e.g. +44 20 7946 0958).
            </p>
          ) : (
            <p className="text-xs text-muted mt-1">
              Optional. We'll save it as {normalizedPhone || "—"} (E.164 format).
              US numbers without a country code are treated as +1.
            </p>
          )}
        </Field>

        {/* Profile picture */}
        <Field label="Profile picture">
          <div className="flex flex-wrap gap-3">
            <PictureChoice
              chosen={chosenPicture === ""}
              onClick={() => setChosenPicture("")}
              ariaLabel="Use initials"
            >
              <span className="font-bold text-deep">{initials}</span>
            </PictureChoice>
            {AVATAR_EMOJIS.map((opt) => (
              <PictureChoice
                key={opt.value}
                chosen={chosenPicture === opt.value}
                onClick={() => setChosenPicture(opt.value)}
                ariaLabel={opt.label}
              >
                <span className="text-2xl leading-none" aria-hidden>{opt.value}</span>
              </PictureChoice>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            Pick the default initials or one of the lake-themed emojis.
          </p>
        </Field>

        {/* Banners */}
        {error && (
          <div className="rounded-xl border border-denied/40 bg-[#F4DAD0] px-3 py-2 text-sm text-[#7A2F18]">
            {error}
          </div>
        )}
        {savedAt && !dirty && !error && (
          <div className="rounded-xl border border-approved/40 bg-[#D8F0EC] px-3 py-2 text-sm text-[#1F7A6F]">
            Saved.
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={!dirty || saving || phoneInvalid}
            className="text-white text-sm font-semibold px-5 py-2 rounded-xl shadow-soft transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(180deg, #2C7DA0, #1B4965)" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

const inputCls =
  "w-full border border-deep/15 rounded-lg px-3 py-2 bg-offwhite text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-aqua focus:border-transparent text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mid mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function PictureChoice({
  chosen, onClick, ariaLabel, children,
}: {
  chosen: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={chosen}
      title={ariaLabel}
      className={[
        "w-14 h-14 rounded-full flex items-center justify-center border-2 transition",
        chosen
          ? "border-mid bg-foam shadow-soft scale-105"
          : "border-deep/10 bg-white hover:border-aqua hover:bg-foam/50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function AvatarPreview({ emoji, initials }: { emoji: string; initials: string }) {
  if (emoji) {
    return (
      <div className="w-14 h-14 rounded-full bg-foam border-2 border-aqua/40 flex items-center justify-center text-3xl leading-none">
        <span aria-hidden>{emoji}</span>
      </div>
    );
  }
  return (
    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-mid to-deep text-white font-bold flex items-center justify-center">
      {initials}
    </div>
  );
}
