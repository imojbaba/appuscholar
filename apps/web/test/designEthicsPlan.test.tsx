// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECORD_FIELDS, consentMarkdown, consentMarkdownV2, ecMinorsNote, ecMinorsNoteV2, ethicsStatement, ethicsStatementV2, protocolMarkdown, protocolMarkdownV2,
  type Plan, type ProtoFields
} from "@appuscholar/core";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";

/*
 * Task 7: how participants are identified, planned in Design and ethics (spec 2026-10-24-participants-design.md §4; calls C5 and C18; controller ruling R29). The
 * Ethics tab gets a section between the approval record and the consent form: the question `ec-idmode` (three answers), the menu `ec-rec-<id>` (only for codes
 * and made-up names), the combination line `ec-rec-combo` and "Add another detail" `ec-rec-other`. Save stores `idMode`, `record` and `recordOther` on the
 * design_ec blob; the consent form, the ethics statement and the protocol carry the plan through core's V2 functions; the minors note is core's V2 note. With no
 * answer to the question every inserted text is v1's. The blobs are an in-memory store (as test/toolsAEthics.test.tsx and toolsAProtocol.test.tsx); useDocAccess
 * is a fake that records every insertBlock. The expected texts are core's own output, the wording of the page is spec §4's.
 */

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  listeners: new Set<() => void>(),
  version: 0,
  sets: [] as Array<{ kind: string; value: unknown }>,
  inserts: [] as Array<{ html: string; opts: unknown }>,
  insertResult: true,
  toast: vi.fn()
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/design/ethics" }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/editor/docAccess", () => ({
  useDocAccess: () => ({
    insertBlock: async (html: string, opts?: unknown) => { h.inserts.push({ html, opts }); return h.insertResult; }
  })
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      useSyncExternalStore((cb) => { h.listeners.add(cb); return () => { h.listeners.delete(cb); }; }, () => h.version);
      return {
        value: h.store.has(kind) ? h.store.get(kind) : null,
        loading: false, locked: false, broken: false, error: false, readOnly: false,
        set: (next: unknown) => {
          const prev = h.store.has(kind) ? h.store.get(kind) : null;
          const value = typeof next === "function" ? (next as (p: unknown) => unknown)(prev) : next;
          h.store.set(kind, value);
          h.sets.push({ kind, value: JSON.parse(JSON.stringify(value)) });
          h.version++;
          for (const l of h.listeners) l();
        },
        flush: async () => true
      };
    }
  };
});

