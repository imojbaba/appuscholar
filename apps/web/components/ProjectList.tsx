"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
type Project = { id: string; title: string; stage: string; createdAt: string };
export function ProjectList() {
  const [items, setItems] = useState<Project[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => apiFetch<Project[]>("/projects").then(r => { setItems(r); setError(""); }).catch(() => { setItems(prev => prev ?? []); setError("Could not load your projects. Check your connection and try again."); });
  useEffect(() => { void load(); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await apiFetch("/projects", { method: "POST", body: JSON.stringify({ title }) });
      setTitle(""); await load();
    } catch {
      setError("Could not create the project. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <form onSubmit={create} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="New research project title" data-testid="project-title" disabled={busy} style={{ flex: 1, padding: 10 }} />
        <button className="btn btn-purple" data-testid="project-create" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
      </form>
      {error && <p role="alert" data-testid="error-msg" style={{ color: "crimson" }}>{error}</p>}
      {items === null ? <p>Loading…</p> : items.length === 0 && !error ? <p style={{ color: "var(--muted-foreground)" }}>No research project yet. <Link href="/import">Import a v1 backup</Link> or create one above.</p> : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {items.map(p => <li key={p.id} className="card"><Link href={`/projects/${p.id}`} data-testid="project-link">{p.title}</Link></li>)}
        </ul>
      )}
    </section>
  );
}
