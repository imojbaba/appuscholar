"use client";
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useAutosave } from "@/lib/useAutosave";

export function Editor({ docId, initialHtml, initialSeq, onSaved }: { docId: string; initialHtml: string; initialSeq: number; onSaved?: (seq: number) => void }) {
  const { status, currentSeq, onChange } = useAutosave(docId, initialHtml, initialSeq);
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML())
  });
  useEffect(() => { if (status === "saved") onSaved?.(currentSeq); }, [status, currentSeq, onSaved]);
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
