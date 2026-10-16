"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { plainText, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useKeys } from "@/lib/ai/useKeys";
import type { SaveStatus } from "@/lib/useAutosave";
import { AUTOSAVE_OFF_BADGE, AUTOSAVE_STOPPED_TOAST, WORD_DOWNLOADED_TOAST, LATEX_EXPORTED_TOAST } from "@/lib/docMessages";
import { downloadBlob } from "@/lib/export/download";
import { wordDocument } from "@/lib/export/word";
import { latexDocument } from "@/lib/export/latex";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Editor } from "@/components/editor/Editor";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { DocBar } from "./DocBar";
import { useSuggestion } from "@/lib/ai/suggestion";
import { ActionRow } from "./ActionRow";
import { SelectionBubble } from "./SelectionBubble";
import { FormatBar } from "./FormatBar";

function isProvider(v: unknown): v is ProviderId { return typeof v === "string" && v in PROVIDERS; }

/** The centre column: "Your Document" with its autosave badge, the document bar and the editor. Its format bar sits above the editor and its action row below. */
export function DocumentCard() {
  const t = useT();
  const { settings } = useSettings();
  const { hasKey } = useKeys();
  const { currentDoc, registerFlush, setWordCount, startImport } = useWorkspace();
  // Red from the first failed save until a save succeeds: retries ("saving") and typing offline ("dirty") do not turn it green.
  const [failed, setFailed] = useState(false);
  // The vault is locked and the student has not opened it: the text waits in the editor (vault_save_locked).
  const [held, setHeld] = useState(false);
  // One toast per failure streak: it is armed again by the next successful save (a newly opened editor reports "saved" first).
  const warned = useRef(false);
  const docId = currentDoc?.id;
  // The format bar works on the open document's editor instance; null while no document is open or the editor is still being created.
  const [editor, setEditorLocal] = useState<TipTapEditor | null>(null);
  const { setEditor: registerEditor, tab } = useSuggestion();
  const setEditor = useCallback((e: TipTapEditor | null) => { setEditorLocal(e); registerEditor(e); }, [registerEditor]);
  const [highlightAi, setHighlightAi] = useState(false);

  const onStatus = useCallback((s: SaveStatus) => {
    setHeld(s === "locked");
    if (s === "error") { setFailed(true); if (!warned.current) { warned.current = true; toast(AUTOSAVE_STOPPED_TOAST); } }
    else if (s === "saved") { setFailed(false); warned.current = false; }
  }, []);
  const onCount = useCallback((n: number) => { if (docId) setWordCount(docId, n); }, [docId, setWordCount]);
  const onReady = useCallback((api: { flushNow: () => Promise<boolean> }) => registerFlush(api.flushNow), [registerFlush]);
  useEffect(() => () => registerFlush(null), [registerFlush]);

  // Both exports take what the student sees (the live editor HTML, unsaved typing included), not the last saved body.
  const exportWord = () => {
    if (!editor || !currentDoc) return;
    const { filename, blob } = wordDocument(currentDoc.title, editor.getHTML());
    downloadBlob(filename, blob);
    toast(WORD_DOWNLOADED_TOAST);
  };
  const exportLatex = () => {
    if (!editor || !currentDoc) return;
    const { filename, blob } = latexDocument(currentDoc.title, editor.getHTML(), settings.orcid);
    downloadBlob(filename, blob);
    toast(LATEX_EXPORTED_TOAST);
  };

  const provider: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  return (
    <section className="doc" aria-label={plainText(t("doc_pane_h2"))}>
      <div className="card-head">
        <h2>{t("doc_pane_h2")}</h2>
        {held
          ? <Badge variant="flag" data-testid="save-status" role="status">{t("vault_save_locked")}</Badge>
          : failed
          ? <Badge variant="danger" data-testid="save-status" role="status">{AUTOSAVE_OFF_BADGE}</Badge>
          : <Badge variant="ok" data-testid="save-status" role="status">{t("autosave_on")}</Badge>}
        {hasKey(provider) && <Badge variant="gold" data-testid="provider-badge">{PROVIDERS[provider].short}</Badge>}
        <div className="right">
          <Button variant="ghost" size="sm" disabled={!editor} onClick={exportWord} data-testid="download-word">{t("download_btn")}</Button>
          <Button variant="ghost" size="sm" disabled={!editor} onClick={exportLatex} title={t("latex_btn_title")} data-testid="download-latex">{t("latex_btn")}</Button>
        </div>
      </div>
      <DocBar />
      {/* Keyed by the instance, so a new document's bar subscribes afresh. Its slot keeps its height until the editor exists. */}
      {editor ? <FormatBar key={editor.instanceId} editor={editor} /> : <div className="fmtbar fmtbar-pending" aria-hidden="true" />}
      {/* A document that did not open (vault locked, or its key missing or the text damaged) gets no editor, so nothing can be saved over it. */}
      {currentDoc && currentDoc.unreadable && (
        <p role="alert" className="px-4 py-6 text-sm text-muted-foreground sm:px-6" data-testid="doc-unreadable">
          {t(currentDoc.unreadable === "broken" ? "vault_doc_broken" : "vault_doc_locked")}
        </p>
      )}
      {currentDoc && !currentDoc.unreadable && <Editor key={currentDoc.id} docId={currentDoc.id} initialHtml={currentDoc.bodyHtml} initialSeq={currentDoc.currentSeq} deks={currentDoc.deks} onReady={onReady} onStatus={onStatus} onCount={onCount} onEditor={setEditor} onFiles={startImport} onTab={tab} highlightAi={highlightAi} />}
      {editor && <SelectionBubble key={"bubble-" + editor.instanceId} editor={editor} />}
      {editor && <ActionRow key={"actions-" + editor.instanceId} editor={editor} highlightAi={highlightAi} onHighlightAi={setHighlightAi} />}
    </section>
  );
}
