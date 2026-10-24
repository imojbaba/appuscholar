// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { generateJSON, generateHTML } from "@tiptap/html";
import { sanitizeHtml } from "@appuscholar/core";
import { JSDOM } from "jsdom";
import { editorExtensions } from "../lib/editorExtensions";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const V1_HTML = [
  "<h2>Results</h2>",
  '<p>Plain text, then <span class="ai-ins" data-h="abc123">an AI insertion</span> and <mark>marked</mark> words, H<sub>2</sub>O and x<sup>2</sup>.</p>',
  `<p><span class="img-wrap"><img src="${PNG}" alt="chart"></span> after the image</p>`,
  "<table><tbody><tr><th>Group</th><th>n</th></tr><tr><td>Control</td><td>12</td></tr></tbody></table>",
  '<p><span style="color: rgb(255, 0, 0)">red</span> text</p>',
  '<p style="text-align: center">centred</p>',
  '<p style="margin-left: 4em">indented</p>',
  `<p><img src="${PNG}" alt="wide" style="width: 640px"></p>`,
  "<div class=\"page-break\" data-page-break></div>",
  "<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>"
].join("");

function roundTrip(html: string) {
  return generateHTML(generateJSON(html, editorExtensions), editorExtensions);
}

describe("editor schema keeps v1 content", () => {
  const out = roundTrip(sanitizeHtml(V1_HTML));

  it("keeps tables", () => {
    expect(out).toContain("<table");
    expect(out).toMatch(/<th[^>]*>.*Group/);
    expect(out).toMatch(/<td[^>]*>.*Control/);
  });
  it("keeps inline base64 images inside their wrapper span", () => {
    expect(out).toContain(`src="${PNG}"`);
    expect(out).toMatch(/<span class="img-wrap"><img [^>]*src="data:image\/png;base64,/);
  });
  it("keeps AI-insertion spans with their data attributes", () => {
    expect(out).toMatch(/<span class="ai-ins" data-h="abc123">an AI insertion<\/span>/);
  });
  it("keeps mark, sub, sup and inline colour", () => {
    expect(out).toContain("<mark>marked</mark>");
    expect(out).toContain("<sub>2</sub>");
    expect(out).toContain("<sup>2</sup>");
    expect(out).toMatch(/<span style="color: ?rgb\(255, 0, 0\);?">red<\/span>/);
  });
  it("keeps a table's header row", () => {
    expect(out).toMatch(/<th[^>]*>(<p>)?A/);
  });
  it("keeps paragraph alignment", () => {
    expect(out).toMatch(/<p style="text-align: center;?">centred<\/p>/);
  });
  it("keeps a paragraph's indent", () => {
    expect(out).toMatch(/<p style="margin-left: 4em;?">indented<\/p>/);
  });
  it("keeps an image's width", () => {
    expect(out).toMatch(/<img [^>]*style="width: 640px;?"/);
  });
  it("keeps a page break, with or without its data attribute", () => {
    expect(out).toMatch(/<div class="page-break" data-page-break[^>]*><\/div>/);
    expect(roundTrip(sanitizeHtml('<div class="page-break" data-page-break></div>'))).toMatch(/data-page-break/);
  });
  it("is stable: a second round trip through the sanitiser and schema changes nothing", () => {
    expect(roundTrip(sanitizeHtml(out))).toBe(out);
  });
});

describe("editor schema keeps the Citation Manager's markup (Task 8b)", () => {
  // v1's own markup: citInsertBib 7877-7878 and citInsertQuote 7897.
  const BIB = '<p><br></p><p class="ref-head" style="text-align:center;margin:14px 0 8px"><b>References</b></p>' +
    '<p class="ref-item" style="padding-left:2em;text-indent:-2em;margin:0 0 6px">Miller, G. A. (1956). The magical number seven. <i>Psychological Review</i>, <i>63</i>(2), 81–97.</p>';
  const QUOTE = '<p>Text <span class="translated-quote" title="He said &quot;less is more&quot; &amp; left.">“कम ही अधिक” (अनुवादित)</span> after.</p>';
  it("keeps the reference list's classes, centred heading and hanging indent, through the sanitiser too", () => {
    for (const out of [roundTrip(BIB), roundTrip(sanitizeHtml(BIB))]) {
      const body = new JSDOM(out).window.document.body;
      const [blank, head, item] = Array.from(body.children) as HTMLElement[];
      expect(blank!.outerHTML).toBe("<p><br></p>");
      expect(head!.className).toBe("ref-head");
      expect([head!.style.textAlign, head!.style.marginTop, head!.style.marginRight, head!.style.marginBottom, head!.style.marginLeft]).toEqual(["center", "14px", "0px", "8px", "0px"]);
      expect(head!.innerHTML).toBe("<strong>References</strong>");
      expect(item!.className).toBe("ref-item");
      expect([item!.style.paddingLeft, item!.style.textIndent, item!.style.marginTop, item!.style.marginBottom]).toEqual(["2em", "-2em", "0px", "6px"]);
      expect(item!.innerHTML).toBe("Miller, G. A. (1956). The magical number seven. <em>Psychological Review</em>, <em>63</em>(2), 81–97.");
      expect(roundTrip(sanitizeHtml(out))).toBe(out);
    }
  });
  it("keeps a translated quote's class and its title (the original, shown on hover)", () => {
    const out = roundTrip(sanitizeHtml(QUOTE));
    expect(out).toContain('<span class="translated-quote" title="He said &quot;less is more&quot; &amp; left.">“कम ही अधिक” (अनुवादित)</span>');
    expect(roundTrip(sanitizeHtml(out))).toBe(out);
  });
  it("keeps no class or padding on other paragraphs, and no title on spans that had none", () => {
    const out = roundTrip(sanitizeHtml('<p class="other" style="padding-left:2em">x</p><p><span class="ai-ins" data-h="h1">y</span></p>'));
    expect(out).toBe('<p>x</p><p><span class="ai-ins" data-h="h1">y</span></p>');
  });
});

describe("editor schema keeps caption paragraphs and picture edits (wave D, Task 2)", () => {
  // v1's own markup: capBlocksHTML 4501, capNoteHTML 4505, and the picture editor's data-edits (ieApply 4517-4537).
  const CAP = '<p data-cap="figure"><strong>Figure 1</strong></p>';
  const TABLE_CAP = '<p data-cap="table"><strong>Table 2</strong></p>';
  const TITLE = '<p data-cap-title="1"><em>T</em></p>';
  const NOTE = '<p data-cap-note="1"><em>Note.</em> n</p>';
  const IMG = '<p><img src="data:image/png;base64,AAAA" data-edits="cropped, bar"></p>';
  const ALL = CAP + TITLE + IMG + NOTE + TABLE_CAP;

  it("keeps each caption paragraph attribute through the sanitiser and the schema, unchanged", () => {
    for (const html of [CAP, TABLE_CAP, TITLE, NOTE]) {
      expect(roundTrip(sanitizeHtml(html))).toBe(html);
      expect(sanitizeHtml(html)).toBe(html);
    }
  });
  it("keeps a picture's data-edits", () => {
    expect(sanitizeHtml(IMG)).toBe(IMG);
    expect(roundTrip(sanitizeHtml(IMG))).toBe(IMG);
  });
  it("keeps a picture's edits next to its width", () => {
    const out = roundTrip(sanitizeHtml('<p><img src="data:image/png;base64,AAAA" style="width: 640px" data-edits="turned"></p>'));
    expect(out).toMatch(/<img [^>]*style="width: 640px;?"/);
    expect(out).toMatch(/<img [^>]*data-edits="turned"/);
  });
  it("is stable: a second round trip changes nothing", () => {
    const out = roundTrip(sanitizeHtml(ALL));
    expect(out).toBe(ALL);
    expect(roundTrip(sanitizeHtml(out))).toBe(out);
  });
  it("gives a caption paragraph no attribute when it had none, and ignores an unknown cap value", () => {
    expect(roundTrip(sanitizeHtml('<p data-cap="chart"><strong>Figure 1</strong></p><p><strong>Figure 2</strong></p>'))).toBe('<p><strong>Figure 1</strong></p><p><strong>Figure 2</strong></p>');
  });
  it("a v1-imported document keeps its caption marks and edits after the editor loads it and saves it back", () => {
    const e = new Editor({ extensions: editorExtensions, content: sanitizeHtml(ALL) });
    try {
      expect(e.getHTML()).toBe(ALL);
      const caps: unknown[] = [];
      e.state.doc.descendants((n) => { if (n.type.name === "paragraph") caps.push([n.attrs.cap, n.attrs.capTitle, n.attrs.capNote]); });
      expect(caps[0]).toEqual(["figure", false, false]);
      expect(caps[1]).toEqual([null, true, false]);
      expect(caps[3]).toEqual([null, false, true]);
    } finally { e.destroy(); }
  });
});
