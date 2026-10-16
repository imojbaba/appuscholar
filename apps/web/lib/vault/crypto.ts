import { b64, unb64 } from "./encoding";

/* The researcher's vault: pure WebCrypto, no React, no network. Keys never leave the browser in clear.
   Layers: passphrase / recovery code -> (PBKDF2) wrapping key -> vault key (VK) -> per-document key (DEK) -> document text.
   Every blob is base64url fields joined by "." with no padding; every AES-GCM encryption uses a fresh 12-byte IV. */

/** A string of base64url fields joined by ".": `salt.iv.ct` for the passphrase and recovery wraps, `iv.ct` for everything else. */
export type Wrapped = string;

export const VAULT_KDF_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type VaultErrorCode = "wrong-passphrase" | "wrong-code" | "corrupt" | "no-crypto";

export class VaultError extends Error {
  constructor(public code: VaultErrorCode) {
    super(code);
    this.name = "VaultError";
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) throw new VaultError("no-crypto");
  return crypto.subtle;
}

const randomBytes = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(n));

/** Splits a blob into exactly `n` base64url fields, or throws "corrupt". */
function fields(blob: Wrapped, n: number): Uint8Array<ArrayBuffer>[] {
  const bits = String(blob).split(".");
  if (bits.length !== n) throw new VaultError("corrupt");
  try { return bits.map(unb64); } catch { throw new VaultError("corrupt"); }
}

async function aesEncrypt(key: CryptoKey, data: BufferSource): Promise<{ iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer }> {
  const iv = randomBytes(IV_BYTES);
  return { iv, ct: await subtle().encrypt({ name: "AES-GCM", iv }, key, data) };
}

async function derive(secret: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: VAULT_KDF_ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Wraps the raw vault key under a PBKDF2-derived key. Blob: salt.iv.ct. */
async function wrapWithSecret(vk: CryptoKey, secret: string): Promise<Wrapped> {
  const salt = randomBytes(SALT_BYTES);
  const k = await derive(secret, salt);
  const { iv, ct } = await aesEncrypt(k, await subtle().exportKey("raw", vk));
  return b64(salt) + "." + b64(iv) + "." + b64(ct);
}

/** Opens a salt.iv.ct blob. Any failure to authenticate means the secret is wrong; a malformed blob is "corrupt". */
async function unwrapWithSecret(blob: Wrapped, secret: string, wrong: "wrong-passphrase" | "wrong-code"): Promise<CryptoKey> {
  const [salt, iv, ct] = fields(blob, 3) as [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>];
  const k = await derive(secret, salt);
  let raw: ArrayBuffer;
  try { raw = await subtle().decrypt({ name: "AES-GCM", iv }, k, ct); } catch { throw new VaultError(wrong); }
  // Extractable so the unlocked vault key can be re-wrapped (new passphrase, new recovery code).
  return subtle().importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function generateVaultKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export const wrapWithPassphrase = (vk: CryptoKey, pass: string): Promise<Wrapped> => wrapWithSecret(vk, pass);
export const unwrapWithPassphrase = (blob: Wrapped, pass: string): Promise<CryptoKey> => unwrapWithSecret(blob, pass, "wrong-passphrase");

/** 20 characters from an unambiguous alphabet (no 0, 1, I, O), shown as four groups of five. */
export function generateRecoveryCode(): string {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) throw new VaultError("no-crypto");
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  // The alphabet has 32 characters, so masking 5 bits is unbiased.
  const chars = Array.from(bytes, (x) => RECOVERY_ALPHABET[x & 31]!);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

const normaliseCode = (code: string): string => code.toUpperCase().replace(/[-\s]/g, "");

export const wrapWithRecovery = (vk: CryptoKey, code: string): Promise<Wrapped> => wrapWithSecret(vk, normaliseCode(code));
export const unwrapWithRecovery = (blob: Wrapped, code: string): Promise<CryptoKey> => unwrapWithSecret(blob, normaliseCode(code), "wrong-code");

/** A fresh per-document key. Extractable so it can be wrapped under the vault key. */
export async function generateDek(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Wraps the raw bytes of `key` under the vault key. Blob: iv.ct. */
export async function wrapKey(key: CryptoKey, vk: CryptoKey): Promise<Wrapped> {
  const { iv, ct } = await aesEncrypt(vk, await subtle().exportKey("raw", key));
  return b64(iv) + "." + b64(ct);
}

export async function unwrapKey(blob: Wrapped, vk: CryptoKey): Promise<CryptoKey> {
  const [iv, ct] = fields(blob, 2) as [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>];
  try {
    const raw = await subtle().decrypt({ name: "AES-GCM", iv }, vk, ct);
    return await subtle().importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } catch { throw new VaultError("corrupt"); }
}

export async function encryptText(text: string, key: CryptoKey): Promise<Wrapped> {
  const { iv, ct } = await aesEncrypt(key, enc.encode(text));
  return b64(iv) + "." + b64(ct);
}

export async function decryptText(blob: Wrapped, key: CryptoKey): Promise<string> {
  const [iv, ct] = fields(blob, 2) as [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>];
  try { return dec.decode(await subtle().decrypt({ name: "AES-GCM", iv }, key, ct)); } catch { throw new VaultError("corrupt"); }
}

/** An X25519 keypair for sharing. The public half is raw bytes, base64url; the private half stays a CryptoKey (extractable only so it can be wrapped). */
export async function generateKeypair(): Promise<{ publicKeyB64: string; privateKey: CryptoKey }> {
  const kp = (await subtle().generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { publicKeyB64: b64(await subtle().exportKey("raw", kp.publicKey)), privateKey: kp.privateKey };
}

export async function wrapPrivateKey(priv: CryptoKey, vk: CryptoKey): Promise<Wrapped> {
  const { iv, ct } = await aesEncrypt(vk, await subtle().exportKey("pkcs8", priv));
  return b64(iv) + "." + b64(ct);
}

export async function unwrapPrivateKey(blob: Wrapped, vk: CryptoKey): Promise<CryptoKey> {
  const [iv, ct] = fields(blob, 2) as [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>];
  try {
    const raw = await subtle().decrypt({ name: "AES-GCM", iv }, vk, ct);
    return await subtle().importKey("pkcs8", raw, { name: "X25519" }, false, ["deriveBits"]);
  } catch { throw new VaultError("corrupt"); }
}
