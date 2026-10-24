/** Device-local counts for the problem report (v1 usageGet and usageBump 11339-11341): which tools were open and where errors happened. Counts only, never text. */
export type Usage = { tools: Record<string, number>; errors: Record<string, number> };
const KEY = "appu_usage";

function ls(): Storage | null { try { return localStorage; } catch { return null; } }
const num = (o: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
};

export function readUsage(): Usage {
  try {
    const u = JSON.parse(ls()?.getItem(KEY) ?? "{}") as { tools?: unknown; errors?: unknown } | null;
    return { tools: num(u?.tools), errors: num(u?.errors) };
  } catch { return { tools: {}, errors: {} }; }
}

export function bumpUsage(tool: string, kind: "tools" | "errors" = "tools"): void {
  try {
    const u = readUsage();
    u[kind][tool] = (u[kind][tool] ?? 0) + 1;
    ls()?.setItem(KEY, JSON.stringify(u));
  } catch { /* storage blocked: counts are a convenience */ }
}

export function clearUsage(): void { try { ls()?.removeItem(KEY); } catch { /* storage blocked */ } }

/** v1 repUsageText. */
export function usageText(u: Usage): string {
  const f = (o: Record<string, number>) => Object.keys(o).sort((a, b) => o[b]! - o[a]!).map((k) => k + " " + o[k]).join(", ") || "nothing yet";
  return "Tool opens: " + f(u.tools) + "\nErrors by tool: " + f(u.errors);
}
