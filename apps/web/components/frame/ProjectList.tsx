"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { projectKeyId, titleText, useTitle } from "@/lib/vault/titles";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject, type Project } from "./ProjectContext";

/**
 * All projects, for now (ruling R4): each project's opened title with Open, Mark complete or Reopen, and Delete; "New project" (first run) and
 * the scratch space. Finished projects come last. Task 8 replaces it with the list of six stage states each.
 */
export function ProjectList() {
  const t = useT();
  const vault = useVault();
  const { openProject } = useProject();
  const [list, setList] = useState<Project[] | null>(null);
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmTitle = useTitle(confirm, "project");

  const load = useCallback(async () => { setList(await apiFetch<Project[]>("/projects")); }, []);
  useEffect(() => {
    let live = true;
    apiFetch<Project[]>("/projects").then((l) => { if (live) setList(l); }, () => { if (live) setList([]); });
    return () => { live = false; };
  }, []);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch { toast("That did not work. Try again."); } finally { setBusy(false); }
  }
  const toggle = (p: Project) => run(async () => {
    const complete = p.status !== "complete";
    await apiFetch(`/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ status: complete ? "complete" : "active" }) });
    await load();
    toast((await titleText(vault, p, projectKeyId(p.id), t("title_locked"))) + t(complete ? "toast_marked_complete" : "toast_reopened"));
  });
  const remove = (p: Project) => run(async () => {
    await apiFetch(`/projects/${p.id}`, { method: "DELETE" });
    setConfirm(null);
    await load();
  });
  const rows = list ? [...list.filter((p) => p.status !== "complete"), ...list.filter((p) => p.status === "complete")] : null;

  return (
    <section className="list-interim" data-testid="project-list">
      <div className="list-head">
        <h1>{t("switcher_all")}</h1>
        <Button asChild variant="primary"><Link href="/start" data-testid="new-project">{t("projects_new")}</Link></Button>
      </div>
      {rows && rows.length === 0 && <p className="place-note" data-testid="projects-empty">{t("projects_none")}</p>}
      <ul className="list-rows">
        {rows?.map((p) => (
          <li key={p.id} data-testid="project-row">
            <span className="name" data-testid="project-row-title"><Name project={p} /></span>
            {p.status === "complete" && <Badge variant="ok">{t("projects_finished")}</Badge>}
            <span className="acts">
              <Button variant="primary" size="sm" disabled={busy} data-testid="project-open" onClick={() => { void run(async () => { await openProject(p.id); }); }}>{t("project_open_btn")}</Button>
              <Button variant="ghost" size="sm" disabled={busy} data-testid="project-complete" onClick={() => { void toggle(p); }}>{t(p.status === "complete" ? "project_reopen_btn" : "project_complete_btn")}</Button>
              <DeleteButton project={p} disabled={busy} onClick={() => setConfirm(p)} />
            </span>
          </li>
        ))}
        <li data-testid="scratch-row">
          <span className="name">{t("scratch_name")}</span>
          <span className="acts"><Button variant="ghost" size="sm" disabled={busy} data-testid="scratch-space" onClick={() => { void run(async () => { await openProject(null); }); }}>{t("project_open_btn")}</Button></span>
        </li>
      </ul>
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent data-testid="project-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{confirmTitle.text}&quot; and its documents permanently?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("sap_cancel_btn")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} data-testid="project-delete-yes" onClick={(e) => { e.preventDefault(); if (confirm) void remove(confirm); }}>{t("sh2_delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** "Delete", named for a screen reader by the project's opened title. */
function DeleteButton({ project, disabled, onClick }: { project: Project; disabled: boolean; onClick(): void }) {
  const t = useT();
  const name = useTitle(project, "project").text;
  return <Button variant="ghost" size="sm" disabled={disabled} aria-label={t("project_delete_label", { name })} data-testid="project-delete" onClick={onClick}>{t("sh2_delete")}</Button>;
}

function Name({ project }: { project: Project }) {
  return <>{useTitle(project, "project").text}</>;
}
