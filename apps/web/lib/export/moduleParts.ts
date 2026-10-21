import { TOOL_TABS, toolModule, type ExportPartDef } from "@/lib/tools/registry";
import { EXPORT_PARTS, type ExportPart } from "./projectExport";

/*
 * The project export's parts that tool modules declare (Task G3, ruling R7). Apart from lib/export/projectExport, which a tool's own export
 * build may import: that module never reads the registry, so a tool module loading first never reaches a registry that is still loading.
 */

/** The export parts of the built tool modules, each module once in the registry's tab order, each module's parts in its own order. Read when asked, never while the modules load. */
export function moduleExportParts(): ExportPartDef[] {
  return [...new Set(TOOL_TABS.map((x) => x.tool))].flatMap((tool) => {
    const m = toolModule(tool);
    return m.built ? (m.exportParts ?? []) : [];
  });
}

/** What the export dialog lists, in its order: the built-in parts, then the built modules' parts. */
export function exportPartList(): Array<ExportPart | ExportPartDef> {
  return [...EXPORT_PARTS, ...moduleExportParts()];
}
