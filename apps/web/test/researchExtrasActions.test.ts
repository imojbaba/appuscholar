import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGapFinderPrompt, buildLitReviewPrompt, buildQuickReadPrompt, rsCorpusText, rsCsvText, type CitationEntry, type RsPaper, type RsQuick } from "@appuscholar/core";
import { tFormat } from "../lib/i18n";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { gapFinder, litReview, quickRead, quickReadTicked, type GeneratorDeps, type QuickDeps } from "../lib/ai/actions";
import { addManual, type ManualDeps } from "../lib/research/library";
import { analysePaper, downloadCsv, EXTERNAL, filterStat, openExternal } from "../lib/research/extras";
import { filterVals, FILTER_EMPTY, shownResults } from "../lib/research/useSearch";

/*
 * Task 10's pure orchestration: the quick read (rsQuickP / rsQuickChecked 8171-8190), the two generators (researchLitReview / researchGapFinder
 * 8530-8551), the manual add (rsAddManual 8435-8454), the Analyse handoff (rsAnalyse 8407-8419), the external search buttons (rsOpenExternal
 * 8424-8434), the CSV (rsCsvDownload 8196) and the filters (rsFilterVals / rsApplySort 8332-8374). Replies come from the research golden fixture's
 * `quick` cases, so the expected RsQuick is the one v1's rsQuickCheck returned.
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

describe("quickReadTicked (rsQuickChecked 8183-8190)", () => {
  it("nothing ticked: v1's toast", async () => {
    const { d, log } = quickDeps(["{}"]);
    await quickReadTicked([], d);
    expect(log.toasts).toEqual(["Tick some papers first"]);
    expect(log.ai).toEqual([]);
  });

  it("the first 10 ticked, quietly, one progress toast each, the results written once, then v1's count", async () => {
    const c = FX.quick[0]!;
    const ticked = Array.from({ length: 12 }, (_, i) => ({ ...papers()[0]!, title: "P" + i, abstract: i === 3 ? "short" : c.ab }));
    const { d, log } = quickDeps([c.raw, c.raw, c.raw, "not json at all", c.raw, c.raw, c.raw, c.raw, c.raw]);
    await quickReadTicked(ticked, d);
    // the short abstract is skipped quietly (no AI call); one reply is unreadable, quietly
    expect(log.ai).toHaveLength(9);
    expect(log.toasts).toEqual([...Array.from({ length: 10 }, (_, i) => "Quick read " + (i + 1) + " of 10…"), "Quick read done for 8 of 10 (the first 10 ticked)"]);
    expect(log.applied).toHaveLength(1);
    expect(log.applied[0]!.map(([p]) => p.title)).toEqual(["P0", "P1", "P2", "P5", "P6", "P7", "P8", "P9"]);
    for (const [, q] of log.applied[0]!) expect(q).toEqual(c.out);
  });

  it("10 or fewer ticked: no '(the first 10 ticked)'; a batch where nothing reads still re-renders once", async () => {
    const { d, log } = quickDeps([new Error("down")]);
    await quickReadTicked([{ ...papers()[0]!, abstract: longAb }, { ...papers()[1]!, abstract: longAb }], d);
    expect(log.toasts).toEqual(["Quick read 1 of 2…", "Quick read 2 of 2…", "Quick read done for 0 of 2"]);
    expect(log.applied).toEqual([[]]);
  });
});

function genDeps(reply: string | Error = "A paragraph.") {
  const log = { toasts: [] as string[], ai: [] as Array<{ prompt: string; opts: unknown }>, thinking: [] as unknown[][], set: [] as unknown[][], cleared: [] as unknown[], docks: [] as string[] };
  let token = 0;
  const d: GeneratorDeps = {
    field: "psychology", t,
    callAI: async (prompt, opts) => { log.ai.push({ prompt, opts }); if (reply instanceof Error) throw reply; return reply; },
    setThinking: (...a) => { log.thinking.push(a); return ++token; },
    isCurrent: (tk) => tk === token,
    set: (...a) => { log.set.push(a); },
    clear: (m) => { log.cleared.push(m); },
    dockShow: (w) => { log.docks.push(w); },
    toast: (m) => { log.toasts.push(m); }
  };
  return { d, log };
}

describe("the literature review and the research gap (researchLitReview / researchGapFinder 8530-8551)", () => {
  for (const [name, run, build, label] of [
    ["litReview", litReview, buildLitReviewPrompt, (n: number) => "💜 Reading " + n + " abstracts and drafting…"],
    ["gapFinder", gapFinder, buildGapFinderPrompt, () => "💜 Looking for what these papers leave unanswered…"]
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
      expect(log.docks).toEqual(["ai", "ai"]);
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

function manualDeps(lib: CitationEntry[] = [], known = true) {
  const log = { toasts: [] as string[], updates: [] as Array<(prev: CitationEntry[]) => CitationEntry[]>, cleared: 0 };
  let release: (ok: boolean) => void = () => {};
  const d: ManualDeps = {
    lib, known, t,
    update: (fn) => { log.updates.push(fn); return true; },
    whenRead: () => new Promise<boolean>((r) => { release = r; }),
    toast: (m) => { log.toasts.push(m); },
    clear: () => { log.cleared++; }
  };
  return { d, log, release: (ok: boolean) => release(ok) };
}
const FIELDS = { title: "  Peer support in hostels ", author: " Rao, P. ", year: " 2024 ", source: " Indian J Psych ", doi: " 10.1/x " };

describe("addManual (rsAddManual 8435-8454)", () => {
  it("a title is required", () => {
    const { d, log } = manualDeps();
    addManual({ ...FIELDS, title: "   " }, d);
    expect(log.toasts).toEqual(["Enter a title first"]);
    expect(log.updates).toEqual([]);
    expect(log.cleared).toBe(0);
  });

  it("v1's record, trimmed, as an update; the five fields cleared; v1's toast", () => {
    const { d, log } = manualDeps();
    addManual(FIELDS, d);
    const entry = { author: "Rao, P.", year: "2024", title: "Peer support in hostels", source: "Indian J Psych", volume: "", issue: "", pages: "", doi: "10.1/x", url: "", type: "Journal article", style: "apa" };
    expect(log.updates).toHaveLength(1);
    expect(log.updates[0]!([])).toEqual([entry]);
    expect(Object.keys(log.updates[0]!([])[0]!)).toEqual(Object.keys(entry));
    expect(log.cleared).toBe(1);
    expect(log.toasts).toEqual(["Added to citation library ✓"]);
  });

  it("the duplicate rule is title and author (8448): the same title by another author is added", () => {
    const same = { title: "Peer support in hostels", author: "Rao, P." };
    const { d, log } = manualDeps([same]);
    addManual(FIELDS, d);
    expect(log.toasts).toEqual(["Already in your library"]);
    expect(log.updates).toEqual([]);
    expect(log.cleared).toBe(0);
    const other = manualDeps([{ ...same, author: "Iyer, S." }]);
    addManual(FIELDS, other.d);
    expect(other.log.toasts).toEqual(["Added to citation library ✓"]);
    expect(other.log.updates[0]!([{ ...same, author: "Iyer, S." }])).toHaveLength(2);
  });

  it("while the library is unread: the update re-checks the stored entries, and the toast and the clearing wait for the read", async () => {
    const m = manualDeps([], false);
    addManual(FIELDS, m.d);
    expect(m.log.toasts).toEqual([]);
    expect(m.log.cleared).toBe(0);
    const stored = [{ title: "Peer support in hostels", author: "Rao, P." }];
    expect(m.log.updates[0]!(stored)).toBe(stored);
    m.release(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(m.log.toasts).toEqual(["Already in your library"]);
    expect(m.log.cleared).toBe(0);

    const n = manualDeps([], false);
    addManual(FIELDS, n.d);
    expect(n.log.updates[0]!([])).toHaveLength(1);
    n.release(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(n.log.toasts).toEqual(["Added to citation library ✓"]);
    expect(n.log.cleared).toBe(1);

    const declined = manualDeps([], false);
    addManual(FIELDS, declined.d);
    declined.release(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(declined.log.toasts).toEqual([]);
    expect(declined.log.cleared).toBe(0);
  });
});

describe("analysePaper (rsAnalyse 8407-8419)", () => {
  const deps = () => {
    const log = { toasts: [] as string[], kept: [] as unknown[], tools: [] as string[] };
    return { log, d: { t, toast: (m: string) => { log.toasts.push(m); }, keep: (v: unknown) => { log.kept.push(v); }, showTool: (id: string) => { log.tools.push(id); } } };
  };
  it("the abstract with v1's head goes to Analyse a paper as an abstract-only load, the tool opens, v1's toast", () => {
    const { d, log } = deps();
    const p = { ...papers()[0]!, abstract: "  " + longAb + " " };
    analysePaper(p, d);
    const head = p.title + "\n" + p.authors + " (" + p.year + ")" + ". " + p.venue + "\nAbstract\n";
    expect(log.kept).toEqual([{ title: p.title, pages: [head + longAb], src: "abstract" }]);
    expect(log.tools).toEqual(["analyse"]);
    expect(log.toasts).toEqual(["Abstract loaded. This is a shallow read; load the full paper for a real analysis."]);
  });
  it("no year and no venue leave their parts out", () => {
    const { d, log } = deps();
    analysePaper({ ...papers()[0]!, abstract: longAb, year: "", venue: "", authors: "" }, d);
    expect((log.kept[0] as { pages: string[] }).pages[0]).toBe(papers()[0]!.title + "\n\nAbstract\n" + longAb);
  });
  it("no abstract: v1's two toasts (free PDF or not), nothing kept", () => {
    const { d, log } = deps();
    analysePaper({ ...papers()[0]!, abstract: "too short", oaUrl: "https://x.org/a.pdf" }, d);
    analysePaper({ ...papers()[0]!, abstract: "", oaUrl: "" }, d);
    expect(log.toasts).toEqual([
      "No abstract came with this result. Use the free PDF button, download the paper and load it in Analyse a paper.",
      "No abstract came with this result (PubMed results often have none here). Open the source and paste the text into Analyse a paper."
    ]);
    expect(log.kept).toEqual([]);
    expect(log.tools).toEqual([]);
  });
});

describe("openExternal (rsOpenExternal 8424-8434)", () => {
  it("the four sites with the topic encoded, in a new tab; no topic toasts", () => {
    const opened: string[] = [];
    const toasts: string[] = [];
    const d = { t, open: (u: string) => { opened.push(u); }, toast: (m: string) => { toasts.push(m); } };
    expect(EXTERNAL.map((x) => x.site)).toEqual(["scholar", "jstor", "sciencedirect", "base"]);
    for (const x of EXTERNAL) openExternal(x.site, "  exam anxiety & sleep ", d);
    const q = encodeURIComponent("exam anxiety & sleep");
    expect(opened).toEqual([
      "https://scholar.google.com/scholar?q=" + q, "https://www.jstor.org/action/doBasicSearch?Query=" + q,
      "https://www.sciencedirect.com/search?qs=" + q, "https://www.base-search.net/Search/Results?lookfor=" + q
    ]);
    openExternal("scholar", "   ", d);
    expect(toasts).toEqual(["Type a search topic first"]);
    expect(opened).toHaveLength(4);
  });
});

describe("downloadCsv (rsCsvDownload 8196, pdDownload 9507)", () => {
  it("nothing shown: v1's toast; else rsCsvText of the shown list as search-results.csv, with v1's BOM", async () => {
    const files: Array<[string, Blob]> = [];
    const toasts: string[] = [];
    const d = { t, toast: (m: string) => { toasts.push(m); }, download: (n: string, b: Blob) => { files.push([n, b]); } };
    downloadCsv([], d);
    expect(toasts).toEqual(["Nothing to download yet"]);
    const list = FX.papers.slice(0, 4);
    downloadCsv(list, d);
    expect(files).toHaveLength(1);
    expect(files[0]![0]).toBe("search-results.csv");
    expect(files[0]![1].type).toBe("text/csv;charset=utf-8");
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await files[0]![1].arrayBuffer());
    expect(text).toBe("﻿" + rsCsvText(list));
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
  it("v1's sentence only while a filter is set", () => {
    expect(filterStat(t, filterVals(FILTER_EMPTY), 3, 5, 0)).toBe("");
    const F = filterVals({ ...FILTER_EMPTY, oa: true });
    expect(filterStat(t, F, 3, 0, 0)).toBe("");
    expect(filterStat(t, F, 3, 5, 0)).toBe("Showing 3 of 5 papers. 2 hidden by your filters, not deleted.");
    expect(filterStat(t, F, 3, 5, 1)).toBe("Showing 3 of 5 papers. 2 hidden by your filters, not deleted. 1 of those are hidden only because they have no Quick read yet.");
    expect(filterStat(t, F, 0, 5, 0)).toBe("Showing 0 of 5 papers. 5 hidden by your filters, not deleted. Clear a filter to see them again.");
  });
});