import { Ethics } from "../components/tools/design/Ethics";
import { Protocol } from "../components/tools/design/Protocol";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
const HI = { ...(hi as Record<string, string>), ...(designHi as Record<string, string>) };
const escaped = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).replace(/\n/g, "<br>");

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const T = (id: string) => `[data-testid="${id}"]`;
const text = (id: string) => $(T(id))?.textContent ?? null;
async function mount(node: React.ReactNode): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
  return root;
}
const render = () => mount(<Ethics projectId="p1" />);
async function set(id: string, value: string) {
  const el = $(T(id)) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  expect(el, id).not.toBeNull();
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const click = async (id: string) => { expect($(T(id)), id).not.toBeNull(); await act(async () => { $(T(id))!.click(); }); };
const checked = (id: string) => ($(T(id)) as HTMLInputElement).checked;
const ec = () => h.store.get("design_ec") as Record<string, unknown> | undefined;

const IDS = RECORD_FIELDS.map((f) => f.id);
const SENSITIVE = ["caste", "religion", "health", "income"];
const SENSITIVE_NOTE = "Sensitive: your committee will ask why you need it";
const COMBO = "In a small group, these together can point to one person even without a name. Report them in groups (for example 18–20) in your write-up.";
/** The labels the page uses for each field. */
const LABEL: Record<string, string> = {
  name: "Name", spellings: "Other spellings and short names", contact: "Phone or email", roll: "Roll or enrolment number", age: "Age", gender: "Gender",
  year: "Year or class", course: "Course", area: "Area", language: "Language", caste: "Caste or category", religion: "Religion", health: "Health", income: "Family income"
};
/** §4's table, "Line shown beside it". */
const LINE: Record<string, string> = {
  name: "To meet them, match a before-and-after, or find their answers if they withdraw",
  spellings: "Short names and other spellings, so their name is found in your text",
  contact: "Only if you will contact them again",
  roll: "Only if your institution insists",
  age: "Age in years, not date of birth",
  gender: "Include \"prefer not to say\"",
  year: "Year or class",
  area: "Urban or rural, or district; not village or street"
};

/** What the Ethics tab reads from the twelve texts, as the page reads them (trimmed, the select values untouched). */
const TEXT_KEYS = ["title", "pi", "what", "risks", "benefits", "contact", "status", "committee", "apprNo", "apprDate", "consentMode", "minors"] as const;
const texts = (p: Partial<Record<(typeof TEXT_KEYS)[number], string>>) => Object.fromEntries(TEXT_KEYS.map((k) => [k, p[k] ?? ""])) as Record<(typeof TEXT_KEYS)[number], string>;
const asEthics = (f: ReturnType<typeof texts>) => f as Parameters<typeof ethicsStatement>[0];

beforeEach(() => {
  h.store.clear(); h.sets.length = 0; h.inserts.length = 0; h.version = 0; h.insertResult = true;
  h.toast.mockClear();
});
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the question: how will you identify participants?", () => {
  it("is its own section between the approval record and the consent form, headed 'How participants are identified'", async () => {
    await render();
    const plan = $(T("ec-plan"));
    expect(plan).not.toBeNull();
    expect(plan!.querySelector("h4")!.textContent).toBe("How participants are identified");
    const order = ["ec-record", "ec-plan", "consent-form"].map((id) => $(T(id))!);
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The plan has its own Save button, inside the section.
    expect(plan!.contains($(T("ec-plan-save")))).toBe(true);
  });

  it("offers Choose and the three answers, in spec §4's words", async () => {
    await render();
    const sel = $(T("ec-idmode")) as HTMLSelectElement;
    expect(sel.tagName).toBe("SELECT");
    expect([...sel.options].map((o) => o.value)).toEqual(["", "codes", "pseudonyms", "anonymous"]);
    expect([...sel.options].map((o) => o.textContent)).toEqual([
      E.design_ec_choose,
      "By codes (P001, P002 …). Their names stay in a sealed list.",
      "By made-up names. Their real names stay in a sealed list.",
      "Anonymously. No names are recorded, so answers cannot be linked to anyone."
    ]);
    expect(sel.value).toBe("");
    expect(document.body.textContent).toContain("How will you identify participants?");
  });

  it("each answer is saved as idMode by Save, and a stored answer is shown when the tab opens", async () => {
    for (const mode of ["codes", "pseudonyms", "anonymous"]) {
      h.store.clear(); h.sets.length = 0;
      const root = await render();
      await set("ec-idmode", mode);
      expect(h.sets, mode).toHaveLength(0); // nothing is stored until Save, as the other boxes
      await click("ec-plan-save");
      expect(ec()!.idMode, mode).toBe(mode);
      expect(h.toast.mock.calls.map((x) => x[0]).at(-1), mode).toBe(E.design_saved);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
      await render();
      expect(($(T("ec-idmode")) as HTMLSelectElement).value, mode).toBe(mode);
      await act(async () => { roots.pop()!.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("one Save stores the record's texts and the plan together, from either Save button", async () => {
    await render();
    await set("ec-title", "  Sleep  ");
    await set("ec-idmode", "codes");
    await click("consent-save");
    expect(ec()).toMatchObject({ title: "Sleep", idMode: "codes", record: ["name", "spellings"], recordOther: [] });
    h.sets.length = 0;
    await set("ec-idmode", "pseudonyms");
    await click("ec-save");
    expect(ec()).toMatchObject({ title: "Sleep", idMode: "pseudonyms" });
  });

  it("with the question unanswered, Save adds none of the plan's fields: the blob is as before (older blobs and the goldens hold)", async () => {
    h.store.set("design_ec", { title: "T", checklist: { 1: true }, later: 1 });
    await render();
    await click("ec-save");
    const saved = ec()!;
    expect("idMode" in saved).toBe(false);
    expect("record" in saved).toBe(false);
    expect("recordOther" in saved).toBe(false);
    expect(saved).toMatchObject({ title: "T", checklist: { 1: true }, later: 1 });
  });

  it("choosing Choose again removes the stored answer on Save and keeps the ticks", async () => {
    h.store.set("design_ec", { idMode: "codes", record: ["name", "age"], recordOther: ["Hobby"] });
    await render();
    await set("ec-idmode", "");
    await click("ec-plan-save");
    const saved = ec()!;
    expect("idMode" in saved).toBe(false);
    expect(saved.record).toEqual(["name", "age"]);
    expect(saved.recordOther).toEqual(["Hobby"]);
  });

  it("a stored answer this build does not offer is shown as it is, and the menu stays hidden", async () => {
    h.store.set("design_ec", { idMode: "someday" });
    await render();
    expect(($(T("ec-idmode")) as HTMLSelectElement).value).toBe("someday");
    expect($(T("ec-rec-name"))).toBeNull();
  });
});

describe("what will you record about each person: the menu", () => {
  it("is hidden until the question is answered, and for anonymous", async () => {
    await render();
    for (const id of IDS) expect($(T("ec-rec-" + id)), id).toBeNull();
    expect($(T("ec-rec-other"))).toBeNull();
    expect($(T("ec-rec-combo"))).toBeNull();
    await set("ec-idmode", "anonymous");
    for (const id of IDS) expect($(T("ec-rec-" + id)), id).toBeNull();
    expect($(T("ec-rec-other"))).toBeNull();
    expect(document.body.textContent).not.toContain("What will you record about each person?");
    await set("ec-idmode", "codes");
    for (const id of IDS) expect($(T("ec-rec-" + id)), id).not.toBeNull();
    expect($(T("ec-rec-other"))).not.toBeNull();
    expect(document.body.textContent).toContain("What will you record about each person?");
    await set("ec-idmode", "pseudonyms");
    for (const id of IDS) expect($(T("ec-rec-" + id)), id).not.toBeNull();
  });

  it("has a tick for each of the menu's fourteen fields and no more: no Aadhaar, PAN or other government ID (C5)", async () => {
    await render();
    await set("ec-idmode", "codes");
    expect(IDS).toHaveLength(14);
    const boxes = [...document.body.querySelectorAll<HTMLInputElement>(`${T("ec-plan")} input[type=checkbox]`)];
    expect(boxes.map((b) => b.dataset.testid)).toEqual(IDS.map((id) => "ec-rec-" + id));
    const plan = $(T("ec-plan"))!.textContent!;
    expect(plan).not.toMatch(/aadhaar|aadhar|\bPAN\b|passport|voter|licen[cs]e/i);
    for (const id of IDS) expect(plan, id).toContain(LABEL[id]);
  });

  it("starts with the name and the spellings ticked and nothing else (§4)", async () => {
    await render();
    await set("ec-idmode", "codes");
    for (const id of IDS) expect(checked("ec-rec-" + id), id).toBe(id === "name" || id === "spellings");
  });

  it("shows the stored ticks when there are some, and none ticked for a stored empty list", async () => {
    h.store.set("design_ec", { idMode: "codes", record: ["age", "caste"] });
    await render();
    for (const id of IDS) expect(checked("ec-rec-" + id), id).toBe(id === "age" || id === "caste");
    await act(async () => { roots.pop()!.unmount(); });
    document.body.innerHTML = "";
    h.store.set("design_ec", { idMode: "codes", record: [] });
    await render();
    for (const id of IDS) expect(checked("ec-rec-" + id), id).toBe(false);
  });

  it("a tick or an untick is kept until Save, then stored in the menu's order with the starting ticks written out", async () => {
    await render();
    await set("ec-idmode", "codes");
    await click("ec-rec-income");
    await click("ec-rec-age");
    await click("ec-rec-spellings");
    expect(checked("ec-rec-income")).toBe(true);
    expect(checked("ec-rec-spellings")).toBe(false);
    expect(h.sets).toHaveLength(0);
    await click("ec-plan-save");
    expect(ec()!.record).toEqual(["name", "age", "income"]);
    expect(ec()!.recordOther).toEqual([]);
    // After Save the page shows the stored ticks.
    expect(checked("ec-rec-age")).toBe(true);
    expect(checked("ec-rec-income")).toBe(true);
    expect(checked("ec-rec-spellings")).toBe(false);
  });

  it("keeps a field id this build does not know when a tick changes", async () => {
    h.store.set("design_ec", { idMode: "codes", record: ["name", "from-another-build"] });
    await render();
    await click("ec-rec-age");
    await click("ec-plan-save");
    expect(ec()!.record).toEqual(["name", "age", "from-another-build"]);
  });

  it("shows the always rows as text, not ticks: the code and the consent record", async () => {
    await render();
    await set("ec-idmode", "codes");
    const plan = $(T("ec-plan"))!;
    expect(plan.textContent).toContain("Made by Appuscholar, never reused");
    expect(plan.textContent).toContain("How and when they agreed; for under-18s, a parent's permission and their own agreement; withdrawal");
    expect($(T("ec-rec-code"))).toBeNull();
    expect($(T("ec-rec-consent"))).toBeNull();
    expect(plan.querySelectorAll("input[type=checkbox]")).toHaveLength(14);
  });

  it("shows each field's line from §4's table beside it, and none for course or language", async () => {
    await render();
    await set("ec-idmode", "codes");
    const plan = $(T("ec-plan"))!.textContent!;
    for (const [id, line] of Object.entries(LINE)) {
      const row = $(T("ec-rec-" + id))!.closest("label")!;
      expect(row.textContent, id).toContain(LABEL[id]);
      expect(row.textContent, id).toContain(line);
    }
    for (const id of ["course", "language"]) expect($(T("ec-rec-" + id))!.closest("label")!.textContent, id).toBe(LABEL[id]);
    expect(plan).not.toContain("undefined");
  });

  it("the four sensitive fields show 'Sensitive: your committee will ask why you need it', and no other does", async () => {
    await render();
    await set("ec-idmode", "pseudonyms");
    for (const id of IDS) {
      const row = $(T("ec-rec-" + id))!.closest("label")!;
      if (SENSITIVE.includes(id)) expect(row.textContent, id).toContain(SENSITIVE_NOTE);
      else expect(row.textContent, id).not.toContain("Sensitive");
    }
  });

  it("the two groups are told apart: who they are, and about them", async () => {
    await render();
    await set("ec-idmode", "codes");
    const plan = $(T("ec-plan"))!;
    const who = plan.querySelector(T("ec-rec-group-who"))!;
    const about = plan.querySelector(T("ec-rec-group-about"))!;
    expect(who).not.toBeNull();
    expect(about).not.toBeNull();
    for (const id of ["name", "spellings", "contact", "roll"]) expect(who.contains($(T("ec-rec-" + id))), id).toBe(true);
    for (const id of IDS.filter((x) => !["name", "spellings", "contact", "roll"].includes(x))) expect(about.contains($(T("ec-rec-" + id))), id).toBe(true);
    expect(who.contains($(T("ec-rec-other")))).toBe(false);
    expect(about.contains($(T("ec-rec-other")))).toBe(true);
  });
});

describe("the combination warning", () => {
  it("shows the exact line when three or more about-fields are ticked, and not before", async () => {
    await render();
    await set("ec-idmode", "codes");
    expect($(T("ec-rec-combo"))).toBeNull();
    await click("ec-rec-age");
    await click("ec-rec-gender");
    expect($(T("ec-rec-combo"))).toBeNull();
    await click("ec-rec-year");
    expect(text("ec-rec-combo")).toBe(COMBO);
    expect($(T("ec-rec-combo"))!.getAttribute("role")).toBe("status");
    await click("ec-rec-year");
    expect($(T("ec-rec-combo"))).toBeNull();
  });

  it("counts the sensitive fields, and never the who-fields", async () => {
    await render();
    await set("ec-idmode", "codes");
    await click("ec-rec-contact");
    await click("ec-rec-roll");
    expect(checked("ec-rec-name")).toBe(true);
    expect($(T("ec-rec-combo"))).toBeNull();
    await click("ec-rec-caste");
    await click("ec-rec-religion");
    expect($(T("ec-rec-combo"))).toBeNull();
    await click("ec-rec-income");
    expect(text("ec-rec-combo")).toBe(COMBO);
  });

  it("shows when the stored ticks have three, and is hidden with the menu for anonymous", async () => {
    h.store.set("design_ec", { idMode: "codes", record: ["age", "gender", "area"] });
    await render();
    expect(text("ec-rec-combo")).toBe(COMBO);
    await set("ec-idmode", "anonymous");
    expect($(T("ec-rec-combo"))).toBeNull();
  });
});

describe("Add another detail", () => {
  it("adds a text box each press, up to five, and stores them trimmed and non-empty", async () => {
    await render();
    await set("ec-idmode", "codes");
    expect($(T("ec-rec-other"))!.textContent).toBe("Add another detail");
    expect($(T("ec-rec-other-0"))).toBeNull();
    for (let i = 0; i < 7; i++) await click("ec-rec-other");
    for (let i = 0; i < 5; i++) expect($(T("ec-rec-other-" + i)), String(i)).not.toBeNull();
    expect($(T("ec-rec-other-5"))).toBeNull();
    expect(($(T("ec-rec-other")) as HTMLButtonElement).disabled).toBe(true);
    await set("ec-rec-other-0", "  Hobby  ");
    await set("ec-rec-other-1", "");
    await set("ec-rec-other-2", "   ");
    await set("ec-rec-other-3", "Sleep hours");
    await set("ec-rec-other-4", "Siblings");
    expect(h.sets).toHaveLength(0);
    await click("ec-plan-save");
    expect(ec()!.recordOther).toEqual(["Hobby", "Sleep hours", "Siblings"]);
    // After Save the boxes are the stored labels.
    expect(($(T("ec-rec-other-0")) as HTMLInputElement).value).toBe("Hobby");
    expect(($(T("ec-rec-other-2")) as HTMLInputElement).value).toBe("Siblings");
    expect($(T("ec-rec-other-3"))).toBeNull();
    expect(($(T("ec-rec-other")) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the stored labels when the tab opens, and a stored list of more than five shows the first five", async () => {
    h.store.set("design_ec", { idMode: "pseudonyms", recordOther: ["a", "b", "c", "d", "e", "f"] });
    await render();
    for (let i = 0; i < 5; i++) expect(($(T("ec-rec-other-" + i)) as HTMLInputElement).value).toBe("abcde"[i]);
    expect($(T("ec-rec-other-5"))).toBeNull();
    await click("ec-plan-save");
    expect(ec()!.recordOther).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("the minors note", () => {
  it("shows ecMinorsNoteV2's text, with the new last sentence, not v1's", async () => {
    await render();
    for (const m of ["yes", "unsure"]) {
      await set("ec-minors", m);
      expect(text("ec-minors-note"), m).toBe(ecMinorsNoteV2(m));
      expect(text("ec-minors-note"), m).not.toBe(ecMinorsNote(m));
      expect(text("ec-minors-note"), m).toContain("If you list people under 18, only you can open the list.");
      expect(text("ec-minors-note"), m).not.toContain("does not collect children's data itself");
    }
    for (const m of ["no", ""]) {
      await set("ec-minors", m);
      expect($(T("ec-minors-note")), m).toBeNull();
    }
  });
});

describe("the consent form, the ethics statement and the protocol carry the plan", () => {
  const PLAN_CODES: Plan = { idMode: "codes", record: ["name", "spellings", "age", "gender"], recordOther: ["Hobby"] };

  it("the consent form is consentMarkdownV2 of what the tab shows, with the plan and the two under-18 sections", async () => {
    h.store.set("design_ec", { title: "Sleep study", pi: "Dr A, Univ", minors: "yes", ...PLAN_CODES });
    await render();
    await click("consent-generate");
    const f = texts({ title: "Sleep study", pi: "Dr A, Univ", minors: "yes" });
    const want = consentMarkdownV2(f, PLAN_CODES) as string;
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]!.html).toBe(escaped(want));
    expect(want).toContain("## What we record about you");
    expect(want).toContain("We will write down your name, other names you use, your age, your gender and Hobby.");
    expect(want).toContain("## Parent or guardian permission");
    expect(want).toContain("## Young person's agreement");
    expect(h.inserts[0]!.html).toContain("Parent or guardian permission");
    expect(h.inserts[0]!.html).toContain("Young person&#39;s agreement");
    expect(h.toast.mock.calls.map((x) => x[0])).toEqual([E.design_inserted]);
    // The record is saved first, with the plan.
    expect(ec()).toMatchObject({ title: "Sleep study", idMode: "codes", record: PLAN_CODES.record, recordOther: ["Hobby"] });
  });

  it("the plan chosen on the page but not yet saved is the plan in the form, and the generator stores it", async () => {
    await render();
    await set("ec-title", "Sleep study");
    await set("ec-pi", "Dr A, Univ");
    await set("ec-idmode", "pseudonyms");
    await click("ec-rec-age");
    await click("consent-generate");
    const want = consentMarkdownV2(texts({ title: "Sleep study", pi: "Dr A, Univ" }), { idMode: "pseudonyms", record: ["name", "spellings", "age"], recordOther: [] }) as string;
    expect(h.inserts[0]!.html).toBe(escaped(want));
    expect(want).toContain("a made-up name");
    expect(ec()).toMatchObject({ idMode: "pseudonyms", record: ["name", "spellings", "age"], recordOther: [] });
  });

  it("with no plan, minors no: the consent form is v1's; minors yes adds only the two under-18 sections (R14)", async () => {
    h.store.set("design_ec", { title: "Sleep study", pi: "Dr A, Univ", minors: "no" });
    await render();
    await click("consent-generate");
    expect(h.inserts[0]!.html).toBe(escaped(consentMarkdown(texts({ title: "Sleep study", pi: "Dr A, Univ", minors: "no" })) as string));
    expect(h.inserts[0]!.html).not.toContain("What we record about you");
    await set("ec-minors", "yes");
    await click("consent-generate");
    const want = consentMarkdownV2(texts({ title: "Sleep study", pi: "Dr A, Univ", minors: "yes" }), {}) as string;
    expect(h.inserts[1]!.html).toBe(escaped(want));
    expect(want).toContain("## Parent or guardian permission");
    expect(want).not.toContain("What we record about you");
  });

  it("anonymous: the form says no name is written down, and the hidden menu's stored ticks are not in it", async () => {
    h.store.set("design_ec", { title: "T", pi: "P", idMode: "anonymous", record: ["name", "age"], recordOther: ["Hobby"] });
    await render();
    await click("consent-generate");
    const want = consentMarkdownV2(texts({ title: "T", pi: "P" }), { idMode: "anonymous" }) as string;
    expect(h.inserts[0]!.html).toBe(escaped(want));
    expect(want).toContain("We will not write down your name.");
    expect(want).not.toContain("your age");
    expect(want).not.toContain("Hobby");
    // What was stored is kept for when the answer changes back.
    expect(ec()).toMatchObject({ idMode: "anonymous", record: ["name", "age"], recordOther: ["Hobby"] });
  });

  it("the ethics statement is ethicsStatementV2 of the plan, for each answer; a refusal inserts nothing", async () => {
    for (const mode of ["codes", "pseudonyms", "anonymous"] as const) {
      h.store.clear(); h.sets.length = 0; h.inserts.length = 0;
      h.store.set("design_ec", { status: "approved", committee: "IEC", idMode: mode });
      const root = await render();
      await click("ec-statement");
      const f = texts({ status: "approved", committee: "IEC" });
      const r = ethicsStatementV2(asEthics(f), { idMode: mode });
      if ("error" in r) throw new Error(r.error);
      expect(h.inserts, mode).toHaveLength(1);
      expect(h.inserts[0]!.html, mode).toBe(escaped(r.heading + "\n" + r.text));
      expect(r.text, mode).not.toBe((ethicsStatement(asEthics(f)) as { text: string }).text);
      expect(ec(), mode).toMatchObject({ idMode: mode });
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
    h.store.clear(); h.inserts.length = 0;
    h.store.set("design_ec", { idMode: "codes" });
    await render();
    await click("ec-statement");
    expect(h.inserts).toHaveLength(0);
    expect(text("ec-statement-msg")).toBe("Choose where things stand first");
  });

  it("the protocol is protocolMarkdownV2 of the plan read from design_ec; it only reads the plan, never writes it", async () => {
    const plan = { idMode: "pseudonyms", record: ["name", "age"], recordOther: ["Hobby"] };
    h.store.set("design_ec", { title: "T", ...plan });
    await mount(<Protocol projectId="p1" />);
    const box = $(T("proto-bg")) as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Sleep and exams");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("proto-generate");
    const o: ProtoFields = { bg: "Sleep and exams", obj: "", design: "", part: "", sample: "", proc: "", risk: "", dmp: "" };
    const want = protocolMarkdownV2(o, plan as Plan)!;
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]!.html).toBe(escaped(want));
    expect(want).toContain("**How participants are identified:**");
    expect(want).toContain("made-up name");
    expect(h.sets.map((s) => s.kind)).toEqual(["design_proto"]);
    expect(ec()).toEqual({ title: "T", ...plan });
  });

  it("the protocol with no plan is v1's, and so is the empty-protocol nudge", async () => {
    await mount(<Protocol projectId="p1" />);
    await click("proto-generate");
    expect(h.inserts).toHaveLength(0);
    expect(text("proto-msg")).not.toBe("");
    const box = $(T("proto-obj")) as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Test sleep");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("proto-generate");
    const o: ProtoFields = { bg: "", obj: "Test sleep", design: "", part: "", sample: "", proc: "", risk: "", dmp: "" };
    expect(h.inserts[0]!.html).toBe(escaped(protocolMarkdown(o)!));
    expect(h.inserts[0]!.html).not.toContain("How participants are identified");
  });

  it("with no answer to the question every inserted text is v1's: statement, consent form (minors no or unanswered), protocol", async () => {
    for (const minors of ["", "no"]) {
      h.store.clear(); h.inserts.length = 0;
      h.store.set("design_ec", { title: "T", pi: "P", status: "approved", committee: "IEC", minors, record: ["age"], recordOther: ["x"] });
      const root = await render();
      await click("ec-statement");
      await click("consent-generate");
      const f = texts({ title: "T", pi: "P", status: "approved", committee: "IEC", minors });
      const st = ethicsStatement(asEthics(f)) as { heading: string; text: string };
      expect(h.inserts[0]!.html, minors).toBe(escaped(st.heading + "\n" + st.text));
      expect(h.inserts[1]!.html, minors).toBe(escaped(consentMarkdown(f) as string));
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });
});

describe("words and register", () => {
  const KEYS = [
    "design_rec_h", "design_rec_desc", "design_ec_idmode", "design_ec_idmode_codes", "design_ec_idmode_pseudonyms", "design_ec_idmode_anonymous", "design_rec_menu_h",
    "design_rec_who_h", "design_rec_about_h", "design_rec_always", "design_rec_code", "design_rec_code_why", "design_rec_consent", "design_rec_consent_why",
    "design_rec_sensitive", "design_rec_combo", "design_rec_other", "design_rec_other_ph", "design_rec_other_n",
    ...IDS.map((id) => "design_rec_" + id),
    ...IDS.filter((id) => !SENSITIVE.includes(id) && id !== "course" && id !== "language").map((id) => "design_rec_" + id + "_why")
  ];

  it("every new key has English and a Hindi draft, and the Hindi file keeps its $draft line first", () => {
    expect(Object.keys(designHi)[0]).toBe("$draft");
    for (const k of KEYS) {
      expect((designEn as Record<string, string>)[k], k).toBeTruthy();
      expect((designHi as Record<string, string>)[k], k).toBeTruthy();
      expect(HI[k], k).not.toBe(E[k]);
    }
  });

  it("the English words are spec §4's, verbatim", () => {
    expect(E.design_rec_h).toBe("How participants are identified");
    expect(E.design_ec_idmode).toBe("How will you identify participants?");
    expect(E.design_rec_menu_h).toBe("What will you record about each person?");
    expect(E.design_rec_sensitive).toBe(SENSITIVE_NOTE);
    expect(E.design_rec_combo).toBe(COMBO);
    expect(E.design_rec_other).toBe("Add another detail");
    expect(E.design_rec_code_why).toBe("Made by Appuscholar, never reused");
    for (const [id, line] of Object.entries(LINE)) expect(E["design_rec_" + id + "_why"], id).toBe(line);
    for (const [id, label] of Object.entries(LABEL)) expect(E["design_rec_" + id], id).toBe(label);
  });

  it("the page's words never say exempt (rule 9), and no new Hindi value says छूट", () => {
    for (const k of KEYS) {
      expect(E[k], k).not.toMatch(/exempt/i);
      expect(HI[k], k).not.toContain("छूट");
    }
  });
});
