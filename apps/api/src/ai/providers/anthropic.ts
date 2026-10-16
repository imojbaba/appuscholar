import Anthropic from "@anthropic-ai/sdk";
import { PROVIDERS } from "@appuscholar/core";
import { AiError, type AnthropicFactory, type CompleteInput, type CompleteOutput } from "../types";

/** Pinned so nothing in the server's environment (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN) can redirect the student's key or swap its credentials. One try: the web app already offers its own retry and failover. */
export const defaultAnthropic: AnthropicFactory = (apiKey) =>
  new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", authToken: null, maxRetries: 0, timeout: 60_000 }) as unknown as ReturnType<AnthropicFactory>;

/** Classifies an SDK failure by class; anything else is not ours to name and is rethrown. */
function mapSdkError(e: unknown): AiError | null {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError("key-rejected", `HTTP ${e.status}`);
  if (e instanceof Anthropic.NotFoundError) return new AiError("model-gone", "HTTP 404");
  if (e instanceof Anthropic.RateLimitError) return new AiError("rate-limit", "HTTP 429");
  if (e instanceof Anthropic.InternalServerError) return new AiError("provider-error", `HTTP ${e.status}`);
  if (e instanceof Anthropic.APIConnectionError) return new AiError("network");
  if (e instanceof Anthropic.APIError) return new AiError("provider-error", `HTTP ${e.status ?? "unknown"}`);
  return null;
}

/** Claude through the official SDK with the student's own key, one client per request. No temperature and no thinking: Haiku 5.5 rejects non-default sampling. */
export async function anthropicComplete(input: CompleteInput, factory: AnthropicFactory): Promise<CompleteOutput> {
  const client = factory(input.apiKey);
  const chain = [PROVIDERS.claude.model, ...(PROVIDERS.claude.fallbacks ?? [])];
  let gone: AiError | null = null;
  for (const model of chain) {
    let res;
    try {
      res = await client.messages.create({ model, max_tokens: input.maxTokens ?? 2000, messages: [{ role: "user", content: input.prompt }] });
    } catch (e) {
      const mapped = mapSdkError(e);
      if (!mapped) throw e;
      if (mapped.code === "model-gone") { gone = mapped; continue; }
      throw mapped;
    }
    if (res.stop_reason === "refusal") throw new AiError("blocked", `the AI refused this text (${res.stop_details?.category ?? "refusal"}). Try rewording it.`);
    if (res.stop_reason === "max_tokens") throw new AiError("truncated", "The answer was cut off. Select a smaller piece of text and try again.");
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (!text) throw new AiError("empty", "The AI returned an empty answer. Try again.");
    return { text, model };
  }
  throw gone ?? new AiError("model-gone");
}
