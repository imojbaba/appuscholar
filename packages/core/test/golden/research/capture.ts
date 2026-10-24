import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { emitTables, encodeSpecial, writeFixture } from "../harness/fixture";

/**
 * Task 12's Research helpers (v1 index.html: rsReconstructAbstract 8041-8049, rsOaStatus 8055-8060, RS_DESIGNS 8127, rsQuickCheck 8131-8160, rsCsvText 8191-8195, rsRankParse 8209-8219,
 * RS_DESIGN 8237-8244, rsCleanTerm 8245-8250, rsBuildQuery 8273-8282, the de-duplication inside researchSearch 8312-8314, rsFilterPass 8336-8346, rsAuthorsToCit 8455-8464, rsEntryFromResult
 * 8465-8470, rsCorpusText 8525-8529, pdCsvCell 9461 and pdCsv 9462) on the hand-written inputs in inputs.json. The inputs are the one thing a person writes; every output below is v1's own.
 *
 * - `papers`: the ten results of inputs.json (OpenAlex and PubMed shapes, as rsFetchOpenAlex 8061 and rsFetchPubmed 8103 build them, with `rel` and `quick` as rsRank and rsQuickP add them),
 *   recorded beside the outputs that are computed from them.
 * - Direct calls, each `{ <the inputs>, out }`: `abstracts` rsReconstructAbstract(inv); `oa` rsOaStatus(oa); `quick` rsQuickCheck(raw, ab); `rank` rsRankParse(raw, n); `terms` rsCleanTerm(t, q);
 *   `queries` rsBuildQuery(q, kind, terms, design); `authors` rsAuthorsToCit(str) over inputs.json's strings and then the papers' own (each once); `corpus` rsCorpusText over the papers
 *   picked by `ids`; `cells` pdCsvCell(v), the last with v undefined (no `v` in its record); `csvTables` pdCsv(headers, rows). `filters`: for each filter, `out[i]` is rsFilterPass(papers[i], f).
 * - `csv`: rsCsvText() reads the page's result list, `rsResults` (a top-level `let`, 8026, so it is assigned through eval): for each `ids`, rsResults is set to those papers and rsCsvText() called.
 * - `entries`: rsEntryFromResult(p) reads #citStyle (8466). For each style, #citStyle is set (and checked) and `out[i]` is rsEntryFromResult(papers[i]); "apa" and "ieee" are the brief's, and ""
 *   is #citStyle with no option chosen, v1's `(sel&&sel.value)||'apa'`.
 * - `dedupe`: the title-key filter of researchSearch (8312-8314), driven as a student's search runs: rsFetchOpenAlex and rsFetchPubmed (top-level function declarations, so the page's calls reach
 *   the stand-ins) are replaced by stand-ins that hand back a fresh copy of inputs.json's `dedupe.openalex` and `dedupe.pubmed`, made in v1's realm, as fetch's json() would; #rsTopic holds
 *   `dedupe.topic`; #rsSrcOA and #rsSrcPubmed are ticked; #rsDesign is left on "any" and #rsRank unticked (a first search: fieldInit 2511 ticks it only when appu_rs_rank is "1"), so researchSearch
 *   ranks nothing; callAI is stubbed and must not be called. `in` is the list researchSearch merges (8311: the OpenAlex list, then the PubMed list, the order of its jobs) and `out` is
 *   rsResultsOriginal after `await researchSearch()` (8315 stores the de-duplicated list there, and nothing after it changes the list when ranking is off). Guards (each throws): each stand-in is
 *   called once, with the query rsBuildQuery builds for the topic alone (no related terms were suggested, so rsPickedTerms, 8269, gives none); no toast, no AI call, no jsdom error; #rsStatus
 *   reports the number of papers in `out`; and `out` is shorter than `in`, each of its papers one of `in`'s.
 * - `tables.json` (and, under --emit, src/data/research-tables.ts): RS_DESIGNS and RS_DESIGN as v1 holds them (both consts, read through eval).
 */

