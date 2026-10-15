import { describe, it, expect } from "vitest";
import { mergeSettings } from "../lib/settings";

describe("mergeSettings", () => {
  it("overlays the patch and leaves other keys alone", () => {
    expect(mergeSettings({ lang: "en", draftFirst: true }, { lang: "hi" })).toEqual({ lang: "hi", draftFirst: true });
  });
  it("ignores undefined keys in the patch", () => {
    expect(mergeSettings({ lang: "hi", field: "Psychology" }, { lang: undefined, field: "Law" })).toEqual({ lang: "hi", field: "Law" });
  });
  it("replaces arrays instead of merging them, and does not mutate the input", () => {
    const prev = { stageGroupsCollapsed: ["idea", "lit"] };
    expect(mergeSettings(prev, { stageGroupsCollapsed: ["design"] })).toEqual({ stageGroupsCollapsed: ["design"] });
    expect(prev.stageGroupsCollapsed).toEqual(["idea", "lit"]);
  });
});
