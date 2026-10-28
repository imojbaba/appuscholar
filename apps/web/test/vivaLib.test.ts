import { describe, expect, it, vi } from "vitest";
import { buildVivaPrompt, VIVA_MIN_WORDS } from "@appuscholar/core";
import { askViva, vivaAppend, vivaEnough, vivaSource, VIVA_LOG_MAX } from "../lib/tools/viva/ask";

/* The viva question's logic (Task E4; v1 vivaAsk 3608-3624, vivaSave 3625-3635): the prompt is core's buildVivaPrompt and nothing else, the words are counted as v1 counts them, the log keeps the last 60. */
const WORDS = (n: number) => Array.from({ length: n }, (_, i) => "word" + i).join(" ");

describe("vivaSource (v1 selText().trim())", () => {
  it("is the selection when there is one, else the whole document, trimmed", () => {
    expect(vivaSource("  chosen part \n", "the whole text")).toBe("chosen part");
    expect(vivaSource("", "  the whole text \n")).toBe("the whole text");
  });
});

describe("vivaEnough (v1 3610: at least 25 words, counted split(/\\s+/).filter(Boolean))", () => {
  it("24 words is not enough, 25 is", () => {
    expect(VIVA_MIN_WORDS).toBe(25);
    expect(vivaEnough(WORDS(24))).toBe(false);
    expect(vivaEnough(WORDS(25))).toBe(true);
    expect(vivaEnough("  \n ")).toBe(false);
  });
});

describe("askViva", () => {
  it.each(["viva", "conf"] as const)("sends exactly buildVivaPrompt(%s, text) with its temperature 0.6 and 700 tokens, and answers the trimmed reply", async (aud) => {
    const text = WORDS(30);
    const callAI = vi.fn(async () => "  Why did you choose a sample of 120?\n");
    const out = await askViva({ aud, text, callAI });
    const built = buildVivaPrompt(aud, text);
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(callAI).toHaveBeenCalledWith(built.prompt, { temp: 0.6, max: 700 });
    expect(built.temp).toBe(0.6);
    expect(built.max).toBe(700);
    expect(out).toEqual({ kind: "question", q: "Why did you choose a sample of 120?" });
  });
  it("the prompt holds only the first 6000 characters of the text (the builder cuts, askViva does not cut again)", async () => {
    const text = WORDS(2000);
    const callAI = vi.fn(async (_p: string, _o: { temp: number; max: number }) => "q");
    await askViva({ aud: "viva", text, callAI });
    const sent = callAI.mock.calls[0]![0] as string;
    expect(sent).toBe(buildVivaPrompt("viva", text).prompt);
    expect(sent.endsWith(text.slice(0, 6000))).toBe(true);
  });
  it("fewer than 25 words sends nothing and says it needs more", async () => {
    const callAI = vi.fn(async (_p: string, _o: { temp: number; max: number }) => "q");
    expect(await askViva({ aud: "viva", text: WORDS(24), callAI })).toEqual({ kind: "need" });
    expect(callAI).not.toHaveBeenCalled();
  });
  it("an empty reply is an empty question (v1 shows it as it came)", async () => {
    expect(await askViva({ aud: "conf", text: WORDS(30), callAI: async () => "" })).toEqual({ kind: "question", q: "" });
  });
});

describe("vivaAppend (v1 vivaSave 3625-3635)", () => {
  it("adds {t, aud, q, a} with the trimmed answer after the earlier entries", () => {
    const out = vivaAppend([{ t: 1, aud: "viva", q: "q0", a: "a0" }], { t: 5, aud: "conf", q: "q1", a: "a1" });
    expect(out).toEqual([{ t: 1, aud: "viva", q: "q0", a: "a0" }, { t: 5, aud: "conf", q: "q1", a: "a1" }]);
  });
  it("starts a log when there is none yet", () => {
    expect(vivaAppend(null, { t: 5, aud: "viva", q: "q", a: "a" })).toEqual([{ t: 5, aud: "viva", q: "q", a: "a" }]);
  });
  it("keeps only the last 60", () => {
    expect(VIVA_LOG_MAX).toBe(60);
    const prev = Array.from({ length: 60 }, (_, i) => ({ t: i, aud: "viva" as const, q: "q" + i, a: "a" + i }));
    const out = vivaAppend(prev, { t: 99, aud: "viva", q: "new", a: "new" });
    expect(out).toHaveLength(60);
    expect(out[0]!.q).toBe("q1");
    expect(out[59]!.q).toBe("new");
    expect(vivaAppend(Array.from({ length: 80 }, (_, i) => ({ t: i, aud: "viva" as const, q: "q" + i, a: "a" })), { t: 99, aud: "viva", q: "new", a: "a" })).toHaveLength(60);
  });
});
