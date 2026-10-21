import { describe, expect, it, vi } from "vitest";

/*
 * Task G2, fix round 1: the tool registry's load order. A session's components/tools/<tool>/index.ts exports a Panel whose imports lead back to
 * the frame (placeHref, lib/tools). Here the qual module is that probe (test/fixtures/probe-tool), and it is the first module loaded, as a
 * session's own unit test of its facts or exportParts loads it: nothing on the way may read a module that is still loading.
 */

vi.mock("@/components/tools/qual", () => vi.importActual("./fixtures/probe-tool/index"));

describe("the tool registry's load order (Task G2)", () => {
  it("a tool's index.ts loads first, its Panel importing placeHref and lib/tools, and the registry still reads every module", async () => {
    // Typed as the probe it is mocked with (the real qual module exports only `built`).
    const probe = (await import("@/components/tools/qual")) as unknown as typeof import("./fixtures/probe-tool/index");
    expect(probe.built).toBe(false);
    expect(typeof probe.Panel).toBe("function");
    const { placeHref, PLACE_TABS } = await import("@/lib/frame/places");
    expect(placeHref("p1", "collect", "coding")).toBe("/p/p1/collect/coding");
    expect(PLACE_TABS.collect).toEqual(["data", "power", "charts", "check", "scales", "coding"]);
    const registry = await import("@/lib/tools/registry");
    expect(registry.toolModule("qual").Panel).toBe(probe.Panel);
    expect([...registry.BUILT_IN].sort()).toEqual(["analyse", "chat", "cite", "idea", "psych", "research"]);
  });
});
