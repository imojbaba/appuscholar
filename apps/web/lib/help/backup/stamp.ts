/**
 * What this device remembers about a student's backups, as v1 did (appu_last_backup, appu_last_verify), one set per signed-in student:
 * `appu_last_backup_<userId>` and `appu_last_verify_<userId>`, the way the AI keys are kept (lib/ai/keys.ts), so a second student on a shared
 * computer never sees or inherits the first one's dates. Per device and never sent anywhere, so "on this device" is true of it. With no user
 * id (nobody signed in yet) nothing is read and nothing is written; the old device-wide keys are never read. The backup reminder's snooze
 * (`appu_backup_snooze_<userId>`, Task C7) is kept the same way.
 */
import { SNOOZE_MS } from "./nudge";

const BACKUP = "appu_last_backup";
const VERIFY = "appu_last_verify";
const SNOOZE = "appu_backup_snooze";

/** The signed-in student's id, as `useSettings().me?.id` has it. */
export type Who = string | null | undefined;

function put(base: string, who: Who, ms: number): void {
  if (!who) return;
  try { localStorage.setItem(`${base}_${who}`, String(ms)); } catch { /* a blocked store only loses the reminder */ }
}
function get(base: string, who: Who): number {
  if (!who) return 0;
  try {
    const v = parseInt(localStorage.getItem(`${base}_${who}`) ?? "0", 10);
    return v > 0 ? v : 0;
  } catch { return 0; }
}

/** Marks a backup made now (a plain or a locked one) for this student. */
export function stampBackup(who: Who, now: number = Date.now()): void { put(BACKUP, who, now); }
/** When this student last made a backup on this device (ms), or 0. */
export function lastBackup(who: Who): number { return get(BACKUP, who); }
/** Marks a backup file checked now for this student. */
export function stampVerify(who: Who, now: number = Date.now()): void { put(VERIFY, who, now); }
/** When this student last checked a backup file on this device (ms), or 0. */
export function lastVerify(who: Who): number { return get(VERIFY, who); }

/** "Later" on the backup reminder: it stays away for three days. Kept as the time the snooze ends (v1 kept the time it began). */
export function snoozeNudge(who: Who, now: number = Date.now()): void { put(SNOOZE, who, now + SNOOZE_MS); }
/** When this student's snooze of the backup reminder ends on this device (ms), or 0. */
export function snoozedUntil(who: Who): number { return get(SNOOZE, who); }
