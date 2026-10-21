"use client";
import { useState } from "react";
import { PROVIDERS, PROV_ORDER, type ProviderId } from "@appuscholar/core";
import { apiFetch } from "@/lib/api";
import { tHtml, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { cryptoOK, isProvider, keyStore, type KeyMode } from "@/lib/ai/keys";
import { toCallError } from "@/lib/ai/callAI";
import { useKeys } from "@/lib/ai/useKeys";
import { saveOpenAlexKey, useOpenAlexKey } from "@/lib/research/oaKey";
import { useVault } from "@/lib/vault/useVault";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecretInput } from "@/components/ui/secret-input";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { openVaultSetup } from "./VaultSetup";

/** v1 FIELD_LIST (index.html:2499). */
export const FIELD_LIST = ["psychology", "education", "sociology", "medicine and health", "nursing", "management and commerce", "law", "economics", "science", "engineering and technology", "humanities"];
const OTHER = "__other";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The v1 option labels (index.html:1148-1153). */
const OPTION: Record<ProviderId, string> = {
  gemini: "Google Gemini — free, easiest", groq: "Groq — free & very fast", deepseek: "DeepSeek — paid, very cheap",
  openrouter: "OpenRouter — free models", openai: "ChatGPT (OpenAI) — paid", claude: "Claude (Anthropic) — paid"
};
/** v1 keyModeNote (index.html:5069-5073). */
const MODE_HINT: Record<KeyMode, string> = {
  pass: "You choose a passphrase now and type it once each time you open Appuscholar. The key is stored locked; nobody at Appuscholar can read the stored copy.",
  plain: "No passphrase. The key stays in this browser only.",
  session: "Kept in memory only. Closing the tab erases it."
};

