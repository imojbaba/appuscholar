/**
 * The Passphrase module for vi.mock, driven by one mock: askPassphrase is the mock itself, and askVaultUnlock asks it with
 * { kind: "vault-unlock" }. The mock may answer a string (remember unticked), { pass, remember }, or null (cancelled).
 */
export function passphraseMock(ask: (a: { kind: string }) => unknown) {
  return {
    askPassphrase: ask,
    askVaultUnlock: async () => {
      const a = (await ask({ kind: "vault-unlock" })) as string | { pass: string; remember: boolean } | null | undefined;
      if (a == null) return null;
      return typeof a === "string" ? { pass: a, remember: false } : a;
    }
  };
}
