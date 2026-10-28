// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EC_DOCS, ecMinorsNote, ecMinorsNoteV2 } from "@appuscholar/core";
import en from "../messages/en.json";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";

/*
 * Task A2, Ethics and consent (v1 ecRender, ecMinorsNote, ecToggle, ecSave, ecStatement, ecGenerateConsent 5979-6070 and the dialog 1862-1887). The
 * expected texts are core's, read from the golden fixture test/golden/design/cases.json (`minors`, `ethics`, `consent`). The blobs are an in-memory
 * store; useDocAccess is a fake that records every insertBlock.
 */

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  listeners: new Set<() => void>(),
  version: 0,
  loading: false,
  locked: false,
  broken: false,
  error: false,
  sets: [] as Array<{ kind: string; value: unknown }>,
  inserts: [] as Array<{ html: string; opts: unknown }>,
  insertResult: true,
  toast: vi.fn(),
  confirm: vi.fn(() => true)
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
        loading: h.loading, locked: h.locked, broken: h.broken, error: h.error, readOnly: false,
        set: (next: unknown) => {
          const prev = h.store.has(kind) ? h.store.get(kind) : null;
          const value = typeof next === "function" ? (next as (p: unknown) => unknown)(prev) : next;
          h.store.set(kind, value);
          h.sets.push({ kind, value });
          h.version++;
          for (const l of h.listeners) l();
        },
        flush: async () => true
      };
    }
  };
});

