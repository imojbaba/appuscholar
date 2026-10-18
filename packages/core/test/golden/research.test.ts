import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { CitationEntry } from "../../src/citation";
import { pdCsv, pdCsvCell } from "../../src/csv";
import { RS_DESIGN, RS_DESIGNS, rsAuthorsToCit, rsBuildQuery, rsCleanTerm, rsCorpusText, rsCsvText, rsDedupe, rsEntryFromResult, rsFilterPass, rsOaStatus, rsQuickCheck, rsRankParse, rsReconstructAbstract } from "../../src/research";
import type { RsFilter, RsPaper, RsQuick } from "../../src/research";
import * as TABLES from "../../src/data/research-tables";
import type { Inputs } from "./research/capture";
import { readFixture } from "./harness/fixture";

/**
 * research.ts and csv.ts (v1's rsReconstructAbstract 8041-8049, rsOaStatus 8055-8060, rsQuickCheck 8131-8160, rsCsvText 8191-8195, rsRankParse 8209-8219, rsCleanTerm 8245-8250, rsBuildQuery
 * 8273-8282, the de-duplication inside researchSearch 8312-8314, rsFilterPass 8336-8346, rsAuthorsToCit 8455-8464, rsEntryFromResult 8465-8470, rsCorpusText 8525-8529, pdCsvCell 9461 and pdCsv 9462)
 * against v1 running. Every expected value is read from test/golden/research/cases.json (`golden:capture research`), captured from the hand-written research/inputs.json; the inputs sit beside the
 * outputs in the fixture, and the first test checks that they are this suite's inputs. tables.json holds RS_DESIGNS and RS_DESIGN, which src/data/research-tables.ts is generated from.
 * v1's rsCsvText reads the page's result list (rsResults) and rsEntryFromResult the page's #citStyle; here they are given the papers and the style v1 had when it was called.
 * What is typed here is what the brief says the inputs are (and which of its replies does what), and guards that the inputs reach each branch.
 */

type Quick = RsQuick | null;
type Fx = {
  papers: RsPaper[];
  abstracts: Array<{ inv: Record<string, number[]> | null; out: string }>;
  oa: Array<{ oa: { is_oa?: boolean; oa_status?: string } | null; out: string }>;
  quick: Array<{ ab: string; raw: string; out: Quick }>;
  rank: Array<{ n: number; raw: string; out: Record<number, { score: number; reason: string }> }>;
  terms: Array<{ t: string; q: string; out: string }>;
  queries: Array<{ q: string; kind: "oa" | "pm"; terms: string[]; design: string; out: string }>;
  filters: Array<{ f: RsFilter; out: Array<{ ok: boolean; needsQuick?: true }> }>;
  authors: Array<{ str: string; out: string }>;
  entries: Array<{ style: string; out: CitationEntry[] }>;
  corpus: Array<{ ids: number[]; out: string }>;
  csv: Array<{ ids: number[]; out: string }>;
  cells: Array<{ v: unknown; out: string }>;
  csvTables: Array<{ headers: string[]; rows: unknown[][]; out: string }>;
  dedupe: { topic: string; in: RsPaper[]; out: RsPaper[] };
};

const inputs = JSON.parse(readFileSync(new URL("./research/inputs.json", import.meta.url), "utf8")) as Inputs;
const fx = readFixture<Fx>("research", "cases");
const papersOf = (ids: number[]) => ids.map((i) => fx.papers[i]!);
const short = (v: unknown) => JSON.stringify(v)?.slice(0, 48) ?? String(v);
/** A reply the test can read for itself: the brief's rank replies are plain JSON (no fences). */
type RankEntry = { id?: unknown; score?: unknown; reason?: unknown };
const scoresOf = (raw: string) => (JSON.parse(raw) as { scores: RankEntry[] }).scores;

