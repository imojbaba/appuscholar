"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Rev = { seq: number; authorKind: string; authorLabel: string; wordCount: number; createdAt: string };

const WIDE = "(min-width: 1024px)";
function subscribeWide(cb: () => void) { const m = window.matchMedia(WIDE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); }

function kindLabel(r: Rev): string {
  if (r.authorKind === "web") return "you";
  if (r.authorKind === "copilot") return r.authorLabel || "copilot";
  return r.authorKind;
}

export function RevisionPanel({ docId, currentSeq, onRestored, beforeRestore }: { docId: string; currentSeq: number; onRestored: () => void; beforeRestore?: () => Promise<boolean> }) {
  const [revs, setRevs] = useState<Rev[]>([]);
  const [error, setError] = useState("");
  // Open by default on wide screens, collapsed below; once the user toggles it their choice wins. The server
  // snapshot is "collapsed", so hydration matches and the real media query applies right after mount.
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? wide;
  const load = useCallback(() => apiFetch<Rev[]>(`/documents/${docId}/revisions`).then(r => { setRevs(r); setError(""); }).catch(() => setError("Could not load history.")), [docId]);
  // currentSeq is intentionally a trigger: reload the history whenever a new revision is saved.
  useEffect(() => { void load(); }, [load, currentSeq]);
  async function restore(seq: number) {
    if (!confirm(`Restore revision ${seq}? The current text is kept as a revision too.`)) return;
    try {
      if (beforeRestore && !(await beforeRestore())) {
        setError("Your latest changes could not be saved, so the restore was cancelled. Check your connection and try again.");
        return;
      }
      await apiFetch(`/documents/${docId}/restore/${seq}`, { method: "POST" });
      onRestored();
    } catch {
      setError("Could not restore that revision. Try again.");
    }
  }
  return (
    <aside className="min-w-0 self-start rounded-lg border bg-card" aria-label="Revision history">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">History</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setManual(!open)} aria-expanded={open} aria-controls="revision-list" data-testid="history-toggle">
          {open ? <CaretUp size={14} /> : <CaretDown size={14} />}
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      {error ? <p role="alert" data-testid="error-msg" className="px-3 pb-2 text-sm text-destructive">{error}</p> : null}
      <ul id="revision-list" hidden={!open} className="divide-y border-t" data-testid="revision-list">
        {revs.map(r => (
          <li key={r.seq} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <div className="grid min-w-0 gap-0.5">
              <span className="flex items-center gap-2">
                <span className="font-medium">#{r.seq}</span>
                <Badge variant="outline">{kindLabel(r)}</Badge>
              </span>
              <span className="truncate text-xs text-muted-foreground">{r.wordCount} words · {relativeTime(r.createdAt)}</span>
            </div>
            {r.seq !== currentSeq
              ? <Button type="button" variant="outline" size="sm" onClick={() => restore(r.seq)} data-testid={`restore-${r.seq}`}>Restore</Button>
              : <span className="text-xs text-muted-foreground">current</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
