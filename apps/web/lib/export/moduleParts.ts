import { TOOL_TABS, toolModule, type ExportPartDef } from "@/lib/tools/registry";
import { EXPORT_PARTS, type ExportPart } from "./projectExport";

/*
 * The project export's parts that tool modules declare (Task G3, ruling R7). Apart from lib/export/projectExport, which a tool's own export
 * build may import: that module never reads the registry, so a tool module loading first never reaches a registry that is still loading.
 */

/**
 * The export parts of the built tool modules, each module once in the registry's tab order, each module's parts in its own order. Read when
 * asked, never while the modules load. A part id that is a built-in part's or another module part's would share its tick: it throws.
 */
export function moduleExportParts(): ExportPartDef[] {
  const parts = [...new Set(TOOL_TABS.map((x) => x.tool))].flatMap((tool) => {
    const m = toolModule(tool);
    return m.built ? (m.exportParts ?? []) : [];
  });
  const seen = new Set<string>(EXPORT_PARTS);
  for (const p of parts) {
    if (seen.has(p.part)) throw new Error(`Export part id "${p.part}" is already taken (a built-in part's or another module's).`);
    seen.add(p.part);
  }
  return parts;
}

/** What the export dialog lists, in its order: the built-in parts, then the built modules' parts. */
export function exportPartList(): Array<ExportPart | ExportPartDef> {
  return [...EXPORT_PARTS, ...moduleExportParts()];
}
