"use client";
import { useState, useSyncExternalStore } from "react";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useVault } from "@/lib/vault/useVault";
import { codeColourCss } from "@/lib/tools/qual/colours";
import { liveOf, subscribeLive } from "@/lib/tools/qual/liveStore";

/**
 * Coding's colours in the open document (v1 painted them inline at 6255 and hid them with `qual-hide`, 13674; v2 writes no colour into a document, ruling R4). One `<style>`
 * scoped to `.editor .ProseMirror`, a rule for each code keyed on `data-qcode` (lib/tools/qual/colours.ts, which also keeps a hostile id or colour out of the text). Nothing
 * is drawn while the codes are being read, locked, or none, or when "Show code colors in the document" is off (kind qual_prefs; no value means shown). Mounted by the
 * project shell in the writing window only, whichever place is open.
 *
 * The layer reads the project's `qual_codes` and `qual_prefs` blobs itself (the first read, and a change a pop-out saves and announces). A second useProjectBlob in this
 * window does not hear the panel's saves, so the panel also publishes to lib/tools/qual/liveStore; the layer takes the panel's value while it is newer than what its own blob last delivered.
 */
export function DocumentLayer({ projectId }: { projectId: string }) {
  const { status } = useVault();
  // A blob's first read asks for the passphrase on a locked vault; the layer must never raise a prompt of its own, so it reads only once the vault is open (or off).
  return status === "off" || status === "unlocked" || status === "migrating" ? <Colours projectId={projectId} /> : null;
}

function Colours({ projectId }: { projectId: string }) {
  const codes = useProjectBlob("qual_codes", projectId);
  const prefs = useProjectBlob("qual_prefs", projectId);
  const live = useSyncExternalStore(subscribeLive, () => liveOf(projectId), () => liveOf(projectId));
  const codesSeen = useSeen(codes.value, live.codesAt);
  const prefsSeen = useSeen(prefs.value, live.colorsAt);
  const list = live.codes !== undefined && live.codesAt > codesSeen ? live.codes : codes.value;
  const shown = live.showcolors !== undefined && live.colorsAt > prefsSeen ? live.showcolors : prefs.value?.showcolors !== false;
  const css = shown ? codeColourCss(list) : "";
  return css ? <style data-testid="qual-colours">{css}</style> : null;
}

/**
 * The panel's counter at the moment the blob last delivered a value: a value of the blob is newer than every publish before it, and older than the ones after.
 * Updated while rendering (the documented way to derive state from a changed input) so the very render that sees the new value already uses the new stamp.
 */
function useSeen(own: unknown, now: number): number {
  const [seen, setSeen] = useState({ own, at: now });
  if (seen.own !== own) setSeen({ own, at: now });
  return seen.own === own ? seen.at : now;
}
