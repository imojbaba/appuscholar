import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let beacon: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
async function load() {
  vi.resetModules();
  return (await import("@/lib/errors/reportClientError")).reportClientError;
}
async function sentBodies(): Promise<Record<string, unknown>[]> {
  return Promise.all(beacon.mock.calls.map(async c => JSON.parse(await (c[1] as Blob).text()) as Record<string, unknown>));
}
beforeEach(() => {
  beacon = vi.fn(() => true);
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("navigator", { sendBeacon: beacon });
  vi.stubGlobal("location", { pathname: "/projects/0f8fad5bd9cb469fa16570867728950e", search: "?token=SECRET", hash: "#x" });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("reportClientError", () => {
  it("sends name, route and build only", async () => {
    const report = await load();
    const e = Object.assign(new TypeError("student@example.test leaked"), { digest: "d1", stack: "at secret" });
    report(e);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0]![0]).toBe("/api/client-error");
    const [body] = await sentBodies();
    expect(Object.keys(body!).sort()).toEqual(["build", "name", "route"]);
    expect(body).toMatchObject({ name: "TypeError", route: "/projects/:id" });
    expect(JSON.stringify(body)).not.toMatch(/SECRET|example\.test|secret|d1/);
  });

  it("dedupes the same error", async () => {
    const report = await load();
    report(new RangeError("a")); report(new RangeError("b")); report(new RangeError("c"), "/projects/:id");
    expect(beacon).toHaveBeenCalledTimes(1);
    report(new RangeError("d"), "/other");
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it("stops at five", async () => {
    const report = await load();
    for (let i = 0; i < 9; i++) report(new Error("x"), `/r${i}`);
    expect(beacon).toHaveBeenCalledTimes(5);
  });

  it("falls back to fetch with keepalive when sendBeacon is missing or refuses", async () => {
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => false) });
    const report = await load();
    report(new Error("x"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/client-error");
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST", keepalive: true });
  });

  it("never throws when sendBeacon and fetch throw", async () => {
    vi.stubGlobal("navigator", { sendBeacon: () => { throw new Error("beacon"); } });
    vi.stubGlobal("fetch", () => { throw new Error("fetch"); });
    const report = await load();
    expect(() => report(new Error("x"))).not.toThrow();
    vi.stubGlobal("fetch", () => Promise.reject(new Error("rejected")));
    expect(() => report(new Error("y"), "/y")).not.toThrow();
    expect(() => report(undefined)).not.toThrow();
    expect(() => report({ get name(): string { throw new Error("getter"); } })).not.toThrow();
    await Promise.resolve();
  });

  it("an error whose name is not a safe identifier is reported as Error", async () => {
    const report = await load();
    const e = new Error("x"); e.name = "student@example.test";
    report(e);
    report("a thrown string", "/s");
    report({ name: "x".repeat(200) }, "/t");
    const bodies = await sentBodies();
    expect(bodies.map(b => b.name)).toEqual(["Error", "Error", "Error"]);
  });
});
