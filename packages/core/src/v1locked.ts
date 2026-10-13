/*
 * Locked (passphrase-encrypted) v1 backups, ported from v1's bkDecrypt in appuscholer/index.html.
 * Format: { app: "appuscholar", v: 2, locked: true, enc: { alg: "AES-GCM-256", kdf: "PBKDF2-SHA256", iter, salt, iv, z, aad }, exported, ct }
 * Key: PBKDF2-SHA256(passphrase NFC, salt, iter clamped to 100k..5M) → AES-GCM-256, AAD "appuscholar-backup-v2".
 * Plaintext: the ordinary v1 bundle JSON, gzip-compressed first when enc.z is 1.
 * Uses only Web Crypto, atob and DecompressionStream, which exist in browsers and in Node 22+.
 */
const BK_AAD = "appuscholar-backup-v2";

type LockedBundle = { app: "appuscholar"; locked: true; enc: { iter: unknown; salt: string; iv: string; z?: unknown }; ct: string };

export type V1UnlockResult = { ok: true; text: string } | { ok: false; reason: "not-locked" | "wrong-passphrase" };

function asLocked(json: unknown): LockedBundle | null {
  if (!json || typeof json !== "object") return null;
  const b = json as Record<string, unknown>;
  const enc = b.enc as Record<string, unknown> | undefined;
  if (b.app !== "appuscholar" || b.locked !== true || !enc || typeof enc !== "object" || typeof b.ct !== "string") return null;
  if (typeof enc.salt !== "string" || typeof enc.iv !== "string") return null;
  return json as LockedBundle;
}

/** True when the text is a v1 backup locked with a passphrase. */
export function isLockedV1Backup(text: string): boolean {
  try { return asLocked(JSON.parse(text)) !== null; } catch { return false; }
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const ds = new DecompressionStream("gzip");
  const w = ds.writable.getWriter();
  void w.write(bytes);
  void w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/** Decrypts a locked v1 backup. On success `text` is the plain v1 bundle JSON, ready for parseV1Backup. */
export async function unlockV1Backup(bundleText: string, passphrase: string): Promise<V1UnlockResult> {
  let b: LockedBundle | null = null;
  try { b = asLocked(JSON.parse(bundleText)); } catch { b = null; }
  if (!b) return { ok: false, reason: "not-locked" };
  const iter = Math.min(Math.max(parseInt(String(b.enc.iter), 10) || 0, 100000), 5000000);
  try {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(passphrase).normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(b.enc.salt), iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(b.enc.iv), additionalData: new TextEncoder().encode(BK_AAD) }, key, unb64(b.ct)));
    if (b.enc.z) bytes = await gunzip(bytes);
    return { ok: true, text: new TextDecoder().decode(bytes) };
  } catch {
    // AES-GCM authentication fails for a wrong passphrase (and for a tampered or truncated file).
    return { ok: false, reason: "wrong-passphrase" };
  }
}
