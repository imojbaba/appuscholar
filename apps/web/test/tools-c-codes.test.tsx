// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qualDeleteCascade, type QualCode } from "@appuscholar/core";
import en from "../messages/en.json";
import qualEn from "../messages/tools/qual.en.json";

/*
 * Task C1: the Coding tab's code tree (v1 qualAddCode / qualRenameCode / qualDeleteCode / qualRenderTree 6190-6244, 6269-6288; the panel 782-792).
 * useProjectBlob is replaced by a store that applies set() the way the real one does (a value, or an update of the current one), so the panel is
 * drawn from what it wrote.
 */

type Snap = { value: unknown; loading: boolean; locked: boolean; broken?: boolean };
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Snap>,
  subs: new Set<() => void>(),
  sets: [] as Array<{ kind: string; updater: boolean }>
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useSyncExternalStore } = await import("react");
  const sub = (f: () => void) => { h.subs.add(f); return () => { h.subs.delete(f); }; };
  return {
    useProjectBlob: (kind: string) => {
      const snap = useSyncExternalStore(sub, () => h.blobs[kind]!);
      return {
        ...snap,
        set: (next: unknown) => {
          const cur = h.blobs[kind]!;
          h.sets.push({ kind, updater: typeof next === "function" });
          const value = typeof next === "function" ? (next as (p: unknown) => unknown)(cur.value) : next;
          h.blobs[kind] = { ...cur, value };
          for (const f of h.subs) f();
        },
        flush: async () => true,
        readOnly: false
      };
    }
  };
});

import { Panel } from "../components/tools/qual/Panel";
import { facts } from "../components/tools/qual";
import { useCodes } from "../lib/tools/qual/useCodes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...(en as Record<string, string>), ...(qualEn as Record<string, string>) };
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
}
async function click(id: string) {
  const el = tid(id);
  if (!el) throw new Error("no element " + id);
  await act(async () => { el.click(); });
}
async function type(id: string, value: string) {
  const el = tid(id) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(id: string, k: string) {
  const el = tid(id)!;
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); });
}
const codes = (): QualCode[] => h.blobs.qual_codes!.value as QualCode[];
const C = (id: string, name: string, parentId: string | null, color = "#f59e0b"): QualCode => ({ id, name, parentId, color });
const TREE: QualCode[] = [C("qa", "Coping", null), C("qb", "Barriers", null, "#10b981"), C("qc", "Social support", "qa", "#3b82f6"), C("qd", "Family", "qc", "#ef4444")];

