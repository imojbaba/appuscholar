import { useSyncExternalStore } from "react";
import type { BlobKind } from "@/lib/blobs/kinds";
import { isCaptureHash } from "@/lib/cite/captureHash";
import { stageOfKind } from "@/lib/frame/stages";
import { isStageKey, type StageKey } from "@/lib/tools";

/*
 * v1 1959-1964: "Pop-out window: the same page opened as a second browser window showing one tool. It shares this site's saved data with the
 * writing window, so it may only WRITE the two keys that belong to the tools it shows. Everything else, above all the open document, stays
 * read-only here, so the pop-out can never overwrite what is being written in the main window." v1 reads the window's role from `#popout=<tool>`.
 * Wave B (register row D-S2-43, amending D-S2-17): any place opens in its own window, its address with `?window=1`, and that window writes only
 * its own stage's kinds and never the document.
 */

/** The query a place's own window carries: `/p/<id>/<stage>/<tab>?window=1`. */
export const WINDOW_PARAM = "window";

/** Set while a pop-out's shell is mounted, so a move inside the window (a tab's link) stays a pop-out before its address gets `?window=1` back. */
let held = false;
/** The project shell of a pop-out holds the window's role while it is mounted (lib/popout/sync.ts keeps the address). */
export function holdPopout(on: boolean): void { held = on; }

/** v1 POPOUT (1963): this window is a pop-out, its address carrying `?window=1`. False on the server, where nothing is written. */
export function isPopout(): boolean {
  if (typeof window === "undefined") return false;
  return held || new URLSearchParams(window.location.search).get(WINDOW_PARAM) === "1";
}

/**
 * The adding screen (`/add`, wave B Task 20, ruling B2-R16): the tab the bookmark opens to keep one paper. It is not a pop-out (it writes the project's library, which a pop-out
 * of another stage may not), but it is not a place to start the vault's one-off migrations either: its tab is closed straight after the keep. An old bookmark opens `/#capture=...`
 * and `/` sends it on to `/add` only once the app has loaded, so a `#capture=` hash counts as the adding screen wherever it is: the hop through `/` must not start a migration either.
 */
export function isAddingScreen(): boolean {
  if (typeof window === "undefined") return false;
  return /^\/add\/?$/.test(window.location.pathname) || isCaptureHash(window.location.hash);
}

/**
 * Whether this tab may start the one-off migrations, those that rewrite the student's data in the browser: the vault's sealing of plaintext revisions and blobs (useVault), the
 * sealing of plaintext titles (ProjectShell) and the paper-id migration (lib/papers/migrate). Not in a pop-out (D-S2-43: the writing window runs them) and not on the adding screen
 * (B2-R16: a migration cut off by the tab closing would only have to be resumed; the next workspace tab runs it).
 */
export function mayMigrate(): boolean { return !isPopout() && !isAddingScreen(); }

/** The stage of the place a pop-out shows, from its path (`/p/<id>/<stage>…`); null outside a pop-out, on the project's home and outside a project. */
export function popoutStage(): StageKey | null {
  if (!isPopout()) return null;
  const s = /^\/p\/[^/]+\/([^/]+)/.exec(window.location.pathname)?.[1];
  return s && isStageKey(s) ? s : null;
}

/** isPopout for a render: false on the server and while hydrating, so the server's markup and the first client render agree. */
export function usePopout(): boolean {
  return useSyncExternalStore(noSubscribe, isPopout, serverFalse);
}
const noSubscribe = () => () => {};
const serverFalse = () => false;

/** `href` with `?window=1`, the hash kept last. */
export function windowHref(href: string): string {
  const [rest, hash] = href.split("#", 2) as [string, string | undefined];
  const [path, query] = rest.split("?", 2) as [string, string | undefined];
  const q = new URLSearchParams(query);
  q.set(WINDOW_PARAM, "1");
  return path + "?" + q.toString() + (hash !== undefined ? "#" + hash : "");
}

/**
 * v1 LS.set/LS.rm's guard (1967, 1969), by stage: the writing window writes every kind; a pop-out writes the kinds of the stage it shows
 * (stageOfKind), so a Literature window writes the library, the caches (refcheck_cache too), the shelf and the notes, an Idea window the intake only,
 * and a window on the project's home or of a kind no stage owns writes nothing.
 */
export function blobWritable(kind: BlobKind): boolean {
  if (!isPopout()) return true;
  const own = popoutStage();
  return own !== null && stageOfKind(kind)?.stage === own;
}

/**
 * Where an old pop-out link (`/popout?tool=cite`, `?tool=research`, v1's `#popout=<tool>`) goes now: the matching Literature tab of the active
 * project (the scratch space's when none is active), in its own window; any other tool to the project list.
 */
export function oldPopoutTarget(tool: string | null, projectId: string): string {
  const tab = tool === "cite" ? "citations" : tool === "research" ? "find" : null;
  return tab ? windowHref(`/p/${projectId}/lit/${tab}`) : "/projects";
}
