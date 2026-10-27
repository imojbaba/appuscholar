import { AiError, type AnthropicFactory, type CompleteInput, type CompleteOutput } from "./types";
import { gemini } from "./providers/gemini";
import { openaiCompat } from "./providers/openaiCompat";
import { anthropicComplete, defaultAnthropic } from "./providers/anthropic";

export { fetchRetry5xx } from "./http";

export type GatewayDeps = { fetch: typeof fetch; anthropic?: AnthropicFactory };

/** How long one AI call may take, all models and retries included, before it is ended and answered "slow" (a key test is given less). */
export const COMPLETE_TIMEOUT_MS = 120_000;
export const TEST_TIMEOUT_MS = 20_000;

/** One call to the student's chosen provider with their own key. The key lives only in this call's arguments. */
export async function complete(input: CompleteInput, deps: GatewayDeps): Promise<CompleteOutput> {
  if (!input.apiKey.trim()) throw new AiError("no-key");
  const signal = input.signal ?? AbortSignal.timeout(input.timeoutMs ?? COMPLETE_TIMEOUT_MS);
  const call: CompleteInput = { ...input, apiKey: input.apiKey.trim(), temperature: input.temperature ?? 0.8, maxTokens: input.maxTokens ?? 2000, signal };
  try {
    if (call.provider === "gemini") return await gemini(call, deps.fetch);
    if (call.provider === "claude") return await anthropicComplete(call, deps.anthropic ?? defaultAnthropic);
    return await openaiCompat(call, deps.fetch);
  } catch (e) {
    // A body read cut off by the time limit surfaces as an empty answer: it is the time limit.
    if (signal.aborted) throw new AiError("slow");
    throw e;
  }
}
