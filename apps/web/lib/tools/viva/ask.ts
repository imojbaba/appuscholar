import { buildVivaPrompt, VIVA_MIN_WORDS } from "@appuscholar/core";
import type { VivaLog } from "@/lib/blobs/kinds/viva";

/*
 * The viva question's logic (v1 vivaAsk 3608-3624, vivaSave 3625-3635), kept off the panel so a test can drive it. The prompt, its temperature (0.6) and its limit (700 tokens) are
 * core's buildVivaPrompt, held by a golden: this file adds no prompt of its own. Nothing here touches the document (rule 4): a question is read and answered, never inserted.
 */

export type VivaAud = "viva" | "conf";
/** v1 vivaSave keeps the last 60 answers (3629). */
export const VIVA_LOG_MAX = 60;

/** v1 `selText().trim()`: the selected text, else the whole document. */
export function vivaSource(selection: string, whole: string): string { return (selection || whole).trim(); }

/** v1 3610: at least 25 words, counted `split(/\s+/).filter(Boolean)`. */
export function vivaEnough(text: string): boolean { return text.trim().split(/\s+/).filter(Boolean).length >= VIVA_MIN_WORDS; }

/**
 * Asks for one question. `need` when the text is under 25 words (nothing is sent). The prompt holds the first 6,000 characters of the text (buildVivaPrompt cuts; this does not cut again).
 * `callAI` is the workspace's (personal-data scan before the request, the AI-use log after: lib/ai/callAI.ts); its error is the caller's to show.
 */
export async function askViva(a: { aud: VivaAud; text: string; callAI(prompt: string, opts: { temp: number; max: number }): Promise<string> }): Promise<{ kind: "need" } | { kind: "question"; q: string }> {
  if (!vivaEnough(a.text)) return { kind: "need" };
  const built = buildVivaPrompt(a.aud, a.text);
  const reply = (await a.callAI(built.prompt, { temp: built.temp, max: built.max })) || "";
  return { kind: "question", q: reply.trim() };
}

/** vivaSave's list: the entry after the earlier ones, only the last 60 kept. */
export function vivaAppend(prev: VivaLog | null, entry: VivaLog[number]): VivaLog { return [...(prev ?? []), entry].slice(-VIVA_LOG_MAX); }
