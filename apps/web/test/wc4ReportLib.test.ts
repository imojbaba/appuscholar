// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { buildMailto, repFacts, toolFromPath, type RingError } from "@/lib/help/report/repFacts";
import { clearErrors, installErrorRing, noteError, readErrors } from "@/lib/help/report/errorRing";
import { bumpUsage, clearUsage, readUsage, usageText } from "@/lib/help/report/usage";

const BASE = {
  build: "abc1234", tool: "writing", lang: "en", ua: "TestBrowser/1.0", screen: "1440x900, window 1280x720",
  online: true, provider: "gemini", keySaved: false, errors: [] as RingError[]
};
const err = (i: number, message = "boom " + i): RingError => ({ at: Date.UTC(2026, 9, 24, 10, i), tool: "writing", message, where: "app.js:" + i });

afterEach(() => { clearErrors(); localStorage.clear(); });

describe("repFacts (Task C4)", () => {
  it("lists every field, one line each", () => {
    const f = repFacts({ ...BASE, errors: [err(1)] });
    expect(f).toContain("Appuscholar build: abc1234");
    expect(f).toContain("Tool open: writing");
    expect(f).toContain("Interface language: en");
    expect(f).toContain("Browser: TestBrowser/1.0");
    expect(f).toContain("Screen: 1440x900, window 1280x720");
    expect(f).toContain("Online: yes");
    expect(f).toContain("AI provider chosen: gemini, key saved: no");
    expect(f).toContain("Recent errors:");
    expect(f).toContain("in writing: boom 1 (app.js:1)");
  });
  it("says none when there are no errors, and no when offline or a key is saved", () => {
    const f = repFacts({ ...BASE, online: false, keySaved: true });
    expect(f).toContain("Recent errors: none");
    expect(f).toContain("Online: no");
    expect(f).toContain("key saved: yes");
  });
  it("keeps only the last five errors", () => {
    const f = repFacts({ ...BASE, errors: [1, 2, 3, 4, 5, 6, 7].map((i) => err(i)) });
    expect(f).not.toContain("boom 1 ");
    expect(f).not.toContain("boom 2 ");
    for (const i of [3, 4, 5, 6, 7]) expect(f).toContain("boom " + i + " ");
  });
  it("cuts a message at 140 characters", () => {
    const f = repFacts({ ...BASE, errors: [err(1, "x".repeat(300))] });
    expect(f).toContain("x".repeat(140));
    expect(f).not.toContain("x".repeat(141));
  });
  it("an error message with an email address and a phone number is masked; the report holds no text from the open document", () => {
    document.body.innerHTML = '<div id="doc">Participant Meera Kulkarni said the hostel food was cold</div>';
    noteError("Failed for asha.rao@example.com, call 98765 43210 now", "app.js:9");
    const facts = repFacts({ ...BASE, errors: readErrors() });
    expect(facts).toContain("[email]");
    expect(facts).toContain("[phone]");
    expect(facts).not.toContain("asha.rao");
    expect(facts).not.toContain("98765");
    expect(facts).not.toContain("Meera");
    expect(facts).not.toContain("hostel food");
    // a mask is applied again when a caller hands in an unmasked error
    const raw = repFacts({ ...BASE, errors: [err(1, "write to x.y@z.org or 9876543210")] });
    expect(raw).not.toContain("x.y@z.org");
    expect(raw).not.toContain("9876543210");
  });
  it("masks before cutting, so an address at the cut point is not left half showing", () => {
    const f = repFacts({ ...BASE, errors: [err(1, "a".repeat(130) + " me@example.com and more")] });
    expect(f).not.toContain("me@");
  });
});

describe("toolFromPath", () => {
  it("names the place and tab, never the project id", () => {
    expect(toolFromPath("/p/9f8e7d/writing")).toBe("writing");
    expect(toolFromPath("/p/9f8e7d/design/budget")).toBe("design/budget");
    expect(toolFromPath("/projects")).toBe("none");
    expect(toolFromPath(null)).toBe("none");
  });
});

describe("error ring", () => {
  it("holds five errors, memory only", () => {
    for (let i = 1; i <= 7; i++) noteError("err " + i, "a.js:" + i);
    const r = readErrors();
    expect(r).toHaveLength(5);
    expect(r[0]!.message).toBe("err 3");
    expect(r[4]!.message).toBe("err 7");
    expect(localStorage.getItem("appu_errors")).toBeNull();
  });
  it("installErrorRing records window error and unhandledrejection, and stops when removed", () => {
    const off = installErrorRing();
    window.dispatchEvent(new ErrorEvent("error", { message: "script failed", filename: "http://x/_next/chunk.js", lineno: 12 }));
    const rej = new Event("unhandledrejection") as Event & { reason?: unknown };
    rej.reason = new Error("promise failed");
    window.dispatchEvent(rej);
    expect(readErrors().map((e) => e.message)).toEqual(["script failed", "promise failed"]);
    expect(readErrors()[0]!.where).toBe("chunk.js:12");
    expect(readErrors()[1]!.where).toBe("promise");
    off();
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(readErrors()).toHaveLength(2);
  });
  it("an error also counts against the tool that was open", () => {
    noteError("x", "a:1", "writing");
    expect(readUsage().errors).toEqual({ writing: 1 });
  });
});

describe("usage counts", () => {
  it("bump, read, text, and clear empties appu_usage", () => {
    bumpUsage("writing"); bumpUsage("writing"); bumpUsage("design/budget");
    expect(JSON.parse(localStorage.getItem("appu_usage")!)).toEqual({ tools: { writing: 2, "design/budget": 1 }, errors: {} });
    expect(usageText(readUsage())).toBe("Tool opens: writing 2, design/budget 1\nErrors by tool: nothing yet");
    clearUsage();
    expect(localStorage.getItem("appu_usage")).toBeNull();
    expect(readUsage()).toEqual({ tools: {}, errors: {} });
  });
  it("survives blocked or broken storage", () => {
    localStorage.setItem("appu_usage", "{not json");
    expect(readUsage()).toEqual({ tools: {}, errors: {} });
    expect(() => bumpUsage("x")).not.toThrow();
  });
});

describe("buildMailto", () => {
  it("has the subject and address, and trims the body to 1,500 characters", () => {
    const body = "a".repeat(1700);
    const r = buildMailto("Appuscholar problem report (abc1234)", body, "help@example.org");
    expect(r.href.startsWith("mailto:help@example.org?subject=" + encodeURIComponent("Appuscholar problem report (abc1234)") + "&body=")).toBe(true);
    expect(decodeURIComponent(r.href.split("&body=")[1]!)).toHaveLength(1500);
  });
  it("asks the caller to copy too when the encoded body is over 1,800 characters", () => {
    expect(buildMailto("s", "short", "h@e.org").copied).toBe(false);
    expect(buildMailto("s", "é".repeat(1000), "h@e.org").copied).toBe(true);
  });
});
