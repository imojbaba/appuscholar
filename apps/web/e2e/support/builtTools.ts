import path from "node:path";
import { readFileSync } from "node:fs";
import { TOOL_TABS } from "../../lib/tools/tabs";

/**
 * Whether a tool module ships built, read from its source as the registry reads its export (`export const built = true`), so a spec that checks
 * "Not built yet" checks it only where it is still true: a tool session turning its module on never breaks another session's e2e.
 */
export function toolBuilt(tool: string): boolean {
  const src = readFileSync(path.join(__dirname, `../../components/tools/${tool}/index.ts`), "utf8");
  return /export const built\s*=\s*true\b/.test(src);
}

/** A place's tab is built when the module that draws it is. */
export function tabBuilt(stage: string, tab: string): boolean {
  const t = TOOL_TABS.find((x) => x.stage === stage && x.tab === tab);
  return t !== undefined && toolBuilt(t.tool);
}

/** A stage counts as built when any of its modules is (ruling R5). */
export function stageBuilt(stage: string): boolean {
  return TOOL_TABS.some((x) => x.stage === stage && toolBuilt(x.tool));
}
