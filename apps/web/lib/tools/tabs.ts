import type { StageKey, ToolId } from "@/lib/tools";

/*
 * The registry's tabs as plain data (Task G2), apart from the modules that draw them so that it imports nothing at run time: lib/frame/places
 * and a tool's own modules read it from here, since they may load while a tool module is still loading. The registry re-exports it.
 */

/** One tab of a place: its stage and id (the address `/p/<id>/<stage>/<tab>`), the module that draws it, and its two strings (frame strings, R3). */
export type ToolTab = { stage: StageKey; tab: string; tool: ToolId | "viva"; labelKey: string; nextKey: string };

/** A tab whose label is `tab_name_<tab>` and whose suggested next line is `<stage>_next_<tab>`. */
const tab = (stage: StageKey, id: string, tool: ToolTab["tool"]): ToolTab => ({ stage, tab: id, tool, labelKey: "tab_name_" + id, nextKey: stage + "_next_" + id });

/**
 * Every tool tab, in each place's order (the plan's ids, fixed: sessions A to E build against them). Writing's first tab, the document, is the
 * frame's and not a tool's, so it is not here (ruling R2: PLACE_TABS.writing prepends it). Tab to module as ruling R5 sets it.
 */
export const TOOL_TABS: ToolTab[] = [
  ...["overview", "pathway", "protocol", "ethics", "registration", "investigator", "budget", "aiuse"].map((id) => tab("design", id, "design")),
  tab("collect", "participants", "participants"),
  ...["data", "power", "charts", "check", "scales"].map((id) => tab("collect", id, "stats")),
  tab("collect", "coding", "qual"),
  tab("writing", "style", "style"),
  tab("writing", "words", "words"),
  tab("review", "closeness", "close"),
  tab("review", "viva", "viva"),
  tab("review", "slides", "slides")
];
