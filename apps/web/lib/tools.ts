/** The v1 tool registry: the single source for tool ids, stage keys and stage order (labels come from the dictionary as t("stage_"+key)). */
export type ToolId = "idea" | "research" | "psych" | "analyse" | "design" | "stats" | "qual" | "style" | "words" | "cite" | "chat" | "close" | "slides";
export type StageKey = "idea" | "lit" | "design" | "collect" | "writing" | "review";

export const STAGE_ORDER: StageKey[] = ["idea", "lit", "design", "collect", "writing", "review"];

export const TOOL_TO_STAGE: Record<ToolId, StageKey> = {
  idea: "idea", research: "lit", psych: "lit", analyse: "lit", design: "design", stats: "collect", qual: "collect",
  style: "writing", words: "writing", cite: "writing", chat: "writing", close: "review", slides: "review"
};

/** Sidebar order, as in v1. */
export const TOOLS_BY_STAGE: Record<StageKey, ToolId[]> = {
  idea: ["idea"],
  lit: ["research", "psych", "analyse"],
  design: ["design"],
  collect: ["stats", "qual"],
  writing: ["style", "words", "cite", "chat"],
  review: ["close", "slides"]
};

// BUILT_IN (the tools with a real panel) is the tool registry's, lib/tools/registry.ts (Task G2): this module stays a leaf that imports nothing,
// so a tool's Panel may import it while that tool's module is still loading.

export function isToolId(v: unknown): v is ToolId { return typeof v === "string" && Object.prototype.hasOwnProperty.call(TOOL_TO_STAGE, v); }
export function isStageKey(v: unknown): v is StageKey { return typeof v === "string" && (STAGE_ORDER as string[]).includes(v); }

export function toolLabelKey(id: ToolId): string { return "tab_" + id; }
export function toolTitleKey(id: ToolId): string { return "tab_" + id + "_title"; }
