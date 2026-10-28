import { STYLE_LIVE_MIN_WORDS, styleLiveCompare, styleLiveWordCount, type StyleLiveResult, type StyleSample } from "@appuscholar/core";

/*
 * The typed-paraphrase check's guards, in v1's order (styleLiveRun 6500-6513, styleLiveInput 6514-6517). The comparison itself is core's styleLiveCompare.
 */

export type LiveOutcome =
  | { kind: "few" }
  | { kind: "pasted" }
  | { kind: "no-samples" }
  | { kind: "result"; result: Extract<StyleLiveResult, { ok: true }> };

/** True for an input event that put text in by pasting, dropping or yanking (v1 6519: the box is then marked and the text cannot be used). */
export function isPasteInput(inputType: string | undefined): boolean {
  return !!inputType && /insertFromPaste|insertFromDrop|insertFromYank/.test(inputType);
}

/** At least 60 words of letters, typed (not pasted), and at least one sample of 150 words, else the comparison. */
export function runLiveCheck(text: string, pasted: boolean, samples: StyleSample[]): LiveOutcome {
  if (styleLiveWordCount(text) < STYLE_LIVE_MIN_WORDS) return { kind: "few" };
  if (pasted) return { kind: "pasted" };
  const r = styleLiveCompare(text, samples);
  return r.ok ? { kind: "result", result: r } : { kind: "no-samples" };
}
