"use client";
import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { MIN_SAMPLE_WORDS } from "@appuscholar/core";
import { useSettings } from "@/lib/settings";
import type { WritingSamples } from "@/lib/blobs/kinds/samples";
import { projectBlobClient, useProjectBlob, type BlobVault, type ProjectBlob, type ProjectBlobState } from "@/lib/blobs/useProjectBlob";
import { isPopout } from "@/lib/popout/mode";
import { fileTitle, UNTITLED, useTitle } from "@/lib/vault/titles";
import type { VaultValue } from "@/lib/vault/useVault";
import type { DocumentWithBody } from "@/components/frame/ProjectContext";
import { fitsBlob, fullSamples, SAMPLE_THROTTLE_MS, sampleOf, withoutSample, withSample } from "./captureSample";

/**
 * Documents the student took out of a project's samples in this tab (marked as a source, deleted, moved to another project), by project and
 * document: a change still waiting for one is dropped rather than flushed when the editor goes, and an entry already set for it is not put back
 * when a save replays after a conflict. Cleared by resumeSample (marked as their own again, the deletion undone, the document moved in).
 */
const dropped = new Set<string>();
const dropKey = (projectId: string, docId: string): string => projectId + "\u0000" + docId;
/** The document is the student's own writing again in this project: it is captured as before. */
export function resumeSample(projectId: string, docId: string): void { dropped.delete(dropKey(projectId, docId)); }

/**
 * The open captures' blob flush, by project, while the setting is on: what this window's capture has set but not sent (its save goes out 800 ms
 * later) is sent by it. forgetSample and Clear wait for it, so what they read or delete from the server is not about to be written over.
 */
const openFlush = new Map<string, () => Promise<boolean>>();
/** Sends what every open capture has on its way. */
export async function flushOpenSamples(): Promise<void> {
  await Promise.allSettled([...openFlush.values()].map((f) => f()));
}

/** When the student last cleared the saved copies: a change made before is not captured afterwards (it is the text they just asked to be deleted). */
let clearedAt = 0;
export function noteSamplesCleared(): void { clearedAt = Date.now(); }

/** What the capture reads when it runs: the newest render's, written after the render commits (a flush at cleanup still sees the old document's). */
type Live = { on: boolean; docId: string | null; projectId: string | null; source: boolean; title: string; blob: ProjectBlob<WritingSamples> | null };

/**
 * v1 captureWritingSample (3951-3959), called after each autosave. Here it follows the editor: the student's typed words (AI text left out)
 * go to the project's `writing_samples` blob when the setting is on (opt-in, ruling P2), the document is not a source and has 30 words of its own.
 * A document is written at most once a minute (each write is a sealed PUT of the whole blob), and the change still waiting is written when the
 * student leaves the document. Nothing is written in a pop-out, or while the blob is loading, locked or does not open (a value set over an
 * unreadable blob would stay held with no panel to say so, and leaving the page would ask for ever). Written as an update of the stored value, so
 * another window's entries are kept.
 */
