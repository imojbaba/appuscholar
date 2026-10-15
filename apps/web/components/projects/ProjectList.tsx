"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectCard, type ProjectRow } from "./ProjectCard";

export function ProjectList() {
  const router = useRouter();
  const [items, setItems] = useState<ProjectRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => apiFetch<ProjectRow[]>("/projects").then(r => { setItems(r); setError(""); }).catch(() => { setItems(prev => prev ?? []); setError("Could not load your projects. Check your connection and try again."); }), []);
  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const created = await apiFetch<{ id: string }>("/projects", { method: "POST", body: JSON.stringify({ title: title.trim() }) });
      setTitle("");
      router.push(`/projects/${created.id}?intro=1`);
    }
    catch { setError("Could not create the project. Try again."); setBusy(false); }
  }
  const rename = (id: string) => async (t: string) => { await apiFetch(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ title: t }) }); await load(); };
  const remove = (id: string) => async () => { await apiFetch(`/projects/${id}`, { method: "DELETE" }); await load(); };
  const setStatus = (id: string) => async (status: "active" | "complete") => { try { await apiFetch(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); } catch { setError("Could not update the project. Try again."); } };

  return (
    <section className="grid gap-6">
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="new-project">Research project name</Label>
          <Input id="new-project" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Thesis on academic procrastination" maxLength={200} disabled={busy} data-testid="project-title" />
        </div>
        <Button type="submit" disabled={busy || !title.trim()} data-testid="project-create"><Plus size={18} weight="bold" /> {busy ? "Creating…" : "New Research Project"}</Button>
      </form>
      {error ? <p role="alert" data-testid="error-msg" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {items === null ? (
        <div className="grid gap-3" aria-busy="true"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No research projects saved yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Start one above, or <Link href="/import" className="underline">import a backup from Appuscholar v1</Link>.</p>
        </div>
      ) : (
        <div className="grid gap-3">{items.map(p => <ProjectCard key={p.id} p={p} onRename={rename(p.id)} onDelete={remove(p.id)} onStatus={setStatus(p.id)} />)}</div>
      )}
    </section>
  );
}
