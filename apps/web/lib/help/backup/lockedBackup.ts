import { b64 } from "@/lib/vault/encoding";
import { BackupError, KDF_ROUNDS, MIN_PASSPHRASE, packLocked, unpackLocked } from "./format";

/** True where Web Crypto can lock a file (not in a page served without https). */
export function canLock(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.getRandomValues === "function";
}

/** The passphrase as v1 reads it: NFC-normalised, so the same word typed on another keyboard opens the file. */
const secret = (pass: string) => new TextEncoder().encode(pass.normalize("NFC"));

async function deriveKey(pass: string, salt: Uint8Array<ArrayBuffer>, iter: number, use: KeyUsage[]): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", secret(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, use);
}

/**
 * The zip, closed with a passphrase: AES-GCM-256 under a PBKDF2-SHA-256 key (600,000 rounds, a fresh salt and iv each time). The header
 * is authenticated with the ciphertext. Nothing is stored, logged or sent; the passphrase exists only as the argument. Fewer than 10 characters
 * throws BackupError("short-passphrase").
 */
export async function lockBackup(zip: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if ([...passphrase.normalize("NFC")].length < MIN_PASSPHRASE) throw new BackupError("short-passphrase");
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const header = { kdf: "PBKDF2-SHA256" as const, iter: KDF_ROUNDS, salt: b64(salt), iv: b64(iv) };
  const key = await deriveKey(passphrase, salt, KDF_ROUNDS, ["encrypt"]);
  // The additional data is the file's own prefix (magic, length, header), so changing the header fails like changing the text.
  const prefix = packLocked(header, new Uint8Array(0));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: prefix }, key, zip as Uint8Array<ArrayBuffer>));
  return packLocked(header, ct);
}

/**
 * The zip inside a locked file. A file that is not a locked backup throws BackupError("not-a-backup"); a wrong passphrase, or a file
 * that was changed after it was made, throws BackupError("wrong-passphrase") and returns no bytes.
 */
export async function unlockBackup(file: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const { header, salt, iv, aad, ct } = unpackLocked(file);
  const key = await deriveKey(passphrase, salt, header.iter, ["decrypt"]);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad as Uint8Array<ArrayBuffer> }, key, ct as Uint8Array<ArrayBuffer>));
  } catch {
    throw new BackupError("wrong-passphrase");
  }
}
