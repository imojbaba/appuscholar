// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ANSWERS_KEY, DEFAULT_GAP_DAYS, GAP_KEY, LAST_ACTIVE_KEY, OFF_KEY, daysAway, lastAnswer, readGapDays, readLastActive, recapKey, recapOff, saveAnswers,
  setRecapOff, shouldRecap, stampActive
} from "@/lib/help/recap/gap";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const base = { lastActive: NOW - 8 * DAY, now: NOW, gap: 5, off: false, popout: false };
const A = "user-a";
const B = "user-b";

describe("recap: the gap (v1 recapCheck 3739-3749)", () => {
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

describe("recap: what stays on this device, per account (ruling R5)", () => {
  beforeEach(() => localStorage.clear());

  it("every key ends in the account's id, and nothing is written under v1's device-wide names", () => {
    expect(recapKey(LAST_ACTIVE_KEY, A)).toBe("appu_last_active_user-a");
    stampActive(A, NOW);
    setRecapOff(A, true);
    saveAnswers(A, { a1: "why", a2: "", a3: "" }, NOW);
    localStorage.setItem(recapKey(GAP_KEY, A), "9");
    expect(Object.keys(localStorage).sort()).toEqual([
      "appu_gap_days_user-a", "appu_last_active_user-a", "appu_recap_answers_user-a", "appu_recap_off_user-a"
    ]);
    expect([LAST_ACTIVE_KEY, OFF_KEY, ANSWERS_KEY, GAP_KEY].map((k) => localStorage.getItem(k))).toEqual([null, null, null, null]);
  });

  it("one account's last visit, switch, gap and answers are never read for another", () => {
    stampActive(A, NOW);
    setRecapOff(A, true);
    saveAnswers(A, { a1: "A's question", a2: "", a3: "" }, NOW);
    localStorage.setItem(recapKey(GAP_KEY, A), "9");
    expect(readLastActive(B)).toBe(0);
    expect(recapOff(B)).toBe(false);
    expect(lastAnswer(B)).toBeNull();
    expect(readGapDays(B)).toBe(DEFAULT_GAP_DAYS);
    expect(readLastActive(A)).toBe(NOW);
    expect(recapOff(A)).toBe(true);
    expect(lastAnswer(A)?.text).toBe("A's question");
    expect(readGapDays(A)).toBe(9);
    // B writing its own leaves A's alone.
    setRecapOff(B, false);
    saveAnswers(B, { a1: "B's question", a2: "", a3: "" }, NOW + 1);
    expect(recapOff(A)).toBe(true);
    expect(lastAnswer(A)?.text).toBe("A's question");
    expect(lastAnswer(B)?.text).toBe("B's question");
  });

  it("with no one signed in nothing is read and nothing is written", () => {
    localStorage.setItem(LAST_ACTIVE_KEY, String(NOW - 9 * DAY));
    localStorage.setItem(OFF_KEY, "1");
    const before = JSON.stringify({ ...localStorage });
    expect(readLastActive(null)).toBe(0);
    expect(recapOff(null)).toBe(false);
    expect(readGapDays(null)).toBe(DEFAULT_GAP_DAYS);
    expect(lastAnswer(null)).toBeNull();
    expect(stampActive(null, NOW)).toBe(false);
    expect(setRecapOff(null, true)).toBe(false);
    expect(saveAnswers(null, { a1: "x", a2: "", a3: "" }, NOW)).toBe("failed");
    expect(JSON.stringify({ ...localStorage })).toBe(before);
  });

  it("the gap is five days unless appu_gap_days_<id> holds a positive number", () => {
    expect(DEFAULT_GAP_DAYS).toBe(5);
    expect(readGapDays(A)).toBe(5);
    localStorage.setItem(recapKey(GAP_KEY, A), "9");
    expect(readGapDays(A)).toBe(9);
    localStorage.setItem(recapKey(GAP_KEY, A), "0");
    expect(readGapDays(A)).toBe(5);
    localStorage.setItem(recapKey(GAP_KEY, A), "soon");
    expect(readGapDays(A)).toBe(5);
  });

  it("the last visit is stamped and read back; a bad value reads as none", () => {
    expect(readLastActive(A)).toBe(0);
    expect(stampActive(A, NOW)).toBe(true);
    expect(localStorage.getItem(recapKey(LAST_ACTIVE_KEY, A))).toBe(String(NOW));
    expect(readLastActive(A)).toBe(NOW);
    localStorage.setItem(recapKey(LAST_ACTIVE_KEY, A), "yesterday");
    expect(readLastActive(A)).toBe(0);
  });

  it("the switch: '1' off, anything else on", () => {
    expect(recapOff(A)).toBe(false);
    expect(setRecapOff(A, true)).toBe(true);
    expect(localStorage.getItem(recapKey(OFF_KEY, A))).toBe("1");
    expect(recapOff(A)).toBe(true);
    setRecapOff(A, false);
    expect(localStorage.getItem(recapKey(OFF_KEY, A))).toBe("0");
    expect(recapOff(A)).toBe(false);
  });

  it("answers are kept trimmed, empty ones save nothing, and only the newest thirty stay", () => {
    expect(saveAnswers(A, { a1: "", a2: "  ", a3: "" }, NOW)).toBe("nothing");
    expect(localStorage.getItem(recapKey(ANSWERS_KEY, A))).toBeNull();
    expect(saveAnswers(A, { a1: " why sleep matters ", a2: "", a3: "my sample" }, NOW)).toBe("saved");
    const stored = JSON.parse(localStorage.getItem(recapKey(ANSWERS_KEY, A))!) as Array<{ t: number; a1: string; a2: string; a3: string }>;
    expect(stored).toEqual([{ t: NOW, a1: "why sleep matters", a2: "", a3: "my sample" }]);
    expect(lastAnswer(A)).toEqual({ t: NOW, text: "why sleep matters" });
    for (let i = 0; i < 40; i++) saveAnswers(A, { a1: "q" + i, a2: "", a3: "" }, NOW + i);
    expect((JSON.parse(localStorage.getItem(recapKey(ANSWERS_KEY, A))!) as unknown[]).length).toBe(30);
    expect(lastAnswer(A)?.text).toBe("q39");
  });

  it("the previous answer is the first answer of the newest set, as v1 shows it, and none when that set has no first answer", () => {
    saveAnswers(A, { a1: "older question", a2: "", a3: "" }, NOW);
    saveAnswers(A, { a1: "", a2: "next step only", a3: "" }, NOW + 1);
    expect(lastAnswer(A)).toBeNull();
  });

  it("a damaged answers entry reads as none and does not stop a new save", () => {
    localStorage.setItem(recapKey(ANSWERS_KEY, A), "{not json");
    expect(lastAnswer(A)).toBeNull();
    expect(saveAnswers(A, { a1: "again", a2: "", a3: "" }, NOW)).toBe("saved");
    expect(lastAnswer(A)?.text).toBe("again");
  });

  it("storage that throws on read is survived", () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    try {
      expect(readLastActive(A)).toBe(0);
      expect(readGapDays(A)).toBe(5);
      expect(recapOff(A)).toBe(false);
      expect(lastAnswer(A)).toBeNull();
    } finally { Storage.prototype.getItem = real; }
  });

  it("storage that throws on write is reported, never shown as saved", () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("quota"); };
    try {
      expect(stampActive(A, NOW)).toBe(false);
      expect(setRecapOff(A, true)).toBe(false);
      expect(saveAnswers(A, { a1: "kept?", a2: "", a3: "" }, NOW)).toBe("failed");
    } finally { Storage.prototype.setItem = real; }
    expect(lastAnswer(A)).toBeNull();
  });
});
