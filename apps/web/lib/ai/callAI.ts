import { PROV_ORDER, maskText, scanText, type ProviderId } from "@appuscholar/core";
import { ApiError, apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { keyStore, unlockKeyBlob } from "./keys";

/** The gateway's error classes (apps/api/src/ai/types.ts). */
export type AiErrorCode = "personal-data" | "blocked" | "truncated" | "empty" | "no-key" | "key-rejected" | "model-gone" | "rate-limit" | "provider-error" | "network" | "terms";
export type ScanResult = ReturnType<typeof scanText>;

export type CallOpts = { temp?: number; max?: number; noLang?: boolean; noScan?: boolean; purposeDay?: string };
export type CallCtx = {
  provider: ProviderId;
  /** Encrypted keys stored on the server, by provider. */
  blobs: Record<string, string>;
  fallbackOn: boolean;
  contentLang: "en" | "hi";
  projectId: string | null;
  askPassphrase(p: ProviderId): Promise<string | null>;
  askPd(sc: ScanResult): Promise<"mask" | "send" | "cancel">;
  openSettings(): void;
  onFailover(from: ProviderId, to: ProviderId): void;
  /** Optional: called when the last answer was a rate limit, so the workspace can offer Groq. */
  onRateLimit?(): void;
};

/** v1 apiMsg (index.html:5253-5266), keyed by the gateway's error class instead of by pattern-matching text. */
export function apiMsg(code: AiErrorCode | "cancelled" | "bad-pass", detail?: string): string {
  switch (code) {
    case "no-key": return "Add your API key first — click ⚙ at the top right.";
    case "blocked": case "personal-data": return detail?.trim() || "Something went wrong. Try again.";
    case "bad-pass": return "Wrong passphrase — nothing was unlocked. Try again.";
    case "cancelled": return "Cancelled. Nothing was sent to the AI provider.";
    case "key-rejected": return "Your API key was rejected. Open ⚙ and paste it again.";
    case "model-gone": return "That AI model is no longer available. Try a different provider using the tabs at the top.";
    case "rate-limit": return "Free limit reached for now. Wait a minute, or switch provider using the tabs at the top.";
    case "provider-error": return "The AI service is having problems (already retried a couple of times). Try again in a few minutes, or switch provider using the tabs at the top. Detail: " + (detail ?? "").slice(0, 180);
    case "network": return "Could not reach the AI provider. Check your connection and try again, or switch provider using the tabs at the top.";
    case "truncated": return "The answer was cut off. Select a smaller piece of text and try again.";
    case "empty": return "The AI returned an empty answer. Try again.";
    case "terms": return "Accept the terms first (open ❓ Help → Terms and where your data goes).";
  }
}

/** The error callAI rejects with: `message` is the sentence to show the student, `code` the class that produced it. */
export class AiCallError extends Error {
  constructor(public code: AiErrorCode | "cancelled" | "bad-pass" | "unknown", message: string) { super(message); }
}

const AI_CODES: readonly string[] = ["personal-data", "blocked", "truncated", "empty", "no-key", "key-rejected", "model-gone", "rate-limit", "provider-error", "network", "terms"];
/** Errors worth trying another provider for: v1 aiRetriable (429, 5xx, 401/403, 404, network). */
const RETRIABLE: readonly string[] = ["rate-limit", "provider-error", "key-rejected", "model-gone", "network"];

/** Findings the student has already accepted in this session (v1 _pdOk), so the same text is not asked about twice. */
const pdOk = new Set<string>();
export function resetPdMemo(): void { pdOk.clear(); }

/** Local calendar day, YYYY-MM-DD: the date the AI-use log records. */
function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function toCallError(e: unknown): AiCallError {
  if (e instanceof AiCallError) return e;
  if (e instanceof ApiError) {
    if (AI_CODES.includes(e.code)) return new AiCallError(e.code as AiErrorCode, apiMsg(e.code as AiErrorCode, e.detail));
    return new AiCallError("unknown", "Something went wrong. Try again.");
  }
  // fetch itself failed (offline, or the browser blocked the call).
  return new AiCallError("network", apiMsg("network"));
}

async function request(provider: ProviderId, apiKey: string, prompt: string, opts: CallOpts, ctx: CallCtx, pdAccepted: boolean): Promise<string> {
  try {
    const r = await apiFetch<{ text: string; model: string }>("/ai/complete", {
      method: "POST",
      body: JSON.stringify({
        provider, apiKey, prompt, day: opts.purposeDay ?? localDay(), contentLang: ctx.contentLang, noLang: !!opts.noLang, pdAccepted,
        ...(opts.temp !== undefined ? { temperature: opts.temp } : {}), ...(opts.max !== undefined ? { maxTokens: opts.max } : {}),
        ...(ctx.projectId ? { projectId: ctx.projectId } : {})
      })
    });
    return r.text;
  } catch (e) { throw toCallError(e); }
}

/** Makes sure the chosen provider has a usable key: opens the passphrase prompt for a server-held encrypted one. */
async function ensureKey(ctx: CallCtx): Promise<string> {
  const p = ctx.provider;
  const have = keyStore.getUnlocked(p);
  if (have) return have;
  const blob = ctx.blobs[p];
  if (!blob) { ctx.openSettings(); throw new AiCallError("no-key", apiMsg("no-key")); }
  const pass = await ctx.askPassphrase(p);
  if (!pass) throw new AiCallError("no-key", apiMsg("no-key"));
  let plain: string;
  try { plain = await unlockKeyBlob(blob, pass); } catch { throw new AiCallError("bad-pass", apiMsg("bad-pass")); }
  keyStore.setSession(p, plain);
  toast("Key unlocked for this session ✓");
  return plain;
}

export async function callAI(prompt: string, opts: CallOpts, ctx: CallCtx): Promise<string> {
  // 1. Personal-data check, before anything leaves the browser.
  let pdAccepted = false;
  if (!opts.noScan) {
    const sc = scanText(prompt);
    if (sc.total > 0) {
      if (pdOk.has(sc.sig)) pdAccepted = true;
      else {
        const a = await ctx.askPd(sc);
        if (a === "cancel") throw new AiCallError("cancelled", apiMsg("cancelled"));
        if (a === "send") { pdOk.add(sc.sig); pdAccepted = true; }
        else prompt = maskText(prompt);
      }
    }
  }
  // 2. A key for the chosen provider.
  const key = await ensureKey(ctx);
  // 3. The request; on a retriable failure, other providers whose key is usable without a passphrase (v1 only fails over to those).
  try {
    return await request(ctx.provider, key, prompt, opts, ctx, pdAccepted);
  } catch (e) {
    const first = toCallError(e);
    if (ctx.fallbackOn && RETRIABLE.includes(first.code)) {
      for (const p2 of PROV_ORDER) {
        if (p2 === ctx.provider) continue;
        const k2 = keyStore.getUnlocked(p2);
        if (!k2) continue;
        try {
          const text = await request(p2, k2, prompt, opts, ctx, pdAccepted);
          ctx.onFailover(ctx.provider, p2);
          return text;
        } catch { /* try the next one */ }
      }
    }
    if (first.code === "rate-limit") ctx.onRateLimit?.();
    throw first;
  }
}
