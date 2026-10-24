// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recapKey, LAST_ACTIVE_KEY } from "@/lib/help/recap/gap";
import { RECAP_DELAY_MS, TOUCH_MS, checkedThisLoad, lastVisitAtLoad, markChecked, pageLoadedAt, resetVisit, stampNow, touchActive } from "@/lib/help/recap/visit";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const A = "user-a";
const key = recapKey(LAST_ACTIVE_KEY, A);

beforeEach(() => { localStorage.clear(); resetVisit(NOW); window.history.replaceState(null, "", "/"); });
afterEach(() => window.history.replaceState(null, "", "/"));

describe("recap: this page load's view of the last visit (v1 LAST_ACTIVE_AT_LOAD, touchActive)", () => {
  it("the delay is 2.5 s and a touch is at most once a minute, as in v1", () => {
    expect(RECAP_DELAY_MS).toBe(2500);
    expect(TOUCH_MS).toBe(60_000);
  });

  it("reads the stored last visit once per account, so a later stamp cannot hide the gap", () => {
    localStorage.setItem(key, String(NOW - 8 * DAY));
    expect(lastVisitAtLoad(A)).toBe(NOW - 8 * DAY);
    localStorage.setItem(key, String(NOW));
    expect(lastVisitAtLoad(A)).toBe(NOW - 8 * DAY);
    expect(lastVisitAtLoad("user-b")).toBe(0);
  });

  it("a touch that comes first still leaves the value read at load as it was stored before", () => {
    localStorage.setItem(key, String(NOW - 8 * DAY));
    expect(touchActive(A, NOW)).toBe(true);
    expect(localStorage.getItem(key)).toBe(String(NOW));
    expect(lastVisitAtLoad(A)).toBe(NOW - 8 * DAY);
  });

  it("a touch stamps at most once a minute", () => {
    expect(touchActive(A, NOW)).toBe(true);
    expect(touchActive(A, NOW + TOUCH_MS - 1)).toBe(false);
    expect(localStorage.getItem(key)).toBe(String(NOW));
    expect(touchActive(A, NOW + TOUCH_MS)).toBe(true);
    expect(localStorage.getItem(key)).toBe(String(NOW + TOUCH_MS));
  });

  it("the check's own stamp counts as a touch, as v1 sets _actTouch with it", () => {
    expect(stampNow(A, NOW)).toBe(true);
    expect(touchActive(A, NOW + 1000)).toBe(false);
    expect(localStorage.getItem(key)).toBe(String(NOW));
  });

  it("a pop-out never stamps", () => {
    window.history.replaceState(null, "", "/?window=1");
    expect(touchActive(A, NOW)).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("remembers that the check ran for an account in this page load", () => {
    expect(checkedThisLoad(A)).toBe(false);
    markChecked(A, true);
    expect(checkedThisLoad(A)).toBe(true);
    expect(checkedThisLoad("user-b")).toBe(false);
    markChecked(A, false);
    expect(checkedThisLoad(A)).toBe(false);
  });

  it("knows when the page loaded", () => {
    expect(pageLoadedAt()).toBe(NOW);
  });
});
