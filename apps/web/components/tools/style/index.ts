import type { StageBlobs, ToolFacts } from "@/lib/tools/registry";

/**
 * My writing style (v1 `style`): Writing's My style tab. Built: the Panel draws it and the DocumentLayer keeps what Continue, Improve and Extend read of
 * it. Light on purpose (lib/tools/registry.ts loads every module with the page): mammoth and pdf.js are imported only when a file of their kind is read.
 */
export const built = true;
export { Panel } from "./Panel";
export { DocumentLayer } from "./DocumentLayer";

/** The home's line for Writing: how many samples the style has learned from. Nothing to say until it has one. */
export function facts(b: StageBlobs): ToolFacts {
  const samples = b.style_samples?.value;
  const n = Array.isArray(samples) ? samples.length : 0;
  const profile = b.style_profile?.value as { profile?: unknown } | undefined;
  const started = n > 0 || (typeof profile?.profile === "string" && profile.profile.trim() !== "");
  if (n === 0) return { started };
  return n === 1 ? { detail: "sty2_fact_one", started } : { detail: "sty2_fact_n", vars: { n }, started };
}
