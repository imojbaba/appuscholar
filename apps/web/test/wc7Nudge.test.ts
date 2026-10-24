import { beforeEach, describe, expect, it } from "vitest";
import { NUDGE_MIN_WORDS, OLD_DAYS, SNOOZE_MS, daysSince, nudgeDue } from "../lib/help/backup/nudge";
import { lastBackup, snoozedUntil, snoozeNudge, stampBackup } from "../lib/help/backup/stamp";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const base = { words: 400, lastBackup: 0, snoozedUntil: 0, now: NOW };
beforeEach(() => { store.clear(); });

describe("nudgeDue (Task C7, v1 backupNudgeCheck 4454-4471)", () => {
  it("shows nothing under 150 words, and shows at exactly 150", () => {
    expect(NUDGE_MIN_WORDS).toBe(150);
    expect(nudgeDue({ ...base, words: 0 })).toBeNull();
    expect(nudgeDue({ ...base, words: 149 })).toBeNull();
    expect(nudgeDue({ ...base, words: 150 })).toBe("new");
    expect(nudgeDue({ ...base, words: 150, lastBackup: NOW - 8 * DAY })).toBe("old");
    expect(nudgeDue({ ...base, words: 149, lastBackup: NOW - 8 * DAY })).toBeNull();
  });

  it("never backed up: new", () => {
    expect(nudgeDue({ ...base, lastBackup: 0 })).toBe("new");
  });

  it("a backup 7 or more whole days ago: old; under 7 days: nothing", () => {
    expect(OLD_DAYS).toBe(7);
    expect(nudgeDue({ ...base, lastBackup: NOW - 6 * DAY - (DAY - 1) })).toBeNull();
    expect(nudgeDue({ ...base, lastBackup: NOW - 7 * DAY })).toBe("old");
    expect(nudgeDue({ ...base, lastBackup: NOW - 30 * DAY })).toBe("old");
    expect(nudgeDue({ ...base, lastBackup: NOW - 1000 })).toBeNull();
    expect(nudgeDue({ ...base, lastBackup: NOW })).toBeNull();
  });

  it("a backup dated in the future (the clock moved) is not old", () => {
    expect(nudgeDue({ ...base, lastBackup: NOW + 5 * DAY })).toBeNull();
  });

  it("snoozed: nothing, whatever the words and the backup; the snooze ends at its time", () => {
    expect(nudgeDue({ ...base, snoozedUntil: NOW + 1 })).toBeNull();
    expect(nudgeDue({ ...base, lastBackup: NOW - 30 * DAY, snoozedUntil: NOW + DAY })).toBeNull();
    expect(nudgeDue({ ...base, snoozedUntil: NOW })).toBe("new");
    expect(nudgeDue({ ...base, snoozedUntil: NOW - 1 })).toBe("new");
  });

  it("daysSince counts whole days, as v1's Math.floor", () => {
    expect(daysSince(NOW - 7 * DAY - 5000, NOW)).toBe(7);
    expect(daysSince(NOW - 8 * DAY + 5000, NOW)).toBe(7);
    expect(daysSince(NOW, NOW)).toBe(0);
  });
});

describe("the snooze and the backup date are this student's (R5)", () => {
  it("Later snoozes for 3 days, under appu_backup_snooze_<id>", () => {
    expect(SNOOZE_MS).toBe(3 * DAY);
    expect(snoozedUntil("u1")).toBe(0);
    snoozeNudge("u1", NOW);
    expect([...store.keys()]).toEqual(["appu_backup_snooze_u1"]);
    expect(snoozedUntil("u1")).toBe(NOW + 3 * DAY);
    expect(nudgeDue({ ...base, snoozedUntil: snoozedUntil("u1"), now: NOW + 3 * DAY - 1 })).toBeNull();
    expect(nudgeDue({ ...base, snoozedUntil: snoozedUntil("u1"), now: NOW + 3 * DAY })).toBe("new");
  });

  it("another student on the same computer is not snoozed by it", () => {
    snoozeNudge("u1", NOW);
    expect(snoozedUntil("u2")).toBe(0);
    snoozeNudge("u2", NOW + DAY);
    expect(snoozedUntil("u1")).toBe(NOW + 3 * DAY);
    expect(snoozedUntil("u2")).toBe(NOW + 4 * DAY);
  });

  it("with no user id nothing is read and nothing is written, and the old device-wide key is never read", () => {
    store.set("appu_backup_snooze", String(NOW + 9 * DAY));
    snoozeNudge(undefined, NOW);
    snoozeNudge(null, NOW);
    expect(snoozedUntil(undefined)).toBe(0);
    expect(snoozedUntil(null)).toBe(0);
    expect(snoozedUntil("u1")).toBe(0);
    expect([...store.keys()]).toEqual(["appu_backup_snooze"]);
  });

  it("a backup stamp ends the need for a nudge for this student only", () => {
    stampBackup("u1", NOW - DAY);
    expect(nudgeDue({ ...base, lastBackup: lastBackup("u1") })).toBeNull();
    expect(nudgeDue({ ...base, lastBackup: lastBackup("u2") })).toBe("new");
  });
});
