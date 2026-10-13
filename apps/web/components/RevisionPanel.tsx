"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
type Rev = { seq: number; authorKind: string; authorLabel: string; wordCount: number; createdAt: string };
export function RevisionPanel({ docId, currentSeq, onRestored }: { docId: string; currentSeq: number; onRestored: () => void }) {
  const [revs, setRevs] = useState<Rev[]>([]);
  const load = useCallback(() => apiFetch<Rev[]>(`/documents/${docId}/revisions`).then(setRevs).catch(() => setRevs([])), [docId]);
  // currentSeq is intentionally a trigger: reload the history whenever a new revision is saved.
  useEffect(() => { void load(); }, [load, currentSeq]);
  async function restore(seq: number) {
    if (!confirm(`Restore revision ${seq}? The current text is kept as a revision too.`)) return;
    await apiFetch(`/documents/${docId}/restore/${seq}`, { method: "POST" });
    onRestored();
  }
  return (
    <aside className="card" style={{ fontSize: 13 }}>
      <h3 style={{ margin: "0 0 8px" }}>History</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }} data-testid="revision-list">
        {revs.map(r => (
          <li key={r.seq} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>#{r.seq} · {r.authorKind}{r.authorKind === "copilot" ? ` (${r.authorLabel})` : ""} · {r.wordCount} w · {new Date(r.createdAt).toLocaleString()}</span>
            {r.seq !== currentSeq ? <button className="btn" onClick={() => restore(r.seq)} data-testid={`restore-${r.seq}`}>Restore</button> : <span style={{ color: "var(--muted)" }}>current</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
