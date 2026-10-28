import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { forgetRemembered, hasRemembered, readRemembered, rememberVault } from "../lib/vault/remember";

describe("remember on this computer", () => {
  it("remembers per user and forgets", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32)).buffer;
    await rememberVault("u1", "s.i.c", raw);
    expect(await hasRemembered("u1")).toBe(true);
    expect(await hasRemembered("u2")).toBe(false);
    expect(new Uint8Array((await readRemembered("u1"))!)).toEqual(new Uint8Array(raw));
    expect(await readRemembered("u2")).toBeNull();
    await forgetRemembered("u1");
    expect(await readRemembered("u1")).toBeNull();
    expect(await hasRemembered("u1")).toBe(false);
  });

  it("stores the key encrypted under a non-extractable device key, never the raw bytes", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32)).buffer;
    await rememberVault("u3", "s.i.c", raw);
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("appuscholar"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const rec = await new Promise<Record<string, unknown>>((res, rej) => {
      const r = db.transaction("appu_vault").objectStore("appu_vault").get("u3");
      r.onsuccess = () => res(r.result as Record<string, unknown>); r.onerror = () => rej(r.error);
    });
    db.close();
    const deviceKey = rec.deviceKey as CryptoKey;
    expect(deviceKey.extractable).toBe(false);
    const hex = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("hex");
    expect(JSON.stringify(Object.values(rec).map((v) => (v instanceof ArrayBuffer || v instanceof Uint8Array ? hex(v) : v)))).not.toContain(hex(raw));
    await forgetRemembered("u3");
  });

  it("replaces an earlier copy for the same user", async () => {
    const a = crypto.getRandomValues(new Uint8Array(32)).buffer;
    const b = crypto.getRandomValues(new Uint8Array(32)).buffer;
    await rememberVault("u4", "s.i.c", a);
    await rememberVault("u4", "s.i.d", b);
    expect(new Uint8Array((await readRemembered("u4"))!)).toEqual(new Uint8Array(b));
    await forgetRemembered("u4");
  });
});
