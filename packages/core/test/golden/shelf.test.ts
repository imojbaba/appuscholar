import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import {
  buildShelfSummaryPrompt, escHTML, SHELF_DEFAULT_COLS, fieldLabel, htmlMarksToParts, SH_MAX_PAGES, SH_MIN_CHARS, shBackupBundle, shBackupFileName, shBestSentence, shChars, shColsAdd, shColsDel, shColsOf,
  shCount, shFindPassages, shMarkedParts, shMatrixCsv, shMineOk, shNoteId, shPageText, shPaperId, shQuoteFind, shRank, shRankPages, shRestoreParse, shSnippet, shSnippetParts,
  shStripEmails, shSummaryNoteId, shSummaryText, shTitleGuess, shTokens, type ShTextItem, type SnippetPart
} from "../../src/index";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * shelf.ts against v1 running (test/golden/shelf/cases.json, `golden:capture shelf`; v1 index.html 11513-11725). Every expected value is read from the fixture: the functions called
 * directly in v1 (shTerms, shCount, shSnippet, shBestSentence, shGuessTitle, shMineOk, shRank, shMarked, shCols) and the entries driven in v1's dialog (shSearchRun, shFindRun,
 * shExtractPdf, shAddFiles, shSaveHL, shSummarise, shColAdd/shColDel, shMatrixCsv, shBackup, shRestore). Typed here: guards that the inputs reach each branch, and the HTML template of
 * v1's shResHTML (11630-11632), which the search and find cards are checked against.
 */
type Paper = { id: string; title: string; pages: string[] };
type Hit = { id: string; page: number; text: string; score: number; hit: number; terms: string[] };
type Box = { q: string; note: boolean; empty: string | null; cards: Array<{ id: string; page: number; html: string }> };
type Fx = {
  papers: Paper[];
  terms: Array<{ q: string; out: string[] }>;
  counts: Array<{ text: string; term: string; out: number }>;
  snippets: Array<{ text: string; terms: string[]; len: number; out: string }>;
  best: Array<{ text: string; terms: string[]; out: string }>;
  titles: Array<{ pages: string[]; fallback: string; out: string }>;
  gate: Array<{ text: string; out: boolean }>;
  rank: Array<{ q: string; mode: "and" | "or"; limit: number; out: Hit[] }>;
  search: Box[];
  find: Box[];
  extract: Array<{ items: ShTextItem[] | string; out: { pages?: string[]; total: number; kept?: number; last?: string } }>;
  add: { files: Array<{ name: string; size: number }>; status: string; records: Array<{ idShape: boolean; addedIso: boolean; title: string; file: string; size: number; pages: string[]; total: number; notes: unknown[]; cells: object }> };
  quotes: Array<{ pageText: string; selection: string; note: string; toasts: string[]; notes: Array<{ idShape: boolean; page: number; quote: string; note: string }> }>;
  marked: Array<{ text: string; notes: Array<{ page: number; quote: string }>; out: string }>;
  summaries: Array<{ field: string | null; label: string; prompt: string; opts: Record<string, unknown>; pages: string[]; mine: string; notes: Array<{ idShape: boolean; page: number; quote: string; note: string }>; out: string; inputs: { id: string } }>;
  trim: { reply: string; out: string };
  cols: Array<{ stored: string | null; out: string[] }>;
  colOps: Array<{ op: ["add", string] | ["del", number]; out: string[]; stored: string | null }>;
  csv: Array<{ stored: string | null; papers: Array<{ title: string; cells?: Record<string, string> }>; name: string; text: string }>;
  backup: { name: string; nameDateIsExported: boolean; exportedIso: boolean; keys: string[]; bundle: { app: string; v: number; papers: unknown[] }; type: string; status: string };
  restore: Array<{ text: string; status: string; stored: unknown[]; inputValue: string }>;
};
const fx = readFixture<Fx>("shelf", "cases");
const mode = goldenMode(fx);
const DEFAULT_COLS = SHELF_DEFAULT_COLS;

