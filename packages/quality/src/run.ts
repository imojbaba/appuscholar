/* The runner of the AI-quality sets (wave B, Task Q2). `runSet` builds the prompt of each item with the builder the web uses and the web's temperature and max tokens, hands it to the `complete` it is given
   `repeats` times, grades every reply with the graders of grade.ts, and writes the result as markdown. It calls no provider itself and holds no key: the CLI (apps/api/scripts/quality.ts) wires `complete`.
   What the web sends for a student who reads English is the builder's prompt as it is: callAI (apps/web/lib/ai/callAI.ts) adds nothing to it, and the API appends contentLangInstruction("en"), which is
   empty, so the baseline measures the real prompt. The one step the runner cannot take is the personal-data question callAI asks first; an item whose prompt would raise it says so in the report.
   Grades by set (the builder each drives is in sets.ts):
     idea       gradeAreas, gradeLabel
     summary    gradeLimitations, gradeNumbers against the paper's text, gradeLabel
     gap        gradeGapNames against `namedMin` and `numbered`, gradeNumbers against rsCorpusText(papers), gradeLabel
     litreview  as gap
     ask        gradeQuotes, gradeNumbers, whether the reply's in_paper is the item's `inPaper`, which of its `facts` the answer holds
     walk       gradeQuotes, gradeNumbers, which of its `facts` the reading holds
   A number the student wrote (the question of an Ask, the attempt of a Walk-through) counts as the source's, as the paper's text does: a reply that repeats it has not made it up. A grade whose expectation an
   item does not give is not made. A failed call is a reply with an `error` and no grades; the run goes on. The error is the message of what `complete` threw, so a caller must throw only text that is safe to print. */
import {
  AP_STAGES, apBuild, apJson, buildAskPrompt, buildGapFinderPromptV2, buildIdeaPromptV2, buildLitReviewPrompt, buildShelfSummaryPromptV2, buildWalkPrompt, fieldLabel, rsCorpusText, scanText
} from "@appuscholar/core";
import type { Built, RsPaper } from "@appuscholar/core";
import { gradeAreas, gradeGapNames, gradeLabel, gradeLimitations, gradeNumbers, gradeQuotes } from "./grade";
import { SET_NAMES } from "./sets";
import type { AbstractPaper, AskInput, GapInput, IdeaInput, QualityItem, QualitySet, SetName, SummaryInput, WalkInput } from "./sets";

/** The longest prompt the API takes (apps/api/src/routes/ai.ts, CompleteBody.prompt). A longer one is not sent: the web would get a refusal, so the baseline records one too. */
export const PROMPT_MAX_CHARS = 60_000;

/** The provider call the runner is given: the prompt and the builder's options in, the reply's text out. It throws when the call fails. */
export type CompleteFn = (prompt: string, o: { temperature?: number; maxTokens?: number }) => Promise<string>;

export interface RunOptions {
  /** How many times each prompt is sent. A whole number of 1 or more. */
  repeats: number;
  /** For the report's header, when known. `model` may be a function, read once when the report is made (after the last call), as the model is learned from the replies. */
  provider?: string;
  model?: string | (() => string | undefined);
  /** The day of the run, "YYYY-MM-DD". The runner never reads the clock. */
  date?: string;
  /** Called after each call, so a long run can show where it is. */
  onCall?(c: { id: string; part?: number; repeat: number; of: number; ok: boolean }): void;
}

