import { describe, it, expect } from "vitest";
import { loadV1 } from "./harness/v1";
describe.skipIf(!process.env.V1_INDEX)("live v1 (V1_INDEX set)", () => {
  it("loads v1, calls a pure function and reads a constant", async () => {
    const v1 = await loadV1(process.env.V1_INDEX);
    expect(v1.build).toBe("2026.10.13a");
    expect(v1.call<number>("pFromT", 2.15, 21)).toBe(0.043360276354708106);
    expect(Object.keys(v1.eval<Record<string, unknown>>("TG_DEMO"))).toHaveLength(13);
  }, 20_000);
});
