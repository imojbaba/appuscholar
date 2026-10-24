import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGapFinderPromptV2, buildLitReviewPrompt, buildQuickReadPrompt, rsCorpusText, type RsPaper, type RsQuick } from "@appuscholar/core";
import { tFormat } from "../lib/i18n";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { gapFinder, litReview, quickRead, type GeneratorDeps, type QuickDeps } from "../lib/ai/actions";
import { openExternal, readNow } from "../lib/research/extras";
import { filterVals, FILTER_EMPTY, shownResults } from "../lib/research/useSearch";

/*
 * Task 10's pure orchestration, as Find uses it: the quick read of one abstract (rsQuickP 8171-8182; "Read the abstract with AI" in More), the two generators
 * (researchLitReview / researchGapFinder 8530-8551, which Compare brings back in Task 22), the Analyse handoff (rsAnalyse 8407-8419), the Scholar link
 * (rsOpenExternal 8424-8434) and the filters (rsFilterVals / rsApplySort 8332-8374). The ticked papers' quick read, the CSV download and the filters' count sentence
 * left with the Research panel (register row D-S2-123). Replies come from the research golden fixture's `quick` cases, so the expected RsQuick is the one v1's
 * rsQuickCheck returned.
 */

const E = en as Record<string, string>;
const t = (key: string, vars?: Record<string, string | number>) => tFormat(E, hi as Record<string, string>, key, "en", vars);
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Fx = { papers: RsPaper[]; quick: Array<{ ab: string; raw: string; out: RsQuick | null }> };
const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/research/cases.json"), "utf8")) as Fx;
/** The research fixture's papers without the quick read and the fit the inputs carry. */
const papers = (): RsPaper[] => FX.papers.map((p) => { const { quick: _q, rel: _r, ...rest } = p; return rest as RsPaper; });
const longAb = FX.quick[0]!.ab;

function quickDeps(replies: Array<string | Error>) {
  const log = { toasts: [] as string[], ai: [] as Array<{ prompt: string; opts: unknown }>, applied: [] as Array<ReadonlyArray<readonly [RsPaper, RsQuick]>> };
  let k = 0;
  const d: QuickDeps = {
    field: "psychology", t,
    callAI: async (prompt, opts) => { log.ai.push({ prompt, opts }); const r = replies[k++ % replies.length]!; if (r instanceof Error) throw r; return r; },
    toast: (m) => { log.toasts.push(m); },
    apply: (u) => { log.applied.push(u); }
  };
  return { d, log };
}

describe("quickRead (rsQuickP 8172-8182)", () => {
  it("fewer than 150 characters once white space is removed: v1's toast and no AI call", async () => {
    const { d, log } = quickDeps(["{}"]);
    const short = FX.quick.find((c) => c.ab.replace(/\s+/g, "").length < 150)!.ab;
    expect(await quickRead({ ...papers()[0]!, abstract: "  " + short + "  " }, d)).toBe(false);
    expect(await quickRead({ ...papers()[0]!, abstract: undefined }, d)).toBe(false);
    expect(log.toasts).toEqual(["This result has no abstract to read.", "This result has no abstract to read."]);
    expect(log.ai).toEqual([]);
    expect(log.applied).toEqual([]);
  });

  it("the prompt and options are core's, on the trimmed abstract; the reply is read by rsQuickCheck and written on the paper", async () => {
    const c = FX.quick[0]!;
    const { d, log } = quickDeps([c.raw]);
    const p = { ...papers()[0]!, abstract: "\n " + c.ab + " \n" };
    expect(await quickRead(p, d)).toBe(true);
    const built = buildQuickReadPrompt("psychology", c.ab);
    expect(log.ai).toEqual([{ prompt: built.prompt, opts: { temp: 0.1, max: 700, noLang: true } }]);
    expect(log.applied).toHaveLength(1);
    expect(log.applied[0]![0]![0]).toBe(p);
    expect(log.applied[0]![0]![1]).toEqual(c.out);
    expect(log.toasts).toEqual([]);
  });

  it("Review Focus 3: a summary holding a number the abstract lacks is dropped, the design and sample keep their own confirmation", async () => {
    const c = FX.quick[1]!;
    expect(c.out).toEqual({ summaryDropped: true, design: { type: "randomised trial", quote: "in this randomised trial", ok: true }, sample: { n: 1200, quote: "1,200 adolescents", ok: true } });
    const { d, log } = quickDeps([c.raw]);
    await quickRead({ ...papers()[0]!, abstract: c.ab }, d);
    expect(log.applied[0]![0]![1]).toEqual(c.out);
  });

  it("an unreadable reply: v1's toast, nothing written; a failed call toasts its message", async () => {
    const bad = FX.quick.find((c) => c.out === null && c.ab.replace(/\s+/g, "").length >= 150)!;
    const { d, log } = quickDeps([bad.raw, new Error("Your AI key was refused (401).")]);
    expect(await quickRead({ ...papers()[0]!, abstract: bad.ab }, d)).toBe(false);
    expect(await quickRead({ ...papers()[0]!, abstract: bad.ab }, d)).toBe(false);
    expect(log.toasts).toEqual(["The AI reply could not be read. Try again.", "Your AI key was refused (401)."]);
    expect(log.applied).toEqual([]);
  });
});

