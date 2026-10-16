import { z } from "zod";
import { originCount, sanitizeHtml, wordCount } from "@appuscholar/core";
import type { OriginStats, WrappedDek, Store } from "../store/types";

const Count = z.number().int().min(0).max(1e9);
export const OriginStatsSchema = z.object({ typed: Count, ai: Count, passages: Count, kept: Count, edited: Count, unknown: Count }).strict();
export const WrappedDekSchema = z.object({ v: z.number().int().min(1).max(1e6), wrapped: z.string().min(1).max(10_000) }).strict();

/**
 * The body shape shared by document creation and PUT /documents/:id. keyVersion 0 is plaintext (the server sanitises and counts);
 * 1 or more is ciphertext the server stores untouched and cannot count, so the client sends wordCount and originStats.
 * keyVersion defaults to 0 so clients that predate the vault keep working until the vault is complete.
 */
export const WriteFields = {
  bodyHtml: z.string(),
  keyVersion: z.number().int().min(0).max(1e6).default(0),
  wordCount: Count.optional(),
  originStats: OriginStatsSchema.optional(),
  dek: WrappedDekSchema.optional()
};

export type WriteBody = { bodyHtml: string; keyVersion: number; wordCount?: number; originStats?: OriginStats; dek?: WrappedDek };
export type ResolvedWrite =
  | { ok: false; status: 400 | 409; error: "invalid" | "unknown-key-version" | "vault-required" | "dek-exists" }
  | { ok: true; bodyHtml: string; keyVersion: number; wordCount: number; originStats: OriginStats; addDek?: WrappedDek };

/** Decides what to store for a write, or why to refuse it. Nothing is written here; the caller adds `addDek` first, then the revision. */
export async function resolveWrite(store: Store, userId: string, deks: WrappedDek[], b: WriteBody): Promise<ResolvedWrite> {
  if (b.keyVersion === 0) {
    if ((await store.getVault(userId))?.complete) return { ok: false, status: 409, error: "vault-required" };
    const clean = sanitizeHtml(b.bodyHtml);
    return { ok: true, bodyHtml: clean, keyVersion: 0, wordCount: wordCount(clean), originStats: originCount(clean) };
  }
  if (b.wordCount === undefined || b.originStats === undefined) return { ok: false, status: 400, error: "invalid" };
  // A dek that arrives with a write is the key for this write's version; an unrelated one is refused, not stored.
  if (b.dek && b.dek.v !== b.keyVersion) return { ok: false, status: 400, error: "invalid" };
  const known = deks.find((k) => k.v === b.keyVersion);
  if (!known && b.dek?.v !== b.keyVersion) return { ok: false, status: 400, error: "unknown-key-version" };
  const clash = b.dek ? deks.find((k) => k.v === b.dek!.v) : undefined;
  // A retried write carries the same dek again: that is not an error, a different wrapping for the same version is.
  if (clash && clash.wrapped !== b.dek!.wrapped) return { ok: false, status: 409, error: "dek-exists" };
  return { ok: true, bodyHtml: b.bodyHtml, keyVersion: b.keyVersion, wordCount: b.wordCount, originStats: b.originStats, addDek: b.dek && !clash ? b.dek : undefined };
}
