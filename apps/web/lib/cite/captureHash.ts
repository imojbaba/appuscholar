/*
 * The address the bookmark leaves: `#capture=<base64 JSON>` (lib/cite/capture.ts reads it, components/literature/AddingPaper.tsx shows it). This module only tells such a hash from any
 * other and says where one goes, so the places that must not wait for the heavy capture module (`/`, the vault's migration guard, the sign-in page) can ask without importing it.
 * Wave B Task 20 (register row D-S2-125, walk faults W5, W13).
 */

/** The start of the hash the bookmark opens the adding screen with. */
export const CAPTURE_PREFIX = "#capture=";

/** Whether `hash` (`location.hash`) is a bookmark's capture. */
export const isCaptureHash = (hash: string): boolean => hash.startsWith(CAPTURE_PREFIX);

/** The adding screen with `hash` carried as it is, percent-escapes and all; null when `hash` is not a capture. */
export const addingAddress = (hash: string): string | null => (isCaptureHash(hash) ? "/add" + hash : null);

/** What the bookmark's payload is made of: base64 of a UTF-8 JSON after encodeURIComponent, so letters, digits and percent-escapes; the raw base64 characters and the unreserved ones are let through too. */
const PAYLOAD = /^[A-Za-z0-9%+/=_.~-]*$/;

/**
 * The address a sign-in form sends the student to afterwards (its `redirectTo`): `/add#capture=...` when `value` is a capture hash (`#capture=...`, or that after `/add`), else `/`. The
 * value comes from a form field the browser filled, so it is checked here, on the server, and nothing but the adding screen with a capture in it is ever a target: not another path, not
 * another site, not a second hash. Wave B Task 20 fix round: a paper the student's bookmark brought while signed out is not lost at the sign-in redirect (a fragment never reaches the server,
 * so the sign-in page copies it from the browser's address).
 */
export function carriedCapture(value: unknown): string {
  if (typeof value !== "string") return "/";
  const hash = value.startsWith("/add") ? value.slice("/add".length) : value;
  if (!isCaptureHash(hash) || !PAYLOAD.test(hash.slice(CAPTURE_PREFIX.length))) return "/";
  return "/add" + hash;
}
