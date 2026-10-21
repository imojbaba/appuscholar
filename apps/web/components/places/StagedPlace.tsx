"use client";
import { useT } from "@/lib/i18n";
import type { StageKey } from "@/lib/tools";
import { TOOL_TABS, toolModule } from "@/lib/tools/registry";
import { PlaceHeader } from "@/components/frame/PlaceHeader";
import { useProject } from "@/components/frame/ProjectContext";
import { NotBuilt } from "./NotBuilt";

/**
 * A place whose tabs come from the tool registry (Task G2): Design and ethics, Collection and analysis and Review, and Writing's My style and
 * Words. The header with the stage's tabs, then the tab's Panel once its module is built, otherwise "Not built yet" in words, and last the tab's
 * suggested next line, drawn as Literature's is. A stage opened without a tab shows its first.
 */
export function StagedPlace({ stage, tab }: { stage: StageKey; tab: string | null }) {
  const t = useT();
  const { projectId } = useProject();
  const here = TOOL_TABS.find((x) => x.stage === stage && x.tab === tab) ?? TOOL_TABS.find((x) => x.stage === stage)!;
  const mod = toolModule(here.tool);
  return (
    <>
      <PlaceHeader stage={stage} tab={here.tab} />
      <div className="place-body" data-testid={"place-" + stage + "-" + here.tab}>
        {mod.built && mod.Panel ? <mod.Panel tab={here.tab} projectId={projectId ?? ""} /> : <NotBuilt docShown={stage === "writing"} />}
        <section className="place-next" aria-label={t("lit_suggested_next")} data-testid={stage + "-next"}><p>{t(here.nextKey)}</p></section>
      </div>
    </>
  );
}
