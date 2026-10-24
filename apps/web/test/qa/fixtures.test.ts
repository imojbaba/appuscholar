import { describe, expect, it } from "vitest";
import {
  clCompare, clGather, clHtmlToText, clTok, pdScan, pdTestVal, sanitizeHtml, SH_MIN_CHARS, shChars, shPageText, shTitleGuess, statsParseText, wordCount, type ClShelfPaper, type ShTextItem
} from "@appuscholar/core";
import { looksSemicolon, parseSliced, semicolonsToTabs, skippedLines } from "@/lib/tools/stats/intake";
import { MARK } from "../../qa/fixtures/common";
import { hugeRows, hugeWords } from "../../qa/fixtures/huge";
import { BREAK_PASSAGE, interviews } from "../../qa/fixtures/interviews";
import { PAPER07_PARAGRAPH, PAPER07_SENTENCES, paperTitle, shelfPdfs } from "../../qa/fixtures/pdfs";
import { survey } from "../../qa/fixtures/survey";
import { thesisDraft } from "../../qa/fixtures/thesis";

/**
 * The QA layer's invented test data (qa/fixtures/*.ts, spec section 11). The data is held to what the app does with it: the survey to the app's own parser and
 * personal-data scan (core's statsParseText and pdScan, the Statistics tab's semicolon split), the PDFs to pdf.js and the shelf's rules, the thesis and the huge text to the
 * Closeness engine, the HTML to the document sanitiser. Each file carries the run's MARK, so that a later check can look for it in what the server stored.
 */

const DEVANAGARI = /[ऀ-ॿ]/;
const wordsOf = (s: string): string[] => s.split(/\s+/).filter(Boolean);

describe("MARK", () => {
  it("is QAMK and six random letters, the same all through one run", () => {
    expect(MARK).toMatch(/^QAMK[A-Za-z]{6}$/);
    expect(survey().csv).toContain(MARK);
  });
});

