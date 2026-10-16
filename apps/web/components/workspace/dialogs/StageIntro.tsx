"use client";
import { useT } from "@/lib/i18n";
import { STAGE_EMOJI, STAGE_FIRST_TOOL, STAGE_ORDER } from "@/lib/tools";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "../WorkspaceContext";

/** v1 `stageIntroShow`: the six-stage road map, shown after a new project is created. The button jumps to the stage's first tool; "Got it" just closes. */
export function StageIntro() {
  const t = useT();
  const { dialog, introStage, showTool, closeDialog } = useWorkspace();
  return (
    <Dialog open={dialog === "stageIntro"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-w-xl" data-testid="stage-intro">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("stageintro_h2")}</DialogTitle>
          <DialogDescription>{t("stageintro_desc")}</DialogDescription>
        </DialogHeader>
        <ol className="stages">
          {STAGE_ORDER.map((k, i) => (
            <li key={k} className={k === introStage ? "now" : ""} data-testid={"intro-stage-" + k}>
              <span className="n">{i + 1}</span>
              <span className="t"><span className="em" aria-hidden="true">{STAGE_EMOJI[k]}</span> {t("stage_" + k)}</span>
              <span className="d">{t("stageintro_desc_" + k)}</span>
            </li>
          ))}
        </ol>
        <DialogFooter>
          <Button variant="primary" data-testid="stage-intro-start" onClick={() => { showTool(STAGE_FIRST_TOOL[introStage]); closeDialog(); }}>{t("stageintro_start_fmt", { stage: t("stage_" + introStage) })}</Button>
          <Button variant="ghost" data-testid="stage-intro-gotit" onClick={closeDialog}>{t("stageintro_gotit_btn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