beforeEach(() => {
  h.blobs = { qual_codes: { value: [], loading: false, locked: false }, qual_prefs: { value: null, loading: false, locked: false } };
  h.sets = [];
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("the colour of a new code (v1 qualNextColor 6189)", () => {
  type Api = ReturnType<typeof useCodes>;
  const CASES = (JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/qual/cases.json"), "utf8")) as { nextColor: Array<{ count: number; color: string }> }).nextColor;

  it("13 next-colour cases match v1", async () => {
    expect(CASES).toHaveLength(13);
    let api: Api | null = null;
    function Harness() { const a = useCodes("p1"); useEffect(() => { api = a; }); return null; }
    await render(<Harness />);
    for (const c of CASES) {
      // `count` codes already stored: the new one takes v1's colour for that count, whatever the colours stored are.
      h.blobs.qual_codes = { value: Array.from({ length: c.count }, (_, i) => C("x" + i, "c" + i, null, "#000000")), loading: false, locked: false };
      await act(async () => { for (const f of h.subs) f(); });
      let added: QualCode | null = null;
      await act(async () => { added = api!.add("New", null); });
      expect(added!.color, "count " + c.count).toBe(c.color);
      expect(codes().at(-1)!.color, "stored, count " + c.count).toBe(c.color);
      expect(codes()).toHaveLength(c.count + 1);
    }
  });

  it("add uses the update form of set(), with the id v1 makes", async () => {
    let api: Api | null = null;
    function Harness() { const a = useCodes("p1"); useEffect(() => { api = a; }); return null; }
    await render(<Harness />);
    await act(async () => { api!.add("  Coping  ", null); });
    expect(h.sets.filter((s) => s.kind === "qual_codes").every((s) => s.updater)).toBe(true);
    expect(codes()[0]).toMatchObject({ name: "Coping", parentId: null, color: "#f59e0b" });
    expect(codes()[0]!.id).toMatch(/^q[0-9a-z]+$/);
  });
});

describe("the code tree", () => {
  it("shows the empty note and no tree rows when there are no codes", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("qual-empty")!.textContent).toBe(E.qual_empty_note);
    expect(tid("qual-tree")?.querySelectorAll("[data-testid^='qual-code-']").length ?? 0).toBe(0);
    expect(document.body.textContent).toContain(E.qual_panel_desc);
  });

  it("draws nothing for another tab", async () => {
    await render(<Panel tab="data" projectId="p1" />);
    expect(document.body.textContent).toBe("");
  });

  it("renders the tree from the top, 18px more indent for each level, and never a code whose parent is missing", async () => {
    h.blobs.qual_codes!.value = [...TREE, C("qz", "Orphan", "gone")];
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("qual-empty")).toBeNull();
    const row = (id: string) => tid("qual-code-" + id)!;
    expect([row("qa"), row("qb"), row("qc"), row("qd")].map((r) => r.style.paddingLeft)).toEqual(["0px", "0px", "18px", "36px"]);
    expect(tid("qual-code-qz")).toBeNull();
    // v1 order: a code, then its sub-codes, then the next top-level code.
    expect([...tid("qual-tree")!.children].map((r) => r.getAttribute("data-testid"))).toEqual(["qual-code-qa", "qual-code-qc", "qual-code-qd", "qual-code-qb"]);
    expect(row("qc").textContent).toContain("Social support");
    expect(row("qc").querySelector<HTMLElement>("[data-testid='qual-swatch-qc']")!.style.backgroundColor).not.toBe("");
  });

  it("every action has an accessible name and the v1 tooltip", async () => {
    h.blobs.qual_codes!.value = [C("qa", "Coping", null)];
    await render(<Panel tab="coding" projectId="p1" />);
    const add = tid("qual-add-sub-qa")!, ren = tid("qual-rename-qa")!, del = tid("qual-delete-qa")!;
    expect(add.getAttribute("aria-label")).toBe("Add a sub-code to Coping");
    expect(ren.getAttribute("aria-label")).toBe("Rename Coping");
    expect(del.getAttribute("aria-label")).toBe("Delete Coping");
    expect([add.title, ren.title, del.title]).toEqual(["Add a sub-code", "Rename", "Delete"]);
    expect(tid("qual-add-top")!.textContent).toBe(E.qual_add_top_btn);
  });

  it("adds a top-level code from an inline field: Enter or Add saves, the name is trimmed, and the status line says so", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("qual-name-input")).toBeNull();
    await click("qual-add-top");
    expect(tid("qual-name-input")).not.toBeNull();
    expect(document.activeElement).toBe(tid("qual-name-input"));
    expect(document.body.textContent).toContain("Name for this new code:");
    await type("qual-name-input", "  Coping  ");
    await key("qual-name-input", "Enter");
    expect(codes()).toHaveLength(1);
    expect(codes()[0]).toMatchObject({ name: "Coping", parentId: null, color: "#f59e0b" });
    expect(tid("qual-name-input")).toBeNull();
    expect(tid("qual-code-" + codes()[0]!.id)!.textContent).toContain("Coping");
    expect(tid("qual-empty")).toBeNull();
    const status = tid("qual-status")!;
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Code added: Coping");
    // and with the Add button
    await click("qual-add-top");
    await type("qual-name-input", "Barriers");
    await click("qual-name-submit");
    expect(codes().map((c) => [c.name, c.color])).toEqual([["Coping", "#f59e0b"], ["Barriers", "#10b981"]]);
  });

  it("an empty or blank name adds nothing, and Escape or Cancel closes the field without adding", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-add-top");
    await key("qual-name-input", "Enter");
    await type("qual-name-input", "   ");
    await click("qual-name-submit");
    await key("qual-name-input", "Enter");
    expect(codes()).toEqual([]);
    expect(h.sets.filter((s) => s.kind === "qual_codes")).toEqual([]);
    await type("qual-name-input", "Draft");
    await key("qual-name-input", "Escape");
    expect(tid("qual-name-input")).toBeNull();
    expect(codes()).toEqual([]);
    await click("qual-add-top");
    await click("qual-name-cancel");
    expect(tid("qual-name-input")).toBeNull();
    expect(codes()).toEqual([]);
    expect(tid("qual-status")!.textContent).toBe("");
  });

  it("adds a sub-code under a row with the parent set and the next colour", async () => {
    h.blobs.qual_codes!.value = [C("qa", "Coping", null), C("qb", "Barriers", null, "#10b981")];
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-add-sub-qa");
    // the field sits under the row, and says it is for a sub-code
    expect(tid("qual-code-qa")!.nextElementSibling!.contains(tid("qual-name-input"))).toBe(true);
    expect(document.body.textContent).toContain("Name for this sub-code:");
    await type("qual-name-input", "Social support");
    await key("qual-name-input", "Enter");
    expect(codes()).toHaveLength(3);
    expect(codes()[2]).toMatchObject({ name: "Social support", parentId: "qa", color: "#3b82f6" });
    expect(tid("qual-code-" + codes()[2]!.id)!.style.paddingLeft).toBe("18px");
  });

  it("renames in place: the field replaces the name, prefilled, and an empty name leaves it", async () => {
    h.blobs.qual_codes!.value = [C("qa", "Coping", null)];
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-rename-qa");
    const input = tid("qual-name-input") as HTMLInputElement;
    expect(input.value).toBe("Coping");
    expect(tid("qual-code-qa")!.contains(input)).toBe(true);
    expect(document.body.textContent).toContain("Rename this code:");
    await type("qual-name-input", "   ");
    await key("qual-name-input", "Enter");
    expect(codes()[0]!.name).toBe("Coping");
    await type("qual-name-input", "  Coping with stress ");
    await click("qual-name-submit");
    expect(codes()[0]).toMatchObject({ id: "qa", name: "Coping with stress", parentId: null, color: "#f59e0b" });
    expect(tid("qual-name-input")).toBeNull();
    // Escape keeps the old name
    await click("qual-rename-qa");
    await type("qual-name-input", "Other");
    await key("qual-name-input", "Escape");
    expect(codes()[0]!.name).toBe("Coping with stress");
  });

  it("delete asks inline with v1's sentence and the sub-code count; Keep changes nothing", async () => {
    h.blobs.qual_codes!.value = TREE;
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-delete-qa");
    const want = qualDeleteCascade(TREE, "qa")!.confirm;
    expect(want).toBe("Delete \"Coping\" and its 2 sub-code(s)? The passage text itself stays in your document — only the tag is removed.");
    expect(tid("qual-delete-confirm")!.textContent).toContain(want);
    await click("qual-delete-keep");
    expect(tid("qual-delete-confirm")).toBeNull();
    expect(codes()).toEqual(TREE);
    // a code with no sub-codes: no count
    await click("qual-delete-qb");
    expect(tid("qual-delete-confirm")!.textContent).toContain("Delete \"Barriers\"? The passage text itself stays");
  });

  it("Delete removes the code and its sub-codes, says so, and hands the removed ids to the seam", async () => {
    h.blobs.qual_codes!.value = TREE;
    await render(<Panel tab="coding" projectId="p1" />);
    await click("qual-delete-qa");
    await click("qual-delete-confirm-yes");
    expect(codes().map((c) => c.id)).toEqual(["qb"]);
    expect(tid("qual-delete-confirm")).toBeNull();
    expect(tid("qual-status")!.textContent).toBe(E.qual_status_deleted);
  });

  it("useCodes.remove returns the removed ids and calls onDeleted with them (C2 strips the spans there)", async () => {
    h.blobs.qual_codes!.value = TREE;
    const onDeleted = vi.fn();
    let api: ReturnType<typeof useCodes> | null = null;
    function Harness() { const a = useCodes("p1", { onDeleted }); useEffect(() => { api = a; }); return null; }
    await render(<Harness />);
    let removed: string[] | null = null;
    await act(async () => { removed = api!.remove("qc"); });
    expect(removed).toEqual(["qc", "qd"]);
    expect(onDeleted).toHaveBeenCalledWith(["qc", "qd"]);
    expect(codes().map((c) => c.id)).toEqual(["qa", "qb"]);
    await act(async () => { removed = api!.remove("nope"); });
    expect(removed).toBeNull();
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});

