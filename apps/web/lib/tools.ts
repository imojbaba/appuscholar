/** The v1 tool registry: the single source for tool ids, stage keys and stage order (labels come from the dictionary as t("stage_"+key)). */
export type ToolId = "idea" | "research" | "psych" | "analyse" | "design" | "stats" | "qual" | "style" | "words" | "cite" | "chat" | "close" | "slides";
export type StageKey = "idea" | "lit" | "design" | "collect" | "writing" | "review";

export const STAGE_ORDER: StageKey[] = ["idea", "lit", "design", "collect", "writing", "review"];
export const STAGE_EMOJI: Record<StageKey, string> = { idea: "💡", lit: "📖", design: "⚖", collect: "📊", writing: "✍", review: "🖥" };

export const TOOL_TO_STAGE: Record<ToolId, StageKey> = {
  idea: "idea", research: "lit", psych: "lit", analyse: "lit", design: "design", stats: "collect", qual: "collect",
  style: "writing", words: "writing", cite: "writing", chat: "writing", close: "review", slides: "review"
};
export const STAGE_FIRST_TOOL: Record<StageKey, ToolId> = { idea: "idea", lit: "research", design: "design", collect: "stats", writing: "cite", review: "slides" };

/** Sidebar order, as in v1. */
export const TOOLS_BY_STAGE: Record<StageKey, ToolId[]> = {
  idea: ["idea"],
  lit: ["research", "psych", "analyse"],
  design: ["design"],
  collect: ["stats", "qual"],
  writing: ["style", "words", "cite", "chat"],
  review: ["close", "slides"]
};

/** Tools with a real panel in phase 2; every other tool renders StubPanel. */
export const BUILT_IN_PHASE_2: ToolId[] = ["chat"];

export function isToolId(v: unknown): v is ToolId { return typeof v === "string" && Object.prototype.hasOwnProperty.call(TOOL_TO_STAGE, v); }
export function isStageKey(v: unknown): v is StageKey { return typeof v === "string" && (STAGE_ORDER as string[]).includes(v); }

export function nextStageTool(stage: StageKey): { stage: StageKey; tool: ToolId } | null {
  const next = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
  return next ? { stage: next, tool: STAGE_FIRST_TOOL[next] } : null;
}
export function prevStageTool(stage: StageKey): { stage: StageKey; tool: ToolId } | null {
  const i = STAGE_ORDER.indexOf(stage);
  const prev = i > 0 ? STAGE_ORDER[i - 1] : undefined;
  return prev ? { stage: prev, tool: STAGE_FIRST_TOOL[prev] } : null;
}

export function toolLabelKey(id: ToolId): string { return "tab_" + id; }
export function toolTitleKey(id: ToolId): string { return "tab_" + id + "_title"; }
export function canPopOut(id: ToolId): boolean { return id === "cite" || id === "research"; }
