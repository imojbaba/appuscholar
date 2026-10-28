import { describe, expect, it } from "vitest";
import { landingPath, landingTarget } from "@/lib/frame/landing";

describe("what opens", () => {
  it("landingPath: the dashboard, Your studies, always (start-a-study spec: a new student starts a study from there)", () => {
    expect(landingPath()).toBe("/projects");
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

  it("any other address lands on the dashboard, a new student's and a returning one's alike; another hash is not carried", () => {
    expect(landingTarget({ projectIds: ["a"], activeProjectId: "a", scratchProjectId: "s", search: "", hash: "#top" })).toBe("/projects");
    expect(landingTarget({ projectIds: [], activeProjectId: null, scratchProjectId: "s", search: "", hash: "" })).toBe("/projects");
  });
});
