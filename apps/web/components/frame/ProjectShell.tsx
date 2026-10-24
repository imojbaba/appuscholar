"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { usePathname, useRouter } from "next/navigation";
import { sanitizeHtml, type ProviderId } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { TERMS_SINCE, needsTerms } from "@/lib/terms";
import { toast } from "@/components/ui/toast";
import { isImportable } from "@/lib/import/parse";
import { allPdf, importFiles } from "@/lib/import/run";
import { useVault, type VaultValue } from "@/lib/vault/useVault";
import { VaultError } from "@/lib/vault/crypto";
import { documentTitlePath, sealPlainTitles, useTitle, type Titled } from "@/lib/vault/titles";
import { shouldWarnOnUnloadBlobs } from "@/lib/blobs/held";
import { homeHref, parsePlace, placeHref, type Place } from "@/lib/frame/places";
import { listOrSeed } from "@/lib/frame/firstDocument";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SuggestionProvider } from "@/lib/ai/suggestion";
import { postInsert, useSyncReceiver, type InsertMessage } from "@/lib/popout/sync";
import { WINDOW_PARAM, holdPopout, isPopout, usePopout, windowHref } from "@/lib/popout/mode";
import { CiteLibraryProvider } from "@/lib/cite/useLibrary";
import type { PaperIdsState } from "@/lib/papers/migrate";
import { DocAccessHost } from "@/lib/editor/docAccess";
import { documentLayers } from "@/lib/tools/registry";
import { CaptureHash } from "@/lib/cite/capture";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportOrigin } from "@/components/workspace/dialogs/ImportOrigin";
import { MyWriting } from "@/components/workspace/dialogs/MyWriting";
import { ImportV1Dialog } from "@/components/workspace/dialogs/ImportV1Dialog";
import { ChromeDialogs } from "@/components/workspace/ChromeDialogs";
import { ExportDialog, exportPartsFor } from "@/components/export/ExportDialog";
import type { ExportPartId } from "@/lib/export/projectExport";
import { PaperIdsRunner } from "./PaperIdsRunner";
import { AppHeader } from "./AppHeader";
import { WindowHeader } from "./WindowHeader";
import { DocumentBeside } from "./DocumentBeside";
import { ProjectProvider, type DocumentSummary, type DocumentWithBody, type PendingAnalyse, type Project, type ProjectValue } from "./ProjectContext";

/** Whether this tab has run the title-sealing pass since its last unlock (module scope: it outlives a project switch). */
let sealPassRan = false;

const BUSY = "Another import is still running. Wait for it to finish.";
/** How long an insert waits for the document's editor once it has asked for it (after the unlock, when one was asked). */
export const INSERT_WAIT_MS = 10_000;

type Loaded = { project: Project | null; projectId: string; documents: DocumentSummary[]; doc: DocumentWithBody | null } | { missing: true };

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

/** The editor as an insert may use it: null once it is destroyed (the document closed or switched meanwhile). */
function liveOf(e: Editor | null): Editor | null { return e && !e.isDestroyed ? e : null; }

