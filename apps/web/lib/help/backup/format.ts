import { unb64 } from "@/lib/vault/encoding";

/** The first bytes of a locked backup (v2 of v1's locked-backup idea: the file is the account export zip, closed). */
export const MAGIC_TEXT = "APPULOCK2";
export const MAGIC = new TextEncoder().encode(MAGIC_TEXT);
/** The file extension of a locked backup. */
export const LOCKED_EXT = ".locked";
/** v1 4010: PBKDF2-SHA-256, 600,000 rounds. */
export const KDF_ROUNDS = 600_000;
/** A reader accepts rounds in this range only and refuses any other value (v1 clamped it into a range instead), so a hostile header cannot make the browser spin. */
const ROUNDS_MIN = 100_000, ROUNDS_MAX = 5_000_000;
/** v1's rule: at least 10 characters, counted as v1 counts them (`p1.length`, before normalising). */
export const MIN_PASSPHRASE = 10;
/** The header sits in the clear after the magic: its length is 4 bytes, big-endian. */
const LEN = 4;
const SALT = 16, IV = 12, TAG = 16;

/**
 * Why a backup could not be locked or opened:
 * "wrong-passphrase" (the passphrase is wrong or the file was changed: AES-GCM cannot tell which), "not-a-backup" (not a locked file, or not
 * a backup zip), "short-passphrase" (fewer than 10 characters when locking), "passphrase-needed" (a locked file was given with no passphrase).
 */
export type BackupErrorCode = "wrong-passphrase" | "not-a-backup" | "short-passphrase" | "passphrase-needed";
export class BackupError extends Error {
  constructor(public code: BackupErrorCode) { super(code); this.name = "BackupError"; }
}

export type LockHeader = { kdf: "PBKDF2-SHA256"; iter: number; salt: string; iv: string };

/** True when the bytes begin with the locked-backup magic. */
export function isLocked(file: Uint8Array): boolean {
  return file.length > MAGIC.length && MAGIC.every((b, i) => file[i] === b);
}

/**
 * True when the bytes look like a backup from the old single-page app (v1): a `.json` file that opens `{"app":"appuscholar"`, locked or not.
 * Those hold the old browser's stored data, not an account export, so Check does not read them and Import a v1 backup does; this only lets
 * the check say so. Only the first bytes are looked at, because a v1 file can be large.
 */
export function isV1Backup(file: Uint8Array): boolean {
  const head = new TextDecoder("utf-8").decode(file.subarray(0, 64));
  return /^\ufeff?\s*\{\s*"app"\s*:\s*"appuscholar"/.test(head);
}

/** magic + header length + header JSON + ciphertext. */
export function packLocked(header: LockHeader, ct: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(MAGIC.length + LEN + head.length + ct.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, head.length);
  out.set(head, MAGIC.length + LEN);
  out.set(ct, MAGIC.length + LEN + head.length);
  return out;
}

/** The parts of a locked file; `aad` is everything before the ciphertext, so the header is authenticated too. Anything malformed: not-a-backup. */
export function unpackLocked(file: Uint8Array): { header: LockHeader; salt: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; aad: Uint8Array; ct: Uint8Array } {
  if (!isLocked(file) || file.length < MAGIC.length + LEN) throw new BackupError("not-a-backup");
  const n = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(MAGIC.length);
  const start = MAGIC.length + LEN, end = start + n;
  if (n < 2 || n > 1024 || end + TAG > file.length) throw new BackupError("not-a-backup");
  try {
    const header = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.subarray(start, end))) as LockHeader;
    const salt = unb64(String(header.salt)), iv = unb64(String(header.iv));
    if (header.kdf !== "PBKDF2-SHA256" || !Number.isInteger(header.iter) || header.iter < ROUNDS_MIN || header.iter > ROUNDS_MAX || salt.length !== SALT || iv.length !== IV) throw new Error("header");
    return { header, salt, iv, aad: file.subarray(0, end), ct: file.subarray(end) };
  } catch {
    throw new BackupError("not-a-backup");
  }
}
