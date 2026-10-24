// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Task 8: the Participants tab's actions (spec 2026-10-24-participants-design.md §5 "Withdraw", "Copy as table", "Download the list", "Destroy the list", "Anonymous" and the switch
 * "Highlight names in my documents"; calls C7, C9, C15 and C16; rulings R18 and R25). The harness is Task 6's: the blob client is a stand-in (a store, flags and a record of every value
 * set), so useParticipants and useDesign run for real over it; the vault is a stand-in; the clipboard, the download and the project are stand-ins too. Names are in the page for the
 * student; none goes to a toast, the console, an address or a browser dialog (checked after every test).
 */

const h = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  flags: {} as Record<string, { loading?: boolean; locked?: boolean; broken?: boolean; error?: boolean; readOnly?: boolean }>,
  listeners: new Set<() => void>(),
  written: [] as Array<{ kind: string; value: unknown }>,
  status: "unlocked" as string,
  toast: vi.fn(),
  /** Every file the tab asked the browser to save. */
  downloads: [] as Array<{ name: string; blob: Blob }>,
  project: { id: "p1", title: "Class 9 study", titleKeyVersion: 0 } as { id: string; title: string; titleKeyVersion: number } | null
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const React = await import("react");
  return {
    useProjectBlob: (kind: string, id: string | null) => {
      const [, bump] = React.useState(0);
      React.useEffect(() => { const l = () => bump((n) => n + 1); h.listeners.add(l); return () => { h.listeners.delete(l); }; }, []);
      const set = React.useCallback((next: unknown) => {
        if (h.flags[kind]?.readOnly) return;
        const v = typeof next === "function" ? (next as (p: unknown) => unknown)(h.store[kind] ?? null) : next;
        h.store[kind] = v;
        h.written.push({ kind, value: JSON.parse(JSON.stringify(v)) });
        for (const l of h.listeners) l();
      }, [kind]);
      const flush = React.useCallback(async () => true, []);
      if (id === null) return { value: null, loading: false, locked: false, set: () => {}, flush, readOnly: false };
      const f = h.flags[kind] ?? {};
      return {
        value: f.locked || f.loading ? null : (h.store[kind] ?? null),
        loading: !!f.loading, locked: !!f.locked, broken: f.broken, error: f.error, version: 1, set, flush, readOnly: !!f.readOnly
      };
    }
  };
});
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: h.status, ensureUnlocked: async () => true }) }));
vi.mock("@/components/workspace/dialogs/VaultSetup", () => ({ openVaultSetup: async () => false }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: h.project, projectId: h.project?.id ?? null }) }));
vi.mock("@/lib/export/download", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/export/download")>()), downloadBlob: (name: string, blob: Blob) => { h.downloads.push({ name, blob }); } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/collect/participants" }));

