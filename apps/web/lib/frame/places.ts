import { isStageKey, type StageKey } from "@/lib/tools";

/**
 * The places of a project (draft §5): each stage is a place at `/p/<id>/<stage>`, and a stage with tabs has one address per tab. Literature's
 * four tabs are the only ones; the first is where the place opens.
 */
export const PLACE_TABS: Record<StageKey, readonly string[]> = { idea: [], lit: ["find", "reading", "compare", "citations"], design: [], collect: [], writing: [], review: [] };

/** A place as the shell knows it: the stage, and its tab (null for a stage without tabs). */
export type Place = { stage: StageKey; tab: string | null };

export function homeHref(id: string): string { return `/p/${id}`; }
export function placeHref(id: string, stage: StageKey, tab?: string): string { return `/p/${id}/${stage}` + (tab ? `/${tab}` : ""); }

/**
 * The place an address names: `stage` is the segment after the project, `rest` the segments after it. A stage outside STAGE_ORDER, or a tab
 * outside its PLACE_TABS (any segment at all for a stage without tabs), is null and the page answers not found. A stage with tabs and none given
 * takes its first tab; what follows the tab is `rest` (a later reader names its paper there).
 */
export function parsePlace(stage: string, rest: string[] | undefined): { stage: StageKey; tab: string | null; rest: string[] } | null {
  if (!isStageKey(stage)) return null;
  const tabs = PLACE_TABS[stage];
  const segs = rest ?? [];
  if (tabs.length === 0) return segs.length === 0 ? { stage, tab: null, rest: [] } : null;
  const tab = segs[0] ?? tabs[0]!;
  return tabs.includes(tab) ? { stage, tab, rest: segs.slice(1) } : null;
}
