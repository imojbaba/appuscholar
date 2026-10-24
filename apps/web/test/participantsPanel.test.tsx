// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Task 6: the Participants tab, list, add, edit and paste (spec 2026-10-24-participants-design.md §5, calls C1, C2, C8 and C16; rulings R20, R21 and R24). The mockup's five people
 * (a Class 9 study: codes, "about them" age, gender and class, under 18 "yes") are the list; the plan is the design_ec blob. The blob client is a stand-in as in the Words and
 * Statistics panel tests (a store, flags for loading, locked, broken and error, and a record of every value set), so useParticipants and useDesign run for real over it. The vault
 * is a stand-in too: only its status matters here, and the set-up dialog is a spy. Names are in the page for the student; none goes to a toast, the console or an address.
 */

const h = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  flags: {} as Record<string, { loading?: boolean; locked?: boolean; broken?: boolean; error?: boolean; readOnly?: boolean }>,
  listeners: new Set<() => void>(),
  /** Every value ever handed to a blob's set(), after the update was applied: what would have gone to the server. */
  written: [] as Array<{ kind: string; value: unknown }>,
  flushed: [] as string[],
  /** Every blob a hook asked for with a project (a null project reads nothing and raises no passphrase prompt). */
  asked: [] as string[],
  status: "unlocked" as string,
  setup: vi.fn(async () => false),
  ensure: vi.fn(async () => true),
  toast: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const React = await import("react");
  return {
    useProjectBlob: (kind: string, id: string | null) => {
      const [, bump] = React.useState(0);
      React.useEffect(() => { const l = () => bump((n) => n + 1); h.listeners.add(l); return () => { h.listeners.delete(l); }; }, []);
      const set = React.useCallback((next: unknown) => {
        // A read-only window (a pop-out of another stage) sets nothing.
        if (h.flags[kind]?.readOnly) return;
        const v = typeof next === "function" ? (next as (p: unknown) => unknown)(h.store[kind] ?? null) : next;
        h.store[kind] = v;
        h.written.push({ kind, value: JSON.parse(JSON.stringify(v)) });
        for (const l of h.listeners) l();
      }, [kind]);
      const flush = React.useCallback(async () => { h.flushed.push(kind); return true; }, [kind]);
      if (id === null) return { value: null, loading: false, locked: false, set: () => {}, flush, readOnly: false };
      if (!h.asked.includes(kind)) h.asked.push(kind);
      const f = h.flags[kind] ?? {};
      return {
        value: f.locked || f.loading ? null : (h.store[kind] ?? null),
        loading: !!f.loading, locked: !!f.locked, broken: f.broken, error: f.error, version: 1, set, flush, readOnly: !!f.readOnly
      };
    }
  };
});
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: h.status, ensureUnlocked: h.ensure }) }));
vi.mock("@/components/workspace/dialogs/VaultSetup", () => ({ openVaultSetup: () => h.setup() }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1", title: "Class 9 study", titleKeyVersion: 0 }, projectId: "p1" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/collect/participants" }));

