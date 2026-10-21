"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { newProjectKeyId, sealTitle } from "@/lib/vault/titles";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject, type Project } from "./ProjectContext";

/**
 * First run, for now: name a project and open it, or write without one (the scratch space). Task 9 makes it the rough idea, its feasibility
 * read and "Save as my project". With a vault the name is sealed (Task 5), so the vault opens first; a cancelled unlock creates nothing.
 */
export function FirstRun() {
  const t = useT();
  const vault = useVault();
  const { openProject } = useProject();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Set once the project exists, so a retry after a failed open never creates a second one.
  const [made, setMade] = useState<string | null>(null);

  async function create() {
    if (busy) return;
    const title = name.trim();
    if (!title) { toast(t("start_name_first")); return; }
    setBusy(true);
    try {
      let id = made;
      if (!id) {
        if ((await vault.known()) !== "off" && !(await vault.ensureUnlocked())) { toast(t("vault_save_locked")); return; }
        id = (await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify(await sealTitle(vault, newProjectKeyId(), [], title)) })).id;
        setMade(id);
      }
      await openProject(id);
    } catch {
      toast(t("start_fail"));
    } finally { setBusy(false); }
  }

  return (
    <section className="start-interim" data-testid="first-run">
      <h1>{t("start_h")}</h1>
      <div className="field">
        <label htmlFor="startName">{t("start_name_label")}</label>
        <input className="input" id="startName" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} data-testid="start-name" />
      </div>
      <div className="place-row">
        <Button variant="primary" disabled={busy} data-testid="start-create" onClick={() => { void create(); }}>{t("start_create")}</Button>
        <Button variant="ghost" disabled={busy} data-testid="start-scratch" onClick={() => { void openProject(null).catch(() => toast(t("switch_fail"))); }}>{t("start_scratch")}</Button>
      </div>
    </section>
  );
}
