/** The terms the student accepts at first use (and again when they change). Task 21 sets the date on deploy. */
export const TERMS_VERSION = 2;
export const TERMS_DATE = "16 October 2026";
/** Acceptances recorded before this instant were given to an older version of the terms and are asked again. */
export const TERMS_SINCE = "2026-10-16T00:00:00Z";

/**
 * The gate: true when the terms must be shown. False while /me has not loaded (no `me` yet, so nothing to decide),
 * true when the student never accepted, accepted before TERMS_SINCE, or the stored date is unreadable.
 */
export function needsTerms(me: { termsAcceptedAt: string | null } | null, since: string): boolean {
  if (!me) return false;
  if (!me.termsAcceptedAt) return true;
  const at = Date.parse(me.termsAcceptedAt);
  return Number.isNaN(at) || at < Date.parse(since);
}
