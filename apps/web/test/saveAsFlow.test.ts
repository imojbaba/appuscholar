import { describe, it, expect } from "vitest";
import { runCreateFlow, type SaveAsProgress } from "@/lib/saveAsFlow";

describe("runCreateFlow", () => {
  it("never creates the project twice when a later step fails and the flow is retried", async () => {
    const progress: SaveAsProgress = {};
    const calls: string[] = [];
    let failMove = true;
    const steps = {
      create: async () => { calls.push("create"); return { id: "p1", title: "Thesis" }; },
      move: async () => { calls.push("move"); if (failMove) { failMove = false; throw new Error("net"); } },
      activate: async () => { calls.push("activate"); }
    };
    await expect(runCreateFlow(progress, steps)).rejects.toThrow("net");
    expect(progress.projectId).toBe("p1");
    expect(progress.moved).toBeFalsy();
    await expect(runCreateFlow(progress, steps)).resolves.toEqual({ id: "p1", title: "Thesis" });
    expect(calls).toEqual(["create", "move", "move", "activate"]);
  });

  it("does not move again once the move succeeded and only activation failed", async () => {
    const progress: SaveAsProgress = {};
    const calls: string[] = [];
    let failActivate = true;
    const steps = {
      create: async () => { calls.push("create"); return { id: "p1", title: "T" }; },
      move: async () => { calls.push("move"); },
      activate: async () => { calls.push("activate"); if (failActivate) { failActivate = false; throw new Error("x"); } }
    };
    await expect(runCreateFlow(progress, steps)).rejects.toThrow();
    await runCreateFlow(progress, steps);
    expect(calls).toEqual(["create", "move", "activate", "activate"]);
  });

  it("skips the move when there is nothing to move", async () => {
    const calls: string[] = [];
    await runCreateFlow({}, { create: async () => ({ id: "p", title: "T" }), move: null, activate: async () => { calls.push("activate"); } });
    expect(calls).toEqual(["activate"]);
  });
});
