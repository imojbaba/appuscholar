// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUDGET_DEFAULTS, budgetDone, budgetMarkdown, budgetRows, budgetTotalText } from "@appuscholar/core";
import en from "../messages/en.json";
import designEn from "../messages/tools/design.en.json";

/*
 * Task A3, Budget (the trial budget estimator; v1 budgetRows, budgetRender, budgetEdit, budgetAddRow, budgetRemove, budgetTotal, budgetExport 6130-6178
 * and the dialog 1936-1948). The expected texts are core's, read from the golden fixture test/golden/design/cases.json (`budget`, `ops`). The blobs are
 * an in-memory store; downloadBlob is a spy.
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/design/budget" }));
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

import { Budget } from "../components/tools/design/Budget";
import { Panel } from "../components/tools/design/Panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { label: string; amount: string };
const GOLDEN = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/design/cases.json"), "utf8")) as {
  budget: Array<{ id: string; stored: Row[] | null; rows: Row[]; totalText: string; text: string; type: string }>;
  ops: Array<{ id: string; key: string; steps: Array<{ op: { op: string; i?: number; field?: "label" | "amount"; val?: string }; after: { rows: Row[]; done: boolean } }> }>;
};
const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
const NOW = new Date(2026, 9, 21, 23, 30);
const DAY = "2026-10-21";

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const T = (id: string) => `[data-testid="${id}"]`;
const textOf = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });
async function render(): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Budget projectId="p1" now={() => NOW} />); });
  return root;
}
async function type(id: string, value: string) {
  const el = $(T(id)) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = async (id: string) => { await act(async () => { $(T(id))!.click(); }); };
const text = (id: string) => $(T(id))?.textContent ?? null;
/** The rows as the page shows them. */
const shown = (): Row[] => {
  const out: Row[] = [];
  for (let i = 0; $(T("budget-label-" + i)); i++) out.push({ label: ($(T("budget-label-" + i)) as HTMLInputElement).value, amount: ($(T("budget-amount-" + i)) as HTMLInputElement).value });
  return out;
};
/** What a number box shows of a stored amount: a value that is not a number (from older data) shows empty, as in the browser; it is kept in the blob and core counts it as 0. */
const asBox = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, amount: Number.isFinite(Number(r.amount)) ? r.amount : "" }));
const stored = () => h.store.get("design_budget") as { rows: Row[]; done: boolean } | undefined;

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

