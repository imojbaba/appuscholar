import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => {
  class ApiError extends Error { constructor(public status: number, public code: string, public detail?: string) { super(`${status} ${code}`); } }
  return { apiFetch: vi.fn(), ApiError };
});
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });

import { ApiError, apiFetch } from "@/lib/api";
import { apiMsg, callAI, resetPdMemo, toCallError, type CallCtx } from "@/lib/ai/callAI";
import { keyStore } from "@/lib/ai/keys";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";

const mockFetch = vi.mocked(apiFetch);
function ctx(over: Partial<CallCtx> = {}): CallCtx {
  return {
    provider: "gemini", blobs: {}, fallbackOn: true, contentLang: "en", projectId: null,
    askPassphrase: vi.fn(async () => null), askPd: vi.fn(async () => ({ answer: "cancel" as const, leave: [] })),
    openSettings: vi.fn(), onFailover: vi.fn(), ...over
  };
}
const setLang = (lang: string) => vi.stubGlobal("document", { documentElement: { lang } });

beforeEach(() => {
  mockFetch.mockReset(); store.clear(); resetPdMemo();
  for (const p of ["gemini", "groq", "openrouter", "claude"] as const) keyStore.clear(p);
  vi.stubGlobal("document", { documentElement: { lang: "en" } });
});
afterEach(() => vi.unstubAllGlobals().valueOf());

describe("callAI quota answer", () => {
  it("an hour quota becomes an AiCallError with code quota that says how many minutes to wait", () => {
    const e = toCallError(new ApiError(429, "quota", "hour:1500"));
    expect(e.code).toBe("quota");
    expect(e.message).toBe("You have used your AI calls for this hour. Try again in 25 minutes.");
  });

  it("rounds the wait up to whole minutes, and never says 0", () => {
    expect(apiMsg("quota", "hour:61")).toContain("in 2 minutes");
    expect(apiMsg("quota", "hour:1")).toBe("You have used your AI calls for this hour. Try again in 1 minute.");
    expect(apiMsg("quota", "hour:60")).toContain("in 1 minute.");
    expect(apiMsg("quota", "hour:3600")).toContain("in 60 minutes");
  });

  it("a day quota says to try again tomorrow", () => {
    expect(toCallError(new ApiError(429, "quota", "day:40000")).message).toBe("You have used your AI calls for today. Try again tomorrow.");
  });

  it("a minute quota says to wait a moment and try again, whatever the seconds", () => {
    const e = toCallError(new ApiError(429, "quota", "minute:40"));
    expect(e.code).toBe("quota");
    expect(e.message).toBe("Too many AI requests in a minute. Wait a moment and try again.");
    expect(apiMsg("quota", "minute:1")).toBe("Too many AI requests in a minute. Wait a moment and try again.");
    expect(apiMsg("quota", "minute:60")).toBe("Too many AI requests in a minute. Wait a moment and try again.");
  });

  it("a quota with an unreadable detail still gives a sentence about the day", () => {
    expect(apiMsg("quota")).toBe("You have used your AI calls for today. Try again tomorrow.");
    expect(apiMsg("quota", "weird")).toBe("You have used your AI calls for today. Try again tomorrow.");
  });

  it("answers in Hindi when the page language is hi", () => {
    setLang("hi");
    expect(apiMsg("quota", "hour:1500")).toBe((hi as Record<string, string>).ai_quota_hour!.replace("{minutes}", "25"));
    expect(apiMsg("quota", "day:5")).toBe((hi as Record<string, string>).ai_quota_day);
    expect(apiMsg("quota", "day:5")).not.toBe((en as Record<string, string>).ai_quota_day);
  });

  it("answers a minute quota in Hindi when the page language is hi", () => {
    setLang("hi");
    expect(apiMsg("quota", "minute:30")).toBe((hi as Record<string, string>).ai_quota_minute);
    expect(apiMsg("quota", "minute:30")).not.toBe((en as Record<string, string>).ai_quota_minute);
    expect(apiMsg("quota", "minute:30")).toBeTruthy();
  });

  it("the new copy has no em-dash and no emoji", () => {
    for (const d of [en, hi] as Array<Record<string, string>>) for (const k of ["ai_quota_minute", "ai_quota_hour", "ai_quota_hour_one", "ai_quota_day"]) {
      expect(d[k], k).toBeTruthy();
      expect(d[k]).not.toMatch(/—|\p{Extended_Pictographic}/u);
    }
  });

  it("callAI rejects with code quota and does not fail over to another provider", async () => {
    keyStore.setSession("gemini", "AIza1");
    keyStore.setSession("groq", "gsk_1");
    mockFetch.mockRejectedValue(new ApiError(429, "quota", "hour:1500"));
    const onFailover = vi.fn();
    const err = await callAI("hello", {}, ctx({ onFailover })).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "quota", message: "You have used your AI calls for this hour. Try again in 25 minutes." });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(onFailover).not.toHaveBeenCalled();
  });

  it("callAI does not fail over on a minute quota answer either", async () => {
    keyStore.setSession("gemini", "AIza1");
    keyStore.setSession("groq", "gsk_1");
    mockFetch.mockRejectedValue(new ApiError(429, "quota", "minute:40"));
    const onFailover = vi.fn();
    const err = await callAI("hello", {}, ctx({ onFailover })).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "quota", message: "Too many AI requests in a minute. Wait a moment and try again." });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(onFailover).not.toHaveBeenCalled();
  });

  it("a plain rate-limit still fails over (unchanged)", async () => {
    keyStore.setSession("gemini", "AIza1");
    keyStore.setSession("groq", "gsk_1");
    mockFetch.mockRejectedValueOnce(new ApiError(429, "rate-limit")).mockResolvedValueOnce({ text: "from groq", model: "m" });
    expect(await callAI("hello", {}, ctx())).toBe("from groq");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("a quota answer from the fallback provider is what the student sees", async () => {
    keyStore.setSession("gemini", "AIza1");
    keyStore.setSession("groq", "gsk_1");
    keyStore.setSession("openrouter", "sk-or-1");
    mockFetch.mockRejectedValueOnce(new ApiError(429, "rate-limit")).mockRejectedValueOnce(new ApiError(429, "quota", "hour:1500"));
    const err = await callAI("hello", {}, ctx()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "quota", message: "You have used your AI calls for this hour. Try again in 25 minutes." });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
