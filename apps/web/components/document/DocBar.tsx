"use client";
import { useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { plain, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { IMPORT_ACCEPT } from "@/lib/import/parse";
import { newDocumentBody } from "@/lib/useAutosave";
import { useVault } from "@/lib/vault/useVault";
import { sealTitle, useTitle } from "@/lib/vault/titles";
import { useProject, type DocumentSummary, type DocumentWithBody } from "@/components/frame/ProjectContext";

const UNDO_MS = 10_000;

/** The document row of the card: choose, create, rename, delete (with ten seconds to undo), import and mark as source. */
export function DocBar() {
  const t = useT();
  const { me } = useSettings();
  const vault = useVault();
  const { project, documents, currentDoc, selectDoc, reloadDocs, startImport, restoreDocument, patchDoc, registerFlush, flushOpen } = useProject();
  const [dialog, setDialog] = useState<"new" | "rename" | "delete" | null>(null);
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
      const body = await newDocumentBody(vault, name.trim() || "Untitled");
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
      const title = await sealTitle(vault, currentDoc.id, currentDoc.deks, name.trim() || "Untitled");
      const d = await apiFetch<DocumentSummary>(`/documents/${currentDoc.id}`, { method: "PATCH", body: JSON.stringify(title) });
      patchDoc(d.id, { title: d.title, titleKeyVersion: d.titleKeyVersion });
      setDialog(null);
      toast("Renamed ✓");
    } catch { toast("Could not rename. Try again."); }
    finally { setBusy(false); }
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
      registerFlush(null);
      setDialog(null);
      // The open document is gone from the list, so reloading shows the first remaining one.
      await reloadDocs();
      toast("Deleted — ", {
        ms: UNDO_MS,
        action: { label: "Undo", testId: "undo-delete", onClick: () => { void undo(gone.id, gone.projectId); } }
      });
    } catch (e) {
      setDialog(null);
      toast(e instanceof ApiError && e.code === "only-document" ? "This is your only document — create another one first" : "Could not delete the document. Try again.");
    } finally { setBusy(false); }
  }

  async function undo(id: string, docProjectId: string) {
    try {
      // The workspace restores into whichever project is open by now, so a late Undo never mixes projects.
      if (await restoreDocument(id, docProjectId)) toast("Restored ✓");
    } catch { toast("Could not bring the document back."); }
  }

  async function toggleOrigin() {
    if (!currentDoc) return;
    const kind = isSource ? "draft" : "source";
    try {
      const d = await apiFetch<DocumentSummary>(`/documents/${currentDoc.id}`, { method: "PATCH", body: JSON.stringify({ kind }) });
      patchDoc(d.id, { kind: d.kind });
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
      <Button variant="ghost" size="sm" title={t("doc_new_title")} data-testid="doc-new" onClick={() => { setName("Untitled " + (documents.length + 1)); setDialog("new"); }}>{t("doc_new_btn")}</Button>
      <button type="button" className="icon" aria-label="Rename this document" title="Rename this document" data-testid="doc-rename" disabled={!currentDoc} onClick={() => { setName(currentTitle.state === "open" ? currentTitle.text : ""); setDialog("rename"); }}>✎</button>
      <button type="button" className="icon del" aria-label={t("doc_delete_title")} title={t("doc_delete_title")} data-testid="doc-delete" disabled={!currentDoc} onClick={askDelete}>🗑</button>
      <Button variant="ghost" size="sm" title={t("doc_import_title")} data-testid="doc-import" onClick={() => fileRef.current?.click()}>{t("doc_import_btn")}</Button>
      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} multiple hidden data-testid="doc-import-input" aria-label="Choose files to import"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) startImport(files); }} />
      <Button variant="ghost" size="sm" title={t(isSource ? "org_btn_title_src" : "org_btn_title_own")} data-testid="doc-origin" disabled={!currentDoc} onClick={() => { void toggleOrigin(); }}>{t(isSource ? "org_btn_src" : "org_btn_own")}</Button>

      <Dialog open={dialog === "new" || dialog === "rename"} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-sm" data-testid="doc-name-dialog">
          <form onSubmit={(e) => { e.preventDefault(); void (dialog === "new" ? create() : rename()); }}>
            <DialogHeader><DialogTitle>{dialog === "new" ? "Name for the new document:" : "Rename this document:"}</DialogTitle></DialogHeader>
            <Input className="my-4" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus aria-label={dialog === "new" ? "Name for the new document" : "Rename this document"} data-testid="doc-name-input" />
            <DialogFooter>
              <Button type="button" variant="ghost" size="md" onClick={close}>{t("sap_cancel_btn")}</Button>
              <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="doc-name-ok">OK</Button>
            </DialogFooter>
          </form>
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

/** One document in the list, under its opened title ("Locked title" while the vault is locked). */
function DocOption({ doc }: { doc: DocumentSummary }) {
  const title = useTitle(doc, "document");
  return <option value={doc.id}>{doc.kind === "source" ? "📄 " : ""}{title.text}</option>;
}
