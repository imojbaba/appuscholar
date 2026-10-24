import { isPopout } from "@/lib/popout/mode";
import { readLastActive, stampActive } from "./gap";

/*
 * What the recap remembers for the length of one page load, as v1's script-level state did (LAST_ACTIVE_AT_LOAD 3694, _actTouch 3695, the one
 * setTimeout at 3750). It lives here, not in the host component, because each page of v2 mounts its own shell: moving from the list to a
 * project must not read the stamp again after this page load's own touches have overwritten it, and must not ask the question twice.
 */

/** v1 3750: the check runs 2.5 s after the page loads. */
export const RECAP_DELAY_MS = 2500;
/** v1 touchActive: the last visit is stamped at most once a minute. */
export const TOUCH_MS = 60_000;

let loadedAt = Date.now();
const atLoad = new Map<string, number>();
const checked = new Set<string>();
let touchedAt = 0;

/** When this page was loaded (a document the shell makes on load is not "new since the last visit"). */
export function pageLoadedAt(): number { return loadedAt; }

/** v1 LAST_ACTIVE_AT_LOAD: the stored last visit, read once for each account in this page load, before anything here stamps over it. */
export function lastVisitAtLoad(uid: string): number {
  let v = atLoad.get(uid);
  if (v === undefined) { v = readLastActive(uid); atLoad.set(uid, v); }
  return v;
}

/** Whether the check has run for this account in this page load. */
export function checkedThisLoad(uid: string): boolean { return checked.has(uid); }
export function markChecked(uid: string, on: boolean): void { if (on) checked.add(uid); else checked.delete(uid); }

/** v1 touchActive: stamps the last visit at most once a minute, and never in a pop-out. True when it stamped. */
export function touchActive(uid: string, now: number): boolean {
  if (now - touchedAt < TOUCH_MS || isPopout()) return false;
  lastVisitAtLoad(uid);
  touchedAt = now;
  return stampActive(uid, now);
}

/** The check's own stamp (v1 sets _actTouch with it, so an activity right after adds nothing). */
export function stampNow(uid: string, now: number): boolean {
  lastVisitAtLoad(uid);
  touchedAt = now;
  return stampActive(uid, now);
}

/** A new page load, for tests. */
export function resetVisit(now: number = Date.now()): void {
  loadedAt = now;
  atLoad.clear();
  checked.clear();
  touchedAt = 0;
}
