import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildWritingPrompt, classifyAiUse } from "@appuscholar/core";
import { QA_API_ORIGIN } from "../support/origins";
import { readProviderLog, type ShimLogEntry } from "../support/providerLog";
import { signInAs } from "../support/session";

/**
 * The fake AI provider behind the API, on the production build: a request goes through the API's own code (the terms gate, the error mapping, the retry, the
 * AI-use log) and only the provider is simulated (qa/provider-shim). The key chooses what the provider does: `gsk_qa_<mode>_<random>`.
 */
const PROMPT = buildWritingPrompt("improve", "Procrastination delays important work.").prompt;
const KIND = classifyAiUse(PROMPT)!.k;
/** The recorded reply of the Improve feature, read from the fixture the provider answers from (not retyped here). */
const IMPROVED = (JSON.parse(readFileSync(path.join(__dirname, "../fixtures/ai-replies.json"), "utf8")) as Array<{ match: string; reply: string }>).find((e) => e.match === "Improve this text")!.reply;
/** A key of its own for each request: nothing is shared between cases, and a failonce count is per key. */
const key = (mode: string) => `gsk_qa_${mode}_${randomUUID().slice(0, 8)}`;

/** The calls the provider received with this key (the shim writes each one before the API gets its answer). */
const callsFor = (apiKey: string): ShimLogEntry[] => readProviderLog().filter((e) => e.key === apiKey);

test("provider: the api's AI route meets the fake provider", { tag: ["@selftest", "@slice"] }, async ({ page, context }) => {
  await signInAs(context);

  // A new account meets the terms gate first; the AI routes stay closed (403) until it is accepted.
  await page.goto("/");
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await page.getByTestId("welcome-later").click();
  await expect(page.getByTestId("welcome-dialog")).toBeHidden();

  const tokenResponse = await page.request.get("/api/token");
  expect(tokenResponse.status()).toBe(200);
  const headers = { Authorization: "Bearer " + ((await tokenResponse.json()) as { token: string }).token };
  const day = new Date().toISOString().slice(0, 10);
  const complete = async (apiKey: string, prompt = PROMPT) => {
    const r = await page.request.post(QA_API_ORIGIN + "/ai/complete", { headers, data: { provider: "groq", apiKey, prompt, day } });
    return { status: r.status(), body: (await r.json()) as { text?: string; model?: string; error?: string; detail?: string } };
  };

  await test.step("ok: the recorded reply comes back, and the provider saw the prompt, with its kind", async () => {
    const k = key("ok");
    const r = await complete(k);
    expect(r.status).toBe(200);
    expect(r.body.text).toBe(IMPROVED);
    const calls = callsFor(k);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ key: k, mode: "ok", host: "api.groq.com", kind: KIND, prompt: PROMPT, outcome: "answered" });
  });

  await test.step("each failing mode reaches the student as the api maps it", async () => {
    // [mode, the api's status, its error code, how many requests the provider saw]. The api retries a 5xx three times and a dropped connection not at all.
    const modes: Array<[string, number, string, number]> = [
      ["fail429", 429, "rate-limit", 1],
      ["fail401", 401, "key-rejected", 1],
      ["fail500", 502, "provider-error", 3],
      ["nonet", 502, "network", 1],
      ["empty", 400, "empty", 1]
    ];
    for (const [mode, status, error, seen] of modes) {
      const k = key(mode);
      const r = await complete(k);
      expect({ mode, status: r.status, error: r.body.error }).toEqual({ mode, status, error });
      const calls = callsFor(k);
      expect({ mode, seen: calls.length }).toEqual({ mode, seen });
      expect(calls.every((c) => c.mode === mode && c.outcome === "failed")).toBe(true);
    }
  });

  await test.step("failonce: the first request with a key answers 429, the next one answers", async () => {
    const k = key("failonce");
    expect((await complete(k)).status).toBe(429);
    const second = await complete(k);
    expect(second.status).toBe(200);
    expect(second.body.text).toBeTruthy();
    expect(callsFor(k).map((c) => c.outcome)).toEqual(["failed", "answered"]);
    // Another key has its own first failure.
    expect((await complete(key("failonce"))).status).toBe(429);
  });

  await test.step("slow<ms>: the answer comes after the wait", async () => {
    const started = Date.now();
    const r = await complete(key("slow700"));
    expect(r.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(650);
  });

  await test.step("a prompt with no recorded reply is named in the error", async () => {
    const k = key("ok");
    const prompt = "Write me a poem about the sea.";
    const r = await complete(k, prompt);
    expect(r.status).toBe(502);
    expect(r.body.error).toBe("provider-error");
    expect(r.body.detail).toContain("QA: no recorded reply for: " + prompt);
    expect(callsFor(k).map((c) => c.outcome)).toEqual(["unknown"]);
  });

  await test.step("Gemini and Anthropic are not faked: refused here, and the key goes nowhere", async () => {
    // Gemini is the app's default provider. The api tries its fallback models after a 400, so it may ask more than once; every request is refused.
    for (const [provider, host] of [["gemini", "generativelanguage.googleapis.com"], ["claude", "api.anthropic.com"]] as const) {
      const k = key("ok");
      const r = await page.request.post(QA_API_ORIGIN + "/ai/complete", { headers, data: { provider, apiKey: k, prompt: PROMPT, day } });
      expect({ provider, status: r.status() }).toEqual({ provider, status: 502 });
      expect(((await r.json()) as { error: string }).error).toBe("provider-error");
      const calls = callsFor(k);
      expect(calls.length, provider).toBeGreaterThan(0);
      expect(calls.every((c) => c.host === host && c.outcome === "refused" && c.kind === KIND && c.prompt === PROMPT)).toBe(true);
    }
  });

  await test.step("test my key: the key test prompt is answered, and a rejected key is told", async () => {
    const good = await page.request.post(QA_API_ORIGIN + "/ai/test", { headers, data: { provider: "groq", apiKey: key("ok") } });
    expect(good.status()).toBe(200);
    expect(await good.json()).toEqual({ ok: true, reply: "OK" });
    const bad = await page.request.post(QA_API_ORIGIN + "/ai/test", { headers, data: { provider: "groq", apiKey: key("fail401") } });
    expect(bad.status()).toBe(401);
  });

  await test.step("the AI-use log counts only the requests the provider answered", async () => {
    // Answered with text: ok, failonce's second request and the slow one. Everything else failed before the api logs.
    const log = await page.request.get(QA_API_ORIGIN + "/ai/log", { headers });
    expect(log.status()).toBe(200);
    const rows = (await log.json()) as Array<{ d: string; p: string; k: string; g: string }>;
    expect(rows).toHaveLength(3);
    expect(rows.every((e) => e.p === "groq" && e.k === KIND && e.d === day)).toBe(true);
  });
});
