import {
  buildStyleAnalyzePrompt, buildStyleFilesPrompt, styleAddSample, styleCompose, styleSamplesKeep, styleWordCount, STYLE_MIN_WORDS, type StyleSample
} from "@appuscholar/core";
import { STYLE_MAX_FILES, STYLE_MAX_FILE_BYTES } from "./limits";

/*
 * The two ways a style is learned (v1 styleAnalyze 6977-6989 and styleAnalyzeFiles 7021-7051), with the page taken out: every guard, in v1's order,
 * and the request, but no markup. The panel hands in what v1 read from the page and the store (`LearnEnv`) and turns each outcome into a sentence.
 *
 * The sample's text lives in these functions' variables and in the prompt that goes to the AI, and nowhere else: what is stored of a sample is
 * addSampleTo's record, which is core's styleAddSample (features only, never the text). Progress lines carry a file's name and counts, not its text.
 */

export type AddStatus = "added" | "refused" | "full";
/** The list after a sample is offered: "refused" (under 80 words, or a sample of that name and size is there), "full" (100 are kept: v1 drops the new one, D1 report). */
export function addSampleTo(samples: StyleSample[], name: string, text: string, id: string, date: string): { status: AddStatus; samples: StyleSample[] } {
  const rec = styleAddSample(samples, name, text, id, date);
  if (!rec) return { status: "refused", samples };
  const kept = styleSamplesKeep([...samples, rec]);
  return { status: kept.length === samples.length ? "full" : "added", samples: kept };
}

/** v1 styleAddSample's id (6429): 's', the clock and three random characters, both in base 36. */
export function newSampleId(): string { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
/** v1's date for a sample and the declaration (6429, 6422): today as YYYY-MM-DD. */
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export type LearnProgress =
  | { kind: "reading"; i: number; n: number; name: string }
  | { kind: "studying-files"; files: number; words: number }
  | { kind: "studying" };
export type SkipWhy = "too-big" | "unreadable";
export type LearnOutcome =
  | { kind: "none" }
  | { kind: "need-words" }
  | { kind: "need-decl" }
  | { kind: "nothing-read"; skipped: string[] }
  | { kind: "learned"; files: number; words: number; skipped: Array<{ name: string; why: SkipWhy }>; full: boolean }
  | { kind: "error"; message: string }
  | { kind: "stopped" };

export type LearnEnv = {
  /** The declaration box is ticked (v1 styleDeclared). */
  declared: boolean;
  /** Offers a sample to the project's list (stored as features only); answers what became of it and the list after it. */
  addSample(name: string, text: string): { status: AddStatus; samples: StyleSample[] };
  /** Stores the profile (v1 styleSave of the box) with "Use my style" switched on (styleToggle): `text` is the AI's bullets plus the measured line. */
  saveProfile(text: string): void;
  callAI(prompt: string, o: { temp: number; max: number }): Promise<string>;
  readFile(f: File): Promise<string>;
  /** False once the panel is gone: nothing more is read, asked or stored. */
  alive(): boolean;
  onProgress(p: LearnProgress): void;
  /** Lets the page paint between two files (v1 7031: `await new Promise(r=>setTimeout(r,0))`). */
  tick(): Promise<void>;
};

const errorText = (e: unknown): string => (e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");

/** The guards that stand before anything is written or asked (v1 6979-6980): under 80 words, then no declaration. Null when both pass. */
export function precheckDocument(text: string, declared: boolean): LearnOutcome | null {
  if (styleWordCount(text.trim()) < STYLE_MIN_WORDS) return { kind: "need-words" };
  if (!declared) return { kind: "need-decl" };
  return null;
}
/** v1 7023-7024: no files chosen is a quiet nothing; files with no declaration are refused before any is read. */
export function precheckFiles(files: File[], declared: boolean): LearnOutcome | null {
  if (!files.length) return { kind: "none" };
  if (!declared) return { kind: "need-decl" };
  return null;
}

/** "Learn from my writing": the open document's text. The measured line is composed over every sample then stored, this one included. */
export async function learnFromDocument(text: string, env: LearnEnv): Promise<LearnOutcome> {
  const txt = text.trim();
  const refused = precheckDocument(txt, env.declared);
  if (refused) return refused;
  const added = env.addSample("Current document", txt);
  env.onProgress({ kind: "studying" });
  try {
    const b = buildStyleAnalyzePrompt(txt);
    const a = await env.callAI(b.prompt, { temp: b.temp, max: b.max });
    if (!env.alive()) return { kind: "stopped" };
    env.saveProfile(styleCompose(a, added.samples));
    return { kind: "learned", files: 1, words: styleWordCount(txt), skipped: [], full: added.status === "full" };
  } catch (e) {
    return env.alive() ? { kind: "error", message: errorText(e) } : { kind: "stopped" };
  }
}

/** "Learn from my files (up to 100)". */
export async function learnFromFiles(files: File[], env: LearnEnv): Promise<LearnOutcome> {
  const list = files.slice(0, STYLE_MAX_FILES);
  const refused = precheckFiles(list, env.declared);
  if (refused) return refused;
  const texts: string[] = [];
  const skipped: Array<{ name: string; why: SkipWhy }> = [];
  let words = 0, full = false, samples: StyleSample[] = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i]!;
    env.onProgress({ kind: "reading", i: i + 1, n: list.length, name: f.name });
    await env.tick();
    if (!env.alive()) return { kind: "stopped" };
    if (f.size > STYLE_MAX_FILE_BYTES) { skipped.push({ name: f.name, why: "too-big" }); continue; }
    try {
      const clean = String(await env.readFile(f)).replace(/\s+/g, " ").trim();
      if (clean) {
        texts.push(clean);
        words += clean.split(" ").length;
        const r = env.addSample(f.name, clean);
        samples = r.samples;
        if (r.status === "full") full = true;
      }
    } catch { skipped.push({ name: f.name, why: "unreadable" }); }
  }
  if (!env.alive()) return { kind: "stopped" };
  if (!texts.length || words < STYLE_MIN_WORDS) return { kind: "nothing-read", skipped: skipped.slice(0, 3).map((s) => s.name) };
  env.onProgress({ kind: "studying-files", files: texts.length, words });
  try {
    const b = buildStyleFilesPrompt(texts);
    const a = await env.callAI(b.prompt, { temp: b.temp, max: b.max });
    if (!env.alive()) return { kind: "stopped" };
    env.saveProfile(styleCompose(a, samples));
    return { kind: "learned", files: texts.length, words, skipped, full };
  } catch (e) {
    return env.alive() ? { kind: "error", message: errorText(e) } : { kind: "stopped" };
  }
}
