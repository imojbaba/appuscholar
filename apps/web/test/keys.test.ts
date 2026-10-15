// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { keyStore, lockKey, unlockKeyBlob } from "@/lib/ai/keys";

describe("lockKey / unlockKeyBlob", () => {
  it("round-trips a key with the same passphrase", async () => {
    const blob = await lockKey("AIza123", "secret1");
    expect(await unlockKeyBlob(blob, "secret1")).toBe("AIza123");
  });

  it("rejects a wrong passphrase", async () => {
    const blob = await lockKey("AIza123", "secret1");
    await expect(unlockKeyBlob(blob, "secret2")).rejects.toBeDefined();
  });

  it("produces salt.iv.ct as three base64url parts (16-byte salt, 12-byte iv)", async () => {
    const blob = await lockKey("AIza123", "secret1");
    const parts = blob.split(".");
    expect(parts).toHaveLength(3);
    for (const p of parts) expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parts[0]!.length).toBe(Math.ceil((16 * 4) / 3));
    expect(parts[1]!.length).toBe(12 * 4 / 3);
  });

  it("uses a fresh salt each time", async () => {
    expect(await lockKey("k", "secret1")).not.toBe(await lockKey("k", "secret1"));
  });

  it("throws 'bad blob' for a malformed blob", async () => {
    await expect(unlockKeyBlob("only.two", "x")).rejects.toThrow("bad blob");
  });
});

describe("keyStore", () => {
  beforeEach(() => { localStorage.clear(); for (const p of ["gemini", "groq", "claude"] as const) keyStore.clear(p); });

  it("setPlain writes localStorage appu_key_<p>", () => {
    keyStore.setPlain("gemini", "AIza1");
    expect(localStorage.getItem("appu_key_gemini")).toBe("AIza1");
    expect(keyStore.getUnlocked("gemini")).toBe("AIza1");
  });

  it("setSession keeps the key in memory only", () => {
    keyStore.setSession("groq", "gsk_1");
    expect(localStorage.getItem("appu_key_groq")).toBeNull();
    expect(keyStore.getUnlocked("groq")).toBe("gsk_1");
  });

  it("clear removes both the plain and the session key", () => {
    keyStore.setPlain("gemini", "a"); keyStore.setSession("gemini", "b");
    keyStore.clear("gemini");
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    expect(localStorage.getItem("appu_key_gemini")).toBeNull();
  });

  it("setPlain replaces a session key and setSession replaces a plain one, so one mode is in force", () => {
    keyStore.setPlain("gemini", "a");
    keyStore.setSession("gemini", "b");
    expect(localStorage.getItem("appu_key_gemini")).toBeNull();
    keyStore.setPlain("gemini", "c");
    expect(keyStore.getUnlocked("gemini")).toBe("c");
  });

  it("hasAny counts plain, session and a server blob; providersWithKeys follows PROV_ORDER", () => {
    keyStore.setSession("groq", "gsk_1");
    expect(keyStore.hasAny("gemini", {})).toBe(false);
    expect(keyStore.hasAny("gemini", { gemini: "s.i.c" })).toBe(true);
    expect(keyStore.hasAny("groq", {})).toBe(true);
    expect(keyStore.providersWithKeys({ claude: "s.i.c" })).toEqual(["groq", "claude"]);
  });
});
