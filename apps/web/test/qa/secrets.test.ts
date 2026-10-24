import { afterEach, describe, expect, it, vi } from "vitest";
import { htmlEscape, liveKeyForms, REDACTED, redactLiveKey, redactText, secretForms } from "../../qa/support/secrets";

const key = "gsk_live_0a1b2c3d4e5f";
afterEach(() => vi.unstubAllEnvs());

describe("secretForms and redactText", () => {
  it("gives a secret as written, in a URL, inside a JSON string and in html, longest first", () => {
    const forms = secretForms(['sk-a&b<"c>']);
    expect(forms).toEqual(expect.arrayContaining(['sk-a&b<"c>', encodeURIComponent('sk-a&b<"c>'), 'sk-a&b<\\"c>', htmlEscape('sk-a&b<"c>')]));
    expect(forms.map((f) => f.length)).toEqual([...forms.map((f) => f.length)].sort((a, b) => b - a));
  });

  it("ignores an empty or missing secret", () => {
    expect(secretForms(["", undefined])).toEqual([]);
    expect(redactText("nothing to remove", [])).toBe("nothing to remove");
  });

  it("writes every form as [redacted], not a longer form half done", () => {
    const forms = secretForms(['sk-a&b<"c>']);
    expect(redactText(`a ${htmlEscape('sk-a&b<"c>')} b ${'sk-a&b<"c>'} c`, forms)).toBe(`a ${REDACTED} b ${REDACTED} c`);
  });
});

describe("the live-AI key", () => {
  it("is removed from text when QA_LIVE_AI_KEY is set, whole and wherever it is", () => {
    vi.stubEnv("QA_LIVE_AI_KEY", key);
    expect(redactLiveKey(`Bearer ${key} and ?k=${encodeURIComponent(key)}`)).toBe(`Bearer ${REDACTED} and ?k=${REDACTED}`);
    expect(redactLiveKey("x".repeat(290) + key).includes(key.slice(0, 12))).toBe(false);
  });

  it("does nothing when it is not set (an empty string redacts nothing), and follows the variable when it changes", () => {
    vi.stubEnv("QA_LIVE_AI_KEY", "");
    expect(liveKeyForms()).toEqual([]);
    expect(redactLiveKey(`text with ${key}`)).toBe(`text with ${key}`);
    vi.stubEnv("QA_LIVE_AI_KEY", key);
    expect(redactLiveKey(`text with ${key}`)).toBe(`text with ${REDACTED}`);
    vi.stubEnv("QA_LIVE_AI_KEY", "another-key-value");
    expect(redactLiveKey(`${key} another-key-value`)).toBe(`${key} ${REDACTED}`);
  });
});
