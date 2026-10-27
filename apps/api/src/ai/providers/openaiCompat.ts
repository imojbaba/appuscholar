import { PROVIDERS } from "@appuscholar/core";
import { AiError, type Adapter, type ProviderId } from "../types";
import { httpError, postWithRetry } from "../http";

const URLS: Partial<Record<ProviderId, string>> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions"
};

/** Port of v1 callAIRaw's OpenAI-compatible tail (index.html:5382-5403): Groq, DeepSeek, OpenAI and OpenRouter. */
export const openaiCompat: Adapter = async (input, fetchImpl) => {
  const url = URLS[input.provider];
  if (!url) throw new AiError("provider-error", "unknown provider");
  const model = PROVIDERS[input.provider].model;
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: "Bearer " + input.apiKey };
  if (input.provider === "openrouter") { headers["HTTP-Referer"] = "https://appuscholar.local"; headers["X-Title"] = "Appuscholar"; }
  const r = await postWithRetry(fetchImpl, url, {
    method: "POST", headers, signal: input.signal,
    body: JSON.stringify({ model, messages: [{ role: "user", content: input.prompt }], temperature: input.temperature, max_tokens: input.maxTokens })
  });
  if (!r.ok) throw await httpError(r);
  const j = (await r.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: unknown } }> };
  const text = j.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new AiError("empty", "The AI returned an empty answer. Try again.");
  return { text, model };
};
