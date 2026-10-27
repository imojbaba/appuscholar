"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { contentLangOf } from "@/lib/ai/contentLang";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { FieldPicker } from "@/components/frame/FieldPicker";
import { OpenAlexKeyField } from "@/components/workspace/OpenAlexKeyField";
import { SettingsPack } from "./SettingsPack";
import { SettingsWritingSamples } from "./SettingsWritingSamples";

/**
 * Settings (the account menu): what waits until it is needed (first-run build spec, OJ 2026-10-27, step 7). The AI key is not here: it is Connect AI's
 * (dialogs/ConnectAI). The window's words are in the dictionaries (Q9).
 */
export function SettingsWindow() {
  const { dialog, closeDialog } = useProject();
  return (
    <Dialog open={dialog === "settings"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto" data-testid="settings-dialog">
        {dialog === "settings" && <Form />}
      </DialogContent>
    </Dialog>
  );
}

function Form() {
  const t = useT();
  const { settings, update } = useSettings();
  const { project, reloadProject, openTerms } = useProject();
  const [orcid, setOrcid] = useState(settings.orcid ?? "");
  const contentLang = contentLangOf(project, settings);
  async function setLang(v: "en" | "hi") {
    try {
      if (project) { await apiFetch(`/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ contentLang: v }) }); await reloadProject(); }
      else await update({ contentLang: v });
      toast(t(v === "hi" ? "settings_contentlang_set_hi" : "settings_contentlang_set_en"));
    } catch { toast(t("settings_contentlang_fail")); }
  }
  function saveOrcid() {
    const v = orcid.trim();
    setOrcid(v);
    if (v !== (settings.orcid ?? "")) void update({ orcid: v });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-purple-800">{t("settings_h2")}</DialogTitle>
        <DialogDescription>{t("settings_intro")}</DialogDescription>
      </DialogHeader>

      <div className="field !mb-0">
        <FieldPicker />
        <p className="m-0 text-[13px] text-muted-foreground">{t("settings_field_desc")}</p>
      </div>

      <div className="field !mb-0 border-t border-line pt-3">
        <label htmlFor="contentLangSel">{t("settings_contentlang_label")}</label>
        <select className="input" id="contentLangSel" value={contentLang} onChange={(e) => { void setLang(e.target.value === "hi" ? "hi" : "en"); }} data-testid="content-lang">
          <option value="en">{t("settings_contentlang_en")}</option>
          <option value="hi">{t("settings_contentlang_hi")}</option>
        </select>
        <p className="m-0 text-[13px] text-muted-foreground">{t("settings_contentlang_desc")}</p>
      </div>
      <SettingsPack />

      <div className="field !mb-0 border-t border-line pt-3">
        <label htmlFor="orcidIn">{t("settings_orcid_label")}</label>
        <input className="input" id="orcidIn" type="text" placeholder="0000-0000-0000-0000" maxLength={40} value={orcid} onChange={(e) => setOrcid(e.target.value)} onBlur={saveOrcid} data-testid="orcid-input" />
        <p className="m-0 text-[13px]"><a href="https://orcid.org/register" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-purple-800 underline">{t("settings_orcid_link")}</a></p>
      </div>

      <div className="border-t border-line pt-3">
        <OpenAlexKeyField />
      </div>

      <SettingsWritingSamples />

      <div className="field !mb-0 border-t border-line pt-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.aiFallback !== false} onChange={(e) => { void update({ aiFallback: e.target.checked }); }} data-testid="ai-fallback" />
          <span>{t("settings_fallback_label")}</span>
        </label>
        <p className="m-0 text-[13px] text-muted-foreground">{t("settings_fallback_desc")}</p>
      </div>

      <div className="field !mb-0 border-t border-line pt-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={!settings.aiLogOff} onChange={(e) => { void update({ aiLogOff: !e.target.checked }); }} data-testid="ai-log" />
          <span>{t("settings_log_label")}</span>
        </label>
        <p className="m-0 text-[13px] text-muted-foreground">{t("settings_log_desc")}</p>
      </div>

      <div>
        <Button variant="ghost" data-testid="terms-link" onClick={openTerms}>{t("terms_reopen_btn")}</Button>
      </div>
    </>
  );
}
