import type { VaultStatus } from "./useVault";

/**
 * The vault's status as the app's VaultProvider last published it, for a part of the page that only reads it and must stay quiet where there is no
 * provider (the lock offer inside a tool's panel, which the tool's own tests render alone): "loading" until a provider says otherwise.
 */
let current: VaultStatus = "loading";
const subs = new Set<() => void>();

export function publishVaultStatus(s: VaultStatus): void {
  if (s === current) return;
  current = s;
  for (const f of subs) f();
}
export function readVaultStatus(): VaultStatus { return current; }
export function subscribeVaultStatus(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