describe("Budget (Task A3)", () => {
  it("nothing stored: core's seven default rows with empty amounts, and nothing is written by looking", async () => {
    await render();
    expect(shown()).toEqual(BUDGET_DEFAULTS.map((label) => ({ label, amount: "" })));
    expect(shown()).toEqual(budgetRows(null));
    expect(h.sets).toHaveLength(0);
  });

  it("the golden edit, add and remove steps leave v1's rows and done (add and remove leave done as it was)", async () => {
    const ops = GOLDEN.ops.find((o) => o.key === "budget")!;
    expect(ops.steps.map((s) => s.op.op)).toContain("budgetRemove");
    expect(ops.steps.map((s) => s.op.op)).toContain("budgetAddRow");
    let root = await render();
    for (const s of ops.steps) {
      const o = s.op;
      if (o.op === "budgetEdit") {
        const id = (o.field === "label" ? "budget-label-" : "budget-amount-") + o.i;
        // A number box refuses letters, as v1's did; a stored value that is not a number is still shown and still counts as 0 (core), so that step is applied to the store.
        if (o.field === "amount" && !Number.isFinite(Number(o.val)) && o.val !== "") {
          const cur = stored()!;
          h.store.set("design_budget", { ...cur, rows: s.after.rows, done: s.after.done });
          await act(async () => { root.unmount(); });
          document.body.innerHTML = "";
          root = await render();
        } else {
          await type(id, o.val!);
        }
      } else if (o.op === "budgetAddRow") {
        await click("budget-add");
      } else {
        await click("budget-remove-" + o.i);
      }
      expect(stored()!.rows, JSON.stringify(o)).toEqual(s.after.rows);
      expect(stored()!.done, JSON.stringify(o)).toBe(s.after.done);
      expect(shown(), JSON.stringify(o)).toEqual(asBox(s.after.rows));
      expect(stored()!.done).toBe(s.op.op === "budgetEdit" ? budgetDone(stored()!.rows) : s.after.done);
    }
  });

  it("add appends one empty row and remove drops that index, from the defaults when nothing is stored", async () => {
    await render();
    await click("budget-add");
    expect(stored()!.rows).toEqual([...budgetRows(null), { label: "", amount: "" }]);
    expect(shown()).toHaveLength(8);
    await click("budget-remove-1");
    expect(stored()!.rows.map((r) => r.label)).toEqual(["Site costs", "Statistician time", "Publication / open-access costs", "Travel", "Equipment", "Contingency (10-15%)", ""]);
    // Every row can be removed, as v1's: the rows stored are then none, and the page shows the defaults again (core's budgetRows, as v1's budgetRender).
    for (let i = 6; i >= 0; i--) await click("budget-remove-" + i);
    expect(stored()!.rows).toEqual([]);
    expect(shown()).toEqual(budgetRows(null));
  });

  it("the total is core's budgetTotalText for every golden case, and follows an edit", async () => {
    expect(GOLDEN.budget.length).toBeGreaterThan(5);
    for (const c of GOLDEN.budget) {
      h.store.clear();
      if (c.stored !== null) h.store.set("design_budget", { rows: c.stored, done: true });
      const root = await render();
      expect(shown(), c.id).toEqual(asBox(c.rows));
      expect(text("budget-total"), c.id).toBe(c.totalText);
      expect(text("budget-total"), c.id).toBe(budgetTotalText(c.rows));
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
    h.store.clear();
    await render();
    await type("budget-amount-0", "1000000");
    await type("budget-amount-1", "234567");
    expect(text("budget-total")).toBe("Total: ₹12,34,567");
  });

  it("downloads carry v1's file name and body: every golden case", async () => {
    for (const c of GOLDEN.budget) {
      h.store.clear(); h.downloads.length = 0;
      if (c.stored !== null) h.store.set("design_budget", { rows: c.stored, done: true });
      const root = await render();
      await click("budget-export");
      expect(h.downloads, c.id).toHaveLength(1);
      const d = h.downloads[0]!;
      expect(d.name, c.id).toBe(`trial-budget-${DAY}.md`);
      expect(await textOf(d.blob), c.id).toBe(c.text);
      expect(await textOf(d.blob), c.id).toBe(budgetMarkdown(c.rows));
      expect(d.blob.type, c.id).toBe(c.type);
      expect(text("budget-msg"), c.id).toBe(E.design_exported!.replace("{name}", d.name));
      expect($(T("budget-msg"))!.getAttribute("role")).toBe("status");
      expect(h.toast, c.id).not.toHaveBeenCalled();
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("done follows core's budgetDone on an edit and persists with the rows", async () => {
    const root = await render();
    await type("budget-amount-0", "500");
    expect(stored()!.done).toBe(true);
    await type("budget-amount-0", "0");
    expect(stored()!.done).toBe(false);
    await type("budget-amount-3", "0.5");
    expect(stored()!.done).toBe(true);
    await act(async () => { root.unmount(); });
    document.body.innerHTML = "";
    await render();
    expect(shown()[3]).toEqual({ label: "Publication / open-access costs", amount: "0.5" });
  });

  it("the boxes have names a screen reader can say, per line item", async () => {
    await render();
    expect($(T("budget-label-0"))!.getAttribute("aria-label")).toBe(E.design_budget_label!.replace("{n}", "1"));
    expect($(T("budget-amount-2"))!.getAttribute("aria-label")).toBe(E.design_budget_amount!.replace("{n}", "3"));
    expect($(T("budget-remove-6"))!.getAttribute("aria-label")).toBe(E.design_budget_remove!.replace("{n}", "7"));
  });

  it("nothing is downloaded or written while the saved rows are not known; a locked vault is said in words", async () => {
    for (const mode of ["loading", "locked", "broken"] as const) {
      h.loading = mode === "loading"; h.locked = mode === "locked"; h.broken = mode === "broken";
      h.confirm.mockReturnValue(false);
      const root = await render();
      expect(($(T("budget-export")) as HTMLButtonElement).disabled, mode).toBe(true);
      await click("budget-export");
      await type("budget-amount-0", "5");
      await click("budget-add");
      expect(h.downloads, mode).toHaveLength(0);
      expect(h.sets, mode).toHaveLength(0);
      if (mode === "locked") expect($(T("design-locked"))).not.toBeNull();
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("the Panel draws it for the budget tab, and the intro is v1's sentence", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    await act(async () => { root.render(<Panel tab="budget" projectId="p1" />); });
    expect($(T("panel-design-budget"))).not.toBeNull();
    expect(document.body.textContent).toContain("This doesn't move or hold any real money.");
  });
});
