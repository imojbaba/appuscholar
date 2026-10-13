"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
type Doc = { id: string; title: string; currentSeq: number; wordCount: number; updatedAt: string };
export function DocumentList({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Doc[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => apiFetch<Doc[]>(`/projects/${projectId}/documents`).then(r => { setItems(r); setError(""); }).catch(() => { setItems(prev => prev ?? []); setError("Could not load the documents. Check your connection and try again."); }), [projectId]);
  useEffect(() => { void load(); }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await apiFetch(`/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify({ title }) });
      setTitle(""); await load();
    } catch {
      setError("Could not create the document. Try again.");
    }
  }
  return (
    <section>
      <form onSubmit={create} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="New document title" data-testid="doc-title" style={{ flex: 1, padding: 10 }} />
        <button className="btn btn-purple" data-testid="doc-create">New document</button>
      </form>
      {error && <p role="alert" data-testid="error-msg" style={{ color: "crimson" }}>{error}</p>}
      {items === null ? <p>Loading…</p> : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {items.map(d => (
            <li key={d.id} className="card" style={{ display: "flex", justifyContent: "space-between" }}>
              <Link href={`/projects/${projectId}/documents/${d.id}`} data-testid="doc-link">{d.title}</Link>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>{d.wordCount} words · rev {d.currentSeq}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
