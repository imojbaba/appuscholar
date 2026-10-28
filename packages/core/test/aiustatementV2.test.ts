import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../src/providers";
import { aiuBuild, type AiuEntry, type AiuInput } from "../src/aiustatement";
import { aiuBuildV2, AIU_V1_BRACKET, AIU_V1_SENDS, AIU_V1_THESIS, AIU_V2_BRACKET, AIU_V2_SENDS, AIU_V2_THESIS } from "../src/aiustatementV2";

/**
 * aiuBuildV2 is aiuBuild with three phrases made true for v2: the log is kept in the account and read per project (v1: in the browser), and the
 * requests are sent by Appuscholar's server (v1: the browser). The difference is stated here: the V2 text is the v1 text with exactly those
 * substitutions, a refusal is v1's, and "in this browser", "kept in my browser" and "runs in the browser" never appear. aiuBuild and its golden are
 * unchanged.
 */
const e = (d: string, k: string, g: string): AiuEntry => ({ d, p: "groq", m: "openai/gpt-oss-120b", k, g });
const ROWS = [e("2026-10-01", "grammar and polish", "text"), e("2026-10-05", "feedback on my draft", "feedback")];
const keepAll = (l: AiuEntry[]) => Object.fromEntries(l.map((x) => [x.k, 1 as const]));
const TICKS = { own: true, reword: false, cite: true, facts: false, noData: true };
const STYLE = { on: false, decl: "", samples: 0 };
const input = (list: AiuEntry[], fmt: string, over: Partial<AiuInput> = {}): AiuInput =>
  ({ list, keep: keepAll(list), other: "", fmt, ticks: TICKS, style: STYLE, providers: PROVIDERS, ...over });

describe("aiuBuildV2", () => {
  it("v1's text carries each of the two sentences where v1 put them", () => {
    const none = (aiuBuild(input([], "course")) as { text: string }).text;
    expect(none.split(AIU_V1_BRACKET)).toHaveLength(2);
    const thesis = (aiuBuild(input(ROWS, "thesis")) as { text: string }).text;
    expect(thesis.split(AIU_V1_THESIS)).toHaveLength(2);
    expect(thesis.split(AIU_V1_SENDS)).toHaveLength(2);
  });

  it("for every format, with and without rows, V2 is v1 with only those substitutions", () => {
    for (const fmt of ["course", "thesis", "journal"]) {
      for (const [name, list, other] of [["no rows", [], ""], ["rows", ROWS, ""], ["no rows, other tools", [], "Grammarly for spelling."], ["rows, other tools", ROWS, "Grammarly."]] as const) {
        const i = input([...list], fmt, { other });
        const v1 = (aiuBuild(i) as { text: string }).text;
        const v2 = (aiuBuildV2(i) as { text: string }).text;
        const want = v1.replace(AIU_V1_BRACKET, AIU_V2_BRACKET).replace(AIU_V1_THESIS, AIU_V2_THESIS).replace(AIU_V1_SENDS, AIU_V2_SENDS);
        expect(v2, `${fmt}, ${name}`).toBe(want);
        expect(v2, `${fmt}, ${name}`).not.toContain("in this browser");
        expect(v2, `${fmt}, ${name}`).not.toContain("kept in my browser");
        expect(v2, `${fmt}, ${name}`).not.toContain("runs in the browser");
      }
    }
  });

  it("the substitutions land: the no-use bracket and the thesis sentence read as the register says", () => {
    expect((aiuBuildV2(input([], "course")) as { text: string }).text).toContain("[Check this against your own records. The log only knows about Appuscholar, and only about this project.]");
    expect((aiuBuildV2(input(ROWS, "thesis")) as { text: string }).text).toContain("The log is kept in my Appuscholar account and I can show it to my supervisor on request.");
    // The other formats with rows have neither sentence, but every format with rows has the first sentence.
    for (const fmt of ["course", "journal"]) {
      const v2 = (aiuBuildV2(input(ROWS, fmt)) as { text: string }).text;
      expect(v2).toBe((aiuBuild(input(ROWS, fmt)) as { text: string }).text.replace(AIU_V1_SENDS, AIU_V2_SENDS));
    }
  });

  it("the first sentence says Appuscholar's server sends the requests, for the student and for the journal", () => {
    const course = (aiuBuildV2(input(ROWS, "course")) as { text: string }).text;
    expect(course).toContain("I used Appuscholar, a writing assistant whose server sends requests to Groq (openai/gpt-oss-120b), between 1 October 2026 and 5 October 2026.");
    const journal = (aiuBuildV2(input(ROWS, "journal")) as { text: string }).text;
    expect(journal).toContain("During the preparation of this work the author used Appuscholar, a writing assistant whose server sends requests to Groq (openai/gpt-oss-120b), between");
  });

  it("a refusal passes through unchanged", () => {
    const i = input(ROWS, "course", { keep: {} });
    expect(aiuBuild(i)).toHaveProperty("refuse");
    expect(aiuBuildV2(i)).toEqual(aiuBuild(i));
  });

  it("the student's own words are never touched", () => {
    const other = `I used ${AIU_V1_THESIS} and ${AIU_V1_BRACKET}`;
    const v2 = (aiuBuildV2(input(ROWS, "thesis", { other })) as { text: string }).text;
    expect(v2).toContain(other.replace(/[.\s]+$/, ""));
    expect(v2).toContain(AIU_V2_THESIS);
    // Nor with no rows, when the student's words are all there is.
    const words = `Appuscholar, ${AIU_V1_SENDS}a provider`;
    const alone = (aiuBuildV2(input([], "course", { other: words })) as { text: string }).text;
    expect(alone).toContain(words);
  });
});
