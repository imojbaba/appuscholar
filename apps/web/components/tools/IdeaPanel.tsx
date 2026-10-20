"use client";
import { fieldLabel } from "@appuscholar/core";
import { plain, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { assessIdea } from "@/lib/ai/actions";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { IdeaIntake } from "@/lib/blobs/kinds";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { PanelLoading } from "./PanelLoading";

const EMPTY: IdeaIntake = { topic: "", resources: "", timeframe: "", constraints: "" };

/**
 * Idea & Feasibility (v1 708-724, ideaLoad / ideaSave / ideaAssess / ideaSaveAsProject 8559-8590). The four fields are the open project's
 * idea_intake blob (the scratch project's in scratch space), saved as typed; Assess hands them to assessIdea; Save opens Save-as-project.
 */
export function IdeaPanel() {
  const t = useT();
  const { project, openSaveAs, dockShow } = useWorkspace();
  const { me, settings } = useSettings();
  const suggestion = useSuggestion();
  const callAI = useCallAI();
  const projectId = project?.id ?? me?.scratchProjectId ?? null;
  const { value, loading, locked, set } = useProjectBlob("idea_intake", projectId);
  const intake = value ?? EMPTY;
  // Until the stored intake is known there is nothing to show or to edit (and no project id at all before /me answers).
  const waiting = loading || projectId === null;
  // W8: while the saved intake is read and opened the four boxes give way to the loading sign (a locked vault says so in its own sentence).
  const opening = loading && !locked;
  // An update, not a replace: typed before the read lands, it is applied on top of the stored intake.
  const edit = (key: keyof IdeaIntake) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const v = e.target.value;
    set((prev) => ({ ...(prev ?? EMPTY), [key]: v }));
  };
  const assess = () => assessIdea({
    callAI, setThinking: suggestion.setThinking, isCurrent: suggestion.isCurrent, set: suggestion.set, clear: suggestion.clear,
    dockShow, toast, t, field: fieldLabel(settings.field), intake
  });
  return (
    <div className="panel" data-testid="panel-idea">
      <h3>{plain(t("tab_idea"))}</h3>
      <p className="desc">{t("idea_panel_desc")}</p>
      {locked && <p className="note" role="status" data-testid="idea-locked">{t("vault_idea_locked")}</p>}
      {opening ? <PanelLoading /> : (
        <>
          <div className="field">
            <label htmlFor="ideaTopic">{t("idea_topic_label")}</label>
            <textarea className="input" id="ideaTopic" rows={3} value={intake.topic} disabled={waiting} onChange={edit("topic")} placeholder={t("idea_topic_placeholder")} />
          </div>
          <div className="field">
            <label htmlFor="ideaRes">{t("idea_resources_label")}</label>
            <textarea className="input" id="ideaRes" rows={3} value={intake.resources} disabled={waiting} onChange={edit("resources")} placeholder={t("idea_resources_placeholder")} />
          </div>
          <div className="field">
            <label htmlFor="ideaTime">{t("idea_timeframe_label")}</label>
            <input className="input" id="ideaTime" value={intake.timeframe} disabled={waiting} onChange={edit("timeframe")} placeholder={t("idea_timeframe_placeholder")} />
          </div>
          <div className="field">
            <label htmlFor="ideaCons">{t("idea_constraints_label")}</label>
            <textarea className="input" id="ideaCons" rows={2} value={intake.constraints} disabled={waiting} onChange={edit("constraints")} placeholder={t("idea_constraints_placeholder")} />
          </div>
        </>
      )}
      <div className="stack">
        <Button variant="primary" className="w-full" data-testid="idea-assess" disabled={waiting} onClick={() => void assess()}>{t("idea_assess_btn")}</Button>
        <Button variant="ghost" className="w-full" data-testid="idea-save-project" onClick={() => openSaveAs("new", intake.topic.trim().slice(0, 80))}>{t("idea_saveproject_btn")}</Button>
      </div>
      <p className="note">{t("idea_panel_note")}</p>
    </div>
  );
}
