import { describe, it, expect, vi } from "vitest";
import { generateVaultKey, wrapWithPassphrase, unwrapWithPassphrase, generateRecoveryCode, wrapWithRecovery, unwrapWithRecovery, generateDek, wrapKey, unwrapKey, encryptText, decryptText, generateKeypair, wrapPrivateKey, unwrapPrivateKey, VaultError, VAULT_KDF_ITERATIONS, VAULT_CHECK, sealVaultCheck, verifyVaultKey } from "@/lib/vault/crypto";

describe("vault crypto", () => {
  it("round-trips a text through DEK under VK under a passphrase", async () => {
    const vk = await generateVaultKey();
    const blob = await wrapWithPassphrase(vk, "correct horse");
    expect(blob.split(".")).toHaveLength(3);
    const vk2 = await unwrapWithPassphrase(blob, "correct horse");
    const dek = await generateDek();
    const dekBlob = await wrapKey(dek, vk);
    const dek2 = await unwrapKey(dekBlob, vk2);
    const ct = await encryptText("<p>Procrastination delays important work.</p>", dek);
    expect(ct).not.toContain("Procrastination");
    expect(await decryptText(ct, dek2)).toBe("<p>Procrastination delays important work.</p>");
  });
  it("rejects a wrong passphrase with a typed error", async () => {
    const vk = await generateVaultKey();
    const blob = await wrapWithPassphrase(vk, "right");
    await expect(unwrapWithPassphrase(blob, "wrong")).rejects.toMatchObject({ code: "wrong-passphrase" });
    await expect(unwrapWithPassphrase(blob, "wrong")).rejects.toBeInstanceOf(VaultError);
  });
  it("recovery code: 20 characters in four groups, normalised on use", async () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(code).not.toMatch(/[01IO]/);
    const vk = await generateVaultKey();
    const blob = await wrapWithRecovery(vk, code);
    const vk2 = await unwrapWithRecovery(blob, code.toLowerCase().replace(/-/g, " "));
    const dek = await generateDek();
    expect(await unwrapKey(await wrapKey(dek, vk), vk2)).toBeTruthy();
    await expect(unwrapWithRecovery(blob, "AAAAA-AAAAA-AAAAA-AAAAA")).rejects.toMatchObject({ code: "wrong-code" });
  });
  it("uses a fresh IV per encryption and flags a corrupt blob", async () => {
    const dek = await generateDek();
    const a = await encryptText("same", dek), b = await encryptText("same", dek);
    expect(a).not.toBe(b);
    await expect(decryptText(a.slice(0, -4) + "AAAA", dek)).rejects.toMatchObject({ code: "corrupt" });
  });
  it("wraps and unwraps an X25519 private key", async () => {
    const vk = await generateVaultKey();
    const kp = await generateKeypair();
    expect(kp.publicKeyB64.length).toBeGreaterThan(30);
    const priv = await unwrapPrivateKey(await wrapPrivateKey(kp.privateKey, vk), vk);
    expect(priv.algorithm.name).toBe("X25519");
  });
  it("pins the KDF cost", () => { expect(VAULT_KDF_ITERATIONS).toBe(310_000); });
  it("the check blob opens under its own vault key only", async () => {
    expect(VAULT_CHECK).toBe("appuscholar-vault-check");
    const vk = await generateVaultKey();
    const check = await sealVaultCheck(vk);
    expect(check.split(".")).toHaveLength(2);
    expect(check).not.toContain("appuscholar");
    await expect(verifyVaultKey(check, vk)).resolves.toBeUndefined();
    await expect(verifyVaultKey(check, await generateVaultKey())).rejects.toMatchObject({ code: "corrupt" });
    // A blob under the right key that holds something else is not a check either.
    await expect(verifyVaultKey(await encryptText("something else", vk), vk)).rejects.toMatchObject({ code: "corrupt" });
  });
  it("a browser without X25519 gets VaultError no-crypto from generateKeypair; other failures pass through", async () => {
    const real = crypto.subtle.generateKey.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, "generateKey").mockImplementation(((alg: AlgorithmIdentifier, ...rest: unknown[]) =>
      (alg as { name?: string }).name === "X25519" ? Promise.reject(new DOMException("Unrecognized algorithm name", "NotSupportedError")) : (real as (...a: unknown[]) => unknown)(alg, ...rest)) as typeof crypto.subtle.generateKey);
    try {
      await expect(generateKeypair()).rejects.toMatchObject({ code: "no-crypto" });
      await expect(generateKeypair()).rejects.toBeInstanceOf(VaultError);
      spy.mockImplementation((() => Promise.reject(new DOMException("boom", "OperationError"))) as typeof crypto.subtle.generateKey);
      await expect(generateKeypair()).rejects.toMatchObject({ name: "OperationError" });
    } finally { spy.mockRestore(); }
  });
});
