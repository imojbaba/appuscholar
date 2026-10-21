// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESIGN_ITEMS } from "@appuscholar/core";
import en from "../messages/en.json";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";
import { DICTS, tFormat } from "../lib/i18n";

/*
 * Task A1, the Design and ethics module and its Overview (v1 designRenderDash 5884-5897 and the panel 756-766): "N of 6 ready" from designDashboard
 * over the six blobs' done flags, six rows each a link to its tab with a mark that is also a word, and the AI-use statement as a seventh row that is
 * not counted. The Panel dispatches by tab; a tab not built yet reads "Not built yet". The home's facts line is declared here too.
 */

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  listeners: new Set<() => void>(),
  version: 0,
  loading: false,
  locked: false,
  broken: false,
  error: false
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/design/overview" }));
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
        set: () => {}, flush: async () => true
      };
    }
  };
});

import * as design from "../components/tools/design";
import { Overview } from "../components/tools/design/Overview";
import { Panel } from "../components/tools/design/Panel";
import { toolModule } from "../lib/tools/registry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
const KEYS = ["reg", "proto", "ec", "ctri", "pi", "budget"] as const;
const TABS: Record<(typeof KEYS)[number], string> = { reg: "pathway", proto: "protocol", ec: "ethics", ctri: "registration", pi: "investigator", budget: "budget" };

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
async function render(node: React.ReactNode): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
  return root;
}
const done = (...keys: Array<(typeof KEYS)[number]>) => { for (const k of keys) h.store.set("design_" + k, { done: true }); };

beforeEach(() => { h.store.clear(); h.version = 0; h.loading = false; h.locked = false; h.broken = false; h.error = false; });
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
});

describe("Overview (Task A1)", () => {
  it("opens with v1's sentence and 0 of 6 ready, six rows not ready and each a word as well as an icon", async () => {
    await render(<Overview projectId="p1" />);
    expect($('[data-testid="design-desc"]')!.textContent).toBe((en as Record<string, string>).design_panel_desc);
    expect($('[data-testid="design-count"]')!.textContent).toBe("0 of 6 ready");
    const rows = $$('[data-testid^="design-row-"]').filter((x) => KEYS.includes(x.getAttribute("data-testid")!.slice("design-row-".length) as never));
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r.querySelector(".sr-only")!.textContent).toBe(E.design_mark_not_ready);
  });

  it("N of 6 ready follows the done flags, and a done row says Ready", async () => {
    done("reg", "budget");
    h.store.set("design_proto", { bg: "x" }); // a blob without done is not ready
    await render(<Overview projectId="p1" />);
    expect($('[data-testid="design-count"]')!.textContent).toBe("2 of 6 ready");
    expect($('[data-testid="design-row-reg"] .sr-only')!.textContent).toBe(E.design_mark_ready);
    expect($('[data-testid="design-row-budget"] .sr-only')!.textContent).toBe(E.design_mark_ready);
    expect($('[data-testid="design-row-proto"] .sr-only')!.textContent).toBe(E.design_mark_not_ready);
    expect($('[data-testid="design-row-ec"] .sr-only')!.textContent).toBe(E.design_mark_not_ready);
  });

  it("each row is a link to its tab, and the row's label is the clean one (no emoji, no entity)", async () => {
    await render(<Overview projectId="p1" />);
    for (const k of KEYS) {
      const a = $('[data-testid="design-row-' + k + '"]') as HTMLAnchorElement;
      expect(a.tagName).toBe("A");
      expect(a.getAttribute("href")).toBe("/p/p1/design/" + TABS[k]);
      const label = a.querySelector('[data-testid="design-label"]')!.textContent!;
      expect(label).toBe(E["design_row_" + k]);
      expect(label).not.toMatch(/\p{Extended_Pictographic}|&amp;/u);
    }
  });

  it("the seventh row is the AI-use statement: a link to its tab, with no mark, and never counted", async () => {
    await render(<Overview projectId="p1" />);
    const a = $('[data-testid="design-row-aiuse"]') as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/p/p1/design/aiuse");
    expect(a.querySelector('[data-testid="design-label"]')!.textContent).toBe(E.design_row_aiuse);
    expect(a.querySelector(".sr-only")).toBeNull();
    expect($$('[data-testid="design-rows"] a')).toHaveLength(7);
    // All six ready is 6 of 6, whatever the seventh holds.
    done(...KEYS);
    h.store.set("design_aiuse", { done: true });
    h.version++; for (const l of h.listeners) l();
    await act(async () => {});
    expect($('[data-testid="design-count"]')!.textContent).toBe("6 of 6 ready");
  });

  it("the count is designDashboard's: the labels of core's six items stay the order of the rows", async () => {
    await render(<Overview projectId="p1" />);
    const order = $$('[data-testid="design-rows"] a').map((a) => a.getAttribute("data-testid")!.slice("design-row-".length));
    expect(order).toEqual([...DESIGN_ITEMS.map((i) => i.key), "aiuse"]);
  });

  it("a locked vault and a blob that does not open are said in words; a blob still opening says so", async () => {
    h.locked = true;
    await render(<Overview projectId="p1" />);
    expect($('[data-testid="design-locked"]')!.textContent).toBe(E.design_locked);
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.locked = false; h.broken = true;
    h.store.set("design_reg", { done: true });
    await render(<Overview projectId="p1" />);
    expect($('[data-testid="design-broken"]')!.textContent).toBe(E.design_broken);
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.broken = false; h.loading = true;
    await render(<Overview projectId="p1" />);
    expect($('[data-testid="design-loading"]')!.textContent).toBe(E.blob_loading);
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    // The hook's `error`: with nothing read it is a failed read; with a value held it is a failed save.
    h.loading = false; h.error = true; h.store.clear();
    await render(<Overview projectId="p1" />);
    expect($('[data-testid="design-read-failed"]')!.textContent).toBe(E.design_read_failed);
    expect($('[data-testid="design-error"]')).toBeNull();
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    done(...KEYS); // every blob holds a value
    await render(<Overview projectId="p1" />);
    expect($('[data-testid="design-error"]')!.textContent).toBe(E.design_error);
    expect($('[data-testid="design-read-failed"]')).toBeNull();
  });
});

