/** Device-local counts for the problem report (v1 usageGet and usageBump): which tools were open and where errors happened. Counts only, never text. */
export type Usage = { tools: Record<string, number>; errors: Record<string, number> };
const KEY = "appu_usage";

function ls(): Storage | null { try { return localStorage; } catch { return null; } }
const num = (o: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
};

/** What is stored, as text: a value that compares equal until the counts change, for a screen that has to redraw with them. */
export function usageSnapshot(): string { try { return ls()?.getItem(KEY) ?? ""; } catch { return ""; } }

export function parseUsage(raw: string): Usage {
  try {
    const u = JSON.parse(raw || "{}") as { tools?: unknown; errors?: unknown } | null;
    return { tools: num(u?.tools), errors: num(u?.errors) };
  } catch { return { tools: {}, errors: {} }; }
}

export function readUsage(): Usage { return parseUsage(usageSnapshot()); }

const subs = new Set<() => void>();
const emit = () => { for (const f of [...subs]) { try { f(); } catch { /* a listener must not break counting */ } } };

/** Calls `fn` when the counts change here or in another tab; returns the function that stops it. */
export function subscribeUsage(fn: () => void): () => void {
  subs.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) fn(); };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => { subs.delete(fn); if (typeof window !== "undefined") window.removeEventListener("storage", onStorage); };
}

export function bumpUsage(tool: string, kind: "tools" | "errors" = "tools"): void {
  try {
    const u = readUsage();
    u[kind][tool] = (u[kind][tool] ?? 0) + 1;
    ls()?.setItem(KEY, JSON.stringify(u));
    emit();
  } catch { /* storage blocked: counts are a convenience */ }
}

export function clearUsage(): void { try { ls()?.removeItem(KEY); emit(); } catch { /* storage blocked */ } }

/** v1 repUsageText. */
export function usageText(u: Usage): string {
  const f = (o: Record<string, number>) => Object.keys(o).sort((a, b) => o[b]! - o[a]!).map((k) => k + " " + o[k]).join(", ") || "nothing yet";
  return "Tool opens: " + f(u.tools) + "\nErrors by tool: " + f(u.errors);
}
