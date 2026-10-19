"use client";
import { createContext, useContext } from "react";
import type { ProviderId } from "@appuscholar/core";
import type { StageKey, ToolId } from "@/lib/tools";
import type { WrappedDek } from "@/lib/vault/useVault";

/** Wire shapes of the API (dates arrive as ISO strings). */
export type Project = { id: string; title: string; field: string; stage: string; status: string; contentLang: string; kind: string };
export type DocumentSummary = { id: string; projectId: string; title: string; kind: string; currentSeq: number; wordCount: number; createdAt: string; updatedAt: string };
/**
 * `bodyHtml` is the text the editor opens with: decrypted on load when `keyVersion` is 1 or more. `unreadable` is set when it could not be:
 * "locked" (the unlock was cancelled) or "broken" (its key is missing or the ciphertext does not open); the body is then empty and no editor opens.
 */
export type DocumentWithBody = DocumentSummary & { bodyHtml: string; keyVersion: number; deks: WrappedDek[]; unreadable?: "locked" | "broken" };

export type WorkspaceValue = {
  activeTool: ToolId;
  showTool(id: ToolId): void;
  /** The text the selection bubble's Find papers kept for the Research tool (up to 200 characters), or null. */
  pendingSearch: string | null;
  setPendingSearch(text: string | null): void;
  dock: "tools" | "ai";
  dockShow(which: "tools" | "ai"): void;
  aiWaiting: boolean;
  /** Raised by the suggestion provider while a result waits; showing the AI tab lowers it. */
  setAiWaiting(on: boolean): void;
  /** The icon rail: the student's choice, or (until they make one) the default of the two-column layout between 701 and 1099px. */
  sidebarCollapsed: boolean;
  /** At most 700px wide: the sidebar lives in a drawer and the dock is the bottom sheet. */
  phone: boolean;
  /** The tool drawer of the phone layout (opened from the header's menu button). */
  drawerOpen: boolean;
  setDrawerOpen(open: boolean): void;
  stageGroupsCollapsed: StageKey[];
  /** The active project's stage, or null in scratch space or once the project is complete. */
  currentStage: StageKey | null;
  project: Project | null;
  /**
   * The project the workspace has loaded: the open project's id, the scratch project's in scratch space; null until the first load has
   * answered (while `project` is still null for a student whose active project is loading). Stage blobs shared across the workspace key on it.
   */
  projectId: string | null;
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
  /** The one dialog open now: Help, Terms (read-only), Welcome, AI Provider / Key, and the project dialogs. */
  dialog: "help" | "terms" | "welcome" | "settings" | "saveAs" | "projects" | "stageIntro" | "importOrigin" | "myWriting" | "importV1" | null;
  /** Imports files as new documents (the Import button, a drop on the editor, a pasted file). Asks "Whose writing is this?" once unless every file is a PDF. */
  startImport(files: File[]): void;
  /** The names of the files waiting for the answer to "Whose writing is this?". */
  importNames: string[];
  /** The answer to the question: imports the waiting files, then shows the last one. */
  runImport(origin: "draft" | "source"): Promise<void>;
  openHelp(): void;
  /** The v1 backup import dialog (from Help, or /import). */
  openImportV1(): void;
  /** The Terms read-only (from Help and the AI Provider / Key dialog). The first-use gate is not a dialog state: it applies whenever the account has not accepted the current terms. */
  openTerms(): void;
  /** The welcome tour (first run, and Help's replay button). */
  openWelcome(): void;
  /** The "My writing" dialog (the % yours badge opens it). */
  openMyWriting(): void;
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