/** Creation order, as v1 listed documents (the API answers most recently updated first). */
export function byCreated(list: DocumentSummary[]): DocumentSummary[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The place an address names, from the path: `/p/<id>/<stage>/<tab>…`; null on the home and outside a project. */
function placeOf(path: string | null): Place | null {
  const m = /^\/p\/[^/]+\/([^/]+)(?:\/(.*))?$/.exec(path ?? "");
  if (!m) return null;
  const found = parsePlace(m[1]!, m[2] ? m[2].split("/").filter(Boolean) : undefined);
  return found ? { stage: found.stage, tab: found.tab } : null;
}

/** A document to show once the project opened next has loaded (the one just restored there): the shell of that project is a new mount. */
let nextDoc: { projectId: string; docId: string } | null = null;

/**
 * The mounted shell's restore. An Undo toast outlives the shell that showed it (a switch mounts a new one), so every shell's
 * restoreDocument goes through the shell mounted now, which knows the project open now and can open another.
 */
let liveRestore: ((id: string, docProjectId: string) => Promise<boolean>) | null = null;

/**
 * The frame around every page but the pop-out: the header, the dialogs, the first-use terms and the welcome tour, and, within a project
 * (`projectId` from the address, the scratch project's id in scratch space), the project, its documents, the open document and its editor.
 * They stay mounted while the student moves between the project's places; the Writing place shows the document at full width, the others show it
 * beside the place once it is opened (Task 11, DocumentBeside), and keep it mounted out of sight while it is closed, so an insert still lands in
 * it. Outside a project (`projectId` null: first run, the list) nothing is loaded. Moved here from components/workspace/Workspace.tsx (Task 6,
 * impact map D1a).
 *
 * A place in its own window (`?window=1`, register row D-S2-43) gets the same shell without the document: a slim header, the place, its documents
 * listed but never opened or created, no document beside it, no title sealing and no active-project write; its inserts go to the writing window
 * (lib/popout/sync.ts), and a move inside the window keeps `?window=1`.
 */
export function ProjectShell({ projectId: urlProjectId, openImportV1 = false, children }: { projectId: string | null; openImportV1?: boolean; children?: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { me, settings, reload, update } = useSettings();
  const vault = useVault();
  // Loads and creations outlive a render; they read the newest vault from here.
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  // After each unlock of a complete vault, titles still in plaintext (from before the vault, or renamed since by an older tab) are sealed.
  const titlesSealable = vault.status === "unlocked" && vault.complete && !isPopout();
  const scratchForTitles = me?.scratchProjectId ?? null;
  useEffect(() => {
    // Once per unlock in this tab, not on every page: a lock lets the next unlock run it again.
    if (!titlesSealable) { sealPassRan = false; return; }
    if (sealPassRan) return;
    sealPassRan = true;
    void sealPlainTitles({
      vault: vaultRef.current,
      listProjects: () => apiFetch<Titled[]>("/projects"),
      listDocuments: (id) => apiFetch<Titled[]>(`/projects/${id}/documents?includeDeleted=1`),
      patchProject: async (id, body) => { await apiFetch(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }); },
      patchDocument: async (id, body, deleted) => { await apiFetch(documentTitlePath(id, deleted), { method: "PATCH", body: JSON.stringify(body) }); },
      scratchId: scratchForTitles
    }).catch(() => { sealPassRan = false; /* offline or locked meanwhile: the next mount or unlock tries again */ });
  }, [titlesSealable, scratchForTitles]);
  const inProject = urlProjectId !== null;
  const popout = usePopout();
  // The window's role is held while this shell is mounted, so a tab's link (which drops the query) never makes it a writing window, and the
  // address gets `?window=1` back after each move.
  useLayoutEffect(() => {
    if (!popout) return;
    holdPopout(true);
    return () => holdPopout(false);
  }, [popout]);
  useEffect(() => {
    if (!popout || new URLSearchParams(window.location.search).get(WINDOW_PARAM) === "1") return;
    const { pathname: p, search, hash } = window.location;
    window.history.replaceState(null, "", windowHref(p + search + hash));
  }, [popout, pathname]);
  const [ready, setReady] = useState(!inProject);
  const [error, setError] = useState(false);
  const [missing, setMissing] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [currentDoc, setCurrentDoc] = useState<DocumentWithBody | null>(null);
  const [dialog, setDialog] = useState<ProjectValue["dialog"]>(null);
  const [settingsProvider, setSettingsProvider] = useState<ProviderId | null>(null);
  const [importWaiting, setImportWaiting] = useState<File[]>([]);
  const importing = useRef(false);
  const [pendingSearch, setPendingSearch] = useState<string | null>(null);
  const [pendingAnalyse, setPendingAnalyse] = useState<PendingAnalyse | null>(null);
  // The export place's ticks while it is open (null: closed).
  const [exportParts, setExportParts] = useState<ExportPartId[] | null>(null);
  // Where the paper-id migration is, tagged with the project it was told for (Task 17); PaperIdsRunner starts it and reports here.
  const [paperIdsTold, setPaperIdsTold] = useState<{ projectId: string; state: PaperIdsState } | null>(null);
  const reportPaperIds = useCallback((pid: string, state: PaperIdsState) => setPaperIdsTold((p) => (p && p.projectId === pid && p.state === state ? p : { projectId: pid, state })), []);
  useEffect(() => { projectIdRef.current = projectId; currentDocRef.current = currentDoc; readyRef.current = ready; }, [projectId, currentDoc, ready]);
  const docToken = useRef(0);
  /** True while selectDoc is fetching or decrypting the newest choice (its unlock prompt may be open). */
  const selecting = useRef(false);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  // The latest project and open document, for callbacks that outlive a render (the Undo of a deletion, ten seconds later).
  const projectIdRef = useRef<string | null>(null);
  const currentDocRef = useRef<DocumentWithBody | null>(null);
  const readyRef = useRef(ready);
  // Set while the "Switch anyway?" question is open; answering it resolves the switch that asked.
  const [switchAsk, setSwitchAsk] = useState<{ doc: DocumentWithBody | null; answer: (yes: boolean) => void } | null>(null);
  // The same for "Close anyway?", when the document beside a place is closed after a failed save.
  const [closeAsk, setCloseAsk] = useState<{ doc: DocumentWithBody | null; answer: (yes: boolean) => void } | null>(null);
  // The document beside the place (Task 11): the stored setting until the student opens or closes it in this tab.
  const [docOpenHere, setDocOpenHere] = useState<boolean | null>(null);
  const docOpen = docOpenHere ?? settings.docBeside === true;
  const docOpenRef = useRef(docOpen);
  const updateRef = useRef(update);
  useEffect(() => { docOpenRef.current = docOpen; updateRef.current = update; }, [docOpen, update]);
  // The open document's editor, and the inserts waiting for one to register.
  const editorRef = useRef<Editor | null>(null);
  const editorWaiters = useRef(new Set<(e: Editor | null) => void>());
  const [live, setLive] = useState<{ docId: string; words: number } | null>(null);
  // Set by openProject before its PATCH: this shell is on its way out and must not write its own project back as the active one.
  const switching = useRef(false);
  // One load per project even when React runs the effect twice in development, so the first document is never created twice.
  const loading = useRef<{ key: string; p: Promise<Loaded> } | null>(null);

  // First run: the terms gate (non-dismissible, in dialogs/Terms) comes first; once the account has accepted, the welcome tour opens once for a student who has not seen it.
  const gated = needsTerms(me, TERMS_SINCE);
  const [welcomeChecked, setWelcomeChecked] = useState(false);
  if (me && !gated && !welcomeChecked) {
    setWelcomeChecked(true);
    // /projects?import=1 (the old /import link): the backup import wins over the tour (Help replays the tour).
    if (openImportV1) setDialog("importV1");
    else if (!settings.seenWelcome) setDialog("welcome");
  }
  // Strip ?import=1 once the dialog is open, so a reload or a copied link does not reopen it (after the render: the router listens to history).
  useEffect(() => {
    if (openImportV1 && welcomeChecked && window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, [openImportV1, welcomeChecked]);

  const userId = me?.id;
  const activeProjectId = me?.activeProjectId ?? null;
  const scratchProjectId = me?.scratchProjectId;

  useEffect(() => {
    if (!userId || !scratchProjectId || !urlProjectId) return;
    const key = `${userId}:${urlProjectId}`;
    if (loading.current?.key !== key) {
      loading.current = {
        key,
        p: (async (): Promise<Loaded> => {
          let proj: Project | null = null;
          if (urlProjectId !== scratchProjectId) {
            proj = (await apiFetch<Project[]>("/projects")).find((x) => x.id === urlProjectId) ?? null;
            if (!proj) return { missing: true };
          }
          const docs = await listOrSeed(urlProjectId, vaultRef.current);
          const want = nextDoc?.projectId === urlProjectId ? nextDoc.docId : null;
          nextDoc = null;
          // A pop-out opens no document.
          const pick = isPopout() ? undefined : docs.find((d) => d.id === want) ?? docs[0];
          // Decrypted before the editor mounts.
          const doc = pick ? await readableDoc(vaultRef.current, await apiFetch<DocumentWithBody>(`/documents/${pick.id}`)) : null;
          return { project: proj, projectId: urlProjectId, documents: docs, doc };
        })()
      };
    }
    let alive = true;
    loading.current.p.then((r) => {
      if (!alive) return;
      if ("missing" in r) { setMissing(true); setReady(true); return; }
      setProject(r.project);
      setProjectId(r.projectId);
      setDocuments(byCreated(r.documents));
      setCurrentDoc(r.doc);
      setReady(true);
    }, () => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [userId, urlProjectId, scratchProjectId]);

  // The project at this address is the active one (null for the scratch space), so `/` and a new tab come back to it.
  useEffect(() => {
    if (!ready || missing || !projectId || !me || switching.current || isPopout()) return;
    const want = projectId === me.scratchProjectId ? null : projectId;
    if (activeProjectId === want) return;
    apiFetch<void>("/me/active-project", { method: "PATCH", body: JSON.stringify({ projectId: want }) }).then(() => reload(), () => undefined);
  }, [ready, missing, projectId, me, activeProjectId, reload]);

  const registerFlush = useCallback((fn: (() => Promise<boolean>) | null) => { flushRef.current = fn; }, []);
  const setWordCount = useCallback((docId: string, words: number) => setLive((l) => (l && l.docId === docId && l.words === words ? l : { docId, words })), []);
  const patchDoc = useCallback((id: string, patch: Partial<Pick<DocumentSummary, "title" | "titleKeyVersion" | "kind">>) => {
    setDocuments((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    // Only title and kind change here, never the body or the keys: either would restart the editor's autosave.
    setCurrentDoc((d) => (d && d.id === id ? { ...d, ...patch } : d));
  }, []);

  const flushOpen = useCallback(async () => (await flushRef.current?.()) ?? true, []);

  /** Resolves true to leave the open document: its text is stored, or the student chose to switch anyway after a failed save. */
  const confirmLeave = useCallback(async (): Promise<boolean> => {
    if (await flushOpen()) return true;
    return new Promise<boolean>((resolve) => {
      setSwitchAsk((prev) => { prev?.answer(false); return { doc: currentDocRef.current, answer: resolve }; });
    });
  }, [flushOpen]);

  /** Shows another document. False when the student stayed on the open one (its save failed and they chose Stay). */
  const selectDoc = useCallback(async (id: string): Promise<boolean> => {
    // A pop-out shows no document (v1's docSwitch there loads the hidden editor and saves nothing).
    if (isPopout()) return false;
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
    const pid = projectIdRef.current;
    if (!pid || pid === scratchProjectId) return;
    const list = await apiFetch<Project[]>("/projects");
    setProject(list.find((x) => x.id === pid) ?? null);
  }, [scratchProjectId]);

  /** Leaving the project (the editor unmounts): its text is stored first, or the student chose to leave anyway; a held stage value is announced. */
  const confirmExit = useCallback(async (): Promise<boolean> => {
    if (!(await confirmLeave())) return false;
    // A stage's value that has not reached the server (the vault is locked, or another window won the save) stays held for this tab and goes once
    // it can (lib/blobs/held); the student is told rather than finding it later (wave A residual).
    if (shouldWarnOnUnloadBlobs()) toast(t("blob_switch_held"));
    return true;
  }, [confirmLeave, t]);

  const go = useCallback(async (href: string): Promise<boolean> => {
    const here = urlProjectId ? `/p/${urlProjectId}` : null;
    const path = href.split(/[?#]/)[0]!;
    const within = !!here && (path === here || path.startsWith(here + "/"));
    // Within the project the editor stays mounted; out of it, it asks as a switch does.
    if (here && !within && !(await confirmExit())) return false;
    // A move inside a place's own window stays in that window.
    router.push(within && isPopout() ? windowHref(href) : href);
    return true;
  }, [urlProjectId, confirmExit, router]);

  const openProject = useCallback(async (id: string | null, opts: { docId?: string } = {}): Promise<boolean> => {
    const target = id ?? scratchProjectId;
    if (!target) return false;
    if (target === projectIdRef.current) {
      await reloadProject(); await reloadDocs();
      return opts.docId ? selectDoc(opts.docId) : true;
    }
    if (!(await confirmExit())) return false;
    switching.current = true;
    try {
      await apiFetch<void>("/me/active-project", { method: "PATCH", body: JSON.stringify({ projectId: id }) });
      if (opts.docId) nextDoc = { projectId: target, docId: opts.docId };
      await reload();
    } catch (e) { switching.current = false; throw e; }
    // The scratch space has no home: it opens where its documents are (decision 4).
    router.push(id ? homeHref(id) : placeHref(target, "writing"));
    return true;
  }, [scratchProjectId, reloadProject, reloadDocs, selectDoc, confirmExit, reload, router]);

  // restoreDocument must stay valid for ten seconds in a toast, so it reads the newest openProject (which knows the project open now).
  const openProjectRef = useRef(openProject);
  useEffect(() => { openProjectRef.current = openProject; }, [openProject]);

  /** Brings a deleted document back and shows it, in whichever project is open now (Undo can come ten seconds after the delete). */
  const restoreHere = useCallback(async (id: string, docProjectId: string): Promise<boolean> => {
    await apiFetch<DocumentSummary>(`/documents/${id}/restore-deleted`, { method: "POST" });
    if (projectIdRef.current === docProjectId) { await reloadDocs(); return selectDoc(id); }
    // The student has moved to another project since: open the one the document belongs to (null = scratch space).
    return openProjectRef.current(docProjectId === scratchProjectId ? null : docProjectId, { docId: id });
  }, [reloadDocs, selectDoc, scratchProjectId]);
  useEffect(() => {
    liveRestore = restoreHere;
    return () => { if (liveRestore === restoreHere) liveRestore = null; };
  }, [restoreHere]);
  const restoreDocument = useCallback((id: string, docProjectId: string) => (liveRestore ?? restoreHere)(id, docProjectId), [restoreHere]);

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

  const place = inProject ? placeOf(pathname) : null;
  const writing = place?.stage === "writing";
  const writingRef = useRef(writing);
  const placeRef = useRef(place);
  useEffect(() => { writingRef.current = writing; placeRef.current = place; }, [writing, place]);

  /**
   * Opens or closes the document beside the place, and remembers it (docBeside). The Writing place always shows it and changes nothing; a place's
   * own window has no document and changes nothing either.
   */
  const setBeside = useCallback((open: boolean) => {
    if (writingRef.current || docOpenRef.current === open || isPopout()) return;
    docOpenRef.current = open;
    setDocOpenHere(open);
    void updateRef.current({ docBeside: open });
  }, []);
  const openDocument = useCallback(() => setBeside(true), [setBeside]);
  const closeDocument = useCallback(async (): Promise<boolean> => {
    if (!(await flushOpen())) {
      const yes = await new Promise<boolean>((resolve) => {
        setCloseAsk((prev) => { prev?.answer(false); return { doc: currentDocRef.current, answer: resolve }; });
      });
      if (!yes) return false;
    }
    setBeside(false);
    return true;
  }, [flushOpen, setBeside]);

  const registerEditor = useCallback((e: Editor | null) => {
    editorRef.current = e;
    if (e) for (const w of [...editorWaiters.current]) w(e);
  }, []);
  // A document that does not open (its key missing, the text damaged) never gets an editor: an insert waiting for it stops now.
  useEffect(() => {
    if (currentDoc?.unreadable === "broken") for (const w of [...editorWaiters.current]) w(null);
  }, [currentDoc]);
  /** The open document's editor once it registers, or null after INSERT_WAIT_MS (or when the document turns out not to open). */
  const waitForEditor = useCallback(() => new Promise<Editor | null>((resolve) => {
    const now = liveOf(editorRef.current);
    if (now) { resolve(now); return; }
    const done = (e: Editor | null) => { clearTimeout(timer); editorWaiters.current.delete(done); resolve(e); };
    const timer = setTimeout(() => done(null), INSERT_WAIT_MS);
    editorWaiters.current.add(done);
  }), []);

  /**
   * Puts something into the open document. A closed document opens beside the place first, a locked one asks for the passphrase once, and the
   * editor is waited for (INSERT_WAIT_MS); when the document does not open, or another document is open by then, nothing goes in, the student is
   * told, and the answer is false. From the project's home, which shows no document, the insert goes to Writing first. In a place's own window the insert is
   * posted to the writing window as `message` (postInsert), never waiting for an editor here; without a message it has nothing to send.
   */
  const requestInsert = useCallback(async (run: (editor: Editor) => void, message?: InsertMessage): Promise<boolean> => {
    if (isPopout()) {
      if (!message) { toast(t("insert_doc_closed")); return false; }
      postInsert(message, t);
      return true;
    }
    // The project's home shows no document: the insert takes the student to Writing, where the document is, and goes in there.
    if (!placeRef.current) {
      const pid = projectIdRef.current;
      if (!pid || !(await go(placeHref(pid, "writing")))) { toast(t("insert_doc_closed")); return false; }
    } else openDocument();
    // The document the insert was asked for: one switched to while it waited (A locked, then B chosen) does not take it.
    const askedFor = currentDocRef.current?.id ?? null;
    let ed = liveOf(editorRef.current);
    if (!ed) {
      const doc = currentDocRef.current;
      // Loaded with no document (its creation was cancelled), or one that cannot open: there is nothing to wait for.
      const none = (readyRef.current && !doc && !selecting.current) || doc?.unreadable === "broken";
      // A locked document asks for the passphrase once; the vault opening re-reads it, and its editor registers.
      if (!none && (doc?.unreadable !== "locked" || (await vaultRef.current.ensureUnlocked()))) ed = await waitForEditor();
    }
    if (!ed || (askedFor !== null && currentDocRef.current?.id !== askedFor)) { toast(t("insert_doc_closed")); return false; }
    run(ed);
    return true;
  }, [openDocument, waitForEditor, go, t]);

  // v1 popChan.onmessage (7604-7611): what a pop-out sends goes in at the open document's cursor, opening it first when it is closed here.
  useSyncReceiver(requestInsert);

  // A place's own window never runs the migration and does not wait for it; a project not loaded yet is "running" (its places are not drawn before it loads).
  const paperIds: PaperIdsState = popout || !inProject ? "busy" : paperIdsTold && paperIdsTold.projectId === projectId ? paperIdsTold.state : "running";
  const value: ProjectValue = {
    place, go, openProject, pendingSearch, setPendingSearch, pendingAnalyse, setPendingAnalyse, docOpen, openDocument, closeDocument, requestInsert, registerEditor,
    project, projectId, paperIds, documents, currentDoc, selectDoc, reloadDocs, patchDoc, restoreDocument, registerFlush, flushOpen,
    wordCount: live && currentDoc && live.docId === currentDoc.id ? live.words : null, setWordCount, reloadProject,
    dialog, startImport, importNames: importWaiting.map((f) => f.name), runImport, openHelp: () => setDialog("help"), openImportV1: () => setDialog("importV1"), openTerms: () => setDialog("terms"), openWelcome: () => setDialog("welcome"), openMyWriting: () => setDialog("myWriting"), openSettings: (provider) => { setSettingsProvider(provider ?? null); setDialog("settings"); }, settingsProvider, closeDialog: () => { setDialog(null); setImportWaiting([]); },
    openExport: (preselect) => setExportParts(exportPartsFor(preselect))
  };

  return (
    <ProjectProvider value={value}>
      <SuggestionProvider>
        {/* One citation library for the Citations tab and the caret chip under the document. */}
        <CiteLibraryProvider>
        {/* v1 boot's citCheckCaptureHash (13676-13677): a citation the bookmarklet sent in the address's #capture= hash, saved to this project's library. */}
        {inProject && <CaptureHash />}
        {/* The paper-id migration (Task 17): once per project per unlock per tab, when the vault is off or open, through this shared library; never in a place's own window. */}
        {inProject && !popout && <PaperIdsRunner onState={reportPaperIds} />}
        {/* The tools' document access in a place's own window is answered here: snapshots of the open document and its requests (lib/editor/docAccess). */}
        {inProject && !popout && <DocAccessHost />}
        {/* What a built tool draws over the open document (ToolModule.DocumentLayer, ruling R33): once per module, in the writing window only, whatever place is open. */}
        {inProject && !popout && documentLayers().map(({ tool, Layer }) => <Layer key={tool} projectId={urlProjectId} />)}
        {popout ? <WindowHeader /> : <AppHeader />}
        <ChromeDialogs />
        <ImportOrigin />
        <MyWriting />
        <ImportV1Dialog />
        {/* The export place opens over any place of the project (only once a project is loaded: it exports that project). */}
        {projectId && <ExportDialog parts={exportParts} onClose={() => setExportParts(null)} />}
        <AlertDialog open={!!switchAsk} onOpenChange={(o) => { if (!o && switchAsk) { switchAsk.answer(false); setSwitchAsk(null); } }}>
          <AlertDialogContent data-testid="switch-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("switch_title")}</AlertDialogTitle>
              <AlertDialogDescription><UnsavedIn doc={switchAsk?.doc ?? null} /></AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="switch-stay">{t("ask_stay")}</AlertDialogCancel>
              <AlertDialogAction data-testid="switch-anyway" onClick={() => { switchAsk?.answer(true); setSwitchAsk(null); }}>{t("switch_anyway")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={!!closeAsk} onOpenChange={(o) => { if (!o && closeAsk) { closeAsk.answer(false); setCloseAsk(null); } }}>
          <AlertDialogContent data-testid="close-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("doc_close_title")}</AlertDialogTitle>
              <AlertDialogDescription><NotSavedIn doc={closeAsk?.doc ?? null} /></AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="close-stay">{t("ask_stay")}</AlertDialogCancel>
              <AlertDialogAction data-testid="close-anyway" onClick={() => { closeAsk?.answer(true); setCloseAsk(null); }}>{t("doc_close_anyway")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {error ? (
          <p role="alert" className="p-6 text-sm text-destructive" data-testid="error-msg">{t("frame_load_fail")}</p>
        ) : !ready || !me ? (
          // Outside a project too, the page waits for /me: opening the scratch space needs its id.
          <div className="grid gap-4 p-6" aria-busy="true"><Skeleton className="h-6 w-60" /><Skeleton className="h-96" /></div>
        ) : missing ? (
          <main className="frame">
            <p role="alert" className="frame-note" data-testid="project-missing">{t("project_not_found")} <a href="/projects">{t("switcher_all")}</a></p>
          </main>
        ) : (
          <main className={"frame" + (popout ? " in-window" : "")} data-testid="frame">
            {/* The document is mounted in every place, so the editor (and an insert into it) outlives a move to another place: at full width in
                Writing, beside the place once opened elsewhere (not on the home), out of sight while closed. A place's own window has none. */}
            {inProject && !popout ? <DocumentBeside shown={writing || (place !== null && docOpen)} beside={!writing}>{children}</DocumentBeside> : children}
          </main>
        )}
        </CiteLibraryProvider>
      </SuggestionProvider>
    </ProjectProvider>
  );
}

/** The switch question names the open document by its opened title. */
function UnsavedIn({ doc }: { doc: DocumentWithBody | null }) {
  const t = useT();
  const title = useTitle(doc, "document");
  return <>{t("switch_unsaved", { title: doc ? title.text : t("switch_this_doc") })}</>;
}

/** The close question names the document by its opened title. */
function NotSavedIn({ doc }: { doc: DocumentWithBody | null }) {
  const t = useT();
  const title = useTitle(doc, "document");
  return <>{t("doc_close_ask", { title: doc ? title.text : t("doc_close_this") })}</>;
}
