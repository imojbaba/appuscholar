"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sanitizeHtml, type ProviderId } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useSettings, type Settings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { TERMS_SINCE, needsTerms } from "@/lib/terms";
import { toast } from "@/components/ui/toast";
import { isImportable } from "@/lib/import/parse";
import { allPdf, importFiles } from "@/lib/import/run";
import { newDocumentBody } from "@/lib/useAutosave";
import { useVault, type VaultValue } from "@/lib/vault/useVault";
import { VaultError } from "@/lib/vault/crypto";
import { STAGE_FIRST_TOOL, TOOL_TO_STAGE, isStageKey, isToolId, type StageKey, type ToolId } from "@/lib/tools";
import { DocumentCard } from "@/components/document/DocumentCard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SuggestionProvider } from "@/lib/ai/suggestion";
import { CiteLibraryProvider } from "@/lib/cite/useLibrary";
import { CaptureHash } from "@/lib/cite/capture";
import { Skeleton } from "@/components/ui/skeleton";
import { Dock } from "./Dock";
import { ProjectBar } from "./ProjectBar";
import { SaveAsProject } from "./dialogs/SaveAsProject";
import { Projects } from "./dialogs/Projects";
import { StageIntro } from "./dialogs/StageIntro";
import { ImportOrigin } from "./dialogs/ImportOrigin";
import { MyWriting } from "./dialogs/MyWriting";
import { ImportV1Dialog } from "./dialogs/ImportV1Dialog";
import { ChromeDialogs, Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { SidebarDrawer } from "./SidebarDrawer";
import { MID_QUERY, PHONE_QUERY, useMedia } from "@/lib/useMedia";
import { Subbar } from "./Subbar";
import { WorkspaceProvider, type DocumentSummary, type DocumentWithBody, type PendingAnalyse, type Project, type WorkspaceValue } from "./WorkspaceContext";

const BUSY = "Another import is still running. Wait for it to finish.";

type Loaded = { project: Project | null; projectId: string; documents: DocumentSummary[]; doc: DocumentWithBody | null };

async function listOrSeed(projectId: string, vault: VaultValue): Promise<DocumentSummary[]> {
  const list = await apiFetch<DocumentSummary[]>(`/projects/${projectId}/documents`);
  if (list.length) return list;
  // A project always has a document to write in (v1 always had one); with a vault its empty body is encrypted from the start.
  const body = await newDocumentBody(vault);
  // The unlock was cancelled: no document yet, and New in the document bar can make one later.
  if (!body) return [];
  const made = await apiFetch<DocumentWithBody>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title: "My first document", ...body }) });
  return [made];
}

/**
 * The document as the editor may open it: plaintext (keyVersion 0) as it is (the server sanitised it); ciphertext decrypted once the vault
 * is open, then sanitised here, because the server cannot sanitise what it cannot read. Never an empty stand-in for text that did not open:
 * a cancelled unlock or a body that does not decrypt is marked `unreadable` and no editor opens on it.
 */
export async function readableDoc(vault: Pick<VaultValue, "ensureUnlocked" | "decryptBody">, doc: DocumentWithBody): Promise<DocumentWithBody> {
  if (!doc.keyVersion) return doc;
  if (!(await vault.ensureUnlocked())) return { ...doc, bodyHtml: "", unreadable: "locked" };
  try {
    return { ...doc, bodyHtml: sanitizeHtml(await vault.decryptBody(doc)) };
  } catch (e) {
    if (e instanceof VaultError) return { ...doc, bodyHtml: "", unreadable: "broken" };
    // Locked again between the unlock and the decrypt.
    if (e instanceof Error && e.message === "vault-locked") return { ...doc, bodyHtml: "", unreadable: "locked" };
    throw e;
  }
}

