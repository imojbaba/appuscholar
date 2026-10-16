/**
 * The Passphrase module for vi.mock, driven by one mock: askPassphrase is the mock itself, and askVaultUnlock asks it with
 * { kind: "vault-unlock" } plus the verdict it was given, when there is one. The mock may answer a string (remember unticked), { pass, remember }, or null (cancelled).
 */
export function passphraseMock(ask: (a: { kind: string }) => unknown) {
  return {
    askPassphrase: ask,
    askVaultUnlock: async (opts?: { verdict?: string }) => {
      const a = (await ask({ kind: "vault-unlock", ...(opts?.verdict ? { verdict: opts.verdict } : {}) })) as string | { pass: string; remember: boolean } | null | undefined;
      if (a == null) return null;
      return typeof a === "string" ? { pass: a, remember: false } : a;
    }
  };
}
