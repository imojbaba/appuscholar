/* The AI-quality test sets (wave B, Task Q1): six files under packages/quality/sets, one per AI feature, each 3 to 5 items of { id, input, good, expect }.
   `good` says in words what a good answer does; `expect` holds what the graders of grade.ts are held against; `input` is what the builder the web uses is given (Q2's runner builds the prompt
   from it). The builder each set drives:
     idea      buildIdeaPromptV2(field, idea)                  (apps/web/lib/ai/actions.ts: the idea check)
     summary   buildShelfSummaryPromptV2(field, [text])        (the shelf's summary; apBuild cuts the page into passages)
     gap       buildGapFinderPromptV2(field, papers)
     litreview buildLitReviewPrompt(field, papers)             (the web has no V2 of it)
     ask       buildAskPrompt(field, apBuild(title, [text], "pdf"), question)      once per question
     walk      buildWalkPrompt(field, apBuild(title, [text], "pdf"), AP_STAGES[k], attempt)      one stage per item: two papers, two stages each, four items
   PAPER TEXT RULE: a paper's text (or abstract) is stored only when the paper is CC BY or public domain, and then with its licence name, the licence's URL and its DOI. A paper stored by DOI
   only has `text: null` (or `abstract: null`), and its item has `unresolved: true`: the CLI of Q2 fetches it at run time. Text written for the test (not from a paper) has `synthetic: true`.
   Nothing here is copyrighted text or text recalled from memory. */
import ideaJson from "../sets/idea.json";
import summaryJson from "../sets/summary.json";
import gapJson from "../sets/gap.json";
import litreviewJson from "../sets/litreview.json";
import askJson from "../sets/ask.json";
import walkJson from "../sets/walk.json";

export type SetName = "idea" | "summary" | "gap" | "litreview" | "ask" | "walk";
export const SET_NAMES: readonly SetName[] = ["idea", "summary", "gap", "litreview", "ask", "walk"];

/** One item of a set. `unresolved` is true when a paper of the item is stored by DOI only; `synthetic` when the item's own words were written for the test. */
export interface QualityItem {
  id: string;
  input: unknown;
  good: string;
  expect: Record<string, unknown>;
  unresolved?: boolean;
  synthetic?: boolean;
}
/** A set file: which feature it tests, the core builder it drives, a note on where its items come from. */
export interface QualitySet { set: SetName; builder: string; note: string; items: QualityItem[] }

/** What every stored paper says about itself. `licence` is "CC BY 4.0" and the like, or "Public domain"; `doi` has no URL prefix. */
export interface PaperSource {
  title: string;
  authors: string;
  /** Every author as "Given Family", in the source's order. */
  authorList: string[];
  year: number;
  venue: string;
  doi: string;
  licence: string;
  licenceUrl: string;
  /** Where the text was taken from, and what was removed from it. */
  credit: string;
  synthetic?: boolean;
}
/** A paper for the summary, the Ask and the Walk-through: the text opens with "Abstract" and carries the headings Introduction, Methods, Results, Discussion, Limitations, Conclusions as lines of their own. */
export interface PaperWithText extends PaperSource { text: string | null }
/** A paper for the gap finder and the literature review: the shape of core's RsPaper, with the licence. */
export interface AbstractPaper extends PaperSource { source: string; abstract: string | null }

export interface IdeaInput { field: string; idea: { topic: string; resources?: string; timeframe?: string; constraints?: string } }
export interface SummaryInput { field: string; paper: PaperWithText }
export interface GapInput { field: string; group: string; papers: AbstractPaper[] }
export interface AskInput { field: string; paper: PaperWithText; questions: string[] }
export interface WalkInput { field: string; paper: PaperWithText; stage: { k: string; attempt: string } }

/** What the six sets expect (the fields of `QualityItem.expect`), for the runner of Q2.
 *  idea:      areas (the five area names, gradeAreas), verdicts (the three verdicts), label (gradeLabel)
 *  summary:   limitations (gradeLimitations; "a|b" means either), label
 *  gap:       namedMin (gradeGapNames: at least this many papers named by surname), numbered: false, label
 *  litreview: namedMin, numbered: false, label
 *  ask:       inPaper (per question), facts (per question: what an answer from the paper holds)
 *  walk:      facts (what the reading of that stage holds)
 *  Every set with a paper is also held to gradeNumbers (see `source` below); ask and walk to gradeQuotes. The ask and the walk carry no `label`: they log as "other help" today
 *  and Task Q3 (only with OJ's yes) may change that on purpose.
 *  The `source` gradeNumbers is given: for summary, the paper's text; for ask and walk, the paper's text and the student's own question or attempt (a number the student
 *  wrote is not the model's invention); for gap and litreview, core's rsCorpusText(papers) (each paper's authors, year, title and abstract, the
 *  numbered list the prompt shows), never the abstracts alone, which hold no years and so would make every "(Zhao & Zhou, 2026)" foreign. */
