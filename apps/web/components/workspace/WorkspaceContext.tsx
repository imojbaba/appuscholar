"use client";
import { createContext, useContext } from "react";
import type { StageKey, ToolId } from "@/lib/tools";

/** Wire shapes of the API (dates arrive as ISO strings). */
export type Project = { id: string; title: string; field: string; stage: string; status: string; contentLang: string; kind: string };
export type DocumentSummary = { id: string; projectId: string; title: string; kind: string; currentSeq: number; wordCount: number; updatedAt: string };
export type DocumentWithBody = DocumentSummary & { bodyHtml: string };

export type WorkspaceValue = {
  activeTool: ToolId;
  showTool(id: ToolId): void;
  dock: "tools" | "ai";
  dockShow(which: "tools" | "ai"): void;
  aiWaiting: boolean;
  sidebarCollapsed: boolean;
  stageGroupsCollapsed: StageKey[];
  /** The active project's stage, or null in scratch space or once the project is complete. */
  currentStage: StageKey | null;
  project: Project | null;
  documents: DocumentSummary[];
  currentDoc: DocumentWithBody | null;
  selectDoc(id: string): Promise<void>;
  reloadDocs(): Promise<void>;
};

const Ctx = createContext<WorkspaceValue | null>(null);
export const WorkspaceProvider = Ctx.Provider;
export function useWorkspace(): WorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside <Workspace>");
  return v;
}