function genDeps(reply: string | Error = "A paragraph.") {
  const log = { toasts: [] as string[], ai: [] as Array<{ prompt: string; opts: unknown }>, thinking: [] as unknown[][], set: [] as unknown[][], cleared: [] as unknown[] };
  let token = 0;
  const d: GeneratorDeps = {
    field: "psychology", t,
    callAI: async (prompt, opts) => { log.ai.push({ prompt, opts }); if (reply instanceof Error) throw reply; return reply; },
    setThinking: (...a) => { log.thinking.push(a); return ++token; },
    isCurrent: (tk) => tk === token,
    set: (...a) => { log.set.push(a); },
    clear: (m) => { log.cleared.push(m); },
    toast: (m) => { log.toasts.push(m); }
  };
  return { d, log };
}

describe("the literature review and the research gap (researchLitReview / researchGapFinder 8530-8551)", () => {
  for (const [name, run, build, label] of [
    ["litReview", litReview, buildLitReviewPrompt, (n: number) => "💜 Reading " + n + " abstracts and drafting…"],
    ["gapFinder", gapFinder, buildGapFinderPromptV2, () => "💜 Looking for what these papers leave unanswered…"]
  ] as const) {
    it(`${name}: fewer than 2 ticked papers toasts v1's sentence and calls nothing`, async () => {
      const { d, log } = genDeps();
      await run([], d);
      await run([papers()[0]!], d);
      expect(log.toasts).toEqual(["Check at least 2 papers above first", "Check at least 2 papers above first"]);
      expect(log.ai).toEqual([]);
      expect(log.thinking).toEqual([]);
    });

    it(`${name}: core's prompt over rsCorpusText, temp 0.35 max 1200, v1's pane text, an insertable answer and v1's toast`, async () => {
      const ps = papers().slice(0, 3);
      const { d, log } = genDeps("Draft.");
      await run(ps, d);
      const built = build("psychology", ps);
      expect(built.prompt).toContain("\n\nPAPERS:\n" + rsCorpusText(ps));
      expect(log.ai).toEqual([{ prompt: built.prompt, opts: { temp: 0.35, max: 1200 } }]);
      expect(log.thinking).toEqual([["custom", null, label(3)]]);
      expect(log.set).toEqual([["Draft.", null, 1]]);
      expect(log.toasts).toEqual(["Ready — press Tab in the editor to insert"]);
    });

    it(`${name}: a failure shows the message in the pane and toasts it; a superseded answer is dropped`, async () => {
      const { d, log } = genDeps(new Error("No AI key yet."));
      await run(papers().slice(0, 2), d);
      expect(log.cleared).toEqual(["No AI key yet."]);
      expect(log.toasts).toEqual(["No AI key yet."]);
      const g = genDeps("late");
      g.d.isCurrent = () => false;
      await run(papers().slice(0, 2), g.d);
      expect(g.log.set).toEqual([]);
      expect(g.log.toasts).toEqual([]);
    });
  }
});

