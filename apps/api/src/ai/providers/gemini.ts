import { PROVIDERS } from "@appuscholar/core";
import { AiError, type Adapter } from "../types";
import { httpError, postWithRetry } from "../http";

type GeminiAnswer = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
};

/** Port of v1 callAIRaw's Gemini branch (index.html:5355-5380). */
export const gemini: Adapter = async (input, fetchImpl) => {
  const chain = [PROVIDERS.gemini.model, ...(PROVIDERS.gemini.fallbacks ?? [])];
  let last: Response | null = null;
  for (const model of chain) {
    const r = await postWithRetry(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": input.apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: input.prompt }] }], generationConfig: { temperature: input.temperature, maxOutputTokens: input.maxTokens } })
    });
    if (r.status === 404 || r.status === 400) { last = r; continue; }
    if (!r.ok) throw await httpError(r);
    const j = (await r.json().catch(() => ({}))) as GeminiAnswer;
    const c = j.candidates?.[0];
    if (!c) {
      if (j.promptFeedback?.blockReason) throw new AiError("blocked", `the AI refused this text (${j.promptFeedback.blockReason}). Try rewording it.`);
      throw new AiError("empty", "The AI returned no answer. Try again.");
    }
    const text = (c.content?.parts ?? []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text as string).join("");
    if (!text) {
      if (c.finishReason === "MAX_TOKENS") throw new AiError("truncated", "The answer was cut off. Select a smaller piece of text and try again.");
      throw new AiError("empty", "The AI returned an empty answer. Try again.");
    }
    return { text, model };
  }
  throw last ? await httpError(last) : new AiError("model-gone", "No working Gemini model found.");
};
