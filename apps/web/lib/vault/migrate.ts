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
  /** After each document of the first pass: `n` of `total` documents done (the checking passes after it do not report). */
  onProgress(n: number, total: number): void;
};

/** Listing passes before complete: the run repeats until a pass rewrites nothing, at most this many times. */
export const MAX_PASSES = 5;

/** The api's refusal code (apiFetch's ApiError carries the server's `error` as `code`). */
const codeOf = (e: unknown): unknown => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined);

type Deps = MigrateDeps;
type Doc = { id: string; deks: WrappedDek[] };

/** Seals one document's plaintext revisions in place, oldest first. Returns how many were rewritten. */
async function migrateDocument(deps: Deps, doc: Doc): Promise<number> {
  let deks = doc.deks;
  let n = 0;
  const plain = (await deps.listRevisions(doc.id)).filter((r) => r.keyVersion === 0).map((r) => r.seq).sort((a, b) => a - b);
  for (const seq of plain) {
    const rev = await deps.getRevision(doc.id, seq);
    // Sealed since the listing (another tab): never sealed twice.
    if (rev.keyVersion !== 0) continue;
    let sealed = await deps.encrypt({ id: doc.id, deks }, rev.bodyHtml);
    if (sealed.dek) {
      try {
        await deps.addDek(doc.id, sealed.dek);
        deks = [sealed.dek];
      } catch (e) {
        if (codeOf(e) !== "dek-exists") throw e;
        // Another tab gave this document its first key meanwhile: that key is the document's, so seal under it instead.
        deks = (await deps.listAll()).find((d) => d.id === doc.id)?.deks ?? [];
        if (deks.length === 0) throw e;
        sealed = await deps.encrypt({ id: doc.id, deks }, rev.bodyHtml);
      }
    }
    await deps.rewrite(doc.id, seq, { bodyHtml: sealed.bodyHtml, keyVersion: sealed.keyVersion });
    n++;
  }
  return n;
}

/** One listing of every document, by id. `report`: the first pass reports progress; the checking passes after it do not. */
async function migratePass(deps: Deps, report: boolean): Promise<number> {
  const docs = [...(await deps.listAll())].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let n = 0;
  for (const [i, doc] of docs.entries()) {
    n += await migrateDocument(deps, doc);
    if (report) deps.onProgress(i + 1, docs.length);
  }
  return n;
}

/**
 * The one-off move of plaintext revisions (keyVersion 0) into the vault, in place: documents by id, each one's revisions oldest first. A
 * document without a key gets one (once) before its first rewrite; when another tab added one first (409 dek-exists), that key is re-read
 * and used. Passes repeat until one rewrites nothing (at most MAX_PASSES), so plaintext saved by a stale tab during the run is sealed too.
 * The server refuses completion while plaintext remains (409 plaintext-remains): then one more pass and one retry. Idempotent: a run after
 * an interruption finds only what is still plaintext. Any other failure stops the run before `complete`.
 */
export async function migrateToVault(deps: MigrateDeps): Promise<{ rewritten: number }> {
  let rewritten = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const n = await migratePass(deps, pass === 0);
    rewritten += n;
    if (n === 0) break;
  }
  try {
    await deps.complete();
  } catch (e) {
    if (codeOf(e) !== "plaintext-remains") throw e;
    rewritten += await migratePass(deps, false);
    await deps.complete();
  }
  return { rewritten };
}
