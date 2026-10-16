"use client";
import { useT } from "@/lib/i18n";
import { STAGE_ORDER, TOOL_TO_STAGE, nextStageTool, prevStageTool } from "@/lib/tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "./WorkspaceContext";

export function StageGuide() {
  const t = useT();
  const { activeTool, showTool } = useWorkspace();
  const stage = TOOL_TO_STAGE[activeTool];
  const prev = prevStageTool(stage);
  const next = nextStageTool(stage);
  return (
    <nav className="guide" aria-label="Stage guide">
      <div className="road" aria-hidden="true">
        {STAGE_ORDER.map((s) => <span key={s} className={s === stage ? "now" : ""} />)}
      </div>
      <div className="row">
        <Badge variant="dashed" className="h-6" data-testid="stage-counter">{t("stage_guide_fmt", { n: STAGE_ORDER.indexOf(stage) + 1, total: STAGE_ORDER.length })} · <b>{t("stage_" + stage)}</b></Badge>
        <div className="nav">
          {prev && <Button variant="ghost" className="btn" data-testid="stage-back" onClick={() => showTool(prev.tool)}>← {t("stage_guide_back")} {t("stage_" + prev.stage)}</Button>}
          {next ? <Button variant="ghost" className="btn" data-testid="stage-next" onClick={() => showTool(next.tool)}>{t("stage_guide_next")} {t("stage_" + next.stage)} →</Button>
            : <span className="final" data-testid="stage-final">{t("stage_guide_final")}</span>}
        </div>
      </div>
    </nav>
  );
}
