import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { complete, fetchRetry5xx } from "../src/ai/gateway";
import { AiError } from "../src/ai/types";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const H = new Headers();

describe("gateway", () => {
  it("gemini walks the model chain on 404 and returns the model that answered", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => { calls.push(url); return url.includes("gemini-3.8-flash") ? json(404, {}) : json(200, { candidates: [{ content: { parts: [{ text: "hello" }] } }] }); });
    const r = await complete({ provider: "gemini", apiKey: "AIza-test", prompt: "p" }, { fetch: fetchMock as never });
    expect(r).toEqual({ text: "hello", model: "gemini-3.6-flash" });
    expect(calls[0]).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  });
  it("gemini sends the key in x-goog-api-key, the v1 body, and drops thought parts", async () => {
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test");
      expect(JSON.parse(init.body as string)).toEqual({ contents: [{ parts: [{ text: "p" }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 2000 } });
      return json(200, { candidates: [{ content: { parts: [{ text: "hidden", thought: true }, { text: "a" }, { text: "b" }] } }] });
    });
    expect((await complete({ provider: "gemini", apiKey: "AIza-test", prompt: "p" }, { fetch: fetch as never })).text).toBe("ab");
  });
  it("gemini exhausting the chain on 404 maps to model-gone", async () => {
    const fetch = vi.fn(async () => json(404, {}));
    await expect(complete({ provider: "gemini", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "model-gone" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("gemini safety block maps to blocked with v1 wording", async () => {
    const fetch = vi.fn(async () => json(200, { promptFeedback: { blockReason: "SAFETY" } }));
    await expect(complete({ provider: "gemini", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "blocked", detail: "the AI refused this text (SAFETY). Try rewording it." });
  });
  it("gemini with no candidate and no block reason is empty", async () => {
    const fetch = vi.fn(async () => json(200, {}));
    await expect(complete({ provider: "gemini", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "empty" });
  });
  it("openai-compatible providers use bearer auth and the v1 models; 401 maps to key-rejected", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => { expect((init.headers as Record<string,string>).Authorization).toBe("Bearer gsk_x"); return json(401, {}); });
    await expect(complete({ provider: "groq", apiKey: "gsk_x", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "key-rejected" });
  });
  it("openrouter sends the referer and title headers v1 sends", async () => {
    const fetch = vi.fn(async (_u: string, init: RequestInit) => { const h = init.headers as Record<string,string>; expect(h["HTTP-Referer"]).toBe("https://appuscholar.local"); expect(h["X-Title"]).toBe("Appuscholar"); return json(200, { choices: [{ message: { content: "ok" } }] }); });
    expect((await complete({ provider: "openrouter", apiKey: "sk-or-x", prompt: "p" }, { fetch: fetch as never })).model).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });
  it("posts each openai-compatible provider to its v1 URL with the v1 body", async () => {
    const urls: Record<string, string> = {
      groq: "https://api.groq.com/openai/v1/chat/completions",
      deepseek: "https://api.deepseek.com/chat/completions",
      openai: "https://api.openai.com/v1/chat/completions",
      openrouter: "https://openrouter.ai/api/v1/chat/completions"
    };
    const models: Record<string, string> = { groq: "openai/gpt-oss-120b", deepseek: "deepseek-chat", openai: "gpt-4o-mini", openrouter: "meta-llama/llama-3.3-70b-instruct:free" };
    for (const provider of ["groq", "deepseek", "openai", "openrouter"] as const) {
      const fetch = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(urls[provider]);
        expect(JSON.parse(init.body as string)).toEqual({ model: models[provider], messages: [{ role: "user", content: "p" }], temperature: 0.3, max_tokens: 50 });
        return json(200, { choices: [{ message: { content: "ok" } }] });
      });
      expect(await complete({ provider, apiKey: "k", prompt: "p", temperature: 0.3, maxTokens: 50 }, { fetch: fetch as never })).toEqual({ text: "ok", model: models[provider] });
    }
  });
  it("openai-compatible empty content maps to empty", async () => {
    const fetch = vi.fn(async () => json(200, { choices: [{ message: { content: "" } }] }));
    await expect(complete({ provider: "groq", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "empty" });
  });
  it("maps HTTP statuses: 403 key-rejected, 404 model-gone, 429 rate-limit, other 4xx provider-error with a detail", async () => {
    const run = (status: number) => complete({ provider: "groq", apiKey: "k", prompt: "p" }, { fetch: (async () => new Response("nope", { status })) as never });
    await expect(run(403)).rejects.toMatchObject({ code: "key-rejected" });
    await expect(run(404)).rejects.toMatchObject({ code: "model-gone" });
    await expect(run(429)).rejects.toMatchObject({ code: "rate-limit" });
    await expect(run(400)).rejects.toMatchObject({ code: "provider-error", detail: "HTTP 400: nope" });
  });
  it("a thrown fetch maps to network", async () => {
    const fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(complete({ provider: "groq", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "network" });
    await expect(complete({ provider: "gemini", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "network" });
  });
  it("retries 5xx three times then maps to provider-error", async () => {
    const fetch = vi.fn(async () => json(503, {}));
    await expect(complete({ provider: "groq", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "provider-error" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("fetchRetry5xx sleeps 700 then 1400 ms", async () => {
    const sleeps: number[] = []; let n = 0;
    await fetchRetry5xx(async () => json(n++ < 2 ? 500 : 200, {}), 3, async ms => { sleeps.push(ms); });
    expect(sleeps).toEqual([700, 1400]);
  });
  it("anthropic uses the SDK with the student's key, no temperature, and maps refusal to blocked", async () => {
    const create = vi.fn(async (p: unknown) => { void p; return { stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }; });
    const anthropic = (apiKey: string) => { expect(apiKey).toBe("sk-ant-x"); return { messages: { create } }; };
    await expect(complete({ provider: "claude", apiKey: "sk-ant-x", prompt: "p", temperature: 0.7 }, { fetch: vi.fn() as never, anthropic: anthropic as never })).rejects.toMatchObject({ code: "blocked", detail: "the AI refused this text (cyber). Try rewording it." });
    expect(create.mock.calls[0]![0]).not.toHaveProperty("temperature");
    expect(create.mock.calls[0]![0]).not.toHaveProperty("thinking");
  });
  it("anthropic returns the joined text blocks, the model and the request shape", async () => {
    const create = vi.fn(async (p: unknown) => { void p; return { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "a" }, { type: "text", text: "b" }] }; });
    const r = await complete({ provider: "claude", apiKey: "k", prompt: "hi", maxTokens: 77 }, { fetch: vi.fn() as never, anthropic: (() => ({ messages: { create } })) as never });
    expect(r).toEqual({ text: "ab", model: "claude-haiku-5-5" });
    expect(create).toHaveBeenCalledWith({ model: "claude-haiku-5-5", max_tokens: 77, messages: [{ role: "user", content: "hi" }] });
  });
  it("anthropic max_tokens maps to truncated and no text to empty", async () => {
    const mk = (resp: unknown) => ({ fetch: vi.fn() as never, anthropic: (() => ({ messages: { create: async () => resp } })) as never });
    await expect(complete({ provider: "claude", apiKey: "k", prompt: "p" }, mk({ stop_reason: "max_tokens", content: [{ type: "text", text: "cut" }] }))).rejects.toMatchObject({ code: "truncated" });
    await expect(complete({ provider: "claude", apiKey: "k", prompt: "p" }, mk({ stop_reason: "end_turn", content: [] }))).rejects.toMatchObject({ code: "empty" });
  });
  it("anthropic maps SDK error classes and walks the fallback once on NotFoundError", async () => {
    const throwing = (e: unknown) => ({ fetch: vi.fn() as never, anthropic: (() => ({ messages: { create: async () => { throw e; } } })) as never });
    const run = (e: unknown) => complete({ provider: "claude", apiKey: "k", prompt: "p" }, throwing(e));
    await expect(run(new Anthropic.AuthenticationError(401, {}, "x", H))).rejects.toMatchObject({ code: "key-rejected" });
    await expect(run(new Anthropic.PermissionDeniedError(403, {}, "x", H))).rejects.toMatchObject({ code: "key-rejected" });
    await expect(run(new Anthropic.NotFoundError(404, {}, "x", H))).rejects.toMatchObject({ code: "model-gone" });
    await expect(run(new Anthropic.RateLimitError(429, {}, "x", H))).rejects.toMatchObject({ code: "rate-limit" });
    await expect(run(new Anthropic.InternalServerError(500, {}, "x", H))).rejects.toMatchObject({ code: "provider-error" });
    await expect(run(new Anthropic.APIConnectionError({ message: "down" }))).rejects.toMatchObject({ code: "network" });
    await expect(run(new Anthropic.BadRequestError(400, {}, "x", H))).rejects.toMatchObject({ code: "provider-error", detail: "HTTP 400" });

    const models: string[] = [];
    const create = vi.fn(async (p: { model: string }) => { models.push(p.model); if (p.model === "claude-haiku-5-5") throw new Anthropic.NotFoundError(404, {}, "x", H); return { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }; });
    const r = await complete({ provider: "claude", apiKey: "k", prompt: "p" }, { fetch: vi.fn() as never, anthropic: (() => ({ messages: { create } })) as never });
    expect(r).toEqual({ text: "ok", model: "claude-haiku-4-5" });
    expect(models).toEqual(["claude-haiku-5-5", "claude-haiku-4-5"]);
  });
  it("an unexpected error from the SDK is not swallowed into an AiError", async () => {
    const d = { fetch: vi.fn() as never, anthropic: (() => ({ messages: { create: async () => { throw new RangeError("boom"); } } })) as never };
    const e = await complete({ provider: "claude", apiKey: "k", prompt: "p" }, d).catch(x => x);
    expect(e).toBeInstanceOf(RangeError);
    expect(e).not.toBeInstanceOf(AiError);
  });
  it("empty answer maps to truncated on MAX_TOKENS", async () => {
    const fetch = vi.fn(async () => json(200, { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }));
    await expect(complete({ provider: "gemini", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "truncated" });
  });
  it("an empty key is no-key", async () => {
    await expect(complete({ provider: "groq", apiKey: "  ", prompt: "p" }, { fetch: vi.fn() as never })).rejects.toMatchObject({ code: "no-key" });
  });
});