import { Ethics } from "../components/tools/design/Ethics";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Fields = { title: string; pi: string; what: string; risks: string; benefits: string; contact: string; status: string; committee: string; apprNo: string; apprDate: string; consentMode: string; minors: string };
type Case = { id: string; input: Fields; saved: Record<string, unknown>; inserted: string | null; toasts: string[] };
const GOLDEN = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/design/cases.json"), "utf8")) as {
  minors: Array<{ m: string; display: string; text: string }>; ethics: Case[]; consent: Case[];
};
const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
const escaped = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).replace(/\n/g, "<br>");
/** page testid for each stored field */
const ID: Record<keyof Fields, string> = {
  title: "ec-title", pi: "ec-pi", what: "ec-what", risks: "ec-risks", benefits: "ec-benefits", contact: "ec-contact",
  status: "ec-status", committee: "ec-committee", apprNo: "ec-apprno", apprDate: "ec-apprdate", consentMode: "ec-consentmode", minors: "ec-minors"
};

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const T = (id: string) => `[data-testid="${id}"]`;
async function render(): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Ethics projectId="p1" />); });
  return root;
}
async function set(k: keyof Fields, value: string) {
  const el = $(T(ID[k])) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
async function fill(f: Partial<Fields>) { for (const [k, v] of Object.entries(f)) await set(k as keyof Fields, v); }
const click = async (id: string) => { await act(async () => { $(T(id))!.click(); }); };
const text = (id: string) => $(T(id))?.textContent ?? null;

beforeEach(() => {
  h.store.clear(); h.sets.length = 0; h.inserts.length = 0; h.version = 0; h.insertResult = true;
  h.loading = false; h.locked = false; h.broken = false; h.error = false;
  h.toast.mockClear();
  h.confirm.mockReturnValue(true);
  window.confirm = h.confirm;
});
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Ethics and consent (Task A2)", () => {
  it("the minors note appears when v1's does", async () => {
    expect(GOLDEN.minors.map((c) => c.m)).toEqual(["yes", "unsure", "no", ""]);
    for (const c of GOLDEN.minors) {
      // The core function is the source of the text: it returns text exactly where v1 showed the block. The tab shows the V2 note (C18, D-S2-115): v1's text with its last sentence replaced, and '' exactly where v1's is.
      expect(ecMinorsNote(c.m), c.m).toBe(c.text);
      expect(ecMinorsNoteV2(c.m) === "", c.m).toBe(c.display !== "block");
      const root = await render();
      await set("minors", c.m);
      if (c.display === "block") {
        expect(text("ec-minors-note"), c.m).toBe(ecMinorsNoteV2(c.m));
        expect($(T("ec-minors-note"))!.getAttribute("role"), c.m).toBe("status");
      } else {
        expect($(T("ec-minors-note")), c.m).toBeNull();
      }
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("a saved 'yes' or 'unsure' shows the note when the tab opens", async () => {
    h.store.set("design_ec", { minors: "unsure" });
    await render();
    expect(text("ec-minors-note")).toBe(ecMinorsNoteV2("unsure"));
  });

  it("the checklist has core's eight documents, and a tick is stored at once with done from ecDoneAfterToggle", async () => {
    expect(EC_DOCS).toHaveLength(8);
    await render();
    for (let i = 0; i < 8; i++) {
      expect(document.body.textContent).toContain(EC_DOCS[i]);
      expect(($(T("ec-doc-" + i)) as HTMLInputElement).checked).toBe(false);
    }
    await click("ec-doc-2");
    expect(h.store.get("design_ec")).toEqual({ checklist: { 2: true }, done: true });
    await click("ec-doc-5");
    expect(h.store.get("design_ec")).toEqual({ checklist: { 2: true, 5: true }, done: true });
    // Unticking the last tick clears done, as ecToggle does (6008).
    await click("ec-doc-2");
    await click("ec-doc-5");
    expect(h.store.get("design_ec")).toEqual({ checklist: { 2: false, 5: false }, done: false });
    // A tick keeps every other stored field.
    h.store.set("design_ec", { title: "T", checklist: {}, later: 1 });
    await click("ec-doc-0");
    expect(h.store.get("design_ec")).toEqual({ title: "T", checklist: { 0: true }, later: 1, done: true });
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("ticks persist and reload", async () => {
    const root = await render();
    await click("ec-doc-1");
    await click("ec-doc-7");
    await act(async () => { root.unmount(); });
    document.body.innerHTML = "";
    await render();
    const on = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => ($(T("ec-doc-" + i)) as HTMLInputElement).checked);
    expect(on).toEqual([1, 7]);
  });

  it("Save stores the twelve fields trimmed with done from ecDoneAfterSave, and toasts only Saved", async () => {
    for (const c of GOLDEN.consent) {
      h.store.clear(); h.sets.length = 0; h.toast.mockClear();
      const root = await render();
      await fill(c.input);
      await click("ec-save");
      expect(h.store.get("design_ec"), c.id).toEqual(c.saved);
      expect(h.toast.mock.calls.map((x) => x[0]), c.id).toEqual([E.design_saved]);
      expect(h.inserts, c.id).toHaveLength(0);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("Save keeps an earlier done and the ticks, and trims what was typed", async () => {
    h.store.set("design_ec", { checklist: { 3: true }, done: true });
    await render();
    await fill({ title: "  Sleep  " });
    await click("ec-save");
    expect(h.store.get("design_ec")).toMatchObject({ checklist: { 3: true }, title: "Sleep", done: true });
    await click("consent-save");
    expect(h.sets).toHaveLength(2);
  });

  it("fields persist and reload", async () => {
    const c = GOLDEN.ethics.find((x) => x.id === "approved-yes-written-filled")!;
    const root = await render();
    await fill(c.input);
    await click("ec-save");
    await act(async () => { root.unmount(); });
    document.body.innerHTML = "";
    await render();
    for (const k of Object.keys(ID) as Array<keyof Fields>) expect(($(T(ID[k])) as HTMLInputElement).value, k).toBe(c.input[k]);
    expect($(T("ec-minors-note"))).not.toBeNull();
  });

  it("the ethics statement is v1's, inserted once at the end, for every golden case; no output says exempt", async () => {
    expect(GOLDEN.ethics.length).toBeGreaterThan(200);
    const statuses = new Set<string>();
    for (const c of GOLDEN.ethics) {
      h.store.clear(); h.sets.length = 0; h.inserts.length = 0; h.toast.mockClear();
      h.store.set("design_ec", { ...c.input });
      const root = await render();
      await click("ec-statement");
      statuses.add(c.input.status);
      if (c.inserted === null) {
        // {error}: shown inline, nothing inserted, no toast.
        expect(h.inserts, c.id).toHaveLength(0);
        expect(text("ec-statement-msg"), c.id).toBe("Choose where things stand first");
        expect(h.toast, c.id).not.toHaveBeenCalled();
        expect($(T("ec-statement-reminder")), c.id).toBeNull();
      } else {
        expect(h.inserts, c.id).toHaveLength(1);
        expect(h.inserts[0]!.html, c.id).toBe(escaped(c.inserted));
        expect(h.inserts[0]!.opts, c.id).toBeUndefined();
        expect(h.inserts[0]!.html, c.id).not.toMatch(/exempt/i);
        expect(h.toast.mock.calls.map((x) => x[0]), c.id).toEqual([E.design_inserted]);
        expect(text("ec-statement-reminder"), c.id).toBe("Check every sentence is true.");
        expect(text("ec-statement-msg"), c.id).toBe("");
      }
      expect(document.body.textContent, c.id).not.toMatch(/exempt/i);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
    expect([...statuses].sort()).toEqual(["", "applied", "approved", "noreview", "none", "nohuman"].sort());
  }, 120_000);

  it("the ethics statement saves the record first (v1's ecStatement calls ecSave), also when it then refuses", async () => {
    await render();
    await fill({ title: "T", committee: "IEC" });
    await click("ec-statement");
    expect(h.store.get("design_ec")).toMatchObject({ title: "T", committee: "IEC", done: true });
    expect(h.inserts).toHaveLength(0);
    // Typing again clears the refusal.
    expect(text("ec-statement-msg")).toBe("Choose where things stand first");
    expect($(T("ec-statement-msg"))!.getAttribute("role")).toBe("status");
    await set("status", "approved");
    expect(text("ec-statement-msg")).toBe("");
  });

  it("the reminder shows after an insert and is gone when the record changes; a document that cannot take it says so instead", async () => {
    await render();
    await fill({ status: "nohuman" });
    await click("ec-statement");
    expect(text("ec-statement-reminder")).toBe("Check every sentence is true.");
    await set("committee", "x");
    expect($(T("ec-statement-reminder"))).toBeNull();
    h.insertResult = false;
    h.toast.mockClear();
    await click("ec-statement");
    expect(h.toast).not.toHaveBeenCalled();
    expect($(T("ec-statement-reminder"))).toBeNull();
    expect(text("ec-statement-msg")).toBe(E.design_insert_failed);
  });

  it("the consent form is v1's, inserted once at the end; an {error} inserts nothing and shows inline", async () => {
    expect(GOLDEN.consent.length).toBeGreaterThanOrEqual(5);
    for (const c of GOLDEN.consent) {
      h.store.clear(); h.sets.length = 0; h.inserts.length = 0; h.toast.mockClear();
      h.store.set("design_ec", { ...c.input });
      const root = await render();
      await click("consent-generate");
      if (c.inserted === null) {
        expect(h.inserts, c.id).toHaveLength(0);
        expect(text("consent-msg"), c.id).toBe("Fill in at least the study title and PI/institution first");
        expect($(T("consent-msg"))!.getAttribute("role"), c.id).toBe("status");
        expect(h.toast, c.id).not.toHaveBeenCalled();
      } else {
        expect(h.inserts, c.id).toHaveLength(1);
        expect(h.inserts[0]!.html, c.id).toBe(escaped(c.inserted));
        expect(h.inserts[0]!.opts, c.id).toBeUndefined();
        expect(h.toast.mock.calls.map((x) => x[0]), c.id).toEqual([E.design_inserted]);
        expect(text("consent-msg"), c.id).toBe("");
      }
      // v1's ecGenerateConsent saves first (ecSave).
      expect(h.store.get("design_ec"), c.id).toEqual(c.saved);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("a generator stops when its save is refused: nothing is inserted, no Inserted toast, nothing stored (locked, and broken answered No)", async () => {
    for (const mode of ["locked", "broken"] as const) {
      for (const button of ["ec-statement", "consent-generate"]) {
        h.sets.length = 0; h.inserts.length = 0; h.toast.mockClear(); h.confirm.mockReset(); h.confirm.mockReturnValue(false);
        h.locked = mode === "locked"; h.broken = mode === "broken";
        const root = await render();
        await fill({ status: "approved", title: "T", pi: "P" });
        await click(button);
        expect(h.inserts, mode + button).toHaveLength(0);
        expect(h.toast, mode + button).not.toHaveBeenCalled();
        expect(h.sets, mode + button).toHaveLength(0);
        expect($(T("ec-statement-reminder")), mode + button).toBeNull();
        await act(async () => { root.unmount(); });
        document.body.innerHTML = "";
      }
    }
  });

  it("the Hindi file has no word for exemption (rule 9): no value with छूट or exempt", () => {
    for (const [k, v] of Object.entries(designHi as Record<string, string>)) {
      expect(v, k).not.toContain("छूट");
      expect(v, k).not.toMatch(/exempt/i);
    }
  });

  it("page order follows v1: checklist, record, statement, consent form", async () => {
    await render();
    const order = ["ec-docs", "ec-record", "ec-statement", "consent-form"].map((id) => {
      const el = $(T(id))!;
      expect(el, id).not.toBeNull();
      return el;
    });
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, String(i)).toBeTruthy();
  });

  it("a locked vault is said in words and nothing is written", async () => {
    h.locked = true;
    await render();
    expect($(T("design-locked"))).not.toBeNull();
    expect($(T("ec-doc-0"))).toBeNull();
    await fill({ title: "x" });
    await click("ec-save");
    expect(h.sets).toHaveLength(0);
  });

  it("the document ticks are off while the saved ticks open, not offered while locked or unreadable, and back when they are read (O7 for ticks)", async () => {
    h.loading = true;
    await render();
    for (let i = 0; i < EC_DOCS.length; i++) expect(($(T("ec-doc-" + i)) as HTMLInputElement).disabled, "doc " + i).toBe(true);
    await click("ec-doc-0");
    expect(h.sets).toHaveLength(0);
    for (const mode of ["locked", "error"] as const) {
      for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
      document.body.innerHTML = "";
      h.loading = false; h.locked = mode === "locked"; h.error = mode === "error";
      await render();
      expect($(T("ec-docs")), mode).toBeNull();
      expect($(T("ec-doc-0")), mode).toBeNull();
      expect($(T("ec-title")), mode).not.toBeNull();
    }
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.locked = false; h.error = false;
    await render();
    expect(($(T("ec-doc-0")) as HTMLInputElement).disabled).toBe(false);
    await click("ec-doc-0");
    expect(h.sets).toHaveLength(1);
  });

  it("a blob that does not open asks once before it is replaced, and a No saves nothing", async () => {
    h.broken = true;
    h.confirm.mockReturnValue(false);
    await render();
    expect($(T("design-broken"))).not.toBeNull();
    await click("ec-doc-0");
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.sets).toHaveLength(0);
  });

  it("the page's own words never say exempt (rule 9)", async () => {
    await render();
    expect(document.body.textContent).not.toMatch(/exempt/i);
    expect(document.body.textContent).toContain(E.design_ec_record_desc);
  });
});