export interface Label { k: string; g: "text" | "feedback" | "explain" | "other" }

export const SETS: Record<SetName, QualitySet> = {
  idea: ideaJson as unknown as QualitySet,
  summary: summaryJson as unknown as QualitySet,
  gap: gapJson as unknown as QualitySet,
  litreview: litreviewJson as unknown as QualitySet,
  ask: askJson as unknown as QualitySet,
  walk: walkJson as unknown as QualitySet
};

/** Licences a stored text may carry. */
const ALLOWED_LICENCE = /^(CC BY( \d\.\d)?|CC0( 1\.0)?|Public domain)$/;
const DOI = /^10\.\d{4,9}\/\S+$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const hasText = (o: Obj): boolean => (typeof o.text === "string" && o.text.trim() !== "") || (typeof o.abstract === "string" && o.abstract.trim() !== "");

/** Every object inside a value that holds the text of a paper, with its path. */
function textHolders(v: unknown, path: string, out: Array<{ path: string; o: Obj }> = []): Array<{ path: string; o: Obj }> {
  if (Array.isArray(v)) v.forEach((x, i) => textHolders(x, `${path}[${i}]`, out));
  else if (isObj(v)) {
    if (hasText(v)) out.push({ path, o: v });
    for (const [k, x] of Object.entries(v)) textHolders(x, `${path}.${k}`, out);
  }
  return out;
}
/** Every object inside a value that is a paper stored by DOI only: it has a doi and a `text` or `abstract` key whose value is null. */
function doiOnly(v: unknown, path: string, out: Array<{ path: string; o: Obj }> = []): Array<{ path: string; o: Obj }> {
  if (Array.isArray(v)) v.forEach((x, i) => doiOnly(x, `${path}[${i}]`, out));
  else if (isObj(v)) {
    if (("text" in v && v.text === null) || ("abstract" in v && v.abstract === null)) out.push({ path, o: v });
    for (const [k, x] of Object.entries(v)) doiOnly(x, `${path}.${k}`, out);
  }
  return out;
}

/** The problems of a set file, in words (empty when it is sound): the shape of the set and of each item; 3 to 5 items; unique ids; a non-empty `good`; text only with a CC BY / CC0 / public
 *  domain licence and a DOI (or `synthetic: true`); `unresolved: true` exactly when a paper is stored by DOI only, and then with its DOI. */
export function validateSet(set: unknown): string[] {
  const bad: string[] = [];
  if (!isObj(set)) return ["the set is not an object"];
  const name = typeof set.set === "string" ? set.set : "?";
  if (!SET_NAMES.includes(name as SetName)) bad.push(`${name}: unknown set name`);
  if (typeof set.builder !== "string" || !set.builder.trim()) bad.push(`${name}: no builder named`);
  if (typeof set.note !== "string" || !set.note.trim()) bad.push(`${name}: no note on where the items come from`);
  const items = Array.isArray(set.items) ? (set.items as unknown[]) : null;
  if (!items) return [...bad, `${name}: items is not a list`];
  if (items.length < 3 || items.length > 5) bad.push(`${name}: needs 3 to 5 items, has ${items.length}`);
  const seen = new Set<string>();
  items.forEach((raw, n) => {
    if (!isObj(raw)) { bad.push(`${name}[${n}]: not an object`); return; }
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const at = `${name}/${id || "#" + n}`;
    if (!id) bad.push(`${at}: no id`);
    else if (seen.has(id)) bad.push(`${at}: repeated id`);
    seen.add(id);
    if (typeof raw.good !== "string" || !raw.good.trim()) bad.push(`${at}: \`good\` is empty`);
    if (!isObj(raw.expect)) bad.push(`${at}: \`expect\` is not an object`);
    if (!isObj(raw.input)) bad.push(`${at}: \`input\` is not an object`);
    if (raw.unresolved !== undefined && typeof raw.unresolved !== "boolean") bad.push(`${at}: unresolved is not true or false`);
    for (const { path, o } of textHolders(raw.input, "input")) {
      if (o.synthetic === true) continue;
      if (typeof o.doi !== "string" || !DOI.test(o.doi)) bad.push(`${at} ${path}: text without a DOI`);
      if (typeof o.licence !== "string" || !ALLOWED_LICENCE.test(o.licence)) bad.push(`${at} ${path}: text without a CC BY or public domain licence`);
    }
    const only = doiOnly(raw.input, "input");
    if ((only.length > 0) !== (raw.unresolved === true)) bad.push(`${at}: unresolved must be true exactly when a paper is stored by DOI only`);
    for (const { path, o } of only) if (typeof o.doi !== "string" || !DOI.test(o.doi)) bad.push(`${at} ${path}: a paper stored by DOI only needs its DOI`);
  });
  return bad;
}
