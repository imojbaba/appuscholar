import {
  GRAM_AI_MIN_CHARS, GRAM_LOCAL_MIN_CHARS, apJson, buildGrammarPrompt, gramAiMerge, gramChunks, gramLocal,
  type GramItem, type SpellStd
} from "@appuscholar/core";

/*
 * The grammar check's two layers (v1 gramRunLocal 6717-6723 and gramRunAI 6751-6785). The rules and the merge are core's (words.ts); what is here is the loop over the parts
 * of the text: each is sent through `callAI` (which scans for personal data first, and files the AI-use log), a failure ends the loop where it is, and what came back
 * so far is merged exactly as v1 merges it. Every count comes from code.
 */

/** What a check came to: the cards in order of place, and the AI line's counts (`parts` is 0 for the rules alone). `error`: the sentence callAI failed with ("" when it gave none), null when no request failed. */
export type GramRun = { items: GramItem[]; checked: number; parts: number; dropped: number; error: string | null };
/** `short`: too little text to check (v1 asks for some text first). */
export type GramOutcome = GramRun | "short";

/** v1 gramRunLocal: the rules alone (free, instant). Under 10 characters is "short". */
export function checkWithRules(text: string, std: SpellStd): GramOutcome {
  if (text.trim().length < GRAM_LOCAL_MIN_CHARS) return "short";
  return { items: gramLocal(text, std), checked: 0, parts: 0, dropped: 0, error: null };
}

export type AiDeps = {
  /** The AI call with the personal-data step in it (useCallAI). */
  callAI(prompt: string, o: { temp: number; max: number; noLang: boolean }): Promise<string>;
  field: string;
  std: SpellStd;
  /** False once the panel has gone: the loop stops asking. */
  alive(): boolean;
};

/** v1 gramRunAI: the first 9,000 characters in parts, one request each; under 30 characters is "short". Null when the panel went away part-way. */
export async function checkWithAi(text: string, d: AiDeps): Promise<GramOutcome | null> {
  if (text.trim().length < GRAM_AI_MIN_CHARS) return "short";
  const parsed: Array<{ edits?: unknown } | null> = [];
  let error: string | null = null;
  for (const part of gramChunks(text)) {
    if (!d.alive()) return null;
    try {
      const b = buildGrammarPrompt(d.field, d.std, part);
      const out = await d.callAI(b.prompt, { temp: b.temp, max: b.max, noLang: !!b.noLang });
      parsed.push(apJson(out) as { edits?: unknown } | null);
    } catch (e) {
      error = e instanceof Error ? e.message : "";
      break;
    }
  }
  if (!d.alive()) return null;
  return { ...gramAiMerge(text, parsed, d.std), error };
}
