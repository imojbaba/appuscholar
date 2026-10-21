import { clGather, clOtherDocs, type ClDoc, type ClShelfPaper, type ClSource } from "@appuscholar/core";
import type { ShelfIndex, ShelfPaper } from "@/lib/blobs/kinds";
import type { ProjectDocument } from "@/lib/editor/docAccess";

/*
 * The Closeness tab's sources (v1 closeInit 6901-6916 and clGather 6919-6936). The listing is closeInit's: papers on the Reading shelf, and the student's other documents with a body over
 * 200 characters, never the open one. A shelf paper's text is its own blob, read when the check runs (not when the tab opens), so a long shelf costs nothing until it is used.
 */

/** The other documents closeInit listed (clOtherDocs). A pop-out does not know which document is open (currentId null): the one whose text is the open text is left out, so a document is never compared with itself. */
export function otherDocuments(docs: ProjectDocument[], currentId: string | null, openText: string): ClDoc[] {
  const open = openText.trim();
  const mine = docs.filter((d) => currentId !== null || open === "" || d.text.trim() !== open);
  return clOtherDocs(mine.map((d) => ({ id: d.id, title: d.title, body: d.html })), currentId ?? "");
}

export type Gathered = { sources: ClSource[]; unreadable: number };

/**
 * clGather's computation with the shelf's papers read now. `picked` is the ticked values in the order they stand in the panel ("s:<paper id>", "d:<document id>"); a paper that cannot be read
 * (no blob, or one that does not open) is left out and counted, so the panel can say so and never reports a check over fewer sources than the student ticked as if it were whole.
 */
export async function gatherSources(a: {
  picked: string[]; index: ShelfIndex | null; loadPaper(id: string): Promise<ShelfPaper | null>; docs: ClDoc[]; pasted: string;
}): Promise<Gathered> {
  const ids = a.picked.filter((v) => v.startsWith("s:")).map((v) => v.slice(2));
  const read = await Promise.all(ids.map(async (id) => ({ id, paper: await a.loadPaper(id).catch(() => null) })));
  const shelf: ClShelfPaper[] = [];
  let unreadable = 0;
  for (const { id, paper } of read) {
    const entry = (a.index ?? []).find((p) => p.id === id);
    if (!paper || !entry) { unreadable++; continue; }
    shelf.push({ id, title: entry.title, file: entry.file, pages: paper.pages });
  }
  return { sources: clGather(a.picked, shelf, a.docs, a.pasted), unreadable };
}
