import { citKey } from "@appuscholar/core";
import type { RefCheckCache, ShelfIndex, StoredEntry } from "@/lib/blobs/kinds";
import type { BlobVault } from "@/lib/blobs/useProjectBlob";
import { rcCurrent } from "@/lib/cite/checks";
import type { Library } from "@/lib/cite/useLibrary";
import { mergePaperNotes } from "./ids";
import { ownBlob, quiet, type PaperIdsResult } from "./migrate";

/*
 * "Merge the two" (wave B Task 24, register row D-S2-130; ruling B2-R29): two library entries that are one paper (paperMatch) become one. The older pid stays; its empty fields are filled
 * from the other entry; the other's notes move to it (lib/papers/ids mergePaperNotes: the old key stays with `movedTo`, so no word the student wrote is lost); the reading-list
 * entries of the dropped pid are repointed to the kept pid; and the dropped entry's Crossref answer is dropped, while the kept entry's answer moves to its new key if the fill gave
 * it one (wave A's move), so the paper does not come back as unchecked. Four blobs change, each by its own write: it is resumable, because the library, which is what shows the pair
 * (and the item), is written last, and every earlier step is a no-op the second time.
 */

/** What the merge answers, as the paper-id migration does: "done", "locked" (the vault locked meanwhile; nothing is asked), "broken" (a blob does not open) or "busy" (it could not finish now). */
export type MergeResult = PaperIdsResult;

/**
 * `kept` with the fields it leaves empty taken from `dropped` (a field already written is never replaced). Its `ack` is the union of both (what the student kept stays kept) and it is on
 * the reading list if either was.
 */
export function mergeEntries(kept: StoredEntry, dropped: StoredEntry): StoredEntry {
  const next: StoredEntry = { ...kept };
  const fields = next as Record<string, unknown>;
  for (const [k, v] of Object.entries(dropped)) {
    if (k === "pid" || k === "rl" || k === "ack") continue;
    const mine = fields[k];
    if (typeof v === "string" && v.trim() !== "" && (mine === undefined || (typeof mine === "string" && mine.trim() === ""))) fields[k] = v;
  }
  const ack = [...(kept.ack ?? []), ...(dropped.ack ?? []).filter((k) => !(kept.ack ?? []).includes(k))];
  if (ack.length) next.ack = ack;
  if (kept.rl === false && dropped.rl !== false) next.rl = true;
  return next;
}

/** The library with `drop` taken out and `keep` filled from it, in place; the same array when either is not there (a second run, or one of the two removed meanwhile). */
export function mergeLibrary(lib: StoredEntry[], keep: string, drop: string): StoredEntry[] {
  const kept = lib.find((e) => e.pid === keep), dropped = lib.find((e) => e.pid === drop);
  if (!kept || !dropped) return lib;
  return lib.filter((e) => e !== dropped).map((e) => (e === kept ? mergeEntries(kept, dropped) : e));
}

/** The reading-list entries of the paper `from` made the paper `to`'s (a paper may have two PDFs); the same array when there are none. */
export function repointShelf(index: ShelfIndex, from: string, to: string): ShelfIndex {
  return index.some((e) => e.pid === from) ? index.map((e) => (e.pid === from ? { ...e, pid: to } : e)) : index;
}

/**
 * The Crossref answers after the merge: the kept entry's answer moves to the key it now has (its key holds the surname, year and title, and the fill may have given it one; what the
 * fill settles leaves the answer, rcCurrent), and the dropped entry's answer goes, unless it is under the key the kept entry has. The same object when there is nothing to move or drop.
 */
export function settleRefcheck(cache: RefCheckCache, o: { keptBefore: StoredEntry; keptAfter: StoredEntry; dropped: StoredEntry }): RefCheckCache {
  const from = citKey(o.keptBefore), to = citKey(o.keptAfter), gone = citKey(o.dropped);
  let out = cache;
  if (to !== from && cache[from] !== undefined) {
    out = { ...cache };
    out[to] = rcCurrent(o.keptAfter, cache[from]) ?? cache[from]!;
    delete out[from];
  }
  if (gone !== to && gone !== from && out[gone] !== undefined) {
    if (out === cache) out = { ...cache };
    delete out[gone];
  }
  return out;
}

export type MergeDeps = {
  projectId: string;
  /** The newest vault, read at each use. It is never asked for the passphrase: a vault that locks meanwhile is an answer ("locked"). */
  vault: () => BlobVault;
  /** The shell's library client: the entries as read, an update, and a flush that answers true once nothing is left unsent. */
  library: Pick<Library, "lib" | "update" | "flush">;
  /**
   * An update of the project's Crossref answers through the client that shows them, so the window sees it at once. The update returns what it was given when there is nothing to change,
   * and then nothing is written. True once the answers are saved.
   */
  updateRefcheck(fn: (prev: RefCheckCache) => RefCheckCache): Promise<boolean>;
};

/**
 * Merges the library entry `drop` into the entry `keep` and everything that carries the dropped pid. The notes and the reading list go through clients of their own (they are not
 * open in the window that asks; an open Reading list reads them again afterwards), the Crossref answers and the library through the window's. Answers "done" when there was nothing
 * left to merge (a second run). Never asks for the passphrase; a blob that does not open stops it before the library is written.
 */
export async function mergeDuplicate(keep: string, drop: string, d: MergeDeps): Promise<MergeResult> {
  const kept = d.library.lib.find((e) => e.pid === keep), dropped = d.library.lib.find((e) => e.pid === drop);
  if (!kept || !dropped) return "done";
  const merged = mergeEntries(kept, dropped);
  const vault = () => quiet(d.vault());

  const notes = ownBlob("ap_notes", d.projectId, vault);
  try {
    const n = await notes.read();
    if (n.out !== "ok") return n.out;
    const stored = n.value ?? {};
    if (mergePaperNotes(stored, drop, keep) !== stored) {
      const w = await notes.write((prev) => mergePaperNotes(prev ?? {}, drop, keep));
      if (w.out !== "ok") return w.out;
    }
  } finally { notes.close(); }

  const shelf = ownBlob("shelf_index", d.projectId, vault);
  try {
    const s = await shelf.read();
    if (s.out !== "ok") return s.out;
    const stored = s.value ?? [];
    if (repointShelf(stored, drop, keep) !== stored) {
      const w = await shelf.write((prev) => repointShelf(prev ?? [], drop, keep));
      if (w.out !== "ok") return w.out;
    }
  } finally { shelf.close(); }

  if (!(await d.updateRefcheck((prev) => settleRefcheck(prev, { keptBefore: kept, keptAfter: merged, dropped })))) return "busy";

  if (!d.library.update((prev) => mergeLibrary(prev, keep, drop))) return "busy";
  return (await d.library.flush()) ? "done" : "busy";
}
