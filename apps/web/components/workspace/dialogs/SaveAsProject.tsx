"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { plain, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useVault } from "@/lib/vault/useVault";
import { newProjectKeyId, sealTitle, useTitle } from "@/lib/vault/titles";
import { runCreateFlow, type SaveAsProgress } from "@/lib/saveAsFlow";
import { STAGE_ORDER, TOOL_TO_STAGE, isStageKey, type StageKey } from "@/lib/tools";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useWorkspace, type Project } from "../WorkspaceContext";

type Summary = Project & { documentCount: number; lastEditedAt: string | null };

export function SaveAsProject() {
  const { dialog, closeDialog } = useWorkspace();
  return (
    <Dialog open={dialog === "saveAs"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-w-lg" data-testid="sap-dialog">
        {dialog === "saveAs" && <Form />}
      </DialogContent>
    </Dialog>
  );
}

/** v1 `saveAsProject`: a project is a label. Nothing the student wrote changes; the current document is filed under the project. */
function Form() {
  const t = useT();
  const { me } = useSettings();
  const vault = useVault();
  const { saveAsInit, activeTool, currentDoc, project, setActiveProject, openStageIntro, closeDialog } = useWorkspace();
  const [mode, setMode] = useState(saveAsInit.mode);
  const [name, setName] = useState(saveAsInit.name);
  const [stage, setStage] = useState<StageKey>(saveAsInit.guessStage ? TOOL_TO_STAGE[activeTool] ?? "idea" : "idea");
  // Survives a failed attempt, so Save again resumes instead of creating a second project.
  const progress = useRef<SaveAsProgress>({});
  const [open, setOpen] = useState<Summary[] | null>(null);
  const [existingId, setExistingId] = useState("");
  const [busy, setBusy] = useState(false);
  const targetTitle = useTitle(open?.find((p) => p.id === existingId) ?? null, "project");

  useEffect(() => {
    let live = true;
    apiFetch<Summary[]>("/projects").then((list) => {
      if (!live) return;
      const mine = list.filter((p) => p.status !== "complete");
      setOpen(mine);
      setExistingId((cur) => cur || (project && mine.some((p) => p.id === project.id) ? project.id : mine[0]?.id ?? ""));
    }, () => { if (live) setOpen([]); });
    return () => { live = false; };
  }, [project]);

  // Only a document that still lives in scratch space is filed under the project; one already inside a project stays where it is.
  const inScratch = !!currentDoc && !!me && currentDoc.projectId === me.scratchProjectId;

  async function save() {
    if (busy) return;
    if (mode === "new") {
      const title = name.trim();
      if (!title) { toast(t("toast_name_first")); return; }
      setBusy(true);
      // With a vault the project's name is sealed here, so the vault must be open first; a cancelled ask creates nothing.
      if ((await vault.known()) !== "off" && !(await vault.ensureUnlocked())) { toast(t("vault_save_locked")); setBusy(false); return; }
      try {
        const moveDoc = currentDoc && inScratch ? currentDoc : null;
        const made = await runCreateFlow(progress.current, {
          // Sealed under a placeholder key id (the project has no id yet); its dek travels with the create. The flow keeps the name as typed.
          create: async () => {
            const p = await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ ...(await sealTitle(vault, newProjectKeyId(), [], title)), stage }) });
            return { id: p.id, title };
          },
          move: moveDoc ? (id) => apiFetch(`/documents/${moveDoc.id}/move`, { method: "POST", body: JSON.stringify({ projectId: id }) }) : null,
          activate: async (id) => { await setActiveProject(id, { skipJump: true, docId: moveDoc?.id }); }
        });
        toast(t("toast_saved_as") + made.title);
        openStageIntro(stage);
      } catch {
        const done = progress.current;
        toast(done.projectId ? `Created "${done.title}"${done.moved ? " and moved your document into it" : ""}, but could not finish. Press Save to retry the rest.` : "Could not save the research project. Try again.");
        setBusy(false);
      }
    } else {
      const target = open?.find((p) => p.id === existingId);
      if (!target) { toast(t("toast_no_existing_project")); return; }
      setBusy(true);
      try {
        if (currentDoc && currentDoc.projectId !== target.id) await apiFetch(`/documents/${currentDoc.id}/move`, { method: "POST", body: JSON.stringify({ projectId: target.id }) });
        await setActiveProject(target.id, { skipJump: true, docId: currentDoc?.id });
        toast(t("toast_moved_into") + targetTitle.text);
        closeDialog();
      } catch { toast("Could not move the document. Try again."); setBusy(false); }
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-purple-800">{t("sap_h2")}</DialogTitle>
        <DialogDescription>{t("sap_desc")}</DialogDescription>
      </DialogHeader>
      <div role="radiogroup" aria-label={plain(t("sap_h2"))} className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="sap-mode" checked={mode === "new"} onChange={() => setMode("new")} data-testid="sap-mode-new" />{t("sap_mode_new")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="sap-mode" checked={mode === "existing"} onChange={() => setMode("existing")} data-testid="sap-mode-existing" />{t("sap_mode_existing")}</label>
      </div>
      {mode === "new" ? (
        <>
          <div className="field !mb-0">
            <label htmlFor="sapName">{t("sap_name_label")}</label>
            <input className="input" id="sapName" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("sap_name_placeholder")} maxLength={200} autoFocus data-testid="sap-name" onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          </div>
          <div className="field !mb-0">
            <label htmlFor="sapStage">{t("sap_stage_label")}</label>
            <select className="input" id="sapStage" value={stage} onChange={(e) => { if (isStageKey(e.target.value)) setStage(e.target.value); }} data-testid="sap-stage">
              {STAGE_ORDER.map((s) => <option key={s} value={s}>{t("stage_" + s)}</option>)}
            </select>
            {saveAsInit.guessStage && <p className="m-0 text-[13px] text-muted-foreground" data-testid="sap-stage-desc">{t("sap_stage_desc")}</p>}
          </div>
        </>
      ) : (
        <div className="field !mb-0">
          <label htmlFor="sapExisting">{t("sap_existing_label")}</label>
          <select className="input" id="sapExisting" value={existingId} onChange={(e) => setExistingId(e.target.value)} data-testid="sap-existing">
            {open && open.length === 0 && <option value="">{t("sap_no_open_projects")}</option>}
            {open?.map((p) => <ProjectOption key={p.id} project={p} />)}
          </select>
        </div>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={closeDialog} data-testid="sap-cancel">{t("sap_cancel_btn")}</Button>
        <Button variant="primary" disabled={busy} onClick={() => { void save(); }} data-testid="sap-save">{t("sap_save_btn")}</Button>
      </DialogFooter>
    </>
  );
}

function ProjectOption({ project }: { project: Summary }) {
  return <option value={project.id}>{useTitle(project, "project").text}</option>;
}
