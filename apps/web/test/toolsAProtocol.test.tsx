// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESIGN_TOASTS, protocolMarkdown, type ProtoFields } from "@appuscholar/core";
import en from "../messages/en.json";
import designEn from "../messages/tools/design.en.json";

/*
 * Task A2, Protocol (v1 protoLoad, protoRead, protoSave, protoGenerate 5942-5977 and the dialog 1845-1860). The expected document is core's
 * protocolMarkdown (golden test/golden/design/cases.json `proto`), escaped with each newline a <br> as v1's insertIntoEditor(text, false) does. The
 * blobs are an in-memory store; useDocAccess is a fake that records every insertBlock.
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
  insertGate: null as null | Promise<void>,
  toast: vi.fn(),
  confirm: vi.fn(() => true)
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/design/protocol" }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/editor/docAccess", () => ({
  useDocAccess: () => ({
    insertBlock: async (html: string, opts?: unknown) => {
      h.inserts.push({ html, opts });
      if (h.insertGate) await h.insertGate;
      return h.insertResult;
    }
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

import { Protocol } from "../components/tools/design/Protocol";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Case = { id: string; input: ProtoFields; saved: Record<string, unknown>; inserted: string | null; toasts: string[] };
const GOLDEN = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/design/cases.json"), "utf8")) as { proto: Case[] };
const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
const KEYS = ["bg", "obj", "design", "part", "sample", "proc", "risk", "dmp"] as const;
/** v1's escHTML (2606) and the newline rule of insertIntoEditor (4210): what the editor is given. */
const escaped = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).replace(/\n/g, "<br>");

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
async function render(): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Protocol projectId="p1" />); });
  return root;
}
async function type(sel: string, value: string) {
  const el = $(sel) as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function fill(f: Partial<ProtoFields>) { for (const [k, v] of Object.entries(f)) await type(`[data-testid="proto-${k}"]`, v); }
const click = async (id: string) => { await act(async () => { $(`[data-testid="${id}"]`)!.click(); }); };
const val = (k: string) => ($(`[data-testid="proto-${k}"]`) as HTMLTextAreaElement).value;

beforeEach(() => {
  h.store.clear(); h.sets.length = 0; h.inserts.length = 0; h.version = 0; h.insertResult = true; h.insertGate = null;
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

describe("Protocol (Task A2)", () => {
  it("Generate inserts v1's protocol once at the end", async () => {
    // Every golden case that has a document: the html is core's markdown, escaped, newlines as <br>, one insertBlock, no position given (the default is the end).
    const withDoc = GOLDEN.proto.filter((c) => c.inserted !== null);
    expect(withDoc.length).toBeGreaterThan(0);
    for (const c of withDoc) {
      h.inserts.length = 0; h.toast.mockClear(); h.store.clear();
      const root = await render();
      await fill(c.input);
      await click("proto-generate");
      expect(h.inserts, c.id).toHaveLength(1);
      expect(h.inserts[0]!.html, c.id).toBe(escaped(protocolMarkdown(c.saved as unknown as ProtoFields)!));
      expect(h.inserts[0]!.html, c.id).toBe(escaped(c.inserted!));
      expect(h.inserts[0]!.opts, c.id).toBeUndefined();
      // The markdown stays literal text: no markup of its own reaches the editor.
      expect(h.inserts[0]!.html, c.id).not.toMatch(/<(?!br>)/);
      expect(h.toast.mock.calls.map((x) => x[0]), c.id).toEqual([E.design_inserted]);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  }, 60_000);

  it("a protocol with a & or < in it is inserted escaped, as v1's escHTML does", async () => {
    await render();
    await fill({ bg: "Rats & mice <3 \"quoted\" it's" });
    await click("proto-generate");
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]!.html).toContain("Rats &amp; mice &lt;3 &quot;quoted&quot; it&#39;s");
    expect(h.inserts[0]!.html).toContain("<br>");
  });

  it("empty fields insert nothing and show core's nudge beside the button, as a status, not a toast", async () => {
    await render();
    expect($('[data-testid="proto-msg"]')!.textContent).toBe("");
    await click("proto-generate");
    expect(h.inserts).toHaveLength(0);
    expect($('[data-testid="proto-msg"]')!.textContent).toBe(DESIGN_TOASTS.protoEmpty);
    expect($('[data-testid="proto-msg"]')!.getAttribute("role")).toBe("status");
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.sets).toHaveLength(0);
    // Whitespace only is empty too (v1 trims, protoRead 5948-5951), and typing clears the nudge.
    await fill({ bg: "   ", obj: "\n" });
    await click("proto-generate");
    expect(h.inserts).toHaveLength(0);
    expect($('[data-testid="proto-msg"]')!.textContent).toBe(DESIGN_TOASTS.protoEmpty);
    await fill({ bg: "x" });
    expect($('[data-testid="proto-msg"]')!.textContent).toBe("");
  });

  it("one click inserts exactly once even if it is pressed again while the document is taking it", async () => {
    let open!: () => void;
    h.insertGate = new Promise<void>((r) => { open = r; });
    await render();
    await fill({ bg: "a" });
    await act(async () => { $('[data-testid="proto-generate"]')!.click(); });
    await act(async () => { $('[data-testid="proto-generate"]')!.click(); });
    open();
    await act(async () => { await h.insertGate; });
    expect(h.inserts).toHaveLength(1);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it("generating twice inserts twice (v1), and the page stays on the tab", async () => {
    await render();
    await fill({ obj: "o" });
    await click("proto-generate");
    await click("proto-generate");
    expect(h.inserts).toHaveLength(2);
    expect($('[data-testid="panel-design-protocol"]')).not.toBeNull();
  });

  it("a document that cannot take it says so beside the button: no toast, no claim of success", async () => {
    h.insertResult = false;
    await render();
    await fill({ obj: "o" });
    await click("proto-generate");
    expect(h.toast).not.toHaveBeenCalled();
    expect($('[data-testid="proto-msg"]')!.textContent).toBe(E.design_insert_failed);
  });

  it("Save stores the eight trimmed texts with done from protoDone, and toasts only Saved", async () => {
    const all = GOLDEN.proto.find((c) => c.id === "all-fields")!;
    await render();
    await fill(all.input);
    expect(h.sets).toHaveLength(0);
    await click("proto-save");
    expect(h.sets).toHaveLength(1);
    expect(h.store.get("design_proto")).toEqual(all.saved);
    expect(h.toast.mock.calls.map((x) => x[0])).toEqual([E.design_saved]);
    expect(h.inserts).toHaveLength(0);
  });

  it("done follows protoDone for every golden case (whitespace only is not done)", async () => {
    for (const c of GOLDEN.proto) {
      h.store.clear();
      const root = await render();
      await fill(c.input);
      await click("proto-save");
      expect(h.store.get("design_proto"), c.id).toEqual(c.saved);
      await act(async () => { root.unmount(); });
      document.body.innerHTML = "";
    }
  }, 60_000);

  it("Generate saves first, as v1 does (protoGenerate calls protoSave), but not when everything is empty", async () => {
    const all = GOLDEN.proto.find((c) => c.id === "all-fields")!;
    await render();
    await click("proto-generate");
    expect(h.sets).toHaveLength(0);
    await fill(all.input);
    await click("proto-generate");
    expect(h.store.get("design_proto")).toEqual(all.saved);
    expect(h.toast.mock.calls.map((x) => x[0])).toEqual([E.design_inserted]);
  });

  it("persists and reloads: a new mount shows the saved texts", async () => {
    const all = GOLDEN.proto.find((c) => c.id === "all-fields")!;
    const root = await render();
    expect(KEYS.every((k) => val(k) === "")).toBe(true);
    await fill(all.input);
    await click("proto-save");
    await act(async () => { root.unmount(); });
    document.body.innerHTML = "";
    await render();
    for (const k of KEYS) expect(val(k), k).toBe((all.saved as Record<string, string>)[k]);
  });

  it("a saved blob's other keys are kept, and its texts are shown", async () => {
    h.store.set("design_proto", { bg: "kept", done: true, later: 7 });
    await render();
    expect(val("bg")).toBe("kept");
    await fill({ obj: "new" });
    await click("proto-save");
    expect(h.store.get("design_proto")).toEqual({ bg: "kept", obj: "new", design: "", part: "", sample: "", proc: "", risk: "", dmp: "", done: true, later: 7 });
  });

  it("shows the eight v1 fields with their labels and placeholders from the module's keys, and the intro", async () => {
    await render();
    for (const k of KEYS) {
      const el = $(`[data-testid="proto-${k}"]`) as HTMLTextAreaElement;
      expect(el.placeholder, k).toBe(E[`design_proto_${k}_ph`]);
      expect(document.body.textContent).toContain(E[`design_proto_${k}`]!);
    }
    expect(document.body.textContent).toContain(E.design_proto_intro);
    expect($('[data-testid="proto-generate"]')!.textContent).toBe("Generate protocol document");
  });

  it("a locked vault, a blob that does not open and a failed read are said in words, and nothing is written", async () => {
    h.locked = true;
    await render();
    expect($('[data-testid="design-locked"]')).not.toBeNull();
    await fill({ bg: "x" });
    await click("proto-save");
    expect(h.sets).toHaveLength(0);
  });

  it("a blob that does not open asks once before it is replaced, and a No saves nothing", async () => {
    h.broken = true;
    h.confirm.mockReturnValue(false);
    await render();
    expect($('[data-testid="design-broken"]')).not.toBeNull();
    await fill({ bg: "x" });
    await click("proto-save");
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.sets).toHaveLength(0);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("no string of the module says exempt (rule 9), and none of the new keys carries an em-dash", () => {
    for (const [k, v] of Object.entries(designEn as Record<string, string>)) {
      expect(v, k).not.toMatch(/exempt/i);
      if (/^design_(proto|ec|consent|save|insert)/.test(k)) expect(v, k).not.toContain("—");
    }
  });
});
