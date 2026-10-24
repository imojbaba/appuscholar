import { blobId, isBlobKind, type BlobKind } from "../blobs/kinds";
import { sealTitlesWith, type TitleStore } from "./titles";
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
  /** After each document of the first pass: `n` of `total` documents done (the checking passes after it do not report). Blobs are not counted. */
  onProgress(n: number, total: number): void;
  /** Every project id of the account, the scratch project included (GET /projects plus the scratch id). */
  listProjects(): Promise<string[]>;
  /** GET /projects/:id/blobs. Refused with not-found for a project that is gone (deleted meanwhile): that project is skipped. */
  listBlobs(projectId: string): Promise<{ kind: string; keyVersion: number }[]>;
  /** GET /projects/:id/blobs/:kind. */
  getBlob(projectId: string, kind: BlobKind): Promise<{ body: string; keyVersion: number; deks: WrappedDek[] }>;
  /** PUT /projects/:id/blobs/:kind/rewrite: the same blob, its body now ciphertext; a blob's first dek travels in the same request. */
  rewriteBlob(projectId: string, kind: BlobKind, body: { body: string; keyVersion: number; dek?: WrappedDek }): Promise<void>;
  /** Where the title step reads and writes project and document titles (sealPlainTitles' store). */
  titles: TitleStore;
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

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Seals one plaintext blob in place, its first key in the same rewrite. Returns 1 when this run rewrote it, 0 when it was sealed meanwhile
 * (another tab). A 409 dek-exists means another tab gave the blob its key first: the blob is read again and sealed under that key.
 */
async function migrateBlob(deps: Deps, projectId: string, kind: BlobKind): Promise<number> {
  const id = blobId(projectId, kind);
  const b = await deps.getBlob(projectId, kind);
  // Sealed since the listing (another tab): never sealed twice.
  if (b.keyVersion !== 0) return 0;
  const sealed = await deps.encrypt({ id, deks: b.deks }, b.body);
  try {
    await deps.rewriteBlob(projectId, kind, { body: sealed.bodyHtml, keyVersion: sealed.keyVersion, ...(sealed.dek ? { dek: sealed.dek } : {}) });
  } catch (e) {
    if (codeOf(e) !== "dek-exists") throw e;
    const fresh = await deps.getBlob(projectId, kind);
    if (fresh.keyVersion !== 0) return 0;
    if (fresh.deks.length === 0) throw e;
    const again = await deps.encrypt({ id, deks: fresh.deks }, fresh.body);
    await deps.rewriteBlob(projectId, kind, { body: again.bodyHtml, keyVersion: again.keyVersion });
  }
  return 1;
}

/** Every plaintext blob of every project, projects by id and kinds by name. Returns how many were rewritten. */
async function migrateBlobs(deps: Deps): Promise<number> {
  const projects = [...new Set(await deps.listProjects())].sort(byString);
  let n = 0;
  for (const projectId of projects) {
    let list: { kind: string; keyVersion: number }[];
    try { list = await deps.listBlobs(projectId); } catch (e) { if (codeOf(e) === "not-found") continue; throw e; }
    const plain = list.filter((b) => b.keyVersion === 0).map((b) => b.kind).filter(isBlobKind).sort(byString);
    for (const kind of plain) {
      // The project went away between the listing and this blob (deleted in another tab): skipped, like a project missing from the list.
      try { n += await migrateBlob(deps, projectId, kind); } catch (e) { if (codeOf(e) !== "not-found") throw e; }
    }
  }
  return n;
}

/**
 * One listing of every document, by id, then of every project's blobs, then the plain titles. `report`: the first pass reports progress (documents only); the
 * checking passes after it do not.
 */
async function migratePass(deps: Deps, report: boolean): Promise<number> {
  const docs = [...(await deps.listAll())].sort((a, b) => byString(a.id, b.id));
  let n = 0;
  for (const [i, doc] of docs.entries()) {
    n += await migrateDocument(deps, doc);
    if (report) deps.onProgress(i + 1, docs.length);
  }
  n += await migrateBlobs(deps);
  // The titles are sealed with the migration's own sealing (encryptBody holds every other write until the migration ends).
  return n + (await sealTitlesWith(deps.encrypt, deps.titles)).sealed;
}

/**
 * The one-off move of plaintext revisions (keyVersion 0) into the vault, in place: documents by id, each one's revisions oldest first. A
 * document without a key gets one (once) before its first rewrite; when another tab added one first (409 dek-exists), that key is re-read
 * and used. After the documents of each listing, every plaintext blob of every project (the scratch project's too) is sealed under its
 * own key, which travels with the blob's rewrite; then every plain project and document title is sealed (sealTitlesWith); `rewritten`
 * counts revisions, blobs and titles. Passes repeat until one rewrites nothing (at
 * most MAX_PASSES), so plaintext saved by a stale tab during the run is sealed too.
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
