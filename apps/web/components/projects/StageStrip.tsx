"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { STAGES, stageIndex, stageLabel, type ProjectStage } from "@/lib/stages";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export function StageStrip({ projectId, stage }: { projectId: string; stage: string }) {
  const [current, setCurrent] = useState<ProjectStage>(STAGES[stageIndex(stage)]!.key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const i = stageIndex(current);
  const prev = i > 0 ? STAGES[i - 1] : null;
  const next = i < STAGES.length - 1 ? STAGES[i + 1] : null;
  async function go(key: ProjectStage) {
    if (busy || key === current) return;
    const before = current; setCurrent(key); setBusy(true); setError("");
    try { await apiFetch(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ stage: key }) }); }
    catch { setCurrent(before); setError("Could not save the stage. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <section aria-label="Research stages" className="rounded-lg border bg-card p-4" data-testid="stage-strip">
      <ol className="grid gap-2 sm:grid-cols-6">
        {STAGES.map((s, idx) => (
          <li key={s.key}>
            <button type="button" onClick={() => go(s.key)} disabled={busy} aria-current={s.key === current ? "step" : undefined} data-testid={`stage-chip-${s.key}`}
              className={cn("flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent", s.key === current ? "border-primary bg-primary text-primary-foreground hover:bg-primary" : idx < i ? "border-transparent text-muted-foreground" : "text-foreground")}>
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-xs font-medium", s.key === current ? "bg-white/20" : "bg-muted")}>{idx + 1}</span>
              <span className="truncate">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium" data-testid="stage-counter">Stage {i + 1} of {STAGES.length}</span>
        <div className="flex items-center gap-2">
          {prev ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => go(prev.key)} data-testid="stage-back"><ArrowLeft size={16} /> Back: {prev.label}</Button> : null}
          {next
            ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => go(next.key)} data-testid="stage-next">Next: {next.label} <ArrowRight size={16} /></Button>
            : <span className="text-muted-foreground" data-testid="stage-final">Final stage. Nothing after this in the sequence.</span>}
        </div>
      </div>
      {error ? <p role="alert" data-testid="error-msg" className="mt-2 text-xs text-destructive">{error}</p> : null}
      <p className="sr-only">Current stage: {stageLabel(current)}</p>
    </section>
  );
}
