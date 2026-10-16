import { describe, it, expect } from "vitest";
import { foldWeekly, summariseAiLog, weekStart, type DatedStats } from "../src/routes/writingRecord";

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(iso + "T12:00:00Z");
const s = (typed: number, ai: number): DatedStats["stats"] => ({ typed, ai, passages: 0, kept: 0, edited: 0, unknown: 0 });
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

describe("weekStart", () => {
  it("is the Monday of the ISO week, at the Monday and Sunday boundaries", () => {
    expect(iso(weekStart(Date.parse("2026-10-12T00:00:00Z")))).toBe("2026-10-12"); // Monday 00:00
    expect(iso(weekStart(Date.parse("2026-10-18T23:59:59Z")))).toBe("2026-10-12"); // Sunday 23:59
    expect(iso(weekStart(Date.parse("2026-10-19T00:00:00Z")))).toBe("2026-10-19"); // next Monday
    expect(iso(weekStart(Date.parse("2026-10-11T12:00:00Z")))).toBe("2026-10-05"); // Sunday before
  });
});

describe("foldWeekly", () => {
  const now = at("2026-10-16"); // Friday of the week of 2026-10-12
  it("carries a document's latest stats into later weeks and sums documents", () => {
    // Revisions in the weeks of 09-28 (week 1) and 10-12 (week 3); the week of 10-05 has none of its own.
    const a: DatedStats[] = [{ at: at("2026-09-29"), stats: s(10, 0) }, { at: at("2026-09-30"), stats: s(12, 3) }, { at: at("2026-10-13"), stats: s(20, 5) }];
    const b: DatedStats[] = [{ at: at("2026-10-14"), stats: s(4, 0) }];
    const w = foldWeekly([a, b], now);
    expect(w).toEqual([
      { weekStart: "2026-09-28", typed: 12, ai: 3 },
      { weekStart: "2026-10-05", typed: 12, ai: 3 }, // week 2 repeats week 1's latest for the first document
      { weekStart: "2026-10-12", typed: 24, ai: 5 } // a's newest plus b's only revision
    ]);
  });
  it("counts a document whose only revision is in the current week from that week on, and nothing before", () => {
    const w = foldWeekly([[{ at: at("2026-10-15"), stats: s(7, 1) }]], now);
    expect(w).toEqual([{ weekStart: "2026-10-12", typed: 7, ai: 1 }]);
  });
  it("leaves out weeks with no revision at all and weeks where nothing is counted", () => {
    expect(foldWeekly([], now)).toEqual([]);
    expect(foldWeekly([[{ at: at("2026-10-15"), stats: s(0, 0) }]], now)).toEqual([]);
  });
  it("treats a revision made on the Sunday as that week's and one on the next Monday as the next week's", () => {
    const revs: DatedStats[] = [{ at: Date.parse("2026-10-11T23:59:59Z"), stats: s(1, 0) }, { at: Date.parse("2026-10-12T00:00:00Z"), stats: s(2, 0) }];
    const w = foldWeekly([revs], now);
    expect(w).toEqual([{ weekStart: "2026-10-05", typed: 1, ai: 0 }, { weekStart: "2026-10-12", typed: 2, ai: 0 }]);
  });
  it("shows at most the last 8 weeks", () => {
    const revs: DatedStats[] = Array.from({ length: 12 }, (_, i) => ({ at: now - (11 - i) * 7 * DAY, stats: s(i + 1, 0) }));
    const w = foldWeekly([revs], now);
    expect(w).toHaveLength(8);
    expect(w[0]?.weekStart).toBe("2026-08-24");
    expect(w[7]).toEqual({ weekStart: "2026-10-12", typed: 12, ai: 0 });
  });
});

describe("summariseAiLog", () => {
  it("counts by help type and by service with the model, and gives the first and last day", () => {
    const rows = [
      { d: "2026-10-14", p: "groq", m: "llama-3.3", k: "grammar and polish", g: "text" as const },
      { d: "2026-10-16", p: "groq", m: "llama-3.3", k: "continuing my draft", g: "text" as const },
      { d: "2026-10-15", p: "gemini", m: "", k: "grammar and polish", g: "text" as const }
    ];
    expect(summariseAiLog(rows, false)).toEqual({ byKind: { "grammar and polish": 2, "continuing my draft": 1 }, byService: { "Groq (llama-3.3)": 2, "Google Gemini": 1 }, total: 3, firstAt: "2026-10-14", lastAt: "2026-10-16", loggingOff: false });
    expect(summariseAiLog([], true)).toEqual({ byKind: {}, byService: {}, total: 0, firstAt: null, lastAt: null, loggingOff: true });
  });
});
