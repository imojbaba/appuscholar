"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import { X } from "@phosphor-icons/react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { plainText, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useMedia } from "@/lib/useMedia";
import { useKeys } from "@/lib/ai/useKeys";
import type { SaveStatus } from "@/lib/useAutosave";
import { AUTOSAVE_OFF_BADGE, AUTOSAVE_STOPPED_TOAST, WORD_DOWNLOADED_TOAST, LATEX_EXPORTED_TOAST } from "@/lib/docMessages";
import { downloadBlob } from "@/lib/export/download";
import { wordDocument } from "@/lib/export/word";
import { latexDocument } from "@/lib/export/latex";
import { fileTitle, useTitle } from "@/lib/vault/titles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { Editor } from "@/components/editor/Editor";
import { useProject } from "@/components/frame/ProjectContext";
import { DocBar } from "./DocBar";
import { useSuggestion } from "@/lib/ai/suggestion";
import { ActionRow } from "./ActionRow";
import { DocAside, aiPaneHasContent } from "./DocAside";
import { SelectionBubble } from "./SelectionBubble";
import { WritingSampleCapture } from "@/lib/writingSamples/useWritingSampleCapture";
import { usePhotoStudioHost } from "@/lib/editor/photoStudioHost";
import { FormatBar } from "./FormatBar";

function isProvider(v: unknown): v is ProviderId { return typeof v === "string" && v in PROVIDERS; }

/** The AI pane's width in Writing (Task 13, v1's dock 2996-3005): what the API accepts for `dockW`, and where it starts (the pane's old fixed width). */
export const ASIDE_W_MIN = 320;
export const ASIDE_W_MAX = 760;
export const ASIDE_W_DEFAULT = 420;
/** One arrow key's step on the width handle. */
const ASIDE_W_STEP = 40;
/** v1 let the text collapse beside a wide dock; here it keeps this much, with the grid's gap (--s4) between it and the pane. */
const TEXT_KEEP = 480;
const ASIDE_GAP = 16;
/** The widest the pane may be in a grid `container` px wide: 760, or less to leave the text its 480px; never under 320. A whole number (the API takes no fraction, and a zoomed page has one); a grid with no size yet is not limited. */
const asideRoom = (container: number): number => (container > 0 ? Math.max(ASIDE_W_MIN, Math.min(ASIDE_W_MAX, Math.floor(container - TEXT_KEEP - ASIDE_GAP))) : ASIDE_W_MAX);
export const clampAsideW = (w: number, room = ASIDE_W_MAX): number => Math.max(ASIDE_W_MIN, Math.min(room, Math.round(w)));

/**
 * The document: "Your Document" with its autosave badge, the document bar and the editor. Its format bar sits above the editor and its action
 * row below; the AI pane (DocAside) sits beside it at full width, under it when the document is beside a place. Beside a place it has Close.
 */