describe("survey()", () => {
  it("has 120 data rows and the MARK; rows, names, villages and openAnswers say so", () => {
    const s = survey();
    const lines = s.csv.split("\n");
    expect(lines).toHaveLength(121);
    expect(lines[0]).toBe("student name,village,age,q1,q2,q3,q4,q5,score,notes");
    expect(s.rows).toBe(120);
    expect(s.names).toHaveLength(120);
    expect(s.villages).toHaveLength(120);
    expect(s.openAnswers).toHaveLength(120);
    expect(s.csv).toContain(MARK);
    expect(new Set(s.names).size).toBe(120);
    for (const n of s.names) expect(s.csv).toContain(n);
  });

  it("has invented Indian and English names, a handful of villages, and answers on the Likert scale", () => {
    const s = survey();
    expect(new Set(s.villages).size).toBeGreaterThanOrEqual(6);
    const parsed = statsParseText(s.csv)!;
    expect(parsed.cols.map((c) => c.type)).toEqual(["categorical", "categorical", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "categorical"]);
    for (const r of parsed.rows) {
      for (const q of r.slice(3, 8)) expect(["1", "2", "3", "4", "5"]).toContain(q);
      expect(r[8]).toMatch(/^\d{2}\.\d{3}$/);
      expect(Number(r[2])).toBeGreaterThanOrEqual(13);
      expect(Number(r[2])).toBeLessThanOrEqual(19);
    }
  });

  it("has five notes in Devanagari, one ragged row, and is read by the app's parser: 119 of the 120 rows, the ragged line named", () => {
    const s = survey();
    expect(s.openAnswers.filter((a) => DEVANAGARI.test(a))).toHaveLength(5);
    const parsed = statsParseText(s.csv)!;
    expect(parsed.headers).toHaveLength(10);
    expect(parsed.rows).toHaveLength(119);
    expect(skippedLines(s.csv, parsed)).toEqual({ count: 1, lines: [s.raggedLine] });
    // The ragged line is a row with one value too many, and it is the only one.
    expect(s.csv.split("\n")[s.raggedLine - 1]!.startsWith(s.names[s.raggedLine - 2]! + ",")).toBe(true);
  });

  it("keeps an open answer that holds a comma or a quote in quotes, so that the comma file reads as ten columns and every answer comes back as it was written", () => {
    const s = survey({ sep: "," });
    expect(s.openAnswers.filter((a) => a.includes(",")).length).toBeGreaterThan(40);
    expect(s.openAnswers.some((a) => a.includes('"'))).toBe(true);
    const parsed = statsParseText(s.csv)!;
    expect(parsed.rows.every((r) => r.length === 10)).toBe(true);
    const kept = (all: string[]) => all.filter((_, i) => i !== s.raggedLine - 2);
    expect(parsed.rows.map((r) => r[0])).toEqual(kept(s.names));
    expect(parsed.rows.map((r) => r[1])).toEqual(kept(s.villages));
    expect(parsed.rows.map((r) => r[9])).toEqual(kept(s.openAnswers));
  });

  it("the semicolon file is one column to the parser, offers the split, and reads as the same table after it (one score with a decimal comma is text)", () => {
    const s = survey({ sep: ";" });
    expect(s.openAnswers).toEqual(survey({ sep: "," }).openAnswers);
    expect(s.csv.split("\n")[0]).toBe("student name;village;age;q1;q2;q3;q4;q5;score;notes");
    const first = statsParseText(s.csv)!;
    expect(first.headers).toHaveLength(1);
    expect(looksSemicolon(s.csv, first)).toBe(true);
    const tabbed = semicolonsToTabs(s.csv);
    const parsed = statsParseText(tabbed)!;
    expect(parsed.headers).toEqual(["student name", "village", "age", "q1", "q2", "q3", "q4", "q5", "score", "notes"]);
    expect(parsed.rows).toHaveLength(119);
    expect(skippedLines(tabbed, parsed)).toEqual({ count: 1, lines: [s.raggedLine] });
    expect(parsed.rows.map((r) => r[0])).toEqual(s.names.filter((_, i) => i !== s.raggedLine - 2));
    expect(parsed.rows.map((r) => r[9])).toEqual(s.openAnswers.filter((_, i) => i !== s.raggedLine - 2));
    const scores = parsed.rows.map((r) => r[8]!);
    expect(scores.filter((v) => v.includes(","))).toHaveLength(1);
    expect(scores.filter((v) => /^\d{2}\.\d{3}$/.test(v))).toHaveLength(118);
    // One value written with a decimal comma makes the whole column text (register row F17): the parser's rule, not ours.
    expect(parsed.cols[8]!.type).toBe("categorical");
    expect(parsed.cols[2]!.type).toBe("numeric");
  });

  it("the comma file has no decimal comma: score is numeric", () => {
    const parsed = statsParseText(survey({ sep: "," }).csv)!;
    expect(parsed.cols[8]!.type).toBe("numeric");
  });

  it("is read the same by the Statistics tab's own sliced parser as by the whole-table parser", async () => {
    for (const csv of [survey().csv, semicolonsToTabs(survey({ sep: ";" }).csv)]) {
      expect(await parseSliced(csv, { slice: 25 })).toEqual(statsParseText(csv));
    }
  });

  it("is the same table from one call to the next, apart from the MARK", () => {
    const a = survey({ openAnswersWithCommas: true }).csv;
    const b = survey({ openAnswersWithCommas: true }).csv;
    expect(a).toBe(b);
  });

  it("openAnswersWithCommas: false gives notes without commas or digits (F1's shape): the personal-data scan calls them names", () => {
    const s = survey({ openAnswersWithCommas: false });
    const latin = s.openAnswers.filter((a) => !DEVANAGARI.test(a));
    expect(latin).toHaveLength(115);
    for (const a of s.openAnswers) {
      expect(a).not.toMatch(/,/);
      expect(a).not.toMatch(/\d/);
    }
    for (const a of latin) expect(pdTestVal("name", a), a).toBe(true);
    const scan = pdScan(statsParseText(s.csv)!);
    expect(scan.found.map((f) => [f.name, f.kind, f.why])).toEqual([["student name", "name", "heading"], ["village", "address", "heading"], ["notes", "name", "values"]]);
    expect(scan.freeText).toEqual([]);
    expect(s.csv.split("\n").every((l) => !l.includes('"'))).toBe(true);
  });

  it("by default the open answers hold commas and digits, so the scan finds long text and not names, as the walk sheet expects", () => {
    const s = survey();
    expect(s.openAnswers.some((a) => a.includes(","))).toBe(true);
    expect(s.openAnswers.some((a) => /\d/.test(a))).toBe(true);
    expect(s.openAnswers.some((a) => !a.includes(",") && !/\d/.test(a) && !DEVANAGARI.test(a))).toBe(true);
    const scan = pdScan(statsParseText(s.csv)!);
    expect(scan.found.map((f) => f.name)).toEqual(["student name", "village"]);
    expect(scan.freeText).toEqual(["notes"]);
  });

  it("the same two things hold for the semicolon file once it is split", () => {
    const comma = pdScan(statsParseText(semicolonsToTabs(survey({ sep: ";", openAnswersWithCommas: true }).csv))!);
    expect(comma.freeText).toEqual(["notes"]);
    const plain = pdScan(statsParseText(semicolonsToTabs(survey({ sep: ";", openAnswersWithCommas: false }).csv))!);
    expect(plain.found.map((f) => f.name)).toContain("notes");
  });

  it("puts the MARK in the answers, so a leaked row can be found, and in no name", () => {
    const s = survey();
    expect(s.openAnswers.filter((a) => a.includes(MARK)).length).toBeGreaterThanOrEqual(30);
    expect(s.names.some((n) => n.includes(MARK))).toBe(false);
    expect(survey({ openAnswersWithCommas: false }).openAnswers.filter((a) => a.includes(MARK)).length).toBeGreaterThanOrEqual(30);
  });
});

