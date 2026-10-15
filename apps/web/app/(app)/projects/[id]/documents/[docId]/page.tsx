"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { Editor } from "@/components/editor/Editor";
import { RevisionPanel } from "@/components/editor/RevisionPanel";
import { TitleField } from "@/components/editor/TitleField";
import { Skeleton } from "@/components/ui/skeleton";
type Doc = { id: string; title: string; bodyHtml: string; currentSeq: number };
export default function DocumentPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = use(params);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  // The editor remounts only after a restore (so it shows the restored body); never on the initial load, because a
  // remount during the first keystrokes would strand those edits in a replaced instance (dev StrictMode loads twice).
  const [editorGen, setEditorGen] = useState(0);
  const [error, setError] = useState("");
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const onReady = useCallback((api: { flushNow: () => Promise<boolean> }) => { flushRef.current = api.flushNow; }, []);
  const beforeRestore = useCallback(async () => (await flushRef.current?.()) ?? true, []);
  const load = useCallback(() => apiFetch<Doc>(`/documents/${docId}`).then(d => { setDoc(d); setSeq(d.currentSeq); setError(""); return true; }).catch(() => { setError("Could not load this document."); return false; }), [docId]);
  useEffect(() => {
    void load();
    apiFetch<{ id: string; title: string }[]>("/projects").then(list => setProjectTitle(list.find(p => p.id === id)?.title ?? null)).catch(() => setProjectTitle(null));
  }, [load, id]);
  if (!doc) return error ? <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p> : <div className="grid gap-4"><Skeleton className="h-6 w-60" /><Skeleton className="h-10 w-80" /><Skeleton className="h-96" /></div>;
  return (
    <div className="grid gap-5">
      <Breadcrumb items={[{ href: "/projects", label: "Research Projects" }, { href: `/projects/${id}`, label: projectTitle ?? "Project" }, { label: doc.title }]} />
      <TitleField docId={doc.id} title={doc.title} beforeRename={beforeRestore} onRenamed={t => setDoc(d => (d ? { ...d, title: t } : d))} />
      {error && <p role="alert" data-testid="error-msg" className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Editor key={editorGen} docId={doc.id} initialHtml={doc.bodyHtml} initialSeq={doc.currentSeq} onSaved={setSeq} onReady={onReady} />
        <RevisionPanel docId={doc.id} currentSeq={seq} onRestored={() => { void load().then(ok => { if (ok) setEditorGen(g => g + 1); }); }} beforeRestore={beforeRestore} />
      </div>
    </div>
  );
}
