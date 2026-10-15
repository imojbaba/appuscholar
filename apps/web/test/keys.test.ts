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
  beforeEach(() => { localStorage.clear(); keyStore.setUser("A"); for (const p of ["gemini", "groq", "claude"] as const) keyStore.clear(p); });

  it("setPlain writes localStorage appu_key_<userId>_<p>", () => {
    keyStore.setPlain("gemini", "AIza1");
    expect(localStorage.getItem("appu_key_A_gemini")).toBe("AIza1");
    expect(keyStore.getUnlocked("gemini")).toBe("AIza1");
  });

  it("setSession keeps the key in memory only", () => {
    keyStore.setSession("groq", "gsk_1");
    expect(localStorage.getItem("appu_key_A_groq")).toBeNull();
    expect(keyStore.getUnlocked("groq")).toBe("gsk_1");
  });

  it("clear removes both the plain and the session key", () => {
    keyStore.setPlain("gemini", "a"); keyStore.setSession("gemini", "b");
    keyStore.clear("gemini");
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    expect(localStorage.getItem("appu_key_A_gemini")).toBeNull();
  });

  it("setPlain replaces a session key and setSession replaces a plain one, so one mode is in force", () => {
    keyStore.setPlain("gemini", "a");
    keyStore.setSession("gemini", "b");
    expect(localStorage.getItem("appu_key_A_gemini")).toBeNull();
    keyStore.setPlain("gemini", "c");
    expect(keyStore.getUnlocked("gemini")).toBe("c");
  });

  it("clearSession forgets tab-only keys and leaves remembered ones", () => {
    keyStore.setSession("groq", "gsk_1"); keyStore.setPlain("gemini", "AIza1");
    keyStore.clearSession();
    expect(keyStore.getUnlocked("groq")).toBeNull();
    expect(keyStore.getUnlocked("gemini")).toBe("AIza1");
  });

  it("hasAny counts plain, session and a server blob; providersWithKeys follows PROV_ORDER", () => {
    keyStore.setSession("groq", "gsk_1");
    expect(keyStore.hasAny("gemini", {})).toBe(false);
    expect(keyStore.hasAny("gemini", { gemini: "s.i.c" })).toBe(true);
    expect(keyStore.hasAny("groq", {})).toBe(true);
    expect(keyStore.providersWithKeys({ claude: "s.i.c" })).toEqual(["groq", "claude"]);
  });

  it("user A's remembered key is invisible after setUser(\"B\") and back again for A", () => {
    keyStore.setPlain("gemini", "AIza1");
    keyStore.setUser("B");
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    expect(keyStore.isPlain("gemini")).toBe(false);
    expect(keyStore.hasPlain()).toBe(false);
    keyStore.setUser("A");
    expect(keyStore.getUnlocked("gemini")).toBe("AIza1");
  });

  it("forgetPlainKeys(userId) removes only that user's remembered keys", () => {
    keyStore.setPlain("gemini", "a1"); keyStore.setPlain("groq", "a2");
    keyStore.setUser("B"); keyStore.setPlain("gemini", "b1");
    keyStore.forgetPlainKeys("A");
    expect(localStorage.getItem("appu_key_A_gemini")).toBeNull();
    expect(localStorage.getItem("appu_key_A_groq")).toBeNull();
    expect(localStorage.getItem("appu_key_B_gemini")).toBe("b1");
    expect(keyStore.getUnlocked("gemini")).toBe("b1");
  });

  it("with no user set, remembered keys are unavailable and old appu_key_<p> entries are ignored", () => {
    localStorage.setItem("appu_key_gemini", "old");
    keyStore.setUser(null);
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    keyStore.setUser("A");
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    keyStore.setUser(null);
    keyStore.setPlain("groq", "gsk_1"); // no account: held in this tab only, never written
    expect(localStorage.getItem("appu_key_groq")).toBeNull();
    expect(keyStore.isPlain("groq")).toBe(false);
  });
});
