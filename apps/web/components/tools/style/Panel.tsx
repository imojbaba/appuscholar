"use client";
import { useEffect, useRef, useState } from "react";
import { FolderOpen, Sparkle, Warning } from "@phosphor-icons/react";
import { STYLE_PROFILE_MAX, STYLE_MIN_WORDS, styleOutliers, styleOwnText } from "@appuscholar/core";
import { plainText, useT } from "@/lib/i18n";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useDocAccess } from "@/lib/editor/docAccess";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useProject } from "@/components/frame/ProjectContext";
import { STYLE_MAX_FILES, STYLE_MAX_FILE_BYTES, STYLE_MAX_PDF_PAGES } from "@/lib/tools/style/limits";
import { learnFromDocument, learnFromFiles, precheckDocument, precheckFiles, type LearnEnv, type LearnOutcome, type LearnProgress } from "@/lib/tools/style/learn";
import { readStyleFile } from "@/lib/tools/style/read";
import { useStyleData } from "@/lib/tools/style/useStyleData";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { StyleChecks } from "./StyleChecks";

const FILE_ACCEPT = ".txt,.md,.text,.markdown,.docx,.pdf";
const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * My style, the Writing place's tab (v1 panel 830-871, script 6362-6575 and 6975-7047): the declaration and the samples (features only, never their
 * text), "Use my style in suggestions", the profile, the two ways of learning, the three checks and the erase. The project's `style_profile`,
 * `style_samples` and `style_meta` blobs hold everything. Every request to the AI goes through useCallAI, which scans for personal data first.
 */
