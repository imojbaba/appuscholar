import { describe, expect, it } from "vitest";
import type { StageState } from "@/lib/frame/stages";
import type { StageKey } from "@/lib/tools";
import { stateSummary } from "@/lib/frame/stateSummary";

/** The English the UI task adds for these keys (V2_STRINGS). */
const EN: Record<string, string> = {
  state_sum_idea: "idea", state_sum_lit: "literature", state_sum_design: "design", state_sum_collect: "analysis", state_sum_writing: "writing", state_sum_review: "review",
  state_sum_and: "{a} and {b}",
  state_sum_ready: "{stages} ready", state_sum_in_progress: "{stages} in progress", state_sum_started_early: "{stages} started early", state_sum_reopened: "{stages} reopened",
  state_sum_none: "Nothing started yet"
};
const t = (key: string, vars?: Record<string, string | number>) => (EN[key] ?? key).replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : m));
const all = (s: StageState): Record<StageKey, StageState> => ({ idea: s, lit: s, design: s, collect: s, writing: s, review: s });

describe("stateSummary", () => {
  it("stateSummary groups stages by state in a fixed order", () => {
    expect(stateSummary({ idea: "ready", lit: "in-progress", design: "started-early", collect: "not-started", writing: "in-progress", review: "not-started" }, t))
      .toBe("Idea ready; literature and writing in progress; design started early");
  });

  it("all not started says so", () => {
    expect(stateSummary(all("not-started"), t)).toBe("Nothing started yet");
  });

  it("three or more stages are listed with commas and a last and; reopened comes last", () => {
    expect(stateSummary({ ...all("in-progress"), lit: "reopened", review: "not-started" }, t)).toBe("Idea, design, analysis and writing in progress; literature reopened");
  });

  it("the first group starts with a capital whatever its state", () => {
    expect(stateSummary({ ...all("not-started"), collect: "started-early" }, t)).toBe("Analysis started early");
  });
});
