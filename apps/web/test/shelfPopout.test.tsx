// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * The Reading shelf in a place's own window (ruling R29, register row D-S2-43): a Literature window stores the list and every paper's text, highlights
 * and cells. A write the guard refuses never reports success. (The matrix columns are Compare's now, not the store's: test/compare.test.tsx; the guard on the
 * `shelf_cols` kind is tested in useProjectBlob.test.tsx.)
 */

type SBlob = { projectId: string; kind: string; body: string; keyVersion: number };
const h = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), refuse: new Set<string>() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/vault/useVault", () => ({
  useVault: () => ({ status: "off", known: async () => "off", ensureUnlocked: async () => true, encryptBody: async (_d: unknown, s: string) => ({ bodyHtml: s, keyVersion: 0 }), decryptBody: async (d: { bodyHtml: string }) => d.bodyHtml })
}));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1" }, projectId: "p1" }) }));
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
import { useShelfStore, type ShelfStore } from "../lib/shelf/useShelf";
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
  window.history.replaceState(null, "", "/p/p1/lit/reading?window=1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); window.history.replaceState(null, "", "/"); });

describe("the Reading shelf in a place's own window (R29, D-S2-43)", () => {
  it("a Literature window stores a highlight, a cell and a rename", async () => {
    await mount();
    await until(() => box.s!.papers.get("a")?.value != null);
    expect(box.s!.index.readOnly).toBe(false);
    act(() => { expect(saveHighlight("a", 1, "Sleep helps memory", "", hlOps())).toBe(true); });
    expect(toasts()).toEqual([E.sh2_highlight_saved]);
    act(() => { expect(box.s!.ops.updateIndex((prev) => (prev ?? []).map((e) => ({ ...e, title: "Renamed" })))).toBe(true); });
    act(() => { expect(box.s!.ops.updatePaper("a", (p) => ({ ...p, cells: { Sample: "40" } }))).toBe(true); });
    await until(() => puts.some((p) => p.kind === "shelf_paper:a") && puts.some((p) => p.kind === "shelf_index"));
    const sent = JSON.parse(puts.filter((p) => p.kind === "shelf_paper:a").at(-1)!.body) as typeof PAPER;
    expect(sent.notes).toHaveLength(1);
    expect(sent.cells).toEqual({ Sample: "40" });
    expect(toasts()).toEqual([E.sh2_highlight_saved]);
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
});
