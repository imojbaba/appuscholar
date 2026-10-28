/*
 * What the backup reminder remembers for the length of one page load, as v1's script-level state did (the one setTimeout at 4472): each page of v2
 * mounts its own shell, so moving between the list and a project, or between projects, must not ask the api again or wait the 4 seconds again,
 * and a reminder that is on screen stays on screen across those mounts until the student answers it (lib/help/recap/visit.ts does the same for the
 * recap). It lives here, outside the component, for that reason. A new page load starts empty.
 */

/** `checked`: the check has run (or been started) for this student; `words`: the draft words it found, null until it has; `shown`: the strip has appeared. */
export type NudgeVisit = { checked: boolean; words: number | null; shown: boolean };

const IDLE: NudgeVisit = Object.freeze({ checked: false, words: null, shown: false });
const visits = new Map<string, NudgeVisit>();
const listeners = new Set<() => void>();

/** This student's visit, the same object until it changes (for useSyncExternalStore). Nobody signed in: nothing. */
export function nudgeVisit(uid: string | null): NudgeVisit { return (uid && visits.get(uid)) || IDLE; }

export function patchNudgeVisit(uid: string, patch: Partial<NudgeVisit>): void {
  visits.set(uid, { ...nudgeVisit(uid), ...patch });
  for (const l of [...listeners]) l();
}

export function subscribeNudgeVisit(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** A new page load, for tests. */
export function resetNudgeVisit(): void {
  visits.clear();
  for (const l of [...listeners]) l();
}
