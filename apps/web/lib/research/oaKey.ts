"use client";
import { useEffect, useRef } from "react";
import { keyStore } from "@/lib/ai/keys";
import { useKeysIfProvided, type KeysValue } from "@/lib/ai/useKeys";
import { useVault, type VaultValue } from "@/lib/vault/useVault";

/*
 * The OpenAlex key (v1 1186-1190, oaKey / oaKeySave 8029-8031): optional, for paper search, the retraction check and the reference check. v1 keeps
 * it in this browser's localStorage (`appu_key_openalex`); here it is the credential `openalex`, locked under the vault as an AI key is ("v2." and
 * the vault's iv.ct), and opened into this tab's memory (register row D-S2-12). With no vault it is remembered on this computer, as v1 kept it.
 */
export const OPENALEX = "openalex" as const;

/**
 * The key usable now: opened from the server once the vault is open (no passphrase is asked for it), else null (also outside <KeysProvider>).
 * For the search (oaSearch), the library's retraction check (oaRetractions) and, later, connected papers and Analyse's reference check.
 */
export function useOpenAlexKey(): string | null {
  const keys = useKeysIfProvided();
  const { status } = useVault();
  const blob = keys?.blobs[OPENALEX];
  // Read at each render: useKeys re-renders its consumers after getUnlocked keeps the key in this tab.
  const have = keys ? keyStore.getUnlocked(OPENALEX) : null;
  const open = status === "unlocked" || status === "migrating";
  const getUnlocked = keys?.getUnlocked;
  // Each stored blob is opened once (or seen open): a key being removed, cleared from this tab before its blob is deleted, is not opened again.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!blob || opened.current === blob) return;
    if (have) { opened.current = blob; return; }
    if (!open || !getUnlocked) return;
    opened.current = blob;
    void getUnlocked(OPENALEX).catch(() => null);
  }, [have, blob, open, getUnlocked]);
  return have;
}

export type OaKeySaveDeps = {
  keys: Pick<KeysValue, "save" | "forget">;
  vault: Pick<VaultValue, "status" | "ensureUnlocked">;
  toast(msg: string): void;
  t(key: string): string;
};

/**
 * oaKeySave (8031): the field's value trimmed; a key is stored, an empty field removes it, each with v1's toast. With a vault the key is locked
 * under it (a locked vault is opened; cancelling stores nothing and shows no toast). With no vault yet it is remembered on this computer, as the
 * AI key's default is then ("Remember on this computer", v1's localStorage): saving a key never sends a new student into the vault setup.
 */
export async function saveOpenAlexKey(value: string, d: OaKeySaveDeps): Promise<boolean> {
  const v = String(value || "").trim();
  if (!v) {
    try { await d.keys.forget(OPENALEX); } catch { d.toast(d.t("settings_key_remove_fail")); return false; }
    d.toast(d.t("rs2_openalex_key_removed"));
    return true;
  }
  if (d.vault.status === "off") {
    try { await d.keys.save(OPENALEX, v, "plain"); } catch { d.toast(d.t("settings_key_save_fail")); return false; }
    d.toast(d.t("rs2_openalex_key_saved_on"));
    return true;
  }
  if (!(await d.vault.ensureUnlocked())) return false;
  try { await d.keys.save(OPENALEX, v, "pass"); } catch { d.toast(d.t("settings_key_lock_fail")); return false; }
  d.toast(d.t("rs2_openalex_key_saved_on"));
  return true;
}
