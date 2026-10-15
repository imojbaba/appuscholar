"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProviderId } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useSettings, type Settings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { isImportable } from "@/lib/import/parse";
import { allPdf, importFiles } from "@/lib/import/run";
import { STAGE_FIRST_TOOL, TOOL_TO_STAGE, isStageKey, isToolId, type StageKey, type ToolId } from "@/lib/tools";
import { DocumentCard } from "@/components/document/DocumentCard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Dock } from "./Dock";
import { ProjectBar } from "./ProjectBar";
import { SaveAsProject } from "./dialogs/SaveAsProject";
import { Projects } from "./dialogs/Projects";
import { StageIntro } from "./dialogs/StageIntro";
import { ImportOrigin } from "./dialogs/ImportOrigin";
import { ChromeDialogs, Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Subbar } from "./Subbar";
import { WorkspaceProvider, type DocumentSummary, type DocumentWithBody, type Project, type WorkspaceValue } from "./WorkspaceContext";

const BUSY = "Another import is still running. Wait for it to finish.";

type Loaded = { project: Project | null; projectId: string; documents: DocumentSummary[]; doc: DocumentWithBody | null };

async function listOrSeed(projectId: string): Promise<DocumentSummary[]> {
  const list = await apiFetch<DocumentSummary[]>(`/projects/${projectId}/documents`);
  if (list.length) return list;
  // A project always has a document to write in (v1 always had one).
  const made = await apiFetch<DocumentWithBody>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title: "My first document" }) });
  return [made];
}

