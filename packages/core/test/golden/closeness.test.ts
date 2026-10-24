import { describe, it, expect } from "vitest";
import {
  CL_STOP, CL_HOMO, CL_MIN_WORDS, clTok, clExcludeRanges, clHtmlToText, clK, clMin, clCompare, clReportText, clGather, clOtherDocs, clEnoughWords,
} from "../../src/closeness";
import type { ClFx } from "./closeness/capture";
import { readFixture } from "./harness/fixture";

/**
 * The closeness check (closeness.ts) against v1's page (`golden:capture closeness`, closeness/capture.ts): CL_STOP and CL_HOMO against tables.json; clCompare's whole result (counts,
 * percentage, every run's source, words, text, page and character range) against v1's for the 43 cases; clReportText against v1's report for the date `new Date()` was fixed to;
 * clK and clMin against what v1 read from `appu_close_k` and `appu_close_min`; clGather against clGather() over ticked boxes; clOtherDocs against the document list closeInit left;
 * clEnoughWords against clRun's 30-word toast. Everything is strings, integers and booleans except `pct`, a number rounded to one decimal, compared by toBe.
 */

const fx = readFixture<ClFx>("closeness", "cases");
const tables = readFixture<{ tables: { CL_STOP_WORDS: string[]; CL_HOMO: Record<string, string> } }>("closeness", "tables").tables;

describe("closeness: tables (6830, 6842)", () => {
  it("CL_STOP is v1's set, in v1's order", () => {
    expect([...CL_STOP]).toEqual(tables.CL_STOP_WORDS);
  });
  it("CL_HOMO is v1's map", () => {
    expect({ ...CL_HOMO }).toEqual(tables.CL_HOMO);
  });
});

