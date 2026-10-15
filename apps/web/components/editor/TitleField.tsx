"use client";
import { useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";

/**
 * Renames through PATCH /documents/:id, which changes only the title. It never sends a body, so it cannot overwrite
 * writing that the editor's autosave is about to store, and it never creates a revision.
 */
export function TitleField({ docId, title, onRenamed }: { docId: string; title: string; onRenamed: (t: string) => void }) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function commit() {
    if (saving) return;
    const t = value.trim();
    if (!t || t === title) { setValue(title); return; }
    setSaving(true);
    try {
      const d = await apiFetch<{ title: string }>(`/documents/${docId}`, { method: "PATCH", body: JSON.stringify({ title: t }) });
      setValue(d.title);
      onRenamed(d.title);
      setError("");
    }
    catch { setValue(title); setError("Could not rename. Try again."); }
    finally { setSaving(false); }
  }
  return (
    <div className="grid gap-1">
      <label htmlFor="doc-title-field" className="sr-only">Document title</label>
      <div className="group flex min-w-0 items-center gap-2">
        <input id="doc-title-field" value={value} onChange={e => setValue(e.target.value)} onBlur={() => { void commit(); }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} readOnly={saving} aria-busy={saving} maxLength={200} data-testid="doc-title-field" className="min-w-0 flex-1 rounded-md bg-transparent text-2xl font-semibold tracking-tight outline-none focus:underline decoration-primary/40 underline-offset-4" />
        <PencilSimple size={18} aria-hidden="true" className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
      </div>
      {saving ? <p role="status" data-testid="doc-title-status" className="text-xs text-muted-foreground">Saving…</p> : null}
      {error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
