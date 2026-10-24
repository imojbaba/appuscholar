import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  apBuild, AP_STAGES, buildAskPrompt, buildChatPrompt, buildDevilPrompt, buildDictPrompt, buildDraftFirstPrompt, buildGapFinderPrompt, buildGapFinderPromptV2,
  buildGrammarPrompt, buildHelperPrompt, buildIdeaPrompt, buildIdeaPromptV2, buildLessonAskPrompt, buildLitReviewPrompt, buildQuickReadPrompt, buildRankPrompt,
  buildShelfSummaryPrompt, buildShelfSummaryPromptV2, buildStyleAnalyzePrompt, buildStyleFilesPrompt, buildStyleTryPrompt, buildSuggestTermsPrompt, buildVivaPrompt,
  buildWalkPrompt, buildWritingPrompt, classifyAiUse, contentLangInstruction, rsQuickCheck, rsRankParse, STY_PASSAGES, type RsPaper
} from "@appuscholar/core";
import { buildStatsExplainPrompt } from "@/lib/tools/stats/explain";
import { quotePrompt } from "@/lib/cite/quote";
import { createShimFetch, type ShimLogEntry } from "../../qa/provider-shim/core.mjs";
import recorded from "../../qa/fixtures/ai-replies.json";

const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const STATS_PROMPT = "You are a statistics tutor for students of psychology. A student ran this analysis. Explain it.";
const REPLIES = [
  { match: "You are a statistics tutor", reply: "The groups differ by more than chance would usually produce." },
  { match: "Reply with the single word OK.", reply: "OK" },
  { match: "Pick *up", reply: "glob" },
  { match: "Return JSON", reply: { ok: true } }
];

type Setup = { shim: typeof fetch; original: ReturnType<typeof vi.fn>; log: ShimLogEntry[]; sleep: ReturnType<typeof vi.fn> };
function setup(replies: Array<{ match: string; reply: unknown }> = REPLIES): Setup {
  const original = vi.fn(async () => new Response("from the original fetch", { status: 200 }));
  const log: ShimLogEntry[] = [];
  const sleep = vi.fn(async () => {});
  const shim = createShimFetch(original as unknown as typeof fetch, { replies: replies as Array<{ match: string; reply: string }>, log: (e) => { log.push(e); }, sleep });
  return { shim, original, log, sleep };
}
/** The request the api's OpenAI-compatible adapter makes (apps/api/src/ai/providers/openaiCompat.ts). */
function ask(shim: typeof fetch, key: string, prompt: string, url = GROQ) {
  return shim(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model: "m", messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 20 })
  });
}
const content = async (r: Response) => ((await r.json()) as { choices: Array<{ message: { content: string } }> }).choices[0]!.message.content;

