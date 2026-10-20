import { describe, it, expect } from "vitest";
import { buildGapFinderPrompt, buildGapFinderPromptV2 } from "../src/prompts-research";
import type { RsPaper } from "../src/research";

/**
 * The research gap prompt, fixed (walk fault W26). buildGapFinderPromptV2 is buildGapFinderPrompt with two exact replacements, and nothing else:
 * the gap names its paper by the first author's surname and the year, not by its number, and a strength the papers share is not counted as a gap.
 * v1's buildGapFinderPrompt and its golden test are unchanged.
 */
const GAP_V1_NAMING = "which numbered paper(s) it comes from";
const GAP_V2_NAMING = `which paper(s) it comes from, named by the first author's surname and the year as listed (for example "(Surname, 2019)" or "(Surname et al., 2019)"), never by its number`;
const GAP_V1_CLAIM = "Claim a gap only where the abstracts support it.";
const GAP_V2_CLAIM = `Claim a gap only where the abstracts support it. A strength the papers share, such as random allocation, is not a gap, and "use other methods" is a gap only if you name what those methods could answer that these papers cannot.`;

const paper = (n: number): RsPaper => ({ title: "Sleep and memory in students " + n, authors: "A. Rao", year: 2021, venue: "J. Psych", doi: "10.1/x" + n, source: "crossref", abstract: "We studied 120 students and found that sleep length predicted recall scores." });
const P = [paper(1), paper(2)];
const TEN = Array.from({ length: 10 }, (_, i) => paper(i + 1));

describe("buildGapFinderPromptV2 (W26)", () => {
  it("v1's prompt contains each v1 string exactly once", () => {
    const v1 = buildGapFinderPrompt("psychology", P).prompt;
    expect(v1.split(GAP_V1_NAMING).length - 1).toBe(1);
    expect(v1.split(GAP_V1_CLAIM).length - 1).toBe(1);
  });

  it("v2 is v1 with the two replacements and nothing else", () => {
    const v1 = buildGapFinderPrompt("psychology", P);
    const v2 = buildGapFinderPromptV2("psychology", P);
    expect(v2.prompt).toBe(v1.prompt.replace(GAP_V1_NAMING, GAP_V2_NAMING).replace(GAP_V1_CLAIM, GAP_V2_CLAIM));
    expect(v2.prompt).not.toContain(GAP_V1_NAMING);
    expect(v2.prompt.split(GAP_V2_CLAIM).length - 1).toBe(1);
  });

  it("keeps v1's sampling options", () => {
    const v1 = buildGapFinderPrompt("psychology", P);
    const v2 = buildGapFinderPromptV2("psychology", P);
    expect(v2.temp).toBe(v1.temp);
    expect(v2.max).toBe(v1.max);
    expect(v2.noLang).toBe(v1.noLang);
  });

  it("stays under 60,000 characters for a full selection of papers", () => {
    expect(buildGapFinderPromptV2("psychology", TEN).prompt.length).toBeLessThan(60000);
  });
});