describe("a code list that cannot be walked", () => {
  const CYCLE = [C("qa", "A", "qb"), C("qb", "B", "qa")];
  const SELF = [C("qa", "A", "qa")];

  it.each([["a loop of parents", CYCLE], ["a self-parent", SELF], ["a loop through a duplicated id", [C("a", "A", null), C("a", "A2", "b"), C("b", "B", "a")]]])(
    "%s shows the damaged message and no tree, and nothing throws", async (_n, list) => {
      h.blobs.qual_codes!.value = list;
      await render(<Panel tab="coding" projectId="p1" />);
      expect(tid("qual-damaged")!.textContent).toBe(E.qual_damaged);
      expect(tid("qual-tree")).toBeNull();
      expect(tid("qual-empty")).toBeNull();
      expect(tid("qual-add-top")).toBeNull();
    });

  it("add, rename and remove do nothing to such a list", async () => {
    h.blobs.qual_codes!.value = CYCLE;
    let api: ReturnType<typeof useCodes> | null = null;
    function Harness() { const a = useCodes("p1"); useEffect(() => { api = a; }); return null; }
    await render(<Harness />);
    expect(api!.damaged).toBe(true);
    let r: unknown[] = [];
    await act(async () => { r = [api!.add("x", null), api!.add("x", "qa"), api!.rename("qa", "y"), api!.remove("qa")]; });
    expect(r).toEqual([null, null, false, null]);
    expect(codes()).toEqual(CYCLE);
    expect(h.sets.filter((s) => s.kind === "qual_codes")).toEqual([]);
  });

  it("a list that is only a tree is not damaged, a missing parent included", async () => {
    let api: ReturnType<typeof useCodes> | null = null;
    h.blobs.qual_codes!.value = [...TREE, C("qz", "Orphan", "gone")];
    function Harness() { const a = useCodes("p1"); useEffect(() => { api = a; }); return null; }
    await render(<Harness />);
    expect(api!.damaged).toBe(false);
  });
});

