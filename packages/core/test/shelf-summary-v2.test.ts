import { describe, it, expect } from "vitest";
import { buildShelfSummaryPrompt, buildShelfSummaryPromptV2, shSummaryPick, SHELF_SUMMARY_TIER0_CAP_V2, shSummaryText, SHELF_SUMMARY_BUDGET_V2 } from "../src/shelf";
import { apBuild } from "../src/analyse";

/**
 * The shelf summary, fixed (walk fault W18). v1 sent the first 12,000 characters of a paper, so a paper that discusses its limitations after that was summarised
 * with "Limitations: not reported". buildShelfSummaryPromptV2 sends Analyse's passages (apBuild) within 18,000 characters: the opening, any limitations, then the discussion,
 * method and results. v1's buildShelfSummaryPrompt and its golden test are unchanged.
 */
const LIMITATION_SENTENCE = "A limitation of this study is that all participants were first-year students from a single university.";

/** A sentence line of about 100 characters, numbered so that no two passages are alike. */
const filler = (tag: string, lines: number): string => Array.from({ length: lines }, (_, i) => `${tag} sentence number ${i} carries ordinary content about the study and nothing else of note.`).join("\n");

/** A 60,000-character paper: the headings are those Analyse knows, and Limitations is near the end. */
const LONG = [
  "Abstract\n" + filler("Abstract", 3),
  "Introduction\n" + filler("Intro", 220),
  "Method\n" + filler("Method", 90),
  "Results\n" + filler("Results", 220),
  "Discussion\n" + filler("Discussion", 90),
  "Limitations\n" + LIMITATION_SENTENCE + " " + filler("Limits", 6).replace(/\n/g, " "),
  "Conclusion\n" + filler("Conclusion", 10),
  "References\n" + filler("Reference", 40),
].join("\n");