/** Creation order, as v1 listed documents (the API answers most recently updated first). */
function byCreated(list: DocumentSummary[]): DocumentSummary[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function Workspace({ openImportV1 = false }: { openImportV1?: boolean }) {
  const t = useT();
  const { me, settings, update, reload } = useSettings();
  const vault = useVault();
  // Loads and creations outlive a render; they read the newest vault from here.
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
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
  const [aiWaiting, setAiWaiting] = useState(false);
  const [pendingSearch, setPendingSearch] = useState<string | null>(null);
  const [pendingAnalyse, setPendingAnalyse] = useState<PendingAnalyse | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { projectIdRef.current = projectId; currentDocRef.current = currentDoc; }, [projectId, currentDoc]);
  const docToken = useRef(0);
  /** True while selectDoc is fetching or decrypting the newest choice (its unlock prompt may be open). */
  const selecting = useRef(false);
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

  // First run: the terms gate (non-dismissible, in dialogs/Terms) comes first; once the account has accepted, the welcome tour opens once for a student who has not seen it.
  const gated = needsTerms(me, TERMS_SINCE);
  const [welcomeChecked, setWelcomeChecked] = useState(false);
  if (me && !gated && !welcomeChecked) {
    setWelcomeChecked(true);
    // /import lands here with ?import=1: the backup import wins over the tour (Help replays the tour).
    if (openImportV1) {
      setDialog("importV1");
      // Strip ?import=1 so a reload or a copied link does not reopen the dialog (synchronous, once: guarded by welcomeChecked).
      if (typeof window !== "undefined") window.history.replaceState(null, "", "/");
    } else if (!settings.seenWelcome) setDialog("welcome");
  }

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
          const docs = await listOrSeed(pid, vaultRef.current);
          const first = docs[0];
          const want = pendingDoc.current; pendingDoc.current = null;
          const pick = docs.find((d) => d.id === want) ?? first;
          // Decrypted before the editor mounts.
          const doc = pick ? await readableDoc(vaultRef.current, await apiFetch<DocumentWithBody>(`/documents/${pick.id}`)) : null;
          return { project: proj, projectId: pid, documents: docs, doc };
        })()
      };
    }
    let live = true;
    loading.current.p.then((r) => {
      if (!live) return;
      setProject(r.project);
      setProjectId(r.projectId);
      // An abstract Research kept for Analyse a paper belongs to the project it was found in (ruling R7).
      if (r.projectId !== projectIdRef.current) setPendingAnalyse(null);
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
  // Between 701 and 1099px the sidebar is the icon rail until the student chooses otherwise (their stored choice always wins).
  const phone = useMedia(PHONE_QUERY);
  const mid = useMedia(MID_QUERY);
  const sidebarCollapsed = settings.sidebarCollapsed ?? mid;
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Growing past the phone width leaves no drawer to show.
  if (!phone && drawerOpen) setDrawerOpen(false);

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
    selecting.current = true;
    try {
      const doc = await readableDoc(vaultRef.current, await apiFetch<DocumentWithBody>(`/documents/${id}`));
      if (mine === docToken.current) setCurrentDoc(doc);
    } finally { if (mine === docToken.current) selecting.current = false; }
    return true;
  }, [confirmLeave]);

  // A document left locked (the unlock was cancelled) opens once the vault does, from the header pill or another prompt. It never takes
  // the document token and never applies while another document is being chosen: the vault often opens for exactly that choice.
  const vaultOpen = vault.status === "unlocked" || vault.status === "migrating";
  useEffect(() => {
    const shut = currentDoc;
    if (!vaultOpen || shut?.unreadable !== "locked" || selecting.current) return;
    const mine = docToken.current;
    apiFetch<DocumentWithBody>(`/documents/${shut.id}`)
      .then((d) => readableDoc(vaultRef.current, d))
      .then((d) => { if (mine === docToken.current && !selecting.current && currentDocRef.current?.id === shut.id) setCurrentDoc(d); }, () => undefined);
  }, [vaultOpen, currentDoc]);

  const reloadDocs = useCallback(async () => {
    const pid = projectIdRef.current;
    if (!pid) return;
    const list = byCreated(await listOrSeed(pid, vaultRef.current));
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
      const last = await importFiles(files, origin, pid, t, vaultRef.current);
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

  const dockShow = useCallback((which: "tools" | "ai") => { setDock(which); if (which === "ai") setAiWaiting(false); }, []);

  const currentStage: StageKey | null = project && project.status !== "complete" && isStageKey(project.stage) ? project.stage : null;

  const value: WorkspaceValue = {
    activeTool, showTool, pendingSearch, setPendingSearch, pendingAnalyse, setPendingAnalyse, dock, dockShow, aiWaiting, setAiWaiting, sidebarCollapsed, phone, drawerOpen, setDrawerOpen, stageGroupsCollapsed: collapsed,
    currentStage, project, projectId, documents, currentDoc, selectDoc, reloadDocs, patchDoc, restoreDocument, registerFlush, flushOpen,
    wordCount: live && currentDoc && live.docId === currentDoc.id ? live.words : null, setWordCount, setActiveProject, reloadProject,
    dialog, startImport, importNames: importWaiting.map((f) => f.name), runImport, openHelp: () => setDialog("help"), openImportV1: () => setDialog("importV1"), openTerms: () => setDialog("terms"), openWelcome: () => setDialog("welcome"), openMyWriting: () => setDialog("myWriting"), openSettings: (provider) => { setSettingsProvider(provider ?? null); setDialog("settings"); }, settingsProvider, closeDialog: () => { setDialog(null); setImportWaiting([]); },
    openSaveAs: (mode, prefillName = "", opts) => { setSaveAsInit({ mode, name: prefillName, guessStage: opts?.guessStage ?? false }); setDialog("saveAs"); },
    saveAsInit, openProjects: () => setDialog("projects"),
    openStageIntro: (stage) => { setIntroStage(stage); setDialog("stageIntro"); }, introStage
  };

  const dockW = settings.dockW ?? 440;
  const sheetPct = settings.sheetPct ?? 46;
  return (
    <WorkspaceProvider value={value}>
      <SuggestionProvider>
        {/* One citation library for the Citation Manager and the caret chip under the document. */}
        <CiteLibraryProvider>
        {/* v1 boot's citCheckCaptureHash (13676-13677): a citation the bookmarklet sent in the address's #capture= hash. */}
        <CaptureHash />
        <Header />
        <ChromeDialogs />
        <Subbar />
        <ProjectBar />
        <SaveAsProject />
        <Projects />
        <StageIntro />
        <ImportOrigin />
        <MyWriting />
        <ImportV1Dialog />
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
        {phone && <SidebarDrawer />}
        {ready ? (
          <main className={"ws" + (sidebarCollapsed ? " rail" : "")} style={{ "--dock-w": dockW + "px", "--sheet-pct": sheetPct } as React.CSSProperties}>
            {/* One copy of the tool list at a time: the drawer replaces the sidebar on a phone. */}
            {!phone && <Sidebar />}
            <DocumentCard />
            <Dock />
          </main>
        ) : error ? (
          <p role="alert" className="p-6 text-sm text-destructive" data-testid="error-msg">Could not load your workspace.</p>
        ) : (
          <div className="grid gap-4 p-6" aria-busy="true"><Skeleton className="h-6 w-60" /><Skeleton className="h-96" /></div>
        )}
        </CiteLibraryProvider>
      </SuggestionProvider>
    </WorkspaceProvider>
  );
}