describe("the fake AI provider", () => {
  it("answers an OpenAI-style body for a known prompt", async () => {
    const { shim, original, log } = setup();
    const r = await ask(shim, "gsk_qa_ok_a1", STATS_PROMPT);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string; model: string; choices: Array<{ index: number; message: { role: string; content: string }; finish_reason: string }> };
    expect(body.choices[0]!.message.content).toBe("The groups differ by more than chance would usually produce.");
    expect(body.choices[0]).toMatchObject({ index: 0, message: { role: "assistant" }, finish_reason: "stop" });
    expect(body.id).toEqual(expect.any(String));
    expect(body.model).toBe("m");
    expect(original).not.toHaveBeenCalled();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ key: "gsk_qa_ok_a1", mode: "ok", host: "api.groq.com", outcome: "answered" });
  });

  it("answers at all four provider addresses and nowhere else", async () => {
    const { shim, original } = setup();
    for (const url of [
      "https://api.groq.com/openai/v1/chat/completions", "https://api.openai.com/v1/chat/completions",
      "https://api.deepseek.com/chat/completions", "https://openrouter.ai/api/v1/chat/completions"
    ]) {
      expect((await ask(shim, "gsk_qa_ok_a1", STATS_PROMPT, url)).status, url).toBe(200);
    }
    expect(original).not.toHaveBeenCalled();
  });

  it("each mode fails as the provider does", async () => {
    const { shim, original, log } = setup();
    expect((await ask(shim, "gsk_qa_fail429_a", STATS_PROMPT)).status).toBe(429);
    expect((await ask(shim, "gsk_qa_fail401_a", STATS_PROMPT)).status).toBe(401);
    // The api retries a 5xx three times (apps/api/src/ai/http.ts), so the provider sees, and answers, three requests.
    const five = [];
    for (let i = 0; i < 3; i++) five.push((await ask(shim, "gsk_qa_fail500_a", STATS_PROMPT)).status);
    expect(five).toEqual([500, 500, 500]);
    // A dropped connection: fetch rejects, as it does when the network is gone.
    await expect(ask(shim, "gsk_qa_nonet_a", STATS_PROMPT)).rejects.toThrow();
    // No text: a 200 whose message is empty.
    const empty = await ask(shim, "gsk_qa_empty_a", STATS_PROMPT);
    expect(empty.status).toBe(200);
    expect(await content(empty)).toBe("");
    expect(original).not.toHaveBeenCalled();
    expect(log.map((e) => [e.mode, e.outcome])).toEqual([
      ["fail429", "failed"], ["fail401", "failed"], ["fail500", "failed"], ["fail500", "failed"], ["fail500", "failed"], ["nonet", "failed"], ["empty", "failed"]
    ]);
  });

  it("slow<ms> waits that long, then answers", async () => {
    const { shim, sleep, log } = setup();
    const r = await ask(shim, "gsk_qa_slow8000_a", STATS_PROMPT);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(8000);
    expect(r.status).toBe(200);
    expect(log[0]).toMatchObject({ mode: "slow8000", outcome: "answered" });
  });

  it("failonce is per key", async () => {
    const { shim, log } = setup();
    const x = [];
    const y = [];
    // Interleaved, as two parallel cases would make them: y's first request is still its own first.
    x.push((await ask(shim, "gsk_qa_failonce_x", STATS_PROMPT)).status);
    y.push((await ask(shim, "gsk_qa_failonce_y", STATS_PROMPT)).status);
    x.push((await ask(shim, "gsk_qa_failonce_x", STATS_PROMPT)).status);
    y.push((await ask(shim, "gsk_qa_failonce_y", STATS_PROMPT)).status);
    x.push((await ask(shim, "gsk_qa_failonce_x", STATS_PROMPT)).status);
    expect(x).toEqual([429, 200, 200]);
    expect(y).toEqual([429, 200]);
    expect(log.map((e) => e.outcome)).toEqual(["failed", "failed", "answered", "answered", "answered"]);
    // Two instances of the shim do not share the count (a new api process starts fresh).
    expect((await ask(setup().shim, "gsk_qa_failonce_x", STATS_PROMPT)).status).toBe(429);
  });

  it("an unknown prompt is named", async () => {
    const { shim, log } = setup();
    const prompt = "Write me a poem about the sea. " + "x".repeat(200);
    const r = await ask(shim, "gsk_qa_ok_a1", prompt);
    expect(r.status).toBe(400);
    expect(await r.text()).toBe("QA: no recorded reply for: " + prompt.slice(0, 120));
    expect(log[0]).toMatchObject({ outcome: "unknown", prompt, kind: classifyAiUse(prompt)?.k });
  });

  it("anything that is not a provider passes through", async () => {
    const { shim, original, log } = setup();
    const init = { method: "POST", body: "{}" };
    const r = await shim("http://localhost:1/x", init);
    expect(await r.text()).toBe("from the original fetch");
    expect(original).toHaveBeenCalledExactlyOnceWith("http://localhost:1/x", init);
    // A look-alike host is not a provider.
    await shim("https://api.groq.com.evil.test/openai/v1/chat/completions", init);
    expect(original).toHaveBeenCalledTimes(2);
    expect(log).toEqual([]);
  });

  it("the log entry carries kind and the full prompt", async () => {
    const prompt = buildWritingPrompt("improve", "Procrastination delays important work.").prompt;
    const { shim, log } = setup([{ match: "Improve this text", reply: "Better." }]);
    await ask(shim, "gsk_qa_ok_a1", prompt);
    expect(log).toHaveLength(1);
    expect(log[0]!.prompt).toBe(prompt);
    expect(log[0]!.kind).toBe(classifyAiUse(prompt)?.k);
    expect(log[0]!.kind).toBe("grammar and polish");
    expect(log[0]!.t).toBeGreaterThan(0);
  });

  it("the Appu help assistant has no kind, as the api's log has none", async () => {
    const prompt = "You are Appu, the help assistant of Appuscholar. Answer briefly.";
    const { shim, log } = setup([{ match: "You are Appu", reply: "Click Help." }]);
    await ask(shim, "gsk_qa_ok_a1", prompt);
    expect(log[0]!.kind).toBeNull();
    expect(classifyAiUse(prompt)).toBeNull();
  });

  it("a match is the start of the prompt, and * stands for any text", async () => {
    const { shim } = setup();
    expect((await ask(shim, "gsk_qa_ok_a", "Pick the lid up now")).status).toBe(200);
    expect((await ask(shim, "gsk_qa_ok_a", "Please pick up")).status).toBe(400);
    expect((await ask(shim, "gsk_qa_ok_a", "Pick")).status).toBe(400);
    expect(await content(await ask(shim, "gsk_qa_ok_a", "Pick x up"))).toBe("glob");
  });

  it("the first match wins, and a reply that is not text is sent as JSON", async () => {
    const { shim } = setup([{ match: "Return JSON", reply: { ok: true, n: 2 } }, { match: "Return", reply: "second" }]);
    expect(await content(await ask(shim, "gsk_qa_ok_a", "Return JSON please"))).toBe('{"ok":true,"n":2}');
    expect(await content(await ask(shim, "gsk_qa_ok_a", "Return it"))).toBe("second");
  });

  it("refuses a recorded reply with an empty match (it would answer every prompt)", () => {
    expect(() => createShimFetch(vi.fn() as unknown as typeof fetch, { replies: [{ match: "", reply: "x" }], log: () => {} })).toThrow(/match/);
  });

  it("never reaches the network for a provider address, whatever the key", async () => {
    const { shim, original, log } = setup();
    // Not a test key: the real one would be sent on if the shim let this through.
    const real = await ask(shim, "sk-live-0123456789", STATS_PROMPT);
    expect(real.status).toBe(400);
    expect(await real.text()).toMatch(/^QA: the API key is not a gsk_qa_<mode>_<random> test key/);
    expect(log[0]).toMatchObject({ key: "<not a QA key>", mode: "invalid", outcome: "failed" });
    // A test key with a mode that does not exist.
    const typo = await ask(shim, "gsk_qa_fail999_a", STATS_PROMPT);
    expect(typo.status).toBe(400);
    expect(await typo.text()).toMatch(/^QA: .*fail999/);
    // A provider address the api does not use, and a body that is not a chat request: told apart from "no recorded reply", which is a prompt problem.
    const models = await ask(shim, "gsk_qa_ok_a", STATS_PROMPT, "https://api.groq.com/openai/v1/models");
    expect(models.status).toBe(400);
    expect(await models.text()).toMatch(/^QA: .* got POST api\.groq\.com\/openai\/v1\/models$/);
    const notJson = await shim(GROQ, { method: "POST", headers: { Authorization: "Bearer gsk_qa_ok_a" }, body: "not json" });
    expect(notJson.status).toBe(400);
    expect(await notJson.text()).toMatch(/^QA: .*messages\[0\]\.content/);
    expect(original).not.toHaveBeenCalled();
    // None of the four is "unknown" (that is only for a prompt with no recorded reply).
    expect(log.map((e) => e.outcome)).toEqual(["failed", "failed", "failed", "failed"]);
    // The log never holds what looks like a real key.
    expect(JSON.stringify(log)).not.toContain("sk-live");
  });

  it("refuses Gemini and Anthropic here: 400, logged as refused, and never passed on", async () => {
    const { shim, original, log } = setup();
    const gemini = await shim("https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": "gsk_qa_ok_g1" },
      body: JSON.stringify({ contents: [{ parts: [{ text: STATS_PROMPT }] }], generationConfig: { temperature: 0 } })
    });
    expect(gemini.status).toBe(400);
    expect(await gemini.text()).toBe("QA: provider not faked: generativelanguage.googleapis.com");
    const anthropic = await shim("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "gsk_qa_ok_a1", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-x", max_tokens: 20, messages: [{ role: "user", content: STATS_PROMPT }] })
    });
    expect(anthropic.status).toBe(400);
    expect(await anthropic.text()).toBe("QA: provider not faked: api.anthropic.com");
    // A key that is not a test key is kept out of the log here too, and a request whose body cannot be read is refused all the same.
    const real = await shim("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": "sk-ant-live-0123456789" }, body: "not json" });
    expect(real.status).toBe(400);
    expect(original).not.toHaveBeenCalled();
    expect(log.map((e) => [e.host, e.key, e.outcome])).toEqual([
      ["generativelanguage.googleapis.com", "gsk_qa_ok_g1", "refused"],
      ["api.anthropic.com", "gsk_qa_ok_a1", "refused"],
      ["api.anthropic.com", "<not a QA key>", "refused"]
    ]);
    // The log still says which feature reached them.
    expect(log[0]).toMatchObject({ prompt: STATS_PROMPT, kind: classifyAiUse(STATS_PROMPT)?.k });
    expect(log[1]).toMatchObject({ prompt: STATS_PROMPT });
    expect(JSON.stringify(log)).not.toContain("sk-ant");
  });

  it("accepts the other shapes fetch takes: a URL, and a Request", async () => {
    const { shim, log } = setup();
    const viaUrl = await shim(new URL(GROQ), { method: "POST", headers: { Authorization: "Bearer gsk_qa_ok_u" }, body: JSON.stringify({ model: "m", messages: [{ role: "user", content: STATS_PROMPT }] }) });
    expect(viaUrl.status).toBe(200);
    const viaRequest = await shim(new Request(GROQ, { method: "POST", headers: { Authorization: "Bearer gsk_qa_ok_r" }, body: JSON.stringify({ model: "m", messages: [{ role: "user", content: STATS_PROMPT }] }) }));
    expect(viaRequest.status).toBe(200);
    expect(log.map((e) => e.key)).toEqual(["gsk_qa_ok_u", "gsk_qa_ok_r"]);
  });
});

