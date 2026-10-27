import type { ProviderId } from "@appuscholar/core";

export type { ProviderId };
/** `signal` ends the call: the gateway sets it from `timeoutMs` so a provider that never answers cannot hold the request (live, 27 Oct). */
export type CompleteInput = { provider: ProviderId; apiKey: string; prompt: string; temperature?: number; maxTokens?: number; timeoutMs?: number; signal?: AbortSignal };
export type CompleteOutput = { text: string; model: string };
export type AiErrorCode = "no-key" | "key-rejected" | "model-gone" | "rate-limit" | "provider-error" | "network" | "blocked" | "truncated" | "empty" | "personal-data" | "slow";

export class AiError extends Error {
  constructor(public code: AiErrorCode, public detail = "") { super(code); this.name = "AiError"; }
}

export type Adapter = (input: CompleteInput, fetchImpl: typeof fetch) => Promise<CompleteOutput>;

/** The slice of the Anthropic SDK client the gateway uses; the real client satisfies it, tests stub it. */
export type AnthropicClient = {
  messages: {
    create(params: { model: string; max_tokens: number; messages: Array<{ role: "user"; content: string }> }): Promise<{
      stop_reason?: string | null;
      stop_details?: { category?: string | null } | null;
      content: Array<{ type: string; text?: string }>;
    }>;
  };
};
export type AnthropicFactory = (apiKey: string) => AnthropicClient;