describe("readNow (rsAnalyse 8407-8419, its refusal; the reader opens on the kept paper, wave B Task 27)", () => {
  const deps = () => {
    const log = { toasts: [] as string[], opened: 0 };
    return { log, d: { t, toast: (m: string) => { log.toasts.push(m); }, open: () => { log.opened++; } } };
  };
  it("an abstract long enough to read opens the reader and says nothing (the reader says it is only the abstract)", () => {
    const { d, log } = deps();
    expect(readNow({ ...papers()[0]!, abstract: "  " + longAb + " " }, d)).toBe(true);
    expect(log.opened).toBe(1);
    expect(log.toasts).toEqual([]);
  });
  it("no abstract: v1's two toasts (free PDF or not), nothing opens", () => {
    const { d, log } = deps();
    expect(readNow({ ...papers()[0]!, abstract: "too short", oaUrl: "https://x.org/a.pdf" }, d)).toBe(false);
    expect(readNow({ ...papers()[0]!, abstract: "", oaUrl: "" }, d)).toBe(false);
    expect(log.toasts).toEqual([
      "No abstract came with this result. Use the free PDF button, download the paper and load it in Analyse a paper.",
      "No abstract came with this result (PubMed results often have none here). Open the source and paste the text into Analyse a paper."
    ]);
    expect(log.opened).toBe(0);
  });
  it("150 characters that are not white space are the line, as QUICK_READ_MIN_CHARS says", () => {
    const { d, log } = deps();
    expect(readNow({ ...papers()[0]!, abstract: "x ".repeat(149) }, d)).toBe(false);
    expect(readNow({ ...papers()[0]!, abstract: "x ".repeat(150) }, d)).toBe(true);
    expect(log.opened).toBe(1);
  });
});

describe("openExternal (rsOpenExternal 8424-8434)", () => {
  it("Google Scholar, with the topic encoded, in a new tab; no topic toasts", () => {
    const opened: string[] = [];
    const toasts: string[] = [];
    const d = { t, open: (u: string) => { opened.push(u); }, toast: (m: string) => { toasts.push(m); } };
    openExternal("scholar", "  exam anxiety & sleep ", d);
    expect(opened).toEqual(["https://scholar.google.com/scholar?q=" + encodeURIComponent("exam anxiety & sleep")]);
    openExternal("scholar", "   ", d);
    expect(toasts).toEqual(["Type a search topic first"]);
    // JSTOR, ScienceDirect and BASE have no button any more, so nothing opens for them
    openExternal("jstor", "exam anxiety", d);
    expect(opened).toHaveLength(1);
  });
});

describe("the filters (rsFilterVals 8332-8335, rsApplySort 8354-8374)", () => {
  it("reads the boxes as v1 does", () => {
    expect(filterVals(FILTER_EMPTY)).toEqual({ year: 0, oa: false, ret: false, des: "", n: 0 });
    expect(filterVals({ year: "2019x", oa: true, ret: true, des: "cohort study", n: " 50" })).toEqual({ year: 2019, oa: true, ret: true, des: "cohort study", n: 50 });
  });
  it("hides by rsFilterPass, counts the papers hidden for want of a quick read, then sorts", () => {
    const all = FX.papers;
    const none = shownResults(all, "relevance", FILTER_EMPTY);
    expect(none.list).toEqual(all);
    const yr = shownResults(all, "year", { ...FILTER_EMPTY, year: "2020" });
    expect(yr.list.every((p) => parseInt(String(p.year), 10) >= 2020)).toBe(true);
    const unread = all.map((p) => ({ ...p, quick: undefined }));
    const q = shownResults(unread, "relevance", { ...FILTER_EMPTY, n: "10" });
    expect(q).toEqual({ list: [], needQ: all.length });
  });
});