describe("buildShelfSummaryPromptV2 (W18)", () => {
  it("a long paper's limitations section is sent (W18)", () => {
    const pages = [LONG.slice(0, 30000), LONG.slice(30000)];
    expect(shSummaryText(pages).length).toBeGreaterThan(55000);
    expect(buildShelfSummaryPrompt("psychology", shSummaryText(pages)).prompt).not.toContain(LIMITATION_SENTENCE);
    const b = buildShelfSummaryPromptV2("psychology", pages);
    expect(b.prompt).toContain(LIMITATION_SENTENCE);
    expect(b.prompt).toContain("Abstract sentence number 0");
    expect(b.prompt).toContain("Discussion sentence number 0");
    expect(b.prompt).toContain("[ page 2, Limitations ]");
    expect(b.pick.partial).toBe(true);
    expect(b.pick.n).toBeLessThan(b.pick.of);
    expect(b.prompt.length).toBeLessThan(20000);
    expect(b.prompt).toContain("PAPER TEXT (selected passages: the opening, any limitations, then the discussion, method and results):\n");
  });

  it("limitations found by text when there is no heading", () => {
    // One block with no heading Analyse knows, the sentence in the middle of a paragraph.
    const lines = filler("Body", 600).split("\n");
    lines[300] = "Body sentence number 300 ends here and then we note a methodological shortcoming: the sample was small. " + LIMITATION_SENTENCE.replace("A limitation", "One limitation") + " The rest goes on.";
    const text = lines.join("\n");
    expect(text.length).toBeGreaterThan(50000);
    const b = buildShelfSummaryPromptV2("psychology", [text]);
    expect(b.pick.partial).toBe(true);
    expect(b.prompt).toContain("One limitation of this study is that all participants were first-year students");
    expect(b.prompt.length).toBeLessThan(20000);
  });

  it("limitations found by text when the paper is one unbroken line", () => {
    const words = filler("Body", 600).replace(/\n/g, " ");
    const at = Math.floor(words.length / 2);
    const text = words.slice(0, at) + " " + LIMITATION_SENTENCE + " " + words.slice(at);
    const b = buildShelfSummaryPromptV2("psychology", [text]);
    expect(b.pick.partial).toBe(true);
    expect(b.prompt).toContain(LIMITATION_SENTENCE);
    expect(b.prompt.length).toBeLessThan(20000);
  });

  it("a short paper is sent whole, without its reference list and without the 'selected passages' note", () => {
    const pages = ["Abstract\nWe studied 120 students.\nMethod\nA survey in Delhi.\nResults\nSleep predicted recall.\nReferences\nRao, A. (2020). A reference line. Journal, 1, 1-2."];
    const b = buildShelfSummaryPromptV2("psychology", pages);
    expect(b.pick).toEqual({ partial: false, n: 3, of: 3 });
    expect(b.prompt).not.toContain("selected passages");
    expect(b.prompt).not.toContain("first 12,000");
    expect(b.prompt).not.toContain("A reference line");
    expect(b.prompt.endsWith("PAPER TEXT:\n[ page 1, Abstract ]\nWe studied 120 students.\n\n[ page 1, Method ]\nA survey in Delhi.\n\n[ page 1, Results ]\nSleep predicted recall.")).toBe(true);
  });

  it("a body of exactly 18,000 characters (text, label and blank line) is sent whole, one character more is picked from", () => {
    const body = (n: number): string => "Abstract\n" + "x".repeat(n);
    // "[ page 1, Abstract ]\n" and the blank line: 23 characters.
    const label = "[ page 1, Abstract ]\n".length + 2;
    const whole = shSummaryPick(apBuild("", [body(18000 - label)], "pdf"));
    expect(whole.partial).toBe(false);
    expect(whole.text.length).toBe(18000 - 2);
    expect(shSummaryPick(apBuild("", [body(18000 - label + 1)], "pdf")).partial).toBe(true);
    const doc = apBuild("", ["Abstract\n" + filler("A", 20), "Method\n" + filler("M", 220)], "pdf");
    expect(doc.chars).toBeGreaterThan(SHELF_SUMMARY_BUDGET_V2);
    expect(shSummaryPick(doc).partial).toBe(true);
  });

  it("takes the tiers in order: the opening, the limitations, the discussion, the method, the results, the rest", () => {
    const sec = (name: string, tag: string, lines: number): string => name + "\n" + filler(tag, lines);
    const text = [sec("Abstract", "Abs", 2), sec("Introduction", "Intro", 60), sec("Method", "Meth", 60), sec("Results", "Res", 60), sec("Discussion", "Disc", 60), sec("Limitations", "Lim", 12), sec("Conclusions", "Conc", 60)].join("\n");
    const pk = shSummaryPick(apBuild("", [text], "pdf"), 6000);
    expect(pk.partial).toBe(true);
    expect(pk.text.length).toBeLessThanOrEqual(6000);
    expect(pk.text).toContain("Abs sentence number 0");
    expect(pk.text).toContain("Lim sentence number 0");
    expect(pk.text).toContain("Disc sentence number 0");
    expect(pk.text).not.toContain("Intro sentence");
    expect(pk.text).not.toContain("Res sentence");
    // page order: the opening, then the rest as the paper has them
    expect(pk.text.indexOf("Abs sentence")).toBeLessThan(pk.text.indexOf("Disc sentence"));
    expect(pk.text.indexOf("Disc sentence")).toBeLessThan(pk.text.indexOf("Lim sentence"));
  });

  it("a 150,000-character paper stays under the 60,000-character prompt cap with a margin", () => {
    const pages = Array.from({ length: 5 }, (_, p) => filler("Page" + p, 330));
    expect(shSummaryText(pages).length).toBeGreaterThan(140000);
    const b = buildShelfSummaryPromptV2("psychology", pages);
    expect(b.prompt.length).toBeLessThan(20000);
    expect(b.pick.partial).toBe(true);
  });

  it("a paper of many tiny labelled passages is picked from, not sent whole: the labels count toward the budget there too", () => {
    const text = Array.from({ length: 8000 }, () => "Results\nab").join("\n");
    const doc = apBuild("", [text], "pdf");
    expect(doc.chunks.filter((c) => !c.ref).reduce((a, c) => a + c.text.length, 0)).toBeLessThan(SHELF_SUMMARY_BUDGET_V2);
    const b = buildShelfSummaryPromptV2("psychology", [text]);
    expect(b.pick.partial).toBe(true);
    expect(b.prompt.length).toBeLessThan(20000);
  });

  it("many short passages cannot take the prompt past 20,000 either (the labels count)", () => {
    const text = Array.from({ length: 4000 }, (_, i) => "Results\nTiny " + (i % 10) + ".").join("\n");
    const b = buildShelfSummaryPromptV2("psychology", [text]);
    expect(b.prompt.length).toBeLessThan(20000);
  });

  it("email addresses are removed before the passages are cut", () => {
    const b = buildShelfSummaryPromptV2("psychology", ["Abstract\nContact: someone@example.org for the data.\nMethod\nWe asked 100 people."]);
    expect(b.prompt).not.toContain("someone@example.org");
    expect(b.prompt).toContain("[author email removed]");
  });

  it("the prompt before PAPER TEXT is v1's, word for word, and the options are v1's", () => {
    for (const pages of [["Abstract\nA short paper."], [LONG]]) {
      const v1 = buildShelfSummaryPrompt("psychology", shSummaryText(pages));
      const v2 = buildShelfSummaryPromptV2("psychology", pages);
      const head = (s: string): string => s.slice(0, s.indexOf("\n\nPAPER TEXT"));
      expect(head(v2.prompt)).toBe(head(v1.prompt));
      expect(head(v2.prompt).length).toBeGreaterThan(500);
      expect(v2.prompt).toContain("\n\nPAPER TEXT");
      expect({ temp: v2.temp, max: v2.max, noLang: v2.noLang }).toEqual({ temp: v1.temp, max: v1.max, noLang: v1.noLang });
    }
  });

  it("an abstract section that runs on (an unknown heading after the abstract) cannot push the limitations out", () => {
    // "Study 1" is not a heading Analyse knows, so everything after the abstract stays under Abstract.
    const text = ["Abstract\n" + filler("Abs", 4), "Study 1\n" + filler("Run", 280), "Limitations\n" + LIMITATION_SENTENCE, "Conclusion\n" + filler("Conc", 4)].join("\n");
    const doc = apBuild("", [text], "pdf");
    expect(doc.chunks.filter((c) => c.sec === "Abstract").reduce((a, c) => a + c.text.length, 0)).toBeGreaterThan(20000);
    const b = buildShelfSummaryPromptV2("psychology", [text]);
    expect(b.pick.partial).toBe(true);
    expect(b.prompt).toContain(LIMITATION_SENTENCE);
    expect(b.prompt).toContain("Abs sentence number 0");
    expect(b.prompt.length).toBeLessThan(20000);
    // with a small budget the rest of the abstract section gets what is left after the limitations
    const small = shSummaryPick(doc, 4500);
    expect(small.text).toContain(LIMITATION_SENTENCE);
    expect(small.text).toContain("Abs sentence number 0");
    expect(small.text.length).toBeLessThanOrEqual(4500);
  });

  describe("a passage with no sentence end is cut at a space (T14, wave B Task 28)", () => {
    /** Words that each carry a number, so that a word cut in two ("limitation" and "s50") is not one of them. */
    const words = (n: number): string[] => Array.from({ length: n }, (_, i) => "limitations" + i);
    const known = new Set(words(190));
    /** About 2,200 characters with no sentence end: apBuild cuts only at line ends, so it is one passage, and a budget under its size makes the pick cut it into pieces. */
    const run = words(190).join(" ");
    /** The text of each passage the pick keeps (what follows each "[ page 1 ]" label). */
    const passages = (text: string): string[] => text.split("\n\n").map((p) => p.replace(/^\[[^\]]*\]\n/, ""));

    it("a 2,000-character run with no full stop is never cut inside a word", () => {
      expect(run.length).toBeGreaterThan(2000);
      expect(run).not.toMatch(/[.!?)]/);
      const pk = shSummaryPick(apBuild("", [run], "pdf"), 1500);
      expect(pk.partial).toBe(true);
      const kept = passages(pk.text);
      expect(kept.length).toBeGreaterThanOrEqual(2);
      for (const piece of kept) for (const w of piece.split(" ")) expect(known.has(w), "a word cut in two: " + w).toBe(true);
    });

    it("each cut falls at the last space before 700 characters: the first piece is as long as it can be without passing 700", () => {
      const first = passages(shSummaryPick(apBuild("", [run], "pdf"), 1500).text)[0]!;
      expect(run.startsWith(first)).toBe(true);
      expect(first.length).toBeLessThanOrEqual(700);
      expect(run[first.length]).toBe(" ");
      const next = run.slice(first.length + 1).split(" ")[0]!;
      expect(first.length + 1 + next.length).toBeGreaterThan(700);
    });

    it("text with no spaces at all (a PDF that lost them) is still cut every 700 characters, so such a paper can be summarised", () => {
      const pk = shSummaryPick(apBuild("", ["x".repeat(2600)], "pdf"), 1500);
      expect(pk.partial).toBe(true);
      expect(passages(pk.text).map((p) => p.length)).toEqual([700, 700]);
    });
  });

  it("the tier-0 cap is 3,000", () => {
    expect(SHELF_SUMMARY_TIER0_CAP_V2).toBe(3000);
  });

  it("the budget is 18,000", () => {
    expect(SHELF_SUMMARY_BUDGET_V2).toBe(18000);
  });
});
