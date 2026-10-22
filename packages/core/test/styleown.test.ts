import { describe, expect, it } from "vitest";
import { docInnerText } from "../src/doctext";
import { styleFeatures, styleOwnText } from "../src/style";

/*
 * styleOwnText is a V2 sibling (register D-S2-89): v1's styleAnalyze reads the whole editor (getEditorText 6978, AI-inserted text included);
 * this reads the student's own words, the text outside every span.ai-ins, as v1's extractStudentText (3943-3949) does for the writing samples.
 * Nothing else about styleAnalyze changes.
 */
describe("styleOwnText", () => {
  it("is docInnerText of the document when no AI text is in it", () => {
    const html = "<p>One plain paragraph.</p><p>Another, <b>with bold</b> words.</p>";
    expect(styleOwnText(html)).toBe(docInnerText(html));
  });
  it("drops span.ai-ins frames with everything inside them, and keeps the words around them", () => {
    const html = '<p>I wrote this. <span class="ai-ins" data-h="abc">Zanzibar delegate sentence <em>nested</em> here.</span> And this too.</p>';
    const t = styleOwnText(html);
    expect(t).toContain("I wrote this.");
    expect(t).toContain("And this too.");
    expect(t).not.toMatch(/Zanzibar|delegate|nested/);
  });
  it("drops an AI frame that holds a whole paragraph's inline run, several frames, and a frame with other classes", () => {
    const html = '<p><span class="other ai-ins">gone-one</span> kept-a</p><p>kept-b <span class="ai-ins">gone-two</span></p>';
    const t = styleOwnText(html);
    expect(t).toContain("kept-a");
    expect(t).toContain("kept-b");
    expect(t).not.toMatch(/gone/);
  });
  it("a class that merely contains 'ai-ins' as part of another name is not an AI frame", () => {
    expect(styleOwnText('<p><span class="not-ai-insert">kept</span></p>')).toContain("kept");
  });
  it("features of the result lack a word that only the AI span held", () => {
    const html = "<p>" + "The student wrote careful notes about the lesson. ".repeat(10) + '</p><p><span class="ai-ins">extraordinarilymarkerword </span></p>';
    expect(styleFeatures(docInnerText(html)).vw).toContain("extraordinarilymarkerword");
    expect(styleFeatures(styleOwnText(html)).vw).not.toContain("extraordinarilymarkerword");
  });
});
