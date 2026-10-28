import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CIT_STYLES, citFmt } from "../../src/citation";
import type { CitationEntry, CitationStyle } from "../../src/citation";
import { escHTML } from "../../src/html";
import { LIBRARY_FILE_NAME, LIBRARY_IMPORT_MAX_BYTES, bibliography, bibliographyHtml, citKey, citNumFor, citNumsIn, citRegex, citUsage, citUsageNumbered, docPlainForCitations, exportLibrary, mergeLibrary } from "../../src/citlib";
import type { PlainDoc, Usage } from "../../src/citlib";
import { generatedText } from "./citlib/capture";
import type { Inputs } from "./citlib/capture";
import { readFixture } from "./harness/fixture";

/**
 * citlib.ts (v1's citKey 7488, citNumFor 7489-7493, citPlainDocs 7515-7523, citRegex 7524-7529, citNumsIn 7530-7538, citUsageNumbered 7539-7548, citUsage 7549-7555, citInsertBib 7871-7881, citExport
 * 7991-7998 and citImport 7999-8023) against v1 running. Every expected value is read from test/golden/citlib/cases.json (`golden:capture citlib`), captured from the hand-written citlib/inputs.json; the
 * inputs sit beside the outputs in the fixture, and each test first checks that they are this suite's inputs.
 * Typed here, from the brief: the two import toasts and the file name (the fixture must agree with them), and what the brief says the import files are (five entries in the v1 export, two of them in the
 * library; 2,001 entries in the large file). The rest are guards that the inputs reach each branch.
 */

type Doc = { id: string; title: string; html: string; plain: PlainDoc };
type Fx = {
  lib: CitationEntry[];
  probes: CitationEntry[];
  docs: Doc[];
  usage: Array<{ style: CitationStyle; i: number; idx: number; out: Usage[] }>;
  numbered: Array<{ n: number; out: Usage[] }>;
  numFor: Array<{ style: CitationStyle; i: number; out: { n: number; saved: boolean } }>;
  keys: Array<{ i: number; out: string }>;
  regex: Array<{ i: number; out: { source: string; flags: string } | null }>;
  nums: Array<{ str: string; out: number[] }>;
  bib: Array<{ style: CitationStyle; html: string }>;
  export: { text: string; download: string; toast: string };
  imports: Array<{ id: string; text: string; libAfter: CitationEntry[]; toast: string }>;
  cap: { accepted: { size: number; toast: string }; refused: { size: number; toast: string } };
};

const inputs = JSON.parse(readFileSync(new URL("./citlib/inputs.json", import.meta.url), "utf8")) as Inputs;
const fx = readFixture<Fx>("citlib", "cases");
const lib = inputs.lib as CitationEntry[];
/** The library, then the probes: what `i` indexes in numFor, keys and regex. */
const everyone = [...lib, ...(inputs.probes as CitationEntry[])];
const STYLES = Object.keys(CIT_STYLES) as CitationStyle[];
const merged = (added: number) => `${added} sources merged into your library ✓`;
const NOT_A_LIBRARY = "Could not read that file — it must be a library JSON exported from Appuscholar";
const importOf = (id: string) => fx.imports.find((c) => c.id === id)!;
const fileOf = (id: string) => inputs.imports.find((f) => f.id === id)!;
/** A file entry that is in the library by v1's duplicate rule (8009): the same title and author, compared exactly. */
const inLib = (e: CitationEntry) => lib.some((l) => l.title === String(e.title) && l.author === String(e.author));

