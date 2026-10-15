"use client";
import { useState } from "react";
import { ArrowCounterClockwise, CheckCircle, DotsThree, PencilSimple, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function ProjectActions({ title, documentCount, status, onRename, onDelete, onStatus }: { title: string; documentCount: number; status: string; onRename: (t: string) => Promise<void>; onDelete: () => Promise<void>; onStatus: (s: "active" | "complete") => Promise<void> }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<void>, close: () => void) {
    setBusy(true); setError("");
    try { await fn(); close(); } catch { setError("That did not save. Try again."); } finally { setBusy(false); }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${title}`} data-testid="project-actions"><DotsThree size={20} weight="bold" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setDraft(title); setRenaming(true); }} data-testid="project-rename"><PencilSimple size={18} /> Rename</DropdownMenuItem>
          {status === "complete"
            ? <DropdownMenuItem onSelect={() => { void onStatus("active"); }} data-testid="project-reopen"><ArrowCounterClockwise size={18} /> Reopen</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => { void onStatus("complete"); }} data-testid="project-complete"><CheckCircle size={18} /> Mark complete</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setDeleting(true)} className="text-destructive" data-testid="project-delete"><Trash size={18} /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); if (draft.trim()) void run(() => onRename(draft.trim()), () => setRenaming(false)); }} className="grid gap-4">
            <DialogHeader><DialogTitle>Rename project</DialogTitle><DialogDescription>Documents and history are kept.</DialogDescription></DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="rename">Project title</Label>
              <Input id="rename" value={draft} onChange={e => setDraft(e.target.value)} maxLength={200} autoFocus data-testid="rename-input" />
            </div>
            {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy || !draft.trim()} data-testid="rename-save">{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {documentCount > 0 ? `This removes the project and its ${documentCount} document${documentCount === 1 ? "" : "s"} with all their revisions.` : "This removes the project."} This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void run(onDelete, () => setDeleting(false)); }} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90" data-testid="delete-confirm">{busy ? "Deleting…" : "Delete project"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
