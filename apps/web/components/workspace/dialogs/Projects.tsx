"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { plain, useT } from "@/lib/i18n";
import { plural, relativeTime } from "@/lib/format";
import { isStageKey } from "@/lib/tools";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useWorkspace, type Project } from "../WorkspaceContext";

type Summary = Project & { documentCount: number; lastEditedAt: string | null };

export function Projects() {
  const { dialog, closeDialog } = useWorkspace();
  return (
    <Dialog open={dialog === "projects"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-w-2xl" data-testid="projects-dialog">
        {dialog === "projects" && <List />}
      </DialogContent>
    </Dialog>
  );
}

function List() {
  const t = useT();
  const { project, setActiveProject, reloadProject, closeDialog } = useWorkspace();
  const [list, setList] = useState<Summary[] | null>(null);
  const [confirm, setConfirm] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setList(await apiFetch<Summary[]>("/projects")); }, []);
  useEffect(() => {
    let live = true;
    apiFetch<Summary[]>("/projects").then((l) => { if (live) setList(l); }, () => { if (live) setList([]); });
    return () => { live = false; };
  }, []);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch { toast("That did not work. Try again."); } finally { setBusy(false); }
  }
  const open = (p: Summary) => run(async () => { await setActiveProject(p.id); closeDialog(); });
  const toggle = (p: Summary) => run(async () => {
    const complete = p.status !== "complete";
    await apiFetch(`/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ status: complete ? "complete" : "active" }) });
    if (project?.id === p.id) await reloadProject();
    await load();
    toast(p.title + t(complete ? "toast_marked_complete" : "toast_reopened"));
  });
  const remove = (p: Summary) => run(async () => {
    // Leave the project first so the workspace is never pointing at a project that no longer exists.
    if (project?.id === p.id) await setActiveProject(null);
    await apiFetch(`/projects/${p.id}`, { method: "DELETE" });
    setConfirm(null);
    await load();
  });
  const scratch = () => run(async () => { await setActiveProject(null); closeDialog(); });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-purple-800">{t("projects_dlg_h2")}</DialogTitle>
        <DialogDescription className="sr-only">{plain(t("projects_btn"))}</DialogDescription>
      </DialogHeader>
      {list && list.length === 0 && <p className="text-sm text-muted-foreground" data-testid="projects-empty">{t("projects_empty")}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3" data-testid="project-row">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium" data-testid="project-row-title">{p.title}</span>
                {isStageKey(p.stage) && <Badge variant="stage">{t("stage_" + p.stage)}</Badge>}
                {p.status === "complete" && <Badge variant="ok">{t("project_complete_badge")}</Badge>}
                {project?.id === p.id && <Badge variant="chip">{t("project_currently_open")}</Badge>}
              </div>
              <div className="text-[13px] text-muted-foreground">{plural(p.documentCount, "document", "documents")} · {relativeTime(p.lastEditedAt)}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="primary" size="sm" disabled={busy} data-testid="project-open" onClick={() => { void open(p); }}>{t("project_open_btn")}</Button>
              <Button variant="ghost" size="sm" disabled={busy} data-testid="project-complete" onClick={() => { void toggle(p); }}>{t(p.status === "complete" ? "project_reopen_btn" : "project_complete_btn")}</Button>
              <Button variant="ghost" size="sm" disabled={busy} aria-label={`Delete ${p.title}`} data-testid="project-delete" onClick={() => setConfirm(p)}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="ghost" disabled={busy} data-testid="scratch-space" onClick={() => { void scratch(); }}>Work in scratch space</Button>
      </div>
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent data-testid="project-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{confirm?.title}&quot; and its documents permanently?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("sap_cancel_btn")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} data-testid="project-delete-yes" onClick={(e) => { e.preventDefault(); if (confirm) void remove(confirm); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
