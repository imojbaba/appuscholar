import { describe, it, expect } from "vitest";
import * as core from "../src/index";
describe("core", () => {
  it("exports a version", () => { expect(core.CORE_VERSION).toBe("0.1.0"); });
  it("exports the runner of each of the 26 STAT_TESTS keys (run + the key, capitalised)", () => {
    expect(Object.keys(core.STAT_TESTS)).toHaveLength(26);
    for (const k of Object.keys(core.STAT_TESTS)) expect(typeof (core as Record<string, unknown>)["run" + k[0]!.toUpperCase() + k.slice(1)], k).toBe("function");
  });
});
