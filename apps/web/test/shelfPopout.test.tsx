// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * The Reading shelf in a pop-out (ruling R29): v1's shelf papers are IndexedDB records, outside the pop-out's localStorage guard, so a pop-out stores
 * the list and every paper's text, highlights and cells; only the columns (appu_shelf_cols) are refused, and the student is told. A write the guard
 * refuses never reports success.
 */

type SBlob = { projectId: string; kind: string; body: string; keyVersion: number };
const h = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), refuse: new Set<string>() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/vault/useVault", () => ({
  useVault: () => ({ status: "off", known: async () => "off", ensureUnlocked: async () => true, encryptBody: async (_d: unknown, s: string) => ({ bodyHtml: s, keyVersion: 0 }), decryptBody: async (d: { bodyHtml: string }) => d.bodyHtml })
}));
vi.mock("@/components/workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ project: { id: "p1" }, projectId: "p1" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
// The guard as shipped, with kinds a test makes refused on top (a client the guard makes read-only).
vi.mock("@/lib/popout/mode", async (orig) => {
  const m = await orig<typeof import("../lib/popout/mode")>();
  return { ...m, blobWritable: (k: string) => !h.refuse.has(k) && m.blobWritable(k as never) };
});

import { ApiError } from "../lib/api";
import { BLOB_SAVE_DEBOUNCE_MS } from "../lib/blobs/useProjectBlob";
import { heldBlobs } from "../lib/blobs/held";
import { saveHighlight } from "../lib/shelf/actions";
import { COLS_POPOUT, useShelfStore, type ShelfStore } from "../lib/shelf/useShelf";
import { tFormat } from "../lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => tFormat(E, E, k, "en", v);

let blobs: SBlob[] = [];
let puts: Array<{ kind: string; body: string }> = [];
function fakeApi(path: string, init: RequestInit = {}) {
  const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  if (!m) return Promise.reject(new ApiError(404, "not-found"));
  const kind = decodeURIComponent(m[2]!);
  const method = init.method ?? "GET";
  const cur = blobs.find((b) => b.projectId === m[1] && b.kind === kind);
  if (method === "GET") return cur ? Promise.resolve({ kind, body: cur.body, keyVersion: 0, deks: [], updatedAt: "x" }) : Promise.reject(new ApiError(404, "not-found"));
  if (method === "PUT") {
    const b = JSON.parse(String(init.body)) as { body: string };
    puts.push({ kind, body: b.body });
    blobs = [...blobs.filter((x) => x !== cur), { projectId: m[1]!, kind, body: b.body, keyVersion: 0 }];
    return Promise.resolve({ kind, body: b.body, keyVersion: 0, deks: [], updatedAt: "x" });
  }
  return Promise.reject(new ApiError(405, "method"));
}

const ENTRY = { id: "a", title: "Paper A", file: "a.pdf", size: 10, added: "2026-10-01T00:00:00.000Z", total: 1, kept: 1 };
const PAPER = { pages: ["Sleep helps memory in adolescents."], notes: [], cells: {} };
const box: { s: ShelfStore | null } = { s: null };
const roots: Root[] = [];
async function mount() {
  function Probe() { box.s = useShelfStore(); return null; }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const toasts = () => h.toast.mock.calls.map((c) => c[0]);
const hlOps = () => ({ paper: box.s!.ops.paper, updatePaper: box.s!.ops.updatePaper, toast: h.toast, t, now: () => new Date("2026-10-19T10:00:00.000Z") });

beforeEach(() => {
  blobs = [
    { projectId: "p1", kind: "shelf_index", body: JSON.stringify([ENTRY]), keyVersion: 0 },
    { projectId: "p1", kind: "shelf_paper:a", body: JSON.stringify(PAPER), keyVersion: 0 }
  ];
  puts = [];
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset();
  h.refuse.clear();
  heldBlobs.clear();
  window.history.replaceState(null, "", "/popout?tool=research");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); window.history.replaceState(null, "", "/"); });

describe("the Reading shelf in a pop-out (R29)", () => {
  it("stores a highlight, a cell and a rename as v1's IndexedDB shelf did; the columns are refused and the student is told", async () => {
    await mount();
    await until(() => box.s!.papers.get("a")?.value != null);
    expect(box.s!.index.readOnly).toBe(false);
    expect(box.s!.cols.readOnly).toBe(true);
    act(() => { expect(saveHighlight("a", 1, "Sleep helps memory", "", hlOps())).toBe(true); });
    expect(toasts()).toEqual([E.sh2_highlight_saved]);
    act(() => { expect(box.s!.ops.updateIndex((prev) => (prev ?? []).map((e) => ({ ...e, title: "Renamed" })))).toBe(true); });
    await until(() => puts.some((p) => p.kind === "shelf_paper:a") && puts.some((p) => p.kind === "shelf_index"));
    expect((JSON.parse(puts.find((p) => p.kind === "shelf_paper:a")!.body) as typeof PAPER).notes).toHaveLength(1);
    let ok: boolean | undefined;
    act(() => { ok = box.s!.setCols(() => ["Sample", "Age"]); });
    expect(ok).toBe(false);
    expect(toasts().at(-1)).toBe(COLS_POPOUT);
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(puts.some((p) => p.kind === "shelf_cols")).toBe(false);
  });

  it("a paper the guard refuses: updatePaper returns false and saveHighlight shows no success", async () => {
    h.refuse.add("shelf_paper:a");
    await mount();
    await until(() => box.s!.papers.get("a")?.value != null);
    expect(box.s!.ops.updatePaper("a", (p) => ({ ...p, cells: { Sample: "40" } }))).toBe(false);
    let saved: boolean | undefined;
    act(() => { saved = saveHighlight("a", 1, "Sleep helps memory", "", hlOps()); });
    expect(saved).toBe(false);
    expect(toasts()).not.toContain(E.sh2_highlight_saved);
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(puts).toEqual([]);
  });

  it("an index the guard refuses: updateIndex returns false and nothing is sent", async () => {
    h.refuse.add("shelf_index");
    await mount();
    await until(() => !box.s!.index.loading);
    expect(box.s!.ops.updateIndex((prev) => prev ?? [])).toBe(false);
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(puts).toEqual([]);
  });

  it("in the writing window the columns are stored", async () => {
    window.history.replaceState(null, "", "/");
    await mount();
    await until(() => !box.s!.cols.loading);
    let ok: boolean | undefined;
    act(() => { ok = box.s!.setCols(() => ["Sample", "Age"]); });
    expect(ok).toBe(true);
    await until(() => puts.some((p) => p.kind === "shelf_cols"));
    expect(toasts()).toEqual([]);
  });
});
