"use client";
import { useSyncExternalStore } from "react";

/*
 * What "Write from these papers" last wrote, per project, in this tab's memory only (wave B Task 22, W25): the AI's paragraph or gaps stay in the aside beside the table, and
 * stay when the student goes to the Reading list and comes back, until they put them in the document or dismiss them. Like Analyse a paper's loaded paper (lib/analyse/useApDoc)
 * it is never stored: an AI answer is not the student's work until they put it in their document.
 */

/** "draft": a literature review paragraph from `n` abstracts; "gap": what the papers leave open. */
export type CompareAiResult = { kind: "draft" | "gap"; n: number; text: string };

let results: Readonly<Record<string, CompareAiResult>> = {};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const emit = () => { for (const l of listeners) l(); };

/** Keeps `r` as the project's result, or clears it with null. */
export function setCompareAi(projectId: string, r: CompareAiResult | null): void {
  const next = { ...results };
  if (r) next[projectId] = r; else delete next[projectId];
  results = next;
  emit();
}

/** The project's result, or null. */
export function useCompareAi(projectId: string | null): CompareAiResult | null {
  const all = useSyncExternalStore(subscribe, () => results, () => results);
  return (projectId && all[projectId]) || null;
}

/** As a reload leaves it (tests). */
export function resetCompareAi(): void { results = {}; emit(); }
