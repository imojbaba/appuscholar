import { buildShelfSummaryPromptV2, type ApDoc } from "@appuscholar/core";
import type { ApNotesStore } from "@/lib/analyse/notes";
import type { ApNote } from "@/lib/blobs/kinds";

/*
 * "Your take first" (wave B Task 28, register row D-S2-132; canvas Read): the student writes what the paper says in their own words, and only then can the AI summary be asked for. Both are kept
 * with the paper, in its note: `take` (the student's words) and `summary` (the AI's, with the time it was made and whether only some of the paper was sent). The note is the one Compare, the card
 * and the walk-through share (`p:<pid>`; the practice paper and a pasted text keep v1's id), written through the notes client (lib/analyse/notes.ts), so a conflict with another window replays,
 * a locked vault holds the write, and every note carries `stages` and `card`.
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The fewest words the student's own lines need before the AI summary opens (v1 also asked for two lines; the label says "in two lines" but the rule counts words only). */
export const TAKE_MIN_WORDS = 12;

/** Whether the lines are enough to unlock the summary: at least TAKE_MIN_WORDS words, however they are laid out. */
export function takeReady(take: string): boolean {
  return take.split(/\s+/).filter(Boolean).length >= TAKE_MIN_WORDS;
}

/** The AI summary as the paper's note keeps it: the reply, when it was made, and whether the paper was too long to send whole (so only the passages that matter were read). */
export type Summary = NonNullable<ApNote["summary"]>;

/** The student's lines in a paper's note, or none. */
export const takeOf = (n: ApNote | undefined): string => n?.take ?? "";

/** The summary in a paper's note, or null (a note with an empty summary has none). */
export const summaryOf = (n: ApNote | undefined): Summary | null => (n?.summary && n.summary.text.trim() ? n.summary : null);

/**
 * A pasted text is read by the AI only once the box "I am allowed to read this paper…" is ticked, as Ask and the walk-through ask (apOk). A kept paper is not asked: v1's Summarise on the
 * Reading shelf never asked for the tick. The practice paper is v1's own. A kept paper's doc id is `p:<pid>` (Task 27).
 */
export const needsTick = (doc: Pick<ApDoc, "id" | "sample">): boolean => !doc.sample && !doc.id.startsWith("p:");

/** What makeSummary touches: the AI (callAI scans for personal data first and files the AI-use log), the field (fieldLabel), the copy, the paper and the notes. */
export type SummaryDeps = {
  callAI(prompt: string, opts: { temp: number; max: number; noLang?: boolean }): Promise<string>;
  field: string;
  t: T;
  doc: Pick<ApDoc, "id" | "title" | "pages">;
  put: ApNotesStore["put"];
  now?(): Date;
};
export type SummaryResult = { ok: true; summary: Summary } | { ok: false; message: string };

/**
 * "Show the AI summary" (v1's shSummarise 11685-11696 with wave A's selected passages, W18): core's buildShelfSummaryPromptV2 over the paper's pages (email addresses replaced; the opening, any
 * limitations, then the discussion, method and results, within 18,000 characters; temp 0.2, max 1000, noLang), and the reply, trimmed, is kept in the paper's note as `summary`, beside the
 * student's lines, which were kept as they were typed (v1 kept them as a note before it asked). A failure gives callAI's sentence with any tag removed, else "The summary could not be made.";
 * so does an empty reply (v1 would have shown only its comparison line). Nothing here stops a second press: the caller does, and a later summary replaces the earlier. The summary is returned
 * whether or not the note could be written (a pop-out, or a stored blob that does not open and the student kept), so the student sees what they asked for.
 */
export async function makeSummary(d: SummaryDeps): Promise<SummaryResult> {
  const built = buildShelfSummaryPromptV2(d.field, d.doc.pages);
  let out: string;
  try {
    out = String((await d.callAI(built.prompt, { temp: built.temp, max: built.max, noLang: built.noLang })) ?? "").trim();
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message ? e.message.replace(/<[^>]+>/g, "") : d.t("sh2_the_summary_could_not") };
  }
  if (!out) return { ok: false, message: d.t("sh2_the_summary_could_not") };
  const summary: Summary = { text: out, at: (d.now ? d.now() : new Date()).toISOString(), partial: built.pick.partial };
  d.put(d.doc, (n) => { n.summary = summary; });
  return { ok: true, summary };
}
