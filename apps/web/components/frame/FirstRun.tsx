"use client";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { newProjectKeyId, sealTitle } from "@/lib/vault/titles";
import { projectBlobClient } from "@/lib/blobs/useProjectBlob";
import type { IdeaIntake } from "@/lib/blobs/kinds";
import { ideaTitle } from "@/lib/frame/ideaRead";
import { listOrSeed } from "@/lib/frame/firstDocument";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { EMPTY_INTAKE, IdeaForm, IdeaReadPanel, useIdeaCheck, type IdeaFields, type IdeaReadValue } from "@/components/places/IdeaPlace";
import { useProject, type Project } from "./ProjectContext";

/**
 * First run (canvas Start): the rough idea and three questions to sharpen it (v1's four idea_intake fields), "Check if it is doable" (the Idea place's
 * check), and "Save as my project": the project is created with its name sealed (Task 5, under a new project's key id; a cancelled unlock creates
 * nothing), the idea and its read are stored as its idea_intake, its first document is made, and it opens (recorded as active, its home shown).
 * Saving does not need the read, so a student with no AI key yet can start a project and check the idea later in the Idea place.
 * `moveDocId` (from the document bar's Move to project, `/start?move=<id>`): that document moves into the project created here, which opens on it.
 */
export function FirstRun({ moveDocId }: { moveDocId?: string }) {
  const t = useT();
  const vault = useVault();
  const { openProject } = useProject();
  const { busy: checking, check } = useIdeaCheck();
  const [intake, setIntake] = useState<IdeaFields>(EMPTY_INTAKE);
  const [read, setRead] = useState<IdeaReadValue | null>(null);
  // The name follows the idea until the student types one of their own.
  const [ownName, setOwnName] = useState<string | null>(null);
  const name = ownName ?? ideaTitle(intake.topic);
  const [busy, setBusy] = useState(false);
  // Set once the project exists, so a retry after a later step failed never creates a second one.
  const [made, setMade] = useState<string | null>(null);
  const topicRef = useRef<HTMLTextAreaElement>(null);

  async function run() {
    const r = await check(intake);
    if (r) setRead(r);
  }

  async function save() {
    if (busy || checking) return;
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
      // The idea goes in as the project's idea_intake, sealed under the blob's own key like any later save of the Idea place.
      const value: IdeaIntake = read ? { ...intake, read } : intake;
      const c = projectBlobClient("idea_intake", id, () => vault, () => {}, { headless: true });
      c.set(value);
      try { if (!(await c.flush())) throw new Error("idea-not-saved"); } finally { c.dispose(); }
      // A move is idempotent, so a retry moves again harmlessly; the moved document is then the project's first, and none is made.
      if (moveDocId) await apiFetch(`/documents/${moveDocId}/move`, { method: "POST", body: JSON.stringify({ projectId: id }) });
      await listOrSeed(id, vault);
      await openProject(id, moveDocId ? { docId: moveDocId } : {});
    } catch {
      toast(t("start_fail"));
    } finally { setBusy(false); }
  }

  const saveBlock = (
    <>
      <div className="field">
        <label htmlFor="ideaSaveTitle">{t("idea_save_title")}</label>
        <input className="input" id="ideaSaveTitle" data-testid="idea-save-title" value={name} maxLength={200} onChange={(e) => setOwnName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
      </div>
      <div className="ai-read-acts">
        <Button variant="primary" disabled={busy || checking} data-testid="idea-save" onClick={() => { void save(); }}>{t("idea_save_btn")}</Button>
        {read && <Button variant="ghost" data-testid="idea-edit" onClick={() => topicRef.current?.focus()}>{t("idea_edit_btn")}</Button>}
      </div>
    </>
  );

  return (
    <section className="idea-place start" data-testid="first-run">
      <div className="idea-main">
        {moveDocId && <p className="place-note" data-testid="start-move-note">{t("start_move_note")}</p>}
        <IdeaForm intake={intake} onEdit={(key, v) => setIntake((prev) => ({ ...prev, [key]: v }))} waiting={busy} opening={false} busy={checking} onCheck={() => void run()} topicRef={topicRef} level={1} />
      </div>
      <aside className="idea-aside">
        {read ? <IdeaReadPanel read={read}>{saveBlock}</IdeaReadPanel> : (
          <div className="idea-save-plain">
            <p className="idea-note">{t("idea_save_unchecked")}</p>
            {saveBlock}
          </div>
        )}
        <p className="idea-note" data-testid="idea-save-after">{t("idea_save_after")}</p>
      </aside>
    </section>
  );
}
