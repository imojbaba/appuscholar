import { projectBlobClient, type BlobVault, type ProjectBlobState } from "./useProjectBlob";
import type { BlobShape, FixedBlobKind } from "./kinds";

/**
 * One read of a project's blob outside React, for code that is not a panel and must not raise a passphrase prompt: a headless client (it never asks to unlock, and a vault that is
 * locked reads as `locked`), read-only (it makes no edit of its own: `set` and `flush` do nothing), started, asked once and disposed of. `loading` is false in the answer: the read has
 * answered, whether it found a value, found none (`value` null with nothing else set: there is no such blob), or failed (`error`).
 * Like the home's read-only clients, `start()` first adopts what a panel that went away left unsent for this same blob (the student's own pending save), so the value read is their latest,
 * and sends it as that panel's next mount would; whatever cannot go stays held for the blob. That is the only write it can make, and it is never anything but the student's own edit.
 */
export async function readBlobOnce<K extends FixedBlobKind>(kind: K, projectId: string, vault: () => BlobVault): Promise<ProjectBlobState<BlobShape<K>>> {
  const c = projectBlobClient(kind, projectId, vault, () => {}, { headless: true, readOnly: true });
  try {
    await c.start();
    return c.state();
  } finally {
    c.dispose();
  }
}