// ---- The recorded replies: one for each AI feature -------------------------------------------------------------------------------------------------

const paper = (n: number): RsPaper => ({ title: "Sleep and memory in students " + n, authors: "A. Rao", year: 2021, venue: "J. Psych", doi: "10.1/x" + n, source: "crossref", abstract: "We studied 120 students and found that sleep length predicted recall scores." });
const doc = apBuild("Practice paper", ["Abstract\nWe studied 120 students.\n\nMethod\nSurvey of students in Delhi.\n\nResults\nSleep predicted recall."], "pdf");
const step = { k: "procedure", title: "Consent", said: "Participants consented.", flaw: "No consent form is shown." };
const lesson = (teacher: "appu" | "raj" | "meera" | "dev" | "tara") => buildLessonAskPrompt({ teacher, field: "psychology", lang: "en", step, doc, question: "why does this matter?" }).prompt;
const IDEA = { topic: "sleep and recall in college students" };

/**
 * The prompt of every AI feature the app has, and the recorded reply (by its `feature` label) that must answer it: the builders of packages/core (the list of
 * packages/core/test/aiuse-labels.test.ts) and the two the web app owns (stats explain, quote).
 */
const FEATURES: Array<[name: string, prompt: () => string, entry: string]> = [
  ["idea", () => buildIdeaPrompt("psychology", IDEA).prompt, "Is my idea realistic"],
  ["idea v2", () => buildIdeaPromptV2("psychology", IDEA).prompt, "Is my idea realistic"],
  ["gap finder", () => buildGapFinderPrompt("psychology", [paper(1), paper(2)]).prompt, "Find a research gap"],
  ["gap finder v2", () => buildGapFinderPromptV2("psychology", [paper(1), paper(2)]).prompt, "Find a research gap"],
  ["literature review", () => buildLitReviewPrompt("psychology", [paper(1), paper(2)]).prompt, "Draft a literature review paragraph"],
  ["shelf summary", () => buildShelfSummaryPrompt("psychology", "Some paper text. We studied 120 students.").prompt, "Shelf: summarise a paper"],
  ["shelf summary v2", () => buildShelfSummaryPromptV2("psychology", ["Abstract\nSome paper text. We studied 120 students."]).prompt, "Shelf: summarise a paper"],
  ["continue", () => buildWritingPrompt("continue", "some text").prompt, "Continue writing"],
  ["improve", () => buildWritingPrompt("improve", "some text").prompt, "Improve"],
  ["expand", () => buildWritingPrompt("expand", "some text").prompt, "Extend"],
  ["draft first tail", () => buildDraftFirstPrompt("tail", "some text").prompt, "Draft-first questions"],
  ["draft first improve", () => buildDraftFirstPrompt("improve", "some text").prompt, "Draft-first questions"],
  ["draft first expand", () => buildDraftFirstPrompt("expand", "some text").prompt, "Draft-first questions"],
  ["chat", () => buildChatPrompt("psychology", "what is a sample?").prompt, "Ask Appuscholar (writing coach)"],
  ["helper paper", () => buildHelperPrompt("paper", "psychology", "some text").prompt, "Helpers: summarise a paper"],
  ["helper case", () => buildHelperPrompt("case", "psychology", "some text").prompt, "Helpers: study a case"],
  ["helper litrev", () => buildHelperPrompt("litrev", "psychology", "some text").prompt, "Helpers: advice on a literature review"],
  ["helper explain", () => buildHelperPrompt("explain", "psychology", "some text").prompt, "Helpers: explain a concept"],
  ["helper stats", () => buildHelperPrompt("stats", "psychology", "some text").prompt, "Helpers: statistics output to APA sentences"],
  ["devil's advocate", () => buildDevilPrompt("some passage").prompt, "Devil's advocate"],
  ["viva, conference", () => buildVivaPrompt("conf", "some text").prompt, "Viva question (conference panel)"],
  ["viva, examiner", () => buildVivaPrompt("viva", "some text").prompt, "Viva question (examiner)"],
  ["quick read", () => buildQuickReadPrompt("psychology", "We studied 120 students.").prompt, "Quick read of an abstract (any other)"],
  ["quick read, recorded abstract 1", () => buildQuickReadPrompt("psychology", "This study conducted an experiment of English script activities on 279 senior students from two universities.").prompt, "Quick read of an abstract (recorded abstract: English script activities)"],
  ["quick read, recorded abstract 2", () => buildQuickReadPrompt("psychology", "To test this, the valid and reliable questionnaire of Sarason was administered to 150 female and male students.").prompt, "Quick read of an abstract (recorded abstract: test anxiety and performance)"],
  ["rank", () => buildRankPrompt("psychology", "does sleep help recall?", [paper(1)]).prompt, "Rank search results by fit"],
  ["search terms", () => buildSuggestTermsPrompt("psychology", "sleep and recall").prompt, "Suggest search terms"],
  ["analyse ask", () => buildAskPrompt("psychology", doc, "What was the sample?").prompt, "Analyse: ask a question about the paper"],
  ["analyse walk", () => buildWalkPrompt("psychology", doc, AP_STAGES[0]!, "my first try").prompt, "Analyse: walk through a paper"],
  ["teacher raj", () => lesson("raj"), "Analyse: ask a teaching character"],
  ["teacher meera", () => lesson("meera"), "Analyse: ask a teaching character"],
  ["teacher appu", () => lesson("appu"), "Analyse: ask a teaching character"],
  ["teacher dev", () => lesson("dev"), "Analyse: ask a teaching character"],
  ["teacher tara", () => lesson("tara"), "Analyse: ask a teaching character"],
  ["style analyse", () => buildStyleAnalyzePrompt("some text").prompt, "My style: describe a text"],
  ["style files", () => buildStyleFilesPrompt(["some text", "more text"]).prompt, "My style: learn from many documents"],
  ["style try, on", () => buildStyleTryPrompt("- Warm tone.", true, null, STY_PASSAGES[0]).prompt, "My style: try it on a practice passage"],
  ["style try, off", () => buildStyleTryPrompt("- Warm tone.", false, null, STY_PASSAGES[1]).prompt, "My style: try it on a practice passage"],
  ["grammar uk", () => buildGrammarPrompt("psychology", "uk", "Some text to check.").prompt, "Grammar: nothing found"],
  ["grammar us", () => buildGrammarPrompt("education", "us", "Some text to check.").prompt, "Grammar: nothing found"],
  ["grammar, recorded text", () => buildGrammarPrompt("psychology", "uk", "The students was happy with the results.").prompt, "Grammar: one real slip, and one edit whose words are not in the text (the app must drop it)"],
  ["dictionary, recorded word", () => buildDictPrompt("psychology", "study").prompt, "Dictionary: study (recorded)"],
  ["dictionary, any other word", () => buildDictPrompt("psychology", "zzyzx").prompt, "Dictionary: a word with no recorded entry (the provider is unsure)"],
  ["statistics explain", () => buildStatsExplainPrompt("psychology", "Table 1. t = 3.2, p = .002.", "t(58) = 3.20, p = .002").prompt, "Statistics: explain in plain language"],
  ["quote translation", () => quotePrompt("Sleep consolidates memory."), "Citations: translate a quotation into Hindi"],
  ["key test", () => "Reply with the single word OK.", "Test my key"]
];

