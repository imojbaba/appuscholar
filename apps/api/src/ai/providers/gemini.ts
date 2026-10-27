import { PROVIDERS } from "@appuscholar/core";
import { AiError, type Adapter } from "../types";
import { httpError } from "../http";

type GeminiAnswer = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
};

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * The models tried, in order: v1's chain (PROVIDERS.gemini) with gemini-3.7-flash and gemini-3.5-flash between its steps. Checked live with a new free key
 * on 27 Oct 2026: 3.8-flash answered 503 "high demand" after 8 s, 3.6-flash answered in 2 s, and 2.5-flash is closed to new users (404). One busy model
 * must not stop the call while the next one is free.
 */
export const GEMINI_CHAIN: readonly string[] = (() => {
  const [first, ...rest] = [PROVIDERS.gemini.model, ...(PROVIDERS.gemini.fallbacks ?? [])];
  const out = [first!, "gemini-3.7-flash", ...rest];
  out.splice(out.indexOf("gemini-2.5-flash") === -1 ? out.length : out.indexOf("gemini-2.5-flash"), 0, "gemini-3.5-flash");
  return [...new Set(out)];
})();

/** How long one model may take before the next one is tried (the call's own limit still ends the whole chain). */
export const GEMINI_MODEL_MS = 25_000;

/**
 * Gemini's thinking is counted in maxOutputTokens: with v1's small limits (the key test's 20) a thinking model spent them all and answered nothing
 * (live, 27 Oct: 3.6-flash, finishReason MAX_TOKENS, no text). The answer's own limit is kept and the thinking gets room on top.
 */
export const GEMINI_THINKING_ROOM = 2048;

/** Gemini's way of saying the key is wrong: 400 INVALID_ARGUMENT with reason API_KEY_INVALID ("API key not valid"), not a 401. */
export function geminiKeyInvalid(status: number, body: string): boolean {
  return status === 400 && /API_KEY_INVALID|API key not valid/i.test(body);
}

/** Port of v1 callAIRaw's Gemini branch (index.html:5355-5380), with a busy, failing or silent model passed over for the next one. */
export const gemini: Adapter = async (input, fetchImpl) => {
  let last: AiError | null = null;
  for (const model of GEMINI_CHAIN) {
    if (input.signal?.aborted) throw new AiError("slow");
    const perModel = AbortSignal.timeout(input.modelTimeoutMs ?? GEMINI_MODEL_MS);
    const signal = input.signal ? AbortSignal.any([input.signal, perModel]) : perModel;
    let r: Response;
    try {
      r = await fetchImpl(`${BASE}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": input.apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: input.prompt }] }], generationConfig: { temperature: input.temperature, maxOutputTokens: input.maxTokens === undefined ? undefined : input.maxTokens + GEMINI_THINKING_ROOM } }),
        signal
      });
    } catch {
      if (input.signal?.aborted) throw new AiError("slow");
      // This model did not answer in time, or the connection dropped: the next one may.
      last = perModel.aborted ? new AiError("slow") : new AiError("network");
      continue;
    }
    if (!r.ok) {
      const body = await r.clone().text().catch(() => "");
      if (geminiKeyInvalid(r.status, body)) throw new AiError("key-rejected", "API key not valid");
      if (r.status === 401 || r.status === 403) throw await httpError(r);
      // Gone, refused for this model, busy or failing: try the next model.
      last = await httpError(r);
      continue;
    }
    let j: GeminiAnswer;
    try { j = (await r.json()) as GeminiAnswer; } catch {
      if (input.signal?.aborted) throw new AiError("slow");
      last = perModel.aborted ? new AiError("slow") : new AiError("empty", "The AI returned no answer. Try again.");
      continue;
    }
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
  throw last ?? new AiError("model-gone", "No working Gemini model found.");
};

/**
 * Whether a Gemini key works, without asking a model to write: the models list answers in under a second with a good key (live, 27 Oct: 813 ms) and
 * spends none of the student's free requests, while a generation test waits on whichever model is busy.
 */
export async function geminiKeyCheck(apiKey: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<void> {
  let r: Response;
  try {
    r = await fetchImpl(`${BASE}/models?pageSize=1`, { headers: { "x-goog-api-key": apiKey }, signal });
  } catch {
    throw new AiError(signal.aborted ? "slow" : "network");
  }
  if (r.ok) return;
  const body = await r.clone().text().catch(() => "");
  if (geminiKeyInvalid(r.status, body)) throw new AiError("key-rejected", "API key not valid");
  throw await httpError(r);
}
