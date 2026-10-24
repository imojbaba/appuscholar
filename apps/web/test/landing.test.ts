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
    expect(landingTarget({ projectIds: ["a"], activeProjectId: "a", search: "?import=1", hash: "" })).toBe("/projects?import=1");
    expect(landingTarget({ projectIds: [], activeProjectId: null, search: "?import=1", hash: "" })).toBe("/projects?import=1");
  });

  it("an old bookmark's /#capture= lands on the adding screen with its hash, whatever the student has (W5, W13)", () => {
    expect(landingTarget({ projectIds: ["a"], activeProjectId: "a", search: "", hash: "#capture=xyz" })).toBe("/add#capture=xyz");
    expect(landingTarget({ projectIds: ["a"], activeProjectId: null, search: "", hash: "#capture=xyz" })).toBe("/add#capture=xyz");
    expect(landingTarget({ projectIds: [], activeProjectId: null, search: "", hash: "#capture=xyz" })).toBe("/add#capture=xyz");
    // The payload is carried as it is, percent-escapes and all.
    expect(landingTarget({ projectIds: ["a"], activeProjectId: "a", search: "?x=1", hash: "#capture=eyJ0%2B%3D" })).toBe("/add#capture=eyJ0%2B%3D");
  });

  it("any other address lands by landingPath; another hash is not carried", () => {
    expect(landingTarget({ projectIds: ["a"], activeProjectId: "a", search: "", hash: "#top" })).toBe("/p/a");
  });
});