/** What a browser shows of v1's marked HTML: the text runs and the <mark> runs, as parsed. */
function shown(html: string): SnippetPart[] {
  const d = new JSDOM("<div id=x></div>").window.document;
  const x = d.getElementById("x")!;
  x.innerHTML = html;
  const out: SnippetPart[] = [];
  x.childNodes.forEach((n) => { const text = n.textContent ?? ""; if (text) out.push({ text, mark: n.nodeName === "MARK" }); });
  return out;
}
/** v1's shResHTML (11630-11632), character for character. */
const resHTML = (title: string, id: string, page: number, inner: string) =>
  '<div style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin:6px 0"><div style="font-weight:700;font-size:13.5px">' + escHTML(title) + ' <span style="font-weight:400;color:var(--muted)">· page ' + page + '</span></div><div style="font-size:13px;line-height:1.55;margin:4px 0">' + inner + '</div><button class="btn btn-ghost" onclick="shRead(\'' + id + "'," + page + ')">Open this page</button></div>';

describe("the terms, counts, snippets and sentences are v1's", () => {
  it("shTokens is shTerms for every query and sentence (stop words, stems, accents, apostrophes, duplicates kept)", () => {
    expect(fx.terms.some((r) => r.out.length > new Set(r.out).size)).toBe(true);
    for (const r of fx.terms) expect(shTokens(r.q), r.q).toEqual(r.out);
  });
  it("shCount", () => { for (const r of fx.counts) expect(shCount(r.text, r.term), r.text).toBe(r.out); });
  it("shSnippet is v1's HTML, and shSnippetParts is what a browser shows of it (the entity a term 'quot' breaks included)", () => {
    expect(fx.snippets.some((r) => r.out.includes("&<mark>quot</mark>;"))).toBe(true);
    for (const r of fx.snippets) {
      expect(shSnippet(r.text, r.terms, r.len), r.text).toBe(r.out);
      expect(shSnippetParts(r.text, r.terms, r.len), r.text).toEqual(shown(r.out));
    }
  });
  it("shBestSentence", () => { for (const r of fx.best) expect(shBestSentence(r.text, r.terms), r.text).toBe(r.out); });
  it("shTitleGuess is shGuessTitle (8 and 180 characters excluded, the fallback)", () => {
    for (const r of fx.titles) expect(shTitleGuess(r.pages, r.fallback), JSON.stringify(r.pages)).toBe(r.out);
  });
});

describe("shRank, shRankPages and shFindPassages are v1's ranking", () => {
  it("shRank equals v1 for every query, mode and limit (scores within the golden tolerance)", () => {
    expect(fx.rank.some((r) => r.mode === "and" && !r.out.length && fx.rank.find((o) => o.q === r.q && o.mode === "or" && o.limit === r.limit)!.out.length > 0)).toBe(true);
    for (const r of fx.rank) {
      const got = shRank(fx.papers, r.q, r.mode, r.limit).map((x) => ({ id: x.p.id, page: x.page, text: x.text, score: x.score, hit: x.hit, terms: x.terms }));
      expectGolden(got, r.out, mode, `${r.q} ${r.mode} ${r.limit}`);
    }
  });
  it("shRankPages is shSearchRun: AND, then OR with the note, the empty sentences, and each card", () => {
    expect(fx.search.some((s) => s.note)).toBe(true);
    expect(fx.search.some((s) => s.empty === "Type a word or two.")).toBe(true);
    expect(fx.search.some((s) => s.empty === "No page on the shelf matches.")).toBe(true);
    for (const s of fx.search) {
      const r = shRankPages(fx.papers, s.q);
      expect(r.or, s.q).toBe(s.note);
      if (s.empty !== null) {
        expect(r.hits, s.q).toEqual([]);
        expect(s.empty, s.q).toBe(r.noTerms ? "Type a word or two." : "No page on the shelf matches.");
        continue;
      }
      expect(r.hits.map((h) => resHTML(h.p.title, h.p.id, h.page, shSnippet(h.text, h.terms, 220))), s.q).toEqual(s.cards.map((c) => c.html));
      for (const h of r.hits) expect(h.snippet).toEqual(shown(shSnippet(h.text, h.terms, 220)));
    }
  });
  it("shFindPassages is shFindRun: OR, the best 5, at least 2 shared terms, the closest sentence", () => {
    expect(fx.find.some((s) => s.empty === "No page shares enough words with that sentence.")).toBe(true);
    expect(fx.find.some((s) => s.empty === "Write a sentence first.")).toBe(true);
    expect(fx.find.some((s) => s.cards.length > 0)).toBe(true);
    for (const s of fx.find) {
      const r = shFindPassages(fx.papers, s.q);
      if (s.empty !== null) {
        expect(r.hits, s.q).toEqual([]);
        expect(s.empty, s.q).toBe(r.noTerms ? "Write a sentence first." : "No page shares enough words with that sentence.");
        continue;
      }
      expect(r.hits.map((h) => resHTML(h.p.title, h.p.id, h.page, "<i>Closest sentence:</i> " + shSnippet(h.closest, h.terms, 320))), s.q).toEqual(s.cards.map((c) => c.html));
      for (const h of r.hits) { expect(h.closest).toBe(shBestSentence(h.text, h.terms)); expect(h.snippet).toEqual(shown(shSnippet(h.closest, h.terms, 320))); }
    }
  });
});

