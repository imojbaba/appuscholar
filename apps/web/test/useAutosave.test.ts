import { describe, it, expect, vi, afterEach } from "vitest";
import { createAutosaver, shouldWarnOnUnload, RETRY_DELAYS_MS } from "../lib/useAutosave";

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

  it("retries a failed save with backoff (2s, 4s, …) without further typing", async () => {
    vi.useFakeTimers();
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("net"))
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.getStatus()).toBe("error");
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.getStatus()).toBe("error");
    await vi.advanceTimersByTimeAsync(3999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith("<p>x</p>");
    expect(a.getStatus()).toBe("saved");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(3);
  });
  it("caps the backoff at 30s", () => {
    expect(RETRY_DELAYS_MS[0]).toBe(2000);
    expect(Math.max(...RETRY_DELAYS_MS)).toBe(30000);
  });
  it("stops retrying once deactivated (unmount)", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(new Error("net"));
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    a.setActive(false);
    expect(await a.flushNow()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("warns before unload while dirty, saving or after an error, not when saved", () => {
    expect(shouldWarnOnUnload("dirty")).toBe(true);
    expect(shouldWarnOnUnload("saving")).toBe(true);
    expect(shouldWarnOnUnload("error")).toBe(true);
    expect(shouldWarnOnUnload("saved")).toBe(false);
  });
  it("reports dirty, not saved, when text changed while the save was in flight", async () => {
    vi.useFakeTimers();
    let resolve!: (r: { seq: number; created: boolean }) => void;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValueOnce({ seq: 3, created: true });
    const statuses: string[] = [];
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100, onStatus: s => statuses.push(s) });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("saving");
    a.onChange("<p>xy</p>");
    resolve({ seq: 2, created: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.getStatus()).toBe("dirty");
    expect(statuses).not.toContain("saved");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenLastCalledWith("<p>xy</p>");
    expect(a.getStatus()).toBe("saved");
  });
  it("keeps newer text typed during a failed save instead of overwriting it with the failed body", async () => {
    vi.useFakeTimers();
    let reject!: (e: Error) => void;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise((_, rj) => { reject = rj; }))
      .mockResolvedValue({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>old</p>");
    await vi.advanceTimersByTimeAsync(100);
    a.onChange("<p>newer</p>");
    reject(new Error("net"));
    await vi.advanceTimersByTimeAsync(0);
    expect(a.getStatus()).toBe("error");
    expect(await a.flushNow()).toBe(true);
    expect(save).toHaveBeenLastCalledWith("<p>newer</p>");
    expect(save).not.toHaveBeenCalledWith("<p>old</p>", expect.anything());
    expect(save.mock.calls.map(c => c[0])).toEqual(["<p>old</p>", "<p>newer</p>"]);
  });
  it("flushNow() resolves false when the save fails and true when there is nothing to save", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, delayMs: 1500 });
    expect(await a.flushNow()).toBe(true);
    a.onChange("<p>x</p>");
    expect(await a.flushNow()).toBe(false);
    expect(a.getStatus()).toBe("error");
    expect(await a.flushNow()).toBe(true);
    expect(a.getStatus()).toBe("saved");
  });
});
