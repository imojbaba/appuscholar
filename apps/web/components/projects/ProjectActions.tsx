"use client";
import { useRef, useState } from "react";
import { ArrowCounterClockwise, CheckCircle, DotsThree, PencilSimple, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useT } from "@/lib/i18n";

export function ProjectActions({ title, documentCount, status, onRename, onDelete, onStatus }: { title: string; documentCount: number; status: string; onRename: (t: string) => Promise<void>; onDelete: () => Promise<void>; onStatus: (s: "active" | "complete") => Promise<void> }) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusBusy, setStatusBusy] = useState<"complete" | "active" | null>(null);
  const [statusError, setStatusError] = useState("");
  async function run(fn: () => Promise<void>, close: () => void, failure: string) {
    setBusy(true); setError("");
    try { await fn(); close(); } catch { setError(failure); } finally { setBusy(false); }
  }
  async function changeStatus(next: "active" | "complete") {
    if (statusBusy) return;
    setStatusBusy(next); setStatusError("");
    try { await onStatus(next); } catch { setStatusError("Could not update the project. Try again."); } finally { setStatusBusy(null); }
  }
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Dialogs opened from the menu hand focus back to the menu button when they close, not to the page body.
  const returnFocus = (e: Event) => { e.preventDefault(); triggerRef.current?.focus(); };
  function openRename() { setError(""); setStatusError(""); setDraft(title); setRenaming(true); }
  function openDelete() { setError(""); setStatusError(""); setDeleting(true); }
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {status === "complete"
          ? <Button type="button" variant="secondary" size="sm" onClick={() => { void changeStatus("active"); }} disabled={statusBusy !== null} aria-busy={statusBusy !== null} data-testid="project-reopen"><ArrowCounterClockwise size={18} /> {statusBusy === "active" ? "Reopening…" : t("project_reopen_btn")}</Button>
          : <Button type="button" variant="secondary" size="sm" onClick={() => { void changeStatus("complete"); }} disabled={statusBusy !== null} aria-busy={statusBusy !== null} data-testid="project-complete"><CheckCircle size={18} /> {statusBusy === "complete" ? "Marking complete…" : t("project_complete_btn")}</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={triggerRef} variant="ghost" size="icon" aria-label={`Actions for ${title}`} data-testid="project-actions"><DotsThree size={20} weight="bold" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={openRename} data-testid="project-rename"><PencilSimple size={18} /> Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={openDelete} className="text-destructive" data-testid="project-delete"><Trash size={18} /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {statusBusy ? <p role="status" className="sr-only">{statusBusy === "complete" ? "Marking complete…" : "Reopening…"}</p> : null}
      {statusError ? <p role="alert" data-testid="error-msg" className="max-w-48 text-right text-xs text-destructive">{statusError}</p> : null}

      <Dialog open={renaming} onOpenChange={o => { if (!o) setError(""); setRenaming(o); }}>
        <DialogContent onCloseAutoFocus={returnFocus}>
          <form onSubmit={e => { e.preventDefault(); if (draft.trim()) void run(() => onRename(draft.trim()), () => setRenaming(false), "That did not save. Try again."); }} className="grid gap-4">
            <DialogHeader><DialogTitle>Rename project</DialogTitle><DialogDescription>Documents and history are kept.</DialogDescription></DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="rename">Project title</Label>
              <Input id="rename" value={draft} onChange={e => setDraft(e.target.value)} maxLength={200} autoFocus data-testid="rename-input" />
            </div>
            {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setError(""); setRenaming(false); }} disabled={busy}>{t("sap_cancel_btn")}</Button>
              <Button type="submit" disabled={busy || !draft.trim()} data-testid="rename-save">{busy ? "Saving…" : t("sap_save_btn")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={o => { if (!o) setError(""); setDeleting(o); }}>
        <AlertDialogContent onCloseAutoFocus={returnFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {documentCount > 0 ? `This removes the project and its ${documentCount} document${documentCount === 1 ? "" : "s"} with all their revisions.` : "This removes the project."} This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void run(onDelete, () => setDeleting(false), "Could not delete the project. Try again."); }} disabled={busy} variant="destructive" data-testid="delete-confirm">{busy ? "Deleting…" : "Delete project"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
