import { scrubMessage, toolFromPath, type RingError } from "./repFacts";
import { bumpUsage } from "./usage";

/** The last five errors of this page, in memory only (v1 _errLog): never written to storage, gone on reload. Replaced, not changed, so a screen can tell when it moved. */
let ring: readonly RingError[] = [];
let owner: string | null = null;
const subs = new Set<() => void>();
const emit = () => { for (const f of [...subs]) { try { f(); } catch { /* a listener must not break reporting */ } } };

export function readErrors(): readonly RingError[] { return ring; }

/** Calls `fn` when an error is noted or the ring is emptied; returns the function that stops it. */
export function subscribeErrors(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function clearErrors(): void {
  if (!ring.length) return;
  ring = [];
  emit();
}

/** The ring is module state and outlives a sign-out in the same tab: it starts empty when a different account is in. */
export function keepErrorsFor(account: string): void {
  if (owner !== null && owner !== account) clearErrors();
  owner = account;
}

/** Records one error: message masked and cut, file and line kept, the tool open now counted in the device-local error counts. */
export function noteError(message: unknown, where: unknown, tool?: string): void {
  try {
    const t = tool ?? toolFromPath(typeof location === "undefined" ? null : location.pathname);
    ring = [...ring, { at: Date.now(), tool: t, message: scrubMessage(message), where: scrubMessage(where, 60) }].slice(-5);
    bumpUsage(t, "errors");
    emit();
  } catch { /* reporting must never raise an error of its own */ }
}

/** Starts listening for window `error` and `unhandledrejection`; returns the function that stops it. */
export function installErrorRing(): () => void {
  const onError = (e: ErrorEvent) => {
    // The script's name and line; its address may carry a query, which is not kept.
    const file = String(e.filename ?? "").split(/[?#]/)[0]!.split("/").pop();
    noteError(e.message, file ? file + ":" + (e.lineno ?? 0) : "");
  };
  const onReject = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: unknown } | null | undefined;
    noteError(r && typeof r === "object" && "message" in r ? r.message : r, "promise");
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onReject); };
}