describe("the page text, the scanned rule, the title and the ids are shExtractPdf's and shAddFiles'", () => {
  it("shPageText joins a page's items as shExtractPdf does; the first 200 pages are kept", () => {
    for (const r of fx.extract) {
      if (typeof r.items === "string") { expect([r.out.kept, r.out.total]).toEqual([SH_MAX_PAGES, 205]); continue; }
      expect([shPageText(r.items)], JSON.stringify(r.items)).toEqual(r.out.pages);
    }
  });
  it("each record shAddFiles stored is its pages, its title guess and v1's id and date shape; fewer than 200 characters is scanned", () => {
    expect(SH_MIN_CHARS).toBe(200);
    expect(fx.add.status).toContain("scan.PDF: no readable text (it looks scanned). Not added.");
    expect(fx.add.status).toContain("edge.pdf: added, 1 pages");
    for (const r of fx.add.records) {
      expect(r.idShape && r.addedIso).toBe(true);
      expect(shChars(r.pages)).toBeGreaterThanOrEqual(SH_MIN_CHARS);
      expect(shTitleGuess(r.pages, r.file.replace(/\.pdf$/i, ""))).toBe(r.title);
    }
    expect(shChars(["x".repeat(99), "y".repeat(100)])).toBeLessThan(SH_MIN_CHARS);
    expect(shPaperId(Date.now())).toMatch(/^p[0-9a-z]+$/);
    expect(shNoteId()).toMatch(/^n[0-9a-z]+$/);
    expect(shSummaryNoteId(1234567)).toBe("n" + (1234567).toString(36));
  });
});

describe("the reader: marks, quotes and the gate", () => {
  it("shMarkedParts is what a browser shows of shMarked", () => {
    for (const r of fx.marked) expect(shMarkedParts(r.text, r.notes.map((n, i) => ({ id: "n" + i, note: "", at: "", ...n })), 1), r.text).toEqual(shown(r.out));
  });
  it("shQuoteFind is shSaveHL's quote: '' for no selection, null when it is not on the page, else the page's own text", () => {
    for (const r of fx.quotes) {
      const q = shQuoteFind(r.pageText, r.selection);
      if (r.toasts[0] === "Select some text on the page first") expect(q).toBe("");
      else if (r.toasts[0] === "That selection crosses a highlight. Select a shorter passage.") expect(q).toBeNull();
      else { expect(r.toasts).toEqual(["Highlight saved"]); expect(q).toBe(r.notes[0]!.quote); expect(r.notes[0]!.note).toBe(r.note.trim()); }
    }
  });
  it("shMineOk is v1's gate at its boundaries (1 or 2 non-empty lines, 11 or 12 words)", () => {
    expect(fx.gate.some((g) => g.out) && fx.gate.some((g) => !g.out)).toBe(true);
    for (const g of fx.gate) expect(shMineOk(g.text), JSON.stringify(g.text)).toBe(g.out);
  });
});

