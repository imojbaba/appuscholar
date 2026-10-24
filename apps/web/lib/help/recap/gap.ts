/*
 * The gap rules of the welcome-back recap (v1 3529-3598), and what it keeps on this device. `appu_last_active`, `appu_gap_days`, `appu_recap_off` and
 * `appu_recap_answers` are per-device, as v1 kept them (the answers were `appu_reflections` there); nothing here is sent anywhere.
 */
export const LAST_ACTIVE_KEY = "appu_last_active";
export const GAP_KEY = "appu_gap_days";
export const OFF_KEY = "appu_recap_off";
export const ANSWERS_KEY = "appu_recap_answers";
export const DEFAULT_GAP_DAYS = 5;
/** v1 3600: the check runs 2.5 s after the page loads. */
export const RECAP_DELAY_MS = 2500;
/** v1 touchActive: the last visit is stamped at most once a minute. */
export const TOUCH_MS = 60_000;
/** v1 keeps the newest 30 sets of answers. */
export const KEEP_ANSWERS = 30;
const DAY_MS = 86_400_000;

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

function get(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function set(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: the recap simply does not remember */ }
}

/** The last visit in ms, 0 when there is none. */
export function readLastActive(): number {
  const n = parseInt(get(LAST_ACTIVE_KEY) ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
export function stampActive(now: number): void { set(LAST_ACTIVE_KEY, String(now)); }

/** v1 recapGapDays: appu_gap_days when it is a positive number, else five. */
export function readGapDays(): number {
  const n = parseInt(get(GAP_KEY) ?? "5", 10);
  return n > 0 ? n : DEFAULT_GAP_DAYS;
}

export function recapOff(): boolean { return get(OFF_KEY) === "1"; }
export function setRecapOff(off: boolean): void { set(OFF_KEY, off ? "1" : "0"); }

export type Answers = { a1: string; a2: string; a3: string };
type Stored = Answers & { t: number };

function readStored(): Stored[] {
  try {
    const a: unknown = JSON.parse(get(ANSWERS_KEY) ?? "[]");
    if (!Array.isArray(a)) return [];
    return a.filter((x): x is Stored => !!x && typeof x === "object" && typeof (x as Stored).t === "number");
  } catch { return []; }
}

/** v1 retSave: the three answers, trimmed, kept only when at least one is written; the newest 30 stay. True when something was saved. */
export function saveAnswers(a: Answers, now: number): boolean {
  const a1 = a.a1.trim(), a2 = a.a2.trim(), a3 = a.a3.trim();
  if (!a1 && !a2 && !a3) return false;
  const list = readStored();
  list.push({ t: now, a1, a2, a3 });
  set(ANSWERS_KEY, JSON.stringify(list.slice(-KEEP_ANSWERS)));
  return true;
}

/** The first answer of the newest set that has one, with its time (v1 shows it as "Last time you wrote"). */
export function lastAnswer(): { t: number; text: string } | null {
  const last = readStored().slice(-1)[0];
  return last && typeof last.a1 === "string" && last.a1 ? { t: last.t, text: last.a1 } : null;
}
