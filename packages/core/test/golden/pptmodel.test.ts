import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JSDOM } from "jsdom";
import {
  PPT_MAX_BULLETS, PPT_PREVIEW_BULLETS, PPT_BULLET_CHARS, PPT_PREVIEW_CHARS, docToSlideModel, pptHasHeadings, pptPreviewBullets, pptxFileName, pptxDeckSpec,
} from "../../src/pptModel";
import type { PptxDeck } from "../../src/pptModel";
import type { PptFx, PptDeckCall } from "./pptmodel/capture";
import { readFixture } from "./harness/fixture";

/**
 * The PPT slide model (pptModel.ts) against v1's page (`golden:capture pptmodel`, pptmodel/capture.ts): docToSlideModel(html, title) against docToSlideModel() with the editor holding
 * that HTML (31 cases), the preview's rules (the warning, 8 bullets of 200 characters) against pptxBuildPreview(), the file's (10 bullets of 300 characters, the first picture, the file
 * name) against what pptxDownload handed a recording PptxGenJS. The port parses with the platform's DOMParser; core's tests run under node, so jsdom's stands in for it here, as v1's
 * capture runs under jsdom.
 */

let saved: unknown;
beforeAll(() => {
  saved = (globalThis as { DOMParser?: unknown }).DOMParser;
  (globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM("").window.DOMParser;
});
afterAll(() => {
  (globalThis as { DOMParser?: unknown }).DOMParser = saved;
});

const fx = readFixture<PptFx>("pptmodel", "cases");

/** What a PptxGenJS deck makes of the spec, as the calls v1's pptxDownload made. */
function calls(d: PptxDeck): PptDeckCall[] {
  const out: PptDeckCall[] = [{ op: "defineSlideMaster", args: [d.master] }];
  for (const s of d.slides) {
    out.push({ op: "addSlide", args: [] });
    if (s.title) out.push({ op: "addText", args: [s.title.text, s.title.options] });
    if (s.bullets) out.push({ op: "addText", args: [s.bullets.items, s.bullets.options] });
    if (s.image) out.push({ op: "addImage", args: [s.image] });
  }
  return out;
}

describe("pptModel: the slide models of the golden documents match v1", () => {
  it("covers the 10 documents the plan lists, among 31", () => {
    const ids = fx.cases.map((c) => c.id);
    expect(fx.cases.length).toBeGreaterThanOrEqual(10);
    for (const id of ["headings-h1-h2-h3", "leading-content-null-title", "lists", "ordered-list-only", "table", "images", "more-than-10-bullets", "no-headings", "bare-text-fallback", "empty-doc", "devanagari"]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const c of fx.cases) {
    it(`${c.id}: docToSlideModel (4954-4987)`, () => {
      expect(docToSlideModel(c.html, c.title)).toEqual(c.slides);
    });
    it(`${c.id}: hasHeadings and the preview (4988-5008)`, () => {
      const slides = docToSlideModel(c.html, c.title);
      expect(pptHasHeadings(slides)).toBe(c.hasHeadings);
      expect(slides.length === 0).toBe(c.preview.empty);
      if (slides.length) expect(!pptHasHeadings(slides)).toBe(c.preview.warned);
      expect(slides.map((s) => pptPreviewBullets(s.bullets).length)).toEqual(c.preview.bulletsShown);
      expect(slides.map((s) => s.images.length)).toEqual(c.preview.imagesShown);
    });
    it(`${c.id}: the file pptxDownload wrote (5009-5030)`, () => {
      const slides = docToSlideModel(c.html, c.title);
      if (!slides.length) {
        expect(c.deck).toEqual([]);
        return;
      }
      expect(calls(pptxDeckSpec(slides))).toEqual(c.deck);
      expect(pptxFileName(c.title)).toBe(c.fileName);
    });
  }
});

describe("pptModel: file names and the slice values", () => {
  for (const f of fx.fileNames) {
    it(`pptxFileName(${JSON.stringify(f.title)})`, () => {
      expect(pptxFileName(f.title)).toBe(f.fileName);
    });
  }
  it("the constants are v1's slice values", () => {
    expect(PPT_MAX_BULLETS).toBe(fx.constants.fileBullets);
    expect(PPT_PREVIEW_BULLETS).toBe(fx.constants.previewBullets);
    expect(PPT_BULLET_CHARS).toBe(fx.constants.fileChars);
    expect(PPT_PREVIEW_CHARS).toBe(fx.constants.previewChars);
    expect(fx.constants.fallbackParts).toBe(10);
    expect([PPT_MAX_BULLETS, PPT_PREVIEW_BULLETS, PPT_BULLET_CHARS, PPT_PREVIEW_CHARS]).toEqual([10, 8, 300, 200]);
  });
  it("the model keeps every bullet; the cap is applied when the file is made", () => {
    const html = "<h1>Many</h1>" + Array.from({ length: 14 }, (_, i) => `<p>b${i}</p>`).join("");
    const slides = docToSlideModel(html, "T");
    expect(slides[0]!.bullets).toHaveLength(14);
    expect(pptxDeckSpec(slides).slides[0]!.bullets!.items).toHaveLength(PPT_MAX_BULLETS);
    expect(pptPreviewBullets(slides[0]!.bullets)).toHaveLength(PPT_PREVIEW_BULLETS);
  });
  it("a document with no headings and only paragraphs is one slide with a null title (v1), not one titled with the document's name", () => {
    expect(docToSlideModel("<p>one</p><p>two</p>", "My draft")).toEqual([{ title: null, bullets: ["one", "two"], images: [] }]);
  });
  it("throws a clear error where there is no DOMParser", () => {
    const keep = (globalThis as { DOMParser?: unknown }).DOMParser;
    delete (globalThis as { DOMParser?: unknown }).DOMParser;
    try {
      expect(() => docToSlideModel("<p>x</p>", "T")).toThrow(/DOMParser/);
    } finally {
      (globalThis as { DOMParser?: unknown }).DOMParser = keep;
    }
  });
});
