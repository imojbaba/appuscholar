import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupError, KDF_ROUNDS, LOCKED_EXT, MAGIC, MAGIC_TEXT, isLocked, isV1Backup, packLocked, type LockHeader } from "../lib/help/backup/format";
import { lockBackup, unlockBackup } from "../lib/help/backup/lockedBackup";
import { lastBackup, lastVerify, stampBackup, stampVerify } from "../lib/help/backup/stamp";

const PASS = "correct horse battery";
const zip = () => new TextEncoder().encode("PK-pretend-zip-bytes " + "x".repeat(500));
const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof BackupError ? e.code : "other:" + String(e); } };
afterEach(() => { vi.restoreAllMocks(); });

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

  it("production locks at 600,000 rounds: the default is that number and the key derivation is asked for it (no test-only lower setting exists)", async () => {
    expect(KDF_ROUNDS).toBe(600_000);
    const derive = vi.spyOn(crypto.subtle, "deriveKey");
    const locked = await lockBackup(zip(), PASS);
    expect(derive).toHaveBeenCalledTimes(1);
    expect(derive.mock.calls[0]![0]).toMatchObject({ name: "PBKDF2", hash: "SHA-256", iterations: 600_000 });
    derive.mockClear();
    await unlockBackup(locked, PASS);
    expect(derive.mock.calls[0]![0]).toMatchObject({ iterations: 600_000 });
    // lockBackup takes the zip and the passphrase and nothing else.
    expect(lockBackup.length).toBe(2);
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

  it("a crafted header fails as not-a-backup before any key is derived: huge or odd rounds, another kdf, a bad salt or iv, a bad length", async () => {
    const good = (): LockHeader => ({ kdf: "PBKDF2-SHA256", iter: 600_000, salt: "AAAAAAAAAAAAAAAAAAAAAA", iv: "AAAAAAAAAAAAAAAA" });
    const ct = new Uint8Array(64).fill(7);
    const craft = (over: Record<string, unknown>) => packLocked({ ...good(), ...over } as LockHeader, ct);
    const derive = vi.spyOn(crypto.subtle, "deriveKey");
    const cases: Record<string, Uint8Array> = {
      "rounds in the billions": craft({ iter: 4_000_000_000 }),
      "rounds above the cap": craft({ iter: 5_000_001 }),
      "rounds below the floor": craft({ iter: 99_999 }),
      "rounds that are not a whole number": craft({ iter: 600_000.5 }),
      "rounds written as text": craft({ iter: "600000" }),
      "no rounds": craft({ iter: undefined }),
      "another kdf": craft({ kdf: "PBKDF2-SHA1" }),
      "no kdf": craft({ kdf: undefined }),
      "a salt that is not base64": craft({ salt: "***not base64***" }),
      "a salt of the wrong length": craft({ salt: "AAAA" }),
      "a salt that is a number": craft({ salt: 12 }),
      "an iv of the wrong length": craft({ iv: "AAAAAAAAAAAAAAAAAAAAAA" }),
      "an iv that is not base64": craft({ iv: "%%%%" })
    };
    const raw = (head: Uint8Array, len = head.length) => {
      const out = new Uint8Array(MAGIC.length + 4 + head.length + 64);
      out.set(MAGIC, 0); new DataView(out.buffer).setUint32(MAGIC.length, len); out.set(head, MAGIC.length + 4);
      return out;
    };
    const text = (s: string) => new TextEncoder().encode(s);
    cases["a header that is not JSON"] = raw(text("{not json"));
    cases["a header that is null"] = raw(text("null"));
    cases["a header that is a list"] = raw(text("[1,2]"));
    cases["a header that is not UTF-8"] = raw(new Uint8Array([0xff, 0xfe, 0xfd, 0x7b, 0x7d]));
    cases["a header length of zero"] = raw(text("{}"), 0);
    cases["a header length of four billion"] = raw(text("{}"), 0xffffffff);
    cases["a header length past the end of the file"] = raw(text("{}"), 70_000);
    cases["a header length over the cap"] = raw(new Uint8Array(2000).fill(32), 2000);
    cases["only the magic"] = MAGIC.slice();
    cases["the magic and half a length"] = new Uint8Array([...MAGIC, 0, 0]);
    for (const [name, file] of Object.entries(cases)) expect(await code(unlockBackup(file, PASS)), name).toBe("not-a-backup");
    expect(derive).not.toHaveBeenCalled();
    // The control: the same helper with a good header gets past the header checks and fails only at the passphrase.
    expect(await code(unlockBackup(craft({}), PASS))).toBe("wrong-passphrase");
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("isV1Backup knows the old app's files (plain and locked .json) by their first bytes, and nothing else", () => {
    const t = (s: string) => new TextEncoder().encode(s);
    expect(isV1Backup(t('{"app":"appuscholar","v":1,"exported":"2026-01-01T00:00:00.000Z","data":{}}'))).toBe(true);
    expect(isV1Backup(t('{"app":"appuscholar","v":2,"locked":true,"enc":{}}'))).toBe(true);
    expect(isV1Backup(t('\ufeff  {"app": "appuscholar", "v": 1}'))).toBe(true);
    expect(isV1Backup(t('{"app":"something else"}'))).toBe(false);
    expect(isV1Backup(t("just some words"))).toBe(false);
    expect(isV1Backup(new Uint8Array(0))).toBe(false);
    expect(isV1Backup(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(false);
    expect(isV1Backup(MAGIC)).toBe(false);
  });

  it("the passphrase is never stored or logged", async () => {
    const seen: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => { const o = console[k]; console[k] = (...a: unknown[]) => { seen.push(a.map(String).join(" ")); }; return () => { console[k] = o; }; });
    try { await unlockBackup(await lockBackup(zip(), PASS), PASS); await code(unlockBackup(await lockBackup(zip(), PASS), "wrong wrong wrong")); } finally { spies.forEach((u) => u()); }
    expect(seen.join("\n")).not.toContain("correct horse");
    expect(seen.join("\n")).not.toContain("wrong wrong");
  });
});

describe("the backup stamps (this device, one set per signed-in student)", () => {
  const store = new Map<string, string>();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  (globalThis as { localStorage?: unknown }).localStorage = ls;
  it("stampBackup writes appu_last_backup_<user id> and lastBackup reads it; zero when none or junk", () => {
    store.clear();
    expect(lastBackup("u1")).toBe(0);
    stampBackup("u1", 1_700_000_000_000);
    expect([...store.keys()]).toEqual(["appu_last_backup_u1"]);
    expect(store.get("appu_last_backup_u1")).toBe("1700000000000");
    expect(lastBackup("u1")).toBe(1_700_000_000_000);
    store.set("appu_last_backup_u1", "junk");
    expect(lastBackup("u1")).toBe(0);
  });
  it("stampVerify writes appu_last_verify_<user id>", () => {
    store.clear();
    expect(lastVerify("u1")).toBe(0);
    stampVerify("u1", 5);
    expect([...store.keys()]).toEqual(["appu_last_verify_u1"]);
    expect(lastVerify("u1")).toBe(5);
  });
  it("a second student on the same computer neither sees nor overwrites the first one's stamps", () => {
    store.clear();
    stampBackup("u1", 100); stampVerify("u1", 200);
    expect(lastBackup("u2")).toBe(0);
    expect(lastVerify("u2")).toBe(0);
    stampBackup("u2", 300);
    expect(lastBackup("u1")).toBe(100);
    expect(lastBackup("u2")).toBe(300);
    expect(lastVerify("u1")).toBe(200);
  });
  it("with no user id nothing is read and nothing is written, and the old device-wide keys are never read", () => {
    store.clear();
    store.set("appu_last_backup", "999"); store.set("appu_last_verify", "999");
    for (const who of [undefined, null, ""]) {
      expect(lastBackup(who)).toBe(0);
      expect(lastVerify(who)).toBe(0);
      stampBackup(who, 5); stampVerify(who, 5);
    }
    expect([...store.keys()].sort()).toEqual(["appu_last_backup", "appu_last_verify"]);
    expect(lastBackup("u1")).toBe(0);
  });
  it("a store that throws is survived", () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(() => stampBackup("u1")).not.toThrow();
    expect(lastBackup("u1")).toBe(0);
    (globalThis as { localStorage?: unknown }).localStorage = ls;
  });
});
