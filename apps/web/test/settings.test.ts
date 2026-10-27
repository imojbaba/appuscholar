import { describe, it, expect } from "vitest";
import { mergeSettings } from "../lib/settings";
import { applyPatchResult, mergeLoaded, patchKeys, revertPatch } from "../lib/settingsMerge";

describe("mergeSettings", () => {
  it("overlays the patch and leaves other keys alone", () => {
    expect(mergeSettings({ lang: "en", draftFirst: true }, { lang: "hi" })).toEqual({ lang: "hi", draftFirst: true });
  });
  it("ignores undefined keys in the patch", () => {
    expect(mergeSettings({ lang: "hi", field: "Psychology" }, { lang: undefined, field: "Law" })).toEqual({ lang: "hi", field: "Law" });
  });
  it("keeps the pack and writing-sample keys, and a patch of one leaves the other", () => {
    const a = mergeSettings({ pack: "general" }, { writingSampleCapture: true });
    expect(a).toEqual({ pack: "general", writingSampleCapture: true });
    expect(mergeSettings(a, { pack: "psychology", writingSampleCapture: undefined })).toEqual({ pack: "psychology", writingSampleCapture: true });
    expect(patchKeys({ pack: "general", writingSampleCapture: false })).toEqual(["pack", "writingSampleCapture"]);
  });
  it("replaces arrays instead of merging them, and does not mutate the input", () => {
    const prev = { stageGroupsCollapsed: ["idea", "lit"] };
    expect(mergeSettings(prev, { stageGroupsCollapsed: ["design"] })).toEqual({ stageGroupsCollapsed: ["design"] });
    expect(prev.stageGroupsCollapsed).toEqual(["idea", "lit"]);
  });
});

describe("reconciliation of overlapping updates", () => {
  it("A fails, B (different key) succeeds: reverting A keeps B's change", () => {
    const start = { lang: "en" as const };
    const afterAB = mergeSettings(mergeSettings(start, { lang: "hi" }), { draftFirst: true });
    const reverted = revertPatch(afterAB, patchKeys({ lang: "hi" }), start);
    expect(reverted).toEqual({ lang: "en", draftFirst: true });
  });
  it("reverting a key that did not exist before removes it instead of leaving undefined", () => {
    const reverted = revertPatch({ fmtMore: true, dockW: 400 }, ["fmtMore"], {});
    expect(reverted).toEqual({ dockW: 400 });
    expect("fmtMore" in reverted).toBe(false);
  });
  it("stale A response does not clobber newer B: only keys A still owns are applied", () => {
    const current = { dockW: 500, fmtMore: true }; // B set dockW=500 after A set dockW=400 and fmtMore
    // A still owns fmtMore only (B took over dockW), so the server's older dockW=400 is not applied.
    const applied = applyPatchResult(current, ["fmtMore"], { dockW: 400, fmtMore: true });
    expect(applied).toEqual({ dockW: 500, fmtMore: true });
  });
  it("a success response applies the server's value for the owned keys only", () => {
    expect(applyPatchResult({ field: "psy", lang: "hi" }, ["field"], { field: "Psychology", lang: "en" })).toEqual({ field: "Psychology", lang: "hi" });
  });
});

describe("mergeLoaded", () => {
  it("keeps a local change made before the initial /me resolved and takes the rest from the server", () => {
    const merged = mergeLoaded({ lang: "en", sidebarCollapsed: false, field: "Psychology" }, { lang: "hi" }, new Set(["lang"]));
    expect(merged).toEqual({ lang: "hi", sidebarCollapsed: false, field: "Psychology" });
  });
  it("with nothing dirty it simply takes the server settings", () => {
    expect(mergeLoaded({ lang: "en" }, { lang: "hi", field: "x" }, new Set())).toEqual({ lang: "en" });
  });
});
