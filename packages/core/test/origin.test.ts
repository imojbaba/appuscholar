import { describe, it, expect } from "vitest";
import { provHash, originCount, originShare } from "../src/origin";

describe("origin counting (v1 provCountDoc / computeOriginality)", () => {
  it("hashes ignoring whitespace like v1 provHash", () => {
    expect(provHash("a b c")).toBe(provHash("abc"));
    expect(provHash("abc")).toMatch(/^[0-9a-z]+$/);
  });
  it("counts words typed vs inside ai-ins spans, and kept vs edited by data-h", () => {
    const kept = `<span class="ai-ins" data-h="${provHash("one two")}">one two</span>`;
    const edited = `<span class="ai-ins" data-h="zzz">three four five</span>`;
    const r = originCount(`<p>mine here ${kept}</p><p>${edited} tail</p><p><span class="ai-ins">old</span></p>`);
    expect(r).toEqual({ typed: 3, ai: 6, passages: 3, kept: 1, edited: 1, unknown: 1 });
  });
  it("counts nested inline tags and <br> inside a span as part of it", () => {
    const r = originCount(`<p><span class="ai-ins" data-h="x">a <b>b</b><br>c</span> d</p>`);
    expect(r.ai).toBe(3); expect(r.typed).toBe(1);
  });
  it("hashes the decoded text content: tags dropped, <br> adds no space, entities decoded", () => {
    const h = provHash("a&b");
    expect(originCount(`<p><span class="ai-ins" data-h="${h}">a<b>&amp;</b><br>b</span></p>`).kept).toBe(1);
  });
  it("character share for the badge", () => {
    expect(originShare(`<p>abcd<span class="ai-ins" data-h="x">efgh</span></p>`)).toEqual({ total: 8, ai: 4, studentPct: 50 });
    expect(originShare("").studentPct).toBe(100);
  });
});
