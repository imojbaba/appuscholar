import { z } from "zod";
import { WrappedDekSchema, checkSealed } from "./docWrite";
import type { Store, WrappedDek } from "../store/types";

/** The stage panels' blob kinds, one blob per kind per project. The web client mirrors this list; keep the strings as they are. */
export const BLOB_KINDS = ["idea_intake", "citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "ap_cols", "rs_prefs"] as const;
export type FixedBlobKind = (typeof BLOB_KINDS)[number];
/** One shelf paper's extracted text: `shelf_paper:<id>`, the id 1 to 64 characters of [A-Za-z0-9_-]. */
export const SHELF_PAPER_KIND = /^shelf_paper:[A-Za-z0-9_-]{1,64}$/;
export const isBlobKind = (kind: string): boolean => (BLOB_KINDS as readonly string[]).includes(kind) || SHELF_PAPER_KIND.test(kind);

const KeyVersion = z.number().int().min(0).max(1e6);
/** PUT /projects/:id/blobs/:kind. keyVersion 0 is plaintext JSON (stored as given, never sanitised: it is not HTML). */
export const BlobPutSchema = z.object({ body: z.string(), keyVersion: KeyVersion, dek: WrappedDekSchema.optional() }).strict();
/** PUT /projects/:id/blobs/:kind/rewrite (the vault migration): ciphertext only; a plaintext blob brings its first dek here. */
export const BlobRewriteSchema = z.object({ body: z.string(), keyVersion: KeyVersion.min(1), dek: WrappedDekSchema.optional() }).strict();

export type BlobWriteBody = { body: string; keyVersion: number; dek?: WrappedDek };
export type ResolvedBlobWrite =
  | { ok: false; status: 400 | 409; error: "invalid" | "unknown-key-version" | "vault-required" | "dek-exists" }
  | { ok: true; body: string; keyVersion: number; addDek?: WrappedDek };

/**
 * The documents' write rules for a blob: keyVersion 0 only while the user has no vault record (complete or not), ciphertext otherwise
 * with its dek known or arriving with it. `deks` are the blob's current ones ([] for a new blob). Nothing is written here.
 */
export async function resolveBlobWrite(store: Store, userId: string, deks: WrappedDek[], b: BlobWriteBody): Promise<ResolvedBlobWrite> {
  if (b.keyVersion === 0) {
    if (await store.getVault(userId)) return { ok: false, status: 409, error: "vault-required" };
    return { ok: true, body: b.body, keyVersion: 0 };
  }
  const sealed = checkSealed(deks, b.body, b.keyVersion, b.dek);
  if (!sealed.ok) return sealed;
  return { ok: true, body: b.body, keyVersion: b.keyVersion, addDek: sealed.addDek };
}
