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
  // The editor remounts only after a restore (so it shows the restored body); never on the initial load, because a
  // remount during the first keystrokes would strand those edits in a replaced instance (dev StrictMode loads twice).
  const [editorGen, setEditorGen] = useState(0);
  const [error, setError] = useState("");
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const onReady = useCallback((api: { flushNow: () => Promise<boolean> }) => { flushRef.current = api.flushNow; }, []);
  const beforeRestore = useCallback(async () => (await flushRef.current?.()) ?? true, []);
  const load = useCallback(() => apiFetch<Doc>(`/documents/${docId}`).then(d => { setDoc(d); setSeq(d.currentSeq); setError(""); return true; }).catch(() => { setError("Could not load this document."); return false; }), [docId]);
  useEffect(() => { void load(); }, [load]);
  if (!doc) return <div style={{ padding: 16 }}>{error ? <p role="alert" data-testid="error-msg">{error}</p> : "Loading…"}</div>;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Link href={`/projects/${id}`}>← Documents</Link>
      <h1 style={{ color: "var(--primary)" }}>{doc.title}</h1>
      {error && <p role="alert" data-testid="error-msg">{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <Editor key={editorGen} docId={doc.id} initialHtml={doc.bodyHtml} initialSeq={doc.currentSeq} onSaved={setSeq} onReady={onReady} />
        <RevisionPanel docId={doc.id} currentSeq={seq} onRestored={() => { void load().then(ok => { if (ok) setEditorGen(g => g + 1); }); }} beforeRestore={beforeRestore} />
      </div>
    </div>
  );
}