/** What each grader found in one reply. A grade is present only when the item gave its expectation (and the set has that grader). */
export interface ReplyGrades {
  areas?: { named: string[]; missing: string[] };
  limitations?: { expected: number; hits: string[]; notReported: boolean };
  names?: { numbered: boolean; named: string[]; papers: number; min: number | null };
  quotes?: { quotes: number; found: number };
  numbers?: { foreign: string[] };
  inPaper?: { expected: boolean; got: boolean | null; ok: boolean };
  facts?: { expected: string[]; held: string[]; missing: string[] };
}
/** One reply: its text and grades, or the reason there is none. */
export interface ReplyResult { text?: string; error?: string; grades: ReplyGrades }
/** One prompt of a set (an item; for the Ask, one question of an item) and its replies. */
export interface ItemResult {
  id: string;
  /** The question's number (from 1) and words, for the Ask. */
  part?: number;
  question?: string;
  good: string;
  promptChars: number;
  temperature: number;
  maxTokens: number;
  /** Whether the AI-use label of the prompt is the one the item expects; null when it expects none. The same for every repeat. */
  label: boolean | null;
  /** What callAI's personal-data scan finds in the prompt; the web would ask the student before sending it. */
  personalData: { total: number; found: string };
  replies: ReplyResult[];
}
export interface QualityReport {
  set: SetName;
  builder: string;
  repeats: number;
  header: { provider?: string; model?: string; date?: string };
  items: ItemResult[];
  /** Items the runner did not run, with the reason. */
  notRun: Array<{ id: string; reason: string }>;
  markdown: string;
}

/* ---- reading the items ----------------------------------------------------------------------------------------------------------------------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const strs = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);
const bools = (v: unknown): boolean[] | null => (Array.isArray(v) && v.every((x) => typeof x === "boolean") ? (v as boolean[]) : null);
type Label = Parameters<typeof gradeLabel>[1];
const labelOf = (v: unknown): Label | null => (isObj(v) && typeof v.k === "string" && ["text", "feedback", "explain", "other"].includes(v.g as string) ? (v as unknown as Label) : null);

/** The DOIs of the papers an input holds by DOI only (a `text` or `abstract` of null). */
function doiOnlyOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => doiOnlyOf(x, out));
  else if (isObj(v)) {
    if (("text" in v && v.text === null) || ("abstract" in v && v.abstract === null)) out.push(typeof v.doi === "string" ? v.doi : "no DOI");
    else for (const x of Object.values(v)) doiOnlyOf(x, out);
  }
  return out;
}

/** The text of a stored paper; a paper without any cannot be asked about. */
function textOf(p: { text?: string | null } | undefined): string {
  if (typeof p?.text !== "string" || !p.text.trim()) throw new Error("the paper has no text");
  return p.text;
}
/** A stored abstract as core's RsPaper (a null abstract is no abstract). */
const rsPaper = (p: AbstractPaper): RsPaper => ({ ...p, abstract: p.abstract ?? undefined });

/** Lower case, thousands commas out of numbers, hyphens and dashes as spaces: "8,899" and "8899", "cross-sectional" and "cross sectional" are the same fact. */
const norm = (s: string): string => s.toLowerCase().replace(/(\d),(?=\d)/g, "$1").replace(/[-‐-―]/g, " ").replace(/\s+/g, " ").trim();

