"use client";
import { useSyncExternalStore } from "react";
import type { ParticipantList } from "@/lib/blobs/kinds/participants";

/*
 * What the window last knew of each project's participant list, for code that is not the Participants tab: the Statistics box, the documents' highlights, the AI request's scan
 * (spec 2026-10-24-participants-design.md §8; ruling R1). Two useProjectBlob instances in one window do not hear each other's saves, so useParticipants publishes here on every
 * read and every save, and whoever needs the list reads it from here (the same shape as lib/tools/qual/liveStore.ts). `null` is "no list to use": the vault is locked or off, the list
 * does not open, or nothing has published yet. The store holds the list in memory only, never stored; a hook that sees the vault lock publishes `null`.
 */
const byProject = new Map<string, ParticipantList | null>();
const subs = new Set<() => void>();

const emit = () => { for (const f of subs) f(); };

/** The list a project has now, or null for none. Publishing the list that is already there tells nobody. */
export function publishList(projectId: string, l: ParticipantList | null): void {
  if ((byProject.get(projectId) ?? null) === l) return;
  byProject.set(projectId, l);
  emit();
}

/** The latest list published for a project; the same object until the next publish (useSyncExternalStore). */
export function listFor(projectId: string): ParticipantList | null { return byProject.get(projectId) ?? null; }

export function subscribeList(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/** The project's latest published list, drawn again whenever it changes. */
export function useListFor(projectId: string): ParticipantList | null {
  return useSyncExternalStore(subscribeList, () => listFor(projectId), () => null);
}

/** For tests: forget every project's list. */
export function resetLists(): void {
  byProject.clear();
  emit();
}