export type Paper = Record<string, unknown> & { title: string; authors: string };
export type Inputs = {
  papers: Paper[];
  replies: Array<{ ab: string; raw: string }>;
  rankReplies: Array<{ n: number; raw: string }>;
  authorStrings: string[];
  invertedIndexes: Array<Record<string, number[]> | null>;
  openAccess: Array<Record<string, unknown> | null>;
  terms: Array<{ t: unknown; q: string }>;
  queries: Array<{ q: string; kind: string; terms: string[]; design: string }>;
  filters: Array<{ year: number; oa: boolean; ret: boolean; des: string; n: number }>;
  csvCells: unknown[];
  csvTables: Array<{ headers: string[]; rows: unknown[][] }>;
  dedupe: { topic: string; openalex: Paper[]; pubmed: Paper[] };
};

/** #citStyle's values for rsEntryFromResult: the brief's two, then no option chosen. */
const STYLES = ["apa", "ieee", ""];

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(encodeSpecial(a)) === JSON.stringify(encodeSpecial(b));

export const research: Engine = {
  name: "research",
  async capture(v1, opts) {
    const { check } = opts;
    const inputs = JSON.parse(readFileSync(new URL("./inputs.json", import.meta.url), "utf8")) as Inputs;
    const { papers } = inputs;
    if (papers.length !== 10) throw new Error(`research: inputs.json must hold the brief's 10 papers, not ${papers.length}`);

    // v1's tables, as data (both are consts, reached through eval).
    const tables = { RS_DESIGNS: clone(v1.eval<string[]>("RS_DESIGNS")), RS_DESIGN: clone(v1.eval<Record<string, Record<string, string>>>("RS_DESIGN")) };
    for (const key of Object.keys(tables.RS_DESIGN))
      for (const kind of ["oa", "pm"]) if (!inputs.queries.some((c) => c.design === key && c.kind === kind)) throw new Error(`research: no query has design ${key} and kind ${kind}`);

    // Arguments are copied before each call, so a function that changed its input could not change the record.
    const abstracts = inputs.invertedIndexes.map((inv) => ({ inv, out: v1.call<string>("rsReconstructAbstract", clone(inv)) }));
    const oa = inputs.openAccess.map((o) => ({ oa: o, out: v1.call<string>("rsOaStatus", clone(o)) }));
    const quick = inputs.replies.map(({ ab, raw }) => ({ ab, raw, out: v1.call("rsQuickCheck", raw, ab) }));
    const rank = inputs.rankReplies.map(({ n, raw }) => ({ n, raw, out: v1.call("rsRankParse", raw, n) }));
    const terms = inputs.terms.map(({ t, q }) => ({ t, q, out: v1.call<string>("rsCleanTerm", clone(t), q) }));
    const queries = inputs.queries.map((c) => ({ ...c, out: v1.call<string>("rsBuildQuery", c.q, c.kind, clone(c.terms), c.design) }));
    const filters = inputs.filters.map((f) => ({ f, out: papers.map((p) => v1.call("rsFilterPass", clone(p), clone(f))) }));
    const authorList = [...new Set([...inputs.authorStrings, ...papers.map((p) => p.authors)])];
    const authors = authorList.map((str) => ({ str, out: v1.call<string>("rsAuthorsToCit", str) }));
    const corpus = [papers.map((_, i) => i), []].map((ids) => ({ ids, out: v1.call<string>("rsCorpusText", clone(ids.map((i) => papers[i]!))) }));
    // and pdCsvCell(undefined), a value JSON cannot hold in inputs.json (its record has no `v`): a result with a field missing writes it so.
    const cells = [...inputs.csvCells.map((v) => ({ v, out: v1.call<string>("pdCsvCell", clone(v)) })), { v: undefined, out: v1.call<string>("pdCsvCell", undefined) }];
    const csvTables = inputs.csvTables.map(({ headers, rows }) => ({ headers, rows, out: v1.call<string>("pdCsv", clone(headers), clone(rows)) }));

    // rsCsvText reads rsResults, a top-level let (8026): assigned through eval, as the page's rsApplySort (8365) assigns it.
    const csv = [papers.map((_, i) => i), []].map((ids) => {
      v1.eval("rsResults=" + JSON.stringify(ids.map((i) => papers[i]!)));
      if (v1.eval<number>("rsResults.length") !== ids.length) throw new Error("research: rsResults did not take the papers");
      return { ids, out: v1.call<string>("rsCsvText") };
    });

    // rsEntryFromResult reads #citStyle (8466).
    const select = v1.document.getElementById("citStyle") as HTMLSelectElement | null;
    if (!select) throw new Error("research: v1 has no #citStyle");
    const entries = STYLES.map((style) => {
      v1.setValue("citStyle", style);
      if (select.value !== style) throw new Error(`research: #citStyle did not take ${JSON.stringify(style)}`);
      return { style, out: papers.map((p) => v1.call("rsEntryFromResult", clone(p))) };
    });

    // The de-duplication, inside researchSearch (8283-8330), driven to its merge with the two fetchers replaced.
    const w = v1.window as unknown as Record<string, unknown>;
    const { topic } = inputs.dedupe;
    const inRealm = (list: Paper[]) => v1.eval<Paper[]>("(" + JSON.stringify(list) + ")");
    const sent: Record<"oa" | "pm", unknown[][]> = { oa: [], pm: [] };
    w.rsFetchOpenAlex = async (...args: unknown[]) => { sent.oa.push(clone(args)); return inRealm(inputs.dedupe.openalex); };
    w.rsFetchPubmed = async (...args: unknown[]) => { sent.pm.push(clone(args)); return inRealm(inputs.dedupe.pubmed); };
    const field = (id: string) => {
      const el = v1.document.getElementById(id) as HTMLInputElement | null;
      if (!el) throw new Error(`research: v1 has no #${id}`);
      return el;
    };
    v1.setValue("rsTopic", topic);
    field("rsSrcOA").checked = true;
    field("rsSrcPubmed").checked = true;
    field("rsRank").checked = false;
    if (field("rsDesign").value !== "any") throw new Error(`research: #rsDesign is ${field("rsDesign").value}, not "any"`);
    const ai = v1.stubCallAI("");
    const toastsBefore = v1.toasts.length, errorsBefore = v1.errors.length;
    await v1.call<Promise<void>>("researchSearch");
    const merged = [...inputs.dedupe.openalex, ...inputs.dedupe.pubmed];
    const out = clone(v1.eval<Paper[]>("rsResultsOriginal"));
    const query = v1.call<string>("rsBuildQuery", topic, "oa", [], "any"), pmQuery = v1.call<string>("rsBuildQuery", topic, "pm", [], "any");
    if (sent.oa.length !== 1 || sent.pm.length !== 1) throw new Error(`research: researchSearch called the OpenAlex stand-in ${sent.oa.length} times and the PubMed one ${sent.pm.length}`);
    if (sent.oa[0]![0] !== query || sent.pm[0]![0] !== pmQuery) throw new Error(`research: researchSearch searched ${JSON.stringify(sent.oa[0]![0])} and ${JSON.stringify(sent.pm[0]![0])}, not the topic`);
    if (v1.toasts.length !== toastsBefore) throw new Error(`research: researchSearch showed a toast: ${v1.toasts.slice(toastsBefore).join(" | ")}`);
    if (ai.length !== 0) throw new Error("research: researchSearch called the AI with ranking off");
    if (v1.errors.length !== errorsBefore) throw new Error(`research: jsdom errors during researchSearch: ${v1.errors.slice(errorsBefore).join(" | ")}`);
    const status = v1.document.getElementById("rsStatus")?.textContent ?? "";
    if (!status.startsWith(`${out.length} paper`)) throw new Error(`research: #rsStatus says ${JSON.stringify(status)}`);
    if (!(out.length < merged.length) || !out.every((p) => merged.some((m) => same(m, p)))) throw new Error("research: rsResultsOriginal is not a part of the merged list");
    const dedupe = { topic, in: merged, out };

    return [
      emitTables(v1, "research", "research-tables", tables, opts),
      writeFixture("research", "cases", { papers, abstracts, oa, quick, rank, terms, queries, filters, authors, entries, corpus, csv, cells, csvTables, dedupe }, v1, check),
    ];
  },
};
