import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useIdentity } from "../lib/identity";
import {
  AVATAR_EMOJIS, formatPhoneForDisplay, isUploadedPicture, normalizePhone,
  PICTURE_UPLOAD_PREFIX, updateProfile, uploadProfilePicture,
} from "../lib/profile";
import Avatar from "../components/Avatar";

/**
 * User-settings page. Edit display name, phone, and profile picture.
 *
 * Profile picture options:
 *   - Default initials avatar
 *   - 5 lake-themed emojis
 *   - Upload your own image (stored in S3, referenced via "upload:" prefix
 *     in the Cognito `picture` attribute)
 */
export default function Settings() {
  const { email, preferredUsername, picture, phoneNumber, label, refetch, loading } = useIdentity();

  const [displayName, setDisplayName]     = useState(preferredUsername ?? "");
  const [chosenPicture, setChosenPicture] = useState<string>(picture ?? "");
  const [phoneInput, setPhoneInput]       = useState(formatPhoneForDisplay(phoneNumber));
  const [pendingFile, setPendingFile]     = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [savedAt, setSavedAt]             = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading) {
      setDisplayName(preferredUsername ?? "");
      setChosenPicture(picture ?? "");
      setPhoneInput(formatPhoneForDisplay(phoneNumber));
    }
  }, [loading, preferredUsername, picture, phoneNumber]);

  // Local object URL for the file the user just selected (preview only).
  useEffect(() => {
    if (!pendingFile) { setPendingPreviewUrl(null); return; }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const normalizedPhone = normalizePhone(phoneInput);
  const phoneInvalid = phoneInput.trim().length > 0 && normalizedPhone === null;

  const dirty =
    displayName !== (preferredUsername ?? "") ||
    chosenPicture !== (picture ?? "") ||
    pendingFile !== null ||
    (normalizedPhone !== null && normalizedPhone !== (phoneNumber ?? ""));

  function onPickFile() {
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setPendingFile(f);
    // Mark "I'll be using an upload" so chosenPicture isn't an emoji.
    // The actual storage path comes from uploadProfilePicture on save.
    setChosenPicture(PICTURE_UPLOAD_PREFIX + "pending");
    e.target.value = ""; // allow re-selecting the same file
  }

  function clearPendingFile() {
    setPendingFile(null);
    // Revert to whatever was the original picture (so the picker reflects
    // the saved state rather than a half-applied upload choice).
    setChosenPicture(picture ?? "");
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!dirty || saving || phoneInvalid) return;

    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      let pictureToSave: string | undefined =
        chosenPicture !== (picture ?? "") ? chosenPicture : undefined;

      // If the user picked a file, upload it and replace pictureToSave
      // with the actual S3 path returned by uploadProfilePicture.
      if (pendingFile) {
        setUploadProgress(0);
        pictureToSave = await uploadProfilePicture(pendingFile, (frac) =>
          setUploadProgress(Math.round(frac * 100))
        );
        setUploadProgress(null);
      }

      await updateProfile({
        preferredUsername: displayName.trim(),
        picture: pictureToSave,
        phoneNumber: normalizedPhone ?? undefined,
      });
      setPendingFile(null);
      await refetch();
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
      setUploadProgress(null);
    } finally {
      setSaving(false);
    }
  }

  const initials = (preferredUsername || email || "?").slice(0, 2).toUpperCase();
  const previewPicture =
    pendingPreviewUrl ? null /* show pendingPreviewUrl directly below */ : chosenPicture;

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
          {pendingPreviewUrl ? (
            <span className="w-14 h-14 rounded-full overflow-hidden border-2 border-aqua/40 flex-shrink-0">
              <img src={pendingPreviewUrl} alt="" className="w-full h-full object-cover" />
            </span>
          ) : (
            <Avatar
              picture={previewPicture ?? null}
              fallbackInitials={initials}
              size={56}
            />
          )}
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
            className={[inputCls, phoneInvalid ? "border-denied focus:ring-denied" : ""].join(" ")}
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
          <div className="flex flex-wrap gap-3 items-center">
            {/* Initials default */}
            <PictureChoice
              chosen={chosenPicture === ""}
              onClick={() => { clearPendingFile(); setChosenPicture(""); }}
              ariaLabel="Use initials"
            >
              <span className="font-bold text-deep">{initials}</span>
            </PictureChoice>

            {/* Emoji choices */}
            {AVATAR_EMOJIS.map((opt) => (
              <PictureChoice
                key={opt.value}
                chosen={chosenPicture === opt.value}
                onClick={() => { clearPendingFile(); setChosenPicture(opt.value); }}
                ariaLabel={opt.label}
              >
                <span className="text-2xl leading-none" aria-hidden>{opt.value}</span>
              </PictureChoice>
            ))}

            {/* Upload your own */}
            <button
              type="button"
              onClick={onPickFile}
              aria-label="Upload your own picture"
              title="Upload your own picture"
              className={[
                "w-14 h-14 rounded-full flex items-center justify-center border-2 border-dashed transition overflow-hidden",
                pendingFile || isUploadedPicture(chosenPicture)
                  ? "border-mid bg-foam shadow-soft scale-105"
                  : "border-deep/20 bg-white hover:border-aqua hover:bg-foam/50",
              ].join(" ")}
            >
              {pendingPreviewUrl ? (
                <img src={pendingPreviewUrl} alt="" className="w-full h-full object-cover" />
              ) : isUploadedPicture(picture ?? "") && !pendingFile ? (
                <Avatar picture={picture ?? null} fallbackInitials={initials} size={56} />
              ) : (
                <UploadIcon />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={onFileChosen}
            />
          </div>
          <p className="text-xs text-muted mt-2">
            Pick the default initials, one of the lake-themed emojis, or upload
            your own picture (JPG/PNG/WEBP, up to 5 MB).
          </p>
          {pendingFile && (
            <p className="text-xs text-mid mt-1">
              {pendingFile.name} ({Math.round(pendingFile.size / 1024)} KB) ready to upload on Save.
              <button
                type="button"
                onClick={clearPendingFile}
                className="ml-2 underline hover:text-deep"
              >
                discard
              </button>
            </p>
          )}
          {uploadProgress !== null && (
            <div className="mt-2">
              <div className="h-1.5 bg-foam rounded-full overflow-hidden">
                <div
                  className="h-full bg-aqua transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted mt-1">Uploading… {uploadProgress}%</p>
            </div>
          )}
        </Field>

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

function Field({ label, children }: { label: string; children: ReactNode }) {
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
  children: ReactNode;
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

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-mid">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
