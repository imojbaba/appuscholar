"use client";
import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { MIN_SAMPLE_WORDS } from "@appuscholar/core";
import { useSettings } from "@/lib/settings";
import type { WritingSamples } from "@/lib/blobs/kinds/samples";
import { projectBlobClient, useProjectBlob, type BlobVault, type ProjectBlob, type ProjectBlobState } from "@/lib/blobs/useProjectBlob";
import { isPopout } from "@/lib/popout/mode";
import { fileTitle, UNTITLED, useTitle } from "@/lib/vault/titles";
import type { DocumentWithBody } from "@/components/frame/ProjectContext";
import { fitsBlob, SAMPLE_THROTTLE_MS, sampleOf, withoutSample, withSample } from "./captureSample";

/**
 * Documents the student took out of the samples in this tab (marked as a source, deleted): a change still waiting for one is dropped rather than
 * flushed when the editor goes, and an entry already set for it is not put back when a save replays after a conflict. Cleared by resumeSample
 * (marked as their own again, or the deletion undone).
 */
const dropped = new Set<string>();
/** The document is the student's own writing again: it is captured as before. */
export function resumeSample(docId: string): void { dropped.delete(docId); }

/** What the capture reads when it runs: the newest render's, written after the render commits (a flush at cleanup still sees the old document's). */
type Live = { on: boolean; docId: string | null; source: boolean; title: string; blob: ProjectBlob<WritingSamples> | null };

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
  const title = fileTitle(useTitle(doc, "document")) || UNTITLED;
  const live = useRef<Live>({ on: false, docId: null, source: false, title: UNTITLED, blob: null });

  // Declared before the blob hook so that, leaving a document or the project, this cleanup runs before the blob's own (which hands its client
  // over): the flush below still has a client to set on.
  useEffect(() => {
    if (!editor || !docId) return;
    const ed = editor, id = docId;
    let dirty = false;
    let closed = false;
    let lastAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (ms: number) => { if (timer === null && !closed) timer = setTimeout(run, ms); };
    function run() {
      timer = null;
      if (!dirty) return;
      const L = live.current;
      if (!L.on || isPopout() || ed.isDestroyed || dropped.has(id) || (L.docId === id && L.source)) { dirty = false; return; }
      // Few words in all: nothing to judge, and nothing worth a pass over the HTML (AI text counts here, so the typed words are fewer still).
      if ((ed.getText().match(/\S+/g) ?? []).length < MIN_SAMPLE_WORDS) { dirty = false; return; }
      const b = L.blob;
      // Not set over a blob that is not there to be read; tried again in a minute (and when the document is left).
      if (!b || b.loading || b.locked || b.broken) { lastAt = Date.now(); arm(SAMPLE_THROTTLE_MS); return; }
      dirty = false;
      lastAt = Date.now();
      const entry = sampleOf(ed.getHTML(), L.title, lastAt);
      if (!entry || b.value?.[id]?.text === entry.text || !fitsBlob(b.value, id, entry)) return;
      // The update runs again if the save has to be replayed onto a newer value, so it asks again whether the entry still belongs there.
      b.set((prev) => (dropped.has(id) ? (prev ?? {}) : withSample(prev, id, entry)));
    }
    const onUpdate = () => {
      if (!live.current.on) return;
      dirty = true;
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
  }, [editor, docId]);

  // Off (the default) reads nothing: no request, and no passphrase asked for a blob nobody asked for.
  const blob = useProjectBlob("writing_samples", on ? (doc?.projectId ?? null) : null);
  useEffect(() => {
    live.current = { on, docId, source: doc?.kind === "source", title, blob };
  });
}

/** The card's mount line: the capture for the open document's editor (DocumentCard keys it by the editor instance). */
export function WritingSampleCapture({ editor, doc }: { editor: Editor | null; doc: DocumentWithBody | null }): null {
  useWritingSampleCapture(editor, doc);
  return null;
}

/**
 * Takes a document's entry out of its project's blob when the student marks it as a source (v1 3172) or deletes it. The blob is read here only
 * (no panel keeps it open), and written only if the entry is in it, so nothing is created for a project that has no samples. A blob locked
 * under the vault is set over as an update, which waits for the passphrase. A failure leaves the value held for the blob's next client.
 */
export async function forgetSample(projectId: string, docId: string, vault: () => BlobVault): Promise<void> {
  dropped.add(docId);
  const seen: { state?: ProjectBlobState<WritingSamples> } = {};
  const c = projectBlobClient("writing_samples", projectId, vault, (s) => { seen.state = s; });
  try {
    await c.start();
    const s = seen.state;
    if (!s || (!s.locked && !(s.value && docId in s.value))) return;
    c.set((prev) => withoutSample(prev, docId));
    await c.flush();
  } finally {
    c.dispose();
  }
}
