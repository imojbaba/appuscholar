import { stylePrompt, styleVocabNote, type StyleLevel, type StyleSample } from "@appuscholar/core";

/*
 * What Continue, Improve and Extend read of "My style" (ledger ruling R3; v1 stylePrompt 6975-6976 and sugNoteFull 6478-6481). The writing buttons
 * build their request in lib/ai/actions.ts from deps they are given; the style block is not one of them, so the style module's DocumentLayer (and,
 * while it is open, its Panel) keeps this snapshot of the open project's style current, and the actions read it when a request starts.
 * Nothing is stored here: the snapshot is the project's profile, "Use my style", vocabulary level and the samples' features, as read from its blobs.
 * With no layer mounted there is no snapshot, and the style is silently off (a test in styleLayer.test.tsx holds the layer to this).
 */

export type StyleSnapshot = {
  /** The project this was read for; a layer clears the snapshot only if it is still this project's. */
  projectId: string;
  /** style_profile.profile, the stored text. */
  profile: string;
  /** style_profile.on, "Use my style in suggestions". */
  on: boolean;
  /** style_meta.vocab_level, the ten-word check's result. */
  level: StyleLevel | null;
  /** style_samples, features only. */
  samples: StyleSample[];
};

let snapshot: StyleSnapshot | null = null;

export function setCurrentStyle(next: StyleSnapshot): void { snapshot = next; }
/** Forgets the snapshot if it is `projectId`'s (a layer going away, the vault locking, a blob that does not open). */
export function clearCurrentStyle(projectId: string): void { if (snapshot && snapshot.projectId === projectId) snapshot = null; }

/**
 * The block v1 appended to the Continue, Improve and Extend requests when "Use my style" is on and a profile exists (core's stylePrompt, with the
 * vocabulary level's rule), else undefined, so the request carries the profile only when the toggle is on.
 */
export function currentStylePrompt(): string | undefined {
  if (!snapshot) return undefined;
  const p = stylePrompt(snapshot.profile, snapshot.on, snapshot.level);
  return p === "" ? undefined : p;
}

/** v1 styleVocabNote: the sentence added to a suggestion's accuracy note naming longer words that are not in the student's own writing; "" when the style is off or the samples know fewer than 150 words. */
export function currentStyleVocabNote(orig: string, res: string): string {
  return snapshot ? styleVocabNote(orig, res, snapshot.samples, snapshot.on) : "";
}
