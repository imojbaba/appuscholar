import { PROV_ORDER, maskText, scanText, type ProviderId } from "@appuscholar/core";
import { ApiError, apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { keyStore, unlockKeyBlob } from "./keys";
import { maskNames, scanNames, type NamesChecked, type NamesCtx } from "./names";

/** The gateway's error classes (apps/api/src/ai/types.ts). */
export type AiErrorCode = "personal-data" | "blocked" | "truncated" | "empty" | "no-key" | "key-rejected" | "model-gone" | "rate-limit" | "provider-error" | "network" | "terms";
/**
 * What the personal-data check found. `names` is there when the request was checked for names (the open project's, spec 2026-10-24-participants-design.md §8.3): how many names on the
 * participant list, the words that might be names (suggestions, and listed words the list asks about), and whether the list is locked so names on it were not checked.
 * `sig` carries the names too, so "Send as it is" is remembered for these names and a new name asks again.
 */
export type ScanResult = ReturnType<typeof scanText> & {
  names?: { listed: number; maybe: string[]; locked: boolean };
  /** Which name checks ran on this request (there when `names` is): the dialog says only what ran (R54b). A locked list, or a request outside a project, ran none. */
  checked?: NamesChecked;
};

/**
 * What the student chose in the personal-data dialog. `leave`: the "might be a name" words left as written (the toggle at Leave), when the answer is Mask or Send. "unlock" is only
 * answered when the list is locked: callAI opens the vault's unlock ask and checks the request again.
 */
export type PdAnswer = "mask" | "send" | "cancel" | "unlock";
export type PdChoice = { answer: PdAnswer; leave: string[] };

export type CallOpts = {
  temp?: number; max?: number; noLang?: boolean; noScan?: boolean; purposeDay?: string;
  /** The text is published papers (Analyse a paper, the reading shelf, research ranking, citation tools): no name is suggested (C13). Names on the participant list are still matched. */
  literature?: boolean;
  /** Names the caller has already asked the student about in this request, in normal form: the names check skips them, so nobody is asked twice (Explain's step). */
  namesAsked?: string[];
};
export type CallCtx = {
  provider: ProviderId;
  /** Encrypted keys stored on the server, by provider. */
  blobs: Record<string, string>;
  fallbackOn: boolean;
  contentLang: "en" | "hi";
  projectId: string | null;
  askPassphrase(p: ProviderId): Promise<string | null>;
  /** When given, opens a server-held key instead of askPassphrase + the legacy unlock: useKeys().getUnlocked, which also reads keys
   *  locked under the vault and re-wraps legacy ones. Null when cancelled; throws when the passphrase was wrong. */
  unlockKey?(p: ProviderId): Promise<string | null>;
  askPd(sc: ScanResult): Promise<PdChoice>;
  /**
   * The open project's participant list, plan and whether the list is locked, for the names check (lib/ai/namesRead.ts). Absent where there is no project: the check is then for email
   * addresses, phone numbers and ID numbers only. It must not raise a passphrase prompt and should not reject; a rejection counts as nothing known.
   */
  names?(): Promise<NamesCtx>;
  /** The vault's unlock ask (ensureUnlocked), for the locked-list line's Unlock button: true once unlocked. */
  unlock?(): Promise<boolean>;
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
  if (ctx.unlockKey) {
    let got: string | null;
    try { got = await ctx.unlockKey(p); } catch { throw new AiCallError("bad-pass", apiMsg("bad-pass")); }
    if (!got) throw new AiCallError("no-key", apiMsg("no-key"));
    toast("Key unlocked for this session ✓");
    return got;
  }
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
    // Asked again after Unlock: the list is then open, and the request is checked against it.
    for (;;) {
      const nc = ctx.names ? await ctx.names().catch(() => null) : null;
      // Names are looked for in the text as Mask would leave it: a name written inside an email address belongs to that address (counted and masked once, as "[email]"), not to the list.
      const masked = maskText(prompt);
      // A locked list is read as nothing: its names, its "not a name" words and its made-up names are not known, so no suggestion is made either.
      const found = nc && !nc.locked ? scanNames(masked, nc, { literature: opts.literature === true, asked: opts.namesAsked ?? [] }) : null;
      const base = scanText(prompt);
      const names = nc ? { listed: found?.listed ?? 0, maybe: found?.maybe ?? [], locked: nc.locked } : undefined;
      if (base.total === 0 && !(names && (names.listed > 0 || names.maybe.length > 0 || names.locked))) break;
      // The signature holds the project: a Send in one project never covers another's list and names (R43).
      const sc: ScanResult = { ...base, sig: [ctx.projectId ? "project:" + ctx.projectId : "", base.sig, found?.sig ?? "", names?.locked ? "list-locked" : ""].filter(Boolean).join("||"), ...(names ? { names, checked: found?.checked ?? { list: false, firstNames: false } } : {}) };
      if (pdOk.has(sc.sig)) { pdAccepted = true; break; }
      const choice = await ctx.askPd(sc);
      if (choice.answer === "cancel") throw new AiCallError("cancelled", apiMsg("cancelled"));
      if (choice.answer === "unlock") { await ctx.unlock?.().catch(() => false); continue; }
      if (choice.answer === "send") { pdOk.add(sc.sig); pdAccepted = true; }
      else prompt = found ? maskNames(masked, found, choice.leave) : masked;
      break;
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
