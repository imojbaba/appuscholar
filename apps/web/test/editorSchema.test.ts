import { describe, it, expect } from "vitest";
import { generateJSON, generateHTML } from "@tiptap/html";
import { sanitizeHtml } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const V1_HTML = [
  "<h2>Results</h2>",
  '<p>Plain text, then <span class="ai-ins" data-h="abc123">an AI insertion</span> and <mark>marked</mark> words, H<sub>2</sub>O and x<sup>2</sup>.</p>',
  `<p><span class="img-wrap"><img src="${PNG}" alt="chart"></span> after the image</p>`,
  "<table><tbody><tr><th>Group</th><th>n</th></tr><tr><td>Control</td><td>12</td></tr></tbody></table>",
  '<p><span style="color: rgb(255, 0, 0)">red</span> text</p>'
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
  it("is stable: a second round trip through the sanitiser and schema changes nothing", () => {
    expect(roundTrip(sanitizeHtml(out))).toBe(out);
  });
});