describe("closeness: the 43 golden cases give v1's percentage and runs", () => {
  it("covers what the plan lists", () => {
    const ids = fx.cases.map((c) => c.id);
    expect(fx.cases.length).toBeGreaterThanOrEqual(20);
    for (const id of [
      "exact-copy", "chunks-k5-min8", "chunks-k6-min10", "chunks-k8-min15", "stopwords-rejected", "quotes-straight", "quotes-curly", "refs-references", "refs-bibliography", "refs-works-cited",
      "homoglyph-cyrillic", "homoglyph-greek", "invisible-chars", "hyphen-wrap", "apostrophes", "devanagari", "also-cap-3", "pagestarts", "empty-student", "no-sources", "run-boundary-changes-source",
    ]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const c of fx.cases) {
    it(`${c.id}: clCompare (6859-6899)`, () => {
      const r = clCompare(c.studentText, c.sources, c.k, c.minRun);
      expect(r.pct).toBe(c.result.pct);
      expect(r).toEqual(c.result);
    });
    it(`${c.id}: clReportText (6967-6972)`, () => {
      const r = clCompare(c.studentText, c.sources, c.k, c.minRun);
      expect(clReportText({ ...r, text: c.studentText, ms: 3 } as typeof r, c.date)).toBe(c.report);
      expect(clReportText(r, c.date.slice(0, 10))).toBe(c.report);
    });
  }
  it("what the cases pin: a stop-word run is dropped, the hit cap leaves two others, a page number, quotes and references left out", () => {
    const by = (id: string) => fx.cases.find((c) => c.id === id)!.result;
    expect(by("stopwords-rejected").runs).toHaveLength(0);
    expect(by("also-cap-3").runs[0]!.also).toEqual([1, 2]);
    expect(by("pagestarts").runs[0]!.page).toBe(3);
    expect(by("empty-student").pct).toBe(0);
    expect(by("no-sources").runs).toHaveLength(0);
    expect(by("quotes-straight").counted).toBeLessThan(by("quotes-straight").total);
    expect(by("refs-references").counted).toBeLessThan(by("refs-references").total);
  });
});

describe("closeness: pieces", () => {
  it("clTok keeps ranges into the original text and folds case, ligatures, soft hyphens and look-alikes", () => {
    const text = "Dаta ﬁnal psycho-\nlogical don’t";
    const t = clTok(text);
    expect(t.map((x) => x.w)).toEqual(["data", "final", "psychological", "don't"]);
    expect(text.slice(t[0]!.s, t[0]!.e)).toBe("Dаta");
  });
  it("clExcludeRanges: curly quotes, then straight quotes, then from the last References-type heading to the end", () => {
    const text = 'a "b c" d \u201Ce\nf\u201D g\nReferences\nh';
    const q = text.indexOf('"');
    expect(clExcludeRanges(text)).toEqual([
      [text.indexOf("\u201C"), text.indexOf("\u201D") + 1], [q, text.indexOf('"', q + 1) + 1], [text.indexOf("\nReferences\n"), text.length],
    ]);
  });
  it("clHtmlToText is the text of the HTML with no separators (textContent, register F26)", () => {
    expect(clHtmlToText("<p>a</p><p>b &amp; c</p>")).toBe("ab & c");
    expect(clHtmlToText("")).toBe("");
  });
});

describe("closeness: clK and clMin (6855-6856)", () => {
  for (const s of fx.sanitisers) {
    it(`stored ${JSON.stringify(s.stored)}`, () => {
      expect(clK(s.stored)).toBe(s.k);
      expect(clMin(s.stored)).toBe(s.min);
    });
  }
  it("undefined is never stored", () => {
    expect(clK(undefined)).toBe(6);
    expect(clMin(undefined)).toBe(8);
  });
});

describe("closeness: clGather (6919-6936)", () => {
  for (const g of fx.gather) {
    it(g.id, () => {
      expect(clGather(g.ticked, g.shelf, g.docs, g.pasted)).toEqual(g.sources);
    });
  }
});

describe("closeness: clOtherDocs (6905)", () => {
  for (const o of fx.others) {
    it(o.id, () => {
      expect(clOtherDocs(o.docs, o.current).map((d) => d.id)).toEqual(o.ids);
    });
  }
});

describe("closeness: clEnoughWords (clRun, 6938)", () => {
  it("CL_MIN_WORDS is 30", () => {
    expect(CL_MIN_WORDS).toBe(30);
  });
  for (const g of fx.gate) {
    it(`${g.words} words, separated by ${JSON.stringify(g.sep)}`, () => {
      const text = Array.from({ length: g.words }, (_, i) => "w" + i).join(g.sep);
      expect(clEnoughWords(text)).toBe(g.compared);
      expect(clEnoughWords(text)).toBe(g.toast === null);
    });
  }
});

describe("closeness: 50,000 words against 20 papers in under 5 s, quotes and references excluded (Review Focus 4)", () => {
  // Deterministic words from mulberry32 over 4,096 of them, so a six-word run is unlikely to repeat by chance across 150,000 words.
  const syl = ["ka", "to", "mi", "ra", "ne", "lo", "su", "pe", "di", "va", "ho", "bu", "fe", "gi", "za", "ko"];
  const VOCAB: string[] = [];
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let c = 0; c < 16; c++) VOCAB.push(syl[a]! + syl[b]! + syl[c]! + "n");
  let seed = 20261021;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const word = () => VOCAB[Math.floor(rand() * VOCAB.length)]!;
  const words = (n: number) => Array.from({ length: n }, word);

  it("finds only the plain copies, counts neither the quoted nor the reference copies, and finishes in under 5 s", () => {
    const papers = Array.from({ length: 20 }, () => words(5000));
    const sources = papers.map((p, i) => ({ name: `Paper ${i + 1}`, kind: "Reading shelf", text: p.join(" ") }));
    const passage = (paper: number, from: number) => papers[paper]!.slice(from, from + 30);
    const plainCopies = [passage(0, 100), passage(3, 2000), passage(7, 4000), passage(12, 50), passage(19, 2500)];
    const quoted = [passage(1, 300), passage(9, 900), passage(15, 4500)];
    const refs = [passage(2, 700), passage(5, 1500)];
    const parts: string[] = [];
    let plainWords = 0, quotedWords = 0, refWords = 0;
    const own = (n: number) => { plainWords += n; parts.push(words(n).join(" ")); };
    for (let i = 0; i < plainCopies.length; i++) {
      own(8000);
      parts.push(plainCopies[i]!.join(" "));
      plainWords += 30;
      if (i < quoted.length) { parts.push(`"${quoted[i]!.join(" ")}"`); quotedWords += 30; }
    }
    own(9699);
    parts.push("\nReferences\n");
    refWords += 1; // the heading's own word is left out with the list
    for (const r of refs) { parts.push(r.join(" ")); refWords += 30; }
    const student = parts.join(" ");
    const total = plainWords + quotedWords + refWords;
    expect(total).toBe(50000);

    const t0 = performance.now();
    const r = clCompare(student, sources, 6, 8);
    const ms = performance.now() - t0;

    expect(ms).toBeLessThan(5000);
    expect(r.total).toBe(total);
    expect(r.counted).toBe(plainWords);
    expect(r.runs).toHaveLength(plainCopies.length);
    expect(r.covered).toBe(30 * plainCopies.length);
    expect(r.runs.map((u) => u.src)).toEqual([0, 3, 7, 12, 19]);
    expect(r.pct).toBe(Math.round((1000 * 150) / plainWords) / 10);
    // none of the quoted or reference copies is a run
    for (const u of r.runs) expect(student.slice(u.cs, u.ce).includes('"')).toBe(false);
  });
});
