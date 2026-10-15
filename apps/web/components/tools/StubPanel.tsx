"use client";
import { plain, useT } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { toolLabelKey, toolTitleKey, type ToolId } from "@/lib/tools";

/** Stands in for every tool whose panel is built in a later task. */
export function StubPanel({ id }: { id: ToolId }) {
  const t = useT();
  const { pendingSearch } = useWorkspace();
  return (
    <div className="panel" data-testid={"panel-" + id}>
      <h3>{plain(t(toolLabelKey(id)))}</h3>
      <p className="desc">{plain(t(toolTitleKey(id)))}</p>
      <p className="note">This tool arrives in a later phase of the rebuild. Everything you write here is already saved under your project.</p>
      {id === "research" && pendingSearch && <p className="note" data-testid="pending-search">Search arrives in the next phase. Your selected text is kept: “{pendingSearch}”</p>}
    </div>
  );
}
