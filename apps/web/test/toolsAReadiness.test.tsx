// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CTRI_FIELDS, PI_ITEMS, checklistDone, ctriMarkdown, piCvText, piDone } from "@appuscholar/core";
import en from "../messages/en.json";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";

/*
 * Task A3, Registration (CTRI readiness; v1 ctriRender, ctriToggle, ctriExport 6072-6096 and the dialog 1912-1921) and Investigator (PI eligibility and
 * training; v1 piRender, piToggle, piSave, piExportCv 6098-6128 and the dialog 1923-1934). The expected files are core's, read from the golden fixture
 * test/golden/design/cases.json (`ctri`, `pi`, `ops`). The blobs are an in-memory store; downloadBlob is a spy.
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
  downloads: [] as Array<{ name: string; blob: Blob }>,
  toast: vi.fn(),
  confirm: vi.fn(() => true)
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/design/registration" }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: (name: string, blob: Blob) => { h.downloads.push({ name, blob }); } }));
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

import { Investigator } from "../components/tools/design/Investigator";
import { Registration } from "../components/tools/design/Registration";
import { Panel } from "../components/tools/design/Panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GOLDEN = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/design/cases.json"), "utf8")) as {
  ctri: Array<{ id: string; checks: Record<string, boolean>; text: string; type: string }>;
  pi: Array<{ id: string; cv: string; text: string | null; type: string | null }>;
  ops: Array<{ id: string; key: string; steps: Array<{ op: { op: string; i?: number; v?: boolean; cv?: string }; after: Record<string, unknown> }> }>;
};
const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
/** 21 October 2026, late evening local time: the file's date is the local day. */
const NOW = new Date(2026, 9, 21, 23, 30);
const DAY = "2026-10-21";

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const T = (id: string) => `[data-testid="${id}"]`;
const textOf = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });
async function render(ui: "ctri" | "pi"): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(ui === "ctri" ? <Registration projectId="p1" now={() => NOW} /> : <Investigator projectId="p1" now={() => NOW} />); });
  return root;
}
async function again(root: Root, ui: "ctri" | "pi") { await act(async () => { root.unmount(); }); document.body.innerHTML = ""; return render(ui); }
async function setCv(value: string) {
  const el = $(T("pi-cv")) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = async (id: string) => { await act(async () => { $(T(id))!.click(); }); };
const text = (id: string) => $(T(id))?.textContent ?? null;
const checked = (id: string) => ($(T(id)) as HTMLInputElement).checked;

beforeEach(() => {
  h.store.clear(); h.sets.length = 0; h.downloads.length = 0; h.version = 0;
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

describe("Registration: CTRI readiness (Task A3)", () => {
  it("the checklist has core's thirteen fields, in order, and says the app never submits", async () => {
    await render("ctri");
    expect(CTRI_FIELDS).toHaveLength(13);
    for (let i = 0; i < CTRI_FIELDS.length; i++) {
      const box = $(T("ctri-field-" + i))!;
      expect(box, String(i)).not.toBeNull();
      expect(box.closest("label")!.textContent, String(i)).toBe(CTRI_FIELDS[i]);
    }
    expect($(T("ctri-field-13"))).toBeNull();
    expect(text("ctri-never")).toBe(E.design_ctri_never);
    expect(E.design_ctri_never).toMatch(/never submits/);
  });

  it("ticks persist and reload, and done follows core's checklistDone for every golden step", async () => {
    const ops = GOLDEN.ops.find((o) => o.key === "ctri")!;
    let root = await render("ctri");
    for (const s of ops.steps) {
      const i = s.op.i!;
      // A click on the box toggles it: the golden step's value is the state after the click.
      if (checked("ctri-field-" + i) !== s.op.v) await click("ctri-field-" + i);
      const stored = h.store.get("design_ctri") as { checklist: Record<string, boolean>; done: boolean };
      expect(stored.checklist, JSON.stringify(s.op)).toEqual(s.after.checklist);
      expect(stored.done, JSON.stringify(s.op)).toBe(s.after.done);
      expect(stored.done).toBe(checklistDone(stored.checklist as unknown as Record<number, boolean>));
    }
    // Reloaded: the ticks are as stored.
    h.store.set("design_ctri", { checklist: { 0: true, 4: true }, done: true });
    root = await again(root, "ctri");
    expect(CTRI_FIELDS.map((_, i) => checked("ctri-field-" + i))).toEqual(CTRI_FIELDS.map((_, i) => i === 0 || i === 4));
  });

  it("downloads carry v1's file name and body: every golden case", async () => {
    expect(GOLDEN.ctri.length).toBeGreaterThan(1);
    for (const c of GOLDEN.ctri) {
      h.store.clear(); h.downloads.length = 0;
      h.store.set("design_ctri", { checklist: c.checks, done: true });
      const root = await render("ctri");
      await click("ctri-export");
      expect(h.downloads, c.id).toHaveLength(1);
      const d = h.downloads[0]!;
      expect(d.name, c.id).toBe(`ctri-readiness-${DAY}.md`);
      expect(await textOf(d.blob), c.id).toBe(c.text);
      expect(await textOf(d.blob), c.id).toBe(ctriMarkdown(c.checks as unknown as Record<number, boolean>));
      expect(d.blob.type, c.id).toBe(c.type);
      // The page says what was downloaded, in a status region (no toast: v2 toasts only Saved and Inserted).
      expect(text("ctri-msg"), c.id).toBe(E.design_exported!.replace("{name}", d.name));
      expect($(T("ctri-msg"))!.getAttribute("role")).toBe("status");
      expect(h.toast).not.toHaveBeenCalled();
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("with nothing stored the report is the all-unticked one, as v1's", async () => {
    await render("ctri");
    await click("ctri-export");
    expect(await textOf(h.downloads[0]!.blob)).toBe(GOLDEN.ctri.find((c) => c.id === "none")!.text);
    expect(h.sets).toHaveLength(0);
  });

  it("nothing is downloaded while the saved ticks are not known (opening, locked, unreadable)", async () => {
    for (const mode of ["loading", "locked", "broken"] as const) {
      h.downloads.length = 0;
      h.loading = mode === "loading"; h.locked = mode === "locked"; h.broken = mode === "broken";
      const root = await render("ctri");
      expect(($(T("ctri-export")) as HTMLButtonElement).disabled, mode).toBe(true);
      await click("ctri-export");
      expect(h.downloads, mode).toHaveLength(0);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("a locked vault is said in words and a tick writes nothing", async () => {
    h.locked = true;
    await render("ctri");
    expect($(T("design-locked"))).not.toBeNull();
    await click("ctri-field-0");
    expect(h.sets).toHaveLength(0);
  });

  it("the Panel draws it for the registration tab", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    await act(async () => { root.render(<Panel tab="registration" projectId="p1" />); });
    expect($(T("panel-design-registration"))).not.toBeNull();
  });
});

describe("Investigator: PI eligibility and training (Task A3)", () => {
  it("the checklist has core's six items, and the CV box and buttons are there", async () => {
    await render("pi");
    expect(PI_ITEMS).toHaveLength(6);
    for (let i = 0; i < PI_ITEMS.length; i++) expect($(T("pi-item-" + i))!.closest("label")!.textContent, String(i)).toBe(PI_ITEMS[i]);
    expect($(T("pi-item-6"))).toBeNull();
    expect($(T("pi-cv"))).not.toBeNull();
    expect(text("pi-save")).toBe(E.design_save);
    expect(text("pi-export")).toBe(E.design_pi_export);
  });

  it("ticks and Save follow v1's golden steps: the stored checklist, trimmed cv and done", async () => {
    const ops = GOLDEN.ops.find((o) => o.key === "pi")!;
    await render("pi");
    for (const s of ops.steps) {
      if (s.op.op === "piToggle") {
        if (checked("pi-item-" + s.op.i!) !== s.op.v) await click("pi-item-" + s.op.i!);
      } else {
        await setCv(s.op.cv!);
        await click("pi-save");
      }
      const stored = h.store.get("design_pi") as { checklist: Record<string, boolean>; cv?: string; done: boolean };
      expect(stored.checklist, JSON.stringify(s.op)).toEqual(s.after.checklist);
      expect(stored.done, JSON.stringify(s.op)).toBe(s.after.done);
      if ("cv" in s.after) expect(stored.cv, JSON.stringify(s.op)).toBe(s.after.cv);
    }
    expect(h.toast).toHaveBeenCalledWith(E.design_saved);
  });

  it("the ticks and the cv persist and reload; done by core's piDone", async () => {
    h.store.set("design_pi", { checklist: { 1: true, 5: true }, cv: "Dr A. Rao", done: true });
    await render("pi");
    expect([0, 1, 2, 3, 4, 5].map((i) => checked("pi-item-" + i))).toEqual([false, true, false, false, false, true]);
    expect(($(T("pi-cv")) as HTMLTextAreaElement).value).toBe("Dr A. Rao");
    expect(piDone({ done: false, cv: "x" })).toBe(true);
  });

  it("downloads carry v1's file name and body, and the error case downloads nothing: every golden case", async () => {
    expect(GOLDEN.pi.map((c) => c.id)).toEqual(["empty", "filled"]);
    for (const c of GOLDEN.pi) {
      h.downloads.length = 0; h.store.clear();
      const root = await render("pi");
      await setCv(c.cv);
      await click("pi-export");
      const expected = piCvText(c.cv.trim());
      if (c.text === null) {
        expect(h.downloads, c.id).toHaveLength(0);
        expect(typeof expected === "object" && "error" in expected, c.id).toBe(true);
        // core's refusal, inline, in a status region
        expect(text("pi-msg"), c.id).toBe((expected as { error: string }).error);
        expect($(T("pi-msg"))!.getAttribute("role")).toBe("status");
      } else {
        expect(h.downloads, c.id).toHaveLength(1);
        expect(h.downloads[0]!.name, c.id).toBe(`pi-cv-${DAY}.txt`);
        expect(await textOf(h.downloads[0]!.blob), c.id).toBe(c.text);
        expect(h.downloads[0]!.blob.type, c.id).toBe(c.type);
        expect(text("pi-msg"), c.id).toBe(E.design_exported!.replace("{name}", `pi-cv-${DAY}.txt`));
      }
      // v1's piExportCv saves first, so the trimmed cv is stored either way.
      expect((h.store.get("design_pi") as { cv: string }).cv, c.id).toBe(c.cv.trim());
      expect(h.toast, c.id).not.toHaveBeenCalled();
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("an export stops when its save is refused: nothing is downloaded or stored (locked, and broken answered No)", async () => {
    for (const mode of ["locked", "broken"] as const) {
      h.sets.length = 0; h.downloads.length = 0; h.confirm.mockReset(); h.confirm.mockReturnValue(false);
      h.locked = mode === "locked"; h.broken = mode === "broken";
      const root = await render("pi");
      await setCv("Dr A. Rao");
      await click("pi-export");
      expect(h.downloads, mode).toHaveLength(0);
      expect(h.sets, mode).toHaveLength(0);
      expect(h.toast, mode).not.toHaveBeenCalled();
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("typing a new cv clears the last message", async () => {
    await render("pi");
    await click("pi-export");
    expect(text("pi-msg")).not.toBe("");
    await setCv("x");
    expect(text("pi-msg")).toBe("");
  });

  it("a locked vault is said in words and a tick writes nothing", async () => {
    h.locked = true;
    await render("pi");
    expect($(T("design-locked"))).not.toBeNull();
    await click("pi-item-0");
    expect(h.sets).toHaveLength(0);
  });
});

describe("the words (Task A3)", () => {
  it("new strings carry no em-dash and no emoji, and the Hindi file has no word for exemption", () => {
    for (const [k, v] of Object.entries(designEn as Record<string, string>)) if (/^design_(ctri|pi|budget|exp|exported)/.test(k)) {
      expect(v, k).not.toMatch(/—/);
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    for (const [k, v] of Object.entries(designHi as Record<string, string>)) { expect(v, k).not.toContain("छूट"); expect(v, k).not.toMatch(/exempt/i); }
  });

  it("every new English key has a Hindi key", () => {
    for (const k of Object.keys(designEn as Record<string, string>)) if (/^design_(ctri|pi|budget|exp|exported)/.test(k)) expect((designHi as Record<string, string>)[k], k).toBeTruthy();
  });
});
