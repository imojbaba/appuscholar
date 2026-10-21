"use client";
import { createContext, useContext } from "react";
import type { ProviderId } from "@appuscholar/core";
import type { ExportPart } from "@/lib/export/projectExport";
import type { Place } from "@/lib/frame/places";
import type { WrappedDek } from "@/lib/vault/useVault";

/**
 * Wire shapes of the API (dates arrive as ISO strings). `title` is ciphertext when `titleKeyVersion` is 1 or more: it is shown through
 * useTitle (lib/vault/titles), never as it is.
 */
export type Project = { id: string; title: string; titleKeyVersion: number; deks: WrappedDek[]; field: string; stage: string; status: string; contentLang: string; kind: string };
export type DocumentSummary = { id: string; projectId: string; title: string; titleKeyVersion: number; deks: WrappedDek[]; kind: string; currentSeq: number; wordCount: number; createdAt: string; updatedAt: string };
/**
 * `bodyHtml` is the text the editor opens with: decrypted on load when `keyVersion` is 1 or more. `unreadable` is set when it could not be:
 * "locked" (the unlock was cancelled) or "broken" (its key is missing or the ciphertext does not open); the body is then empty and no editor opens.
 */
export type DocumentWithBody = DocumentSummary & { bodyHtml: string; keyVersion: number; deks: WrappedDek[]; unreadable?: "locked" | "broken" };

/** v1's apLoad(title, [head+ab], 'abstract', false) (8412): the title, the pages (one: the head and the abstract) and the source kind, for apBuild(title, pages, "abstract"). */
export type PendingAnalyse = { title: string; pages: string[]; src: "abstract" };

export type ProjectValue = {
  /** The place the address names (`/p/<id>/<stage>/<tab>`), or null on the project's home and outside a project. */
  place: Place | null;
  /**
   * Goes to an address of the app (a place, the home, the list); the project, its documents and the open editor stay mounted within a project.
   * An address outside the project stores the open document's text first, as a switch does (a failed save asks "Switch anyway?"; false means
   * the student stayed).
   */
  go(href: string): Promise<boolean>;
  /**
   * Opens a project (null = the scratch space): the open document's text is stored first (a failed save asks "Switch anyway?"; false means
   * the student stayed), the project is recorded as active (PATCH /me/active-project), then its home opens (the scratch space's writing place).
   * `docId` is shown once it has loaded. Opening the project already open re-reads it and its documents.
   */
  openProject(id: string | null, opts?: { docId?: string }): Promise<boolean>;
  /** The text the selection bubble's Find papers kept for the Research tool (up to 200 characters), or null. */
  pendingSearch: string | null;
  setPendingSearch(text: string | null): void;
  /** The paper Research's "📄 Analyse this paper" kept for Analyse a paper (v1 rsAnalyse 8407-8419), or null; Task 12's intake loads it abstract-only. */
  pendingAnalyse: PendingAnalyse | null;
  setPendingAnalyse(v: PendingAnalyse | null): void;
  /** "ai" shows the AI pane beside the document; "tools" does nothing (the dock is gone; Task 11 removes this). */
  dockShow(which: "tools" | "ai"): void;
  aiWaiting: boolean;
  /** Raised by the suggestion provider while a result waits; showing the AI pane lowers it. */
  setAiWaiting(on: boolean): void;
  project: Project | null;
  /**
   * The project the shell has loaded: the open project's id, the scratch project's in scratch space; null outside a project (first run, the
   * list) and until the first load has answered. Stage blobs shared across the project key on it.
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
  patchDoc(id: string, patch: Partial<Pick<DocumentSummary, "title" | "titleKeyVersion" | "kind">>): void;
  /** The open editor registers how to store its text now (null on unmount); selecting or deleting a document calls it first. */
  registerFlush(fn: (() => Promise<boolean>) | null): void;
  /** Stores the open document's pending text now: true when nothing is left unsaved. */
  flushOpen(): Promise<boolean>;
  /** The editor's live word count for the open document, or null until the editor has reported it. */
  wordCount: number | null;
  setWordCount(docId: string, words: number): void;
  /** Re-reads the open project (status, language) after a change made elsewhere. */
  reloadProject(): Promise<void>;
  /** The one dialog open now: Help, Terms (read-only), Welcome, AI Provider / Key, and the import dialogs. */
  dialog: "help" | "terms" | "welcome" | "settings" | "importOrigin" | "myWriting" | "importV1" | null;
  /** Imports files as new documents (the Import button, a drop on the editor, a pasted file). Asks "Whose writing is this?" once unless every file is a PDF. */
  startImport(files: File[]): void;
  /** The names of the files waiting for the answer to "Whose writing is this?". */
  importNames: string[];
  /** The answer to the question: imports the waiting files, then shows the last one. */
  runImport(origin: "draft" | "source"): Promise<void>;
  openHelp(): void;
  /** The v1 backup import dialog (from Help, or /projects?import=1). */
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
  /**
   * Opens the project's export place (wave B Task 12): with `preselect`, only that part is ticked (a tool's Export link, W11); without it, every
   * part but the reading list backup (the home's Export project, the account menu).
   */
  openExport(preselect?: ExportPart): void;
};

const Ctx = createContext<ProjectValue | null>(null);
export const ProjectProvider = Ctx.Provider;
export function useProject(): ProjectValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProject must be used inside <ProjectShell>");
  return v;
}
