/**
 * What this device remembers about backups, as v1 did (appu_last_backup, appu_last_verify). Per device and never sent anywhere, so
 * "on this device" is true of it. Task C7 extends this file (the nudge's snooze).
 */
const BACKUP = "appu_last_backup";
const VERIFY = "appu_last_verify";

function put(key: string, ms: number): void {
  try { localStorage.setItem(key, String(ms)); } catch { /* a blocked store only loses the reminder */ }
}
function get(key: string): number {
  try {
    const v = parseInt(localStorage.getItem(key) ?? "0", 10);
    return v > 0 ? v : 0;
  } catch { return 0; }
}

/** Marks a backup made now (a plain or a locked one). */
export function stampBackup(now: number = Date.now()): void { put(BACKUP, now); }
/** When the last backup was made on this device (ms), or 0. */
export function lastBackup(): number { return get(BACKUP); }
/** Marks a backup file checked now. */
export function stampVerify(now: number = Date.now()): void { put(VERIFY, now); }
/** When a backup file was last checked on this device (ms), or 0. */
export function lastVerify(): number { return get(VERIFY); }