/** Creation order, as v1 listed documents (the API answers most recently updated first). */
function byCreated(list: DocumentSummary[]): DocumentSummary[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function Workspace() {
  const t = useT();
  const { me, settings, update, reload } = useSettings();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [currentDoc, setCurrentDoc] = useState<DocumentWithBody | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("idea");
  const [dock, setDock] = useState<"tools" | "ai">("tools");
  const [dialog, setDialog] = useState<WorkspaceValue["dialog"]>(null);
  const [settingsProvider, setSettingsProvider] = useState<ProviderId | null>(null);
  const [saveAsInit, setSaveAsInit] = useState<WorkspaceValue["saveAsInit"]>({ mode: "new", name: "", guessStage: false });
  const [importWaiting, setImportWaiting] = useState<File[]>([]);
  const importing = useRef(false);
  const [introStage, setIntroStage] = useState<StageKey>("idea");
  const [aiWaiting] = useState(false); // Task 14 raises this when an AI suggestion is waiting.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { projectIdRef.current = projectId; currentDocRef.current = currentDoc; }, [projectId, currentDoc]);
  const docToken = useRef(0);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  // The latest project and open document, for callbacks that outlive a render (the Undo of a deletion, ten seconds later).
  const projectIdRef = useRef<string | null>(null);
  const currentDocRef = useRef<DocumentWithBody | null>(null);
  // Set while the "Switch anyway?" question is open; answering it resolves the switch that asked.
  const [switchAsk, setSwitchAsk] = useState<{ title: string; answer: (yes: boolean) => void } | null>(null);
  const [live, setLive] = useState<{ docId: string; words: number } | null>(null);
  // A document to show after the next project switch (the one that was just moved into the project).
  const pendingDoc = useRef<string | null>(null);
  // The remembered tool (or the project's stage tool) applies to the first load only; later switches keep the tool the student has open.
  const toolInit = useRef(false);
  // One load per project even when React runs the effect twice in development, so the first document is never created twice.
  const loading = useRef<{ key: string; p: Promise<Loaded> } | null>(null);

  const userId = me?.id;
  const activeProjectId = me?.activeProjectId ?? null;
  const scratchProjectId = me?.scratchProjectId;

  useEffect(() => {
    if (!userId || !scratchProjectId) return;
    const key = `${userId}:${activeProjectId}:${scratchProjectId}`;
    if (loading.current?.key !== key) {
      loading.current = {
        key,
        p: (async (): Promise<Loaded> => {
          let proj: Project | null = null;
          if (activeProjectId) proj = (await apiFetch<Project[]>("/projects")).find((x) => x.id === activeProjectId) ?? null;
          const pid = proj ? proj.id : scratchProjectId;
          const docs = await listOrSeed(pid);
          const first = docs[0];
          const want = pendingDoc.current; pendingDoc.current = null;
          const pick = docs.find((d) => d.id === want) ?? first;
          const doc = pick ? await apiFetch<DocumentWithBody>(`/documents/${pick.id}`) : null;
          return { project: proj, projectId: pid, documents: docs, doc };
        })()
      };
    }
    let live = true;
    loading.current.p.then((r) => {
      if (!live) return;
      setProject(r.project);
      setProjectId(r.projectId);
      setDocuments(byCreated(r.documents));
      setCurrentDoc(r.doc);
      if (!toolInit.current) {
        toolInit.current = true;
        const remembered = settingsRef.current.toolTab;
        setActiveTool(isToolId(remembered) ? remembered : r.project && isStageKey(r.project.stage) ? STAGE_FIRST_TOOL[r.project.stage] : "idea");
      }
      setReady(true);
    }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, [userId, activeProjectId, scratchProjectId]);

  const collapsed = useMemo(() => (settings.stageGroupsCollapsed ?? []).filter(isStageKey) as StageKey[], [settings.stageGroupsCollapsed]);
  const sidebarCollapsed = settings.sidebarCollapsed ?? false;

  const showTool = useCallback((id: ToolId) => {
    setActiveTool(id);
    setDock("tools");
    const patch: Settings = { toolTab: id };
    // Opening a tool whose group was collapsed expands that one group (v1 showTool).
    const stage = TOOL_TO_STAGE[id];
    const open = (settingsRef.current.stageGroupsCollapsed ?? []);
    if (open.includes(stage)) patch.stageGroupsCollapsed = open.filter((s) => s !== stage);
    void update(patch);
  }, [update]);

  const registerFlush = useCallback((fn: (() => Promise<boolean>) | null) => { flushRef.current = fn; }, []);
  const setWordCount = useCallback((docId: string, words: number) => setLive((l) => (l && l.docId === docId && l.words === words ? l : { docId, words })), []);
  const patchDoc = useCallback((id: string, patch: Partial<Pick<DocumentSummary, "title" | "kind">>) => {
    setDocuments((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    // Only title and kind change here, never the body: a new body would restart the editor's autosave.
    setCurrentDoc((d) => (d && d.id === id ? { ...d, ...patch } : d));
  }, []);

  const flushOpen = useCallback(async () => (await flushRef.current?.()) ?? true, []);

  /** Resolves true to leave the open document: its text is stored, or the student chose to switch anyway after a failed save. */
  const confirmLeave = useCallback(async (): Promise<boolean> => {
    if (await flushOpen()) return true;
    return new Promise<boolean>((resolve) => {
      setSwitchAsk((prev) => { prev?.answer(false); return { title: currentDocRef.current?.title ?? "this document", answer: resolve }; });
    });
  }, [flushOpen]);

  /** Shows another document. False when the student stayed on the open one (its save failed and they chose Stay). */
  const selectDoc = useCallback(async (id: string): Promise<boolean> => {
    if (currentDocRef.current?.id === id) return true;
    if (!(await confirmLeave())) return false;
    const mine = ++docToken.current;
    const doc = await apiFetch<DocumentWithBody>(`/documents/${id}`);
    if (mine === docToken.current) setCurrentDoc(doc);
    return true;
  }, [confirmLeave]);

  const reloadDocs = useCallback(async () => {
    const pid = projectIdRef.current;
    if (!pid) return;
    const list = byCreated(await listOrSeed(pid));
    setDocuments(list);
    const open = currentDocRef.current;
    const keep = open && list.some((d) => d.id === open.id) ? open.id : list[0]?.id;
    if (keep && keep !== open?.id) await selectDoc(keep);
  }, [selectDoc]);

  const reloadProject = useCallback(async () => {
    if (!activeProjectId) return;
    const list = await apiFetch<Project[]>("/projects");
    setProject(list.find((x) => x.id === activeProjectId) ?? null);
  }, [activeProjectId]);

  const setActiveProject = useCallback(async (id: string | null, opts: { skipJump?: boolean; docId?: string } = {}): Promise<boolean> => {
    let jump: ToolId | null = null;
    if (id && !opts.skipJump) {
      const p = (await apiFetch<Project[]>("/projects")).find((x) => x.id === id);
      // Guided, not locked: a finished project opens without steering the student anywhere.
      if (p && p.status !== "complete" && isStageKey(p.stage)) jump = STAGE_FIRST_TOOL[p.stage];
    }
    await apiFetch<void>("/me/active-project", { method: "PATCH", body: JSON.stringify({ projectId: id }) });
    pendingDoc.current = opts.docId ?? null;
    let shown = true;
    if (id === activeProjectId) { await reloadProject(); await reloadDocs(); if (opts.docId) shown = await selectDoc(opts.docId); } else await reload();
    if (jump) showTool(jump);
    return shown;
  }, [activeProjectId, reload, reloadProject, reloadDocs, selectDoc, showTool]);

  // restoreDocument must stay valid for ten seconds in a toast, so it reads the newest setActiveProject (which knows the project open now).
  const setActiveProjectRef = useRef(setActiveProject);
  useEffect(() => { setActiveProjectRef.current = setActiveProject; }, [setActiveProject]);

  /** Brings a deleted document back and shows it, in whichever project is open now (Undo can come ten seconds after the delete). */
  const restoreDocument = useCallback(async (id: string, docProjectId: string): Promise<boolean> => {
    await apiFetch<DocumentSummary>(`/documents/${id}/restore-deleted`, { method: "POST" });
    if (projectIdRef.current === docProjectId) { await reloadDocs(); return selectDoc(id); }
    // The student has moved to another project since: open the one the document belongs to (null = scratch space).
    return setActiveProjectRef.current(docProjectId === scratchProjectId ? null : docProjectId, { skipJump: true, docId: id });
  }, [reloadDocs, selectDoc, scratchProjectId]);

  /** Imports the files as new documents, then shows the last one. One batch at a time. */
  const doImport = useCallback(async (files: File[], origin: "draft" | "source") => {
    const pid = projectIdRef.current;
    if (!pid) return;
    importing.current = true;
    try {
      const last = await importFiles(files, origin, pid, t);
      if (last) { await reloadDocs(); await selectDoc(last); }
    } finally { importing.current = false; }
  }, [t, reloadDocs, selectDoc]);

  const startImport = useCallback((files: File[]) => {
    if (importing.current) { toast(BUSY); return; }
    const usable = files.filter(isImportable);
    const skipped = files.length - usable.length;
    if (!usable.length) { toast("Import a .docx, .pdf, .txt, .md or .html file."); return; }
    if (skipped) toast(`${skipped} file(s) skipped: only .docx, .pdf, .txt, .md and .html can be imported.`);
    if (allPdf(usable)) { void doImport(usable, "source"); return; }
    setImportWaiting(usable);
    setDialog("importOrigin");
  }, [doImport]);

  const runImport = useCallback(async (origin: "draft" | "source") => {
    // The dialog stays as it is when another batch is still running.
    if (importing.current) { toast(BUSY); return; }
    const files = importWaiting;
    setImportWaiting([]);
    setDialog(null);
    await doImport(files, origin);
  }, [importWaiting, doImport]);

  const currentStage: StageKey | null = project && project.status !== "complete" && isStageKey(project.stage) ? project.stage : null;

  const value: WorkspaceValue = {
    activeTool, showTool, dock, dockShow: setDock, aiWaiting, sidebarCollapsed, stageGroupsCollapsed: collapsed,
    currentStage, project, documents, currentDoc, selectDoc, reloadDocs, patchDoc, restoreDocument, registerFlush, flushOpen,
    wordCount: live && currentDoc && live.docId === currentDoc.id ? live.words : null, setWordCount, setActiveProject, reloadProject,
    dialog, startImport, importNames: importWaiting.map((f) => f.name), runImport, openHelp: () => setDialog("help"), openSettings: (provider) => { setSettingsProvider(provider ?? null); setDialog("settings"); }, settingsProvider, closeDialog: () => { setDialog(null); setImportWaiting([]); },
    openSaveAs: (mode, prefillName = "", opts) => { setSaveAsInit({ mode, name: prefillName, guessStage: opts?.guessStage ?? false }); setDialog("saveAs"); },
    saveAsInit, openProjects: () => setDialog("projects"),
    openStageIntro: (stage) => { setIntroStage(stage); setDialog("stageIntro"); }, introStage
  };

  const dockW = settings.dockW ?? 440;
  return (
    <WorkspaceProvider value={value}>
      <Header />
      <ChromeDialogs />
      <Subbar />
      <ProjectBar />
      <SaveAsProject />
      <Projects />
      <StageIntro />
      <ImportOrigin />
      <AlertDialog open={!!switchAsk} onOpenChange={(o) => { if (!o && switchAsk) { switchAsk.answer(false); setSwitchAsk(null); } }}>
        <AlertDialogContent data-testid="switch-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch anyway?</AlertDialogTitle>
            <AlertDialogDescription>{`Unsaved changes in "${switchAsk?.title ?? ""}" may be lost.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="switch-stay">Stay</AlertDialogCancel>
            <AlertDialogAction data-testid="switch-anyway" onClick={() => { switchAsk?.answer(true); setSwitchAsk(null); }}>Switch anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {ready ? (
        <main className={"ws" + (sidebarCollapsed ? " rail" : "")} style={{ "--dock-w": dockW + "px" } as React.CSSProperties}>
          <Sidebar />
          <DocumentCard />
          <Dock />
        </main>
      ) : error ? (
        <p role="alert" className="p-6 text-sm text-destructive" data-testid="error-msg">Could not load your workspace.</p>
      ) : (
        <div className="grid gap-4 p-6" aria-busy="true"><Skeleton className="h-6 w-60" /><Skeleton className="h-96" /></div>
      )}
    </WorkspaceProvider>
  );
}
