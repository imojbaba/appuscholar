import { projectBlobClient, type BlobVault, type ProjectBlobState } from "./useProjectBlob";
import type { BlobShape, FixedBlobKind } from "./kinds";

/**
 * One read of a project's blob outside React, for code that is not a panel and must not raise a passphrase prompt: a headless client (it never asks to unlock, and a vault that is
 * locked reads as `locked`), read-only (it cannot write whatever is done with it), started, asked once and disposed of. `loading` is false in the answer: the read has answered,
 * whether it found a value, found none (`value` null with nothing else set: there is no such blob), or failed (`error`).
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
