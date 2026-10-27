// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import recap from "../messages/tools/help-recap.en.json";

const h = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { RecapDialog } from "../components/help/recap/RecapDialog";
import { ANSWERS_KEY, LAST_ACTIVE_KEY, OFF_KEY, lastAnswer, recapKey } from "../lib/help/recap/gap";
import type { RecapFacts } from "../lib/help/recap/facts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const UID = "user-a";
const k = (base: string) => recapKey(base, UID);
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const fill = (id: string, v: string) => {
  const el = $(id) as HTMLTextAreaElement;
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => { set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
};
const facts = (over: Partial<RecapFacts> = {}): RecapFacts => ({
  days: 8, project: { name: "Sleep and exams" }, doc: { title: "Draft one", words: 420 },
  counts: { docs: 2, ai: 0, tests: 3 }, nothingCounted: false, wrote: null, answer: null, ...over
});
function show(f: RecapFacts, onClose = vi.fn()) {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  act(() => { root.render(<RecapDialog uid={UID} facts={f} onClose={onClose} />); });
  return onClose;
}
const text = () => $("recap-dialog")!.textContent ?? "";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); localStorage.clear(); h.toast.mockClear(); });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; vi.useRealTimers(); });

describe("RecapDialog (v1 returnDlg 1183-1195, retRender 3707-3727)", () => {
  it("shows the welcome, the days away, the project, the open document and the counts above zero, led in by 'since'", () => {
    show(facts());
    expect(text()).toContain(recap.wc_recap_h);
    expect(text()).toContain("You have been away 8 days.");
    expect(text()).toContain("Project: Sleep and exams.");
    expect(text()).not.toMatch(/stage/i);
    expect(text()).toContain("Open document: Draft one, 420 words.");
    expect(text()).toContain(recap.wc_recap_since + " 2 new document(s), 3 test result(s) inserted.");
    expect(text()).not.toContain(en.ret_did);
    expect(text()).not.toContain("AI help request");
  });

  it("never lists a count v2 cannot derive, and no zero", () => {
    show(facts({ counts: { docs: 0 } , nothingCounted: false }));
    expect(text()).not.toMatch(/source\(s\)|passage\(s\)|\b0 /);
    expect(text()).not.toContain(recap.wc_recap_since);
    expect(text()).not.toContain(recap.wc_recap_nothing);
  });

  it("says nothing was found to count only when every count was read and each is zero", () => {
    show(facts({ counts: { docs: 0, ai: 0, tests: 0 }, nothingCounted: true }));
    expect(text()).toContain(recap.wc_recap_nothing);
  });

  it("names a locked title as locked and never prints a ciphertext", () => {
    show(facts({ project: { name: null }, doc: { title: null, words: 12 } }));
    expect(text()).toContain("Project: " + en.title_locked + ".");
    expect(text()).toContain("Open document: " + en.title_locked + ", 12 words.");
  });

  it("shows the last document's first words only when the facts carry them, and the previous answer from this device", () => {
    show(facts());
    expect(text()).not.toContain("Last time");
    act(() => { roots.splice(0)[0]!.unmount(); });
    document.body.innerHTML = "";
    show(facts({ wrote: { at: NOW - 86_400_000, text: "Sleep and attention in first-years" }, answer: { t: NOW - 86_400_000 * 9, text: "Does a bedtime routine help?" } }));
    expect($("recap-wrote")!.textContent).toContain("Sleep and attention in first-years");
    expect($("recap-wrote")!.textContent).toContain("Last time (");
    expect($("recap-prev")!.textContent).toContain("Does a bedtime routine help?");
    expect($("recap-prev")!.textContent).toContain("Your answer to the first question last time (");
  });

  it("has the three questions, the intro that says 'on this device only', and no sentence that says 'this computer'", () => {
    show(facts());
    expect(text()).toContain(en.ret_q1);
    expect(text()).toContain(en.ret_q2);
    expect(text()).toContain(en.ret_q3);
    expect(text()).toContain("saved on this device only");
    expect(text()).not.toContain("this computer");
    expect(text()).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(text()).not.toContain("\u2014");
  });

  it("describes itself by its visible intro, with no second hidden copy of it", () => {
    show(facts());
    const content = $("recap-dialog")!;
    const id = content.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe(recap.wc_recap_intro);
    expect(content.textContent!.split(recap.wc_recap_intro).length - 1).toBe(1);
  });

  it("Save my answers keeps them on this device for this account, stamps the visit, says Saved and closes; they are there next time", () => {
    const onClose = show(facts());
    fill("recap-q1", "Does sleep help?");
    fill("recap-q3", "My sample is small");
    act(() => { $("recap-save")!.click(); });
    const stored = JSON.parse(localStorage.getItem(k(ANSWERS_KEY))!) as Array<{ t: number; a1: string; a2: string; a3: string }>;
    expect(stored).toEqual([{ t: NOW, a1: "Does sleep help?", a2: "", a3: "My sample is small" }]);
    expect(localStorage.getItem(k(LAST_ACTIVE_KEY))).toBe(String(NOW));
    expect(Object.keys(localStorage).filter((x) => !x.endsWith("_" + UID))).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith("Saved");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(lastAnswer(UID)?.text).toBe("Does sleep help?");
  });

  it("stamps the time of the click, not the time the dialog opened", () => {
    const onClose = show(facts());
    vi.setSystemTime(NOW + 600_000);
    fill("recap-q1", "Later answer");
    act(() => { $("recap-save")!.click(); });
    expect(localStorage.getItem(k(LAST_ACTIVE_KEY))).toBe(String(NOW + 600_000));
    expect(lastAnswer(UID)?.t).toBe(NOW + 600_000);
    expect(onClose).toHaveBeenCalled();
  });

  it("Save with nothing written saves nothing and says nothing, and still closes", () => {
    const onClose = show(facts());
    act(() => { $("recap-save")!.click(); });
    expect(localStorage.getItem(k(ANSWERS_KEY))).toBeNull();
    expect(h.toast).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("when the device will not keep the answers it says so in the dialog, shows no 'Saved', and stays open with the answers", () => {
    const onClose = show(facts());
    fill("recap-q1", "Keep me");
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("blocked"); };
    try { act(() => { $("recap-save")!.click(); }); } finally { Storage.prototype.setItem = real; }
    expect(h.toast).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect($("recap-error")!.textContent).toBe(recap.wc_recap_nostore);
    expect(($("recap-q1") as HTMLTextAreaElement).value).toBe("Keep me");
    // Skip still leaves.
    act(() => { $("recap-skip")!.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Skip stamps the visit, saves no answers and closes", () => {
    const onClose = show(facts());
    fill("recap-q1", "typed but skipped");
    act(() => { $("recap-skip")!.click(); });
    expect(localStorage.getItem(k(LAST_ACTIVE_KEY))).toBe(String(NOW));
    expect(localStorage.getItem(k(ANSWERS_KEY))).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a click outside does not close it and lose what was typed; with nothing typed it closes like Skip", () => {
    const onClose = show(facts());
    // Radix listens for a press outside from the next tick on.
    act(() => { vi.advanceTimersByTime(10); });
    // This Radix waits for the click that ends a press outside before it dismisses.
    const outside = () => act(() => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      vi.advanceTimersByTime(10);
    });
    fill("recap-q2", "half a thought");
    outside();
    expect(onClose).not.toHaveBeenCalled();
    expect(($("recap-q2") as HTMLTextAreaElement).value).toBe("half a thought");
    fill("recap-q2", "   ");
    outside();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(Number(localStorage.getItem(k(LAST_ACTIVE_KEY)))).toBeGreaterThanOrEqual(NOW);
  });

  it("Escape does not close it while an answer is typed, and with nothing typed it closes like Skip", () => {
    const onClose = show(facts());
    const escape = () => act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    fill("recap-q3", "unfinished");
    escape();
    expect(onClose).not.toHaveBeenCalled();
    fill("recap-q3", "");
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(k(ANSWERS_KEY))).toBeNull();
  });

  it("the switch in the footer writes this account's off key at once, checked by default", () => {
    show(facts());
    const box = $("recap-off") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(text()).toContain(en.recap_toggle);
    act(() => { box.click(); });
    expect(localStorage.getItem(k(OFF_KEY))).toBe("1");
    expect(localStorage.getItem(OFF_KEY)).toBeNull();
    act(() => { box.click(); });
    expect(localStorage.getItem(k(OFF_KEY))).toBe("0");
  });

  it("opens with the switch off for an account that switched it off (the dialog is still reachable then, e.g. from a test)", () => {
    localStorage.setItem(k(OFF_KEY), "1");
    show(facts());
    expect(($("recap-off") as HTMLInputElement).checked).toBe(false);
  });

  it("a switch the device will not keep is not shown as changed, and says so", () => {
    show(facts());
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("blocked"); };
    try { act(() => { ($("recap-off") as HTMLInputElement).click(); }); } finally { Storage.prototype.setItem = real; }
    expect(($("recap-off") as HTMLInputElement).checked).toBe(true);
    expect($("recap-error")!.textContent).toBe(recap.wc_recap_nostore);
  });
});
