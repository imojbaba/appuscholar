// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ANSWERS_KEY, DEFAULT_GAP_DAYS, GAP_KEY, LAST_ACTIVE_KEY, OFF_KEY, daysAway, lastAnswer, readGapDays, readLastActive, recapOff, saveAnswers, setRecapOff, shouldRecap,
  stampActive
} from "@/lib/help/recap/gap";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const base = { lastActive: NOW - 8 * DAY, now: NOW, gap: 5, off: false, popout: false };

describe("recap: the gap (v1 recapCheck 3587-3598)", () => {
  it("daysAway counts whole days and never goes below zero", () => {
    expect(daysAway(NOW - 8 * DAY - 1000, NOW)).toBe(8);
    expect(daysAway(NOW - 5 * DAY, NOW)).toBe(5);
    expect(daysAway(NOW - 5 * DAY + 1, NOW)).toBe(4);
    expect(daysAway(NOW + DAY, NOW)).toBe(0);
  });

  it("shouldRecap truth table: away at least the gap, not switched off, not a pop-out, and a last visit on record", () => {
    expect(shouldRecap(base)).toBe(true);
    expect(shouldRecap({ ...base, lastActive: NOW - 5 * DAY })).toBe(true);
    expect(shouldRecap({ ...base, lastActive: NOW - 5 * DAY + 1 })).toBe(false);
    expect(shouldRecap({ ...base, lastActive: 0 })).toBe(false);
    expect(shouldRecap({ ...base, off: true })).toBe(false);
    expect(shouldRecap({ ...base, popout: true })).toBe(false);
    expect(shouldRecap({ ...base, gap: 2, lastActive: NOW - 3 * DAY })).toBe(true);
    expect(shouldRecap({ ...base, gap: 10 })).toBe(false);
  });
});

describe("recap: what stays on this device", () => {
  beforeEach(() => localStorage.clear());

  it("the gap is five days unless appu_gap_days holds a positive number", () => {
    expect(DEFAULT_GAP_DAYS).toBe(5);
    expect(readGapDays()).toBe(5);
    localStorage.setItem(GAP_KEY, "9");
    expect(readGapDays()).toBe(9);
    localStorage.setItem(GAP_KEY, "0");
    expect(readGapDays()).toBe(5);
    localStorage.setItem(GAP_KEY, "soon");
    expect(readGapDays()).toBe(5);
  });

  it("the last visit is stamped under appu_last_active and read back", () => {
    expect(readLastActive()).toBe(0);
    stampActive(NOW);
    expect(localStorage.getItem(LAST_ACTIVE_KEY)).toBe(String(NOW));
    expect(readLastActive()).toBe(NOW);
  });

  it("the switch is appu_recap_off: '1' off, anything else on", () => {
    expect(recapOff()).toBe(false);
    setRecapOff(true);
    expect(localStorage.getItem(OFF_KEY)).toBe("1");
    expect(recapOff()).toBe(true);
    setRecapOff(false);
    expect(localStorage.getItem(OFF_KEY)).toBe("0");
    expect(recapOff()).toBe(false);
  });

  it("answers are saved under appu_recap_answers, read back, kept to the newest thirty, and empty answers save nothing", () => {
    expect(saveAnswers({ a1: "", a2: "  ", a3: "" }, NOW)).toBe(false);
    expect(localStorage.getItem(ANSWERS_KEY)).toBeNull();
    expect(saveAnswers({ a1: " why sleep matters ", a2: "", a3: "my sample" }, NOW)).toBe(true);
    const stored = JSON.parse(localStorage.getItem(ANSWERS_KEY)!) as Array<{ t: number; a1: string; a2: string; a3: string }>;
    expect(stored).toEqual([{ t: NOW, a1: "why sleep matters", a2: "", a3: "my sample" }]);
    expect(lastAnswer()).toEqual({ t: NOW, text: "why sleep matters" });
    for (let i = 0; i < 40; i++) saveAnswers({ a1: "q" + i, a2: "", a3: "" }, NOW + i);
    expect((JSON.parse(localStorage.getItem(ANSWERS_KEY)!) as unknown[]).length).toBe(30);
    expect(lastAnswer()?.text).toBe("q39");
  });

  it("a damaged answers entry reads as none and does not stop a new save", () => {
    localStorage.setItem(ANSWERS_KEY, "{not json");
    expect(lastAnswer()).toBeNull();
    expect(saveAnswers({ a1: "again", a2: "", a3: "" }, NOW)).toBe(true);
    expect(lastAnswer()?.text).toBe("again");
  });

  it("storage that throws is survived", () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    try {
      expect(readLastActive()).toBe(0);
      expect(readGapDays()).toBe(5);
      expect(recapOff()).toBe(false);
      expect(lastAnswer()).toBeNull();
    } finally { Storage.prototype.getItem = real; }
  });
});
