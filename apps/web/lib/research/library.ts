import type { Formatted, RsPaper } from "@appuscholar/core";
import type { StoredEntry } from "@/lib/blobs/kinds";
import { putIntext } from "@/lib/cite/actions";
import { keepResult, resultEntry, type KeepResultDeps } from "@/lib/papers/keep";
import { paperMatch } from "@/lib/papers/ids";

/*
 * A search result into the Citation Library. Wave B (Task 18, register row D-S2-123) moved the saving to lib/papers/keep.ts: Keep is the one way a result joins the library
 * and the reading list (keepResult), and a result is the same paper as an entry by paperMatch, not by its title alone. What stays here is "Put a citation in my document"
 * (v1 rsInsertCitation 8486-8491, which keeps the paper first). v1's "Add a paper you found elsewhere" (rsAddManual 8435-8454) left Find with the Research panel: the
 * Citations tab's form adds a source by hand, and the paste box (Task 19) looks one up.
 */

/**
 * rsInsertCitation: the paper kept if it is new, then the in-text citation at the cursor (numbered styles take its number in the library), and v1's toast. The insert goes
 * through the shell's requestInsert (Task 11), which opens a closed document first; when the document did not open the paper is still kept, nothing went in, and no
 * "inserted" is claimed (requestInsert has said why). A library that has not been read keeps nothing and inserts nothing (useKeep waits for it).
 */
export async function insertResult(p: RsPaper, d: KeepResultDeps & { insert(f: Formatted): Promise<boolean>; toast(msg: string): void; t(key: string): string }): Promise<void> {
  const built = resultEntry(p, d.style);
  const r = keepResult(p, d);
  const entry: StoredEntry = r.state === "kept" ? { ...built, pid: r.pid, rl: true } : d.lib.find((l) => paperMatch(built, l)) ?? { ...built, pid: r.pid };
  const lib = r.state === "kept" ? [...d.lib, entry] : d.lib;
  let inserted: Promise<boolean> = Promise.resolve(false);
  putIntext(entry, lib, d.style, (f) => { inserted = d.insert(f); });
  if (await inserted) d.toast(p.retracted ? d.t("retr_added_warn") : d.t("rs_inserted"));
}
