import { MIN_SAMPLE_WORDS, typedText } from "@appuscholar/core";
import type { WritingSamples } from "@/lib/blobs/kinds/samples";

/*
 * Writing-sample capture (v1 3925-3973, wave D): the pure part. One entry per document: the words the student typed themselves, AI-inserted text left
 * out (core's typedText), kept in the project's `writing_samples` blob. Opt-in here (ruling P2); v1 was on unless the student turned it off.
 */

export type WritingSample = WritingSamples[string];

/**
 * v1 saved a write on each 400 ms autosave; here every write is a sealed PUT of the whole blob, so a document is captured at most this often
 * (leaving the document or the page flushes the last change at once).
 */
export const SAMPLE_THROTTLE_MS = 60_000;

/**
 * The blob is sent whole and the api refuses a body past 2.8 MB, and sealing makes it a third larger, so nothing is added past this many bytes of
 * JSON (UTF-8: a Hindi letter is three). A copy that cannot be saved would stay held for good and make leaving the page ask first.
 */
export const SAMPLES_MAX_BYTES = 1_500_000;

/**
 * The projects (by id) whose copy did not take a new entry because it is full, until a write fits again or the copy is cleared. The Settings
 * status says so; it is this tab's memory only.
 */
export const fullSamples = new Set<string>();

/** v1 captureWritingSample's entry (3956-3958): null when the student typed fewer than MIN_SAMPLE_WORDS words. */
export function sampleOf(html: string, title: string, now: number): WritingSample | null {
  const { text, words } = typedText(html);
  return words < MIN_SAMPLE_WORDS ? null : { title, text, words, updated: now };
}

/** The blob with one document's entry set (or replaced); the other documents' entries stay as they are. */
export function withSample(prev: WritingSamples | null, docId: string, entry: WritingSample): WritingSamples {
  return { ...(prev ?? {}), [docId]: entry };
}

/** The blob without one document's entry (v1 3172 for a source; deleting a document is new here). */
export function withoutSample(prev: WritingSamples | null, docId: string): WritingSamples {
  const next = { ...(prev ?? {}) };
  delete next[docId];
  return next;
}

/** Whether the blob would stay under SAMPLES_MAX_BYTES, as UTF-8, with this entry in it. */
export function fitsBlob(prev: WritingSamples | null, docId: string, entry: WritingSample): boolean {
  return new TextEncoder().encode(JSON.stringify(withSample(prev, docId, entry))).length <= SAMPLES_MAX_BYTES;
}

/** v1 writingSampleStats (3960-3965): how many documents are stored and their words summed. */
export function sampleStats(v: WritingSamples | null): { count: number; words: number } {
  const entries = Object.values(v ?? {});
  return { count: entries.length, words: entries.reduce((sum, e) => sum + (e.words || 0), 0) };
}