describe("the summary is shSummarise's", () => {
  it("buildShelfSummaryPrompt(fieldLabel(field), shSummaryText(pages)) is the prompt and options v1 handed to callAI, emails stripped before the 12,000 cut", () => {
    expect(fx.summaries.some((s) => s.prompt.includes("(first 12,000 characters only)"))).toBe(true);
    expect(fx.summaries.some((s) => !s.prompt.includes("(first 12,000 characters only)") && s.inputs.id === "exactly-12000")).toBe(true);
    expect(fx.summaries.find((s) => s.inputs.id === "email-avoids-cut")!.prompt).not.toContain("(first 12,000");
    for (const s of fx.summaries) {
      const b = buildShelfSummaryPrompt(fieldLabel(s.field), shSummaryText(s.pages));
      expect(fieldLabel(s.field)).toBe(s.label);
      expect(b.prompt, s.inputs.id).toBe(s.prompt);
      expect({ temp: b.temp, max: b.max, noLang: b.noLang }).toEqual(s.opts);
      // The note saved before the call (11688) and the line appended to the reply (11694).
      expect(s.notes).toEqual([{ idShape: true, page: 0, quote: "", note: "My own summary before the AI: " + s.mine.trim() }]);
      expect(s.out).toBe("OK\n\nCompare this with your own two lines. The AI can be wrong or miss a limitation.");
    }
    expect(fx.trim.out).toBe(fx.trim.reply.trim() + "\n\nCompare this with your own two lines. The AI can be wrong or miss a limitation.");
  });
  it("shStripEmails is 11690's regex", () => {
    const s = fx.summaries.find((x) => x.inputs.id === "emails")!;
    expect(s.prompt.endsWith(":\n" + shStripEmails(s.pages.join("\n\n")))).toBe(true);
    expect(shStripEmails("a.author@uni.edu, name@domain.c")).toBe("[author email removed], name@domain.c");
  });
});

describe("the matrix, the backup and the restore are v1's", () => {
  it("shColsOf is shCols (a non-empty array, else the defaults); shColsAdd and shColsDel are shColAdd and shColDel, in order", () => {
    expect(fx.cols.find((c) => c.stored === null)!.out).toEqual([...SHELF_DEFAULT_COLS]);
    for (const c of fx.cols) {
      let stored: unknown = null;
      try { stored = JSON.parse(c.stored ?? "null"); } catch { stored = null; }
      expect(shColsOf(stored, DEFAULT_COLS), String(c.stored)).toEqual(c.out);
    }
    let stored: string[] | null = null;
    for (const o of fx.colOps) {
      const cur = shColsOf(stored, DEFAULT_COLS);
      const next = o.op[0] === "add" ? shColsAdd(cur, o.op[1]) : shColsDel(cur, o.op[1]);
      // v1 stores nothing for an empty name (shColAdd returns before LS.set).
      if (!(o.op[0] === "add" && !o.op[1].trim())) stored = next;
      expect(shColsOf(stored, DEFAULT_COLS), JSON.stringify(o.op)).toEqual(o.out);
      expect(JSON.stringify(stored)).toBe(o.stored);
    }
  });
  it("shMatrixCsv is shMatrixCsv's text and name", () => {
    for (const c of fx.csv) {
      expect(c.name).toBe("reading_matrix.csv");
      expect(shMatrixCsv("Paper", shColsOf(c.stored ? JSON.parse(c.stored) : null, DEFAULT_COLS), c.papers)).toBe(c.text);
    }
  });
  it("shBackupBundle and shBackupFileName are shBackup's", () => {
    const now = new Date("2026-10-19T23:59:59.000Z");
    const b = shBackupBundle(fx.backup.bundle.papers, now);
    expect(Object.keys(b)).toEqual(fx.backup.keys);
    const { exported, ...rest } = b;
    expect(rest).toEqual(fx.backup.bundle);
    expect(exported).toBe(now.toISOString());
    expect(fx.backup.nameDateIsExported && fx.backup.exportedIso).toBe(true);
    expect(fx.backup.name).toBe("appuscholar-shelf-YYYY-MM-DD.json");
    expect(shBackupFileName(now)).toBe("appuscholar-shelf-2026-10-19.json");
  });
  it("shRestoreParse is shRestore's checks: null for 'That file is not a shelf backup.', else the records it stored", () => {
    expect(fx.restore.some((r) => r.stored.length > 1)).toBe(true);
    for (const r of fx.restore) {
      const got = shRestoreParse(r.text);
      if (r.status === "That file is not a shelf backup.") { expect(got, r.text).toBeNull(); continue; }
      expect(r.status).toBe(`Restored ${r.stored.length} papers.`);
      expect(got).toEqual(r.stored);
    }
  });
});

describe("htmlMarksToParts", () => {
  it("drops empty runs and decodes v1's five entities", () => {
    expect(htmlMarksToParts("… a &amp; b <mark>Sleep</mark>&#39;s &lt;x&gt; &quot;q&quot;")).toEqual([{ text: "… a & b ", mark: false }, { text: "Sleep", mark: true }, { text: "'s <x> \"q\"", mark: false }]);
  });
});
