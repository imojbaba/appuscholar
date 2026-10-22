import type { ExportPartDef, StageBlobs, ToolFacts } from "@/lib/tools/registry";
import { designDashboard, type DesignKey } from "@appuscholar/core";

/** Design and ethics (v1 `design`): the eight tabs of the Design and ethics place. A tab not built yet reads "Not built yet" (Panel.tsx dispatches by tab). */
export const built = true;
export { Panel } from "./Panel";

const KEYS: readonly DesignKey[] = ["reg", "proto", "ec", "ctri", "pi", "budget"];

/** The home's line for the stage (Task G3): started once any design blob exists; "{done} of {total} ready" from designDashboard over the blobs' done flags. */
export function facts(b: StageBlobs): ToolFacts {
  const done: Partial<Record<DesignKey, boolean>> = {};
  for (const k of KEYS) done[k] = !!(b[("design_" + k) as `design_${DesignKey}`]?.value as { done?: unknown } | null | undefined)?.done;
  const d = designDashboard(done);
  return { started: KEYS.some((k) => b[("design_" + k) as `design_${DesignKey}`] !== undefined), detail: "design_home_ready", vars: { done: d.done, total: d.total } };
}

/**
 * The three files the Registration, Investigator and Budget tabs download also join the project export, under design/ (D-S2-55). Their code is loaded
 * when the export is built, not with the module.
 */
export const exportParts: ExportPartDef[] = [{
  part: "design", labelKey: "design_exp_label", detailKey: "design_exp_detail", formatKey: "exp_format_text", ticked: true,
  build: async (d) => (await import("@/lib/tools/design/exportPart")).designFiles(d)
}];
