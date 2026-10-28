// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../messages/tools/participants.en.json";
import { askPd, foundSentence, PdHost } from "../lib/ai/pdDialog";
import type { PdChoice, ScanResult } from "../lib/ai/callAI";

/*
 * Task 11: the personal-data dialog with names (spec 2026-10-24-participants-design.md §8.3, calls C11; mockup panel C; controller ruling R41). Three buttons as before; the names the
 * list has are counted in "Found:"; the words that might be names are listed with a small Mask / Leave toggle each (starting at Mask); a locked list gets its line and an Unlock button.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (id: string) => $(id)?.textContent ?? null;
const sleep = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function click(id: string) {
  const el = $(id);
  if (!el) throw new Error("no element " + id);
  await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
}
const EMAIL = { counts: { "email address": 1 }, total: 1, sig: "email addressa@b.com" };
const scan = (names?: ScanResult["names"], base: Partial<ScanResult> = EMAIL, checked?: ScanResult["checked"]): ScanResult => ({ ...base, ...(names ? { names } : {}), ...(checked ? { checked } : {}) }) as ScanResult;

async function open(sc: ScanResult): Promise<{ answer: Promise<PdChoice> }> {
  let answer!: Promise<PdChoice>;
  await act(async () => { answer = askPd(sc); await new Promise((r) => setTimeout(r, 0)); });
  return { answer };
}

beforeEach(async () => {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  await act(async () => { root.render(<PdHost />); });
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("the found sentence", () => {
  it("names from the list come first, then the usual kinds", () => {
    expect(foundSentence({ "email address": 1 }, "2 names from your participant list")).toBe("Found: 2 names from your participant list, 1 email address.");
    expect(foundSentence({}, "1 name from your participant list")).toBe("Found: 1 name from your participant list.");
    expect(foundSentence({ "email address": 2, "phone number": 1 })).toBe("Found: 2 email addresses, 1 phone number.");
  });
});

describe("the dialog with names", () => {
  it("counts the names from the list beside the email, as the mockup does", async () => {
    await open(scan({ listed: 2, maybe: [], locked: false }));
    expect(text("pd-found")).toBe("Found: 2 names from your participant list, 1 email address.");
    expect($("pd-maybe")).toBeNull();
    expect($("pd-locked")).toBeNull();
    expect($("pd-mask")).not.toBeNull();
    expect($("pd-send")).not.toBeNull();
    expect($("pd-cancel")).not.toBeNull();
  });

  it("says one name in the singular", async () => {
    await open(scan({ listed: 1, maybe: [], locked: false }));
    expect(text("pd-found")).toBe("Found: 1 name from your participant list, 1 email address.");
  });

  it("without names it is the dialog it was: Found: 1 email address.", async () => {
    await open(scan());
    expect(text("pd-found")).toBe("Found: 1 email address.");
    expect($("pd-maybe")).toBeNull();
    expect($("pd-locked")).toBeNull();
  });

  it("lists each word that might be a name with a Mask / Leave toggle that starts at Mask; Leave is answered with the word", async () => {
    const { answer } = await open(scan({ listed: 2, maybe: ["Meena", "Asha"], locked: false }));
    expect(text("pd-maybe")).toContain(en.pp_ai_maybe);
    expect(text("pd-maybe")).toContain("Meena");
    expect(text("pd-maybe")).toContain("Asha");
    expect($("pd-word-mask-0")!.getAttribute("aria-pressed")).toBe("true");
    expect($("pd-word-leave-0")!.getAttribute("aria-pressed")).toBe("false");
    await click("pd-word-leave-0");
    expect($("pd-word-mask-0")!.getAttribute("aria-pressed")).toBe("false");
    expect($("pd-word-leave-0")!.getAttribute("aria-pressed")).toBe("true");
    expect($("pd-word-mask-1")!.getAttribute("aria-pressed")).toBe("true"); // the other word is its own
    await click("pd-mask");
    expect(await answer).toEqual({ answer: "mask", leave: ["Meena"] });
    expect($("pd-dialog")).toBeNull();
  });

  it("Mask on the toggle puts a word back, and Send as it is carries the toggles as they are", async () => {
    const { answer } = await open(scan({ listed: 0, maybe: ["Meena", "Asha"], locked: false }, { counts: {}, total: 0, sig: "x" }));
    await click("pd-word-leave-0");
    await click("pd-word-leave-1");
    await click("pd-word-mask-0");
    await click("pd-send");
    expect(await answer).toEqual({ answer: "send", leave: ["Asha"] });
  });

  it("only maybe words found: no Found line, and Mask is there for them", async () => {
    await open(scan({ listed: 0, maybe: ["Meena"], locked: false }, { counts: {}, total: 0, sig: "x" }));
    expect($("pd-found")).toBeNull();
    expect($("pd-maybe")).not.toBeNull();
    expect($("pd-mask")).not.toBeNull();
  });

  it("names the list has and nothing else: the Found line says so, with no 'might be' line", async () => {
    await open(scan({ listed: 3, maybe: [], locked: false }, { counts: {}, total: 0, sig: "x" }));
    expect(text("pd-found")).toBe("Found: 3 names from your participant list.");
  });

  it("the toggles start at Mask again for the next request", async () => {
    const first = await open(scan({ listed: 0, maybe: ["Meena"], locked: false }));
    await click("pd-word-leave-0");
    await click("pd-cancel");
    expect(await first.answer).toEqual({ answer: "cancel", leave: [] });
    await open(scan({ listed: 0, maybe: ["Meena"], locked: false }));
    expect($("pd-word-mask-0")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("each toggle is named for a screen reader by its word", async () => {
    await open(scan({ listed: 0, maybe: ["Meena"], locked: false }));
    expect($("pd-word-0")!.getAttribute("aria-label")).toBe(en.pp_ai_word_aria.replace("{word}", "Meena"));
  });
});

describe("a participant list that is locked", () => {
  it("shows the line and Unlock beside the buttons; with nothing else found there is nothing to mask", async () => {
    const { answer } = await open(scan({ listed: 0, maybe: [], locked: true }, { counts: {}, total: 0, sig: "x" }));
    expect(text("pd-locked")).toContain("Your participant list is locked, so names on it were not checked.");
    expect($("pd-found")).toBeNull();
    expect($("pd-mask")).toBeNull();
    expect($("pd-send")).not.toBeNull();
    expect($("pd-cancel")).not.toBeNull();
    expect($("pd-unlock")).not.toBeNull();
    await click("pd-unlock");
    expect(await answer).toEqual({ answer: "unlock", leave: [] });
  });

  it("alongside an email it is the same dialog with Mask; Unlock is still there", async () => {
    await open(scan({ listed: 0, maybe: [], locked: true }));
    expect(text("pd-found")).toBe("Found: 1 email address.");
    expect($("pd-locked")).not.toBeNull();
    expect($("pd-mask")).not.toBeNull();
    expect($("pd-unlock")).not.toBeNull();
  });

  it("an unlocked list has no Unlock", async () => {
    await open(scan({ listed: 1, maybe: [], locked: false }));
    expect($("pd-unlock")).toBeNull();
  });
});

describe("the sentences", () => {
  it("says it finds names on the list and common first names, but not every name, when both ran; the line about the AI provider says the text goes through Appuscholar's server first (O14)", async () => {
    await open(scan({ listed: 0, maybe: [], locked: false }, EMAIL, { list: true, firstNames: true }));
    const body = text("pd-dialog")!;
    expect(body).toContain(en.pp_ai_goes);
    expect(body).not.toMatch(/straight to your AI provider/i);
    expect(body).toContain(en.pp_ai_checks);
    expect(en.pp_ai_checks).toMatch(/names on your participant list/);
    expect(en.pp_ai_checks).toMatch(/common first names/);
    expect(en.pp_ai_checks).toMatch(/cannot find every name/);
    expect(body).not.toContain("cannot find a name written inside a sentence");
  });

  // The sentence is chosen by what ran (R54b): it never claims a check that did not.
  it.each([
    ["the list only (a literature request in a project with a list)", { list: true, firstNames: false }, "pp_ai_checks_list", true, false],
    ["common first names only (a project with no list)", { list: false, firstNames: true }, "pp_ai_checks_first", false, true],
    ["neither (a literature request with no list)", { list: false, firstNames: false }, "pp_ai_checks_none", false, false]
  ] as const)("%s", async (_why, checked, key, list, first) => {
    await open(scan({ listed: 0, maybe: [], locked: false }, EMAIL, checked));
    const body = text("pd-dialog")!;
    const sentence = (en as Record<string, string>)[key]!;
    expect(body).toContain(sentence);
    expect(body).not.toContain(en.pp_ai_checks);
    expect(/participant list/.test(sentence)).toBe(list);
    expect(/first names/.test(sentence)).toBe(first);
    expect(sentence).toMatch(/email addresses, phone numbers/);
    expect(sentence).toMatch(/read the text once yourself/);
  });

  it("outside a project, or with the list locked, it says only what the check always finds", async () => {
    await open(scan());
    expect(text("pd-dialog")).toContain(en.pp_ai_checks_none);
    expect(text("pd-dialog")).not.toMatch(/participant list|first names/);
    await click("pd-cancel");
    await open(scan({ listed: 0, maybe: [], locked: true }, EMAIL, { list: false, firstNames: false }));
    expect(text("pd-dialog")).toContain(en.pp_ai_checks_none);
    expect(text("pd-dialog")).not.toContain(en.pp_ai_checks);
  });

  it("explains Mask for names only when there are names", async () => {
    await open(scan());
    expect($("pd-mask-note")).toBeNull();
    await click("pd-cancel");
    await open(scan({ listed: 1, maybe: [], locked: false }));
    expect(text("pd-mask-note")).toBe(en.pp_ai_mask_note);
  });
});

describe("the three answers", () => {
  it.each([["pd-mask", "mask"], ["pd-send", "send"], ["pd-cancel", "cancel"]] as const)("%s resolves %s with nothing left", async (id, answer) => {
    const o = await open(scan());
    await click(id);
    expect(await o.answer).toEqual({ answer, leave: [] });
    await sleep();
    expect($("pd-dialog")).toBeNull();
  });

  it("opening another request while one is open cancels the first", async () => {
    const first = await open(scan());
    await open(scan());
    expect(await first.answer).toEqual({ answer: "cancel", leave: [] });
  });
});
