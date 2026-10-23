import { PLAIN_OUT, type StatsBlock } from "@appuscholar/core";
import { blocksToHtml } from "./results";

/**
 * "Explain in plain language" (v1 statsExplain, 12027-12036), ledger ruling R2: the text the AI is given and the request. Ported here, not in core.
 * The request carries the result's tables as text and the APA sentence, never a data row (rule 2 and R1): the rows are in memory in the lab store and nothing here reads them.
 * What differs from v1:
 * - `window._statsSummary` was the results HTML with its tags cut out by /<[^>]+>/; a note holding a literal "p < .001" (fmtP) made that expression eat everything up to the
 *   next ">", dropping the rest of the paragraph. Only real tags (a "<" followed by a letter or "/" and a letter) are cut here, and the five entities core writes are decoded,
 *   so the model reads "p < .001" (register row D-S2-69);
 * - the field name is the parameter `field` (v1's fieldName(), made by the caller with fieldLabel);
 * - the options are returned with the prompt, as core's builders do: temperature 0.3, at most 800 tokens (v1's {temp:0.3,max:800}).
 */

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', "#39": "'", nbsp: " " };
const decode = (s: string): string => s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_m, e: string) => ENTITIES[e]!);

/** v1 11999: the results as plain text: tags out, white space collapsed. */
export function statsExplainText(blocks: StatsBlock[]): string {
  return decode(blocksToHtml(blocks).replace(/<\/?[A-Za-z][^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export const EXPLAIN_TEMP = 0.3;
export const EXPLAIN_MAX = 800;

/** v1 statsExplain's request (12031): the system text verbatim, PLAIN_OUT, then the tables' text and the APA sentence. */
export function buildStatsExplainPrompt(field: string, tablesText: string, apa: string): { prompt: string; temp: number; max: number } {
  return {
    prompt: "You are a statistics tutor for students of " + field + ". A student ran this analysis. In 2 to 4 sentences of plain language, with no jargon beyond what a first-year knows, say what the result means and whether it was statistically significant (use alpha = .05 unless the summary states another). Say once that statistical significance does not show the effect is large or useful, and avoid causal wording unless the design in the summary was an experiment. Use only numbers given below and invent none." + PLAIN_OUT + "\n\nResult summary:\n" + tablesText + "\n\nAPA sentence: " + apa,
    temp: EXPLAIN_TEMP,
    max: EXPLAIN_MAX
  };
}
