"use client";
import { useState } from "react";
import { plain, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** v1 intake form. State is local in this phase (v2 stores it per project later); the two buttons are wired in later tasks. */
export function IdeaPanel() {
  const t = useT();
  const [topic, setTopic] = useState("");
  const [resources, setResources] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [constraints, setConstraints] = useState("");
  const later = () => toast("Idea & Feasibility arrives in the next phase.");
  return (
    <div className="panel" data-testid="panel-idea">
      <h3>{plain(t("tab_idea"))}</h3>
      <p className="desc">{t("idea_panel_desc")}</p>
      <div className="field">
        <label htmlFor="ideaTopic">{t("idea_topic_label")}</label>
        <textarea className="input" id="ideaTopic" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("idea_topic_placeholder")} />
      </div>
      <div className="field">
        <label htmlFor="ideaRes">{t("idea_resources_label")}</label>
        <textarea className="input" id="ideaRes" rows={3} value={resources} onChange={(e) => setResources(e.target.value)} placeholder={t("idea_resources_placeholder")} />
      </div>
      <div className="field">
        <label htmlFor="ideaTime">{t("idea_timeframe_label")}</label>
        <input className="input" id="ideaTime" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder={t("idea_timeframe_placeholder")} />
      </div>
      <div className="field">
        <label htmlFor="ideaCons">{t("idea_constraints_label")}</label>
        <textarea className="input" id="ideaCons" rows={2} value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder={t("idea_constraints_placeholder")} />
      </div>
      <div className="stack">
        <Button variant="primary" className="w-full" data-testid="idea-assess" onClick={later}>{t("idea_assess_btn")}</Button>
        <Button variant="ghost" className="w-full" data-testid="idea-save-project" onClick={later}>{t("idea_saveproject_btn")}</Button>
      </div>
      <p className="note">{t("idea_panel_note")}</p>
    </div>
  );
}
