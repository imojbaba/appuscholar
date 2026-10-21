import { describe, expect, it } from "vitest";
import { landingPath, landingTarget } from "@/lib/frame/landing";

describe("what opens", () => {
  it("landingPath: a new student goes to first run, a returning one to the active project's home, otherwise the list", () => {
    expect(landingPath({ projectIds: [], activeProjectId: null })).toBe("/start");
    expect(landingPath({ projectIds: ["a", "b"], activeProjectId: "b" })).toBe("/p/b");
    expect(landingPath({ projectIds: ["a"], activeProjectId: "gone" })).toBe("/projects");
    expect(landingPath({ projectIds: ["a"], activeProjectId: null })).toBe("/projects");
  });

  it("/?import=1 opens the v1 import on the project list", () => {
    expect(landingTarget({ projectIds: ["a"], activeProjectId: "a", scratchProjectId: "s", search: "?import=1", hash: "" })).toBe("/projects?import=1");
    expect(landingTarget({ projectIds: [], activeProjectId: null, scratchProjectId: "s", search: "?import=1", hash: "" })).toBe("/projects?import=1");
  });

  it("a #capture= hash goes where its citation can be saved: the active project's home, else the scratch space", () => {
    expect(landingTarget({ projectIds: ["a"], activeProjectId: "a", scratchProjectId: "s", search: "", hash: "#capture=xyz" })).toBe("/p/a#capture=xyz");
    expect(landingTarget({ projectIds: ["a"], activeProjectId: null, scratchProjectId: "s", search: "", hash: "#capture=xyz" })).toBe("/p/s/writing#capture=xyz");
    expect(landingTarget({ projectIds: [], activeProjectId: null, scratchProjectId: "s", search: "", hash: "#capture=xyz" })).toBe("/p/s/writing#capture=xyz");
  });

  it("any other address lands by landingPath; another hash is not carried", () => {
    expect(landingTarget({ projectIds: ["a"], activeProjectId: "a", scratchProjectId: "s", search: "", hash: "#top" })).toBe("/p/a");
  });
});
