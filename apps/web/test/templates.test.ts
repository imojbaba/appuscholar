import { describe, expect, it } from "vitest";
import { SCAFFOLDS, scaffoldToHtml } from "../lib/templates";

describe("templates", () => {
  it("keeps v1 scaffold text and renders headings", () => {
    expect(Object.keys(SCAFFOLDS)).toEqual(["Lab report (APA)", "Essay", "Literature review"]);
    expect(SCAFFOLDS["Essay"]).toContain("[Counter-argument and your response]");
    const html = scaffoldToHtml(SCAFFOLDS["Lab report (APA)"]);
    expect(html.startsWith("<h1>Title</h1>")).toBe(true);
    expect(html).toContain("<h2>Participants</h2><p>[N, age M and SD, sampling, ethics approval, informed consent]</p>");
  });

  it("leaves Keywords: and bracketed lines as paragraphs and makes Theme 1-3 headings", () => {
    const lab = scaffoldToHtml(SCAFFOLDS["Lab report (APA)"]);
    expect(lab).toContain("<p>Keywords: </p>");
    expect(lab).not.toContain("<h2>Keywords");
    const essay = scaffoldToHtml(SCAFFOLDS["Essay"]);
    expect(essay).toContain("<p>[Argument 1 — claim, evidence, evaluation]</p>");
    const review = scaffoldToHtml(SCAFFOLDS["Literature review"]);
    for (const h of ["Method of review", "Theme 1", "Theme 2", "Theme 3", "Synthesis", "Conclusion", "References"]) expect(review).toContain(`<h2>${h}</h2>`);
  });
});