export function Panel({ projectId }: { tab: string; projectId: string }) {
  const t = useT();
  const data = useStyleData(projectId || null);
  const callAI = useCallAI();
  const docs = useDocAccess();
  const { editor } = useSuggestion();
  const { currentDoc } = useProject();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiMade, setAiMade] = useState(false);
  const [erasing, setErasing] = useState(false);
  /** Bumped on an erase, so the checks forget their typed text and answers. */
  const [resetKey, setResetKey] = useState(0);

  const declared = !!data.meta.decl;
  const shown = draft ?? data.profile;
  const dirty = draft !== null && draft !== data.profile;
  const writable = data.ready && data.hasProject && !busy;
  const flagged = data.samples.length ? styleOutliers(data.samples) : {};
  const words = data.samples.reduce((s, x) => s + x.n, 0);

  const skippedText = (skipped: Array<{ name: string; why: string }>) =>
    skipped.slice(0, 3).map((s) => s.name + (s.why === "too-big" ? ` (${t("sty2_too_big")})` : "")).join(", ");
  function say(out: LearnOutcome, files: boolean): void {
    switch (out.kind) {
      case "need-words": setStatus(t("sty2_need_words", { n: STYLE_MIN_WORDS })); break;
      case "need-decl": setStatus(t(files ? "sty2_need_decl_files" : "sty2_need_decl")); break;
      case "nothing-read": setStatus(out.skipped.length ? t("sty2_few_text_skipped", { names: out.skipped.join(", ") }) : t("sty2_few_text")); break;
      case "learned": {
        const parts = [files ? t("sty2_learned_files", { files: out.files, words: fmt(out.words) }) : t("sty2_learned_doc")];
        if (out.skipped.length) parts.push(t("sty2_skipped", { n: out.skipped.length, names: skippedText(out.skipped) }));
        if (out.full) parts.push(t("sty2_full"));
        setStatus(parts.join(" "));
        setDraft(null);
        setAiMade(true);
        break;
      }
      case "error": setStatus(out.message); break;
      case "none": case "stopped": break;
    }
  }
  const progress = (p: LearnProgress) => {
    if (!alive.current) return;
    setStatus(p.kind === "reading" ? t("sty2_reading", { i: p.i, n: p.n, name: p.name })
      : p.kind === "studying-files" ? t("sty2_studying_files", { files: p.files, words: fmt(p.words) }) : t("sty2_studying"));
  };
  const env = (): LearnEnv => ({
    declared,
    ...data.learnStore(),
    callAI: (prompt, o) => callAI(prompt, o),
    readFile: (f) => readStyleFile(f),
    alive: () => alive.current,
    onProgress: progress,
    tick: () => new Promise<void>((r) => setTimeout(r, 0))
  });

  /**
   * The open document's HTML: the editor's own, else (a place's own window has no editor) the open document as the writing window sends it.
   * Only the student's own words are learned from (D-S2-89), so the HTML is read, not the text.
   */
  async function openHtml(): Promise<string> {
    if (editor && !editor.isDestroyed) return editor.getHTML();
    const all = await docs.allDocuments();
    return all.find((d) => d.id === currentDoc?.id)?.html ?? "";
  }
  async function learnDocument(): Promise<void> {
    const text = styleOwnText(await openHtml());
    if (!alive.current) return;
    const refused = precheckDocument(text, declared);
    if (refused) { say(refused, false); return; }
    data.guard(["profile", "samples"], () => {
      setBusy(true);
      void learnFromDocument(text, env()).then((out) => { if (alive.current) { setBusy(false); say(out, false); } });
    });
  }
  function learnFiles(chosen: FileList | null): void {
    const files = Array.from(chosen ?? []);
    if (fileInput.current) fileInput.current.value = "";
    const refused = precheckFiles(files.slice(0, STYLE_MAX_FILES), declared);
    if (refused) { say(refused, true); return; }
    data.guard(["profile", "samples"], () => {
      setBusy(true);
      void learnFromFiles(files, env()).then((out) => { if (alive.current) { setBusy(false); say(out, true); } });
    });
  }
  function erase(): void {
    data.eraseAll();
    setErasing(false);
    setDraft(null);
    setAiMade(false);
    setResetKey((k) => k + 1);
    setStatus(t("sty2_erased"));
  }

  return (
    <div className="panel" data-testid="panel-style">
      <p className="desc">{t("sty2_desc")}</p>
      {!data.hasProject && <p className="note" role="status" data-testid="style-no-project">{t("sty2_no_project")}</p>}
      {data.hasProject && data.loading && !data.locked && <PanelLoading testId="style-loading" />}
      {data.locked && <p className="note" role="status" data-testid="style-locked">{t("sty2_locked")}</p>}
      {data.broken && <p className="note" role="status" data-testid="style-broken">{t("sty2_broken")}</p>}
      {data.asking && (
        <div className="ap-box" role="group" aria-label={t("sty2_broken_confirm")} data-testid="style-broken-ask">
          <p>{t("sty2_broken_confirm")}</p>
          <div className="ap-row">
            <Button variant="primary" size="sm" data-testid="style-broken-yes" onClick={data.approve}>{t("sty2_save_anyway")}</Button>
            <Button variant="ghost" size="sm" data-testid="style-broken-no" onClick={data.decline}>{t("sty2_cancel")}</Button>
          </div>
        </div>
      )}

      <div className="ap-box" data-testid="style-declaration">
        <b>{t("sty2_own_title")}</b>
        <p className="desc" style={{ margin: "4px 0" }}>{t("sty2_own_body")}</p>
        <label className="flex cursor-pointer items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-[3px]" data-testid="style-decl" checked={declared} disabled={!writable}
            onChange={(e) => { const v = e.target.checked; data.guard(["meta"], () => data.setDeclared(v)); }} />
          <span>{t("sty2_decl")}</span>
        </label>
        <p className="mt-2 text-[13px]" data-testid="style-summary">
          <b>{data.samples.length === 1 ? t("sty2_samples_one", { w: fmt(words) }) : t("sty2_samples_n", { n: data.samples.length, w: fmt(words) })}</b>
          {" · "}{declared ? t("sty2_declared_on", { date: data.meta.decl ?? "" }) : t("sty2_not_declared")}
        </p>
        {data.samples.length > 0 && (
          <ul className="m-0 max-h-[180px] list-none overflow-auto rounded-md border border-line p-0" aria-label={t("sty2_samples_list")} data-testid="style-samples">
            {data.samples.map((x) => (
              <li key={x.id} className="flex items-center gap-2 border-b border-line px-2 py-1 text-[12.5px]" data-testid="style-sample">
                <span className="flex-1">
                  {x.name} <span className="text-muted-foreground">· {t("sty2_sample_words", { n: fmt(x.n) })}</span>
                  {flagged[x.id] !== undefined && <span className="ml-1 text-flag-ink" data-testid="style-flag"><Warning aria-hidden className="inline size-3.5" /> {t("sty2_flag")}</span>}
                </span>
                <Button variant="ghost" size="xs" data-testid="style-remove" disabled={!writable}
                  onClick={() => data.guard(["samples"], () => { data.removeSample(x.id); setStatus(t("sty2_removed")); })}>{t("sty2_remove")}</Button>
              </li>
            ))}
          </ul>
        )}
        {Object.keys(flagged).length > 0 && <p className="mt-1 text-xs text-flag-ink" data-testid="style-flag-note">{t("sty2_flag_note")}</p>}
      </div>

      <label className="my-3 flex cursor-pointer items-center gap-2 text-[13.5px]">
        <input type="checkbox" className="size-[17px]" data-testid="style-on" checked={data.on} disabled={!writable}
          onChange={(e) => { const v = e.target.checked; data.guard(["profile"], () => data.setOn(v)); }} />
        <b>{t("style_use_label")}</b>
      </label>
      <p className="desc" data-testid="style-on-state">{data.on ? t("sty2_state_on") : t("sty2_state_off")}</p>

      <div className="field">
        <label htmlFor="styleProfile">{t("style_profile_label")}</label>
        {aiMade && <section className="ai-read" data-testid="style-ai-label"><p className="ai-read-label">{t("sty2_ai_profile")}</p></section>}
        <textarea id="styleProfile" className="input" rows={6} maxLength={STYLE_PROFILE_MAX} value={shown} disabled={!data.ready || !data.hasProject}
          placeholder={t("style_profile_placeholder")} data-testid="style-profile" onChange={(e) => setDraft(e.target.value)} />
        <p className="text-xs text-muted-foreground" data-testid="style-chars">
          {t("sty2_chars", { n: shown.length, max: fmt(STYLE_PROFILE_MAX) })}{dirty ? " · " + t("sty2_unsaved") : ""}
        </p>
      </div>

      <div className="stack">
        <Button variant="primary" className="w-full" data-testid="style-learn" disabled={!writable} onClick={() => void learnDocument()}>
          <Sparkle aria-hidden weight="bold" />{plainText(t("style_learn_btn"))}
        </Button>
        <Button variant="ghost" className="w-full" data-testid="style-learn-files" disabled={!writable} onClick={() => fileInput.current?.click()}>
          <FolderOpen aria-hidden />{plainText(t("style_learn_files_btn"))}
        </Button>
        <input ref={fileInput} type="file" multiple accept={FILE_ACCEPT} hidden data-testid="style-files" onChange={(e) => learnFiles(e.target.files)} />
        <p className="desc" style={{ margin: 0 }}>{t("sty2_files_hint", { files: STYLE_MAX_FILES, mb: STYLE_MAX_FILE_BYTES / (1024 * 1024), pages: STYLE_MAX_PDF_PAGES })}</p>
        <p className="desc" role="status" aria-live="polite" style={{ margin: 0 }} data-testid="style-status">{status}</p>
        <Button variant="ghost" className="w-full" data-testid="style-save" disabled={!data.ready || !data.hasProject}
          onClick={() => data.guard(["profile"], () => { data.saveProfile(shown); setDraft(null); toast(t("sty2_saved")); })}>{t("style_save_btn")}</Button>
      </div>

      <StyleChecks key={resetKey} data={data} busy={busy} writable={writable} callAI={callAI} onStatus={setStatus} onProfileSaved={() => setDraft(null)} />

      <div className="mt-3">
        {erasing ? (
          <div className="ap-box" role="group" aria-label={t("sty2_erase_confirm")} data-testid="style-erase-ask">
            <p>{t("sty2_erase_confirm")}</p>
            <div className="ap-row">
              <Button variant="primary" size="sm" data-testid="style-erase-yes" onClick={erase}>{t("sty2_erase_yes")}</Button>
              <Button variant="ghost" size="sm" data-testid="style-erase-keep" onClick={() => setErasing(false)}>{t("sty2_erase_keep")}</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="w-full" data-testid="style-erase" disabled={!data.ready || !data.hasProject || busy} onClick={() => setErasing(true)}>{t("sty2_erase")}</Button>
        )}
      </div>
    </div>
  );
}
