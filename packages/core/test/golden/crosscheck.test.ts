import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CIT_STYLES, citFmt } from "../../src/citation";
import type { CitationEntry, CitationStyle } from "../../src/citation";
import { CC_SN, CC_STOP, CC_YR, ccAnalyse, ccCites, ccKey, ccLev, ccNorm, ccParseRef, ccSplit, ccYrMatch, crossCheckHtml } from "../../src/crosscheck";
import type { CcCite, CcRef, CcResult } from "../../src/crosscheck";
import { CC_STOP as CC_STOP_LIST } from "../../src/data/crosscheck-tables";
import { docInnerText } from "../../src/doctext";
import { readFixture } from "./harness/fixture";

/**
 * crosscheck.ts (v1 12100-12157, the citation cross-check) against v1 running. Every expected value is read from test/golden/crosscheck/cases.json (`golden:capture crosscheck`), which holds, for each document of
 * the hand-written documents.json, v1's ccAnalyse result and the three pieces it is made of (ccSplit, ccCites and ccParseRef on each list line), plus ccLev, ccNorm, ccKey and ccYrMatch called by themselves;
 * tables.json holds CC_STOP, which src/data/crosscheck-tables.ts is generated from.
 * What is typed here is what the brief and the controller's rulings spell out: the corpus ids and its minimum size, the Hindi-heading, nbsp and stop-word checks, the rule that an HTML document is read through
 * Task 3's converter with U+00A0 as a space, and the guards that the corpus reaches each branch (all three sources, both kinds of near miss, unread lines, repeated citations, every style in the library branch).
 */

type Doc = { id: string; plain?: string; html?: string; lib: CitationEntry[]; style: CitationStyle };
type Split = { body: string; refs: string[] | null; heading: string };
type Case = { id: string; html?: string; plain: string; lib: CitationEntry[]; style: CitationStyle; refs: string[]; out: CcResult; split: Split; cites: CcCite[]; parsed: Array<{ line: string; out: CcRef | null }> | null };
type Helper = { fn: string; args: unknown[]; out: unknown };

const docs = JSON.parse(readFileSync(new URL("./crosscheck/documents.json", import.meta.url), "utf8")) as Doc[];
const fx = readFixture<{ patterns: { CC_SN: string; CC_YR: string }; cases: Case[]; lev: Array<{ a: string; b: string; out: number }>; helpers: Helper[] }>("crosscheck", "cases");
const docOf = (id: string) => docs.find((d) => d.id === id)!;
const caseOf = (id: string) => fx.cases.find((c) => c.id === id)!;

/** The brief's required ids, then the controller's additions (Decision 3). */
const IDS = [
  "doc-refs-english", "doc-refs-hindi-heading", "doc-refs-last-heading-wins", "doc-nbsp-citation", "lib-branch", "lib-branch-numbered", "none", "stop-words", "year-suffixes", "near-name", "particles",
  "narrative-three", "nd", "group-semicolons", "curly-apostrophe", "diacritics",
  "empty", "heading-no-lines", "ref-no-year", "page-numbers", "et-al-variants", "suffix-in-list-only", "two-authors-ampersand", "list-longer-than-body", "lib-no-author",
];
const HELPERS: Record<string, (...args: never[]) => unknown> = { ccNorm, ccKey, ccYrMatch };
/** A test name for a helper call: its arguments as JSON, cut at 60 characters. */
const label = (args: unknown[]) => {
  const s = JSON.stringify(args).slice(1, -1);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};

