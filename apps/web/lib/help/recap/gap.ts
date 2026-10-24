/*
 * The gap rules of the welcome-back recap (v1 recapCheck 3739-3749, recapGapDays 3700, retSave 3729) and what it keeps on this device. v1 kept
 * `appu_last_active`, `appu_gap_days`, `appu_recap_off` and the answers (`appu_reflections` there) for the whole browser. One browser can hold
 * two accounts, so each key here ends in the account's id (ruling R5, register row D-C-66): one student's last visit, switch and answers are never
 * read for another. For no one signed in nothing is read and nothing is written. Nothing here is sent anywhere.
 */
export const LAST_ACTIVE_KEY = "appu_last_active";
export const GAP_KEY = "appu_gap_days";
export const OFF_KEY = "appu_recap_off";
export const ANSWERS_KEY = "appu_recap_answers";
export const DEFAULT_GAP_DAYS = 5;
/** v1 keeps the newest 30 sets of answers. */
export const KEEP_ANSWERS = 30;
const DAY_MS = 86_400_000;

/** The storage key of `base` for one account. */
export const recapKey = (base: string, uid: string): string => `${base}_${uid}`;

/** Whole days between the last visit and now (v1 Math.floor), never below zero. */
export function daysAway(lastActive: number, now: number): number {
  return Math.max(0, Math.floor((now - lastActive) / DAY_MS));
}

/** v1 recapCheck: not in a pop-out, not switched off, a last visit on record, and away at least the gap. */
export function shouldRecap(i: { lastActive: number; now: number; gap: number; off: boolean; popout: boolean }): boolean {
  if (i.popout || i.off) return false;
  if (!i.lastActive) return false;
  return daysAway(i.lastActive, i.now) >= i.gap;
}

function get(base: string, uid: string | null): string | null {
  if (!uid) return null;
  try { return localStorage.getItem(recapKey(base, uid)); } catch { return null; }
}
/** False when nothing was kept: no one signed in, or the browser refused (blocked or full storage). */
function set(base: string, uid: string | null, value: string): boolean {
  if (!uid) return false;
  try { localStorage.setItem(recapKey(base, uid), value); return true; } catch { return false; }
}

/** The last visit in ms, 0 when there is none. */
export function readLastActive(uid: string | null): number {
  const n = parseInt(get(LAST_ACTIVE_KEY, uid) ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
export function stampActive(uid: string | null, now: number): boolean { return set(LAST_ACTIVE_KEY, uid, String(now)); }

/** v1 recapGapDays: the account's gap in days when it is a positive number, else five. */
export function readGapDays(uid: string | null): number {
  const n = parseInt(get(GAP_KEY, uid) ?? "", 10);
  return n > 0 ? n : DEFAULT_GAP_DAYS;
}

export function recapOff(uid: string | null): boolean { return get(OFF_KEY, uid) === "1"; }
export function setRecapOff(uid: string | null, off: boolean): boolean { return set(OFF_KEY, uid, off ? "1" : "0"); }

export type Answers = { a1: string; a2: string; a3: string };
type Stored = Answers & { t: number };
/** "nothing": every answer was empty, so nothing was kept (v1 saves only when one is written). "failed": the device would not keep them. */
export type SaveResult = "saved" | "nothing" | "failed";

function readStored(uid: string | null): Stored[] {
  try {
    const a: unknown = JSON.parse(get(ANSWERS_KEY, uid) ?? "[]");
    if (!Array.isArray(a)) return [];
    return a.filter((x): x is Stored => !!x && typeof x === "object" && typeof (x as Stored).t === "number");
  } catch { return []; }
}

/** v1 retSave: the three answers, trimmed, kept only when at least one is written; the newest 30 stay. */
export function saveAnswers(uid: string | null, a: Answers, now: number): SaveResult {
  const a1 = a.a1.trim(), a2 = a.a2.trim(), a3 = a.a3.trim();
  if (!uid) return "failed";
  if (!a1 && !a2 && !a3) return "nothing";
  const list = readStored(uid);
  list.push({ t: now, a1, a2, a3 });
  return set(ANSWERS_KEY, uid, JSON.stringify(list.slice(-KEEP_ANSWERS))) ? "saved" : "failed";
}

/** The first answer of the newest saved set, with its time, when that set has one (v1 retRender shows it as "Last time you wrote"). */
export function lastAnswer(uid: string | null): { t: number; text: string } | null {
  const last = readStored(uid).slice(-1)[0];
  return last && typeof last.a1 === "string" && last.a1 ? { t: last.t, text: last.a1 } : null;
}