describe("interviews()", () => {
  const docs = interviews();

  it("are two transcripts, each titled and holding the MARK", () => {
    expect(docs).toHaveLength(2);
    expect(new Set(docs.map((d) => d.title)).size).toBe(2);
    for (const d of docs) {
      expect(d.title.length).toBeGreaterThan(10);
      expect(d.title).toContain(MARK);
      expect(d.html).toContain(MARK);
    }
  });

  it("have Shift-Enter breaks inside paragraphs, speaker labels, curly and straight quotes, accents and Hindi lines", () => {
    for (const d of docs) {
      const paragraphs = d.html.match(/<p>[\s\S]*?<\/p>/g)!;
      expect(paragraphs.length).toBeGreaterThanOrEqual(10);
      expect(paragraphs.filter((p) => p.includes("<br>")).length).toBeGreaterThanOrEqual(2);
      expect(d.html).toMatch(/<strong>Interviewer:<\/strong>/);
      expect(d.html).toMatch(/<strong>[A-Z][^<:]*:<\/strong>/);
      expect(d.html).toMatch(/[“”]/);
      expect(d.html).toMatch(/[‘’]/);
      expect(d.html).toMatch(/"/);
      expect(d.html).toMatch(/'/);
      expect(d.html).toMatch(/[éëïç]/);
      const hindi = paragraphs.filter((p) => DEVANAGARI.test(p));
      expect(hindi.length).toBeGreaterThanOrEqual(2);
      expect(d.html).not.toMatch(/<(script|style|iframe)/i);
    }
  });

  it("hold the line-break passage of F3: the words on each side of a break are separate words", () => {
    expect(BREAK_PASSAGE.html).toContain("<br>");
    expect(BREAK_PASSAGE.html.replace("<br>", " ")).toBe(BREAK_PASSAGE.text);
    expect(docs[0]!.html).toContain(BREAK_PASSAGE.html);
  });

  it("keep their line breaks, quotes and Hindi through the document sanitiser", () => {
    for (const d of docs) {
      const clean = sanitizeHtml(d.html);
      expect((clean.match(/<br>/g) ?? []).length).toBe((d.html.match(/<br>/g) ?? []).length);
      expect(clean).toContain(MARK);
      expect(clean.match(/[ऀ-ॿ]+/g)!.join(" ")).toBe(d.html.match(/[ऀ-ॿ]+/g)!.join(" "));
      expect(clean).toContain("“");
    }
  });
});

describe("thesisDraft()", () => {
  const copied = PAPER07_SENTENCES[2]!;
  const html = thesisDraft(copied);

  it("is HTML of about 3,000 words with the MARK", () => {
    expect(wordCount(html)).toBeGreaterThan(2_800);
    expect(wordCount(html)).toBeLessThan(3_300);
    expect(html).toContain(MARK);
  });

  it("has an H1 and H2 headings, a 2 x 3 table, a PNG picture and three citations", () => {
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect((html.match(/<h2>/g) ?? []).length).toBeGreaterThanOrEqual(6);
    const table = html.match(/<table>[\s\S]*?<\/table>/g)!;
    expect(table).toHaveLength(1);
    const rows = table[0]!.match(/<tr>[\s\S]*?<\/tr>/g)!;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect((r.match(/<t[dh]>/g) ?? []).length).toBe(3);
    const img = html.match(/<img src="data:image\/png;base64,([A-Za-z0-9+/=]+)" alt="[^"]+">/);
    expect(img).not.toBeNull();
    const png = Buffer.from(img![1]!, "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
    expect(png.length).toBeLessThan(2_000);
    // Three works are cited in the text, and the reference list holds those three.
    const cited = new Set([...html.replace(/&amp;/g, "&").matchAll(/\(([A-Z][A-Za-z]+(?: & [A-Z][A-Za-z]+|, [A-Z][A-Za-z]+ & [A-Z][A-Za-z]+)?), (\d{4})\)/g)].map((m) => m[0]));
    expect(cited.size).toBe(3);
    const references = html.split("<h2>References</h2>")[1]!.match(/<p>[\s\S]*?<\/p>/g)!;
    expect(references).toHaveLength(3);
  });

  it("holds the copied sentence once, whole, inside one paragraph before the reference list", () => {
    const occurrences = html.split(copied).length - 1;
    expect(occurrences).toBe(1);
    const paragraph = html.match(/<p>[\s\S]*?<\/p>/g)!.filter((p) => p.includes(copied));
    expect(paragraph).toHaveLength(1);
    expect(paragraph[0]!.length).toBeGreaterThan(copied.length + 100);
    expect(html.indexOf(copied)).toBeLessThan(html.indexOf("<h2>References</h2>"));
  });

  it("escapes the copied text and survives the document sanitiser with its table, picture and headings", () => {
    const odd = thesisDraft("Tom & Jerry <b>read</b> it.");
    expect(odd).toContain("Tom &amp; Jerry &lt;b&gt;read&lt;/b&gt; it.");
    const clean = sanitizeHtml(html);
    for (const tag of ["<h1>", "<h2>", "<table>", "<img "]) expect(clean).toContain(tag);
    expect(clean).toContain("data:image/png;base64,");
    expect(clean).toContain(copied);
  });
});

describe("hugeRows()", () => {
  const text = hugeRows();
  const lines = text.split("\n");

  it("has 20,001 lines, with lines 5002 and 15002 having a third value, as tools-b.md row 2 describes", () => {
    expect(lines).toHaveLength(20_001);
    expect(lines[0]).toBe("group,score");
    const withThird = lines.map((l, i) => [i + 1, l.split(",").length] as const).filter(([, n]) => n !== 2).map(([i]) => i);
    expect(withThird).toEqual([5_002, 15_002]);
    expect(lines[5_001]!.split(",")).toHaveLength(3);
    expect(lines[15_001]!.split(",")).toHaveLength(3);
    expect(text).toContain(MARK);
  });

  it("is read by the app's parser as two columns and 19,998 rows, and names the two lines it left out", () => {
    const parsed = statsParseText(text)!;
    expect(parsed.headers).toEqual(["group", "score"]);
    expect(parsed.rows).toHaveLength(19_998);
    expect(parsed.cols.map((c) => c.type)).toEqual(["categorical", "numeric"]);
    expect(skippedLines(text, parsed)).toEqual({ count: 2, lines: [5_002, 15_002] });
    expect(new Set(parsed.rows.map((r) => r[0])).size).toBe(2);
  });

  it("is read the same by the Statistics tab's own sliced parser as by the whole-table parser", async () => {
    expect(await parseSliced(text)).toEqual(statsParseText(text));
  });

  it("takes the number of rows asked for", () => {
    expect(hugeRows(6_000).split("\n")).toHaveLength(6_001);
  });
});

describe("hugeWords()", () => {
  it("has 50,000 words, give or take ten, with the MARK", () => {
    const text = hugeWords();
    expect(Math.abs(wordsOf(text).length - 50_000)).toBeLessThanOrEqual(10);
    expect(text).toContain(MARK);
    expect(wordsOf(hugeWords(1_000))).toHaveLength(1_000);
  });

  it("holds the text it is given once, in the middle", () => {
    const inside = PAPER07_PARAGRAPH;
    const text = hugeWords(50_000, inside);
    expect(Math.abs(wordsOf(text).length - 50_000)).toBeLessThanOrEqual(10);
    expect(text.split(inside)).toHaveLength(2);
    const at = text.indexOf(inside) / text.length;
    expect(at).toBeGreaterThan(0.4);
    expect(at).toBeLessThan(0.6);
  });
});

describe("shelfPdfs()", () => {
  it("makes twenty PDFs that start with %PDF- and end with %%EOF, each with its own name", async () => {
    const pdfs = await shelfPdfs();
    expect(pdfs).toHaveLength(20);
    expect(new Set(pdfs.map((p) => p.name)).size).toBe(20);
    for (const p of pdfs) {
      expect(p.name).toMatch(/^paper-\d\d\.pdf$/);
      expect(Buffer.isBuffer(p.bytes)).toBe(true);
      expect(p.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(p.bytes.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
      expect(p.bytes.length).toBeLessThan(8_000);
    }
    expect(pdfs[6]!.name).toBe("paper-07.pdf");
    expect(await shelfPdfs(3)).toHaveLength(3);
  });

  it("are well formed by hand: the cross-reference table points at every object, and every stream is as long as it says", async () => {
    for (const p of await shelfPdfs(4)) {
      const text = p.bytes.toString("latin1");
      const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
      expect(text.slice(start, start + 5), p.name).toBe("xref\n");
      const entries = [...text.slice(start).matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
      expect(entries[0]!.slice(1), p.name).toEqual(["0000000000", "65535", "f"]);
      expect(Number(/\/Size (\d+)/.exec(text)![1]), p.name).toBe(entries.length);
      expect(entries.length, p.name).toBe(1 + 4 + 2 * 2); // the free entry, the catalog, the page tree, two fonts, a content stream and a page for each of two pages
      entries.slice(1).forEach((e, i) => expect(text.slice(Number(e[1]), Number(e[1]) + `${i + 1} 0 obj\n`.length), p.name).toBe(`${i + 1} 0 obj\n`));
      const streams = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
      expect(streams, p.name).toHaveLength(2);
      for (const m of streams) expect(m[2]!.length, p.name).toBe(Number(m[1]));
    }
  });

  it("are pdf.js-readable two-page text papers as the shelf reads them: a title, enough text, the MARK", async () => {
    const pdfs = await shelfPdfs();
    const titles = new Set<string>();
    for (const [i, p] of pdfs.entries()) {
      const { pages, total } = await read(p.bytes);
      expect(total, p.name).toBe(2);
      expect(pages, p.name).toHaveLength(2);
      expect(shChars(pages), p.name).toBeGreaterThanOrEqual(SH_MIN_CHARS * 3);
      for (const page of pages) expect(page.length, p.name).toBeGreaterThan(300);
      const title = shTitleGuess(pages, p.name);
      expect(title, p.name).toBe(paperTitle(i + 1));
      titles.add(title);
      expect(pages.join("\n"), p.name).toContain(MARK);
      expect(pages.join("\n"), p.name).not.toContain("\\");
    }
    expect(titles.size).toBe(20);
  });

  it("holds paper 07's known paragraph on its page 2 (six sentences), and on no other page", async () => {
    expect(PAPER07_SENTENCES).toHaveLength(6);
    expect(PAPER07_SENTENCES.join(" ")).toBe(PAPER07_PARAGRAPH);
    expect(wordsOf(PAPER07_PARAGRAPH).length).toBeGreaterThanOrEqual(80);
    expect(PAPER07_PARAGRAPH).not.toMatch(/["“”\d]/);
    const pdfs = await shelfPdfs();
    const flat = (s: string) => s.replace(/\s+/g, " ");
    for (const [i, p] of pdfs.entries()) {
      const { pages } = await read(p.bytes);
      expect(flat(pages[1]!).includes(PAPER07_PARAGRAPH), p.name).toBe(i === 6);
      expect(flat(pages[0]!).includes(PAPER07_SENTENCES[2]!), p.name).toBe(false);
    }
  });

  it("is a shelf the Closeness engine reads: one sentence of paper 07 in the thesis draft is found in paper 07, page 2, and nothing else is", async () => {
    const shelf = await shelf20();
    const sources = clGather(shelf.map((p) => "s:" + p.id), shelf, [], "");
    const mine = clHtmlToText(thesisDraft(PAPER07_SENTENCES[2]!));
    const r = clCompare(mine, sources, 6, 8);
    expect(r.runs).toHaveLength(1);
    expect(r.sources[r.runs[0]!.src]!.name).toBe(shelf[6]!.title);
    expect(r.runs[0]).toMatchObject({ page: 2, also: [] });
    expect(r.runs[0]!.words).toBeGreaterThanOrEqual(15);
    expect(r.pct).toBeLessThan(2);
    // A thesis with no copied sentence matches nothing on the shelf.
    expect(clCompare(clHtmlToText(thesisDraft("Nobody has written this sentence before the thesis did.")), sources, 6, 8).runs).toEqual([]);
  });

  it("is a shelf against which 50,000 words of nonsense with the paragraph in the middle find the paragraph and little else", async () => {
    const shelf = await shelf20();
    const sources = clGather(shelf.map((p) => "s:" + p.id), shelf, [], "");
    const r = clCompare(hugeWords(50_000, PAPER07_PARAGRAPH), sources, 6, 8);
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0]).toMatchObject({ src: 6, page: 2 });
    expect(r.runs[0]!.words).toBe(clTok(PAPER07_PARAGRAPH).length);
    expect(r.pct).toBeLessThan(1);
  });
});

// ---- Reading the PDFs as the shelf does -------------------------------------------------------------------------------------------------------------

/** A PDF's pages as the shelf keeps them (lib/shelf/extract.ts: each page's text items joined by core's shPageText), read with pdf.js's Node build. */
async function read(bytes: Buffer): Promise<{ pages: string[]; total: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let k = 1; k <= pdf.numPages; k++) {
    const tc = await (await pdf.getPage(k)).getTextContent();
    const items = tc.items as unknown[];
    pages.push(shPageText(items.filter((it): it is ShTextItem => typeof it === "object" && it !== null && "str" in it)));
  }
  const total = pdf.numPages;
  await task.destroy();
  return { pages, total };
}

async function shelf20(): Promise<Array<ClShelfPaper & { title: string }>> {
  const out: Array<ClShelfPaper & { title: string }> = [];
  for (const p of await shelfPdfs()) {
    const { pages } = await read(p.bytes);
    out.push({ id: p.name, file: p.name, title: shTitleGuess(pages, p.name), pages });
  }
  return out;
}
