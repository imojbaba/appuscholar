"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

type ServerDoc = { bodyHtml: string };

/**
 * Renames through PUT /documents/:id, which requires a body. To keep the rename from creating a revision it must
 * send the body the server already holds, not the (possibly stale) body loaded when the page opened. So pending
 * edits are flushed first, then the stored body is read back and echoed.
 */
export function TitleField({ docId, title, beforeRename, onRenamed }: { docId: string; title: string; beforeRename?: () => Promise<boolean>; onRenamed: (t: string) => void }) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState("");
  async function commit() {
    const t = value.trim();
    if (!t || t === title) { setValue(title); return; }
    try {
      if (beforeRename && !(await beforeRename())) throw new Error("unsaved");
      const stored = await apiFetch<ServerDoc>(`/documents/${docId}`);
      await apiFetch(`/documents/${docId}`, { method: "PUT", body: JSON.stringify({ bodyHtml: stored.bodyHtml, title: t }) });
      onRenamed(t);
      setError("");
    }
    catch { setValue(title); setError("Could not rename. Try again."); }
  }
  return (
    <div>
      <input value={value} onChange={e => setValue(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Document title" maxLength={200} data-testid="doc-title-field" className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none focus:underline decoration-primary/40 underline-offset-4" />
      {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
