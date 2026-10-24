/** v1 backupNudgeCheck (4454-4471): the reminder is for someone with this much writing. */
export const NUDGE_MIN_WORDS = 150;
/** v1: a backup this many whole days old is "old". */
export const OLD_DAYS = 7;
/** v1 backupSnooze (4453) and the check's `3*86400000`: Later hides the reminder for three days. */
export const SNOOZE_MS = 3 * 86_400_000;
const DAY = 86_400_000;

/** Which words the reminder carries: "new" (never backed up on this device) or "old" (the last backup is a week or more back). */
export type NudgeKind = "new" | "old";

/** Whole days since `last`, as v1 counts them (Math.floor of the milliseconds over a day). */
export function daysSince(last: number, now: number): number {
  return Math.floor((now - last) / DAY);
}

/**
 * Whether the backup reminder is due, as v1 decides it: snoozed shows nothing; under 150 words shows nothing; never backed up (`lastBackup` 0) is
 * "new"; a last backup seven or more whole days ago is "old"; otherwise nothing. `snoozedUntil` is when the snooze ends (0 for none).
 */
export function nudgeDue(i: { words: number; lastBackup: number; snoozedUntil: number; now: number }): NudgeKind | null {
  if (i.snoozedUntil > i.now) return null;
  if (i.words < NUDGE_MIN_WORDS) return null;
  if (!(i.lastBackup > 0)) return "new";
  return daysSince(i.lastBackup, i.now) >= OLD_DAYS ? "old" : null;
}

/** v1 4471: the reminder is looked for this long after the page has loaded. */
export const NUDGE_DELAY_MS = 4000;
/**
 * How long the reminder stays on screen before it steps aside for the rest of this page load (not v1: v1's stayed until Later or a backup). It is a
 * note in a corner of every place, and a corner holds the lower end of some panel's controls, so it never stays in the way; it comes back the next
 * time the app loads if there is still no backup, and Later still snoozes it for three days. A pointer over it or focus in it holds it open.
 */
export const NUDGE_SHOW_MS = 12_000;
