/*
 * v1 7602-7603: `let popChan=null; try{popChan=new BroadcastChannel('appu_sync')}catch(e){popChan=null}` — one channel per window, shared by the
 * pop-out's inserts and the writing window's receiver. A window never hears its own posts (one instance per window).
 */

/** v1's channel name. */
export const SYNC_CHANNEL = "appu_sync";

/**
 * v1's insert (7483: `{type:'insert',text}`), and, new here, the markup the reference list and a translated quote insert (register row D-S2-17),
 * and AI text put in the document from a place's own window ("Put in my document", putAiInDocument), which goes in marked as AI text.
 */
export type InsertMessage = { type: "insert"; text: string } | { type: "insert"; html: string } | { type: "insert"; ai: string };
/**
 * v1's storage listener (7614-7616) re-renders the Citation Manager when `appu_citations` or `appu_retraction_cache` changes in another window.
 * Blobs live on the server, so a window that saved one of those two says so here, and the other windows read it again.
 */
export type BlobMessage = { type: "blob"; id: string };
/**
 * The document access of a place's own window (Task G4, ruling R10; lib/editor/docAccess.ts). A pop-out says hello when its tools mount; the
 * writing window answers with a snapshot of the open document, and sends one again after each change, so a pop-out's text() and selection()
 * read a mirror. Every other call is a request the writing window runs on the open document and replies to by id: a pop-out never writes a
 * document itself (register row D-S2-43).
 */
export type DocHelloMessage = { type: "doc-hello" };
export type DocSnapshotMessage = { type: "doc-snapshot"; projectId: string | null; docId: string | null; text: string; selection: string };
export type DocOp = "insertText" | "insertBlock" | "wrapSelection" | "replaceInDocument" | "allDocuments" | "rewriteDocument";
export type DocRequestMessage = { type: "doc-request"; id: string; projectId: string; op: DocOp; args: unknown[] };
export type DocReplyMessage = { type: "doc-reply"; id: string; result: unknown };
export type SyncMessage = InsertMessage | BlobMessage | DocHelloMessage | DocSnapshotMessage | DocRequestMessage | DocReplyMessage;

export type SyncChannel = {
  postMessage(m: unknown): void;
  addEventListener(type: "message", l: (ev: MessageEvent) => void): void;
  removeEventListener(type: "message", l: (ev: MessageEvent) => void): void;
};

/** undefined: not opened yet; null: this browser has none (v1's catch). */
let ch: SyncChannel | null | undefined;

/** The window's channel, opened on first use. */
export function syncChannel(): SyncChannel | null {
  if (ch !== undefined) return ch;
  if (typeof window === "undefined") return null;
  try {
    const c = new BroadcastChannel(SYNC_CHANNEL);
    // Node's channel (the tests' environment) would otherwise keep the process alive; browsers have no unref.
    (c as unknown as { unref?: () => void }).unref?.();
    ch = c;
  } catch { ch = null; }
  return ch;
}

/** For tests: a stand-in channel, null for none, undefined to open the real one again at next use. */
export function setSyncChannel(c: SyncChannel | null | undefined): void { ch = c; }

/** Listens to the other windows' messages; returns the unsubscribe. */
export function onSyncMessage(fn: (m: unknown) => void): () => void {
  const c = syncChannel();
  if (!c) return () => {};
  const l = (ev: MessageEvent) => fn(ev.data);
  c.addEventListener("message", l);
  return () => c.removeEventListener("message", l);
}

/** A blob of one of v1's two synced keys was saved here (BlobMessage). */
export function announceBlob(id: string): void {
  try { syncChannel()?.postMessage({ type: "blob", id } satisfies BlobMessage); } catch { /* a closed channel: the other window reads it at its next load */ }
}

/** Calls `fn` when another window announces the blob `id`. */
export function onBlobAnnounced(id: string, fn: () => void): () => void {
  return onSyncMessage((m) => {
    const b = m as Partial<BlobMessage> | null;
    if (b && b.type === "blob" && b.id === id) fn();
  });
}
