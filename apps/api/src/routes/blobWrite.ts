import { z } from "zod";
import { WrappedDekSchema, checkSealed } from "./docWrite";
import type { Store, WrappedDek } from "../store/types";

/**
 * The stage panels' blob kinds, one blob per kind per project. The web client mirrors this list (apps/web/lib/blobs/kinds.ts, the same order);
 * keep the strings as they are. `shelf_cols` is the Reading shelf's matrix columns (ruling R14). After them, the stage 3 to 6 tools' kinds (Task
 * G3, ruling R8), one per v1 key group: Design and ethics, statistics, coding, my style, words, closeness and the viva; then `participants`, the
 * participant list (spec 2026-10-24-participants-design.md §6), which is only ever stored sealed (SEALED_ONLY_KINDS). The api stores each
 * body as given (sealed or plain JSON) and never reads it, so a kind's shape is the web client's only.
 */
export const BLOB_KINDS = [
  "idea_intake", "citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "ap_cols", "rs_prefs", "shelf_cols",
  "design_reg", "design_proto", "design_ec", "design_ctri", "design_pi", "design_budget", "stats_sets", "stats_runs", "stats_prefs", "qual_codes", "qual_prefs",
  "style_profile", "style_samples", "style_meta", "words_bank", "words_prefs", "close_prefs", "viva_log",
  "participants"
] as const;
export type FixedBlobKind = (typeof BLOB_KINDS)[number];
/** One shelf paper's extracted text: `shelf_paper:<id>`, the id 1 to 64 characters of [A-Za-z0-9_-]. */
export const SHELF_PAPER_KIND = /^shelf_paper:[A-Za-z0-9_-]{1,64}$/;
export const isBlobKind = (kind: string): boolean => (BLOB_KINDS as readonly string[]).includes(kind) || SHELF_PAPER_KIND.test(kind);
/** Kinds that hold names and are never stored in plaintext: a write with keyVersion 0 is refused with 409 vault-required, whether or not the user has a vault (defence in depth; the web client seals them or writes nothing). */
export const SEALED_ONLY_KINDS: ReadonlySet<string> = new Set<FixedBlobKind>(["participants"]);

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
 * with its dek known or arriving with it; a SEALED_ONLY_KINDS kind takes ciphertext only. `deks` are the blob's current ones ([] for a new
 * blob). Nothing is written here.
 */
export async function resolveBlobWrite(store: Store, userId: string, kind: string, deks: WrappedDek[], b: BlobWriteBody): Promise<ResolvedBlobWrite> {
  if (b.keyVersion === 0) {
    if (SEALED_ONLY_KINDS.has(kind) || (await store.getVault(userId))) return { ok: false, status: 409, error: "vault-required" };
    return { ok: true, body: b.body, keyVersion: 0 };
  }
  const sealed = checkSealed(deks, b.body, b.keyVersion, b.dek);
  if (!sealed.ok) return sealed;
  return { ok: true, body: b.body, keyVersion: b.keyVersion, addDek: sealed.addDek };
}