describe("Panel (Task A1)", () => {
  it("dispatches overview and pathway to their pages", async () => {
    await render(<Panel tab="overview" projectId="p1" />);
    expect($('[data-testid="design-count"]')).not.toBeNull();
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    await render(<Panel tab="pathway" projectId="p1" />);
    expect($('[data-testid="reg-check"]')).not.toBeNull();
  });

  it("a tab not built yet reads Not built yet", async () => {
    for (const tab of ["protocol", "ethics", "registration", "investigator", "budget", "aiuse"]) {
      await render(<Panel tab={tab} projectId="p1" />);
      expect($('[data-testid="not-built"]')!.textContent, tab).toContain(E.place_not_built);
      for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
      document.body.innerHTML = "";
    }
  });
});

describe("the module and its home facts (Task A1)", () => {
  it("is built and registered, with its Panel", () => {
    expect(design.built).toBe(true);
    expect(design.Panel).toBe(Panel);
    expect(toolModule("design").built).toBe(true);
  });

  it("nothing stored: not started, 0 of 6 ready", () => {
    expect(design.facts({})).toEqual({ started: false, detail: "design_home_ready", vars: { done: 0, total: 6 } });
  });

  it("any design blob makes it started; done counts the blobs whose flag is true", () => {
    const at = "2026-10-21T10:00:00.000Z";
    expect(design.facts({ design_budget: { value: { rows: [] }, updatedAt: at } })).toEqual({ started: true, detail: "design_home_ready", vars: { done: 0, total: 6 } });
    expect(design.facts({
      design_reg: { value: { done: true }, updatedAt: at }, design_ec: { value: { done: true }, updatedAt: at },
      design_pi: { value: { done: false }, updatedAt: at }, design_proto: { value: null, updatedAt: at }
    })).toEqual({ started: true, detail: "design_home_ready", vars: { done: 2, total: 6 } });
  });

  it("the line reads the same through t() as the Overview's count, in English and in Hindi", () => {
    const f = design.facts({ design_reg: { value: { done: true }, updatedAt: "x" } });
    expect(tFormat(DICTS.en, DICTS.hi, f.detail!, "en", f.vars)).toBe("1 of 6 ready");
    expect(tFormat(DICTS.en, DICTS.hi, f.detail!, "hi", f.vars)).toMatch(/1/);
    expect(tFormat(DICTS.en, DICTS.hi, f.detail!, "hi", f.vars)).not.toBe("1 of 6 ready");
  });

  it("the Hindi file is a draft, and has no key the English file lacks", () => {
    const hi = designHi as Record<string, string>;
    expect(hi.$draft).toMatch(/^DRAFT: Hindi for Dr\. Sharma's review, reviewed by: /);
    expect(Object.keys(hi).filter((k) => !k.startsWith("$") && !(k in designEn))).toEqual([]);
  });
});
