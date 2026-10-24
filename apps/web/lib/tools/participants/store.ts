"use client";
import { useSyncExternalStore } from "react";
import { emptyList, type ParticipantList } from "@/lib/blobs/kinds/participants";
import { readBlobOnce } from "@/lib/blobs/readOnce";
import type { BlobVault } from "@/lib/blobs/useProjectBlob";

/*
 * What the window last knew of each project's participant list, for code that is not the Participants tab: the Statistics box, the documents' highlights, the AI request's scan
 * (spec 2026-10-24-participants-design.md §8; rulings R1 and R22). Two useProjectBlob instances in one window do not hear each other's saves, so useParticipants publishes here
 * whenever its blob delivers a value (a read, a save set here, a save the server accepted), and whoever needs the list reads it from here (the same shape as lib/tools/qual/liveStore.ts).
 *
 * Each list is held with the blob version it came from (R22): a publish of a lower version than the one held is ignored, so a window that has not heard of another's save
 * cannot put its older (provisional) list over the newer one. The same version is accepted (a value set on that version, then the one the server accepted), and so is a publish with
 * no version (a clear when the vault locks, a test), which also forgets the held version.
 *
 * `null` is "no list to use": the vault is locked or off, the list does not open, or nothing has published yet. The store holds the list in memory only, never stored.
 */
type Held = { list: ParticipantList | null; version: number | undefined };
const byProject = new Map<string, Held>();
const subs = new Set<() => void>();

const emit = () => { for (const f of subs) f(); };

/**
 * The list a project has now, or null for none, with the blob version it came from. Tells subscribers only when the list changes: the same list again, or on a newer version, tells
 * nobody (the version moves on); an older version is ignored.
 */
export function publishList(projectId: string, l: ParticipantList | null, version?: number): void {
  const held = byProject.get(projectId);
  if (version !== undefined && held?.version !== undefined && version < held.version) return;
  byProject.set(projectId, { list: l, version });
  if ((held?.list ?? null) !== l) emit();
}

/** The latest list published for a project; the same object until the next change (useSyncExternalStore). */
export function listFor(projectId: string): ParticipantList | null { return byProject.get(projectId)?.list ?? null; }

/**
 * The project's list for code that is not the Participants tab and may run where no tab is mounted, a pop-out above all (it has no DocumentLayer to publish one): the AI request's names
 * check (R1). The list the window holds, else, when the vault is open ("unlocked", or "migrating" as useParticipants counts it), one read of the `participants` blob with a headless client,
 * published here and returned (a project with no blob has an empty list, as the tab shows it). It never raises a passphrase prompt, never writes, and reads nothing while the vault is
 * locked or off: null then, and when the list does not open or the read fails (nothing is published for those). `vault` is the window's vault (useVault).
 */
export async function ensureList(projectId: string, vault: () => BlobVault): Promise<ParticipantList | null> {
  const held = listFor(projectId);
  if (held) return held;
  const status = await vault().known();
  if (status !== "unlocked" && status !== "migrating") return null;
  const read = await readBlobOnce("participants", projectId, vault);
  if (read.locked || read.broken || read.error) return null;
  const list = read.value ?? emptyList();
  publishList(projectId, list, read.version);
  // A newer list may have been published while this read was out; that one wins.
  return listFor(projectId) ?? list;
}

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
