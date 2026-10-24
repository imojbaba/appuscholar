/*
 * v1 4563: `let photoChan=null;try{photoChan=new BroadcastChannel('appu_photo')}catch(e){photoChan=null}` — the photo studio window and the writing window
 * talk over their own channel (the places' windows use `appu_sync`, lib/popout/channel.ts). A window never hears its own posts, and the studio is a route of its
 * own (`/photo-studio`, ruling P7), not a place, so it shares nothing else with the pop-out code. A picture travels as a data URL in these messages and nowhere
 * else: never to the server, never to storage (R1 section 3b, risk 8); the id rides in the URL hash, never the picture.
 */

/** v1's channel name. */
export const PHOTO_CHANNEL = "appu_photo";

/**
 * Why the writing window did not put the result in (new here; v1 has only `ok`, and its studio could say nothing but "Could not edit this picture"):
 * the document would be too large to save with it (the student makes a picture smaller and presses Done again), or there is no open document it
 * belongs to (closed, locked, or another one opened since).
 */
export type SavedReason = "too-large" | "no-document";

/** Studio to writing window: the studio has loaded and wants its picture (v1 psStudioInit). */
export type PhotoReady = { t: "ready"; id: string };
/** Writing window to studio: the picture's current `src` ("" when the studio was opened empty or the picture is gone) and whether a caption already sits above it. */
export type PhotoLoad = { t: "load"; id: string; src: string; capExists: boolean };
/** Studio to writing window: the finished picture, its edits log joined ", ", and the caption box (`capOn` already false when a caption exists). */
export type PhotoDone = { t: "done"; id: string; src: string; edits: string; capOn: boolean; title: string; note: string };
/** Writing window to studio: whether the result was put in; `reason` says what to do when it was not. */
export type PhotoSaved = { t: "saved"; id: string; ok: boolean; reason?: SavedReason };
/** Studio to writing window: the studio was closed without a result. */
export type PhotoCancel = { t: "cancel"; id: string };
export type PhotoMessage = PhotoReady | PhotoLoad | PhotoDone | PhotoSaved | PhotoCancel;

export type PhotoChannelPort = {
  postMessage(m: unknown): void;
  addEventListener(type: "message", l: (ev: MessageEvent) => void): void;
  removeEventListener(type: "message", l: (ev: MessageEvent) => void): void;
};

/** v1's `[\w-]+` (psStudioInit), bounded: what a window id can be, so it is safe in a URL hash and in a window name. */
export const STUDIO_ID_PATTERN = /^[\w-]{1,64}$/;
export function isStudioId(v: unknown): v is string { return typeof v === "string" && STUDIO_ID_PATTERN.test(v); }

let seq = 0;
/**
 * v1 `'ps'+Date.now().toString(36)` (psOpen 4591), with a counter and some randomness after it so two windows opened in one millisecond, or from two
 * tabs, never share an id.
 */
export function newStudioId(): string {
  seq = (seq + 1) % 1_679_616;
  return "ps" + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Where the studio opens: the id in the hash (v1's `#popout=photo&id=`), so it never reaches the server. */
export function studioHref(id: string): string { return "/photo-studio#id=" + id; }

/** v1 psStudioInit's `location.hash` read (`[#&]id=([\w-]+)`); null when there is no id or it is not a safe one. */
export function studioIdFromHash(hash: string): string | null {
  const m = /[#&]id=([\w-]+)/.exec(hash);
  return m && isStudioId(m[1]) ? m[1] : null;
}

const SRC = /^data:image\//;
const REASONS: readonly string[] = ["too-large", "no-document"];
/**
 * Whether `m` is a message of this protocol with every field of the right kind. A window that posts anything else is ignored, so the writing window never
 * writes from a message it cannot read. A picture is a `data:image/` URL (a studio opened empty hears an empty `src` in `load` and nothing else may be empty).
 */
export function isPhotoMessage(m: unknown): m is PhotoMessage {
  if (typeof m !== "object" || m === null || Array.isArray(m)) return false;
  const o = m as Record<string, unknown>;
  if (!isStudioId(o.id)) return false;
  switch (o.t) {
    case "ready":
    case "cancel":
      return true;
    case "load":
      return typeof o.src === "string" && (o.src === "" || SRC.test(o.src)) && typeof o.capExists === "boolean";
    case "done":
      return typeof o.src === "string" && SRC.test(o.src) && typeof o.edits === "string" && typeof o.capOn === "boolean" && typeof o.title === "string" && typeof o.note === "string";
    case "saved":
      return typeof o.ok === "boolean" && (o.reason === undefined || (typeof o.reason === "string" && REASONS.includes(o.reason)));
    default:
      return false;
  }
}

/** undefined: not opened yet; null: this browser has none (v1's catch). */
let ch: PhotoChannelPort | null | undefined;

/** The window's channel, opened on first use. */
export function photoChannel(): PhotoChannelPort | null {
  if (ch !== undefined) return ch;
  if (typeof window === "undefined") return null;
  try {
    const c = new BroadcastChannel(PHOTO_CHANNEL);
    // Node's channel (the tests' environment) would otherwise keep the process alive; browsers have no unref.
    (c as unknown as { unref?: () => void }).unref?.();
    ch = c;
  } catch { ch = null; }
  return ch;
}

/** For tests: a stand-in channel, null for none, undefined to open the real one again at next use. */
export function setPhotoChannel(c: PhotoChannelPort | null | undefined): void { ch = c; }

/** Listens to the other window's messages, those of this protocol only; returns the unsubscribe. */
export function onPhotoMessage(fn: (m: PhotoMessage) => void): () => void {
  const c = photoChannel();
  if (!c) return () => {};
  const l = (ev: MessageEvent) => { if (isPhotoMessage(ev.data)) fn(ev.data); };
  c.addEventListener("message", l);
  return () => c.removeEventListener("message", l);
}

/** Posts to the other window. A channel that has closed is not an error: the other window just never hears (the studio's 4 s wait then says so). */
export function postPhoto(m: PhotoMessage): void {
  try { photoChannel()?.postMessage(m); } catch { /* closed */ }
}
