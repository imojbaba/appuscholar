"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { WrappedDek } from "@/lib/vault/useVault";
import type { StageKey } from "@/lib/tools";

/** One project of `GET /projects?include=work` (apps/api store's ProjectWork) as the web receives it: times are ISO strings. */
export type ProjectWork = {
  id: string; userId: string; title: string; titleKeyVersion: number; deks: WrappedDek[]; field: string; stage: string; status: string; contentLang: string; kind: string;
  createdAt: string; stageMarks: Partial<Record<StageKey, { readyAt: string }>>; documentCount: number; lastEditedAt: string | null;
  blobs: Array<{ kind: string; updatedAt: string; version: number }>; draftWords: number; draftEditedAt: string | null;
};

/**
 * Every project with its work, from one request (the home and the list read their stage states from it; no blob is read). Null until it answers;
 * `error` once it failed (signed out or the API down), until reload() answers.
 */
export function useProjectWork(): { work: ProjectWork[] | null; error: boolean; reload(): Promise<void> } {
  const [work, setWork] = useState<ProjectWork[] | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(async () => { setWork(await apiFetch<ProjectWork[]>("/projects?include=work")); setError(false); }, []);
  useEffect(() => {
    let live = true;
    apiFetch<ProjectWork[]>("/projects?include=work").then((w) => { if (live) setWork(w); }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, []);
  return { work, error, reload };
}