export function ProviderKey() {
  const { dialog, closeDialog } = useProject();
  return (
    <Dialog open={dialog === "settings"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="provider-dialog">
        {dialog === "settings" && <Form />}
      </DialogContent>
    </Dialog>
  );
}

type Out = { tone: "run" | "ok" | "fail" | "warn"; text: string } | null;
const TONE: Record<NonNullable<Out>["tone"], string> = { run: "text-muted-foreground", ok: "text-green-700", fail: "text-red-700", warn: "text-amber-700" };

function Form() {
  const t = useT();
  const { settings, update } = useSettings();
  const { project, reloadProject, closeDialog, openTerms, settingsProvider } = useProject();
  const keys = useKeys();
  const vault = useVault();
  const active: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  const [p, setP] = useState<ProviderId>(settingsProvider ?? active);
  const [key, setKey] = useState("");
  const initialMode = (q: ProviderId): KeyMode => (!keyStore.getUnlocked(q) || keys.blobs[q] ? "pass" : keyStore.isPlain(q) ? "plain" : "session");
  const [mode, setMode] = useState<KeyMode>(() => initialMode(settingsProvider ?? active));
  const [out, setOut] = useState<Out>(null);
  const [busy, setBusy] = useState(false);
  const info = PROVIDERS[p];
  const locked = !!keys.blobs[p] && !keyStore.getUnlocked(p);

  const field = (settings.field ?? "psychology").trim() || "psychology";
  const fieldKnown = FIELD_LIST.includes(field);
  const [otherField, setOtherField] = useState(!fieldKnown);
  const [customField, setCustomField] = useState(fieldKnown ? "" : field);
  const [orcid, setOrcid] = useState(settings.orcid ?? "");
  const contentLang: "en" | "hi" = project ? (project.contentLang === "hi" ? "hi" : "en") : settings.contentLang === "hi" ? "hi" : "en";
  // The OpenAlex key (v1 1186-1190): the field shows the key when it is open in this tab, as v1's fieldInit fills #oaKeyIn (2510); saved on change.
  const oaKey = useOpenAlexKey() ?? "";
  const [oaIn, setOaIn] = useState<string | null>(null);
  const oaShown = oaIn ?? oaKey;
  async function saveOaKey() {
    if (oaIn === null || oaIn === oaKey) return;
    const ok = await saveOpenAlexKey(oaIn, { keys, vault, setupVault: openVaultSetup, toast, t });
    if (ok) setOaIn(null);
  }

  function pick(q: ProviderId) { setP(q); setKey(""); setOut(null); setMode(initialMode(q)); }

  async function save() {
    const k = key.trim();
    if (!k) { toast("Paste your key first"); return; }
    if (busy) return;
    if (mode === "pass" && !cryptoOK()) { toast("This browser cannot encrypt — choose another option"); return; }
    setBusy(true);
    // "Protect with a passphrase" locks the key under the vault: with no vault yet, the student sets one up first and its
    // passphrase is the key's; with a vault, it is opened (asked for once) if it is locked. Cancelling either saves nothing.
    if (mode === "pass" && !(vault.status === "off" ? await openVaultSetup() : await vault.ensureUnlocked())) { setBusy(false); return; }
    try {
      await keys.save(p, k, mode);
    } catch {
      toast(mode === "pass" ? "Could not encrypt and store the key — nothing was saved" : "Could not save the key. Try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    void update({ provider: p });
    setKey("");
    closeDialog();
    toast(PROVIDERS[p].name + " connected ✓" + (mode === "pass" ? " and encrypted 🔒" : ""));
  }

  async function forget() {
    try { await keys.forget(p); } catch { toast("Could not remove the key. Try again."); return; }
    setKey(""); setOut(null);
    toast(info.short + " key removed ✓");
  }

  async function test() {
    if (busy) return;
    const name = info.name;
    const typed = key.trim();
    let use = typed || keyStore.getUnlocked(p) || "";
    if (!use && keys.blobs[p]) {
      // A key locked under the vault opens with the vault; a legacy one asks for its key passphrase (and is then re-saved under the vault).
      try { use = (await keys.getUnlocked(p)) ?? ""; } catch { setOut({ tone: "fail", text: t("vault_wrong") }); return; }
      if (use) toast("Key unlocked for this session ✓");
    }
    if (!use) {
      setOut({ tone: "warn", text: keys.blobs[p] ? `${name}: your key is locked with a passphrase. Paste it again here to test it, or close this window and use any AI button once to unlock it.` : `${name}: no key yet. Paste your key in the box above, then test again.` });
      return;
    }
    setOut({ tone: "run", text: t("aitest_running") }); setBusy(true);
    try {
      const r = await apiFetch<{ ok: true; reply: string }>("/ai/test", { method: "POST", body: JSON.stringify({ provider: p, apiKey: use }) });
      const saved = keyStore.getUnlocked(p);
      const tail = typed && typed !== saved ? ` This key is not saved yet. Press Save Key to keep it and switch to ${info.short}.` : p !== active ? ` ${info.short} is not your active provider yet. Press Save Key to switch to it.` : "";
      setOut({ tone: "ok", text: `${t("aitest_ok", { p: name })} ${t("aitest_reply")} ${String(r.reply).trim().slice(0, 80)}${tail}` });
    } catch (e) {
      setOut({ tone: "fail", text: `${t("aitest_fail", { p: name })} ${toCallError(e).message}` });
    } finally { setBusy(false); }
  }

  async function setLang(v: "en" | "hi") {
    try {
      if (project) { await apiFetch(`/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ contentLang: v }) }); await reloadProject(); }
      else await update({ contentLang: v });
      toast(v === "hi" ? "Content language: Hindi (हिन्दी)" : "Content language: English");
    } catch { toast("Could not save the content language. Try again."); }
  }

  function chooseField(v: string) {
    if (v === OTHER) { setOtherField(true); return; }
    setOtherField(false);
    void update({ field: v });
    toast("Your field: " + v);
  }
  function saveCustomField() {
    const v = customField.replace(/[^\p{L}\p{N} ,&'-]/gu, "").trim().slice(0, 60);
    if (!v) return;
    setCustomField(v);
    if (v !== settings.field) { void update({ field: v }); toast("Your field: " + v); }
  }
  function saveOrcid() {
    const v = orcid.trim();
    setOrcid(v);
    if (v !== (settings.orcid ?? "")) void update({ orcid: v });
  }

  const steps = info.stepsHtml.replace(/\s*<a [^>]*>[^<]*<\/a>/, "");
  const placeholder = locked ? "A passphrase-protected key is saved — paste a new one to replace it" : keys.hasKey(p) ? "A key is saved — paste a new one to replace it" : `Paste your ${info.short} key`;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-purple-800">{t("settings_h2")}</DialogTitle>
        <DialogDescription>{t("settings_intro")}</DialogDescription>
      </DialogHeader>

      <div className="field !mb-0">
        <label htmlFor="provSel">{t("settings_provider_label")}</label>
        <select className="input" id="provSel" value={p} onChange={(e) => { if (isProvider(e.target.value)) pick(e.target.value); }} data-testid="prov-select">
          {PROV_ORDER.map((id) => <option key={id} value={id}>{OPTION[id]}</option>)}
        </select>
      </div>
      <div className="rounded-lg bg-soft px-3 py-2.5 text-[13px] leading-[1.7]" data-testid="prov-help">
        <b>{info.name}:</b> {tHtml(steps)} <a href={info.keysUrl} target="_blank" rel="noopener" className="font-semibold text-purple-800 underline">Open →</a>
        {info.warning && <p className="m-0 mt-1.5 text-amber-700" data-testid="prov-warning">{info.warning}</p>}
      </div>

      <div className="field !mb-0">
        <SecretInput secret="key" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={placeholder} aria-label={t("settings_keyin_placeholder")} data-testid="key-input" toggleTestId="key-input-toggle" />
      </div>

      <div role="radiogroup" aria-labelledby="keyModeLabel" className="field !mb-0">
        <label id="keyModeLabel">{t("settings_keymode_label")}</label>
        {(["pass", "plain", "session"] as const).map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm font-normal">
            <input type="radio" name="key-mode" checked={mode === m} disabled={m === "pass" && !cryptoOK()} onChange={() => setMode(m)} data-testid={"key-mode-" + m} />
            {t("settings_keymode_" + m)}
          </label>
        ))}
        <p className="m-0 text-[13px] text-muted-foreground" data-testid="key-mode-hint">{MODE_HINT[mode]}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} data-testid="key-save" onClick={() => { void save(); }}>{t("settings_savekey_btn")}</Button>
        <Button variant="ghost" disabled={busy} data-testid="key-test" onClick={() => { void test(); }}>{t("aitest_btn")}</Button>
        {keys.hasKey(p) && <Button variant="ghost" disabled={busy} data-testid="key-forget" onClick={() => { void forget(); }}>{t("settings_removekey_btn")}</Button>}
      </div>
      <p className={"m-0 min-h-5 text-sm font-semibold " + (out ? TONE[out.tone] : "")} role="status" aria-live="polite" data-testid="key-test-out">{out?.text ?? ""}</p>

      <div className="field !mb-0 border-t border-line pt-3">
        <label htmlFor="contentLangSel">{t("settings_contentlang_label")}</label>
        <select className="input" id="contentLangSel" value={contentLang} onChange={(e) => { void setLang(e.target.value === "hi" ? "hi" : "en"); }} data-testid="content-lang">
          <option value="en">{t("settings_contentlang_en")}</option>
          <option value="hi">{t("settings_contentlang_hi")}</option>
        </select>
        <p className="m-0 text-[13px] text-muted-foreground">{t("settings_contentlang_desc")}</p>
      </div>

      <div className="field !mb-0 border-t border-line pt-3">
        <label htmlFor="oaKeyIn">{t("rs2_oa_key_label")}</label>
        <SecretInput secret="key" id="oaKeyIn" autoComplete="off" spellCheck={false} value={oaShown} placeholder={t("rs2_oa_key_placeholder")}
          onChange={(e) => setOaIn(e.target.value)} onBlur={() => { void saveOaKey(); }} onKeyDown={(e) => { if (e.key === "Enter") void saveOaKey(); }} data-testid="oa-key-input" />
        <p className="m-0 text-[13px] text-muted-foreground">{t("rs2_oa_key_desc")}</p>
      </div>

      <div className="field !mb-0 border-t border-line pt-3">
        <label htmlFor="fieldSel">My field of study</label>
        <select className="input" id="fieldSel" value={otherField ? OTHER : field} onChange={(e) => chooseField(e.target.value)} data-testid="field-select">
          {FIELD_LIST.map((f) => <option key={f} value={f}>{cap(f)}</option>)}
          <option value={OTHER}>Other…</option>
        </select>
        {otherField && <input className="input mt-1.5" type="text" maxLength={60} placeholder="Type your field" aria-label="Type your field" value={customField} onChange={(e) => setCustomField(e.target.value)} onBlur={saveCustomField} onKeyDown={(e) => { if (e.key === "Enter") saveCustomField(); }} data-testid="field-custom" />}
        <p className="m-0 text-[13px] text-muted-foreground">The AI uses this to pitch explanations and examples at your field. Psychology has the most tools built in; the others are being added.</p>
      </div>

      <div className="field !mb-0 border-t border-line pt-3">
        <label htmlFor="orcidIn">{t("settings_orcid_label")}</label>
        <input className="input" id="orcidIn" type="text" placeholder="0000-0000-0000-0000" maxLength={40} value={orcid} onChange={(e) => setOrcid(e.target.value)} onBlur={saveOrcid} data-testid="orcid-input" />
        <p className="m-0 text-[13px]"><a href="https://orcid.org/register" target="_blank" rel="noopener" className="text-purple-800 underline">{t("settings_orcid_link")}</a></p>
      </div>

      <div className="field !mb-0 border-t border-line pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.aiFallback !== false} onChange={(e) => { void update({ aiFallback: e.target.checked }); }} data-testid="ai-fallback" />
          <span>If my AI is busy or fails, try my other saved keys automatically</span>
        </label>
        <p className="m-0 text-[13px] text-muted-foreground">The text of that one request then goes to the other provider you saved a key for, and a message tells you which one answered. Switch this off if you want every request to stay with one provider.</p>
      </div>

      <div className="field !mb-0 border-t border-line pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={!settings.aiLogOff} onChange={(e) => { void update({ aiLogOff: !e.target.checked }); }} data-testid="ai-log" />
          <span>Keep the log</span>
        </label>
        <p className="m-0 text-[13px] text-muted-foreground">A private log of the date, the AI provider, the model and the kind of help. It never keeps what you typed or what the AI answered.</p>
      </div>

      <div>
        <Button variant="ghost" data-testid="terms-link" onClick={openTerms}>{t("terms_reopen_btn")}</Button>
      </div>
    </>
  );
}
