import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JSDOM } from "jsdom";
import { docToSlideModel, docToSlideModelV2 } from "../../src/pptModel";

/**
 * docToSlideModelV2 (pptModel.ts), the named sibling of the ported docToSlideModel (whose golden, pptmodel.test.ts, is unchanged). Hand-written expectations: v1 has no behaviour to
 * capture for the two things that differ, and each test states the difference from V1 (register D-S2-99):
 *  1. element text goes through docInnerText (register F26: v1's `textOf` 4959 reads innerText), so a <br> and a list item inside another read with a line break, as in the browser;
 *  2. a document with no title on any slide gives its first slide the document's title ('Untitled' when blank); V1 left it null. `hasHeadings` says whether a Heading 1, 2 or 3 gave
 *     a slide its title (v1's `slides.some(s=>s.title)`, read before that titling and after the whole-text fallback, as in v1), so the tab can still show the "no headings" note.
 */
let saved: unknown;
beforeAll(() => {
  saved = (globalThis as { DOMParser?: unknown }).DOMParser;
  (globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM("").window.DOMParser;
});
afterAll(() => {
  (globalThis as { DOMParser?: unknown }).DOMParser = saved;
});

const IMG = "data:image/png;base64,iVBORw0KGgo=";

describe("docToSlideModelV2: a document without headings is one slide titled with the document's name", () => {
  it("differs from V1, which gave the paragraphs one slide with a null title", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    expect(docToSlideModel(html, "My draft")).toEqual([{ title: null, bullets: ["First paragraph.", "Second paragraph."], images: [] }]);
    expect(docToSlideModelV2(html, "My draft")).toEqual({ slides: [{ title: "My draft", bullets: ["First paragraph.", "Second paragraph."], images: [] }], hasHeadings: false });
  });
  it("a document of an image and a table, with no heading, is one slide with the title, the table bullet and the picture", () => {
    const html = `<p><img src="${IMG}"></p><table><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>`;
    const r = docToSlideModelV2(html, "Thesis");
    expect(r.slides).toEqual([{ title: "Thesis", bullets: ["Table: A | 1 — B | 2"], images: [IMG] }]);
    expect(r.hasHeadings).toBe(false);
  });
  it("only the first slide is titled, and only when no slide has a title (a leading paragraph before a heading stays untitled, as in V1)", () => {
    const r = docToSlideModelV2("<p>Lead.</p><h1>First</h1><p>Under.</p>", "My draft");
    expect(r.slides.map((s) => s.title)).toEqual([null, "First"]);
    expect(r.hasHeadings).toBe(true);
  });
  it("a document with headings is V1's model unchanged, and hasHeadings is true", () => {
    const html = "<h1>Intro</h1><p>One.</p><h2>Method</h2><p>Two.</p><h3>Sample</h3><p>Three.</p>";
    const r = docToSlideModelV2(html, "T");
    expect(r.slides).toEqual(docToSlideModel(html, "T"));
    expect(r.hasHeadings).toBe(true);
  });
  it("a blank or missing title gives 'Untitled'", () => {
    for (const t of ["", "   ", null, undefined]) expect(docToSlideModelV2("<p>x</p>", t).slides[0]!.title).toBe("Untitled");
  });
  it("an empty document has no slides and no headings", () => {
    expect(docToSlideModelV2("", "T")).toEqual({ slides: [], hasHeadings: false });
    expect(docToSlideModelV2("<p> </p>", "T")).toEqual({ slides: [], hasHeadings: false });
  });
  it("the whole-document fallback keeps V1's rule (text outside any element: one slide, the title, up to 10 lines), and hasHeadings is true there as in V1, whose fallback slide carries the title", () => {
    const r = docToSlideModelV2("line one\nline two\n\nline three", "Bare text");
    expect(r.slides).toEqual([{ title: "Bare text", bullets: ["line one", "line two", "line three"], images: [] }]);
    expect(r.slides).toEqual(docToSlideModel("line one\nline two\n\nline three", "Bare text"));
    expect(r.hasHeadings).toBe(true);
    expect(docToSlideModelV2("a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl", "T").slides[0]!.bullets).toHaveLength(10);
  });
});

describe("docToSlideModelV2: element text keeps the line breaks the browser shows (docInnerText, F26)", () => {
  it("a <br> in a paragraph reads as a line break (V1 read 'linebreak')", () => {
    expect(docToSlideModel("<h1>T</h1><p>line<br>break</p>", "x")[0]!.bullets).toEqual(["linebreak"]);
    expect(docToSlideModelV2("<h1>T</h1><p>line<br>break</p>", "x").slides[0]!.bullets).toEqual(["line\nbreak"]);
  });
  it("a list item inside another list item reads on its own line (V1: 'outerinner')", () => {
    const html = "<h1>T</h1><ul><li>outer<ul><li>inner</li></ul></li><li>next</li></ul>";
    expect(docToSlideModel(html, "x")[0]!.bullets).toEqual(["outerinner", "next"]);
    expect(docToSlideModelV2(html, "x").slides[0]!.bullets).toEqual(["outer\ninner", "next"]);
  });
  it("a heading, a table cell and a plain paragraph read as before when they hold no break", () => {
    const r = docToSlideModelV2("<h2>  Method </h2><p>Plain.</p><table><tr><th>G</th><th>M</th></tr><tr><td>A</td><td>4.2</td></tr></table>", "x");
    expect(r.slides).toEqual([{ title: "Method", bullets: ["Plain.", "Table: G | M — A | 4.2"], images: [] }]);
  });
  it("entities are decoded and Devanagari is kept", () => {
    expect(docToSlideModelV2("<h1>A &amp; B</h1><p>नमस्ते &lt;दुनिया&gt;</p>", "x").slides).toEqual([{ title: "A & B", bullets: ["नमस्ते <दुनिया>"], images: [] }]);
  });
  it("a paragraph that holds a picture gets no bullet and sends the picture to the slide (V1's rule)", () => {
    const r = docToSlideModelV2(`<h1>P</h1><p>words <img src="${IMG}"></p><p>plain</p>`, "x");
    expect(r.slides).toEqual([{ title: "P", bullets: ["plain"], images: [IMG] }]);
  });
});

describe("docToSlideModelV2: a long document", () => {
  it("grows in step with the document (3 times the paragraphs takes well under 10 times as long), so no paragraph costs a whole-document pass", () => {
    const doc = (n: number) => "<h1>Long</h1>" + Array.from({ length: n }, (_, i) => `<p>Paragraph number ${i} of the long document, with a <b>bold</b> word.</p>`).join("");
    const time = (n: number) => { const h = doc(n); const t = performance.now(); const r = docToSlideModelV2(h, "x"); const dt = performance.now() - t; expect(r.slides[0]!.bullets).toHaveLength(n); return dt; };
    time(300);
    const small = Math.min(time(1000), time(1000));
    const big = Math.min(time(3000), time(3000));
    expect(big / small).toBeLessThan(10);
  }, 60_000);
});
