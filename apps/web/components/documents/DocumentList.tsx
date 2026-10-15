"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { plural, relativeTime } from "@/lib/format";
type Doc = { id: string; title: string; currentSeq: number; wordCount: number; updatedAt: string };
export function DocumentList({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Doc[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => apiFetch<Doc[]>(`/projects/${projectId}/documents`).then(r => { setItems(r); setError(""); }).catch(() => { setItems(prev => prev ?? []); setError("Could not load the documents. Check your connection and try again."); }), [projectId]);
  useEffect(() => { void load(); }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await apiFetch(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title: title.trim() || "Untitled document" }) }); setTitle(""); await load(); }
    catch { setError("Could not create the document. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <section className="grid gap-5">
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="new-doc">New document</Label>
          <Input id="new-doc" value={title} onChange={e => setTitle(e.target.value)} placeholder="Untitled document" maxLength={200} disabled={busy} data-testid="doc-title" />
        </div>
        <Button type="submit" disabled={busy} data-testid="doc-create"><Plus size={18} weight="bold" /> {busy ? "Creating…" : "New document"}</Button>
      </form>
      {error ? <p role="alert" data-testid="error-msg" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {items === null ? (
        <div className="grid gap-2" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No documents in this project yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Start with a working title above. Every save becomes a revision you can return to.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3" data-testid="doc-row">
              <FileText size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link href={`/projects/${projectId}/documents/${d.id}`} className="block truncate font-medium hover:underline" data-testid="doc-link">{d.title}</Link>
                <p className="text-sm text-muted-foreground">{plural(d.wordCount, "word", "words")} · {plural(d.currentSeq, "revision", "revisions")} · edited {relativeTime(d.updatedAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
