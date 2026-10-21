"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor as TipTapEditor } from "@tiptap/react";
import { editorExtensionsWith, setEditorPlaceholder } from "@/lib/editorExtensions";
import { plainText, useLang, useT } from "@/lib/i18n";
import { useAutosave, type SaveStatus } from "@/lib/useAutosave";
import { isImportable } from "@/lib/import/parse";
import type { WrappedDek } from "@/lib/vault/useVault";

function words(text: string): number { const t = text.trim(); return t ? t.split(/\s+/).length : 0; }

export function Editor({ docId, initialHtml, initialSeq, deks, onSaved, onReady, onStatus, onCount, onEditor, onFiles, onTab, highlightAi = false }: {
  docId: string; initialHtml: string; initialSeq: number;
  /** The document's keys as loaded; autosave encrypts under the newest (or makes the first) when a vault exists. */
  deks: WrappedDek[];
  onSaved?: (seq: number) => void;
  onReady?: (api: { flushNow: () => Promise<boolean> }) => void;
  /** The autosave state and the revision it last stored; the document card shows it as the Auto-save badge. */
  onStatus?: (status: SaveStatus, seq: number) => void;
  /** The live word count, for the document card and the project bar. */
  onCount?: (words: number) => void;
  /** The TipTap instance once it exists, and null when this editor unmounts: the document card's format bar works on it. */
  onEditor?: (editor: TipTapEditor | null) => void;
  /** Files dropped on the editor or pasted into it that can be imported (.docx, .pdf, .txt, .md, .html). Anything else drops and pastes as usual. */
  onFiles?: (files: File[]) => void;
  /** Tab inside the document: return true when it accepted a waiting AI suggestion (the key is then consumed); false lets Tab move focus as usual. */
  onTab?: () => boolean;
  /** Marks every AI-inserted passage with the gold wash (the 👁 AI text toggle). */
  highlightAi?: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  // Created once with the hint of the language on screen; the effect below swaps the hint on a language switch without recreating the editor.
  const [extensions] = useState(() => editorExtensionsWith(t("editor_placeholder")));
  // `restored`: text this tab held after the document's editor last went away unsaved; the editor opens with it and autosave saves it.
  const { status, currentSeq, onChange, flushNow, restored } = useAutosave(docId, initialHtml, initialSeq, { deks });
  // The handlers below are created with the editor, so they read the newest callback from here.
  const onFilesRef = useRef(onFiles);
  useEffect(() => { onFilesRef.current = onFiles; }, [onFiles]);
  const onTabRef = useRef(onTab);
  useEffect(() => { onTabRef.current = onTab; }, [onTab]);
  const editor = useEditor({
    extensions,
    content: restored ?? initialHtml,
    immediatelyRender: false,
    editorProps: {
      // The text box needs a name for a screen reader; the effect below keeps it in the language on screen.
      attributes: { "aria-label": plainText(t("doc_pane_h2")) },
      handleKeyDown: (_view, event) => {
        if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !onTabRef.current?.()) return false;
        event.preventDefault();
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(isImportable);
        if (!files.length || !onFilesRef.current) return false;
        event.preventDefault();
        onFilesRef.current(files);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(isImportable);
        if (!files.length || !onFilesRef.current) return false;
        event.preventDefault();
        onFilesRef.current(files);
        return true;
      }
    }
  });
  // Bind the update handler to whichever editor instance this component holds. TipTap may hand a remounted
  // component the previous instance's editor (StrictMode / key remounts), and an `onUpdate` option captured at
  // creation would then feed the old, unmounted autosaver, saving correctly but never updating this label.
  useEffect(() => {
    if (!editor) return;
    const handler = () => onChange(editor.getHTML());
    editor.on("update", handler);
    return () => { editor.off("update", handler); };
  }, [editor, onChange]);
  useEffect(() => { if (status === "saved") onSaved?.(currentSeq); }, [status, currentSeq, onSaved]);
  useEffect(() => { onStatus?.(status, currentSeq); }, [status, currentSeq, onStatus]);
  // The live count: reported once the editor exists (never a still-empty first render's 0) and after every edit.
  useEffect(() => {
    if (!editor) return;
    const report = () => onCount?.(words(editor.getText()));
    report();
    editor.on("update", report);
    return () => { editor.off("update", report); };
  }, [editor, onCount]);
  useEffect(() => { onReady?.({ flushNow }); }, [onReady, flushNow]);
  // The language switch: the hint changes in place, the document and the cursor stay where they are.
  useEffect(() => { if (editor) setEditorPlaceholder(editor, t("editor_placeholder")); }, [editor, lang, t]);
  useEffect(() => { editor?.view.dom.setAttribute("aria-label", plainText(t("doc_pane_h2"))); }, [editor, lang, t]);
  useEffect(() => {
    if (!editor) return;
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);
  return (
    // A file dropped on the card's padding (outside the text) would otherwise be opened by the browser, so the wrapper takes it too.
    <div className={"editor min-w-0" + (highlightAi ? " highlight-ai" : "")}
      onDragOver={(e) => { if (onFiles && e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => {
        if (e.defaultPrevented || !onFiles) return;
        const files = Array.from(e.dataTransfer.files).filter(isImportable);
        if (!files.length) return;
        e.preventDefault();
        onFiles(files);
      }}>
      <div className="px-4 py-4 sm:px-6"><EditorContent editor={editor} data-testid="editor" /></div>
    </div>
  );
}
