import type { StageBlobs, ToolFacts } from "@/lib/tools/registry";

/**
 * Qualitative coding (v1 `qual`): Collection and analysis' Coding tab. Task C1 builds the code tree; C2 adds tagging, the colours in the document (DocumentLayer),
 * the passages and the delete that takes a code's tags out of every document; C3 adds the export (the Panel's button, and `exportParts`, its part of the project export).
 * The module's shape is in lib/tools/registry.ts; this file stays light and imports the registry for types only.
 */
export const built = true;
export { Panel } from "./Panel";
export { DocumentLayer } from "./DocumentLayer";
export { exportParts } from "@/lib/tools/qual/exportPart";

/** The home's line for the stage: how many codes there are (none until there is one; "1 code" for one). */
export function facts(b: StageBlobs): ToolFacts {
  const v = b.qual_codes?.value;
  const n = Array.isArray(v) ? v.length : 0;
  return n > 0 ? { started: true, detail: n === 1 ? "qual_facts_code_one" : "qual_facts_codes", vars: { n } } : { started: false };
}
