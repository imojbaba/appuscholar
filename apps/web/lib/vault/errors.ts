import { ApiError } from "@/lib/api";

/** The vault key is not in memory (locked, or held while the one-off migration runs): the write is held, never sent in plaintext. */
export const isVaultLocked = (e: unknown): boolean => e instanceof Error && e.message === "vault-locked";
/**
 * The keys of a document or blob, or the vault, changed under this tab: "vault-required" (a vault was set up elsewhere after this body
 * was sealed in plaintext) or "dek-exists" (a first key reached the server from another tab or an earlier attempt whose answer was lost).
 * The caller re-reads the keys and seals once more.
 */
export const isStaleKeys = (e: unknown): boolean => e instanceof ApiError && e.status === 409 && (e.code === "vault-required" || e.code === "dek-exists");
