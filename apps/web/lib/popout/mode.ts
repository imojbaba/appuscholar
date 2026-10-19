import type { BlobKind } from "@/lib/blobs/kinds";

/*
 * v1 1959-1964: "Pop-out window: the same page opened as a second browser window showing one tool. It shares this site's saved data with the
 * writing window, so it may only WRITE the two keys that belong to the tools it shows. Everything else, above all the open document, stays
 * read-only here, so the pop-out can never overwrite what is being written in the main window." v1 reads the window's role from `#popout=<tool>`;
 * here the pop-out is the page /popout (register row D-S2-17).
 */

/** The pop-out's page: /popout?tool=cite or /popout?tool=research. */
export const POPOUT_PATH = "/popout";

/** v1 POPOUT (1963): this window is a pop-out. False on the server, where nothing is written. */
export function isPopout(): boolean {
  return typeof window !== "undefined" && window.location.pathname === POPOUT_PATH;
}

/** v1 POPOUT_WRITABLE (1964), `['appu_citations','appu_retraction_cache']`: the blob kinds of the two tools a pop-out shows. */
export const POPOUT_WRITABLE: readonly BlobKind[] = ["citations", "retraction_cache"];

/** v1 LS.set/LS.rm's guard (1967, 1969): in a pop-out, every other kind is read-only. */
export function blobWritable(kind: BlobKind): boolean {
  return !isPopout() || POPOUT_WRITABLE.includes(kind);
}
