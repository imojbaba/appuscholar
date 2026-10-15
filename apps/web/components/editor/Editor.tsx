"use client";
import { useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { editorExtensionsWith } from "@/lib/editorExtensions";
import { useT } from "@/lib/i18n";
import { useAutosave, type SaveStatus } from "@/lib/useAutosave";
import { Toolbar } from "./Toolbar";

function words(text: string): number { const t = text.trim(); return t ? t.split(/\s+/).length : 0; }

export function Editor({ docId, initialHtml, initialSeq, onSaved, onReady, onStatus, onCount }: {
  docId: string; initialHtml: string; initialSeq: number;
  onSaved?: (seq: number) => void;
  onReady?: (api: { flushNow: () => Promise<boolean> }) => void;
  /** The autosave state and the revision it last stored; the document card shows it as the Auto-save badge. */
  onStatus?: (status: SaveStatus, seq: number) => void;
  /** The live word count, for the document card and the project bar. */
  onCount?: (words: number) => void;
}) {
  const t = useT();
  // Fixed when the editor is created, so a language switch shows the other hint from the next document opened.
  const placeholder = t("editor_placeholder");
  const extensions = useMemo(() => editorExtensionsWith(placeholder), [placeholder]);
  const { status, currentSeq, onChange, flushNow } = useAutosave(docId, initialHtml, initialSeq);
  const editor = useEditor({
    extensions,
    content: initialHtml,
    immediatelyRender: false
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
  return (
    <div className="editor min-w-0">
      <div className="sticky top-0 z-10 bg-card"><Toolbar editor={editor} /></div>
      <div className="px-4 py-4 sm:px-6"><EditorContent editor={editor} data-testid="editor" /></div>
    </div>
  );
}