import { Panel } from "../components/tools/participants/Panel";
import * as participants from "../components/tools/participants";
import type { Participant, ParticipantList } from "../lib/blobs/kinds/participants";
import { dmy, todayIso } from "../lib/tools/participants/dates";
import { resetLists } from "../lib/tools/participants/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- Helpers ------------------------------------------------------------------------------------------------------------------------------------------

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (prefix: string) => Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`));
const text = (id: string) => $(id)?.textContent ?? null;
const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const notify = () => act(() => { for (const l of h.listeners) l(); });
const click = (id: string | HTMLElement) => act(() => { (typeof id === "string" ? $(id)! : id).click(); });
function setValue(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
const type = (id: string, value: string) => act(() => { setValue($(id)!, value); });
const val = (id: string) => ($(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? null;
const checked = (id: string) => ($(id) as HTMLInputElement | null)?.checked ?? null;

async function mount(): Promise<void> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab="participants" projectId="p1" />); });
  await tick();
}

/** The mockup's five people (participants-tab.html): P004 withdrew, P002 lacks the child's own agreement. */
const person = (o: Partial<Participant> & { code: string; name: string }): Participant => ({ id: "id-" + o.code, spellings: [], everyday: [], joined: "2026-10-02", about: {}, ...o });
const FIVE: Participant[] = [
  person({ code: "P001", name: "Priya Sharma", spellings: ["Priya", "प्रिया"], consentHow: "written", guardian: true, assent: true, about: { age: "14", gender: "Girl", year: "9-B" } }),
  person({ code: "P002", name: "Rahul Verma", spellings: ["Rahul"], consentHow: "written", guardian: true, assent: false, about: { age: "15", gender: "Boy", year: "9-B" } }),
  person({ code: "P003", name: "Asha Kumari", spellings: ["Asha"], everyday: ["Asha"], joined: "2026-10-03", consentHow: "written", guardian: true, assent: true, about: { age: "14", gender: "Girl", year: "9-A" } }),
  person({ code: "P004", name: "Mohd. Imran", spellings: ["Imran"], joined: "2026-10-03", consentHow: "written", guardian: true, assent: true, about: { age: "15", gender: "Boy", year: "9-A" }, withdrawn: { on: "2026-10-15", data: "remove" } }),
  person({ code: "P005", name: "Kiran Rao", spellings: ["Kiran"], joined: "2026-10-04", consentHow: "written", guardian: true, assent: true, about: { age: "14", gender: "Boy", year: "9-A" } })
];
const list = (people: Participant[] = FIVE, next = people.length + 1): ParticipantList => ({ v: 1, next, people, notNames: [] });
/** The plan of the mockup: codes; name, spellings, age, gender and class; some under 18. */
const PLAN = { idMode: "codes", record: ["name", "spellings", "age", "gender", "year"], minors: "yes" };
const seed = (plan: Record<string, unknown> | null, l: ParticipantList | null = list()) => {
  if (plan) h.store.design_ec = plan;
  if (l) h.store.participants = l;
};
const stored = () => h.store.participants as ParticipantList;
const lastWritten = () => (h.written.filter((w) => w.kind === "participants").at(-1)?.value ?? null) as ParticipantList | null;
const written = () => h.written.filter((w) => w.kind === "participants");

let confirmSpy: ReturnType<typeof vi.spyOn>;
let alertSpy: ReturnType<typeof vi.spyOn>;
let promptSpy: ReturnType<typeof vi.spyOn>;
let consoleSpies: Array<ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  h.store = {};
  h.flags = {};
  h.written = [];
  h.flushed = [];
  h.asked = [];
  h.status = "unlocked";
  h.setup.mockClear();
  h.ensure.mockClear();
  h.toast.mockClear();
  resetLists();
  // Today is the 24th of October 2026 (local time); only Date is faked, so the timers the test waits on are real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 24, 12, 0, 0));
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(async () => {
  // No name goes to a toast or a console line, and no browser dialog is used.
  expect(h.toast).not.toHaveBeenCalled();
  for (const s of consoleSpies) expect(JSON.stringify(s.mock.calls)).not.toMatch(/Priya|Rahul|Asha|Imran|Kiran|Sunita|Meena|Neha|Tara/);
  // The console is muted so a run reads cleanly, but an error (a React warning, a failed act) is a defect: none was written.
  expect(consoleSpies[3]!.mock.calls, "console.error").toEqual([]);
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(promptSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
});

// ---- The module ---------------------------------------------------------------------------------------------------------------------------------------

describe("the module", () => {
  it("is built, and draws the Panel", () => {
    expect(participants.built).toBe(true);
    expect(typeof participants.Panel).toBe("function");
  });
});

// ---- Find names (Task 9) ------------------------------------------------------------------------------------------------------------------------------

describe("Find names in my documents, on the tab (its results are tested in participantsDocs.test.ts)", () => {
  it("is a button beside Add a person and Paste a list once there are people on the list", async () => {
    seed(PLAN);
    await mount();
    expect(text("pp-find")).toBe("Find names in my documents");
    expect($("pp-add")!.parentElement!.contains($("pp-find"))).toBe(true);
    // Nothing is read until it is pressed: no results are on the page.
    expect($("pp-find-results")).toBeNull();
  });

  it("is not offered with nobody on the list, and the documents are not read by the tab itself", async () => {
    seed(PLAN, list([]));
    await mount();
    expect($("pp-find")).toBeNull();
    expect($("pp-add")).not.toBeNull();
  });

  it("is offered under an anonymous plan that still has a list (C15), where Add and Paste are not", async () => {
    seed({ idMode: "anonymous", record: ["age"], minors: "no" });
    await mount();
    expect($("pp-add")).toBeNull();
    expect($("pp-paste")).toBeNull();
    expect($("pp-find")).not.toBeNull();
  });
});

// ---- The list -----------------------------------------------------------------------------------------------------------------------------------------

describe("the mockup's five people", () => {
  it("draws the heading, the sealed pill, the count line, and a row for each person with their code", async () => {
    seed(PLAN);
    await mount();
    expect($("pp-panel")).not.toBeNull();
    expect(document.body.textContent).toContain("Your participants");
    expect(text("pp-sealed")).toContain("Sealed in your vault: only you can open it");
    expect(text("pp-count")).toBe("5 people · 1 withdrawn · 1 consent not complete");
    expect($$("pp-row-").map((r) => r.getAttribute("data-testid"))).toEqual(["pp-row-P001", "pp-row-P002", "pp-row-P003", "pp-row-P004", "pp-row-P005"]);
    expect(text("pp-row-P001")).toContain("P001");
    expect(text("pp-row-P005")).toContain("Kiran Rao");
  });

  it("puts the spellings small under the name, the joined date as day/month/year, and the consent group's three columns", async () => {
    seed(PLAN);
    await mount();
    const r1 = $("pp-row-P001")!;
    expect(r1.textContent).toContain("Priya Sharma");
    expect(r1.textContent).toContain("Priya · प्रिया");
    expect(r1.textContent).toContain("02/10/2026");
    expect(r1.textContent).toContain("Written");
    const head = $("pp-table")!.querySelector("thead")!.textContent!;
    for (const w of ["Consent", "Code", "Name and other spellings", "Joined", "How", "Under 18", "Parent's permission", "Own agreement", "About them", "Age", "Gender", "Year or class"]) expect(head, w).toContain(w);
    // Under 18 is worked out from the age (the plan records it): P001 is 14, so Yes, and both ticks are there.
    const cells = (code: string) => Array.from($("pp-row-" + code)!.querySelectorAll("td")).map((c) => c.textContent!.trim());
    expect(cells("P001").slice(0, 9)).toEqual(["P001", "Priya Sharma" + "Priya · प्रिया", "02/10/2026", "Written", "Yes", "✓", "✓", "14", "Girl"]);
    expect(cells("P001")[9]).toBe("9-B");
  });

  it("marks Rahul's row amber 'consent not complete' (the child's own agreement is missing), still saved; the others are not marked", async () => {
    seed(PLAN);
    await mount();
    const flag = $("pp-flag-P002")!;
    expect(flag.textContent).toBe("consent not complete");
    expect(flag.className).toContain("bg-flag-bg");
    expect(flag.className).toContain("text-flag-ink");
    expect($("pp-row-P002")!.contains(flag)).toBe(true);
    for (const c of ["P001", "P003", "P004", "P005"]) expect($("pp-flag-" + c), c).toBeNull();
    // The list is read, not changed: nothing was written, and Rahul is still on it.
    expect(written()).toEqual([]);
    expect(stored().people.map((p) => p.code)).toContain("P002");
  });

  it("marks a spelling that is also an everyday word, and greys a withdrawn person's row with a tag; the row keeps Edit (Withdraw and undoing it live in the form, Task 8)", async () => {
    seed(PLAN);
    await mount();
    expect($("pp-row-P003")!.textContent).toContain("Asha · also an everyday word: asked before replacing");
    expect($("pp-row-P001")!.textContent).not.toContain("everyday");
    expect($("pp-row-P004")!.getAttribute("data-withdrawn")).toBe("true");
    expect($("pp-row-P001")!.getAttribute("data-withdrawn")).toBeNull();
    expect($("pp-row-P004")!.textContent).toContain("Withdrew 15/10/2026 · remove their data");
    expect($("pp-edit-P004")).not.toBeNull();
    expect($("pp-edit-P001")).not.toBeNull();
  });

  it("says what to fill in the 'about them' columns, and draws the table inside a box that scrolls sideways on a phone", async () => {
    seed(PLAN);
    await mount();
    expect(document.body.textContent).toContain("Fill the “about them” columns only if they are not already in your data tables.");
    const wrap = $("pp-table-wrap")!;
    expect(wrap.className).toContain("overflow-x-auto");
    expect(wrap.className).toContain("max-w-full");
    expect(wrap.contains($("pp-table"))).toBe(true);
  });

  it("an empty list says so and offers Add and Paste, with no table and no count", async () => {
    seed(PLAN, null);
    await mount();
    expect($("pp-table")).toBeNull();
    expect($("pp-count")).toBeNull();
    expect(text("pp-empty")).toContain("No one is on your list yet");
    expect($("pp-add")).not.toBeNull();
    expect($("pp-paste")).not.toBeNull();
  });
});

describe("the columns follow the plan", () => {
  const heads = () => $("pp-table")!.querySelector("thead")!.textContent!;

  it("the under-18 columns show only when the minors answer is yes or unsure, and so does the amber and its count", async () => {
    seed({ ...PLAN, minors: "unsure" });
    await mount();
    expect(heads()).toContain("Parent's permission");
    expect($("pp-flag-P002")).not.toBeNull();
    for (const minors of ["no", ""]) {
      await act(async () => { for (const r of roots.splice(0)) r.unmount(); });
      document.body.innerHTML = "";
      seed({ ...PLAN, minors });
      await mount();
      expect(heads(), "minors " + JSON.stringify(minors)).not.toMatch(/Under 18|Parent's permission|Own agreement/);
      expect($("pp-flag-P002"), "minors " + JSON.stringify(minors)).toBeNull();
      expect(text("pp-count")).toBe("5 people · 1 withdrawn");
    }
  });

  it("the About columns are only the ticked fields; none ticked, no About group at all", async () => {
    seed({ ...PLAN, record: ["name", "spellings", "gender"] });
    await mount();
    expect(heads()).toContain("Gender");
    expect(heads()).not.toContain("Age");
    expect(heads()).not.toContain("Year or class");
    expect(heads()).toContain("About them");
    await act(async () => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    seed({ ...PLAN, record: ["name", "spellings"] });
    await mount();
    expect(heads()).not.toContain("About them");
    expect(heads()).not.toContain("Gender");
    expect(document.body.textContent).not.toContain("Fill the “about them” columns");
  });

  it("Contact and Roll show only when ticked, Made-up name only in made-up names mode, and a label the student typed is a column", async () => {
    seed({ ...PLAN, record: ["name", "spellings", "age"] });
    await mount();
    expect(heads()).not.toMatch(/Contact|Roll|Made-up name/);
    await act(async () => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    seed({ idMode: "pseudonyms", record: ["name", "spellings", "contact", "roll", "age"], recordOther: ["Father's job"], minors: "no" }, list([person({ code: "P001", name: "Priya Sharma", contact: "98xxxx", roll: "27", pseudonym: "Meera", about: { age: "30", "Father's job": "Farmer" } })]));
    await mount();
    for (const w of ["Contact", "Roll", "Made-up name", "Age", "Father's job"]) expect(heads(), w).toContain(w);
    const row = text("pp-row-P001")!;
    for (const w of ["98xxxx", "27", "Meera", "30", "Farmer"]) expect(row, w).toContain(w);
  });
});

// ---- The plan line ------------------------------------------------------------------------------------------------------------------------------------

describe("the plan line", () => {
  it("reads the mode, what is recorded and what is about them, and 'Some are under 18', with a link to the Ethics tab", async () => {
    seed(PLAN);
    await mount();
    const plan = text("pp-plan")!;
    expect(plan).toContain("Your plan");
    expect(plan).toContain("participants are known by codes");
    expect(plan).toContain("You record their name, other spellings and consent");
    expect(plan).toContain("about them: age, gender and year or class");
    expect(plan).toContain("Some are under 18");
    const link = $("pp-plan")!.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/p/p1/design/ethics");
    expect(link.textContent).toBe("Change the plan");
  });

  it("made-up names, contact and roll in the 'who' part, no about fields, and no 'Some are under 18' when the answer is no", async () => {
    seed({ idMode: "pseudonyms", record: ["name", "spellings", "contact", "roll"], minors: "no" });
    await mount();
    const plan = text("pp-plan")!;
    expect(plan).toContain("participants are known by made-up names");
    expect(plan).toContain("You record their name, other spellings, contact details, roll number and consent");
    expect(plan).not.toContain("about them");
    expect(plan).not.toContain("under 18");
  });

  it("an unanswered plan says so in words and links to Ethics; the tab still works (C8)", async () => {
    seed(null, list());
    await mount();
    const plan = text("pp-plan")!;
    expect(plan).toContain("Not answered yet in your plan");
    expect($("pp-plan")!.querySelector("a")!.getAttribute("href")).toBe("/p/p1/design/ethics");
    expect($("pp-table")).not.toBeNull();
    expect($("pp-add")).not.toBeNull();
    expect($("pp-table")!.querySelector("thead")!.textContent).not.toMatch(/Under 18|Age/);
  });

  it("an idMode this build does not know counts as unanswered", async () => {
    seed({ idMode: "something-new", record: ["age"] }, list());
    await mount();
    expect(text("pp-plan")).toContain("Not answered yet in your plan");
  });
});

// ---- Add ----------------------------------------------------------------------------------------------------------------------------------------------

describe("Add a person", () => {
  it("opens a form with the ticked fields only, and says the next code", async () => {
    seed({ ...PLAN, record: ["name", "spellings", "age", "gender", "year"] });
    await mount();
    expect($("pp-form")).toBeNull();
    await click("pp-add");
    expect($("pp-form")).not.toBeNull();
    expect(text("pp-form")).toContain("Add a person");
    expect(text("pp-form")).toContain("the next code is P006");
    for (const f of ["name", "spellings", "joined", "consentHow", "guardian", "assent", "age", "gender", "year"]) expect($("pp-form-" + f), f).not.toBeNull();
    // Not ticked: not asked. Under 18 comes from the age here, so it is not a question.
    for (const f of ["minor", "contact", "roll", "pseudonym", "course", "area", "language", "caste", "religion", "health", "income"]) expect($("pp-form-" + f), f).toBeNull();
    expect(text("pp-form")).toContain("Add the Hindi spelling if they write their name that way: Appuscholar does not turn one script into the other.");
    expect(val("pp-form-joined")).toBe("2026-10-24");
  });

  it("asks Under 18 when age is not recorded, Contact and Roll when ticked, Made-up name in made-up names mode; no consent questions when the minors answer is no", async () => {
    seed({ idMode: "pseudonyms", record: ["name", "spellings", "contact", "roll"], minors: "unsure" });
    await mount();
    await click("pp-add");
    for (const f of ["minor", "guardian", "assent", "contact", "roll", "pseudonym"]) expect($("pp-form-" + f), f).not.toBeNull();
    expect($("pp-form-age")).toBeNull();
    await click("pp-form-cancel");
    await act(async () => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    seed({ idMode: "codes", record: ["name", "spellings"], minors: "no" });
    await mount();
    await click("pp-add");
    for (const f of ["minor", "guardian", "assent", "contact", "roll", "pseudonym"]) expect($("pp-form-" + f), f).toBeNull();
    expect($("pp-form-consentHow")).not.toBeNull();
  });

  it("pre-fills Other spellings with the name's first word as the name is typed, and stops once the student has typed there", async () => {
    seed(PLAN);
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Sunita Devi");
    expect(val("pp-form-spellings")).toBe("Sunita");
    await type("pp-form-name", "Mohd. Imran Khan");
    expect(val("pp-form-spellings")).toBe("Imran");
    await type("pp-form-spellings", "Imran, इमरान");
    await type("pp-form-name", "Mohd. Imran Ali");
    expect(val("pp-form-spellings")).toBe("Imran, इमरान");
  });

  it("with spellings not ticked in the plan there is no spellings box, and the first word is not suggested and saved unseen", async () => {
    seed({ idMode: "codes", record: ["name", "age"], minors: "no" }, list([]));
    await mount();
    await click("pp-add");
    expect($("pp-form-spellings")).toBeNull();
    await type("pp-form-name", "Sunita Devi");
    await click("pp-form-save");
    expect(lastWritten()!.people[0]).toMatchObject({ code: "P001", name: "Sunita Devi", spellings: [] });
  });

  it("pre-marks an everyday spelling (Asha), which the student can untick; a plain one is not marked", async () => {
    seed(PLAN);
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Sunita Devi");
    expect(checked("pp-form-everyday-0")).toBe(false);
    await type("pp-form-name", "Asha Verma");
    expect(val("pp-form-spellings")).toBe("Asha");
    expect(checked("pp-form-everyday-0")).toBe(true);
    expect($("pp-form")!.textContent).toContain("Asha");
    await click("pp-form-everyday-0");
    expect(checked("pp-form-everyday-0")).toBe(false);
  });

  it("saving adds P006 with joined = today, the spellings and the 'about them' values, closes the form and says which code", async () => {
    seed(PLAN);
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Sunita Devi");
    await type("pp-form-spellings", "Sunita, सुनीता");
    await type("pp-form-consentHow", "written");
    await type("pp-form-age", "14");
    await type("pp-form-gender", "Girl");
    await type("pp-form-year", "9-A");
    await type("pp-form-guardian", "yes");
    await type("pp-form-assent", "yes");
    await click("pp-form-save");
    expect(written()).toHaveLength(1);
    const added = lastWritten()!.people.at(-1)!;
    expect(added).toMatchObject({
      code: "P006", name: "Sunita Devi", spellings: ["Sunita", "सुनीता"], joined: "2026-10-24", consentHow: "written", guardian: true, assent: true,
      about: { age: "14", gender: "Girl", year: "9-A" }
    });
    expect(added.everyday).toEqual([]);
    expect(lastWritten()!.next).toBe(7);
    expect($("pp-form")).toBeNull();
    expect($("pp-row-P006")).not.toBeNull();
    expect(text("pp-status")).toBe("Added P006.");
    expect(text("pp-count")).toBe("6 people · 1 withdrawn · 1 consent not complete");
  });

  it("saves an everyday-marked spelling in `everyday`", async () => {
    seed(PLAN);
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Asha Verma");
    await click("pp-form-save");
    expect(lastWritten()!.people.at(-1)).toMatchObject({ code: "P006", name: "Asha Verma", spellings: ["Asha"], everyday: ["Asha"] });
  });

  it("an under-18 person with the parent's permission or their own agreement missing is saved, and shows amber at once", async () => {
    seed(PLAN);
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Tara Nair");
    await type("pp-form-age", "13");
    await click("pp-form-save");
    expect(lastWritten()!.people.at(-1)).toMatchObject({ code: "P006", name: "Tara Nair", about: { age: "13" }, guardian: false, assent: false });
    expect($("pp-flag-P006")!.textContent).toBe("consent not complete");
    expect(text("pp-count")).toBe("6 people · 1 withdrawn · 2 consent not complete");
  });

  it("stores the Under 18 tick when age is not recorded, and it is what the amber follows", async () => {
    seed({ idMode: "codes", record: ["name", "spellings"], minors: "yes" }, list([]));
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Tara Nair");
    await type("pp-form-minor", "yes");
    await click("pp-form-save");
    expect(lastWritten()!.people[0]).toMatchObject({ code: "P001", minor: true, guardian: false, assent: false });
    expect($("pp-flag-P001")).not.toBeNull();
    await click("pp-add");
    await type("pp-form-name", "Neha Singh");
    await click("pp-form-save");
    expect(lastWritten()!.people[1]).toMatchObject({ code: "P002", minor: false });
    expect($("pp-flag-P002")).toBeNull();
  });

  it("will not save without a name: it says so and writes nothing", async () => {
    seed(PLAN);
    await mount();
    await click("pp-add");
    await type("pp-form-name", "   ");
    await click("pp-form-save");
    expect(text("pp-form-error")).toBe("Type their name.");
    expect(written()).toEqual([]);
    expect($("pp-form")).not.toBeNull();
  });

  it("Cancel closes the form and writes nothing", async () => {
    seed(PLAN);
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Sunita Devi");
    await click("pp-form-cancel");
    expect($("pp-form")).toBeNull();
    expect(written()).toEqual([]);
  });

  it("the next code goes on from the counter after the list was destroyed (never P001 again)", async () => {
    seed(PLAN, { v: 1, next: 12, people: [], notNames: [], destroyedAt: "2026-10-20" });
    await mount();
    await click("pp-add");
    expect(text("pp-form")).toContain("the next code is P012");
    await type("pp-form-name", "Sunita Devi");
    await click("pp-form-save");
    expect(lastWritten()!.people[0]!.code).toBe("P012");
  });
});

// ---- Edit ---------------------------------------------------------------------------------------------------------------------------------------------

describe("Edit", () => {
  it("opens the person's form filled in, never shows or asks for the code, and saves without changing it", async () => {
    seed(PLAN);
    await mount();
    await click("pp-edit-P002");
    const form = $("pp-form")!;
    expect(form).not.toBeNull();
    expect(form.textContent).not.toContain("P002");
    expect(form.textContent).not.toMatch(/\bP00\d\b/);
    expect($("pp-form-code")).toBeNull();
    expect(Array.from(form.querySelectorAll("input,select,textarea")).some((e) => /^P\d+$/.test((e as HTMLInputElement).value))).toBe(false);
    expect(text("pp-form")).not.toContain("next code");
    expect(val("pp-form-name")).toBe("Rahul Verma");
    expect(val("pp-form-spellings")).toBe("Rahul");
    expect(val("pp-form-age")).toBe("15");
    expect(val("pp-form-assent")).toBe("no");
    expect(val("pp-form-guardian")).toBe("yes");
    expect(val("pp-form-joined")).toBe("2026-10-02");
    // Changing the name does not touch the spellings the student wrote.
    await type("pp-form-name", "Rahul K. Verma");
    expect(val("pp-form-spellings")).toBe("Rahul");
    await type("pp-form-age", "16");
    await type("pp-form-assent", "yes");
    await click("pp-form-save");
    const l = lastWritten()!;
    expect(l.people).toHaveLength(5);
    expect(l.people[1]).toMatchObject({ id: "id-P002", code: "P002", name: "Rahul K. Verma", spellings: ["Rahul"], assent: true, guardian: true, about: { age: "16", gender: "Boy", year: "9-B" } });
    expect(l.next).toBe(6);
    expect($("pp-form")).toBeNull();
    // Consent is complete now, so the amber is gone from the row and the count.
    expect($("pp-flag-P002")).toBeNull();
    expect(text("pp-count")).toBe("5 people · 1 withdrawn");
  });

  it("keeps a stored value of a field the plan no longer records (C15: nothing is deleted by an edit)", async () => {
    seed({ ...PLAN, record: ["name", "spellings", "age"] }, list([person({ code: "P001", name: "Priya Sharma", about: { age: "14", gender: "Girl" } })]));
    await mount();
    await click("pp-edit-P001");
    expect($("pp-form-gender")).toBeNull();
    await type("pp-form-age", "");
    await click("pp-form-save");
    expect(lastWritten()!.people[0]!.about).toEqual({ gender: "Girl" });
  });

  it("clearing the spellings and the contact removes them; the person stays", async () => {
    seed({ idMode: "codes", record: ["name", "spellings", "contact"], minors: "no" }, list([person({ code: "P001", name: "Priya Sharma", spellings: ["Priya"], contact: "98xxxx" })]));
    await mount();
    await click("pp-edit-P001");
    await type("pp-form-spellings", "");
    await type("pp-form-contact", "");
    await click("pp-form-save");
    const p = lastWritten()!.people[0]!;
    expect(p.spellings).toEqual([]);
    expect(p.contact ?? "").toBe("");
    expect(p.code).toBe("P001");
  });
});

// ---- Paste --------------------------------------------------------------------------------------------------------------------------------------------

describe("Paste a list", () => {
  it("opens a box; three lines, one already listed: added two with the next codes, skipped one by name", async () => {
    seed(PLAN);
    await mount();
    expect($("pp-paste-box")).toBeNull();
    await click("pp-paste");
    await type("pp-paste-box", "Sunita Devi, Sunita\nPriya Sharma\nMeena Gupta");
    await click("pp-paste-go");
    expect(text("pp-paste-result")).toBe("Added 2 people (P006–P007). Skipped 1 already on your list: Priya Sharma.");
    const l = lastWritten()!;
    expect(l.people.slice(5).map((p) => [p.code, p.name, p.spellings, p.joined])).toEqual([
      ["P006", "Sunita Devi", ["Sunita"], "2026-10-24"],
      ["P007", "Meena Gupta", [], "2026-10-24"]
    ]);
    expect(l.next).toBe(8);
    // The people are on the page, consent is left for the student, and the box is emptied so the same text is not added twice.
    expect($("pp-row-P007")).not.toBeNull();
    expect(l.people[6]!.consentHow).toBeUndefined();
    expect(val("pp-paste-box")).toBe("");
  });

  it("one person, singular", async () => {
    seed(PLAN);
    await mount();
    await click("pp-paste");
    await type("pp-paste-box", "Meena Gupta");
    await click("pp-paste-go");
    expect(text("pp-paste-result")).toBe("Added 1 person (P006).");
  });

  it("a key file keeps its codes; a code already used by someone else is skipped and reported with its code", async () => {
    seed(PLAN);
    await mount();
    await click("pp-paste");
    await type("pp-paste-box", "ParticipantCode,Name\nP010,Neha Singh\nP003,Tara Nair");
    await click("pp-paste-go");
    expect(text("pp-paste-result")).toBe("Added 1 person (P010). Skipped 1 whose code is already used: P003 Tara Nair.");
    const l = lastWritten()!;
    expect(l.people.at(-1)).toMatchObject({ code: "P010", name: "Neha Singh" });
    expect(l.people.map((p) => p.name)).not.toContain("Tara Nair");
    expect(l.next).toBe(11);
  });

  it("a line that starts with a code is read as code, name even without the heading", async () => {
    seed(PLAN);
    await mount();
    await click("pp-paste");
    await type("pp-paste-box", "p020,Neha Singh,Neha");
    await click("pp-paste-go");
    expect(lastWritten()!.people.at(-1)).toMatchObject({ code: "P020", name: "Neha Singh", spellings: ["Neha"] });
  });

  it("everyone already listed: nobody added, nothing written, and it says so", async () => {
    seed(PLAN);
    await mount();
    await click("pp-paste");
    await type("pp-paste-box", "Priya Sharma\nRahul Verma");
    await click("pp-paste-go");
    expect(text("pp-paste-result")).toBe("Nobody was added. Skipped 2 already on your list: Priya Sharma, Rahul Verma.");
    expect(written()).toEqual([]);
  });

  it("an empty box adds nothing and tells the student what to put in it", async () => {
    seed(PLAN);
    await mount();
    await click("pp-paste");
    await type("pp-paste-box", "  \n \n");
    await click("pp-paste-go");
    expect(text("pp-paste-result")).toBe("Nothing to add. Put one person on each line.");
    expect(written()).toEqual([]);
  });

  it("Close shuts the box and keeps the result on the page", async () => {
    seed(PLAN);
    await mount();
    await click("pp-paste");
    await type("pp-paste-box", "Meena Gupta");
    await click("pp-paste-go");
    await click("pp-paste-close");
    expect($("pp-paste-box")).toBeNull();
    expect(text("pp-paste-result")).toBe("Added 1 person (P006).");
  });
});

// ---- The vault and the other states --------------------------------------------------------------------------------------------------------------------

describe("the vault and the other states", () => {
  it("locksMidSession: the vault locks while the tab is open: the names are gone, 'Unlock to see your participants' shows, and nothing is saved", async () => {
    seed(PLAN);
    await mount();
    expect(document.body.textContent).toContain("Priya Sharma");
    await click("pp-add");
    await type("pp-form-name", "Sunita Devi");
    h.status = "locked";
    await notify();
    await tick();
    expect(text("pp-locked")).toBe("Unlock to see your participants");
    for (const n of ["Priya", "Rahul", "Asha", "Imran", "Kiran", "Sunita"]) expect(document.body.textContent, n).not.toContain(n);
    for (const id of ["pp-table", "pp-count", "pp-add", "pp-paste", "pp-form", "pp-plan"]) expect($(id), id).toBeNull();
    expect(written()).toEqual([]);
    expect(h.ensure).not.toHaveBeenCalled();
    // It comes back when the vault opens.
    h.status = "unlocked";
    await notify();
    await tick();
    expect($("pp-locked")).toBeNull();
    expect(document.body.textContent).toContain("Priya Sharma");
    expect(written()).toEqual([]);
  });

  it("a locked vault from the start: only the line, and neither the list nor the plan is asked for (the tab raises no passphrase prompt of its own)", async () => {
    seed(PLAN);
    h.status = "locked";
    await mount();
    expect(text("pp-locked")).toBe("Unlock to see your participants");
    expect(document.body.textContent).not.toContain("Priya");
    expect($("pp-table")).toBeNull();
    expect(h.asked).toEqual([]);
  });

  it("with the vault open both blobs are asked for; with none the plan is read (it is plain) and the list is not", async () => {
    seed(PLAN);
    await mount();
    expect([...h.asked].sort()).toEqual(["design_ec", "participants"]);
    await act(async () => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.asked = [];
    h.status = "off";
    await mount();
    expect(h.asked).toEqual(["design_ec"]);
  });

  it("no project open: a line saying so, and nothing is read", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    await act(async () => { root.render(<Panel tab="participants" projectId="" />); });
    expect(text("pp-no-project")).toBe("Open a project to see its participants.");
    expect(h.asked).toEqual([]);
  });

  it("no vault yet: says to set it up first, with the vault's own set-up button, and shows no table and stores nothing", async () => {
    seed(PLAN);
    h.status = "off";
    await mount();
    expect(text("pp-off")).toContain("Set up your vault first: your participant list is only ever stored sealed.");
    expect($("pp-table")).toBeNull();
    expect($("pp-add")).toBeNull();
    expect(document.body.textContent).not.toContain("Priya");
    await click("pp-setup-vault");
    expect(h.setup).toHaveBeenCalledTimes(1);
    expect(written()).toEqual([]);
  });

  it("an anonymous plan with nobody on the list: the whole tab is one line and the link; no list, no buttons (with people it shows the list, Task 8)", async () => {
    seed({ idMode: "anonymous", record: ["age"], minors: "no" }, list([]));
    await mount();
    expect(text("pp-anonymous")).toBe("Your plan says this study is anonymous, so no list is kept. If that changes, change it in Design and ethics.");
    const link = $("pp-anonymous")!.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/p/p1/design/ethics");
    for (const id of ["pp-table", "pp-add", "pp-paste", "pp-plan", "pp-count", "pp-sealed"]) expect($(id), id).toBeNull();
    expect(document.body.textContent).not.toContain("Priya");
  });

  it("an anonymous plan with the vault off is still one line (there is no list to seal)", async () => {
    seed({ idMode: "anonymous" }, null);
    h.status = "off";
    await mount();
    expect($("pp-anonymous")).not.toBeNull();
    expect($("pp-off")).toBeNull();
  });

  it("a failed read (R20): 'Could not read your participant list.' with Try again, which reads again; nothing else", async () => {
    seed(PLAN, null);
    h.flags.participants = { error: true };
    await mount();
    expect(text("pp-error")).toContain("Could not read your participant list.");
    expect($("pp-table")).toBeNull();
    expect($("pp-add")).toBeNull();
    await click("pp-retry");
    expect(h.flushed).toEqual(["participants"]);
    expect(written()).toEqual([]);
  });

  it("a list that does not open (R21): says so and offers no way to replace it", async () => {
    seed(PLAN, null);
    h.flags.participants = { broken: true };
    await mount();
    expect(text("pp-broken")).toBe("Your participant list does not open on this device.");
    expect($("pp-panel")!.querySelectorAll("button")).toHaveLength(0);
    expect($("pp-add")).toBeNull();
    expect(written()).toEqual([]);
  });

  it("a save that did not land (R24): 'Not saved yet. Appuscholar will try again.' and the list is still shown", async () => {
    seed(PLAN);
    h.flags.participants = { error: true };
    await mount();
    expect(text("pp-save-failed")).toBe("Not saved yet. Appuscholar will try again.");
    expect($("pp-table")).not.toBeNull();
    expect($("pp-error")).toBeNull();
    h.flags.participants = {};
    await notify();
    expect($("pp-save-failed")).toBeNull();
  });

  it("while the list is being read, the loading sign and nothing else", async () => {
    seed(PLAN);
    h.flags.participants = { loading: true };
    await mount();
    expect($("pp-loading")).not.toBeNull();
    expect($("pp-table")).toBeNull();
    expect($("pp-add")).toBeNull();
  });

  it("while the plan is being read, the loading sign (the table would flash columns the plan then takes away)", async () => {
    seed(PLAN);
    h.flags.design_ec = { loading: true };
    await mount();
    expect($("pp-loading")).not.toBeNull();
    expect($("pp-table")).toBeNull();
  });

  it("uses no browser dialog and no toast anywhere in the flows (checked after every test)", async () => {
    seed(PLAN);
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Sunita Devi");
    await click("pp-form-save");
    await click("pp-edit-P001");
    await click("pp-form-save");
    await click("pp-paste");
    await type("pp-paste-box", "Meena Gupta");
    await click("pp-paste-go");
    expect(written()).toHaveLength(3);
  });
});

// ---- Round 1 fixes (R26, R27) ---------------------------------------------------------------------------------------------------------------------

describe("a plan that cannot be read (R26)", () => {
  const heads = () => $("pp-table")!.querySelector("thead")!.textContent!;
  /** Rahul is 15 with no own agreement; Meena is ticked under 18 with no age; the adult has neither. */
  const LIST = list([
    person({ code: "P001", name: "Priya Sharma", guardian: true, assent: true, about: { age: "14" } }),
    person({ code: "P002", name: "Rahul Verma", guardian: true, assent: false, about: { age: "15" } }),
    person({ code: "P003", name: "Meena Gupta", minor: true }),
    person({ code: "P004", name: "Neha Singh", about: { age: "30" } })
  ]);

  for (const flag of ["error", "broken"] as const) {
    it(`design_ec ${flag} with no value: the plan line says it could not be read, with the link; the list shows with the under-18 columns on and the amber kept`, async () => {
      seed(null, LIST);
      h.flags.design_ec = { [flag]: true };
      await mount();
      const plan = text("pp-plan")!;
      expect(plan).toContain("Could not read your plan in Design and ethics.");
      expect(plan).not.toContain("Not answered yet");
      expect($("pp-plan")!.querySelector("a")!.getAttribute("href")).toBe("/p/p1/design/ethics");
      expect($("pp-table")).not.toBeNull();
      for (const w of ["Under 18", "Parent's permission", "Own agreement"]) expect(heads(), w).toContain(w);
      // Age is not known to be recorded, so a person is under 18 by their age or by their tick: both are warned about, the adult is not.
      expect($("pp-flag-P002")).not.toBeNull();
      expect($("pp-flag-P003")).not.toBeNull();
      for (const c of ["P001", "P004"]) expect($("pp-flag-" + c), c).toBeNull();
      expect(text("pp-count")).toBe("4 people · 2 consent not complete");
      expect(written()).toEqual([]);
    });
  }

  it("an error on a plan that was read (a save that did not land) leaves the plan as it is read", async () => {
    seed(PLAN, LIST);
    h.flags.design_ec = { error: true };
    await mount();
    expect(text("pp-plan")).toContain("participants are known by codes");
    expect(text("pp-plan")).not.toContain("Could not read");
  });

  it("the Add form of an unreadable plan still asks the consent questions", async () => {
    seed(null, LIST);
    h.flags.design_ec = { error: true };
    await mount();
    await click("pp-add");
    for (const f of ["minor", "guardian", "assent"]) expect($("pp-form-" + f), f).not.toBeNull();
  });
});

describe("round 1 (R27)", () => {
  it("(a) no person field is spell-checked: the red lines under a name are noise", async () => {
    seed({ idMode: "pseudonyms", record: ["name", "spellings", "contact", "roll", "age", "gender"], recordOther: ["Father's job"], minors: "yes" }, list([]));
    await mount();
    await click("pp-add");
    for (const f of ["name", "spellings", "contact", "roll", "pseudonym", "age", "gender", "other-0"]) {
      expect($("pp-form-" + f), f).not.toBeNull();
      expect($("pp-form-" + f)!.getAttribute("spellcheck"), f).toBe("false");
    }
  });

  it("(c) with spellings not ticked there are no everyday boxes for spellings, and an edit keeps the spellings and their marks it did not show", async () => {
    seed({ idMode: "codes", record: ["name", "age"], minors: "no" }, list([person({ code: "P001", name: "Asha Kumari", spellings: ["Asha"], everyday: ["Asha"] })]));
    await mount();
    await click("pp-edit-P001");
    expect($("pp-form-spellings")).toBeNull();
    expect($("pp-form-everyday-0")).toBeNull();
    await type("pp-form-age", "30");
    await click("pp-form-save");
    expect(lastWritten()!.people[0]).toMatchObject({ code: "P001", spellings: ["Asha"], everyday: ["Asha"], about: { age: "30" } });
  });

  it("(d) age recorded and none given: Under 18 reads \u2014, not No, and no consent is asked of the row", async () => {
    seed(PLAN, list([person({ code: "P001", name: "Priya Sharma" }), person({ code: "P002", name: "Rahul Verma", about: { age: "30" } })]));
    await mount();
    const cells = (code: string) => Array.from($("pp-row-" + code)!.querySelectorAll("td")).map((c) => c.textContent!.trim());
    expect(cells("P001").slice(4, 7)).toEqual(["\u2014", "\u2013", "\u2013"]);
    expect(cells("P002").slice(4, 7)).toEqual(["No", "\u2013", "\u2013"]);
    expect($("pp-flag-P001")).toBeNull();
  });

  it("(d) a person who withdrew is not counted in 'consent not complete' and has no amber on their row", async () => {
    const gone = person({ code: "P002", name: "Rahul Verma", guardian: true, assent: false, about: { age: "15" }, withdrawn: { on: "2026-10-15", data: "keep" } });
    seed(PLAN, list([person({ code: "P001", name: "Priya Sharma", guardian: true, assent: true, about: { age: "14" } }), gone]));
    await mount();
    expect(text("pp-count")).toBe("2 people · 1 withdrawn");
    expect($("pp-flag-P002")).toBeNull();
  });

  it("(e) the table uses the theme's colours, not colours of its own", async () => {
    seed(PLAN);
    await mount();
    expect($("pp-table")!.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it("(g) a window that may not write says where to change the list; nothing is written", async () => {
    seed(PLAN);
    h.flags.participants = { readOnly: true };
    await mount();
    await click("pp-add");
    await type("pp-form-name", "Sunita Devi");
    await click("pp-form-save");
    expect(text("pp-form-error")).toBe("You can change the list in the Collection and analysis window.");
    expect($("pp-form")).not.toBeNull();
    await click("pp-form-cancel");
    await click("pp-paste");
    await type("pp-paste-box", "Meena Gupta");
    await click("pp-paste-go");
    expect(text("pp-paste-result")).toBe("You can change the list in the Collection and analysis window.");
    expect(written()).toEqual([]);
  });
});

describe("dates", () => {
  it("today is the day on this computer's clock, not the UTC day (half past midnight in India is still the 24th)", () => {
    expect(todayIso(new Date(2026, 9, 24, 0, 30, 0))).toBe("2026-10-24");
    expect(todayIso(new Date(2026, 0, 5, 23, 59, 0))).toBe("2026-01-05");
  });

  it("shows yyyy-mm-dd as day/month/year and leaves anything else as it was", () => {
    expect(dmy("2026-10-02")).toBe("02/10/2026");
    expect(dmy("")).toBe("");
    expect(dmy("15 Oct")).toBe("15 Oct");
  });
});
