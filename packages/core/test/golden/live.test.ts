import { describe, it, expect } from "vitest";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";
import { loadV1 } from "./harness/v1";
/** The platform the literal below was captured on: the smoke fixture, which harness.test.ts pins to the same pFromT(2.15, 21). */
const smoke = readFixture<object>("smoke", "cases");
describe.skipIf(!process.env.V1_INDEX)("live v1 (V1_INDEX set)", () => {
  it("loads v1, calls a pure function and reads a constant", async () => {
    const v1 = await loadV1(process.env.V1_INDEX);
    expect(v1.build).toBe("2026.10.13a");
    expectGolden(v1.call<number>("pFromT", 2.15, 21), 0.043360276354708106, goldenMode(smoke)); // computed through Math.exp and Math.log: exact where captured, else a relative 1e-12 (D-W1-16)
    expect(Object.keys(v1.eval<Record<string, unknown>>("TG_DEMO"))).toHaveLength(13);
  }, 20_000);
  it("the helpers reach v1's own realm: toast recorder, callAI stub, editor, selection, jsdom errors", async () => {
    const v1 = await loadV1(process.env.V1_INDEX);
    v1.call("tgDemo", "ttest1"); // no prediction ticked: v1 12462 toasts and returns
    expect(v1.toasts).toEqual(["Make your prediction first, then run the demo"]);
    const calls = v1.stubCallAI("stubbed");
    await expect(v1.eval<Promise<string>>("callAI('ping', { temp: 0.2 })")).resolves.toBe("stubbed");
    expect(calls).toEqual([{ prompt: "ping", opts: { temp: 0.2 } }]);
    v1.setEditorHtml("<p>Hello <b>world</b></p>");
    expect(v1.editor().innerHTML).toBe("<p>Hello <b>world</b></p>");
    expect(v1.eval("editor.textContent")).toBe("Hello world");
    expect(v1.call("hasSelection")).toBe(false);
    v1.selectEditor();
    expect(v1.call("hasSelection")).toBe(true);
    expect(v1.call("selText")).toBe("Hello world");
    expect(v1.errors).toEqual([]);
    v1.eval("(function(){var b=document.createElement('button');b.onclick=function(){throw new Error('harness probe')};b.click()})()");
    expect(v1.errors).toEqual([expect.stringContaining("harness probe")]);
    v1.window.close();
  }, 20_000);
});
