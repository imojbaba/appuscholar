"use client";
import { createContext, useContext } from "react";
import type { ProviderId } from "@appuscholar/core";
import type { StageKey, ToolId } from "@/lib/tools";

/** Wire shapes of the API (dates arrive as ISO strings). */
export type Project = { id: string; title: string; field: string; stage: string; status: string; contentLang: string; kind: string };
export type DocumentSummary = { id: string; projectId: string; title: string; kind: string; currentSeq: number; wordCount: number; createdAt: string; updatedAt: string };
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
  /** Shows another document of this project, after the open one's autosave has stored its text. When that save fails the student is asked "Switch anyway?"; false means they stayed on the open document. */
  selectDoc(id: string): Promise<boolean>;
  /** Un-deletes a document and shows it, whichever project is open now. False when the switch to it was declined. */
  restoreDocument(id: string, projectId: string): Promise<boolean>;
  reloadDocs(): Promise<void>;
  /** Applies a rename or a source/own change to the list and to the open document without touching its body. */
  patchDoc(id: string, patch: Partial<Pick<DocumentSummary, "title" | "kind">>): void;
  /** The open editor registers how to store its text now (null on unmount); selecting or deleting a document calls it first. */
  registerFlush(fn: (() => Promise<boolean>) | null): void;
  /** Stores the open document's pending text now: true when nothing is left unsaved. */
  flushOpen(): Promise<boolean>;
  /** The editor's live word count for the open document, or null until the editor has reported it. */
  wordCount: number | null;
  setWordCount(docId: string, words: number): void;
  /** Switch the active project (null = scratch space). Opening a project jumps to its stage's first tool unless it is complete or `skipJump`; `docId` is shown after the switch. */
  setActiveProject(id: string | null, opts?: { skipJump?: boolean; docId?: string }): Promise<boolean>;
  /** Re-reads the active project (stage, status) after a change made elsewhere. */
  reloadProject(): Promise<void>;
  /** The Help and AI Provider / Key dialogs (bodies arrive in Tasks 17 and 13), plus the project dialogs. */
  dialog: "help" | "settings" | "saveAs" | "projects" | "stageIntro" | "importOrigin" | null;
  /** Imports files as new documents (the Import button, a drop on the editor, a pasted file). Asks "Whose writing is this?" once unless every file is a PDF. */
  startImport(files: File[]): void;
  /** The names of the files waiting for the answer to "Whose writing is this?". */
  importNames: string[];
  /** The answer to the question: imports the waiting files, then shows the last one. */
  runImport(origin: "draft" | "source"): Promise<void>;
  openHelp(): void;
  /** Opens AI Provider / Key, with `provider` preselected in its select (default: the current provider). */
  openSettings(provider?: ProviderId): void;
  /** The provider the AI Provider / Key dialog opened on, or null for the current one. */
  settingsProvider: ProviderId | null;
  closeDialog(): void;
  /** Save as research project. `prefillName` pre-fills the name field (the Idea panel passes the first 80 characters of the idea). */
    openSaveAs(mode: "new" | "existing", prefillName?: string, opts?: { guessStage?: boolean }): void;
  /** `guessStage`: the project bar's button defaults the stage to the open tool's stage and shows v1's hint; every other entry point defaults to idea. */
  saveAsInit: { mode: "new" | "existing"; name: string; guessStage: boolean };
  openProjects(): void;
  /** The six-stage intro, shown after a new project is created; `introStage` is the new project's stage. */
  openStageIntro(stage: StageKey): void;
  introStage: StageKey;
};

const Ctx = createContext<WorkspaceValue | null>(null);
export const WorkspaceProvider = Ctx.Provider;
export function useWorkspace(): WorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside <Workspace>");
  return v;
}
