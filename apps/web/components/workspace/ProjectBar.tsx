"use client";
import { useT } from "@/lib/i18n";
import { isStageKey } from "@/lib/tools";
import { plural } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useWorkspace } from "./WorkspaceContext";

/** v1 project bar: the active project (or the scratch-space label), its stage, and the project actions. Opening a project is guided, not locked. */
export function ProjectBar() {
  const t = useT();
  const { project, currentDoc, openSaveAs, openProjects } = useWorkspace();
  // Phase 5 brings the real backup; until then the button explains where the work already is.
  const openBackup = () => toast("Backup arrives in a later phase. Your work is already saved on the server with every revision.");
  return (
    <div className="projbar" data-testid="project-bar">
      {project ? (
        <div className="label" data-testid="project-bar-label">
          <span>{project.title}</span>
          {isStageKey(project.stage) && <Badge variant="stage">{t("stage_" + project.stage)}</Badge>}
          {project.status === "complete" && <Badge variant="ok" data-testid="project-complete-badge">{t("project_complete_badge")}</Badge>}
        </div>
      ) : (
        <div className="label scratch" data-testid="project-bar-label">{t("project_bar_empty")}</div>
      )}
      <Button variant="primary" size="md" data-testid="new-project" onClick={() => openSaveAs("new")}>{t("project_bar_new")}</Button>
      <Button variant="ghost" size="md" data-testid="save-as-project" onClick={() => openSaveAs("new", "", { guessStage: true })}>{t("save_as_project_btn")}</Button>
      <Button variant="ghost" size="md" data-testid="projects-btn" onClick={openProjects}>{t("projects_btn")}</Button>
      <Button variant="ghost" size="md" title={t("backup_btn_title")} data-testid="backup-btn" onClick={openBackup}>{t("backup_btn")}</Button>
      {/* The count is the saved revision's; Task 8 swaps in the editor's live count. */}
      {currentDoc && <span className="status" data-testid="project-bar-status">{currentDoc.title} · {plural(currentDoc.wordCount, "word", "words")}</span>}
    </div>
  );
}