describe("the blob's states", () => {
  it("shows the loading sign while the codes are read, never the empty note", async () => {
    h.blobs.qual_codes = { value: null, loading: true, locked: false };
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("panel-loading")).not.toBeNull();
    expect(tid("qual-empty")).toBeNull();
    expect(tid("qual-add-top")).toBeNull();
  });

  it("a locked vault says so: no empty note, nothing to add to", async () => {
    h.blobs.qual_codes = { value: null, loading: false, locked: true };
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("qual-locked")!.textContent).toBe(E.qual_codes_locked);
    expect(tid("qual-empty")).toBeNull();
    expect((tid("qual-add-top") as HTMLButtonElement).disabled).toBe(true);
  });

  it("codes that do not open say so and ask before anything is set over them (R16)", async () => {
    h.blobs.qual_codes = { value: null, loading: false, locked: false, broken: true };
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("qual-broken")!.textContent).toBe(E.qual_codes_broken);
    expect(tid("qual-empty")).toBeNull();
    expect((tid("qual-add-top") as HTMLButtonElement).disabled).toBe(true);
    expect(h.sets).toEqual([]);
    await click("qual-replace-broken");
    expect((tid("qual-add-top") as HTMLButtonElement).disabled).toBe(false);
    expect(h.sets).toEqual([]);
    await click("qual-add-top");
    await type("qual-name-input", "Fresh");
    await key("qual-name-input", "Enter");
    expect(codes().map((c) => c.name)).toEqual(["Fresh"]);
  });

  it("a value that is not a list of codes is shown as damaged, not crashed on", async () => {
    h.blobs.qual_codes = { value: { not: "a list" }, loading: false, locked: false };
    await render(<Panel tab="coding" projectId="p1" />);
    expect(tid("qual-damaged")).not.toBeNull();
  });
});

describe("the colours switch (qual_prefs.showcolors)", () => {
  it("is on when the preference is absent, and writes showcolors without asking", async () => {
    await render(<Panel tab="coding" projectId="p1" />);
    const box = tid("qual-show-colors") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(document.body.textContent).toContain(E.qual_show_colors_label);
    await click("qual-show-colors");
    expect(h.blobs.qual_prefs!.value).toEqual({ showcolors: false });
    expect((tid("qual-show-colors") as HTMLInputElement).checked).toBe(false);
    await click("qual-show-colors");
    expect(h.blobs.qual_prefs!.value).toEqual({ showcolors: true });
  });

  it("keeps the other fields of the preferences", async () => {
    h.blobs.qual_prefs!.value = { showcolors: false, later: 1 };
    await render(<Panel tab="coding" projectId="p1" />);
    expect((tid("qual-show-colors") as HTMLInputElement).checked).toBe(false);
    await click("qual-show-colors");
    expect(h.blobs.qual_prefs!.value).toEqual({ showcolors: true, later: 1 });
  });
});

describe("facts (the home's line)", () => {
  it("is not started with no codes, and says how many with some", () => {
    expect(facts({})).toEqual({ started: false });
    expect(facts({ qual_codes: { value: [], updatedAt: "t" } })).toEqual({ started: false });
    expect(facts({ qual_codes: { value: "junk", updatedAt: "t" } })).toEqual({ started: false });
    expect(facts({ qual_codes: { value: TREE.slice(0, 3), updatedAt: "t" } })).toEqual({ started: true, detail: "qual_facts_codes", vars: { n: 3 } });
    expect(E.qual_facts_codes).toBe("{n} codes");
  });
});