export function useWritingSampleCapture(editor: Editor | null, doc: DocumentWithBody | null): void {
  const { settings } = useSettings();
  const on = settings.writingSampleCapture === true;
  const docId = doc?.id ?? null;
  const projectId = doc?.projectId ?? null;
  const title = fileTitle(useTitle(doc, "document")) || UNTITLED;
  const live = useRef<Live>({ on: false, docId: null, projectId: null, source: false, title: UNTITLED, blob: null });

  // Declared before the blob hook so that, leaving a document or the project, this cleanup runs before the blob's own (which hands its client
  // over): the flush below still has a client to set on.
  useEffect(() => {
    if (!editor || !docId || !projectId) return;
    const ed = editor, id = docId, pid = projectId, key = dropKey(pid, id);
    let dirty = false;
    let closed = false;
    let lastAt = 0;
    let changedAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (ms: number) => { if (timer === null && !closed) timer = setTimeout(run, ms); };
    function run() {
      timer = null;
      if (!dirty) return;
      const L = live.current;
      // Not this project's capture any more (the document moved), or taken out of it, or typed before the student cleared the copies.
      if (!L.on || isPopout() || ed.isDestroyed || dropped.has(key) || L.projectId !== pid || (L.docId === id && L.source) || changedAt <= clearedAt) { dirty = false; return; }
      // Few words in all: nothing to judge, and nothing worth a pass over the HTML (AI text counts here, so the typed words are fewer still).
      if ((ed.getText().match(/\S+/g) ?? []).length < MIN_SAMPLE_WORDS) { dirty = false; return; }
      const b = L.blob;
      // Not set over a blob that is not there to be read; tried again in a minute (and when the document is left).
      if (!b || b.loading || b.locked || b.broken) { lastAt = Date.now(); arm(SAMPLE_THROTTLE_MS); return; }
      dirty = false;
      lastAt = Date.now();
      const entry = sampleOf(ed.getHTML(), L.title, lastAt);
      if (!entry || b.value?.[id]?.text === entry.text) return;
      // A copy that would be too large for the api is not sent (it would stay held for good); the Settings status says it is full.
      if (!fitsBlob(b.value, id, entry)) { fullSamples.add(pid); return; }
      fullSamples.delete(pid);
      // The update runs again if the save has to be replayed onto a newer value, so it asks again whether the entry still belongs there.
      b.set((prev) => (dropped.has(key) ? (prev ?? {}) : withSample(prev, id, entry)));
    }
    const onUpdate = () => {
      if (!live.current.on) return;
      dirty = true;
      changedAt = Date.now();
      arm(Math.max(0, lastAt + SAMPLE_THROTTLE_MS - Date.now()));
    };
    ed.on("update", onUpdate);
    return () => {
      ed.off("update", onUpdate);
      if (timer !== null) clearTimeout(timer);
      timer = null;
      closed = true;
      run();
    };
  }, [editor, docId, projectId]);

  // Off (the default) reads nothing: no request, and no passphrase asked for a blob nobody asked for.
  const blob = useProjectBlob("writing_samples", on ? projectId : null);
  useEffect(() => {
    live.current = { on, docId, projectId, source: doc?.kind === "source", title, blob };
    if (!on || !projectId) return;
    const flush = blob.flush;
    openFlush.set(projectId, flush);
    return () => { if (openFlush.get(projectId) === flush) openFlush.delete(projectId); };
  });
}

/** The card's mount line: the capture for the open document's editor (DocumentCard keys it by the editor instance). */
export function WritingSampleCapture({ editor, doc }: { editor: Editor | null; doc: DocumentWithBody | null }): null {
  useWritingSampleCapture(editor, doc);
  return null;
}

/** What forgetSample needs of the vault: the blob's (read, open, seal) and whether it is locked now. */
type ForgetVault = BlobVault & Pick<VaultValue, "status">;

/**
 * Takes a document's entry out of its project's blob when the student marks it as a source (v1 3172), deletes it or moves it to another project.
 * This window's own capture is sent first (it sets at once and sends 800 ms later), so the removal rides on its version instead of reading the
 * server before the entry has got there. The blob is read here only (no panel keeps it open), and written only if the entry is in it, so nothing
 * is created for a project that has no samples. When the blob cannot be read now (a failed read, or a vault that is locked, which is not read
 * first so that one passphrase ask serves read and write) the removal is queued as an update that changes nothing where the entry is absent,
 * and goes out when the blob can be read; a failure leaves it held for the blob's next client.
 */
export async function forgetSample(projectId: string, docId: string, vault: () => ForgetVault): Promise<void> {
  dropped.add(dropKey(projectId, docId));
  await openFlush.get(projectId)?.().catch(() => false);
  const seen: { state?: ProjectBlobState<WritingSamples> } = {};
  const c = projectBlobClient("writing_samples", projectId, vault, (s) => { seen.state = s; });
  try {
    if (vault().status !== "locked") await c.start();
    const s = seen.state;
    if (s && !s.locked && !s.error && !(s.value && docId in s.value)) return;
    c.set((prev) => (prev && docId in prev ? withoutSample(prev, docId) : prev) as WritingSamples);
    await c.flush();
  } finally {
    c.dispose();
  }
}
