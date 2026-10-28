"use client";
import { useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { plain, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { IMPORT_ACCEPT } from "@/lib/import/parse";
import { newDocumentBody } from "@/lib/useAutosave";
import { useVault } from "@/lib/vault/useVault";
import { openTitle, sealTitle, useTitle } from "@/lib/vault/titles";
import { forgetSample, resumeSample } from "@/lib/writingSamples/useWritingSampleCapture";
import { useProject, type DocumentSummary, type DocumentWithBody, type Project } from "@/components/frame/ProjectContext";

const UNDO_MS = 10_000;

/** The document row of the card: choose, create, rename, delete (with ten seconds to undo), import, mark as source and move to a project. */
export function DocBar() {
  const t = useT();
  const { me } = useSettings();
  const vault = useVault();
  const { project, documents, currentDoc, selectDoc, reloadDocs, startImport, restoreDocument, patchDoc, registerFlush, flushOpen, openProject, go } = useProject();
  const [dialog, setDialog] = useState<"new" | "rename" | "delete" | "move" | null>(null);
  // The open projects the document can move into (read when Move to project opens); null while they are read.
  const [targets, setTargets] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isSource = currentDoc?.kind === "source";
  const currentTitle = useTitle(currentDoc, "document");
  const projectId = project?.id ?? me?.scratchProjectId;

  const close = () => { if (!busy) setDialog(null); };

  async function create() {
    if (busy || !projectId) return;
    setBusy(true);
    try {
      // With a vault the new document's empty body is encrypted from the start (the vault is opened first).
      // Its title is sealed with it, under the same first key.
      const body = await newDocumentBody(vault, name.trim() || t("doc_untitled"));
      // The unlock was cancelled: nothing is created and the name dialog stays open.
      if (!body) return;
      const made = await apiFetch<DocumentWithBody>(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify(body) });
      await reloadDocs();
      const shown = await selectDoc(made.id);
      setDialog(null);
      // Declining the switch leaves the new document in the list; only a shown one is announced.
      if (shown) toast("New document created ✓");
    } catch { toast("Could not create the document. Try again."); }
    finally { setBusy(false); }
  }

  async function rename() {
    if (busy || !currentDoc) return;
    setBusy(true);
    try {
      // Sealed under the document's own key; a locked vault asks for the passphrase first, and a cancelled ask renames nothing.
      if ((await vault.known()) !== "off" && !(await vault.ensureUnlocked())) return;
      const title = await sealTitle(vault, currentDoc.id, currentDoc.deks, name.trim() || t("doc_untitled"));
      const d = await apiFetch<DocumentSummary>(`/documents/${currentDoc.id}`, { method: "PATCH", body: JSON.stringify(title) });
      patchDoc(d.id, { title: d.title, titleKeyVersion: d.titleKeyVersion });
      setDialog(null);
      toast("Renamed ✓");
    } catch { toast("Could not rename. Try again."); }
    finally { setBusy(false); }
  }

  /** The rename button: a locked title asks for the passphrase first and opens with its name; a cancelled ask opens nothing. */
  async function askRename() {
    if (!currentDoc) return;
    if (currentTitle.state !== "locked") { setName(currentTitle.state === "open" ? currentTitle.text : ""); setDialog("rename"); return; }
    if (!(await vault.ensureUnlocked())) return;
    const o = await openTitle(vault, currentDoc, currentDoc.id);
    setName(o.state === "open" ? o.text : "");
    setDialog("rename");
  }

  /** The delete button: v1 refuses to delete the only document before asking anything. */
  function askDelete() {
    if (documents.length < 2) { toast("This is your only document — create another one first"); return; }
    setDialog("delete");
  }

  async function remove() {
    if (busy || !currentDoc) return;
    const gone = currentDoc;
    setBusy(true);
    try {
      // What was typed last is stored first, so Undo brings back the newest text.
      await flushOpen(); // a failed save still lets the student delete
      await apiFetch<void>(`/documents/${gone.id}`, { method: "DELETE" });
      // Its writing sample (if the student keeps one) goes with it; an Undo within ten seconds brings the document back and it is captured again.
      void forgetSample(gone.projectId, gone.id, () => vault).catch(() => undefined);
      registerFlush(null);
      setDialog(null);
      // The open document is gone from the list, so reloading shows the first remaining one.
      await reloadDocs();
      toast("Deleted — ", {
        ms: UNDO_MS,
        action: { label: t("fb_undo"), testId: "undo-delete", onClick: () => { void undo(gone.id, gone.projectId); } }
      });
    } catch (e) {
      setDialog(null);
      toast(e instanceof ApiError && e.code === "only-document" ? "This is your only document — create another one first" : "Could not delete the document. Try again.");
    } finally { setBusy(false); }
  }

  async function undo(id: string, docProjectId: string) {
    try {
      // The workspace restores into whichever project is open by now, so a late Undo never mixes projects.
      const shown = await restoreDocument(id, docProjectId);
      // The document is back even when the student declined the switch to it, so its writing is captured again (not when the restore failed).
      resumeSample(docProjectId, id);
      if (shown) toast("Restored ✓");
    } catch { toast("Could not bring the document back."); }
  }

  /** Move to project: the open projects other than this one, and New project. */
  function askMove() {
    if (!currentDoc) return;
    setTargets(null);
    setDialog("move");
    const from = currentDoc.projectId;
    apiFetch<Project[]>("/projects").then((list) => setTargets(list.filter((p) => p.status !== "complete" && p.id !== from)), () => setTargets([]));
  }

  /**
   * v1 saveAsProject's move (Save as research project, now Move to project): nothing the student wrote changes, the document is filed under the
   * project and that project opens on it. Its title stays sealed under the document's own key, so a move touches no key.
   */
  async function move(target: string) {
    if (busy || !currentDoc) return;
    const moving = currentDoc;
    setBusy(true);
    try {
      // Stored first, so the switch that follows never asks about a document that has already left this project.
      if (!(await flushOpen())) { toast(t("doc_move_unsaved")); return; }
      await apiFetch(`/documents/${moving.id}/move`, { method: "POST", body: JSON.stringify({ projectId: target }) });
      // The copy of its writing stays with the project it was written for no longer: it goes from the old one, and is captured in the new one.
      void forgetSample(moving.projectId, moving.id, () => vault).catch(() => undefined);
      resumeSample(target, moving.id);
      setDialog(null);
      await openProject(target, { docId: moving.id });
    } catch { toast(t("doc_move_fail")); }
    finally { setBusy(false); }
  }

  async function toggleOrigin() {
    if (!currentDoc) return;
    const kind = isSource ? "draft" : "source";
    try {
      const d = await apiFetch<DocumentSummary>(`/documents/${currentDoc.id}`, { method: "PATCH", body: JSON.stringify({ kind }) });
      patchDoc(d.id, { kind: d.kind });
      // v1 3172: a source paper is not the student's writing, so its sample goes.
      if (kind === "source") void forgetSample(currentDoc.projectId, currentDoc.id, () => vault).catch(() => undefined);
      else resumeSample(currentDoc.projectId, currentDoc.id);
      toast(t(kind === "source" ? "org_toast_src" : "org_toast_own"));
    } catch { toast("Could not change the document. Try again."); }
  }

  return (
    <div className="docbar">
      <label className="lbl" htmlFor="doc-select">{t("doc_label")}</label>
      <select id="doc-select" className="select grow" data-testid="doc-select" value={currentDoc?.id ?? ""} onChange={(e) => { void selectDoc(e.target.value); }}>
        {documents.map((d) => <DocOption key={d.id} doc={d} />)}
      </select>
      {isSource && <Badge variant="chip" title={t("org_badge_title")} data-testid="doc-source-badge">{t("org_badge_src")}</Badge>}
      <Button variant="ghost" size="sm" title={t("doc_new_title")} data-testid="doc-new" onClick={() => { setName(t("doc_untitled_n", { n: documents.length + 1 })); setDialog("new"); }}>{t("doc_new_btn")}</Button>
      <button type="button" className="icon" aria-label={t("doc_rename_title")} title={t("doc_rename_title")} data-testid="doc-rename" disabled={!currentDoc} onClick={() => { void askRename(); }}>✎</button>
      <button type="button" className="icon del" aria-label={t("doc_delete_title")} title={t("doc_delete_title")} data-testid="doc-delete" disabled={!currentDoc} onClick={askDelete}>🗑</button>
      <Button variant="ghost" size="sm" title={t("doc_import_title")} data-testid="doc-import" onClick={() => fileRef.current?.click()}>{t("doc_import_btn")}</Button>
      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} multiple hidden data-testid="doc-import-input" aria-label="Choose files to import"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) startImport(files); }} />
      <Button variant="ghost" size="sm" title={t(isSource ? "org_btn_title_src" : "org_btn_title_own")} data-testid="doc-origin" disabled={!currentDoc} onClick={() => { void toggleOrigin(); }}>{t(isSource ? "org_btn_src" : "org_btn_own")}</Button>
      <Button variant="ghost" size="sm" data-testid="doc-move" disabled={!currentDoc} onClick={askMove}>{t("doc_move_btn")}</Button>

      <Dialog open={dialog === "new" || dialog === "rename"} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-sm" data-testid="doc-name-dialog">
          <form onSubmit={(e) => { e.preventDefault(); void (dialog === "new" ? create() : rename()); }}>
            <DialogHeader><DialogTitle>{dialog === "new" ? t("doc_name_new_h") : t("doc_rename_h")}</DialogTitle></DialogHeader>
            <Input className="my-4" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus aria-label={dialog === "new" ? t("doc_name_new") : t("doc_rename_title")} data-testid="doc-name-input" />
            <DialogFooter>
              <Button type="button" variant="ghost" size="md" onClick={close}>{t("sap_cancel_btn")}</Button>
              <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="doc-name-ok">OK</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "move"} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-sm" data-testid="doc-move-dialog">
          <DialogHeader>
            <DialogTitle>{t("doc_move_h")}</DialogTitle>
            <DialogDescription>{t("doc_move_desc")}</DialogDescription>
          </DialogHeader>
          <div className="my-2 grid gap-1.5">
            {targets?.map((p) => <MoveTarget key={p.id} project={p} disabled={busy} onPick={() => { void move(p.id); }} />)}
            {targets && targets.length === 0 && <p className="m-0 text-sm text-muted-foreground" data-testid="doc-move-none">{t("doc_move_none")}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="md" onClick={close}>{t("sap_cancel_btn")}</Button>
            {/* Start a new study creates the study and moves the document into it (NewStudy's moveDocId). */}
            <Button type="button" variant="primary" size="md" disabled={busy || !currentDoc} data-testid="doc-move-new" onClick={() => { if (currentDoc) { setDialog(null); void go(`/start?move=${encodeURIComponent(currentDoc.id)}`); } }}>{t("doc_move_new")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => { if (!o) close(); }}>
        <AlertDialogContent data-testid="doc-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${currentDoc ? plain(currentTitle.text) : "this document"}" permanently?`}</AlertDialogTitle>
            <AlertDialogDescription>A copy can be brought back for ten seconds after you delete it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="doc-delete-cancel">{t("sap_cancel_btn")}</AlertDialogCancel>
            <AlertDialogAction data-testid="doc-delete-confirm" disabled={busy} onClick={(e) => { e.preventDefault(); void remove(); }}>{t("sh2_delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** A project the document can move into, under its opened title (never its ciphertext). */
function MoveTarget({ project, disabled, onPick }: { project: Project; disabled: boolean; onPick(): void }) {
  const title = useTitle(project, "project");
  return <Button type="button" variant="ghost" size="md" className="justify-start" disabled={disabled} data-testid="doc-move-project" onClick={onPick}><span className="truncate">{title.text}</span></Button>;
}

/** One document in the list, under its opened title ("Locked title" while the vault is locked). */
function DocOption({ doc }: { doc: DocumentSummary }) {
  const title = useTitle(doc, "document");
  return <option value={doc.id}>{doc.kind === "source" ? "📄 " : ""}{title.text}</option>;
}
