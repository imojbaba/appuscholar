// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REG_WARN } from "@appuscholar/core";
import en from "../messages/en.json";
import designEn from "../messages/tools/design.en.json";

/*
 * Task A1, Pathway (v1 regRender, regCompute 5898-5940 and the dialog 1813-1843). The expected text is v1's own, read from core's golden fixture
 * test/golden/design/cases.json (`reg`: each case's four answers, the lines regCompute wrote, and whether the wizard offers that answer).
 * The blobs are an in-memory store, so what the wizard saves can be read back and a remount reads it again.
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
  confirm: vi.fn(() => true)
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/design/pathway" }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p1" }, projectId: "p1", docOpen: false, openDocument: vi.fn() })
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

import { Pathway } from "../components/tools/design/Pathway";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Case = { id: string; input: { type: string; pop: string; bio: boolean; multi: boolean }; offered: boolean; lines: string[]; saved: Record<string, unknown> };
const GOLDEN = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/design/cases.json"), "utf8")) as { reg: Case[]; warn: string };
const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
/** REG_WARN is shown without its emoji (the icon takes its place: no emoji in v2). */
const WARN = REG_WARN.replace(/^\p{Extended_Pictographic}️?\s*/u, "");

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
async function render(): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Pathway projectId="p1" />); });
  return root;
}
async function pick(sel: string, value: string) {
  const el = $(sel) as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function tick(sel: string, on: boolean) {
  const el = $(sel) as HTMLInputElement;
  if (el.checked !== on) await act(async () => { el.click(); });
}
async function answer(c: Case["input"]) {
  await pick('[data-testid="reg-type"]', c.type);
  await pick('[data-testid="reg-pop"]', c.pop);
  await tick('[data-testid="reg-bio"]', c.bio);
  await tick('[data-testid="reg-multi"]', c.multi);
}
const check = async () => { await act(async () => { $('[data-testid="reg-check"]')!.click(); }); };
const lines = () => $$('[data-testid="reg-lines"] li').map((x) => x.textContent);

beforeEach(() => {
  h.store.clear(); h.sets.length = 0; h.version = 0;
  h.loading = false; h.locked = false; h.broken = false; h.error = false;
  h.confirm.mockReturnValue(true);
  window.confirm = h.confirm;
  vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
});
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Pathway (Task A1)", () => {
  it("four answers give v1's pathway for each of the golden cases", async () => {
    // The golden has 66 cases; the wizard offers 64 of them as answers (registry and elderly are v1 states a student cannot pick).
    expect(GOLDEN.reg).toHaveLength(66);
    expect(GOLDEN.reg.filter((c) => c.offered)).toHaveLength(64);
    expect(GOLDEN.reg.filter((c) => !c.offered).map((c) => c.id)).toEqual(["registry-elderly-bio", "drug-elderly-multi"]);
    for (const c of GOLDEN.reg.filter((x) => x.offered)) {
      h.store.clear();
      const root = await render();
      await answer(c.input);
      await check();
      expect(lines(), c.id).toEqual(c.lines);
      expect($('[data-testid="reg-warn"]')!.textContent, c.id).toBe(WARN);
      // v1 saved the four answers with done and savedAt: the same object goes to the blob.
      expect(h.store.get("design_reg"), c.id).toEqual({ ...c.input, done: true, savedAt: 1_700_000_000_000 });
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  }, 120_000);

  it("a saved answer shows its result on reload, for every golden case (including the two the wizard does not offer)", async () => {
    let n = 0;
    for (const c of GOLDEN.reg) {
      h.store.set("design_reg", { ...c.input, done: true, savedAt: 1 });
      const root = await render();
      expect(lines(), c.id).toEqual(c.lines);
      expect($('[data-testid="reg-warn"]')!.textContent, c.id).toBe(WARN);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
      n++;
    }
    expect(n).toBe(GOLDEN.reg.length);
  }, 120_000);

  it("the result never says exempt, in any of the golden cases or in the page's own words", async () => {
    for (const c of GOLDEN.reg) {
      h.store.set("design_reg", { ...c.input, done: true, savedAt: 1 });
      const root = await render();
      expect(document.body.textContent, c.id).not.toMatch(/exempt/i);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
    // Neither does any string the module adds.
    for (const [k, v] of Object.entries(designEn as Record<string, string>)) expect(v, k).not.toMatch(/exempt/i);
  }, 120_000);

  it("the committee note sits under the result, after the starting-checklist warning, and is not there before a check", async () => {
    await render();
    expect($('[data-testid="reg-result"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Only your committee can say that, in writing.");
    await check();
    const result = $('[data-testid="reg-result"]')!;
    const parts = [...result.children].map((x) => x.getAttribute("data-testid"));
    expect(parts).toEqual(["reg-lines", "reg-warn", "reg-committee"]);
    expect($('[data-testid="reg-committee"]')!.textContent).toBe("Only your committee can say that, in writing.");
    expect(E.design_reg_committee).toBe("Only your committee can say that, in writing.");
  });

  it("the page opens with v1's defaults and its four controls, and shows no result until the pathway is checked", async () => {
    await render();
    expect(($('[data-testid="reg-type"]') as HTMLSelectElement).value).toBe("observational");
    expect(($('[data-testid="reg-pop"]') as HTMLSelectElement).value).toBe("adults");
    expect(($('[data-testid="reg-bio"]') as HTMLInputElement).checked).toBe(false);
    expect(($('[data-testid="reg-multi"]') as HTMLInputElement).checked).toBe(false);
    expect($('[data-testid="reg-lines"]')).toBeNull();
    expect(document.body.textContent).toContain(E.design_reg_intro);
    expect(h.sets).toHaveLength(0);
  });

  it("choosing answers saves nothing until Check pathway; the check saves once, as v1 did", async () => {
    await render();
    await pick('[data-testid="reg-type"]', "drug");
    await tick('[data-testid="reg-bio"]', true);
    expect(h.sets).toHaveLength(0);
    await check();
    expect(h.sets).toHaveLength(1);
    expect(h.store.get("design_reg")).toEqual({ type: "drug", pop: "adults", bio: true, multi: false, done: true, savedAt: 1_700_000_000_000 });
  });

  it("persists and reloads: the saved blob has done and savedAt, and a new mount shows the answers and the last result", async () => {
    const root = await render();
    await answer({ type: "device", pop: "pregnant", bio: true, multi: true });
    await check();
    expect(h.store.get("design_reg")).toMatchObject({ done: true, savedAt: 1_700_000_000_000 });
    const before = lines();
    await act(async () => { root.unmount(); });
    document.body.innerHTML = "";
    await render();
    expect(($('[data-testid="reg-type"]') as HTMLSelectElement).value).toBe("device");
    expect(($('[data-testid="reg-pop"]') as HTMLSelectElement).value).toBe("pregnant");
    expect(($('[data-testid="reg-bio"]') as HTMLInputElement).checked).toBe(true);
    expect(($('[data-testid="reg-multi"]') as HTMLInputElement).checked).toBe(true);
    expect(lines()).toEqual(before);
    expect(lines().length).toBeGreaterThan(5);
  });

  it("a second check keeps the fields another version of the blob carries", async () => {
    h.store.set("design_reg", { type: "drug", pop: "adults", bio: false, multi: false, done: true, savedAt: 1, later: "kept" });
    await render();
    await pick('[data-testid="reg-pop"]', "minors");
    await check();
    expect(h.store.get("design_reg")).toEqual({ type: "drug", pop: "minors", bio: false, multi: false, done: true, savedAt: 1_700_000_000_000, later: "kept" });
  });

  it("a locked vault says so and nothing is saved over what is not read", async () => {
    h.locked = true;
    await render();
    expect($('[data-testid="design-locked"]')!.textContent).toBe(E.design_locked);
    await check();
    expect(h.sets).toHaveLength(0);
    expect($('[data-testid="reg-result"]')).toBeNull();
  });

  it("a blob that does not open is said in words, and a check asks before it replaces it (R16); No saves nothing and shows no result", async () => {
    h.broken = true;
    h.store.set("design_reg", { type: "drug", pop: "adults", bio: false, multi: false });
    h.confirm.mockReturnValue(false);
    await render();
    expect($('[data-testid="design-broken"]')!.textContent).toBe(E.design_broken);
    await check();
    expect(h.confirm).toHaveBeenCalledWith(E.design_broken_confirm);
    expect(h.sets).toHaveLength(0);
    expect($('[data-testid="reg-result"]')).toBeNull();
    h.confirm.mockReturnValue(true);
    await check();
    expect(h.sets).toHaveLength(1);
    expect($('[data-testid="reg-result"]')).not.toBeNull();
  });

  it("a failed read says so in words and does not claim a save failed; a failed save with the value kept says its own sentence", async () => {
    h.error = true; // the hook's `error`: the last read or save failed; no value read yet means the read failed
    await render();
    expect($('[data-testid="design-read-failed"]')!.textContent).toBe(E.design_read_failed);
    expect($('[data-testid="design-error"]')).toBeNull();
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.store.set("design_reg", { type: "drug", pop: "adults", bio: false, multi: false, done: true, savedAt: 1 }); // a value is held: the save failed
    await render();
    expect($('[data-testid="design-error"]')!.textContent).toBe(E.design_error);
    expect($('[data-testid="design-read-failed"]')).toBeNull();
    expect(E.design_read_failed).not.toMatch(/\u2014/);
  });

  it("no emoji and no toast: the page's own strings carry no pictograph, and a check shows its result in place", async () => {
    for (const [k, v] of Object.entries(designEn as Record<string, string>)) expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
    await render();
    await check();
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(WARN.startsWith("This is a starting checklist")).toBe(true);
  });
});
