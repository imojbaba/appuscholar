import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { unlockV1Backup, isLockedV1Backup } from "../src/v1locked";
import { parseV1Backup } from "../src/v1import";

const plain = readFileSync(new URL("./fixtures/v1-backup-small.json", import.meta.url), "utf8");

// Mirror of v1's bkEncrypt (appuscholer/index.html), with the iteration count at the decrypt floor to keep tests fast.
const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
async function v1Encrypt(text: string, pass: string, z: 0 | 1, iter = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  let bytes: Uint8Array<ArrayBuffer> = new TextEncoder().encode(text);
  if (z) {
    const cs = new CompressionStream("gzip");
    const w = cs.writable.getWriter(); void w.write(bytes); void w.close();
    bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("appuscholar-backup-v2") }, key, bytes));
  return JSON.stringify({ app: "appuscholar", v: 2, locked: true, enc: { alg: "AES-GCM-256", kdf: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), z, aad: "appuscholar-backup-v2" }, exported: "2026-10-12T09:30:00.000Z", ct: b64(ct) });
}

describe("locked v1 backups", () => {
  it("detects a locked backup and parseV1Backup reports it as locked", async () => {
    const locked = await v1Encrypt(plain, "correct horse battery", 1);
    expect(isLockedV1Backup(locked)).toBe(true);
    expect(isLockedV1Backup(plain)).toBe(false);
    expect(isLockedV1Backup("nope")).toBe(false);
    expect(parseV1Backup(locked)).toEqual({ ok: false, reason: "locked" });
  });

  it("unlocks a gzip-compressed backup with the right passphrase", async () => {
    const locked = await v1Encrypt(plain, "correct horse battery", 1);
    const r = await unlockV1Backup(locked, "correct horse battery");
    expect(r).toEqual({ ok: true, text: plain });
    const parsed = parseV1Backup(r.ok ? r.text : "");
    expect(parsed.ok && parsed.backup.documents.map(d => d.title)).toEqual(["Literature review", "Plain notes"]);
  });

  it("unlocks an uncompressed backup (z: 0) and normalises the passphrase to NFC", async () => {
    const locked = await v1Encrypt(plain, "café au lait", 0);
    expect(await unlockV1Backup(locked, "café au lait")).toEqual({ ok: true, text: plain });
  });

  it("reports a wrong passphrase", async () => {
    const locked = await v1Encrypt(plain, "correct horse battery", 1);
    expect(await unlockV1Backup(locked, "wrong horse battery")).toEqual({ ok: false, reason: "wrong-passphrase" });
  });

  it("reports a tampered ciphertext as a wrong passphrase", async () => {
    const locked = JSON.parse(await v1Encrypt(plain, "pw-pw-pw-pw", 1)) as { ct: string };
    locked.ct = "A" + locked.ct.slice(1);
    expect(await unlockV1Backup(JSON.stringify(locked), "pw-pw-pw-pw")).toEqual({ ok: false, reason: "wrong-passphrase" });
  });

  it("refuses text that is not a locked backup", async () => {
    expect(await unlockV1Backup(plain, "x")).toEqual({ ok: false, reason: "not-locked" });
    expect(await unlockV1Backup("nope", "x")).toEqual({ ok: false, reason: "not-locked" });
  });
});
