import type { StageBlobs, ToolFacts } from "@/lib/tools/registry";
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
