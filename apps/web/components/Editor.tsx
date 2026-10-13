"use client";
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { editorExtensions } from "@/lib/editorExtensions";
import { useAutosave } from "@/lib/useAutosave";

export function Editor({ docId, initialHtml, initialSeq, onSaved, onReady }: { docId: string; initialHtml: string; initialSeq: number; onSaved?: (seq: number) => void; onReady?: (api: { flushNow: () => Promise<boolean> }) => void }) {
  const { status, currentSeq, onChange, flushNow } = useAutosave(docId, initialHtml, initialSeq);
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialHtml,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML())
  });
  useEffect(() => { if (status === "saved") onSaved?.(currentSeq); }, [status, currentSeq, onSaved]);
  useEffect(() => { onReady?.({ flushNow }); }, [onReady, flushNow]);
  const label = status === "saved" ? `Saved · revision ${currentSeq}` : status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved changes" : "Could not save, will retry";
  return (
    <div className="card editor">
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 13, marginBottom: 8 }}>
        <span data-testid="save-status">{label}</span>
      </div>
      <EditorContent editor={editor} data-testid="editor" />
    </div>
  );
}
