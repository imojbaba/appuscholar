"use client";
import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { contentLangOf } from "@/lib/ai/contentLang";
import { FIELD_LIST, OTHER_FIELD, cleanField, currentField, fieldKey } from "@/lib/fields";
import { STUDY_TYPES, studyTypeKey, type StudyType } from "@/lib/frame/studyTypes";
import { listOrSeed } from "@/lib/frame/firstDocument";
import { markJustMade } from "@/lib/frame/justMade";
import { useVault } from "@/lib/vault/useVault";
import { newProjectKeyId, sealTitle } from "@/lib/vault/titles";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject, type Project } from "./ProjectContext";

/**
 * Start a new study (start-a-study spec, OJ 2026-10-27): the only required things, a name, a type and a field, then the study is made and opens on
 * Shape your study. Everything else is asked there, and any of it can be skipped. The name is sealed as before (under a new project's key id; a
 * cancelled unlock makes nothing); the field starts as the account's.
 * `moveDocId` (the document bar's Move to project, `/start?move=<id>`): that document moves into the new study, which then opens on it.
 */
export function NewStudy({ moveDocId }: { moveDocId?: string }) {
  const t = useT();
  const vault = useVault();
  const { settings } = useSettings();
  const { openProject } = useProject();
  const [name, setName] = useState("");
  const [type, setType] = useState<StudyType | null>(null);
  const start = currentField(settings.field);
  const [field, setField] = useState(FIELD_LIST.includes(start) ? start : OTHER_FIELD);
  const [custom, setCustom] = useState(FIELD_LIST.includes(start) ? "" : start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the study exists, so a retry after a later step failed never makes a second one.
  const [made, setMade] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const title = name.trim();
    const chosenField = field === OTHER_FIELD ? cleanField(custom) : field;
    if (!title) { setError(t("new_need_name")); return; }
    if (!type) { setError(t("new_need_type")); return; }
    if (!chosenField) { setError(t("new_need_field")); return; }
    setError(null);
    setBusy(true);
    try {
      let id = made;
      if (!id) {
        if ((await vault.known()) !== "off" && !(await vault.ensureUnlocked())) { toast(t("vault_save_locked")); return; }
        const sealed = await sealTitle(vault, newProjectKeyId(), [], title);
        id = (await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ ...sealed, type, field: chosenField }) })).id;
        setMade(id);
        // A new study writes in English unless the student's default (or, never set, the page's language) is Hindi.
        if (contentLangOf(null, settings) === "hi") await apiFetch(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ contentLang: "hi" }) });
      }
      // A move is idempotent, so a retry moves again harmlessly; the moved document is then the study's first, and none is made.
      if (moveDocId) await apiFetch(`/documents/${moveDocId}/move`, { method: "POST", body: JSON.stringify({ projectId: id }) });
      await listOrSeed(id, vault);
      // The home says once, on the first visit, what is at the top of the page.
      markJustMade(id, false);
      await openProject(id, moveDocId ? { docId: moveDocId } : { place: "idea" });
    } catch {
      toast(t("start_fail"));
    } finally { setBusy(false); }
  }

  return (
    <section className="new-study" data-testid="new-study">
      <h1>{t("new_h")}</h1>
      <p className="place-note">{t("new_lead")}</p>
      {moveDocId && <p className="place-note" data-testid="start-move-note">{t("start_move_note")}</p>}
      <form onSubmit={(e) => { void create(e); }} noValidate>
        <div className="field">
          <label htmlFor="newName">{t("new_name")}</label>
          <input className="input" id="newName" data-testid="new-name" value={name} maxLength={200} autoFocus placeholder={t("new_name_ph")}
            aria-describedby="newNameHint" onChange={(e) => setName(e.target.value)} disabled={busy} />
          <p className="field-hint" id="newNameHint">{t("new_name_hint")}</p>
        </div>
        <fieldset className="field new-types" disabled={busy}>
          <legend>{t("new_type")}</legend>
          {STUDY_TYPES.map((k) => (
            <label key={k} className="new-type">
              <input type="radio" name="studyType" value={k} checked={type === k} onChange={() => setType(k)} data-testid={"new-type-" + k} />
              <span>{t(studyTypeKey(k))}</span>
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="newField">{t("new_field")}</label>
          <select className="input" id="newField" value={field} onChange={(e) => setField(e.target.value)} disabled={busy} data-testid="new-field">
            {FIELD_LIST.map((f) => <option key={f} value={f}>{t(fieldKey(f))}</option>)}
            <option value={OTHER_FIELD}>{t("settings_field_other")}</option>
          </select>
          {field === OTHER_FIELD && <input className="input mt-1.5" type="text" maxLength={60} placeholder={t("settings_field_custom")} aria-label={t("settings_field_custom")}
            value={custom} onChange={(e) => setCustom(e.target.value)} disabled={busy} data-testid="new-field-custom" />}
        </div>
        <p role="alert" className="new-error" data-testid="new-error">{error ?? ""}</p>
        <div className="new-acts">
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy || undefined} data-testid="new-create">{t(busy ? "new_creating" : "new_create")}</Button>
          <Button asChild variant="ghost"><Link href="/projects" data-testid="new-cancel">{t("new_cancel")}</Link></Button>
        </div>
      </form>
    </section>
  );
}
