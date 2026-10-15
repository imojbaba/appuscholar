"use client";
import { useEffect } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import { editorExtensions } from "@/lib/editorExtensions";
import { useAutosave, type SaveStatus } from "@/lib/useAutosave";
import { Toolbar } from "./Toolbar";
import { cn } from "@/lib/utils";
import { CheckCircle, CloudArrowUp, WarningCircle } from "@phosphor-icons/react";

function words(text: string): number { const t = text.trim(); return t ? t.split(/\s+/).length : 0; }

function Status({ status, seq }: { status: SaveStatus; seq: number }) {
  const map: Record<SaveStatus, { icon: React.ReactNode; text: string; cls: string }> = {
    saved: { icon: <CheckCircle size={16} />, text: `Saved · revision ${seq}`, cls: "text-muted-foreground" },
    saving: { icon: <CloudArrowUp size={16} />, text: "Saving…", cls: "text-muted-foreground" },
    dirty: { icon: <CloudArrowUp size={16} />, text: "Unsaved changes", cls: "text-muted-foreground" },
    error: { icon: <WarningCircle size={16} />, text: "Could not save, will retry", cls: "text-destructive" }
  };
  const m = map[status];
  return <span className={cn("inline-flex items-center gap-1 text-sm", m.cls)} data-testid="save-status" aria-live="polite">{m.icon}{m.text}</span>;
}

export function Editor({ docId, initialHtml, initialSeq, onSaved, onReady }: { docId: string; initialHtml: string; initialSeq: number; onSaved?: (seq: number) => void; onReady?: (api: { flushNow: () => Promise<boolean> }) => void }) {
  const { status, currentSeq, onChange, flushNow } = useAutosave(docId, initialHtml, initialSeq);
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialHtml,
    immediatelyRender: false
  });
  // The count follows the editor's transactions, so it is right for the initial content and for every edit.
  const count = useEditorState({ editor, selector: ({ editor: e }) => (e ? words(e.getText()) : 0) }) ?? 0;
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
  useEffect(() => { onReady?.({ flushNow }); }, [onReady, flushNow]);
  return (
    <div className="editor min-w-0 rounded-lg border bg-card">
      <Toolbar editor={editor} />
      <div className="px-4 py-4 sm:px-6"><EditorContent editor={editor} data-testid="editor" /></div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-sm text-muted-foreground">
        <span data-testid="word-count">{count} {count === 1 ? "word" : "words"}</span>
        <Status status={status} seq={currentSeq} />
      </div>
    </div>
  );
}
