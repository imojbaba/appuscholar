import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Engine } from "../harness/engines";
import { readFixture, writeFixture } from "../harness/fixture";

/** The prompts the Task 5 capture recorded, as aiuse sees them: `prompt` is what that capture stored beside the entry point that sent it. */
type Recorded = { entry: string; prompt: string };

/** The prompt literals core/test/aiuse.test.ts gives classifyAiUse (its Appu line with the trailing " ..." kept), and the first rule's head, which smoke/capture.ts classifies. */
const LITERALS: Array<[id: string, prompt: string]> = [
  ["literal-appu-help", "You are Appu, the help assistant ..."],
  ["literal-fallback", "Something new"],
  ["literal-continue", "Continue this writing"],
];

const reach = (n: number) => "x".repeat(n);

/**
 * One short typed input per row of v1's AIU_RULES (the table above aiuClassify, v1 5416-5441: 26 rows, first match wins), in row order, then the second branch of each row
 * that has one (the `|` alternations of rows 13, 21 and 25), and the two inputs that put "statistics tutor" (row 17) so that its last character is the 400th of the prompt and
 * the 401st, where aiuClassify's `slice(0, 400)` (5446) cuts. `row` is the 1-based row the input is meant to reach, or null for the fallback; the capture asks v1's own table
 * which row matches first and throws when it is not that one, so a probe that misses its row, or sits behind an earlier one, cannot be recorded.
 */
const PROBES: Array<[id: string, row: number | null, prompt: string]> = [
  ["row-01-continue", 1, "Continue this writing in the same register."],
  ["row-02-improve", 2, "Improve this text: fix grammar."],
  ["row-03-expand", 3, "Expand this text to about double its length."],
  ["row-04-translate-quotation", 4, "Translate the following English academic quotation into Hindi."],
  ["row-05-literature-review", 5, "You are an academic writing assistant.\nBelow are three abstracts."],
  ["row-06-apa-statistics", 6, "You are an APA 7th edition formatting expert."],
  ["row-07-thesis-supervisor", 7, "You are a thesis supervisor reading a student's draft."],
  ["row-08-viva", 8, "Play an examiner and ask exactly ONE realistic, probing question."],
  ["row-09-counter-arguments", 9, "Argue against the passage below."],
  ["row-10-research-gap", 10, "Read the abstracts and find a research gap."],
  ["row-11-project-realistic", 11, "Please judge whether a project idea is realistic."],
  ["row-12-literature-advice", 12, "You are an academic writing coach. Using the text below, advise."],
  ["row-13-summarise-research", 13, "Summarise the research text below."],
  ["row-14-read-a-paper", 14, "You are helping a first-year student read a paper."],
  ["row-15-case-study", 15, "You are a tutor helping a student of law study a case."],
  ["row-16-explain-concept", 16, "Explain the statistical concept of power."],
  ["row-17-statistics-tutor", 17, "You are a statistics tutor."],
  ["row-18-grammar-checker", 18, "You are a careful English grammar and usage checker."],
  ["row-19-dictionary", 19, "You are a bilingual English and Hindi dictionary helper."],
  ["row-20-one-abstract", 20, "You are reading the abstract of one research paper."],
  ["row-21-professor-raj", 21, "You are Professor RAJ, an AI teaching character."],
  ["row-22-screening", 22, "You are screening search results for a student."],
  ["row-23-search-terms", 23, "You help a student of nursing search research databases."],
  ["row-24-paraphrase", 24, "Paraphrase the passage below in the voice of the author."],
  ["row-25-analyze-style", 25, "Analyze the writing style of the text below."],
  ["row-26-writing-coach", 26, "You are a scholarly writing coach."],
  ["row-13-summarize-paper", 13, "Summarize the paper text below."],
  ["row-21-dr-shuddhi-grant", 21, "You are Dr Shuddhi Grant, an AI teaching character."],
  ["row-25-studying-style", 25, "You are studying the writing style of a text."],
  ["head-ends-at-400", 17, reach(400 - "statistics tutor".length) + "statistics tutor"],
  ["head-ends-at-401", null, reach(401 - "statistics tutor".length) + "statistics tutor"],
];

/**
 * aiuClassify (v1 5443) on the first 400 characters of every prompt test/golden/prompts/cases.json records, on the three literals, and on the probes above.
 * engines.ts registers the prompts capture before this one, so a write-mode `golden:capture all` captures prompts first and this capture
 * reads the file it has just written: a stale prompts fixture cannot be read in that order. Naming only `aiuse` reads whatever is on disk.
 * While that file does not exist, only the literals and the probes are recorded.
 */
export const aiuse: Engine = {
  name: "aiuse",
  async capture(v1, { check }) {
    const promptsFile = fileURLToPath(new URL("../prompts/cases.json", import.meta.url));
    const recorded: Array<[string, string]> = [];
    if (existsSync(promptsFile)) {
      const { cases } = readFixture<{ cases: Recorded[] }>("prompts", "cases");
      if (!Array.isArray(cases)) throw new Error("aiuse: prompts/cases.json has no cases array");
      cases.forEach((c, i) => {
        if (typeof c?.prompt !== "string") throw new Error(`aiuse: prompts/cases.json cases[${i}] has no prompt string`);
        recorded.push([`${c.entry}#${i}`, c.prompt.slice(0, 400)]);
      });
    }
    // The 1-based row of v1's AIU_RULES that matches the head first, as v1's own table says (0 when none does); the Appu line is answered before the table (5445), so it never gets here.
    const firstRow = v1.window.eval("(function (p) { return AIU_RULES.findIndex(function (r) { return r[0].test(p.slice(0, 400)); }) + 1; })") as (p: string) => number;
    const probes = PROBES.map(([id, row, prompt]) => {
      const got = firstRow(prompt);
      if (got !== (row ?? 0)) throw new Error(`aiuse: probe ${id} meant for row ${row ?? "none"} matches row ${got || "none"} of v1's AIU_RULES`);
      return { id, prompt, rule: row, out: v1.call("aiuClassify", prompt) };
    });
    const cases = [...LITERALS, ...recorded].map(([id, prompt]) => ({ id, prompt, out: v1.call("aiuClassify", prompt) }));
    return [writeFixture("aiuse", "cases", { rules: v1.eval<number>("AIU_RULES.length"), cases: [...cases, ...probes] }, v1, check)];
  },
};
