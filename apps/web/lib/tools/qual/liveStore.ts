import type { QualCode } from "@appuscholar/core";

/*
 * What the Coding panel last said about the codes and the colour preference, for the DocumentLayer in the same window. Two useProjectBlob instances in one window do not
 * share state (a save is announced to the OTHER windows, a pop-out, not to the one that saved), so the panel publishes here whenever the codes or the toggle change, and
 * the layer, which has its own blobs for the first read and for a pop-out's changes, takes what is newer. Each publish takes the next number of one counter: the layer
 * stamps every value its own blob delivers with the counter at that moment, and uses the panel's value only while it is newer than that.
 */
export type Live = { codes?: QualCode[]; codesAt: number; showcolors?: boolean; colorsAt: number };

const NONE: Live = { codesAt: 0, colorsAt: 0 };
const byProject = new Map<string, Live>();
const subs = new Set<() => void>();
let counter = 0;

const emit = () => { for (const f of subs) f(); };

/** The panel's codes (a list that can be read; not while they are being read, locked or broken). */
export function publishCodes(projectId: string, codes: QualCode[]): void {
  byProject.set(projectId, { ...(byProject.get(projectId) ?? NONE), codes, codesAt: ++counter });
  emit();
}

/** The panel's colour toggle: true when the colours are shown. */
export function publishColors(projectId: string, shown: boolean): void {
  byProject.set(projectId, { ...(byProject.get(projectId) ?? NONE), showcolors: shown, colorsAt: ++counter });
  emit();
}

/** The latest of the panel for a project; the same object until the next publish (useSyncExternalStore). */
export function liveOf(projectId: string): Live { return byProject.get(projectId) ?? NONE; }

/** The counter now: every publish so far has a number up to it. */
export const liveNow = (): number => counter;

export function subscribeLive(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/** For tests: forget everything. */
export function resetLive(): void {
  byProject.clear();
  counter = 0;
  emit();
}