import { Panel } from "../components/tools/participants/Panel";
import { emptyList, type Participant, type ParticipantList } from "../lib/blobs/kinds/participants";
import en from "../messages/tools/participants.en.json";
import hi from "../messages/tools/participants.hi.json";
import { resetLists } from "../lib/tools/participants/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- Helpers ------------------------------------------------------------------------------------------------------------------------------------------

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (prefix: string) => Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`));
const text = (id: string) => $(id)?.textContent ?? null;
const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
// An async act, so a promise the click starts (the clipboard's) settles inside it.
const click = (id: string | HTMLElement) => act(async () => { (typeof id === "string" ? $(id)! : id).click(); });
function setValue(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
const type = (id: string, value: string) => act(() => { setValue($(id)!, value); });
const val = (id: string) => ($(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? null;
const checked = (id: string) => ($(id) as HTMLInputElement | null)?.checked ?? null;

async function mount(): Promise<void> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab="participants" projectId="p1" />); });
  await tick();
}

/** Takes the tab down, so the next mount reads the stand-ins afresh. */
async function unmountAll(): Promise<void> {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
}

const person = (o: Partial<Participant> & { code: string; name: string }): Participant => ({ id: "id-" + o.code, spellings: [], everyday: [], joined: "2026-10-02", about: {}, ...o });
const FIVE: Participant[] = [
  person({ code: "P001", name: "Priya Sharma", spellings: ["Priya", "प्रिया"], consentHow: "written", guardian: true, assent: true, about: { age: "14", gender: "Girl", year: "9-B" } }),
  person({ code: "P002", name: "Rahul Verma", spellings: ["Rahul"], consentHow: "written", guardian: true, assent: false, about: { age: "15", gender: "Boy", year: "9-B" } }),
  person({ code: "P003", name: "Asha Kumari", spellings: ["Asha"], everyday: ["Asha"], joined: "2026-10-03", consentHow: "written", guardian: true, assent: true, about: { age: "14", gender: "Girl", year: "9-A" } }),
  person({ code: "P004", name: "Mohd. Imran", spellings: ["Imran"], joined: "2026-10-03", consentHow: "written", guardian: true, assent: true, about: { age: "15", gender: "Boy", year: "9-A" }, withdrawn: { on: "2026-10-15", data: "remove" } }),
  person({ code: "P005", name: "Kiran Rao", spellings: ["Kiran"], joined: "2026-10-04", consentHow: "written", guardian: true, assent: true, about: { age: "14", gender: "Boy", year: "9-A" } })
];
const list = (people: Participant[] = FIVE, next = people.length + 1): ParticipantList => ({ v: 1, next, people, notNames: [] });
const PLAN = { idMode: "codes", record: ["name", "spellings", "age", "gender", "year"], minors: "yes" };
const seed = (plan: Record<string, unknown> | null, l: ParticipantList | null = list()) => {
  if (plan) h.store.design_ec = plan;
  if (l) h.store.participants = l;
};
const stored = () => h.store.participants as ParticipantList;
const written = () => h.written.filter((w) => w.kind === "participants");
const lastWritten = () => (written().at(-1)?.value ?? null) as ParticipantList;
const byCode = (l: ParticipantList, code: string) => l.people.find((p) => p.code === code)!;
const NAMES = /Priya|Rahul|Asha|Imran|Kiran|Sunita|Meena|प्रिया/;

/** The bytes of a saved file, and its text with the byte-order mark left in. */
const bytesOf = (blob: Blob) => new Promise<Uint8Array>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(new Uint8Array(r.result as ArrayBuffer));
  r.onerror = () => rej(r.error);
  r.readAsArrayBuffer(blob);
});
const fileText = async (blob: Blob) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await bytesOf(blob));

let clip: ReturnType<typeof vi.fn>;
let confirmSpy: ReturnType<typeof vi.spyOn>;
let alertSpy: ReturnType<typeof vi.spyOn>;
let promptSpy: ReturnType<typeof vi.spyOn>;
let consoleSpies: Array<ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  h.store = {};
  h.flags = {};
  h.written = [];
  h.downloads = [];
  h.status = "unlocked";
  h.project = { id: "p1", title: "Class 9 study", titleKeyVersion: 0 };
  h.toast.mockClear();
  resetLists();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 24, 12, 0, 0));
  clip = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText: clip }, configurable: true });
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(async () => {
  // No name goes to a toast or a console line, and no browser dialog is used (the Destroy dialog is in the page).
  expect(h.toast).not.toHaveBeenCalled();
  for (const s of consoleSpies) expect(JSON.stringify(s.mock.calls)).not.toMatch(NAMES);
  expect(consoleSpies[3]!.mock.calls, "console.error").toEqual([]);
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(promptSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  delete (navigator as { clipboard?: unknown }).clipboard;
});

// ---- Withdraw (in Edit) -------------------------------------------------------------------------------------------------------------------------------

describe("Withdraw, in Edit", () => {
  it("Edit has a Withdraw part: a date that starts as today, 'Remove their data' or 'Keep what was collected', and a plain line to check the consent form", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P001");
    const box = $("pp-withdraw-box")!;
    expect(box).not.toBeNull();
    expect(box.contains($("pp-withdraw"))).toBe(true);
    expect(val("pp-withdraw-date")).toBe("2026-10-24");
    const opts = Array.from($("pp-withdraw-data")!.querySelectorAll("option")).map((o) => [o.value, o.textContent]);
    expect(opts).toEqual([["remove", "Remove their data"], ["keep", "Keep what was collected"]]);
    expect(box.textContent).toContain("Check what your consent form says you may do with the data of a person who withdraws.");
    // Nothing is withdrawn, so there is nothing to undo; and Add has no Withdraw part.
    expect($("pp-unwithdraw")).toBeNull();
    await click("pp-form-cancel");
    await click("pp-add");
    expect($("pp-withdraw-box")).toBeNull();
    expect(written()).toEqual([]);
  });

  it("Withdraw with a date and 'Remove their data': the row is greyed and tagged 'Withdrew 15/10/2026 · remove their data', the code is kept, the count goes up", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P001");
    await type("pp-withdraw-date", "2026-10-15");
    await type("pp-withdraw-data", "remove");
    await click("pp-withdraw");
    expect(written()).toHaveLength(1);
    expect(byCode(lastWritten(), "P001").withdrawn).toEqual({ on: "2026-10-15", data: "remove" });
    const row = $("pp-row-P001")!;
    expect(row.getAttribute("data-withdrawn")).toBe("true");
    expect(row.textContent).toContain("Withdrew 15/10/2026 · remove their data");
    expect(row.textContent).toContain("P001");
    expect(byCode(lastWritten(), "P001")).toMatchObject({ code: "P001", name: "Priya Sharma", spellings: ["Priya", "प्रिया"] });
    expect(lastWritten().people).toHaveLength(5);
    expect(lastWritten().next).toBe(6);
    expect(text("pp-count")).toBe("5 people · 2 withdrawn · 1 consent not complete");
    // The form is closed and the page says so.
    expect($("pp-form")).toBeNull();
    expect(text("pp-status")).toContain("P001");
  });

  it("'Keep what was collected' is tagged 'keep their data'", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P003");
    await type("pp-withdraw-date", "2026-10-20");
    await type("pp-withdraw-data", "keep");
    await click("pp-withdraw");
    expect(byCode(lastWritten(), "P003").withdrawn).toEqual({ on: "2026-10-20", data: "keep" });
    expect($("pp-row-P003")!.textContent).toContain("Withdrew 20/10/2026 · keep their data");
  });

  it("with the date left as it started, the withdrawal is dated today; with the date emptied it is dated today too", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P001");
    await click("pp-withdraw");
    expect(byCode(lastWritten(), "P001").withdrawn).toEqual({ on: "2026-10-24", data: "remove" });
    await click("pp-edit-P005");
    await type("pp-withdraw-date", "");
    await click("pp-withdraw");
    expect(byCode(lastWritten(), "P005").withdrawn).toEqual({ on: "2026-10-24", data: "remove" });
  });

  it("a withdrawn person's row has Edit again (and the tag), and Edit shows their withdrawal and offers to undo it", async () => {
    seed(PLAN);
    await mount();
    expect($("pp-row-P004")!.textContent).toContain("Withdrew 15/10/2026 · remove their data");
    expect($("pp-edit-P004")).not.toBeNull();
    await click("pp-edit-P004");
    expect(val("pp-withdraw-date")).toBe("2026-10-15");
    expect(val("pp-withdraw-data")).toBe("remove");
    expect($("pp-withdraw-box")!.textContent).toContain("Withdrew 15/10/2026 · remove their data");
    expect($("pp-unwithdraw")).not.toBeNull();
  });

  it("a withdrawn person can be put back: the withdrawal is gone (no empty key), the row is no longer greyed, the code and the rest are kept", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P004");
    await click("pp-unwithdraw");
    expect(written()).toHaveLength(1);
    expect("withdrawn" in byCode(lastWritten(), "P004")).toBe(false);
    expect(byCode(lastWritten(), "P004")).toMatchObject({ code: "P004", name: "Mohd. Imran", spellings: ["Imran"] });
    expect($("pp-row-P004")!.getAttribute("data-withdrawn")).toBeNull();
    expect($("pp-row-P004")!.textContent).not.toContain("Withdrew");
    expect(text("pp-count")).toBe("5 people · 1 consent not complete");
  });

  it("a withdrawal can be changed: the choice and the date, saved with the same button", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P004");
    await type("pp-withdraw-data", "keep");
    await type("pp-withdraw-date", "2026-10-18");
    await click("pp-withdraw");
    expect(byCode(lastWritten(), "P004").withdrawn).toEqual({ on: "2026-10-18", data: "keep" });
    expect($("pp-row-P004")!.textContent).toContain("Withdrew 18/10/2026 · keep their data");
  });

  it("Save (the button, and Enter in a field) keeps a changed withdrawal: the data choice and the date are not lost (R32)", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P004");
    await type("pp-withdraw-data", "keep");
    await click("pp-form-save");
    expect(written()).toHaveLength(1);
    expect(byCode(lastWritten(), "P004").withdrawn).toEqual({ on: "2026-10-15", data: "keep" });
    expect($("pp-row-P004")!.textContent).toContain("Withdrew 15/10/2026 · keep their data");
    await click("pp-edit-P004");
    await type("pp-withdraw-date", "2026-10-18");
    await act(async () => { $("pp-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(written()).toHaveLength(2);
    expect(byCode(lastWritten(), "P004").withdrawn).toEqual({ on: "2026-10-18", data: "keep" });
    expect($("pp-row-P004")!.textContent).toContain("Withdrew 18/10/2026 · keep their data");
  });

  it("Save leaves a withdrawal that was not touched as it was, and does not withdraw someone who has not (the box is only a withdrawal once Withdraw is pressed)", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P004");
    await click("pp-form-save");
    expect(byCode(lastWritten(), "P004").withdrawn).toEqual({ on: "2026-10-15", data: "remove" });
    await click("pp-edit-P001");
    await type("pp-withdraw-date", "2026-10-20");
    await type("pp-withdraw-data", "keep");
    await click("pp-form-save");
    expect("withdrawn" in byCode(lastWritten(), "P001")).toBe(false);
    expect($("pp-row-P001")!.getAttribute("data-withdrawn")).toBeNull();
  });

  it("what was typed in the form goes with the withdrawal (it is not lost), and a missing name stops it", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P001");
    await type("pp-form-name", "");
    await click("pp-withdraw");
    expect(text("pp-form-error")).toContain("Type their name.");
    expect(written()).toEqual([]);
    await type("pp-form-name", "Priya S. Sharma");
    await type("pp-form-age", "15");
    await click("pp-withdraw");
    expect(byCode(lastWritten(), "P001")).toMatchObject({ name: "Priya S. Sharma", about: { age: "15", gender: "Girl", year: "9-B" }, withdrawn: { on: "2026-10-24", data: "remove" } });
  });

  it("a window that may not write says so and changes nothing", async () => {
    seed(PLAN);
    h.flags.participants = { readOnly: true };
    await mount();
    await click("pp-edit-P001");
    await click("pp-withdraw");
    expect(text("pp-form-error")).toContain("You can change the list in the Collection and analysis window.");
    expect(written()).toEqual([]);
    expect($("pp-row-P001")!.getAttribute("data-withdrawn")).toBeNull();
  });

  it("a withdrawn person's consent is no longer in question (the amber goes with the withdrawal)", async () => {
    seed(PLAN);
    await mount();
    expect($("pp-flag-P002")).not.toBeNull();
    await click("pp-edit-P002");
    await click("pp-withdraw");
    expect($("pp-flag-P002")).toBeNull();
  });
});

// ---- Copy as table ------------------------------------------------------------------------------------------------------------------------------------

describe("Copy as table (codes, no names)", () => {
  it("puts a tab-separated table of the codes and the about-them columns on the clipboard, and says Copied in the page", async () => {
    seed(PLAN);
    await mount();
    expect(text("pp-copy")).toContain("Copy as table (codes, no names)");
    await click("pp-copy");
    await tick();
    expect(clip).toHaveBeenCalledTimes(1);
    expect(clip.mock.calls[0]![0]).toBe(
      ["Code\tAge\tGender\tYear or class", "P001\t14\tGirl\t9-B", "P002\t15\tBoy\t9-B", "P003\t14\tGirl\t9-A", "P004\t15\tBoy\t9-A", "P005\t14\tBoy\t9-A"].join("\n")
    );
    expect(text("pp-copy-status")).toContain("Copied");
    expect(written()).toEqual([]);
  });

  it("never carries a name, a spelling, a contact or a roll number", async () => {
    seed({ ...PLAN, record: ["name", "spellings", "contact", "roll", "age"] }, list(FIVE.map((p) => ({ ...p, contact: "98" + p.code, roll: "R" + p.code }))));
    await mount();
    await click("pp-copy");
    await tick();
    const out = clip.mock.calls[0]![0] as string;
    expect(out.split("\n")[0]).toBe("Code\tAge");
    expect(out).not.toMatch(NAMES);
    expect(out).not.toMatch(/98P00|RP00|contact|roll/i);
  });

  it("in made-up names mode the made-up name is the second column; still no real name", async () => {
    seed({ idMode: "pseudonyms", record: ["name", "spellings", "age"], minors: "no" }, list(FIVE.map((p, i) => ({ ...p, pseudonym: "Alias" + (i + 1) }))));
    await mount();
    await click("pp-copy");
    await tick();
    const out = clip.mock.calls[0]![0] as string;
    expect(out.split("\n")[0]).toBe("Code\tMade-up name\tAge");
    expect(out.split("\n")[1]).toBe("P001\tAlias1\t14");
    expect(out).not.toMatch(NAMES);
  });

  it("a clipboard that is not there, or refuses, says so in the page and not in a toast", async () => {
    seed(PLAN);
    await mount();
    delete (navigator as { clipboard?: unknown }).clipboard;
    await click("pp-copy");
    await tick();
    expect(text("pp-copy-status")).toContain("Could not copy");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
    await click("pp-copy");
    await tick();
    expect(text("pp-copy-status")).toContain("Could not copy");
  });

  it("the 'Copied' line goes when the list changes: it would speak of a table that is no longer the list's", async () => {
    seed(PLAN);
    await mount();
    await click("pp-copy");
    await tick();
    expect($("pp-copy-status")).not.toBeNull();
    await click("pp-edit-P001");
    await type("pp-form-age", "15");
    await click("pp-form-save");
    expect($("pp-copy-status")).toBeNull();
  });

  it("is on a list that has people, and not on an empty one", async () => {
    seed(PLAN, list([]));
    await mount();
    expect($("pp-copy")).toBeNull();
    expect($("pp-download")).toBeNull();
    expect($("pp-destroy")).toBeNull();
  });
});

// ---- Download the list --------------------------------------------------------------------------------------------------------------------------------

describe("Download the list", () => {
  it("saves participant-list-<project title>.csv, UTF-8 with a byte-order mark, with every field of everyone on the list", async () => {
    seed(PLAN, list(FIVE.map((p) => (p.code === "P001" ? { ...p, contact: "priya@example.org", roll: "17" } : p))));
    await mount();
    await click("pp-download");
    expect(h.downloads).toHaveLength(1);
    const { name, blob } = h.downloads[0]!;
    expect(name).toBe("participant-list-Class 9 study.csv");
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const bytes = await bytesOf(blob);
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = (await fileText(blob)).replace(/^\uFEFF/, "");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe("ParticipantCode,Name,Other spellings,Also an everyday word,Joined,How they agreed,Under 18,Parent's permission,Own agreement,Contact,Roll,Made-up name,Age,Gender,Year or class,Withdrew on,Their data");
    expect(lines[1]).toBe("P001,Priya Sharma,Priya; प्रिया,,2026-10-02,written,,yes,yes,priya@example.org,17,,14,Girl,9-B,,");
    expect(lines[3]).toContain("Asha");
    expect(lines[4]).toBe("P004,Mohd. Imran,Imran,,2026-10-03,written,,yes,yes,,,,15,Boy,9-A,2026-10-15,remove");
    for (const n of ["Rahul Verma", "Asha Kumari", "Kiran Rao"]) expect(csv).toContain(n);
  });

  it("says 'This file holds names. Keep it apart from your data.' beside the button", async () => {
    seed(PLAN);
    await mount();
    const note = $("pp-download-note")!;
    expect(note.textContent).toBe("This file holds names. Keep it apart from your data.");
    expect(note.parentElement!.contains($("pp-download"))).toBe(true);
    // The line is there before the file is saved, not after.
    expect(h.downloads).toEqual([]);
  });

  it("the file's name is made safe: letters, digits, spaces and hyphens; the rest removed; an empty title is 'project'", async () => {
    seed(PLAN);
    h.project = { id: "p1", title: ' Sleep & exams: "pilot" / 2026-27? ', titleKeyVersion: 0 };
    await mount();
    await click("pp-download");
    expect(h.downloads[0]!.name).toBe("participant-list-Sleep exams pilot 2026-27.csv");
    await unmountAll();
    h.project = { id: "p1", title: "?*/", titleKeyVersion: 0 };
    await mount();
    await click("pp-download");
    expect(h.downloads[1]!.name).toBe("participant-list-project.csv");
  });

  it("a plan that has moved on does not leave a field out of the file: a value still stored has its column", async () => {
    seed({ ...PLAN, record: ["name", "spellings", "age"] });
    await mount();
    await click("pp-download");
    const head = (await fileText(h.downloads[0]!.blob)).replace(/^\uFEFF/, "").split("\n")[0]!.split(",");
    expect(head).toEqual(expect.arrayContaining(["Age", "Gender", "Year or class"]));
  });

  it("writes nothing to the list, and works in a window that may not write", async () => {
    seed(PLAN);
    h.flags.participants = { readOnly: true };
    await mount();
    await click("pp-download");
    expect(h.downloads).toHaveLength(1);
    expect(written()).toEqual([]);
  });

  it("the download pastes back: the codes, the names and the other spellings come back the same in an empty list", async () => {
    seed(PLAN);
    await mount();
    await click("pp-download");
    const csv = await fileText(h.downloads[0]!.blob);
    await unmountAll();
    h.store.participants = emptyList();
    resetLists();
    h.written = [];
    await mount();
    await click("pp-paste");
    await type("pp-paste-box", csv);
    await click("pp-paste-go");
    const back = lastWritten();
    expect(back.people.map((p) => p.code)).toEqual(FIVE.map((p) => p.code));
    expect(back.people.map((p) => p.name)).toEqual(FIVE.map((p) => p.name));
    expect(back.people.map((p) => p.spellings)).toEqual(FIVE.map((p) => p.spellings));
    expect(back.next).toBe(6);
  });
});

// ---- Destroy the list ---------------------------------------------------------------------------------------------------------------------------------

describe("Destroy the list", () => {
  const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

  it("opens an in-page dialog (never confirm()); nothing is written until the second press", async () => {
    seed(PLAN);
    await mount();
    expect(dialog()).toBeNull();
    await click("pp-destroy");
    expect(dialog()).not.toBeNull();
    expect($("pp-destroy-1")).not.toBeNull();
    expect($("pp-destroy-2")).toBeNull();
    expect(written()).toEqual([]);
    await click("pp-destroy-1");
    expect(written()).toEqual([]);
    expect($("pp-destroy-2")).not.toBeNull();
    expect(stored().people).toHaveLength(5);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("two presses destroy it: nobody left, only the next code number and the date; the tab says when, and that new people continue from the next code", async () => {
    seed(PLAN);
    await mount();
    await click("pp-destroy");
    await click("pp-destroy-1");
    await click("pp-destroy-2");
    expect(written()).toHaveLength(1);
    expect(lastWritten()).toEqual({ v: 1, next: 6, people: [], notNames: [], destroyedAt: "2026-10-24" });
    expect(dialog()).toBeNull();
    const msg = text("pp-destroyed")!;
    expect(msg).toContain("destroyed on 24/10/2026");
    expect(msg).toContain("P006");
    expect($("pp-table")).toBeNull();
    expect($("pp-count")).toBeNull();
    expect(document.body.textContent).not.toMatch(NAMES);
    expect($("pp-add")).not.toBeNull();
  });

  it("Cancel at the first step or the second changes nothing, and opening it again starts at the first step", async () => {
    seed(PLAN);
    await mount();
    await click("pp-destroy");
    await click("pp-destroy-cancel");
    expect(dialog()).toBeNull();
    await click("pp-destroy");
    await click("pp-destroy-1");
    expect($("pp-destroy-2")).not.toBeNull();
    await click("pp-destroy-cancel");
    expect(dialog()).toBeNull();
    await click("pp-destroy");
    expect($("pp-destroy-1")).not.toBeNull();
    expect($("pp-destroy-2")).toBeNull();
    expect(written()).toEqual([]);
    expect(stored().people).toHaveLength(5);
  });

  it("the next person added gets the next code, not P001, and the 'destroyed' line goes (R18)", async () => {
    seed(PLAN);
    await mount();
    await click("pp-destroy");
    await click("pp-destroy-1");
    await click("pp-destroy-2");
    expect($("pp-destroyed")).not.toBeNull();
    await click("pp-add");
    expect(text("pp-form")).toContain("the next code is P006");
    await type("pp-form-name", "Sunita Devi");
    await click("pp-form-save");
    expect(lastWritten().people.map((p) => p.code)).toEqual(["P006"]);
    expect(lastWritten().next).toBe(7);
    expect("destroyedAt" in lastWritten()).toBe(false);
    expect($("pp-destroyed")).toBeNull();
  });

  it("a save that is refused keeps the dialog open and says so in it; nothing is destroyed", async () => {
    seed(PLAN);
    h.flags.participants = { readOnly: true };
    await mount();
    await click("pp-destroy");
    await click("pp-destroy-1");
    await click("pp-destroy-2");
    expect(dialog()).not.toBeNull();
    expect(text("pp-destroy-error")).toContain("You can change the list in the Collection and analysis window.");
    expect(written()).toEqual([]);
    expect($("pp-destroyed")).toBeNull();
    expect(stored().people).toHaveLength(5);
  });

  it("the second step puts Cancel where the first step's Destroy was, with the focus on it: a double click cannot destroy the list", async () => {
    seed(PLAN);
    await mount();
    await click("pp-destroy");
    const order = () => Array.from(dialog()!.querySelectorAll<HTMLElement>("button[data-testid]")).map((b) => b.dataset.testid);
    expect(order()).toEqual(["pp-destroy-cancel", "pp-destroy-1"]);
    await click("pp-destroy-1");
    await tick();
    expect(order()).toEqual(["pp-destroy-2", "pp-destroy-cancel"]);
    expect(document.activeElement).toBe($("pp-destroy-cancel"));
  });

  it("focus goes back to the Destroy button on Cancel, and to Add a person once the list is destroyed", async () => {
    seed(PLAN);
    await mount();
    await act(async () => { $("pp-destroy")!.focus(); });
    await click("pp-destroy");
    await click("pp-destroy-cancel");
    await tick(20);
    expect(document.activeElement).toBe($("pp-destroy"));
    await click("pp-destroy");
    await click("pp-destroy-1");
    await click("pp-destroy-2");
    await tick(20);
    expect(document.activeElement).toBe($("pp-add"));
    // The dialog left nothing behind on the page: the page is not locked or hidden from a screen reader.
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(document.querySelectorAll("[data-aria-hidden]").length).toBe(0);
  });

  it("the two buttons of both steps are the same width at every breakpoint (a double click on step 1's button lands on a button of the same size, in the other place)", async () => {
    seed(PLAN);
    await mount();
    await click("pp-destroy");
    const widths = () => ["pp-destroy-cancel", "pp-destroy-1", "pp-destroy-2"].map((id) => $(id)).filter(Boolean).map((b) => b!.className);
    for (const cls of widths()) {
      expect(cls).toContain("w-full");
      expect(cls).toContain("sm:w-52");
    }
    await click("pp-destroy-1");
    expect(widths()).toHaveLength(2);
    for (const cls of widths()) {
      expect(cls).toContain("w-full");
      expect(cls).toContain("sm:w-52");
    }
  });

  it("the text above the buttons keeps its room in both steps (the other step's text is there, hidden from a screen reader), so the dialog does not change size", async () => {
    seed(PLAN);
    await mount();
    await click("pp-destroy");
    const d = dialog()!;
    const describedBy = () => document.getElementById(d.getAttribute("aria-describedby")!)!.textContent;
    const room = () => $("pp-destroy-room")!;
    expect(describedBy()).toBe(en.pp_destroy_desc1);
    expect(room().textContent).toBe(en.pp_destroy_desc2);
    expect(room().getAttribute("aria-hidden")).toBe("true");
    expect(room().className).toContain("invisible");
    await click("pp-destroy-1");
    expect(describedBy()).toBe(en.pp_destroy_desc2);
    expect(room().textContent).toBe(en.pp_destroy_desc1);
    expect(room().getAttribute("aria-hidden")).toBe("true");
    expect(d.querySelectorAll("[data-slot='dialog-description']")).toHaveLength(1);
  });

  it("the dialog has a title and a description, for a screen reader", async () => {
    seed(PLAN);
    await mount();
    await click("pp-destroy");
    const d = dialog()!;
    expect(d.getAttribute("aria-labelledby")).toBeTruthy();
    expect(d.getAttribute("aria-describedby")).toBeTruthy();
    expect(d.textContent).toContain("Destroy the list");
  });

  it("an empty list that was never destroyed says nothing about destruction", async () => {
    seed(PLAN, list([]));
    await mount();
    expect($("pp-destroyed")).toBeNull();
  });
});

// ---- The plan has moved on (C15) ----------------------------------------------------------------------------------------------------------------------

describe("when the plan no longer records what is stored (C15)", () => {
  const withContact = (n: number) => list(FIVE.map((p, i) => (i < n ? { ...p, contact: "98" + p.code } : p)));

  it("says 'Contact is still stored for 3 people, but your plan no longer records it.' with 'Remove these values'", async () => {
    seed(PLAN, withContact(3));
    await mount();
    expect($("pp-plan-drift")).not.toBeNull();
    expect(text("pp-drift-contact")).toContain("Contact is still stored for 3 people, but your plan no longer records it.");
    expect(text("pp-drift-clear-contact")).toBe("Remove these values");
    expect(written()).toEqual([]);
  });

  it("'Remove these values' clears that field for everyone in one save, keeps everything else, and the line goes", async () => {
    seed(PLAN, withContact(3));
    await mount();
    await click("pp-drift-clear-contact");
    expect(written()).toHaveLength(1);
    for (const p of lastWritten().people) expect("contact" in p, p.code).toBe(false);
    expect(lastWritten().people.map((p) => p.name)).toEqual(FIVE.map((p) => p.name));
    expect(byCode(lastWritten(), "P001").about).toEqual({ age: "14", gender: "Girl", year: "9-B" });
    expect($("pp-plan-drift")).toBeNull();
    expect($("pp-drift-contact")).toBeNull();
  });

  it("one person is 'one person'; a field the plan ticks has no line; a value that is blank is not stored", async () => {
    seed(PLAN, list(FIVE.map((p, i) => (i === 0 ? { ...p, roll: "17" } : i === 1 ? { ...p, roll: " " } : p))));
    await mount();
    expect(text("pp-drift-roll")).toContain("Roll is still stored for 1 person, but your plan no longer records it.");
    expect($("pp-drift-contact")).toBeNull();
    seed({ ...PLAN, record: [...PLAN.record, "roll"] });
    await unmountAll();
    await mount();
    expect($("pp-plan-drift")).toBeNull();
  });

  it("an about-them field named as the Ethics tab names it, and one the student added by its label", async () => {
    seed({ ...PLAN, record: ["name", "spellings", "age"] });
    h.store.participants = list(FIVE.map((p, i) => ({ ...p, about: { ...p.about, ...(i < 2 ? { caste: "OBC" } : {}), ...(i < 4 ? { "Hostel block": "B" } : {}) } })));
    await mount();
    expect(text("pp-drift-gender")).toContain("Gender is still stored for 5 people, but your plan no longer records it.");
    expect(text("pp-drift-year")).toContain("Year or class is still stored for 5 people");
    expect(text("pp-drift-caste")).toContain("Caste or category is still stored for 2 people");
    expect(text("pp-drift-Hostel block")).toContain("Hostel block is still stored for 4 people");
    await click("pp-drift-clear-caste");
    expect(written()).toHaveLength(1);
    expect(byCode(lastWritten(), "P001").about).toEqual({ age: "14", gender: "Girl", year: "9-B", "Hostel block": "B" });
    expect($("pp-drift-caste")).toBeNull();
    expect($("pp-drift-gender")).not.toBeNull();
  });

  it("the other spellings the plan no longer ticks, and a made-up name the plan no longer uses, are lines too", async () => {
    seed({ idMode: "codes", record: ["name", "age", "gender", "year"], minors: "yes" }, list(FIVE.map((p, i) => (i < 2 ? { ...p, pseudonym: "Alias" } : p))));
    await mount();
    expect(text("pp-drift-spellings")).toContain("Other spellings and short names are still stored for 5 people, but your plan no longer records them.");
    expect(text("pp-drift-pseudonym")).toContain("Made-up name is still stored for 2 people, but your plan no longer records it.");
    await click("pp-drift-clear-spellings");
    expect(lastWritten().people.map((p) => p.spellings)).toEqual([[], [], [], [], []]);
    expect($("pp-drift-spellings")).toBeNull();
  });

  it("'Remove these values' closes an open Edit form, so the form cannot write the cleared values back (R32)", async () => {
    seed(PLAN, withContact(3));
    await mount();
    await click("pp-edit-P001");
    expect($("pp-form")).not.toBeNull();
    await click("pp-drift-clear-contact");
    expect($("pp-form")).toBeNull();
    expect(written()).toHaveLength(1);
    for (const p of lastWritten().people) expect("contact" in p, p.code).toBe(false);
    // Nothing is written afterwards by the form that was open, and the page says what was removed.
    expect(text("pp-status")).toContain("Removed Contact for everyone.");
  });

  it("an open Add form is left open by 'Remove these values' (it holds nothing that could write a cleared value back)", async () => {
    seed(PLAN, withContact(3));
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Sunita Devi");
    await click("pp-drift-clear-contact");
    expect($("pp-form")).not.toBeNull();
    expect(val("pp-form-name")).toBe("Sunita Devi");
  });

  it("a refused 'Remove these values' leaves an open Edit form open", async () => {
    seed(PLAN, withContact(3));
    h.flags.participants = { readOnly: true };
    await mount();
    await click("pp-edit-P001");
    await click("pp-drift-clear-contact");
    expect($("pp-form")).not.toBeNull();
    expect(written()).toEqual([]);
  });

  it("an unanswered plan or one that could not be read says nothing is drifting (it must not invite a clean-up)", async () => {
    seed(null, withContact(3));
    await mount();
    expect($("pp-plan-drift")).toBeNull();
    await unmountAll();
    h.flags.design_ec = { error: true };
    await mount();
    expect($("pp-plan-drift")).toBeNull();
  });

  it("a save that is refused says so and removes nothing", async () => {
    seed(PLAN, withContact(3));
    h.flags.participants = { readOnly: true };
    await mount();
    await click("pp-drift-clear-contact");
    expect(written()).toEqual([]);
    expect(text("pp-plan-drift")).toContain("You can change the list in the Collection and analysis window.");
    expect($("pp-drift-contact")).not.toBeNull();
  });
});

describe("an anonymous plan with people on the list (C15)", () => {
  const ANON = { idMode: "anonymous", record: ["age"], minors: "no" };

  it("shows the list, not only the anonymous line, with the note to destroy it or change the plan back", async () => {
    seed(ANON);
    await mount();
    expect(text("pp-plan-drift")).toContain("Your plan now says anonymous, but a list of 5 people is stored. Destroy the list, or change the plan back.");
    expect($("pp-anonymous")).toBeNull();
    expect($("pp-table")).not.toBeNull();
    expect($("pp-row-P001")).not.toBeNull();
    expect($("pp-destroy")).not.toBeNull();
    expect($("pp-download")).not.toBeNull();
    expect($("pp-plan-link")!.getAttribute("href")).toBe("/p/p1/design/ethics");
    // The plan line does not claim a way of knowing participants that the plan no longer has.
    expect(text("pp-plan")).toContain("anonymous");
    expect(written()).toEqual([]);
  });

  it("one person: 'a list of 1 person is stored'", async () => {
    seed(ANON, list(FIVE.slice(0, 1)));
    await mount();
    expect(text("pp-plan-drift")).toContain("a list of 1 person is stored");
  });

  it("no new people are added under an anonymous plan (no Add, no Paste), but a person can be edited and the list destroyed", async () => {
    seed(ANON);
    await mount();
    expect($("pp-add")).toBeNull();
    expect($("pp-paste")).toBeNull();
    expect($("pp-edit-P001")).not.toBeNull();
    await click("pp-destroy");
    await click("pp-destroy-1");
    await click("pp-destroy-2");
    expect(lastWritten().people).toEqual([]);
    // With nobody left the tab is the anonymous line again, and says the list was destroyed.
    expect($("pp-anonymous")).not.toBeNull();
    expect(text("pp-destroyed")).toContain("destroyed on 24/10/2026");
    expect($("pp-table")).toBeNull();
    expect($("pp-plan-drift")).toBeNull();
  });

  it("after destroying under an anonymous plan (there is no Add button) the focus is on a control that is there: the link to the plan (R32)", async () => {
    seed(ANON);
    await mount();
    await act(async () => { $("pp-destroy")!.focus(); });
    await click("pp-destroy");
    await click("pp-destroy-1");
    await click("pp-destroy-2");
    await tick(20);
    expect($("pp-anonymous")).not.toBeNull();
    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(document.body);
    expect(active.dataset.testid).toBe("pp-anonymous-link");
  });

  it("changing the plan back brings the ordinary tab, with Add", async () => {
    seed(ANON);
    await mount();
    await unmountAll();
    h.store.design_ec = { idMode: "codes", record: ["name", "spellings", "age", "gender", "year"], minors: "no" };
    await mount();
    expect($("pp-plan-drift")).toBeNull();
    expect($("pp-add")).not.toBeNull();
  });

  it("with nobody on the list (never made, or destroyed) it is still the one line", async () => {
    seed(ANON, list([]));
    await mount();
    expect(text("pp-anonymous")).toContain("Your plan says this study is anonymous, so no list is kept.");
    expect($("pp-plan-drift")).toBeNull();
    expect($("pp-table")).toBeNull();
    expect($("pp-destroyed")).toBeNull();
  });

  it("a list that cannot be read is not taken for an empty one: the tab says so, with Try again", async () => {
    seed(ANON, null);
    h.flags.participants = { error: true };
    await mount();
    expect($("pp-error")).not.toBeNull();
    expect($("pp-anonymous")).toBeNull();
  });
});

// ---- The switch ---------------------------------------------------------------------------------------------------------------------------------------

describe("the switch 'Highlight names in my documents' (C9)", () => {
  it("is on when the list does not say (absent is on); turning it off saves highlight: false, and on again saves true", async () => {
    seed(PLAN);
    await mount();
    const sw = $("pp-highlight") as HTMLInputElement;
    expect(sw).not.toBeNull();
    expect($("pp-highlight-label")!.textContent).toContain("Highlight names in my documents");
    expect(checked("pp-highlight")).toBe(true);
    await click("pp-highlight");
    expect(written()).toHaveLength(1);
    expect(lastWritten().highlight).toBe(false);
    expect(checked("pp-highlight")).toBe(false);
    await click("pp-highlight");
    expect(lastWritten().highlight).toBe(true);
    expect(checked("pp-highlight")).toBe(true);
    // Only the switch changed: the people and the counter are as they were.
    expect(lastWritten().people).toEqual(FIVE);
    expect(lastWritten().next).toBe(6);
  });

  it("starts off when the list says highlight: false", async () => {
    seed(PLAN, { ...list(), highlight: false });
    await mount();
    expect(checked("pp-highlight")).toBe(false);
  });

  it("a refused save leaves the switch where it was and says so", async () => {
    seed(PLAN);
    h.flags.participants = { readOnly: true };
    await mount();
    await click("pp-highlight");
    expect(written()).toEqual([]);
    expect(checked("pp-highlight")).toBe(true);
    expect(document.body.textContent).toContain("You can change the list in the Collection and analysis window.");
  });
});

// ---- Words --------------------------------------------------------------------------------------------------------------------------------------------

describe("the Hindi drafts", () => {
  it("every new English key has a Hindi draft with the same placeholders, and the draft marker is kept", () => {
    const E = en as Record<string, string>;
    const H = hi as Record<string, string>;
    expect(H.$draft).toMatch(/^DRAFT/);
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    const keys = Object.keys(E).filter((k) => /^pp_(withdraw|unwithdraw|copy|download|destroy|drift|highlight|plan_mode_anonymous|anonymous_note)/.test(k));
    expect(keys.length).toBeGreaterThan(25);
    for (const k of keys) {
      expect(H[k], k).toBeTruthy();
      expect(holes(H[k]!), k).toBe(holes(E[k]!));
    }
    expect(Object.keys(H).filter((k) => !k.startsWith("$") && !(k in E))).toEqual([]);
  });
});
