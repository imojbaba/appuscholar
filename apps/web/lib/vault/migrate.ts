import type { VaultValue, WrappedDek } from "./useVault";

export type MigrateDeps = {
  /** Every document of the account, soft-deleted ones included, with the keys it has. */
  listAll(): Promise<{ id: string; deks: WrappedDek[] }[]>;
  listRevisions(id: string): Promise<{ seq: number; keyVersion: number }[]>;
  getRevision(id: string, seq: number): Promise<{ bodyHtml: string; keyVersion: number }>;
  /** POST /documents/:id/deks. */
  addDek(id: string, dek: WrappedDek): Promise<void>;
  /** PUT /documents/:id/revisions/:seq/rewrite: the same revision row, its body now ciphertext. */
  rewrite(id: string, seq: number, body: { bodyHtml: string; keyVersion: number }): Promise<void>;
  /** POST /me/vault/complete. */
  complete(): Promise<void>;
  encrypt: VaultValue["encryptBody"];
  /** After each document: `n` of `total` documents done. */
  onProgress(n: number, total: number): void;
};

/**
 * The one-off move of plaintext revisions (keyVersion 0) into the vault, in place: documents by id, each one's revisions oldest first. A
 * document without a key gets one (once) before its first rewrite. Idempotent: a run after an interruption finds only what is still
 * plaintext and rewrites that. Any failure stops the run before `complete`, so the vault is completed exactly once, after everything.
 */
export async function migrateToVault(deps: MigrateDeps): Promise<{ rewritten: number }> {
  const docs = [...(await deps.listAll())].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let rewritten = 0;
  for (const [i, doc] of docs.entries()) {
    let deks = doc.deks;
    const plain = (await deps.listRevisions(doc.id)).filter((r) => r.keyVersion === 0).map((r) => r.seq).sort((a, b) => a - b);
    for (const seq of plain) {
      const rev = await deps.getRevision(doc.id, seq);
      // Sealed since the listing (another tab): never sealed twice.
      if (rev.keyVersion !== 0) continue;
      const sealed = await deps.encrypt({ id: doc.id, deks }, rev.bodyHtml);
      if (sealed.dek) {
        await deps.addDek(doc.id, sealed.dek);
        deks = [sealed.dek];
      }
      await deps.rewrite(doc.id, seq, { bodyHtml: sealed.bodyHtml, keyVersion: sealed.keyVersion });
      rewritten++;
    }
    deps.onProgress(i + 1, docs.length);
  }
  await deps.complete();
  return { rewritten };
}