describe("research.ts is v1's Research helpers", () => {
  it("the fixture was captured from exactly inputs.json", () => {
    expect(fx.papers).toEqual(inputs.papers);
    expect(fx.abstracts.map((c) => c.inv)).toEqual(inputs.invertedIndexes);
    expect(fx.oa.map((c) => c.oa)).toEqual(inputs.openAccess);
    expect(fx.quick.map(({ ab, raw }) => ({ ab, raw }))).toEqual(inputs.replies);
    expect(fx.rank.map(({ n, raw }) => ({ n, raw }))).toEqual(inputs.rankReplies);
    expect(fx.terms.map(({ t, q }) => ({ t, q }))).toEqual(inputs.terms);
    expect(fx.queries.map(({ q, kind, terms, design }) => ({ q, kind, terms, design }))).toEqual(inputs.queries);
    expect(fx.filters.map((c) => c.f)).toEqual(inputs.filters);
    expect(fx.authors.map((c) => c.str)).toEqual([...new Set([...inputs.authorStrings, ...inputs.papers.map((p) => p.authors)])]);
    expect(fx.cells.map((c) => c.v)).toEqual([...inputs.csvCells, undefined]); // the capture adds pdCsvCell(undefined), which JSON cannot hold
    expect("v" in fx.cells[fx.cells.length - 1]!).toBe(false);
    expect(fx.csvTables.map(({ headers, rows }) => ({ headers, rows }))).toEqual(inputs.csvTables);
    expect(fx.entries.map((e) => e.style)).toEqual(["apa", "ieee", ""]);
    for (const c of [...fx.csv, ...fx.corpus]) expect(c.ids).toEqual(c.ids.length ? fx.papers.map((_, i) => i) : []);
    expect(fx.dedupe.topic).toBe(inputs.dedupe.topic);
  });

  for (const [i, c] of fx.abstracts.entries()) it(`rsReconstructAbstract #${i} ${short(c.inv)}`, () => expect(rsReconstructAbstract(c.inv)).toBe(c.out));
  for (const [i, c] of fx.oa.entries()) it(`rsOaStatus #${i} ${short(c.oa)}`, () => expect(rsOaStatus(c.oa)).toBe(c.out));
  for (const [i, c] of fx.quick.entries()) it(`rsQuickCheck #${i} ${short(c.raw)}`, () => expect(rsQuickCheck(c.raw, c.ab)).toEqual(c.out));
  for (const [i, c] of fx.rank.entries()) it(`rsRankParse #${i} (n ${c.n}) ${short(c.raw)}`, () => expect(rsRankParse(c.raw, c.n)).toEqual(c.out));
  for (const [i, c] of fx.terms.entries()) it(`rsCleanTerm #${i} ${short(c.t)}`, () => expect(rsCleanTerm(c.t, c.q)).toBe(c.out));
  for (const [i, c] of fx.queries.entries()) it(`rsBuildQuery #${i} ${c.kind} ${c.design} ${short(c.terms)}`, () => expect(rsBuildQuery(c.q, c.kind, c.terms, c.design)).toBe(c.out));
  for (const [k, c] of fx.filters.entries())
    for (const [i, p] of fx.papers.entries()) it(`rsFilterPass filter #${k} ${short(c.f)} on paper #${i}`, () => expect(rsFilterPass(p, c.f)).toEqual(c.out[i]));
  for (const [i, c] of fx.authors.entries()) it(`rsAuthorsToCit #${i} ${short(c.str)}`, () => expect(rsAuthorsToCit(c.str)).toBe(c.out));
  for (const e of fx.entries)
    for (const [i, p] of fx.papers.entries()) it(`rsEntryFromResult paper #${i} with #citStyle ${JSON.stringify(e.style)}`, () => {
      expect(rsEntryFromResult(p, e.style)).toEqual(e.out[i]);
      expect(JSON.stringify(rsEntryFromResult(p, e.style))).toBe(JSON.stringify(e.out[i])); // and v1's key order
    });
  for (const c of fx.corpus) it(`rsCorpusText over ${c.ids.length} papers`, () => expect(rsCorpusText(papersOf(c.ids))).toBe(c.out));
  for (const c of fx.csv) it(`rsCsvText over ${c.ids.length} papers`, () => expect(rsCsvText(papersOf(c.ids))).toBe(c.out));
  for (const [i, c] of fx.cells.entries()) it(`pdCsvCell #${i} ${short(c.v)}`, () => expect(pdCsvCell(c.v)).toBe(c.out));
  for (const [i, c] of fx.csvTables.entries()) it(`pdCsv #${i} ${short(c.headers)}`, () => expect(pdCsv(c.headers, c.rows)).toBe(c.out));

  it("rsQuickCheck drops a summary whose number is not in the abstract and keeps one whose number is", () => {
    const dropped = fx.quick.filter((c) => c.out?.summaryDropped === true);
    const kept = fx.quick.filter((c) => c.out?.summary !== undefined && /\d/.test(c.out.summary));
    expect(dropped.length).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    for (const c of [...dropped, ...kept]) expect(rsQuickCheck(c.raw, c.ab)).toEqual(c.out);
    // the brief's first two replies: a summary number that is in the abstract (kept), one that is not (dropped, and no summary given)
    expect(fx.quick[0]!.out?.summary).toMatch(/\d/);
    expect(fx.quick[1]!.out).toMatchObject({ summaryDropped: true });
    expect(fx.quick[1]!.out?.summary).toBeUndefined();
  });

  it("rsRankParse ignores ids it did not send, scores outside 0–3, and a second entry for the same id", () => {
    for (const c of fx.rank) {
      expect(rsRankParse(c.raw, c.n)).toEqual(c.out);
      for (const [id, r] of Object.entries(c.out)) {
        expect(Number.isInteger(Number(id)) && Number(id) >= 1 && Number(id) <= c.n, `id ${id} of ${c.n}`).toBe(true);
        expect(Number.isInteger(r.score) && r.score >= 0 && r.score <= 3, `score ${r.score}`).toBe(true);
      }
    }
    // the replies hold what is to be ignored: ids outside 1..n, scores outside 0-3, and an id twice, of which v1 keeps the first
    const ids = (c: Fx["rank"][number]) => scoresOf(c.raw).map((e) => Number(e.id));
    const ignoredIds = fx.rank[1]!;
    expect(ids(ignoredIds).some((id) => id < 1 || id > ignoredIds.n)).toBe(true);
    const outside = fx.rank[3]!;
    expect(scoresOf(outside.raw).some((e) => Number(e.score) > 3) && scoresOf(outside.raw).some((e) => Number(e.score) < 0)).toBe(true);
    const twice = ids(ignoredIds).find((id, k, all) => all.indexOf(id) !== k)!;
    expect(twice).toBeDefined();
    expect(ignoredIds.out[twice]!.reason).toBe(scoresOf(ignoredIds.raw).find((e) => Number(e.id) === twice)!.reason);
    // the brief's third: a `scores` that is not a list gives nothing
    expect(Array.isArray((JSON.parse(fx.rank[2]!.raw) as { scores: unknown }).scores)).toBe(false);
    expect(fx.rank[2]!.out).toEqual({});
  });

  it("rsDedupe keeps the first paper per 60-character title key, as researchSearch does", () => {
    expect(fx.dedupe.in).toEqual([...inputs.dedupe.openalex, ...inputs.dedupe.pubmed]); // researchSearch's merge (8311): the OpenAlex list, then PubMed's
    expect(rsDedupe(fx.dedupe.in)).toEqual(fx.dedupe.out);
    // the lists hold a title written twice in other case and punctuation, two different titles that agree in their first 60 letters and digits (one pair differing long after, one at the 61st),
    // two titles with no Latin letter or digit, and a title written twice in the PubMed list: in each pair v1 kept the first only. Two pairs it kept both of: an underscore against a space, and
    // titles that differ at the 60th letter
    const idOf = (p: RsPaper) => {
      const r = p as unknown as Record<string, unknown>;
      return `${p.source}:${String(r.oaId ?? r.pmid)}`;
    };
    expect(new Set(fx.dedupe.in.map(idOf)).size).toBe(fx.dedupe.in.length);
    const kept = new Set(fx.dedupe.out.map(idOf));
    const pair = (first: number, second: number) => [fx.dedupe.in[first]!, fx.dedupe.in[second]!] as const;
    for (const [a, b] of [pair(0, 1), pair(2, 8), pair(3, 9), pair(11, 12), pair(5, 13)]) expect(kept.has(idOf(a)) && !kept.has(idOf(b)), `${a.title} | ${b.title}`).toBe(true);
    for (const [a, b] of [pair(4, 10), pair(6, 14)]) expect(kept.has(idOf(a)) && kept.has(idOf(b)), `${a.title} | ${b.title}`).toBe(true);
    for (const [a, b] of [pair(0, 1), pair(2, 8), pair(5, 13), pair(6, 14)]) expect(a.title).not.toBe(b.title);
    expect(pair(11, 12)[0].title).toBe(pair(11, 12)[1].title);
    expect(/[a-z0-9]/i.test(fx.dedupe.in[3]!.title + fx.dedupe.in[9]!.title)).toBe(false);
  });

  it("rsCsvText equals v1 for the 10 results (quoting of commas, quotes and newlines by pdCsvCell)", () => {
    const c = fx.csv.find((x) => x.ids.length === 10)!;
    expect(rsCsvText(papersOf(c.ids))).toBe(c.out);
    // the results hold every character pdCsvCell quotes for
    const fields = fx.papers.flatMap((p) => [p.title, p.authors, p.venue, p.rel?.reason ?? "", p.quick?.summary ?? ""]);
    for (const ch of [",", '"', "\n", "\r", "\t"]) expect(fields.some((f) => f.includes(ch)), JSON.stringify(ch)).toBe(true);
  });

  it("the brief's inputs: 10 papers, six replies, three rank replies, eight author strings, six inverted indexes, twelve queries over every RS_DESIGN key, six filters, each list first", () => {
    expect(fx.papers).toHaveLength(10);
    expect(fx.quick.length).toBeGreaterThanOrEqual(6);
    expect(fx.rank.length).toBeGreaterThanOrEqual(3);
    expect(inputs.authorStrings.length).toBeGreaterThanOrEqual(8);
    expect(fx.abstracts.length).toBeGreaterThanOrEqual(6);
    expect(fx.queries.length).toBeGreaterThanOrEqual(12);
    expect(fx.filters.length).toBeGreaterThanOrEqual(6);
    for (const key of Object.keys(RS_DESIGN)) for (const kind of ["oa", "pm"]) expect(fx.queries.some((c) => c.design === key && c.kind === kind), `${key} ${kind}`).toBe(true);
    // the brief's six replies, in its order: the two above, a design quote not in the abstract, a sample n whose quote lacks the digits, ```json fences, garbage
    const out = fx.quick.map((c) => c.out);
    expect(out[2]?.design?.ok).toBe(false);
    expect(out[3]?.sample?.ok).toBe(false);
    expect(fx.quick[4]!.raw.startsWith("```json")).toBe(true);
    expect(out[4]).not.toBeNull();
    expect(out[5]).toBeNull();
    // the brief's inverted indexes: an empty one, and positions out of order
    expect(fx.abstracts.some((c) => c.inv !== null && Object.keys(c.inv).length === 0)).toBe(true);
    expect(fx.abstracts.some((c) => c.inv !== null && Object.values(c.inv).flat().some((p, k, all) => k > 0 && p < all[k - 1]!))).toBe(true);
  });

  it("the papers are of the kinds the brief and ruling 3 list", () => {
    const P = fx.papers;
    expect(new Set(P.map((p) => p.source))).toEqual(new Set(["OpenAlex", "PubMed"]));
    expect(P.some((p) => p.abstract) && P.some((p) => !p.abstract)).toBe(true);
    expect(P.some((p) => p.retracted === true)).toBe(true);
    expect(P.some((p) => p.oaStatus === "gold")).toBe(true);
    expect(P.some((p) => p.quick?.design?.ok === true) && P.some((p) => p.quick?.design?.ok === false)).toBe(true);
    expect(P.some((p) => p.rel?.titleOnly === true)).toBe(true);
    expect(P.some((p) => p.authors === "Unknown authors")).toBe(true);
    expect(P.some((p) => p.authors.split(", ").some((n) => /^\S+ [A-Z]{1,4}$/.test(n)))).toBe(true); // initials only, "Smith JA"
    expect(P.some((p) => p.authors.endsWith(", et al."))).toBe(true);
    expect(P.some((p) => typeof p.year === "number")).toBe(true);
    expect(P.some((p) => p.doi.startsWith("https://doi.org/"))).toBe(true);
    expect(P.some((p) => p.abstract?.includes("<jats:p>") && p.abstract.includes("&amp;"))).toBe(true);
    expect(P.some((p) => p.quick?.summaryDropped === true)).toBe(true);
    expect(fx.filters.some((c) => c.f.n > 0 && c.f.n < P.length)).toBe(true);
    expect(fx.quick.some((c) => c.raw.includes("1,200"))).toBe(true);
  });

  it("the inputs reach each branch of the helpers", () => {
    const quick = fx.quick.map((c) => c.out);
    expect(quick.some((q) => q === null) && quick.some((q) => q !== null && Object.keys(q).length === 0)).toBe(true);
    expect(quick.some((q) => q?.design?.ok === true) && quick.some((q) => q?.design?.ok === false)).toBe(true);
    expect(quick.some((q) => q?.sample?.ok === true) && quick.some((q) => q?.sample?.ok === false)).toBe(true);
    expect(fx.rank.some((c) => Object.keys(c.out).length === 0) && fx.rank.some((c) => Object.keys(c.out).length > 0)).toBe(true);
    const verdicts = fx.filters.flatMap((c) => c.out.map((o) => (o.ok ? "ok" : o.needsQuick ? "needs a quick read" : "hidden")));
    expect([...new Set(verdicts)].sort()).toEqual(["hidden", "needs a quick read", "ok"]);
    for (const k of [0, 1, 2, 3, 4]) expect(fx.filters.some((c) => c.out.some((o) => !o.ok) && Object.values(c.f).filter(Boolean).length === 1 && Object.values(c.f)[k]), `filter field ${k}`).toBe(true);
    expect(fx.filters.some((c) => c.out.every((o) => o.ok))).toBe(true);
    expect(new Set(fx.oa.map((c) => c.out))).toEqual(new Set(["", "gold", "green", "hybrid", "bronze"]));
    expect(fx.oa.some((c) => c.oa?.oa_status?.toLowerCase() === "diamond")).toBe(true);
    expect(fx.terms.some((c) => c.out === "") && fx.terms.some((c) => c.out !== "" && c.out !== c.t)).toBe(true);
    expect(fx.queries.some((c) => c.terms.length > 0) && fx.queries.some((c) => !(c.design in RS_DESIGN))).toBe(true);
    expect(fx.authors.some((c) => c.out === "") && fx.authors.some((c) => c.out.includes("; "))).toBe(true);
    const types = new Set(fx.entries.flatMap((e) => e.out.map((d) => d.type)));
    expect(types).toEqual(new Set(["Journal article", "Website"]));
    expect(fx.entries.find((e) => e.style === "")!.out.every((d) => d.style === "apa")).toBe(true); // #citStyle with no option chosen: v1's || 'apa'
    expect(fx.corpus.find((c) => c.ids.length === 0)!.out).toBe("");
    expect(fx.corpus.find((c) => c.ids.length === 10)!.out).toContain("n.d.");
  });
});

describe("generated research tables equal v1's", () => {
  const t = readFixture<{ tables: Record<string, unknown> }>("research", "tables");
  it("RS_DESIGNS and RS_DESIGN equal v1's", () => {
    expect(JSON.stringify(RS_DESIGNS)).toBe(JSON.stringify(t.tables.RS_DESIGNS));
    expect(JSON.stringify(RS_DESIGN)).toBe(JSON.stringify(t.tables.RS_DESIGN));
  });
  it("the fixture holds these two tables and no other, and research.ts exports the generated ones", () => {
    expect(Object.keys(t.tables)).toEqual(["RS_DESIGNS", "RS_DESIGN"]);
    expect(RS_DESIGNS).toBe(TABLES.RS_DESIGNS);
    expect(RS_DESIGN).toBe(TABLES.RS_DESIGN);
  });
});
