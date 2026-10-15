"use client";
import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent, type Editor as TipTapEditor } from "@tiptap/react";
import { editorExtensionsWith } from "@/lib/editorExtensions";
import { useT } from "@/lib/i18n";
import { useAutosave, type SaveStatus } from "@/lib/useAutosave";
import { isImportable } from "@/lib/import/parse";
import { Toolbar } from "./Toolbar";

function words(text: string): number { const t = text.trim(); return t ? t.split(/\s+/).length : 0; }

export function Editor({ docId, initialHtml, initialSeq, onSaved, onReady, onStatus, onCount, onEditor, onFiles, toolbar = true }: {
  docId: string; initialHtml: string; initialSeq: number;
  onSaved?: (seq: number) => void;
  onReady?: (api: { flushNow: () => Promise<boolean> }) => void;
  /** The autosave state and the revision it last stored; the document card shows it as the Auto-save badge. */
  onStatus?: (status: SaveStatus, seq: number) => void;
  /** The live word count, for the document card and the project bar. */
  onCount?: (words: number) => void;
  /** The TipTap instance once it exists, and null when this editor unmounts: the document card's format bar works on it. */
  onEditor?: (editor: TipTapEditor | null) => void;
  /** False when the caller shows its own format bar (the document card). The old document page keeps the phase-1 toolbar. */
  toolbar?: boolean;
  /** Files dropped on the editor or pasted into it that can be imported (.docx, .pdf, .txt, .md, .html). Anything else drops and pastes as usual. */
  onFiles?: (files: File[]) => void;
}) {
  const t = useT();
  // Fixed when the editor is created, so a language switch shows the other hint from the next document opened.
  const placeholder = t("editor_placeholder");
  const extensions = useMemo(() => editorExtensionsWith(placeholder), [placeholder]);
  const { status, currentSeq, onChange, flushNow } = useAutosave(docId, initialHtml, initialSeq);
  // The handlers below are created with the editor, so they read the newest callback from here.
  const onFilesRef = useRef(onFiles);
  useEffect(() => { onFilesRef.current = onFiles; }, [onFiles]);
  const editor = useEditor({
    extensions,
    content: initialHtml,
    immediatelyRender: false,
    editorProps: {
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
  useEffect(() => {
    if (!editor) return;
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);
  return (
    // A file dropped on the card's padding (outside the text) would otherwise be opened by the browser, so the wrapper takes it too.
    <div className="editor min-w-0"
      onDragOver={(e) => { if (onFiles && e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => {
        if (e.defaultPrevented || !onFiles) return;
        const files = Array.from(e.dataTransfer.files).filter(isImportable);
        if (!files.length) return;
        e.preventDefault();
        onFiles(files);
      }}>
      {toolbar && <div className="sticky top-0 z-10 bg-card"><Toolbar editor={editor} /></div>}
      <div className="px-4 py-4 sm:px-6"><EditorContent editor={editor} data-testid="editor" /></div>
    </div>
  );
}
