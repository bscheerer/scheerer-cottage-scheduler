import { useEffect, useState } from "react";
import { getUrl } from "aws-amplify/storage";
import { isUploadedPicture, uploadedPicturePath } from "../lib/profile";

interface Props {
  /** Cognito `picture` value: emoji, "upload:..." path, or empty/null. */
  picture?: string | null;
  /** Used when picture is empty — first 1-2 letters of name. */
  fallbackInitials: string;
  /** Pixel size (square). */
  size?: number;
  /** Tailwind classes for outer container (color when in fallback mode). */
  className?: string;
  /** Override URL — short-circuit getUrl resolution if you've already cached. */
  resolvedUrl?: string | null;
}

// Module-scope cache so the same uploaded path resolves once per session.
const urlCache = new Map<string, Promise<string>>();

function resolvePath(path: string): Promise<string> {
  if (!urlCache.has(path)) {
    urlCache.set(
      path,
      getUrl({ path, options: { expiresIn: 3600 } })
        .then((r) => r.url.toString())
        .catch((err) => {
          urlCache.delete(path); // allow a retry next render
          throw err;
        })
    );
  }
  return urlCache.get(path)!;
}

/**
 * Reusable avatar renderer. Supports three modes, in priority order:
 *   1. Uploaded image      (picture starts with "upload:")
 *   2. Emoji               (picture is any non-empty short string)
 *   3. Initials fallback   (picture is empty/null)
 *
 * Uploaded paths are resolved to signed S3 URLs and cached in module scope
 * so multiple Avatars rendering the same person don't each hit getUrl.
 */
export default function Avatar({
  picture, fallbackInitials, size = 36, className = "", resolvedUrl: overrideUrl,
}: Props) {
  const [resolved, setResolved] = useState<string | null>(overrideUrl ?? null);
  const [uploadFailed, setUploadFailed] = useState(false);

  useEffect(() => {
    setUploadFailed(false);
    if (overrideUrl) { setResolved(overrideUrl); return; }
    if (picture && isUploadedPicture(picture)) {
      let cancelled = false;
      resolvePath(uploadedPicturePath(picture))
        .then((u) => { if (!cancelled) setResolved(u); })
        .catch(() => {
          if (!cancelled) {
            setResolved(null);
            setUploadFailed(true);
          }
        });
      return () => { cancelled = true; };
    }
    setResolved(null);
  }, [picture, overrideUrl]);

  const base =
    "rounded-full flex items-center justify-center select-none overflow-hidden flex-shrink-0";
  const style = { width: size, height: size };

  // 1. Uploaded image
  if (picture && isUploadedPicture(picture)) {
    if (resolved) {
      return (
        <span
          className={`${base} ${className}`}
          style={style}
          aria-label={fallbackInitials}
        >
          <img
            src={resolved}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        </span>
      );
    }
    if (uploadFailed) {
      // Bad path or permission — avoid flashing raw keys; show initials like a normal fallback.
      return (
        <span
          className={`${base} bg-gradient-to-br from-sunset-amber to-sunset-coral text-white font-bold ${className}`}
          style={style}
          title="Profile photo could not be loaded."
        >
          <span style={{ fontSize: Math.round(size * 0.36) }}>{fallbackInitials}</span>
        </span>
      );
    }
    // Loading state — show a soft pulse
    return (
      <span
        className={`${base} bg-foam animate-pulse ${className}`}
        style={style}
        aria-busy="true"
      />
    );
  }

  // 2. Emoji — never dump long ASCII (storage keys mistaken for emoji)
  if (picture) {
    const trimmed = picture.trim();
    const looksLikeKey =
      trimmed.includes("profile-pictures/") ||
      /^upload:/i.test(trimmed) ||
      (trimmed.length > 12 && /^[\x20-\x7E]+$/.test(trimmed) && !/\p{Extended_Pictographic}/u.test(trimmed));
    if (looksLikeKey) {
      return (
        <span
          className={`${base} bg-gradient-to-br from-sunset-amber to-sunset-coral text-white font-bold ${className}`}
          style={style}
        >
          <span style={{ fontSize: Math.round(size * 0.36) }}>{fallbackInitials}</span>
        </span>
      );
    }
    return (
      <span
        className={`${base} bg-foam border border-aqua/40 ${className}`}
        style={style}
        aria-hidden
      >
        <span style={{ fontSize: Math.round(size * 0.55), lineHeight: 1 }}>{trimmed}</span>
      </span>
    );
  }

  // 3. Initials
  return (
    <span
      className={`${base} bg-gradient-to-br from-sunset-amber to-sunset-coral text-white font-bold ${className}`}
      style={style}
    >
      <span style={{ fontSize: Math.round(size * 0.36) }}>{fallbackInitials}</span>
    </span>
  );
}