describe("crosscheck.ts is v1's ccAnalyse", () => {
  it("the corpus has the brief's ids, 20 documents or more, plain and HTML ones, and the fixture was captured from exactly this corpus", () => {
    for (const id of IDS) expect(docs.some((d) => d.id === id), id).toBe(true);
    expect(docs.length).toBeGreaterThanOrEqual(20);
    expect(docs.some((d) => d.html !== undefined)).toBe(true);
    expect(docs.some((d) => d.plain !== undefined)).toBe(true);
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
    expect(fx.cases.map((c) => ({ id: c.id, ...(c.html !== undefined ? { html: c.html } : { plain: c.plain }), lib: c.lib, style: c.style }))).toEqual(docs);
  });
  for (const c of fx.cases) it(c.id, () => {
    const d = docOf(c.id);
    const r = d.html !== undefined ? crossCheckHtml(d.html, d.lib, d.style) : ccAnalyse(d.plain!, d.lib, d.style);
    expect(r).toEqual(c.out);
    // An HTML document is read as ccOpen reads the editor (12159): innerText, with U+00A0 as a space. The converter is Task 3's, so a change to it is caught here as well.
    if (d.html !== undefined) expect(docInnerText(d.html).replace(/\u00a0/g, " ")).toBe(c.plain);
    // The pieces by themselves, on the text v1 read.
    expect(ccSplit(c.plain)).toEqual(c.split);
    expect(ccCites(c.split.body)).toEqual(c.cites);
    expect(c.split.refs === null ? null : c.split.refs.map((line) => ({ line, out: ccParseRef(line) }))).toEqual(c.parsed);
  });
  it("the Hindi heading and the nbsp citation are found through the HTML path", () => {
    const d = docOf("doc-refs-hindi-heading");
    const r = crossCheckHtml(d.html!, [], "apa");
    expect(r.srcKind).toBe("doc"); expect(r.heading).toBe("संदर्भ सूची"); expect(r.cited).toBe(1); expect(r.missing).toEqual([]);
    expect(r.heading).toBe(d.html!.split("</p><p>")[1]);
    const n = crossCheckHtml(docOf("doc-nbsp-citation").html!, [], "apa");
    expect(n.cited).toBe(2); expect(n.missing.map((m) => m.c.raw)).toEqual(["Smith, 2020", "Rao et al., 2019"]);
  });
  it("stop words are not citations", () => expect(ccCites("(Table 2020) and (Figure 1999)")).toEqual([]));
  it("the stop-words document counts only its one source, and so does the one that holds every stop word", () => {
    expect(caseOf("stop-words").cites.map((c) => c.sn)).toEqual(["Smith"]);
    expect(caseOf("stop-words-more").cites.map((c) => c.sn)).toEqual(["Smith"]);
  });
  it("the corpus reaches all three sources, both kinds of near miss, unread lines, a repeated citation and a heading with nothing under it", () => {
    expect([...new Set(fx.cases.map((c) => c.out.srcKind))].sort()).toEqual(["doc", "lib", "none"]);
    expect([...new Set(fx.cases.flatMap((c) => c.out.missing.flatMap((m) => m.near.map((x) => x.kind))))].sort()).toEqual(["name", "year"]);
    expect(fx.cases.some((c) => c.out.unread > 0)).toBe(true);
    expect(fx.cases.some((c) => c.out.missing.some((m) => m.c.n > 1))).toBe(true);
    expect(fx.cases.some((c) => c.out.srcKind === "doc" && c.out.listN === 0 && c.out.unread === 0)).toBe(true);
    expect(fx.cases.some((c) => c.out.unused.length > 0)).toBe(true);
    expect(fx.cases.some((c) => c.out.cited === 0 && c.out.srcKind === "lib")).toBe(true);
  });
});

describe("the constants equal v1's", () => {
  const t = readFixture<{ tables: { CC_STOP: string[] } }>("crosscheck", "tables");
  it("CC_STOP equals v1's", () => expect(JSON.stringify([...CC_STOP])).toBe(JSON.stringify(t.tables.CC_STOP)));
  it("the generated list equals v1's, and is the only table in the fixture", () => {
    expect(JSON.stringify(CC_STOP_LIST)).toBe(JSON.stringify(t.tables.CC_STOP));
    expect(Object.keys(t.tables)).toEqual(["CC_STOP"]);
  });
  it("CC_SN and CC_YR equal the strings v1 builds its regexes from", () => {
    expect(CC_SN).toBe(fx.patterns.CC_SN);
    expect(CC_YR).toBe(fx.patterns.CC_YR);
  });
});

