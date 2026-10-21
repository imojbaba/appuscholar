import type { StageBlobs, ToolFacts } from "@/lib/tools/registry";

/**
 * Qualitative coding (v1 `qual`): Collection and analysis' Coding tab. Task C1 builds the code tree; tagging, the colours in the document, the passages
 * and the export come in the tasks after it (the module's shape is in lib/tools/registry.ts; this file stays light and imports the registry for types only).
 */
export const built = true;
export { Panel } from "./Panel";

/** The home's line for the stage: how many codes there are (none until there is one). */
export function facts(b: StageBlobs): ToolFacts {
  const v = b.qual_codes?.value;
  const n = Array.isArray(v) ? v.length : 0;
  return n > 0 ? { started: true, detail: "qual_facts_codes", vars: { n } } : { started: false };
}
