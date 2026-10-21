import type React from "react";
import type { BlobKind } from "@/lib/blobs/kinds";
import type { ExportDeps } from "@/lib/export/projectExport";
import type { ToolId } from "@/lib/tools";
import { TOOL_TABS, type ToolTab } from "./tabs";
import * as design from "@/components/tools/design";
import * as stats from "@/components/tools/stats";
import * as qual from "@/components/tools/qual";
import * as style from "@/components/tools/style";
import * as words from "@/components/tools/words";
import * as close from "@/components/tools/close";
import * as slides from "@/components/tools/slides";
import * as viva from "@/components/tools/viva";

/*
 * The tool registry (Task G2; plan "Stages 3 to 6", rulings R2 to R5): the tabs of the stage 3 to 6 places and Writing's tool tabs, each naming
 * the module that draws it. The places, the home's built stages and BUILT_IN read it, so a tool session turns its tool on in its own module only.
 *
 * A module is `components/tools/<tool>/index.ts` and holds its ToolModule as named exports:
 *   export const built = true;                            // false until the session ships: each of its tabs reads "Not built yet"
 *   export { Panel } from "./Panel";                      // drawn for each of the module's tabs, told which one
 *   export function facts(b: StageBlobs): ToolFacts {}   // optional: the home's line for its stage (Task G3)
 *   export const exportParts: ExportPartDef[] = [];       // optional: its parts of the project export (Task G3)
 * The modules are imported statically below (the bundler sees every one; no path is built at run time), and each is checked against ToolModule.
 * Load order: this file reads every module's `built` as it loads (BUILT_IN), so no module may reach it while still loading. A Panel may import
 * the frame (placeHref, lib/tools, lib/frame/places: none of them imports this file), but a tool module imports the registry for types only
 * (`import type`). test/toolLoadOrder.test.ts loads such a module first, and fails on a tool file that imports this one for more than types.
 * Tool modules read TOOL_TABS from `@/lib/tools/tabs`, never from here.
 */

export { TOOL_TABS, type ToolTab };

/**
 * What the home knows of a stage from one module: a line for its row (none until there is something to say), and whether work has started.
 * `detail` is a message key, shown through t() with `vars` (Task G3: facts() has no t, and every string goes through it).
 */
export type ToolFacts = { detail?: string; vars?: Record<string, string | number>; started: boolean };
/** The stage's decrypted blobs, as ProjectHome reads them: each kind's opened value and when it was written. */
export type StageBlobs = Partial<Record<BlobKind, { value: unknown; updatedAt: string }>>;
/** One part of the project export a module adds (Task G3 lists it in the export dialog and puts its files in the zip). */
export type ExportPartDef = {
  part: string; labelKey: string; detailKey: string; formatKey: string; ticked: boolean;
  build(d: ExportDeps): Promise<Array<{ path: string; data: string | Blob }>>;
};
/** A tool's module, as `components/tools/<tool>/index.ts` exports it (see the header). */
export type ToolModule = {
  built: boolean;
  Panel?: (p: { tab: string; projectId: string }) => React.JSX.Element;
  facts?: (b: StageBlobs) => ToolFacts;
  exportParts?: ExportPartDef[];
};

const MODULES: Partial<Record<ToolTab["tool"], ToolModule>> = { design, stats, qual, style, words, close, slides, viva };
/** What a tool with no tab here has (the Idea and Literature tools and Chat, which are drawn by their own places, not by the registry). */
const NO_MODULE: ToolModule = { built: false };

/** The module that draws a tool's tabs. */
export function toolModule(tool: ToolTab["tool"]): ToolModule {
  return MODULES[tool] ?? NO_MODULE;
}

/**
 * Tools with a real panel: chat and the six stage-2 tools, then each stage 3 to 6 tool whose module is built (ruling
 * R5; the viva is not a ToolId and is not listed). The others are hidden until built (Task 10). Made here, after every module has loaded.
 */
export const BUILT_IN: ToolId[] = [
  "chat", "idea", "psych", "research", "analyse", "cite",
  ...new Set(TOOL_TABS.map((x) => x.tool).filter((x): x is ToolId => x !== "viva" && toolModule(x).built))
];
