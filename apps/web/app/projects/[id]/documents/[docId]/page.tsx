"use client";
import { use, useCallback, useEffect, useState } from "react";
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
  const load = useCallback(() => apiFetch<Doc>(`/documents/${docId}`).then(d => { setDoc(d); setSeq(d.currentSeq); setKey(k => k + 1); }), [docId]);
  useEffect(() => { void load(); }, [load]);
  if (!doc) return <main style={{ padding: 16 }}>Loading…</main>;
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Link href={`/projects/${id}`}>← Documents</Link>
      <h1 style={{ color: "var(--purple-800)" }}>{doc.title}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <Editor key={key} docId={doc.id} initialHtml={doc.bodyHtml} initialSeq={doc.currentSeq} onSaved={setSeq} />
        <RevisionPanel docId={doc.id} currentSeq={seq} onRestored={() => { void load(); }} />
      </div>
    </main>
  );
}
