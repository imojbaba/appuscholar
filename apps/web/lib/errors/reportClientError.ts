import { APP_VERSION } from "@/lib/version";
import { buildOf, errorClass, routeOf } from "@/lib/errors/sanitize";

const URL_ = "/api/client-error";
const MAX_PER_PAGE = 5;
const seen = new Set<string>();

/**
 * Tells our own server that something threw in this tab: the error's class name, the page route (path only) and the build, nothing else
 * (never the message or stack, which can hold what the student wrote). The same name on the same route is sent once per page load, and at
 * most 5 reports per page load. It never throws and never waits.
 */
export function reportClientError(error: unknown, route?: string): void {
  try {
    let rawName: unknown;
    try { rawName = (error as { name?: unknown } | null | undefined)?.name; } catch { rawName = undefined; }
    const name = errorClass(rawName);
    const where = routeOf(route ?? (typeof location !== "undefined" ? location.pathname : "/"));
    const key = `${name} ${where}`;
    if (seen.has(key) || seen.size >= MAX_PER_PAGE) return;
    seen.add(key);
    const body = JSON.stringify({ name, route: where, build: buildOf(APP_VERSION) });
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(URL_, new Blob([body], { type: "application/json" }))) return;
    } catch { /* fall through to fetch */ }
    const sent = fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
    void Promise.resolve(sent).catch(() => {});
  } catch { /* reporting must never break the page */ }
}