describe("citlib.ts is v1's library code", () => {
  it("docPlainForCitations equals citPlainDocs per document", () => {
    expect(fx.docs.map(({ id, title, html }) => ({ id, title, html }))).toEqual(inputs.docs);
    for (const d of fx.docs) expect(docPlainForCitations(d.id, d.title, d.html), d.id).toEqual(d.plain);
    // The documents reach each part: superscripts of both kinds, a document without a title, one where nothing is found.
    expect(fx.docs.some((d) => d.plain.sups.length > 0 && d.html.includes("<sup") && d.html.includes("<span style="))).toBe(true);
    expect(fx.docs.some((d) => d.title === "" && d.plain.title !== "")).toBe(true);
    expect(fx.docs.some((d) => d.plain.sups.length === 0 && !fx.usage.some((u) => u.out.some((x) => x.id === d.id)))).toBe(true);
  });

  it("citUsage and citUsageNumbered equal v1 for every entry and style", () => {
    expect(fx.lib).toEqual(inputs.lib);
    const docs = fx.docs.map((d) => d.plain);
    expect(fx.usage.map((c) => [c.style, c.i, c.idx])).toEqual(STYLES.flatMap((style) => lib.flatMap((_, i) => [[style, i, i], [style, i, -1]])));
    for (const c of fx.usage) expect(citUsage(lib[c.i]!, docs, c.idx, c.style), `${c.style} lib[${c.i}] idx ${c.idx}`).toEqual(c.out);
    for (const c of fx.numbered) expect(citUsageNumbered(c.n, docs), `n = ${c.n}`).toEqual(c.out);
    // Both branches find something; in a numbered style the index decides the branch (7550), so idx -1 gives what the author-year branch gives.
    const numbered = (st: CitationStyle) => CIT_STYLES[st].numbered;
    expect(fx.usage.some((c) => !numbered(c.style) && c.out.length > 0)).toBe(true);
    expect(fx.usage.some((c) => numbered(c.style) && c.idx >= 0 && c.out.length > 0)).toBe(true);
    const authorYear = fx.usage.find((c) => !numbered(c.style) && c.out.length > 0)!;
    expect(fx.usage.find((c) => numbered(c.style) && c.i === authorYear.i && c.idx === -1)!.out).toEqual(authorYear.out);
    expect(fx.numbered.some((c) => c.out.length > 0) && fx.numbered.some((c) => c.out.length === 0)).toBe(true);
  });

  it("citNumFor equals v1 for saved and unsaved entries", () => {
    expect(fx.probes).toEqual(inputs.probes);
    expect(fx.keys.map((c) => c.i)).toEqual(everyone.map((_, i) => i));
    for (const c of fx.keys) expect(citKey(everyone[c.i]!), `#${c.i}`).toBe(c.out);
    expect(fx.numFor.map((c) => [c.style, c.i])).toEqual(STYLES.flatMap((style) => everyone.map((_, i) => [style, i])));
    for (const c of fx.numFor) expect(citNumFor(lib, everyone[c.i]!), `${c.style} #${c.i}`).toEqual(c.out);
    // A saved entry is numbered by the first library entry with its key; an entry that is not saved is numbered one past the end.
    for (const c of fx.numFor) {
      if (c.out.saved) expect(fx.keys[c.out.n - 1]!.out).toBe(fx.keys[c.i]!.out);
      else expect(c.out.n).toBe(lib.length + 1);
    }
    expect(fx.numFor.some((c) => c.i >= lib.length && c.out.saved)).toBe(true); // a probe found by its key
    expect(fx.numFor.some((c) => c.i < lib.length && c.out.n !== c.i + 1)).toBe(true); // a library entry with an earlier entry's key
    expect(fx.numFor.some((c) => !c.out.saved)).toBe(true);
  });

  it("bibliographyHtml equals the block citInsertBib inserted, per style", () => {
    expect(fx.bib.map((c) => c.style)).toEqual(STYLES);
    for (const c of fx.bib) expect(bibliographyHtml(lib, c.style), c.style).toBe(c.html);
    // bibliography() is what the block is made of: the heading, then one paragraph per entry in v1's order, each the entry's refHTML formatted with its number.
    for (const c of fx.bib) {
      const b = bibliography(lib, c.style);
      const paragraphs = [...c.html.matchAll(/<p class="ref-item"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
      expect(b.items.map((x) => x.fmt.refHTML), c.style).toEqual(paragraphs);
      expect(c.html).toContain(`<b>${escHTML(b.head)}</b>`);
      expect(b.numbered).toBe(CIT_STYLES[c.style].numbered);
      // An empty library (v1 showed a toast instead, 7872): v1's block up to its first item, the blank paragraph and the heading.
      expect(bibliographyHtml([], c.style), c.style).toBe(c.html.slice(0, c.html.indexOf('<p class="ref-item"')));
      expect(b.items.map((x) => x.index).sort((p, q) => p - q)).toEqual(lib.map((_, i) => i));
      if (b.numbered) expect(b.items.map((x) => x.index)).toEqual(lib.map((_, i) => i));
      for (const x of b.items) {
        expect(x.entry).toBe(lib[x.index]);
        expect(x.number).toBe(b.numbered ? x.index + 1 : 0);
        expect(x.fmt).toEqual(citFmt(x.entry, x.number, c.style));
      }
    }
    // The author-year order is not the library's: v1 sorts by surname.
    expect(fx.bib.some((c) => !CIT_STYLES[c.style].numbered && bibliography(lib, c.style).items.some((x, k) => x.index !== k))).toBe(true);
  });

  it("citRegex source and flags equal v1's; null where v1 returns null", () => {
    expect(fx.regex.map((c) => c.i)).toEqual(everyone.map((_, i) => i));
    for (const c of fx.regex) {
      const re = citRegex(everyone[c.i]!);
      expect(re === null ? null : { source: re.source, flags: re.flags }, `#${c.i}`).toEqual(c.out);
    }
    expect(fx.regex.some((c) => c.out === null)).toBe(true);
    expect(fx.regex.some((c) => c.out !== null)).toBe(true);
  });

  it("citNumsIn equals v1 (ranges, reversed ranges, wide ranges capped at 200)", () => {
    expect(fx.nums.map((c) => c.str)).toEqual(inputs.nums);
    for (const c of fx.nums) expect([...citNumsIn(c.str)], JSON.stringify(c.str)).toEqual(c.out);
    expect(fx.nums.some((c) => /^\d+-\d+$/.test(c.str) && c.out.length === 0)).toBe(true); // a range v1 drops
    expect(fx.nums.some((c) => c.out.length > 150)).toBe(true); // a wide range v1 keeps
  });

  it("mergeLibrary: v1 export merges with v1's toast count; 2,001 entries keep the first 2,000; duplicates on exact title+author are skipped; an object root is not-a-library; entries without a title are skipped", () => {
    expect(fx.imports.map((c) => c.id)).toEqual(inputs.imports.map((f) => f.id));
    const before = JSON.stringify(lib);
    for (const c of fx.imports) {
      // The text v1 read is the file the inputs describe. An `export` file is v1's own export of its entries, which exportLibrary writes too.
      const f = fileOf(c.id);
      expect(c.text, c.id).toBe(f.export ? exportLibrary(f.export as CitationEntry[]) : f.json !== undefined ? JSON.stringify(f.json, null, 2) : f.text !== undefined ? f.text : generatedText(f.generate!));
      let incoming: unknown;
      try {
        incoming = JSON.parse(c.text);
      } catch {
        // Not JSON: v1 says what it says for a file that is not a library and keeps the library. mergeLibrary takes the parsed file, so the panel parses and shows the same.
        expect(c.toast, c.id).toBe(NOT_A_LIBRARY);
        expect(c.libAfter, c.id).toEqual(lib);
        continue;
      }
      const r = mergeLibrary(lib, incoming);
      if (r.ok) {
        expect(r.lib, c.id).toEqual(c.libAfter);
        expect(JSON.stringify(r.lib), c.id).toBe(JSON.stringify(c.libAfter)); // key order too: it reaches exportLibrary's text
        expect(c.toast, c.id).toBe(merged(r.added));
        expect(r.lib.length, c.id).toBe(lib.length + r.added);
      } else {
        expect(c.toast, c.id).toBe(NOT_A_LIBRARY);
        expect(c.libAfter, c.id).toEqual(lib);
      }
    }
    expect(JSON.stringify(lib)).toBe(before); // the library mergeLibrary was given is as it was

    // The v1 export: five entries, two of them already in the library, so v1 merged the other three.
    const exp = fileOf("v1-export").export as CitationEntry[];
    expect(exp).toHaveLength(5);
    expect(exp.filter(inLib)).toHaveLength(2);
    expect(importOf("v1-export").toast).toBe(merged(exp.length - exp.filter(inLib).length));
    // 2,001 entries: v1 takes the first 2,000 before it skips duplicates, so the head's duplicate counts against them and the 2,001st never goes in.
    const big = JSON.parse(importOf("two-thousand-and-one").text) as CitationEntry[];
    expect(big).toHaveLength(2001);
    expect(big.slice(0, 2000).some(inLib)).toBe(true);
    const bigAfter = importOf("two-thousand-and-one").libAfter;
    expect(bigAfter.slice(lib.length).map((e) => e.title)).toEqual(big.slice(0, 2000).filter((e) => !inLib(e)).map((e) => e.title));
    expect(bigAfter.some((e) => e.title === big[2000]!.title)).toBe(false);
    // Duplicates (D-W1-3): no title and author pair goes in twice, from the library or from the file itself; a copy differing only in case or spaces goes in.
    const skip = importOf("skip-rules").libAfter;
    const pair = (e: CitationEntry) => JSON.stringify([e.title, e.author]);
    expect(new Set(skip.map(pair)).size).toBe(skip.length);
    expect((JSON.parse(importOf("skip-rules").text) as unknown[]).filter((e) => e !== null && typeof e === "object" && inLib(e as CitationEntry)).length).toBeGreaterThan(0);
    const fold = (s: string | undefined) => (s ?? "").trim().toLowerCase();
    expect(skip.slice(lib.length).some((e) => lib.some((l) => !inLib(e) && fold(l.title) === fold(e.title) && fold(l.author) === fold(e.author)))).toBe(true);
    // An object root is not a library.
    expect(mergeLibrary(lib, JSON.parse(importOf("object-root").text))).toEqual({ ok: false, reason: "not-a-library" });
    // Entries without a title are skipped.
    const titled = JSON.parse(importOf("missing-title").text) as Array<{ title?: unknown }>;
    expect(titled.some((e) => !e.title)).toBe(true);
    expect(importOf("missing-title").libAfter.slice(lib.length).map((e) => e.title)).toEqual(titled.filter((e) => e.title).map((e) => String(e.title)));
    // The file-size cap (D-W1-2) is the panel's check; LIBRARY_IMPORT_MAX_BYTES is the largest file v1 reads.
    expect(fx.cap.accepted.size).toBe(LIBRARY_IMPORT_MAX_BYTES);
    expect(fx.cap.refused.size).toBe(LIBRARY_IMPORT_MAX_BYTES + 1);
    expect(fx.cap.accepted.toast).toBe(merged(0));
    expect(fx.cap.refused.toast).not.toBe(fx.cap.accepted.toast);
  });

  it("exportLibrary is v1's pretty JSON and the file name is v1's", () => {
    expect(exportLibrary(lib)).toBe(JSON.stringify(lib, null, 2));
    expect(LIBRARY_FILE_NAME).toBe("psychology-class-library.json");
    // Both are what v1's citExport wrote.
    expect(exportLibrary(lib)).toBe(fx.export.text);
    expect(LIBRARY_FILE_NAME).toBe(fx.export.download);
    // An empty library (v1 showed a toast instead, 7992).
    expect(exportLibrary([])).toBe(JSON.stringify([], null, 2));
  });
});