/** The words of a reply that state things: every string of the JSON object the Ask and the Walk-through ask for, except the quotations; else the reply as it is. */
function proseOf(reply: string): string {
  const j = apJson(reply);
  if (!j || typeof j !== "object") return reply;
  const out: string[] = [];
  const walk = (v: unknown, key?: string): void => {
    if (key === "quotes") return;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(j);
  return out.join("\n");
}

/** The reply's in_paper when it is the JSON object the Ask asks for and says true or false; else null. */
function inPaperOf(reply: string): boolean | null {
  const j = apJson(reply) as { in_paper?: unknown } | null;
  return j && typeof j === "object" && typeof j.in_paper === "boolean" ? j.in_paper : null;
}

function factsGrade(reply: string, expected: string[]): NonNullable<ReplyGrades["facts"]> {
  const words = norm(proseOf(reply));
  const held = expected.filter((f) => words.includes(norm(f)));
  return { expected, held, missing: expected.filter((f) => !held.includes(f)) };
}

/* ---- the prompts ---------------------------------------------------------------------------------------------------------------------------- */

/** One prompt to send, and how to grade what comes back. */
interface Job { id: string; part?: number; question?: string; good: string; built: Built; label: boolean | null; grade(reply: string): ReplyGrades }

function jobsOf(name: SetName, item: QualityItem): Job[] {
  const exp = isObj(item.expect) ? item.expect : {};
  const expLabel = labelOf(exp.label);
  const job = (built: Built, grade: (reply: string) => ReplyGrades, extra: Partial<Job> = {}): Job =>
    ({ id: item.id, good: item.good, built, label: expLabel ? gradeLabel(built.prompt, expLabel) : null, grade, ...extra });
  const numbersAgainst = (source: string, reply: string): ReplyGrades => ({ numbers: gradeNumbers(source, reply) });

  if (name === "idea") {
    const i = item.input as IdeaInput;
    const areas = strs(exp.areas);
    return [job(buildIdeaPromptV2(fieldLabel(i.field), i.idea), (reply) => (areas ? { areas: gradeAreas(reply, areas) } : {}))];
  }
  if (name === "summary") {
    const i = item.input as SummaryInput;
    const text = textOf(i.paper);
    const lim = strs(exp.limitations);
    return [job(buildShelfSummaryPromptV2(fieldLabel(i.field), [text]), (reply) => ({
      ...(lim ? { limitations: { expected: lim.length, ...gradeLimitations(reply, lim) } } : {}), ...numbersAgainst(text, reply)
    }))];
  }
  if (name === "gap" || name === "litreview") {
    const i = item.input as GapInput;
    const papers = i.papers.map(rsPaper);
    const min = typeof exp.namedMin === "number" ? exp.namedMin : null;
    const built = (name === "gap" ? buildGapFinderPromptV2 : buildLitReviewPrompt)(fieldLabel(i.field), papers);
    const source = rsCorpusText(papers);
    return [job(built, (reply) => ({ names: { ...gradeGapNames(reply, papers), papers: papers.length, min }, ...numbersAgainst(source, reply) }))];
  }
  if (name === "ask") {
    const i = item.input as AskInput;
    const text = textOf(i.paper);
    const doc = apBuild(i.paper.title, [text], "pdf");
    const inPaper = bools(exp.inPaper);
    const facts = Array.isArray(exp.facts) ? exp.facts.map(strs) : null;
    return i.questions.map((q, n) => job(buildAskPrompt(fieldLabel(i.field), doc, q), (reply) => {
      const g: ReplyGrades = { quotes: gradeQuotes(doc, reply), ...numbersAgainst(text + "\n" + q, reply) };
      const want = inPaper?.[n];
      if (typeof want === "boolean") { const got = inPaperOf(reply); g.inPaper = { expected: want, got, ok: got === want }; }
      const f = facts?.[n];
      if (f) g.facts = factsGrade(reply, f);
      return g;
    }, { part: n + 1, question: q }));
  }
  const i = item.input as WalkInput;
  const text = textOf(i.paper);
  const doc = apBuild(i.paper.title, [text], "pdf");
  const stage = AP_STAGES.find((s) => s.k === i.stage.k);
  if (!stage) throw new Error(`there is no walk-through stage "${i.stage.k}"`);
  const facts = strs(exp.facts);
  return [job(buildWalkPrompt(fieldLabel(i.field), doc, stage, i.stage.attempt), (reply) => ({
    quotes: gradeQuotes(doc, reply), ...numbersAgainst(text + "\n" + i.stage.attempt, reply), ...(facts ? { facts: factsGrade(reply, facts) } : {})
  }))];
}

/* ---- the run -------------------------------------------------------------------------------------------------------------------------------- */

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim().slice(0, 200) || "unknown error";
const plural = (n: number, kind: string): string => `${n} ${n === 1 ? kind : kind.endsWith("s") ? kind + "es" : kind + "s"}`;
const thousands = (n: number): string => n.toLocaleString("en-US");

async function callOnce(job: Job, complete: CompleteFn): Promise<ReplyResult> {
  const { prompt, temp, max } = job.built;
  if (prompt.length > PROMPT_MAX_CHARS) return { error: `not sent: the prompt is ${thousands(prompt.length)} characters and the API accepts at most ${thousands(PROMPT_MAX_CHARS)}`, grades: {} };
  let text: string;
  try { text = await complete(prompt, { temperature: temp, maxTokens: max }); } catch (e) { return { error: errorText(e), grades: {} }; }
  if (typeof text !== "string") text = "";
  return { text, grades: job.grade(text) };
}

/** Runs one set: every item's prompt `repeats` times, one call after the other (a capped key and a provider's rate limit do not take them side by side), each reply graded. */
export async function runSet(set: QualitySet, complete: CompleteFn, o: RunOptions): Promise<QualityReport> {
  if (!Number.isInteger(o.repeats) || o.repeats < 1) throw new RangeError("repeats must be a whole number of 1 or more");
  if (!SET_NAMES.includes(set.set)) throw new Error(`unknown set "${String(set.set)}"`);
  const jobs: Job[] = [];
  const notRun: QualityReport["notRun"] = [];
  for (const item of set.items) {
    const dois = doiOnlyOf(item.input);
    if (item.unresolved === true || dois.length > 0) {
      const which = dois.length ? ` (${dois.join(", ")})` : "";
      notRun.push({ id: item.id, reason: `the ${dois.length > 1 ? "papers are" : "paper is"} stored by DOI only${which} and the runner does not fetch papers yet` });
      continue;
    }
    try { jobs.push(...jobsOf(set.set, item)); } catch (e) { notRun.push({ id: item.id, reason: "the item could not be built: " + errorText(e) }); }
  }
  const items: ItemResult[] = [];
  for (const job of jobs) {
    const replies: ReplyResult[] = [];
    for (let n = 1; n <= o.repeats; n++) {
      const reply = await callOnce(job, complete);
      replies.push(reply);
      o.onCall?.({ id: job.id, ...(job.part ? { part: job.part } : {}), repeat: n, of: o.repeats, ok: reply.text !== undefined });
    }
    const pd = scanText(job.built.prompt);
    items.push({
      id: job.id, ...(job.part ? { part: job.part, question: job.question } : {}), good: job.good,
      promptChars: job.built.prompt.length, temperature: job.built.temp, maxTokens: job.built.max, label: job.label,
      personalData: { total: pd.total, found: Object.entries(pd.counts).map(([k, n]) => plural(n, k)).join(", ") }, replies
    });
  }
  const model = typeof o.model === "function" ? o.model() : o.model;
  const header: QualityReport["header"] = { ...(o.provider ? { provider: o.provider } : {}), ...(model ? { model } : {}), ...(o.date ? { date: o.date } : {}) };
  const report = { set: set.set, builder: set.builder, repeats: o.repeats, header, items, notRun };
  return { ...report, markdown: renderMarkdown(report) };
}

/* ---- the report ---------------------------------------------------------------------------------------------------------------------------- */

const rowName = (r: Pick<ItemResult, "id" | "part">): string => (r.part ? `${r.id}, question ${r.part}` : r.id);
const received = (r: ItemResult): ReplyResult[] => r.replies.filter((x) => x.text !== undefined);
/** A table cell: a pipe or a line break in it would move the columns. */
const cellText = (s: string): string => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

/** One entry for each reply, in order: `f` of a received reply, a dash for a reply that did not arrive or has no such grade; a single dash when none has the grade. */
function per(r: ItemResult, f: (g: ReplyGrades) => string | null): string {
  const parts = r.replies.map((x) => (x.text !== undefined ? f(x.grades) : null));
  return parts.every((p) => p === null) ? "-" : parts.map((p) => p ?? "-").join(", ");
}
/** "k/n words": how many of the received replies pass `test`. */
function ratio(r: ItemResult, test: (g: ReplyGrades) => boolean | undefined, words: string): string {
  const got = received(r);
  return got.length ? `${got.filter((x) => test(x.grades)).length}/${got.length} ${words}` : "-";
}
const firstGrade = <K extends keyof ReplyGrades>(r: ItemResult, k: K): ReplyGrades[K] | undefined => r.replies.map((x) => x.grades[k]).find((g) => g !== undefined);

interface Column { head: string; cell(r: ItemResult): string }
const COL = {
  areas: { head: "Areas", cell: (r) => { const a = firstGrade(r, "areas"); return a ? ratio(r, (g) => g.areas && g.areas.missing.length === 0, `named all ${a.named.length + a.missing.length} areas`) : "-"; } },
  limitations: { head: "Limitations", cell: (r) => { const l = firstGrade(r, "limitations"); return l ? `found ${per(r, (g) => (g.limitations ? String(g.limitations.hits.length) : null))} of ${l.expected}` : "-"; } },
  notReported: { head: "Not reported", cell: (r) => (firstGrade(r, "limitations") ? ratio(r, (g) => g.limitations?.notReported, "wrote not reported") : "-") },
  names: { head: "Papers named", cell: (r) => { const n = firstGrade(r, "names"); return n ? `named ${per(r, (g) => (g.names ? String(g.names.named.length) : null))} of ${n.papers}${n.min !== null ? ` (needs ${n.min})` : ""}` : "-"; } },
  numbered: { head: "Numbered", cell: (r) => (firstGrade(r, "names") ? ratio(r, (g) => g.names?.numbered, "named papers by number") : "-") },
  quotes: { head: "Quotations", cell: (r) => (firstGrade(r, "quotes") ? `quotations found: ${per(r, (g) => (g.quotes ? `${g.quotes.found}/${g.quotes.quotes}` : null))}` : "-") },
  numbers: { head: "Numbers", cell: (r) => `foreign numbers: ${per(r, (g) => (g.numbers ? String(g.numbers.foreign.length) : null))}` },
  inPaper: { head: "In paper", cell: (r) => { const p = firstGrade(r, "inPaper"); return p ? ratio(r, (g) => g.inPaper?.ok, `said in_paper ${p.expected}`) : "-"; } },
  facts: { head: "Facts", cell: (r) => { const f = firstGrade(r, "facts"); return !f ? "-" : f.expected.length === 0 ? "no facts to check" : `facts held: ${per(r, (g) => (g.facts ? `${g.facts.held.length}/${g.facts.expected.length}` : null))}`; } },
  label: { head: "AI-use label", cell: (r) => (r.label === null ? "-" : r.label ? "right" : "wrong") }
} satisfies Record<string, Column>;
const COLUMNS: Record<SetName, Column[]> = {
  idea: [COL.areas],
  summary: [COL.limitations, COL.notReported, COL.numbers],
  gap: [COL.names, COL.numbered, COL.numbers],
  litreview: [COL.names, COL.numbered, COL.numbers],
  ask: [COL.quotes, COL.numbers, COL.inPaper, COL.facts],
  walk: [COL.quotes, COL.numbers, COL.facts]
};

/** One reply's grades, a line each. */
function gradeLines(g: ReplyGrades): string[] {
  const out: string[] = [];
  if (g.areas) out.push(`Areas named: ${g.areas.named.length} of ${g.areas.named.length + g.areas.missing.length}${g.areas.missing.length ? ` (missing: ${g.areas.missing.join(", ")})` : ""}.`);
  if (g.limitations) {
    out.push(`Limitations found: ${g.limitations.hits.length} of ${g.limitations.expected}${g.limitations.hits.length ? ` (${g.limitations.hits.join(", ")})` : ""}.`);
    out.push(`Wrote not reported under Limitations: ${g.limitations.notReported ? "yes" : "no"}.`);
  }
  if (g.names) {
    out.push(`Papers named by first author: ${g.names.named.length} of ${g.names.papers}${g.names.named.length ? ` (${g.names.named.join(", ")})` : ""}${g.names.min !== null ? `; needs at least ${g.names.min}` : ""}.`);
    out.push(`Papers named by number: ${g.names.numbered ? "yes" : "no"}.`);
  }
  if (g.quotes) out.push(`Quotations found in the paper: ${g.quotes.found} of ${g.quotes.quotes}.`);
  if (g.numbers) out.push(`Numbers not in the source: ${g.numbers.foreign.length ? g.numbers.foreign.join(", ") : "none"}.`);
  if (g.inPaper) out.push(`in_paper: ${g.inPaper.got === null ? "not readable" : g.inPaper.got} (expected ${g.inPaper.expected}).`);
  if (g.facts && g.facts.expected.length) out.push(`Facts held: ${g.facts.held.length} of ${g.facts.expected.length}${g.facts.missing.length ? ` (missing: ${g.facts.missing.join(", ")})` : ""}.`);
  return out;
}

/** A fence one backtick longer than the longest run in the reply, so the reply cannot close it. */
function fence(s: string): string {
  const longest = (s.match(/`+/g) ?? []).reduce((m, x) => Math.max(m, x.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

function renderMarkdown(r: Omit<QualityReport, "markdown">): string {
  const cols = [...COLUMNS[r.set], ...(r.items.some((i) => i.label !== null) ? [COL.label] : [])];
  const row = (cells: string[]): string => "| " + cells.map(cellText).join(" | ") + " |";
  const out: string[] = [`# Quality report: ${r.set}`, "", `- Set: ${r.set}`, `- Builder: ${r.builder}`, `- Repeats: ${r.repeats}`];
  if (r.header.provider) out.push(`- Provider: ${r.header.provider}`);
  if (r.header.model) out.push(`- Model: ${r.header.model}`);
  if (r.header.date) out.push(`- Date: ${r.header.date}`);
  out.push("", "The prompts are the ones the web sends for a student who reads English. The replies below are the provider's own words, unchanged.", "", "## Summary", "");
  out.push(row(["Item", "Replies", ...cols.map((c) => c.head)]), row(["---", "---", ...cols.map(() => "---")]));
  for (const it of r.items) {
    const got = received(it).length, failed = it.replies.length - got;
    out.push(row([rowName(it), `${got}/${it.replies.length}${failed ? ` (${failed} failed)` : ""}`, ...cols.map((c) => c.cell(it))]));
  }
  for (const n of r.notRun) out.push(row([n.id, "not run", ...cols.map(() => "-")]));
  out.push("", "A dash stands for a reply that did not arrive or a grade the item does not have. Foreign numbers are numbers in a reply that the source text (the paper, or the abstracts) does not hold.");
  if (r.notRun.length) { out.push("", "## Not run", ""); for (const n of r.notRun) out.push(`- ${n.id}: ${n.reason}`); }
  out.push("", "## Replies");
  for (const it of r.items) {
    out.push("", `### ${rowName(it)}`, "");
    if (it.question) out.push(`Question: ${it.question}`, "");
    out.push(`Prompt: ${thousands(it.promptChars)} characters, temperature ${it.temperature}, max tokens ${thousands(it.maxTokens)}.${it.label === null ? "" : ` AI-use label: ${it.label ? "right" : "wrong"}.`}`);
    if (it.personalData.total) out.push("", `The web would ask about personal data before sending this prompt (${it.personalData.found}); the runner sends it as it is.`);
    out.push("", `A good answer: ${it.good}`);
    it.replies.forEach((x, n) => {
      out.push("", `#### Reply ${n + 1} of ${it.replies.length}`, "");
      if (x.text === undefined) { out.push(`No reply (${x.error ?? "unknown error"}). Nothing to grade.`); return; }
      for (const l of gradeLines(x.grades)) out.push(`- ${l}`);
      const f = fence(x.text);
      out.push("", f + "text", x.text, f);
    });
  }
  return out.join("\n") + "\n";
}
