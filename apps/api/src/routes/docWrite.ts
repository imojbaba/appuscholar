import { z } from "zod";
import { originCount, sanitizeHtml, wordCount } from "@appuscholar/core";
import type { OriginStats, TitleWrite, WrappedDek, Store } from "../store/types";

const Count = z.number().int().min(0).max(1e9);
export const OriginStatsSchema = z.object({ typed: Count, ai: Count, passages: Count, kept: Count, edited: Count, unknown: Count }).strict();
export const WrappedDekSchema = z.object({ v: z.number().int().min(1).max(1e6), wrapped: z.string().min(1).max(10_000) }).strict();
/**
 * The shape of a sealed body, as the browser writes it: a 12-byte IV and the AES-GCM output, base64url without padding, joined by ".".
 * The server cannot check the encryption, only the shape; plaintext HTML never has it, so a body that claims a key version is refused without it.
 */
export const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;

/**
 * The body shape shared by document creation and PUT /documents/:id. keyVersion 0 is plaintext (the server sanitises and counts);
 * 1 or more is ciphertext the server stores untouched and cannot count, so the client sends wordCount and originStats.
 * keyVersion defaults to 0 so clients that predate the vault keep working until the vault is set up.
 */
export const WriteFields = {
  bodyHtml: z.string(),
  keyVersion: z.number().int().min(0).max(1e6).default(0),
  wordCount: Count.optional(),
  originStats: OriginStatsSchema.optional(),
  dek: WrappedDekSchema.optional()
};

/**
 * A project's or document's title. Plain is what every tab sends with the vault off, and what tabs older than wave B send on any account (no
 * titleKeyVersion). Sealed is ciphertext under the entity's dek with that `v`, which must be known once `dek` is added (see checkTitle).
 * A plain title with the sealed shape is refused: an older tab prefills Rename with the stored, sealed title, and saving it unchanged would
 * store ciphertext as a plain title (no student types 16 base64url characters, a dot and more).
 */
export const PlainTitle = z.object({ title: z.string().trim().min(1).max(200).refine((s) => !CIPHERTEXT.test(s)), titleKeyVersion: z.literal(0).optional() });
export const SealedTitle = z.object({ title: z.string().regex(CIPHERTEXT).max(4096), titleKeyVersion: z.number().int().min(1).max(1e6), dek: WrappedDekSchema.optional() });
/** For a body whose title is optional: no title means no key version either, so a key version never lands without its title. */
export const NoTitle = z.object({ title: z.undefined().optional(), titleKeyVersion: z.undefined().optional() });

/** The title a parsed body carries, as the store takes it (without its dek: the caller checks and adds that). */
export const titleOf = (b: { title?: string; titleKeyVersion?: number }): TitleWrite | undefined =>
  b.title === undefined ? undefined : { title: b.title, titleKeyVersion: b.titleKeyVersion ?? 0 };

/**
 * The rules for a sealed title, as checkSealed's for a body: its `v` must be one of `deks` or arrive as `dek`. A plain title always passes
 * (it is accepted from every account). `addDek` is the dek to store with it.
 */
export function checkTitle(deks: WrappedDek[], t: TitleWrite, dek?: WrappedDek): SealedCheck {
  if (t.titleKeyVersion === 0) return { ok: true };
  return checkSealed(deks, t.title, t.titleKeyVersion, dek);
}

export type WriteBody = { bodyHtml: string; keyVersion: number; wordCount?: number; originStats?: OriginStats; dek?: WrappedDek };
export type ResolvedWrite =
  | { ok: false; status: 400 | 409; error: "invalid" | "unknown-key-version" | "vault-required" | "dek-exists" }
  | { ok: true; bodyHtml: string; keyVersion: number; wordCount: number; originStats: OriginStats; addDek?: WrappedDek };

/** Decides what to store for a write, or why to refuse it. Nothing is written here; the caller adds `addDek` first, then the revision. */
export async function resolveWrite(store: Store, userId: string, deks: WrappedDek[], b: WriteBody): Promise<ResolvedWrite> {
  if (b.keyVersion === 0) {
    // Refused once a vault exists at all, not only once it is complete: a plaintext write during the migration could outlive it.
    if (await store.getVault(userId)) return { ok: false, status: 409, error: "vault-required" };
    const clean = sanitizeHtml(b.bodyHtml);
    return { ok: true, bodyHtml: clean, keyVersion: 0, wordCount: wordCount(clean), originStats: originCount(clean) };
  }
  if (b.wordCount === undefined || b.originStats === undefined) return { ok: false, status: 400, error: "invalid" };
  const sealed = checkSealed(deks, b.bodyHtml, b.keyVersion, b.dek);
  if (!sealed.ok) return sealed;
  return { ok: true, bodyHtml: b.bodyHtml, keyVersion: b.keyVersion, wordCount: b.wordCount, originStats: b.originStats, addDek: sealed.addDek };
}

export type SealedCheck =
  | { ok: false; status: 400 | 409; error: "invalid" | "unknown-key-version" | "dek-exists" }
  | { ok: true; addDek?: WrappedDek };

/**
 * The rules for a body that claims key version 1 or more, shared by documents and project blobs: it must have the sealed shape, and its
 * version's dek must be known or arrive with it. `addDek` is the dek to store first (absent when that wrap is already there).
 */
export function checkSealed(deks: WrappedDek[], body: string, keyVersion: number, dek?: WrappedDek): SealedCheck {
  if (!CIPHERTEXT.test(body)) return { ok: false, status: 400, error: "invalid" };
  // A dek that arrives with a write is the key for this write's version; an unrelated one is refused, not stored.
  if (dek && dek.v !== keyVersion) return { ok: false, status: 400, error: "invalid" };
  const known = deks.find((k) => k.v === keyVersion);
  if (!known && dek?.v !== keyVersion) return { ok: false, status: 400, error: "unknown-key-version" };
  const clash = dek ? deks.find((k) => k.v === dek.v) : undefined;
  // A retried write carries the same dek again: that is not an error, a different wrapping for the same version is.
  if (clash && clash.wrapped !== dek!.wrapped) return { ok: false, status: 409, error: "dek-exists" };
  return { ok: true, addDek: dek && !clash ? dek : undefined };
}
