// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import recap from "../messages/tools/help-recap.en.json";

const h = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { RecapDialog } from "../components/help/recap/RecapDialog";
import { ANSWERS_KEY, LAST_ACTIVE_KEY, OFF_KEY, lastAnswer } from "../lib/help/recap/gap";
import type { RecapFacts } from "../lib/help/recap/facts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const fill = (id: string, v: string) => {
  const el = $(id) as HTMLTextAreaElement;
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => { set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
};
const facts = (over: Partial<RecapFacts> = {}): RecapFacts => ({
  days: 8, project: { name: "Sleep and exams", stage: "writing" }, doc: { title: "Draft one", words: 420 },
  counts: { docs: 2, ai: 0, tests: 3 }, nothingCounted: false, wrote: null, answer: null, ...over
});
function show(f: RecapFacts, onClose = vi.fn()) {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  act(() => { root.render(<RecapDialog facts={f} now={NOW} onClose={onClose} />); });
  return onClose;
}
const text = () => $("recap-dialog")!.textContent ?? "";

beforeEach(() => { localStorage.clear(); h.toast.mockClear(); });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("RecapDialog (v1 returnDlg 1124-1136, retRender)", () => {
  it("shows the welcome, the days away, the project and stage, the open document and the counts above zero", () => {
    show(facts());
    expect(text()).toContain(recap.wc_recap_h);
    expect(text()).toContain("You have been away 8 days.");
    expect(text()).toContain("Project: Sleep and exams, stage: " + en.stage_writing + ".");
    expect(text()).toContain("Open document: Draft one, 420 words.");
    expect(text()).toContain(en.ret_did);
    expect(text()).toContain("2 new document(s)");
    expect(text()).toContain("3 test result(s) inserted");
    expect(text()).not.toContain("AI help request");
  });

  it("never lists a count v2 cannot derive, and no zero", () => {
    show(facts({ counts: { docs: 0 } , nothingCounted: false }));
    expect(text()).not.toMatch(/source\(s\)|passage\(s\)|\b0 /);
    expect(text()).not.toContain(en.ret_did);
    expect(text()).not.toContain(recap.wc_recap_nothing);
  });

  it("says nothing was found to count only when every count was read and each is zero", () => {
    show(facts({ counts: { docs: 0, ai: 0, tests: 0 }, nothingCounted: true }));
    expect(text()).toContain(recap.wc_recap_nothing);
  });

  it("names a locked title as locked and never prints a ciphertext", () => {
    show(facts({ project: { name: null, stage: "idea" }, doc: { title: null, words: 12 } }));
    expect(text()).toContain("Project: " + en.title_locked + ", stage: " + en.stage_idea + ".");
    expect(text()).toContain("Open document: " + en.title_locked + ", 12 words.");
  });

  it("shows the last document's first words only when the facts carry them, and the previous answer from this device", () => {
    show(facts());
    expect(text()).not.toContain("Last time");
    act(() => { roots.splice(0)[0]!.unmount(); });
    document.body.innerHTML = "";
    show(facts({ wrote: { at: NOW - 86_400_000, text: "Sleep and attention in first-years" }, answer: { t: NOW - 86_400_000 * 9, text: "Does a bedtime routine help?" } }));
    expect(text()).toContain("Sleep and attention in first-years");
    expect(text()).toContain("Does a bedtime routine help?");
    expect(text()).toContain("Last time (");
  });

  it("has the three questions, the intro that says 'on this device', and no sentence that says 'this computer'", () => {
    show(facts());
    expect(text()).toContain(en.ret_q1);
    expect(text()).toContain(en.ret_q2);
    expect(text()).toContain(en.ret_q3);
    expect(text()).toContain("saved on this device only");
    expect(text()).not.toContain("this computer");
    expect(text()).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(text()).not.toContain("—");
  });

  it("Save my answers keeps them on this device, stamps the visit, says Saved and closes; they are there next time", () => {
    const onClose = show(facts());
    fill("recap-q1", "Does sleep help?");
    fill("recap-q3", "My sample is small");
    act(() => { $("recap-save")!.click(); });
    const stored = JSON.parse(localStorage.getItem(ANSWERS_KEY)!) as Array<{ t: number; a1: string; a2: string; a3: string }>;
    expect(stored).toEqual([{ t: NOW, a1: "Does sleep help?", a2: "", a3: "My sample is small" }]);
    expect(localStorage.getItem(LAST_ACTIVE_KEY)).toBe(String(NOW));
    expect(h.toast).toHaveBeenCalledWith("Saved");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(lastAnswer()?.text).toBe("Does sleep help?");
  });

  it("Save with nothing written saves nothing and says nothing, and still closes", () => {
    const onClose = show(facts());
    act(() => { $("recap-save")!.click(); });
    expect(localStorage.getItem(ANSWERS_KEY)).toBeNull();
    expect(h.toast).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Skip stamps the visit, saves no answers and closes", () => {
    const onClose = show(facts());
    fill("recap-q1", "typed but skipped");
    act(() => { $("recap-skip")!.click(); });
    expect(localStorage.getItem(LAST_ACTIVE_KEY)).toBe(String(NOW));
    expect(localStorage.getItem(ANSWERS_KEY)).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the switch in the footer writes appu_recap_off at once, checked by default", () => {
    show(facts());
    const box = $("recap-off") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(text()).toContain(en.recap_toggle);
    act(() => { box.click(); });
    expect(localStorage.getItem(OFF_KEY)).toBe("1");
    act(() => { box.click(); });
    expect(localStorage.getItem(OFF_KEY)).toBe("0");
  });
});