export function DocumentCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { hasKey } = useKeys();
  const { currentDoc, registerFlush, registerEditor: registerForInsert, setWordCount, startImport, place, closeDocument } = useProject();
  // Writing always shows the document; beside any other place the student can close it.
  const beside = !!place && place.stage !== "writing";
  // Red from the first failed save until a save succeeds: retries ("saving") and typing offline ("dirty") do not turn it green.
  // "too-large" (the api refused the size) says so, in place of AUTO-SAVE OFF.
  const [failed, setFailed] = useState<false | "error" | "too-large">(false);
  // The vault is locked and the student has not opened it: the text waits in the editor (vault_save_locked).
  const [held, setHeld] = useState(false);
  // One toast per failure streak: it is armed again by the next successful save (a newly opened editor reports "saved" first).
  const warned = useRef(false);
  const docId = currentDoc?.id;
  // The downloads are named after the opened title ("untitled" while it is locked or does not open), never its ciphertext.
  const fileName = fileTitle(useTitle(currentDoc, "document"));
  // The format bar works on the open document's editor instance; null while no document is open or the editor is still being created.
  const [editor, setEditorLocal] = useState<TipTapEditor | null>(null);
  const suggestion = useSuggestion();
  const { setEditor: registerEditor, tab } = suggestion;
  const setEditor = useCallback((e: TipTapEditor | null) => { setEditorLocal(e); registerEditor(e); registerForInsert(e); }, [registerEditor, registerForInsert]);
  // The photo studio's host answers its windows for as long as the card stands: the bar below is rebuilt for every editor, and a host inside it would go with
  // the document that was closed, locked or switched (the studio would then say the document window is not listening instead of that the document is gone).
  const studio = usePhotoStudioHost(editor);
  const aside = aiPaneHasContent(suggestion, t("ai_pane_placeholder"));
  const [highlightAi, setHighlightAi] = useState(false);

  // The pane's width handle (Task 13, P4): the Writing place's pane, a column of its own only at 1100px and up (beside a place it goes under the text).
  // Not on the project's home, which shows no document: the grid has no width there to measure.
  const wide = useMedia("(min-width: 1100px)");
  const resizable = aside && wide && place?.stage === "writing";
  const gridRef = useRef<HTMLDivElement>(null);
  // The widest the pane can be here, measured from the grid; a saved width wider than that shows clamped and is not saved back.
  const [room, setRoom] = useState(ASIDE_W_MAX);
  // The width while the handle is being dragged; stored once it is let go.
  const [dragW, setDragW] = useState<number | null>(null);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const savedW = clampAsideW(settings.dockW ?? ASIDE_W_DEFAULT);
  const asideW = clampAsideW(dragW ?? savedW, room);
  useLayoutEffect(() => {
    if (!resizable) return;
    const measure = () => setRoom(asideRoom(gridRef.current?.getBoundingClientRect().width ?? 0));
    measure();
    window.addEventListener("resize", measure);
    // The grid can change width without the window (the document opening, a scrollbar): the browser says so where it can.
    const watch = typeof ResizeObserver === "function" && gridRef.current ? new ResizeObserver(measure) : null;
    if (watch && gridRef.current) watch.observe(gridRef.current);
    return () => { window.removeEventListener("resize", measure); watch?.disconnect(); };
  }, [resizable]);
  const storeW = (next: number) => { if (next !== savedW) void update({ dockW: next }); };
  const onAsideKey = (e: React.KeyboardEvent) => {
    // The handle is on the pane's left edge: left makes it wider, as on the document's handle beside a place.
    const next = e.key === "ArrowLeft" ? asideW + ASIDE_W_STEP : e.key === "ArrowRight" ? asideW - ASIDE_W_STEP : e.key === "Home" ? room : e.key === "End" ? ASIDE_W_MIN : null;
    if (next === null) return;
    e.preventDefault();
    // A step that changes nothing at the width shown (the pane already as wide as the grid allows) saves nothing.
    const to = clampAsideW(next, room);
    if (to !== asideW) storeW(to);
  };

  const onStatus = useCallback((s: SaveStatus) => {
    setHeld(s === "locked");
    if (s === "error" || s === "too-large") { setFailed(s); if (!warned.current) { warned.current = true; toast(s === "error" ? AUTOSAVE_STOPPED_TOAST : t("doc_too_large")); } }
    else if (s === "saved") { setFailed(false); warned.current = false; }
  }, [t]);
  const onCount = useCallback((n: number) => { if (docId) setWordCount(docId, n); }, [docId, setWordCount]);
  const onReady = useCallback((api: { flushNow: () => Promise<boolean> }) => registerFlush(api.flushNow), [registerFlush]);
  useEffect(() => () => registerFlush(null), [registerFlush]);

  // Both exports take what the student sees (the live editor HTML, unsaved typing included), not the last saved body.
  const exportWord = () => {
    if (!editor || !currentDoc) return;
    const { filename, blob } = wordDocument(fileName, editor.getHTML());
    downloadBlob(filename, blob);
    toast(WORD_DOWNLOADED_TOAST);
  };
  const latexNow = (orcid: string | undefined) => {
    if (!editor || !currentDoc) return;
    const { filename, blob } = latexDocument(fileName, editor.getHTML(), orcid);
    downloadBlob(filename, blob);
    toast(LATEX_EXPORTED_TOAST);
  };
  // The ORCID iD is printed only on this export: with none set, it is asked for here, optional (first-run build spec: it waits until it is needed).
  const [orcidAsk, setOrcidAsk] = useState(false);
  const [orcidIn, setOrcidIn] = useState("");
  const exportLatex = () => {
    if (!editor || !currentDoc) return;
    if (settings.orcid?.trim()) { latexNow(settings.orcid); return; }
    setOrcidIn("");
    setOrcidAsk(true);
  };
  const exportWithOrcid = () => {
    const v = orcidIn.trim().slice(0, 40);
    if (v) void update({ orcid: v });
    setOrcidAsk(false);
    latexNow(v || undefined);
  };

  const provider: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
  return (
    <div ref={gridRef} className={"doc-with-aside" + (aside ? " has-aside" : "") + (beside ? " beside" : "")} style={resizable ? ({ "--aside-w": asideW + "px" } as CSSProperties) : undefined}>
      <section className="doc" aria-label={plainText(t("doc_pane_h2"))}>
        <div className="card-head">
          <h2>{t("doc_pane_h2")}</h2>
          {held
            ? <Badge variant="flag" data-testid="save-status" role="status">{t("vault_save_locked")}</Badge>
            : failed
            ? <Badge variant="danger" data-testid="save-status" role="status">{failed === "too-large" ? t("doc_too_large_badge") : AUTOSAVE_OFF_BADGE}</Badge>
            : <Badge variant="ok" data-testid="save-status" role="status">{t("autosave_on")}</Badge>}
          {hasKey(provider) && <Badge variant="gold" data-testid="provider-badge">{PROVIDERS[provider].short}</Badge>}
          <div className="right">
            <Button variant="ghost" size="sm" disabled={!editor} onClick={exportWord} data-testid="download-word">{t("download_btn")}</Button>
            <Button variant="ghost" size="sm" disabled={!editor} onClick={exportLatex} title={t("latex_btn_title")} data-testid="download-latex">{t("latex_btn")}</Button>
            {beside && <Button variant="ghost" size="sm" onClick={() => void closeDocument()} data-testid="doc-close"><X aria-hidden="true" />{t("doc_close")}</Button>}
          </div>
        </div>
        <DocBar />
        <Dialog open={orcidAsk} onOpenChange={setOrcidAsk}>
          <DialogContent className="max-w-md" data-testid="latex-orcid-dialog">
            <DialogHeader><DialogTitle className="text-xl font-semibold text-purple-800">{t("latex_orcid_h")}</DialogTitle></DialogHeader>
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); exportWithOrcid(); }}>
              <label htmlFor="latexOrcid" className="text-sm font-semibold">{t("latex_orcid_label")}</label>
              <input className="input" id="latexOrcid" type="text" placeholder="0000-0000-0000-0000" maxLength={40} value={orcidIn} onChange={(e) => setOrcidIn(e.target.value)} data-testid="latex-orcid-input" />
              <a href="https://orcid.org/register" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-[13px] text-purple-800 underline">{t("settings_orcid_link")}</a>
              <DialogFooter><Button type="submit" variant="primary" data-testid="latex-orcid-go">{t("latex_orcid_go")}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {/* Keyed by the instance, so a new document's bar subscribes afresh. Its slot keeps its height until the editor exists. */}
        {editor ? <FormatBar key={editor.instanceId} editor={editor} openStudio={studio.openStudio} /> : <div className="fmtbar fmtbar-pending" aria-hidden="true" />}
        {/* A document that did not open (vault locked, or its key missing or the text damaged) gets no editor, so nothing can be saved over it. */}
        {currentDoc && currentDoc.unreadable && (
          <p role="alert" className="px-4 py-6 text-sm text-muted-foreground sm:px-6" data-testid="doc-unreadable">
            {t(currentDoc.unreadable === "broken" ? "vault_doc_broken" : "vault_doc_locked")}
          </p>
        )}
        {currentDoc && !currentDoc.unreadable && <Editor key={currentDoc.id} docId={currentDoc.id} initialHtml={currentDoc.bodyHtml} initialSeq={currentDoc.currentSeq} deks={currentDoc.deks} onReady={onReady} onStatus={onStatus} onCount={onCount} onEditor={setEditor} onFiles={startImport} onTab={tab} highlightAi={highlightAi} />}
        {editor && <SelectionBubble key={"bubble-" + editor.instanceId} editor={editor} />}
        {editor && <WritingSampleCapture key={"samples-" + editor.instanceId} editor={editor} doc={currentDoc} />}
        {editor && <ActionRow key={"actions-" + editor.instanceId} editor={editor} highlightAi={highlightAi} onHighlightAi={setHighlightAi} />}
      </section>
      {resizable && (
        <div
          className="aside-resize" role="separator" aria-orientation="vertical" aria-label={t("dock_aside_width")} aria-valuemin={ASIDE_W_MIN} aria-valuemax={room} aria-valuenow={asideW}
          tabIndex={0} data-testid="aside-resize" onKeyDown={onAsideKey}
          onPointerDown={(e) => { drag.current = { x: e.clientX, w: asideW }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current) setDragW(clampAsideW(drag.current.w + drag.current.x - e.clientX, room)); }}
          onPointerUp={() => { if (drag.current && dragW !== null) storeW(dragW); drag.current = null; setDragW(null); }}
          onPointerCancel={() => { drag.current = null; setDragW(null); }}
        />
      )}
    <DocAside />
    </div>
  );
}
