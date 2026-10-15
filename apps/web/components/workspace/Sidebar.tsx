"use client";
import { useT, plain, plainText, splitEmoji } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { STAGE_EMOJI, STAGE_ORDER, TOOLS_BY_STAGE, toolLabelKey, toolTitleKey, type StageKey, type ToolId } from "@/lib/tools";
import { useWorkspace } from "./WorkspaceContext";

function TabLabel({ label }: { label: string }) {
  const { emoji, text } = splitEmoji(plain(label));
  return <><span className="em" aria-hidden="true">{emoji}</span><span className="lbl">{text}</span></>;
}

/** The tool list. In the phone drawer it is always full width (no rail, no collapse button) and `onPick` closes the drawer before a tool or dialog opens. */
export function Sidebar({ inDrawer = false, onPick }: { inDrawer?: boolean; onPick?: () => void }) {
  const t = useT();
  const { update } = useSettings();
  const ws = useWorkspace();
  const { activeTool, stageGroupsCollapsed, currentStage } = ws;
  const sidebarCollapsed = inDrawer ? false : ws.sidebarCollapsed;
  const showTool = (id: ToolId) => { onPick?.(); ws.showTool(id); };
  const openSaveAs = (mode: "new" | "existing") => { onPick?.(); ws.openSaveAs(mode); };
  const openProjects = () => { onPick?.(); ws.openProjects(); };

  const toggleSidebar = () => { void update({ sidebarCollapsed: !sidebarCollapsed }); };
  const toggleGroup = (stage: StageKey) => {
    // In rail mode every group's tools are hidden, so a click here is a request to see this stage: expand the rail and open the group (v1).
    if (sidebarCollapsed) {
      void update({ sidebarCollapsed: false, stageGroupsCollapsed: stageGroupsCollapsed.filter((s) => s !== stage) });
      return;
    }
    void update({ stageGroupsCollapsed: stageGroupsCollapsed.includes(stage) ? stageGroupsCollapsed.filter((s) => s !== stage) : [...stageGroupsCollapsed, stage] });
  };

  return (
    <nav className={"sidebar" + (inDrawer ? " in-drawer" : "")} aria-label="Writing tools" data-testid={inDrawer ? "drawer-tools" : "sidebar"}>
      {!inDrawer && <button type="button" className="sb-toggle" aria-label="Collapse or expand the tool panel" title="Collapse the tool panel" aria-expanded={!sidebarCollapsed} data-testid="sidebar-toggle" onClick={toggleSidebar}>☰</button>}
      <div className="sb-pinned">
        <button type="button" className="tab new" aria-label={plainText(t("tab_new_project"))} title={t("tab_new_project_title")} data-testid="new-project-tab" onClick={() => openSaveAs("new")}><TabLabel label={t("tab_new_project")} /></button>
        <button type="button" className="tab" aria-label={plainText(t("tab_projects"))} title={t("tab_projects_title")} data-testid="projects-tab" onClick={openProjects}><TabLabel label={t("tab_projects")} /></button>
      </div>
      {STAGE_ORDER.map((stage) => {
        const closed = stageGroupsCollapsed.includes(stage);
        return (
          <div key={stage} className={"stage" + (currentStage === stage ? " current" : "") + (closed ? " closed" : "")} data-stage={stage} data-testid={"stage-" + stage}>
            <button type="button" className="stage-h" aria-expanded={!closed && !sidebarCollapsed} aria-label={t("stage_" + stage)} data-testid={"stage-h-" + stage} onClick={() => toggleGroup(stage)}>
              <span className="em" aria-hidden="true">{STAGE_EMOJI[stage]}</span>
              <span className="stage-name">{t("stage_" + stage)}</span>
              <span className="dot" aria-hidden="true" />
              <span className="chev" aria-hidden="true">{closed ? "▸" : "▾"}</span>
            </button>
            <div className="stage-tools">
              {TOOLS_BY_STAGE[stage].map((id) => (
                <button key={id} type="button" className={"tab" + (activeTool === id ? " active" : "")} aria-current={activeTool === id ? "true" : undefined} aria-label={plainText(t(toolLabelKey(id)))} data-tool={id} data-testid={"tool-" + id} title={plain(t(toolTitleKey(id)))} onClick={() => showTool(id)}>
                  <TabLabel label={t(toolLabelKey(id))} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