describe("the helpers called by themselves", () => {
  for (const l of fx.lev) it(`ccLev(${JSON.stringify(l.a)}, ${JSON.stringify(l.b)})`, () => expect(ccLev(l.a, l.b)).toBe(l.out));
  it("ccLev is recorded for ten pairs, with the early return of 9 and an exact 2 at the length cut", () => {
    expect(fx.lev).toHaveLength(10);
    expect(fx.lev.some((l) => l.out === 9)).toBe(true);
    expect(fx.lev.some((l) => l.out === 2 && Math.abs(l.a.length - l.b.length) === 2)).toBe(true);
  });
  for (const h of fx.helpers) it(`${h.fn}(${label(h.args)})`, () => expect(Reflect.apply(HELPERS[h.fn]!, undefined, h.args)).toEqual(h.out));
  it("every helper is recorded, and nothing else", () => expect([...new Set(fx.helpers.map((h) => h.fn))].sort()).toEqual(Object.keys(HELPERS).sort()));
});

describe("the library branch formats with citFmt(d, 0, style), which is v1's citFmt(d) under the page's style", () => {
  const withLib = fx.cases.filter((c) => c.lib.length > 0);
  // v1 calls citFmt(d) with no number and no style (12139): the number is 0 through `num=(n&&n>0)?n:0` and the style is #citStyle. The capture throws unless citFmt(d), citFmt(d, 0, style)
  // and citFmt(d, undefined, style) are the same in v1 for every entry; `refs` is that reference text, and the port's call must give it.
  for (const c of withLib) it(`${c.id}: the reference text of each of the ${c.lib.length} library entries is v1's citFmt(d).ref`, () => {
    expect(c.refs).toHaveLength(c.lib.length);
    expect(c.lib.map((e) => citFmt(e, 0, c.style).ref)).toEqual(c.refs);
  });
  it("the library branch is exercised in all eight styles, three of them numbered", () => {
    const styles = [...new Set(fx.cases.filter((c) => c.out.srcKind === "lib").map((c) => c.style))].sort();
    expect(styles).toEqual(Object.keys(CIT_STYLES).sort());
    expect(styles.filter((st) => CIT_STYLES[st as CitationStyle].numbered).sort()).toEqual(["ama", "ieee", "vancouver"]);
  });
  it("every reference text the library branch shows (an unused entry, a near miss) is one of those citFmt gave", () => {
    for (const c of fx.cases.filter((x) => x.out.srcKind === "lib")) {
      const shown = [...c.out.unused, ...c.out.missing.flatMap((m) => m.near.map((x) => x.e))].map((e) => e.text);
      for (const text of shown) expect(c.refs.includes(text), `${c.id}: ${text}`).toBe(true);
    }
  });
  it("lib-branch and lib-branch-numbered share a library and a body, and their reference texts differ: the capture put the style in #citStyle", () => {
    expect(docOf("lib-branch").lib).toEqual(docOf("lib-branch-numbered").lib);
    expect(docOf("lib-branch").plain).toBe(docOf("lib-branch-numbered").plain);
    expect(caseOf("lib-branch").style).toBe("apa");
    expect(caseOf("lib-branch-numbered").style).toBe("vancouver");
    expect(caseOf("lib-branch").refs).not.toEqual(caseOf("lib-branch-numbered").refs);
  });
  it("in the numbered styles the reference text carries no library number, since citFmt is given none (v1 12139)", () => {
    for (const c of withLib) if (CIT_STYLES[c.style].numbered) for (const ref of c.refs) expect(ref, `${c.id}: ${ref}`).not.toMatch(/^(?:\[\d+\]|\d+\.) /);
  });
});
