"use client";
import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLang, useT, type Lang } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useVault } from "@/lib/vault/useVault";
import { projectKeyId, titleText, useTitle } from "@/lib/vault/titles";
import { stageOfKind, stageStates, type StageState } from "@/lib/frame/stages";
import { stateSummary } from "@/lib/frame/stateSummary";
import { useProjectWork, type ProjectWork } from "@/lib/frame/useProjectWork";
import { homeHref, placeHref } from "@/lib/frame/places";
import { STAGE_ORDER } from "@/lib/tools";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject } from "./ProjectContext";

type T = ReturnType<typeof useT>;

/** The last time the project was worked on (R9): the newest of the draft, the work blobs (not caches or preferences) and its creation. */
export function lastEdited(w: ProjectWork): string {
  const times = [w.createdAt, ...(w.draftEditedAt ? [w.draftEditedAt] : []), ...w.blobs.filter((b) => stageOfKind(b.kind)?.work).map((b) => b.updatedAt)];
  return times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

/** "today", "yesterday", or the day as "5 Mar 2026", in the browser's time zone. */
export function editedDay(iso: string, now: Date, t: T, lang: Lang): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toDateString();
  if (day(d) === day(now)) return t("list_today");
  if (day(d) === day(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return t("list_yesterday");
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * All projects (canvas Projects), from one `GET /projects?include=work`: each row is the opened title, "{field}. Edited {date}." and six bars
 * with a spoken summary. The states come from metadata, so they show while the vault is locked, each title then "Locked title". Finished
 * projects come last; the scratch space is the last row. Each row can be marked finished (or reopened) and deleted.
 */
export function ProjectList() {
  const t = useT();
  const vault = useVault();
  const { me } = useSettings();
  const { openProject } = useProject();
  const { work, reload } = useProjectWork();
  const [confirm, setConfirm] = useState<ProjectWork | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmTitle = useTitle(confirm, "project");

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch { toast("That did not work. Try again."); } finally { setBusy(false); }
  }
  const toggle = (p: ProjectWork) => run(async () => {
    const complete = p.status !== "complete";
    await apiFetch(`/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ status: complete ? "complete" : "active" }) });
    await reload();
    toast((await titleText(vault, p, projectKeyId(p.id), t("title_locked"))) + t(complete ? "toast_marked_complete" : "toast_reopened"));
  });
  const remove = (p: ProjectWork) => run(async () => {
    await apiFetch(`/projects/${p.id}`, { method: "DELETE" });
    setConfirm(null);
    await reload();
  });
  const open = (id: string | null) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    void run(async () => { await openProject(id); });
  };
  const rows = work ? [...work.filter((p) => p.status !== "complete"), ...work.filter((p) => p.status === "complete")] : null;
  const scratchId = me?.scratchProjectId;

  return (
    <section className="plist" data-testid="project-list">
      <div className="plist-head">
        <h1>{t("list_title")}</h1>
        <Button asChild variant="primary"><Link href="/start" data-testid="new-project">{t("projects_new")}</Link></Button>
      </div>
      <VaultLine />
      {rows && rows.length === 0 && <p className="place-note" data-testid="projects-empty">{t("projects_none")}</p>}
      <ul role="list" className="plist-rows">
        {rows?.map((p) => (
          <li key={p.id} className="plist-row" data-testid="project-row">
            <Link href={homeHref(p.id)} className="plist-open" data-testid="project-open" onClick={open(p.id)}>
              <span className="plist-text">
                <span className="plist-name"><span data-testid="project-row-title"><Name project={p} /></span>
                  {p.status === "complete" && <Badge variant="ok">{t("projects_finished")}</Badge>}</span>
                <span className="plist-meta" data-testid="project-row-meta"><Meta project={p} /></span>
              </span>
              <Bars states={stageStates(p)} />
            </Link>
            <span className="plist-acts">
              <Button variant="ghost" size="sm" disabled={busy} data-testid="project-complete" onClick={() => { void toggle(p); }}>{t(p.status === "complete" ? "project_reopen_btn" : "project_complete_btn")}</Button>
              <DeleteButton project={p} disabled={busy} onClick={() => setConfirm(p)} />
            </span>
          </li>
        ))}
        <li className="plist-row" data-testid="scratch-row">
          <Link href={scratchId ? placeHref(scratchId, "writing") : "/projects"} className="plist-open" data-testid="scratch-space" onClick={open(null)}>
            <span className="plist-text"><span className="plist-name">{t("scratch_name")}</span></span>
          </Link>
        </li>
      </ul>
      <ul className="plist-legend" aria-label={t("list_legend")} data-testid="list-legend">
        {(["ready", "in-progress", "started-early", "not-started"] as const).map((s) => (
          <li key={s}><span className="plist-bar" data-state={s} aria-hidden="true" />{t(LEGEND[s])}</li>
        ))}
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

/** The legend's words; started early and reopened share a colour. */
const LEGEND: Record<"ready" | "in-progress" | "started-early" | "not-started", string> = {
  ready: "list_legend_ready", "in-progress": "list_legend_progress", "started-early": "list_legend_early", "not-started": "list_legend_none"
};

/** The six bars with their short names, read out as one summary ("Idea ready; literature in progress"). */
function Bars({ states }: { states: Record<(typeof STAGE_ORDER)[number], StageState> }) {
  const t = useT();
  return (
    <span className="plist-bars" role="img" aria-label={stateSummary(states, t)} data-testid="stage-bars">
      {STAGE_ORDER.map((s) => (
        <span key={s} className="plist-stage" aria-hidden="true">
          <span className="plist-bar" data-state={states[s]} data-testid="stage-bar" />
          <span className="plist-stage-name">{t("list_stage_" + s)}</span>
        </span>
      ))}
    </span>
  );
}

/** "{field}. Edited {date}.", or "Edited {date}." for a project with no field. */
function Meta({ project }: { project: ProjectWork }) {
  const t = useT();
  const { lang } = useLang();
  const date = editedDay(lastEdited(project), new Date(), t, lang);
  return <>{project.field ? t("list_meta", { field: project.field, date }) : t("list_meta_nofield", { date })}</>;
}

/** The vault's line above the list: the titles are locked to the student, locked now (with Unlock), or readable on the server. */
function VaultLine() {
  const t = useT();
  const vault = useVault();
  if (vault.status === "loading") return null;
  if (vault.status === "off") return <p className="plist-vault" data-state="off" data-testid="list-vault-line">{t("list_vault_off")}</p>;
  if (vault.status === "locked") {
    return (
      <div className="plist-vault-row">
        <p className="plist-vault" data-state="locked" data-testid="list-vault-line">{t("list_vault_locked")}</p>
        <Button variant="ghost" size="sm" data-testid="list-unlock" onClick={() => { void vault.ensureUnlocked(); }}>{t("list_unlock")}</Button>
      </div>
    );
  }
  return <p className="plist-vault" data-state="on" data-testid="list-vault-line">{t("list_vault_on")}</p>;
}

/** "Delete", named for a screen reader by the project's opened title. */
function DeleteButton({ project, disabled, onClick }: { project: ProjectWork; disabled: boolean; onClick(): void }) {
  const t = useT();
  const name = useTitle(project, "project").text;
  return <Button variant="ghost" size="sm" disabled={disabled} aria-label={t("project_delete_label", { name })} data-testid="project-delete" onClick={onClick}>{t("sh2_delete")}</Button>;
}

function Name({ project }: { project: ProjectWork }) {
  return <>{useTitle(project, "project").text}</>;
}
