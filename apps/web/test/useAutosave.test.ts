import { describe, it, expect, vi, afterEach } from "vitest";
import { createAutosaver } from "../lib/useAutosave";

describe("createAutosaver", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("debounces and skips unchanged bodies", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (html: string) => ({ seq: html.length, created: true }));
    const a = createAutosaver({ initialHtml: "<p>a</p>", save, delayMs: 1500 });
    a.onChange("<p>ab</p>");
    a.onChange("<p>abc</p>");
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("<p>abc</p>");
    a.onChange("<p>abc</p>");
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.getStatus()).toBe("saved");
  });
  it("reports error and retries on the next change", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("error");
    a.onChange("<p>xy</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("saved");
  });
  it("cancel() drops the pending save", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ seq: 1, created: true }));
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>x</p>");
    a.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });
  it("flushNow() saves immediately without waiting for the timer", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ seq: 3, created: true }));
    const a = createAutosaver({ initialHtml: "", save, delayMs: 1500 });
    a.onChange("<p>x</p>");
    await a.flushNow();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("<p>x</p>");
    expect(a.getStatus()).toBe("saved");
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
