import { describe, expect, it } from "vitest";
import { BackupError, LOCKED_EXT, MAGIC_TEXT, isLocked } from "../lib/help/backup/format";
import { lockBackup, unlockBackup } from "../lib/help/backup/lockedBackup";
import { lastBackup, lastVerify, stampBackup, stampVerify } from "../lib/help/backup/stamp";

const PASS = "correct horse battery";
const zip = () => new TextEncoder().encode("PK-pretend-zip-bytes " + "x".repeat(500));
const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof BackupError ? e.code : "other:" + String(e); } };

describe("locked backup (Task C6)", () => {
  it("round trip: the file opens with its passphrase and carries the magic bytes, not the plain bytes", async () => {
    const plain = zip();
    const locked = await lockBackup(plain, PASS);
    expect(new TextDecoder().decode(locked.subarray(0, MAGIC_TEXT.length))).toBe("APPULOCK2");
    expect(isLocked(locked)).toBe(true);
    expect(isLocked(plain)).toBe(false);
    expect(new TextDecoder().decode(locked)).not.toContain("pretend-zip");
    expect(await unlockBackup(locked, PASS)).toEqual(plain);
    expect(LOCKED_EXT).toBe(".locked");
  });

  it("the header names the key derivation: PBKDF2-SHA-256, 600,000 rounds, a fresh salt and iv each time", async () => {
    const a = await lockBackup(zip(), PASS);
    const b = await lockBackup(zip(), PASS);
    const head = (f: Uint8Array) => { const n = new DataView(f.buffer, f.byteOffset + 9, 4).getUint32(0); return JSON.parse(new TextDecoder().decode(f.subarray(13, 13 + n))); };
    expect(head(a)).toMatchObject({ kdf: "PBKDF2-SHA256", iter: 600000 });
    expect(head(a).salt).not.toBe(head(b).salt);
    expect(head(a).iv).not.toBe(head(b).iv);
    expect(a).not.toEqual(b);
  });

  it("a wrong passphrase rejects with wrong-passphrase and returns no bytes", async () => {
    const locked = await lockBackup(zip(), PASS);
    let got: Uint8Array | undefined;
    const c = await code(unlockBackup(locked, "another long passphrase").then((r) => { got = r; return r; }));
    expect(c).toBe("wrong-passphrase");
    expect(got).toBeUndefined();
  });

  it("a passphrase of 9 characters is refused; 10 is accepted", async () => {
    expect(await code(lockBackup(zip(), "123456789"))).toBe("short-passphrase");
    expect(await code(lockBackup(zip(), "1234567890"))).toBeNull();
  });

  it("tampering with one ciphertext byte, or the header, fails", async () => {
    const locked = await lockBackup(zip(), PASS);
    const flip = (i: number) => { const c = locked.slice(); c[i] = c[i]! ^ 1; return c; };
    expect(await code(unlockBackup(flip(locked.length - 5), PASS))).toBe("wrong-passphrase");
    // a byte inside the JSON header (the salt) fails too: the header is authenticated
    expect(["wrong-passphrase", "not-a-backup"]).toContain(await code(unlockBackup(flip(40), PASS)));
  });

  it("a file that is not a locked backup is not-a-backup", async () => {
    expect(await code(unlockBackup(new TextEncoder().encode("hello"), PASS))).toBe("not-a-backup");
    expect(await code(unlockBackup(new Uint8Array(0), PASS))).toBe("not-a-backup");
    const locked = await lockBackup(zip(), PASS);
    expect(await code(unlockBackup(locked.subarray(0, 20), PASS))).toBe("not-a-backup");
  });

  it("the passphrase is never stored or logged", async () => {
    const seen: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => { const o = console[k]; console[k] = (...a: unknown[]) => { seen.push(a.map(String).join(" ")); }; return () => { console[k] = o; }; });
    try { await unlockBackup(await lockBackup(zip(), PASS), PASS); await code(unlockBackup(await lockBackup(zip(), PASS), "wrong wrong wrong")); } finally { spies.forEach((u) => u()); }
    expect(seen.join("\n")).not.toContain("correct horse");
    expect(seen.join("\n")).not.toContain("wrong wrong");
  });
});

describe("the backup stamps (device-local)", () => {
  const store = new Map<string, string>();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  (globalThis as { localStorage?: unknown }).localStorage = ls;
  it("stampBackup writes appu_last_backup and lastBackup reads it; zero when none", () => {
    store.clear();
    expect(lastBackup()).toBe(0);
    stampBackup(1_700_000_000_000);
    expect(store.get("appu_last_backup")).toBe("1700000000000");
    expect(lastBackup()).toBe(1_700_000_000_000);
    store.set("appu_last_backup", "junk");
    expect(lastBackup()).toBe(0);
  });
  it("stampVerify writes appu_last_verify", () => {
    store.clear();
    expect(lastVerify()).toBe(0);
    stampVerify(5);
    expect(store.get("appu_last_verify")).toBe("5");
    expect(lastVerify()).toBe(5);
  });
  it("a store that throws is survived", () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(() => stampBackup()).not.toThrow();
    expect(lastBackup()).toBe(0);
    (globalThis as { localStorage?: unknown }).localStorage = ls;
  });
});
