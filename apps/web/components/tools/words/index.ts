import type { StageBlobs, ToolFacts } from "@/lib/tools/registry";

/**
 * Words and grammar (v1 `words`): Writing's Words tab. Built: the Panel draws it. Light on purpose (lib/tools/registry.ts loads every module with the page): the engine
 * is core's and the dictionary is fetched only when a word is looked up.
 */
export const built = true;
export { Panel } from "./Panel";

/** The home's line for Writing: how many words the word bank holds. Nothing to say until it holds one. */
export function facts(b: StageBlobs): ToolFacts {
  const bank = b.words_bank?.value;
  const n = Array.isArray(bank) ? bank.length : 0;
  if (n === 0) return { started: false };
  return n === 1 ? { detail: "wd2_fact_one", started: true } : { detail: "wd2_fact_n", vars: { n }, started: true };
}
