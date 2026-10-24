import { describe, expect, it } from "vitest";
import { landingPath, landingTarget } from "@/lib/frame/landing";
import { addingAddress, carriedCapture, CARRY_MAX, isCaptureHash } from "@/lib/cite/captureHash";

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

describe("a #capture= hash is told apart from every other hash (the adding screen's address)", () => {
  it("isCaptureHash and addingAddress: only a hash that begins #capture= goes to /add, carried as it is", () => {
    expect(isCaptureHash("#capture=xyz")).toBe(true);
    for (const h of ["", "#", "#top", "#capture", "#Capture=x", "capture=x", "?capture=x"]) expect(isCaptureHash(h), h).toBe(false);
    expect(addingAddress("#capture=eyJ0%2B%3D")).toBe("/add#capture=eyJ0%2B%3D");
    expect(addingAddress("#top")).toBeNull();
    expect(addingAddress("")).toBeNull();
  });

  it("carriedCapture: a capture longer than a sign-in cookie can hold goes to / rather than failing the sign-in", () => {
    const at = "#capture=" + "A".repeat(CARRY_MAX - "#capture=".length);
    expect(carriedCapture(at)).toBe("/add" + at);
    expect(carriedCapture(at + "A")).toBe("/");
    expect(carriedCapture("/add" + at + "A")).toBe("/");
  });
  it("carriedCapture (the sign-in forms' redirectTo): a capture hash goes to /add and nothing else is ever a target", () => {
    expect(carriedCapture("#capture=eyJ0aXRsZSI6IlQifQ%3D%3D")).toBe("/add#capture=eyJ0aXRsZSI6IlQifQ%3D%3D");
    expect(carriedCapture("/add#capture=eyJ0aXRsZSI6IlQifQ%3D%3D")).toBe("/add#capture=eyJ0aXRsZSI6IlQifQ%3D%3D");
    for (const bad of [
      undefined, null, 42, "", "/", "#top", "#capture", "/add", "/add#top", "/p/x#capture=abc",
      "https://evil.example/add#capture=abc", "//evil.example/add#capture=abc", "/\\evil.example#capture=abc", "javascript:alert(1)", "#capture=a b", "#capture=<script>", "#capture=a\nb",
      "/add#capture=a#capture=b", "/add?x=1#capture=abc", "/add/#capture=abc"
    ]) expect(carriedCapture(bad), String(bad)).toBe("/");
  });
});
