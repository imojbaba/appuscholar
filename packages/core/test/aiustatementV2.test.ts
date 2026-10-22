import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../src/providers";
import { aiuBuild, type AiuEntry, type AiuInput } from "../src/aiustatement";
import { aiuBuildV2, AIU_V1_BRACKET, AIU_V1_THESIS, AIU_V2_BRACKET, AIU_V2_THESIS } from "../src/aiustatementV2";

/**
 * aiuBuildV2 is aiuBuild with two sentences made true for v2, where the log is kept in the account and read per project (v1: in the browser). The
 * difference is stated here: the V2 text is the v1 text with exactly those two substitutions, a refusal is v1's, and "in this browser" and
 * "kept in my browser" never appear. aiuBuild and its golden are unchanged.
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
  });

  it("for every format, with and without rows, V2 is v1 with only those substitutions", () => {
    for (const fmt of ["course", "thesis", "journal"]) {
      for (const [name, list, other] of [["no rows", [], ""], ["rows", ROWS, ""], ["no rows, other tools", [], "Grammarly for spelling."], ["rows, other tools", ROWS, "Grammarly."]] as const) {
        const i = input([...list], fmt, { other });
        const v1 = (aiuBuild(i) as { text: string }).text;
        const v2 = (aiuBuildV2(i) as { text: string }).text;
        const want = v1.replace(AIU_V1_BRACKET, AIU_V2_BRACKET).replace(AIU_V1_THESIS, AIU_V2_THESIS);
        expect(v2, `${fmt}, ${name}`).toBe(want);
        expect(v2, `${fmt}, ${name}`).not.toContain("in this browser");
        expect(v2, `${fmt}, ${name}`).not.toContain("kept in my browser");
      }
    }
  });

  it("the substitutions land: the no-use bracket and the thesis sentence read as the register says", () => {
    expect((aiuBuildV2(input([], "course")) as { text: string }).text).toContain("[Check this against your own records. The log only knows about Appuscholar, and only about this project.]");
    expect((aiuBuildV2(input(ROWS, "thesis")) as { text: string }).text).toContain("The log is kept in my Appuscholar account and I can show it to my supervisor on request.");
    // The other formats with rows have neither sentence: V2 is v1 there.
    for (const fmt of ["course", "journal"]) expect(aiuBuildV2(input(ROWS, fmt))).toEqual(aiuBuild(input(ROWS, fmt)));
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
  });
});
