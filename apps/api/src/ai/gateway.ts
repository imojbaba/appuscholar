import { AiError, type AnthropicFactory, type CompleteInput, type CompleteOutput } from "./types";
import { gemini } from "./providers/gemini";
import { openaiCompat } from "./providers/openaiCompat";
import { anthropicComplete, defaultAnthropic } from "./providers/anthropic";

export { fetchRetry5xx } from "./http";

export type GatewayDeps = { fetch: typeof fetch; anthropic?: AnthropicFactory };

/** One call to the student's chosen provider with their own key. The key lives only in this call's arguments. */
export async function complete(input: CompleteInput, deps: GatewayDeps): Promise<CompleteOutput> {
  if (!input.apiKey.trim()) throw new AiError("no-key");
  const call: CompleteInput = { ...input, apiKey: input.apiKey.trim(), temperature: input.temperature ?? 0.8, maxTokens: input.maxTokens ?? 2000 };
  if (call.provider === "gemini") return gemini(call, deps.fetch);
  if (call.provider === "claude") return anthropicComplete(call, deps.anthropic ?? defaultAnthropic);
  return openaiCompat(call, deps.fetch);
}
