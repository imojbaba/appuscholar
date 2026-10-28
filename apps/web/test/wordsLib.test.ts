import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DICT_CACHE_MAX, GRAM_AI_MAX_CHARS, gramChunks } from "@appuscholar/core";
import { dictCacheSize, lookupWord, normWord, resetDictCache } from "../lib/tools/words/dict";
import { checkWithAi, checkWithRules } from "../lib/tools/words/gram";

const entry = (word: string) => [{ word, meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A thing." }] }] }];
const reply = (status: number, body: unknown = null) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe("the dictionary lookup (dict.ts)", () => {
  beforeEach(() => resetDictCache());
  afterEach(() => vi.unstubAllGlobals());
  it("reads one lower-case word of letters, apostrophes and hyphens, 40 characters at most (v1 dictNorm)", () => {
    expect(normWord("  Study! ")).toBe("study");
    expect(normWord("don’t")).toBe("don’t");
    expect(normWord("x".repeat(60))).toBe("x".repeat(40));
    expect(normWord("123 ?!")).toBe("");
  });
  it("found, not found (404, and an answer with no meaning), the service failing, and no internet", async () => {
    const f = vi.fn();
    f.mockResolvedValueOnce(reply(200, entry("study")));
    expect(await lookupWord("study", f)).toMatchObject({ kind: "found", cached: false, entry: { word: "study" } });
    expect(f).toHaveBeenCalledWith("https://api.dictionaryapi.dev/api/v2/entries/en/study");
    f.mockResolvedValueOnce(reply(404));
    expect(await lookupWord("studdy", f)).toEqual({ kind: "notfound" });
    f.mockResolvedValueOnce(reply(200, [{ word: "empty", meanings: [] }]));
    expect(await lookupWord("empty", f)).toEqual({ kind: "notfound" });
    f.mockResolvedValueOnce(reply(500));
    expect(await lookupWord("down", f)).toEqual({ kind: "service", status: 500 });
    f.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await lookupWord("offline", f)).toEqual({ kind: "offline" });
    const bad = reply(200); (bad as unknown as { json(): Promise<unknown> }).json = async () => { throw new SyntaxError("x"); };
    f.mockResolvedValueOnce(bad);
    expect(await lookupWord("junk", f)).toEqual({ kind: "service", status: 200 });
  });
  it("a word found once is answered from memory; a word with no entry is never cached", async () => {
    const f = vi.fn().mockResolvedValueOnce(reply(200, entry("study"))).mockResolvedValue(reply(404));
    await lookupWord("study", f);
    expect(await lookupWord("study", f)).toMatchObject({ kind: "found", cached: true });
    await lookupWord("nope", f); await lookupWord("nope", f);
    expect(f).toHaveBeenCalledTimes(3);
    expect(dictCacheSize()).toBe(1);
  });
  it("keeps 200 words: the 201st puts the first out, which is then asked for again", async () => {
    const f = vi.fn(async (u: string) => reply(200, entry(decodeURIComponent(u.split("/").pop()!))));
    const words = Array.from({ length: DICT_CACHE_MAX + 1 }, (_, i) => "w" + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)));
    for (const w of words) await lookupWord(w, f as unknown as typeof fetch);
    expect(dictCacheSize()).toBe(DICT_CACHE_MAX);
    expect(f).toHaveBeenCalledTimes(DICT_CACHE_MAX + 1);
    expect((await lookupWord(words[1]!, f as unknown as typeof fetch))).toMatchObject({ cached: true });
    expect((await lookupWord(words[0]!, f as unknown as typeof fetch))).toMatchObject({ cached: false });
    expect(f).toHaveBeenCalledTimes(DICT_CACHE_MAX + 2);
  });
  it("uses the global fetch when none is given", async () => {
    const f = vi.fn().mockResolvedValue(reply(200, entry("study")));
    vi.stubGlobal("fetch", f);
    await lookupWord("study");
    expect(f).toHaveBeenCalledOnce();
  });
});

describe("the grammar check's loop (gram.ts)", () => {
  const text = "The informations were useful to everyone. We discussed about the plan in the long meeting.";
  it("the rules alone: under 10 characters is short; otherwise core's gramLocal under the chosen standard", () => {
    expect(checkWithRules("too short", "uk")).toBe("short");
    const r = checkWithRules(text, "uk");
    if (r === "short") throw new Error("short");
    expect(r.items.map((i) => i.original)).toEqual(["informations", "discussed about"]);
    expect(r).toMatchObject({ checked: 0, parts: 0, dropped: 0, error: null });
  });
  it("sends one request per part (at most the first 9,000 characters), merges what came back, and stops at a failure", async () => {
    const long = ("The committee reviewed the proposal carefully and then gave its answer to the board. ").repeat(150).trim();
    const parts = gramChunks(long);
    expect(parts.join("").length).toBeLessThanOrEqual(GRAM_AI_MAX_CHARS);
    const callAI = vi.fn().mockResolvedValueOnce('{"edits":[]}').mockRejectedValueOnce(new Error("boom"));
    const r = await checkWithAi(long, { callAI, field: "education", std: "uk", alive: () => true });
    if (r === "short" || r === null) throw new Error("no result");
    expect(callAI).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ checked: 1, parts: parts.length, dropped: 0, error: "boom" });
  });
  it("under 30 characters is short and asks nothing; a panel that has gone stops the loop and answers null", async () => {
    const callAI = vi.fn();
    expect(await checkWithAi("Short text here.", { callAI, field: "f", std: "uk", alive: () => true })).toBe("short");
    expect(await checkWithAi(text, { callAI, field: "f", std: "uk", alive: () => false })).toBeNull();
    expect(callAI).not.toHaveBeenCalled();
  });
});
