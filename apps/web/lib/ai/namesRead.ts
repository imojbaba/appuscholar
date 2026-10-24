import type { IdMode } from "@appuscholar/core";
import { hasParticipantsBlob, listProjectBlobs } from "@/lib/blobs/listing";
import { readBlobOnce } from "@/lib/blobs/readOnce";
import type { BlobVault } from "@/lib/blobs/useProjectBlob";
import { planOf } from "@/lib/tools/participants/plan";
import { ensureList } from "@/lib/tools/participants/store";
import type { NamesCtx } from "./names";

/*
 * What an AI request learns of the project's names (spec 2026-10-24-participants-design.md §8.3; controller rulings R1, R41 and R42), for callAI's CallCtx.names. It never raises a passphrase
 * prompt, makes no write of its own, and never stops a request: whatever cannot be read leaves the request to the checks that do not need the list.
 * - The vault open: the list (the window's while a hook keeps it current, else read for this request: store.ts ensureList) and the plan's mode (one headless read of `design_ec`; null when
 *   unanswered or not readable). Both are read for each request, so a pop-out sees what the main window has saved since.
 * - The vault off: no list can be stored, so none; the plan is stored plain and is read.
 * - The vault locked: nothing sealed can be read, and a list the window held is dropped (R42). The project's blob listing (the same call "Export all my work" makes) says whether a `participants`
 *   blob exists; if so the list is "locked" and the dialog says names on it were not checked. A listing that cannot be read says nothing is locked: there is no way to tell.
 */

/** The plan's mode for a project, or null when not answered or not readable (the plan is sealed while the vault is locked, and not read then). */
async function readMode(projectId: string, vault: () => BlobVault): Promise<IdMode | null> {
  const r = await readBlobOnce("design_ec", projectId, vault);
  return r.locked || r.broken || r.error ? null : planOf(r.value).mode;
}

export async function readNamesCtx(projectId: string, vault: () => BlobVault): Promise<NamesCtx> {
  try {
    const status = await vault().known();
    // Drops the list the window holds when the vault is not open (R42), whatever else is learned.
    const list = await ensureList(projectId, vault);
    if (status === "locked") {
      let locked = false;
      try { locked = hasParticipantsBlob(await listProjectBlobs(projectId)); } catch { /* cannot tell, so nothing is said to be locked */ }
      return { list: null, mode: null, locked };
    }
    return { list, mode: await readMode(projectId, vault), locked: false };
  } catch {
    return { list: null, mode: null, locked: false };
  }
}
