import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => {
  class ApiError extends Error { constructor(public status: number, public code: string, public detail?: string) { super(`${status} ${code}`); } }
  return { apiFetch: vi.fn(), ApiError };
});
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
// keyStore needs localStorage; a tiny in-memory stand-in keeps this suite in the node environment.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });

import { ApiError, apiFetch } from "@/lib/api";
import { apiMsg, callAI, resetPdMemo, type CallCtx } from "@/lib/ai/callAI";
import { keyStore, lockKey } from "@/lib/ai/keys";

const mockFetch = vi.mocked(apiFetch);
function ctx(over: Partial<CallCtx> = {}): CallCtx {
  return {
    provider: "gemini", blobs: {}, fallbackOn: true, contentLang: "en", projectId: null,
    askPassphrase: vi.fn(async () => null), askPd: vi.fn(async () => "cancel" as const),
    openSettings: vi.fn(), onFailover: vi.fn(), ...over
  };
}
const body = (call = 0) => JSON.parse(mockFetch.mock.calls[call]![1]!.body as string) as Record<string, unknown>;

beforeEach(() => {
  mockFetch.mockReset(); store.clear(); resetPdMemo();
  for (const p of ["gemini", "groq", "openrouter", "claude"] as const) keyStore.clear(p);
});

describe("callAI personal-data step", () => {
  it("rejects when the student cancels the personal-data dialog and sends nothing", async () => {
    keyStore.setSession("gemini", "AIza1");
    const c = ctx({ askPd: vi.fn(async () => "cancel" as const) });
    await expect(callAI("write to a@b.com", {}, c)).rejects.toThrow("Cancelled. Nothing was sent to the AI provider.");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("send: marks pdAccepted, and asks only once for the same findings", async () => {
    keyStore.setSession("gemini", "AIza1");
    mockFetch.mockResolvedValue({ text: "ok", model: "m" });
    const askPd = vi.fn(async () => "send" as const);
    const c = ctx({ askPd });
    await callAI("mail a@b.com now", {}, c);
    expect(body().pdAccepted).toBe(true);
    await callAI("mail a@b.com now", {}, c);
    expect(askPd).toHaveBeenCalledTimes(1);
    expect(body(1).pdAccepted).toBe(true);
  });

  it("mask: the prompt sent has [email] in place of the address", async () => {
    keyStore.setSession("gemini", "AIza1");
    mockFetch.mockResolvedValue({ text: "ok", model: "m" });
    await callAI("mail a@b.com now", {}, ctx({ askPd: vi.fn(async () => "mask" as const) }));
    expect(body().prompt).toContain("[email]");
    expect(String(body().prompt)).not.toContain("a@b.com");
  });

  it("scans before the key step: personal data, no key, cancel -> Cancelled message and the settings dialog is not opened", async () => {
    const c = ctx({ askPd: vi.fn(async () => "cancel" as const) });
    await expect(callAI("mail a@b.com now", {}, c)).rejects.toThrow("Cancelled. Nothing was sent to the AI provider.");
    expect(c.openSettings).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("noScan skips only the dialog: nothing is asked and pdAccepted stays false", async () => {
    keyStore.setSession("gemini", "AIza1");
    mockFetch.mockResolvedValue({ text: "ok", model: "m" });
    const askPd = vi.fn(async () => "send" as const);
    await callAI("mail a@b.com now", { noScan: true }, ctx({ askPd }));
    expect(askPd).not.toHaveBeenCalled();
    expect(body().pdAccepted).toBe(false);
  });

  it("does not scan or ask when there is nothing to find", async () => {
    keyStore.setSession("gemini", "AIza1");
    mockFetch.mockResolvedValue({ text: "ok", model: "m" });
    const askPd = vi.fn(async () => "cancel" as const);
    await expect(callAI("plain text", {}, ctx({ askPd }))).resolves.toBe("ok");
    expect(askPd).not.toHaveBeenCalled();
    expect(body()).toMatchObject({ provider: "gemini", apiKey: "AIza1", prompt: "plain text", pdAccepted: false, contentLang: "en" });
    expect(body().day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("callAI key step", () => {
  it("asks for the passphrase when only a server blob exists; a wrong one rejects and sends nothing", async () => {
    const blob = await lockKey("AIza1", "secret1");
    const askPassphrase = vi.fn(async () => "nope-nope");
    await expect(callAI("hello", {}, ctx({ blobs: { gemini: blob }, askPassphrase }))).rejects.toThrow("Wrong passphrase — nothing was unlocked. Try again.");
    expect(askPassphrase).toHaveBeenCalledWith("gemini");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(keyStore.getUnlocked("gemini")).toBeNull();
  });

  it("a right passphrase unlocks the key for this session and the request goes out with it", async () => {
    const blob = await lockKey("AIza1", "secret1");
    mockFetch.mockResolvedValue({ text: "hi", model: "m" });
    await expect(callAI("hello", {}, ctx({ blobs: { gemini: blob }, askPassphrase: vi.fn(async () => "secret1") }))).resolves.toBe("hi");
    expect(body().apiKey).toBe("AIza1");
    expect(keyStore.getUnlocked("gemini")).toBe("AIza1");
  });

  it("with no key at all it opens the settings dialog and rejects", async () => {
    const c = ctx();
    await expect(callAI("hello", {}, c)).rejects.toThrow("Add your API key first — click ⚙ at the top right.");
    expect(c.openSettings).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("callAI failover", () => {
  it("rate-limit from gemini with a groq key: retries on groq, tells the student, resolves", async () => {
    keyStore.setSession("gemini", "AIza1"); keyStore.setSession("groq", "gsk_1");
    mockFetch.mockRejectedValueOnce(new ApiError(429, "rate-limit", "HTTP 429")).mockResolvedValueOnce({ text: "from groq", model: "m" });
    const c = ctx();
    await expect(callAI("hello", {}, c)).resolves.toBe("from groq");
    expect(body(1)).toMatchObject({ provider: "groq", apiKey: "gsk_1" });
    expect(c.onFailover).toHaveBeenCalledWith("gemini", "groq");
  });

  it("does not fail over when the setting is off, or for a non-retriable error", async () => {
    keyStore.setSession("gemini", "AIza1"); keyStore.setSession("groq", "gsk_1");
    mockFetch.mockRejectedValue(new ApiError(429, "rate-limit", "x"));
    await expect(callAI("hello", {}, ctx({ fallbackOn: false }))).rejects.toThrow(/Free limit reached/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    mockFetch.mockReset().mockRejectedValue(new ApiError(400, "truncated", ""));
    await expect(callAI("hello", {}, ctx())).rejects.toThrow(/cut off/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("ignores providers whose key is only an encrypted blob, and throws the original error when every fallback fails", async () => {
    keyStore.setSession("gemini", "AIza1"); keyStore.setSession("groq", "gsk_1");
    mockFetch.mockRejectedValue(new ApiError(502, "provider-error", "HTTP 503: down"));
    const c = ctx({ blobs: { claude: "s.i.c" } });
    await expect(callAI("hello", {}, c)).rejects.toThrow(/having problems/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(c.onFailover).not.toHaveBeenCalled();
  });

  it("shows the rate-limit dialog hook when the final error is rate-limit", async () => {
    keyStore.setSession("gemini", "AIza1");
    mockFetch.mockRejectedValue(new ApiError(429, "rate-limit", "x"));
    const onRateLimit = vi.fn();
    await expect(callAI("hello", {}, ctx({ onRateLimit }))).rejects.toThrow();
    expect(onRateLimit).toHaveBeenCalled();
  });
});

describe("callAI terms gate", () => {
  it("turns the server's 403 terms into the accept-the-terms sentence and does not fail over", async () => {
    keyStore.setSession("gemini", "AIza1"); keyStore.setSession("groq", "gsk_1");
    mockFetch.mockRejectedValue(new ApiError(403, "terms"));
    await expect(callAI("hello", {}, ctx())).rejects.toMatchObject({ code: "terms", message: "Accept the terms first (open ❓ Help → Terms and where your data goes)." });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("apiMsg", () => {
  it("returns the v1 strings", () => {
    expect(apiMsg("key-rejected")).toBe("Your API key was rejected. Open ⚙ and paste it again.");
    expect(apiMsg("network")).toBe("Could not reach the AI provider. Check your connection and try again, or switch provider using the tabs at the top.");
    expect(apiMsg("rate-limit")).toBe("Free limit reached for now. Wait a minute, or switch provider using the tabs at the top.");
    expect(apiMsg("model-gone")).toBe("That AI model is no longer available. Try a different provider using the tabs at the top.");
    expect(apiMsg("truncated")).toBe("The answer was cut off. Select a smaller piece of text and try again.");
    expect(apiMsg("empty")).toBe("The AI returned an empty answer. Try again.");
    expect(apiMsg("no-key")).toBe("Add your API key first — click ⚙ at the top right.");
    expect(apiMsg("bad-pass")).toBe("Wrong passphrase — nothing was unlocked. Try again.");
    expect(apiMsg("terms")).toBe("Accept the terms first (open ❓ Help → Terms and where your data goes).");
    expect(apiMsg("cancelled")).toBe("Cancelled. Nothing was sent to the AI provider.");
    expect(apiMsg("blocked", "The request was blocked.")).toBe("The request was blocked.");
    expect(apiMsg("provider-error", "HTTP 503: " + "x".repeat(400))).toBe("The AI service is having problems (already retried a couple of times). Try again in a few minutes, or switch provider using the tabs at the top. Detail: " + ("HTTP 503: " + "x".repeat(400)).slice(0, 180));
  });
});
