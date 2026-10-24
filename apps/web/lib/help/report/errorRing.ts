import { scrubMessage, toolFromPath, type RingError } from "./repFacts";
import { bumpUsage } from "./usage";

/** The last five errors of this page, in memory only (v1 _errLog): never written to storage, gone on reload. */
const ring: RingError[] = [];

export function readErrors(): RingError[] { return ring.slice(); }
export function clearErrors(): void { ring.length = 0; }

/** Records one error: message masked and cut, file and line kept, the tool open now counted in the device-local error counts. */
export function noteError(message: unknown, where: unknown, tool?: string): void {
  try {
    const t = tool ?? toolFromPath(typeof location === "undefined" ? null : location.pathname);
    ring.push({ at: Date.now(), tool: t, message: scrubMessage(message), where: scrubMessage(where, 60) });
    if (ring.length > 5) ring.shift();
    bumpUsage(t, "errors");
  } catch { /* reporting must never raise an error of its own */ }
}

/** Starts listening for window `error` and `unhandledrejection`; returns the function that stops it. */
export function installErrorRing(): () => void {
  const onError = (e: ErrorEvent) => noteError(e.message, String(e.filename ?? "").split("/").pop() + ":" + (e.lineno ?? 0));
  const onReject = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: unknown } | null | undefined;
    noteError(r && typeof r === "object" && "message" in r ? r.message : r, "promise");
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onReject); };
}
