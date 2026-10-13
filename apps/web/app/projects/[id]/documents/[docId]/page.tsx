"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Editor } from "@/components/Editor";
import { RevisionPanel } from "@/components/RevisionPanel";
type Doc = { id: string; title: string; bodyHtml: string; currentSeq: number };
export default function DocumentPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = use(params);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [seq, setSeq] = useState(0);
  const [key, setKey] = useState(0);
  const [error, setError] = useState("");
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const onReady = useCallback((api: { flushNow: () => Promise<void> }) => { flushRef.current = api.flushNow; }, []);
  const beforeRestore = useCallback(async () => { await flushRef.current?.(); }, []);
  const load = useCallback(() => apiFetch<Doc>(`/documents/${docId}`).then(d => { setDoc(d); setSeq(d.currentSeq); setKey(k => k + 1); setError(""); }).catch(() => setError("Could not load this document.")), [docId]);
  useEffect(() => { void load(); }, [load]);
  if (!doc) return <main style={{ padding: 16 }}>{error ? <p role="alert" data-testid="error-msg">{error}</p> : "Loading…"}</main>;
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Link href={`/projects/${id}`}>← Documents</Link>
      <h1 style={{ color: "var(--purple-800)" }}>{doc.title}</h1>
      {error && <p role="alert" data-testid="error-msg">{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <Editor key={key} docId={doc.id} initialHtml={doc.bodyHtml} initialSeq={doc.currentSeq} onSaved={setSeq} onReady={onReady} />
        <RevisionPanel docId={doc.id} currentSeq={seq} onRestored={() => { void load(); }} beforeRestore={beforeRestore} />
      </div>
    </main>
  );
}