type Recorded = { match: string; reply: unknown; feature: string };
const RECORDED = recorded as Recorded[];
const replyText = (e: Recorded) => (typeof e.reply === "string" ? e.reply : JSON.stringify(e.reply));

describe("the recorded replies", () => {
  const answerTo = async (prompt: string) => {
    const { shim, log } = setup(RECORDED);
    const r = await ask(shim, "gsk_qa_ok_rec", prompt);
    return { r, entry: log[0]!, text: r.status === 200 ? await content(r) : await r.text() };
  };

  it.each(FEATURES)("%s is answered by its own entry, and logs the kind the api logs", async (_name, build, label) => {
    const prompt = build();
    const { r, entry, text } = await answerTo(prompt);
    expect(r.status, text.slice(0, 200)).toBe(200);
    expect(entry.outcome).toBe("answered");
    expect(entry.kind).toBe(classifyAiUse(prompt)?.k ?? null);
    // Not an earlier entry's reply: the entry named for this feature gave it.
    const expected = RECORDED.find((e) => e.feature === label);
    expect(expected, "no recorded entry is labelled " + label).toBeDefined();
    expect(text).toBe(replyText(expected!));
  });

  it.each(FEATURES)("%s still has its reply when the content language is Hindi", async (_name, build, label) => {
    // The api adds this to the end of the prompt before it reaches the provider (apps/api/src/routes/ai.ts), and logs the kind of the prompt without it.
    const prompt = build();
    const { r, entry, text } = await answerTo(prompt + contentLangInstruction("hi"));
    expect(r.status).toBe(200);
    expect(text).toBe(replyText(RECORDED.find((e) => e.feature === label)!));
    expect(entry.kind).toBe(classifyAiUse(prompt)?.k ?? null);
  });

  it("holds no entry that no feature's prompt reaches, and none without a label or with a short match", () => {
    // Each feature below is answered by the entry it names (the cases above), so an entry no feature names is one no prompt reaches: stale, or shadowed.
    const reached = new Set(FEATURES.map(([, , label]) => label));
    for (const e of RECORDED) {
      expect(e.match.length, JSON.stringify(e).slice(0, 80)).toBeGreaterThan(8);
      expect(typeof e.feature, e.match).toBe("string");
    }
    expect(RECORDED.map((e) => e.feature).filter((f) => !reached.has(f))).toEqual([]);
    expect(new Set(RECORDED.map((e) => e.feature)).size, "two entries share a label").toBe(RECORDED.length);
  });

  it("answers the quick read in a way the app's own check accepts, and the ranking for any batch of up to 12", async () => {
    const abstract = "We studied 120 students and found that sleep length predicted recall scores.";
    const quick = await answerTo(buildQuickReadPrompt("psychology", abstract).prompt);
    const q = rsQuickCheck(quick.text, abstract);
    expect(q?.summary).toBeTruthy();
    expect(q?.summaryDropped).toBeUndefined();
    const rank = await answerTo(buildRankPrompt("psychology", "does sleep help recall?", [paper(1), paper(2), paper(3)]).prompt);
    expect(Object.keys(rsRankParse(rank.text, 3))).toEqual(["1", "2", "3"]);
    expect(Object.keys(rsRankParse(rank.text, 12))).toHaveLength(12);
  });

  it("gives the recorded abstracts a quick read whose quotations the app confirms", async () => {
    const one = "This study conducted an experiment of English script activities on 279 senior students from two universities.";
    const q = rsQuickCheck((await answerTo(buildQuickReadPrompt("psychology", one).prompt)).text, one);
    expect(q?.design?.ok).toBe(true);
    expect(q?.sample).toMatchObject({ n: 279, ok: true });
  });

  it("answers a word it has no entry for as the dictionary does when unsure, and the recorded word in full", async () => {
    const study = JSON.parse((await answerTo(buildDictPrompt("psychology", "study").prompt)).text);
    expect(study).toMatchObject({ simple: expect.any(String), hindi: expect.any(String), example: expect.any(String) });
    expect(study.simple).not.toMatch(/^unsure$/i);
    expect(JSON.parse((await answerTo(buildDictPrompt("psychology", "zzyzx").prompt)).text).simple).toBe("unsure");
  });
});

// ---- The rule table is the core's ---------------------------------------------------------------------------------------------------------------------

describe("the shim's copy of the AI-use rules", () => {
  /** The rows of AIU_RULES (a regular expression, a label, a group), one to a line, as written in the file. */
  const rows = (file: string) =>
    readFileSync(path.join(__dirname, file), "utf8").split("\n").map((l) => l.trim()).filter((l) => /^\[\/.*\/[a-z]*, ".*", "(text|feedback|explain|other)"\],?$/.test(l)).map((l) => l.replace(/,$/, ""));

  it("is the table of packages/core/src/aiuse.ts, row for row", () => {
    const core = rows("../../../../packages/core/src/aiuse.ts");
    expect(core.length).toBeGreaterThan(20);
    expect(rows("../../qa/provider-shim/core.mjs")).toEqual(core);
  });
});
