"use client";
import { plain, useT } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { toolLabelKey, toolTitleKey, type ToolId } from "@/lib/tools";

/** Stands in for every tool whose panel is built in a later task. */
export function StubPanel({ id }: { id: ToolId }) {
  const t = useT();
  const { pendingAnalyse } = useWorkspace();
  return (
    <div className="panel" data-testid={"panel-" + id}>
      <h3>{plain(t(toolLabelKey(id)))}</h3>
      <p className="desc">{plain(t(toolTitleKey(id)))}</p>
      <p className="note">This tool arrives in a later phase of the rebuild. Everything you write here is already saved under your project.</p>
      {/* Until Task 12's Analyse a paper panel loads it (ruling R7): the paper Research's "Analyse this paper" kept. */}
      {id === "analyse" && pendingAnalyse && <p className="note" data-testid="pending-analyse">Abstract kept for Analyse a paper: “{pendingAnalyse.title}”</p>}
    </div>
  );
}
