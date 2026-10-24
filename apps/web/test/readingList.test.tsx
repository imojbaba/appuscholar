// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shTitleGuess, type CitationEntry } from "@appuscholar/core";
import en from "../messages/en.json";

/*
 * The Reading list (wave B Task 21a, register row D-S2-126; canvas Read): the kept papers with and without a PDF, "Get the free PDF", the practice paper as the last row, Add your own PDF
 * (the title from the paper's metadata, a DOI kept or not kept yet, three PDFs at a time), the backup that carries doi and pid, the blob clients' conflict and deleted-elsewhere toasts,
 * and the one status region while the list loads. The list is mounted with the real shelf store and library over a fake blob api that keeps versions, as the server does.
 */

type SBlob = { projectId: string; kind: string; body: string; keyVersion: number; version: number };
const h = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), extract: vi.fn(), download: vi.fn(), callAI: vi.fn(async (..._a: unknown[]) => "OK") }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
const vault = {
  status: "off", known: async () => "off", ensureUnlocked: async () => true,
  encryptBody: async (_d: unknown, s: string) => ({ bodyHtml: s, keyVersion: 0 }),
  decryptBody: async (d: { bodyHtml: string; keyVersion: number }) => { if (d.keyVersion > 0) throw new Error("corrupt"); return d.bodyHtml; }
};
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => vault }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1" }, projectId: "p1", openExport: vi.fn() }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" }, settings: { field: "education" } }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download }));
vi.mock("@/lib/shelf/extract", async (orig) => ({ ...(await orig<typeof import("../lib/shelf/extract")>()), extractPdfPages: (f: File) => h.extract(f) }));

import { ApiError } from "../lib/api";
import { tFormat } from "../lib/i18n";
import { useApNotes } from "../lib/analyse/notes";
import { getAp, resetAp } from "../lib/analyse/useApDoc";
import { heldBlobs } from "../lib/blobs/held";
import type { ApNotes, ShelfIndex, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import { ReadingList } from "../components/literature/ReadingList";
import { CompareTab } from "../components/literature/CompareTab";
import { addOwnPdf, addToReferences, backupShelf, OWN_PDF_PARALLEL, toRecord, type ShelfEntry, type ShelfItem, type OwnPdfOps } from "../lib/shelf/actions";
import { useShelfStore, type ShelfStore } from "../lib/shelf/useShelf";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => tFormat(E, E, k, "en", v);

// ---------------------------------------------------------------- a fake blob api with versions

let server: { blobs: SBlob[]; calls: Array<{ path: string; method: string }>; conflict?: (kind: string) => boolean };
const wire = (b: SBlob) => ({ kind: b.kind, body: b.body, keyVersion: b.keyVersion, deks: [], updatedAt: "2026-10-19T00:00:00.000Z", version: b.version });
function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  server.calls.push({ path, method });
  const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  if (!m) return Promise.reject(new ApiError(404, "not-found"));
  const projectId = m[1]!, kind = decodeURIComponent(m[2]!);
  const cur = server.blobs.find((b) => b.projectId === projectId && b.kind === kind);
  if (method === "GET") return cur ? Promise.resolve(wire(cur)) : Promise.reject(new ApiError(404, "not-found"));
  if (method === "DELETE") { if (!cur) return Promise.reject(new ApiError(404, "not-found")); server.blobs = server.blobs.filter((b) => b !== cur); return Promise.resolve(null); }
  const ifMatch = (init.headers as Record<string, string> | undefined)?.["if-match"];
  if (server.conflict?.(kind) || (ifMatch !== undefined && Number(ifMatch.replace(/"/g, "")) !== (cur?.version ?? 0))) return Promise.reject(new ApiError(409, "version-conflict"));
  const body = JSON.parse(String(init.body)) as { body: string; keyVersion: number };
  const next: SBlob = { projectId, kind, body: body.body, keyVersion: body.keyVersion, version: (cur?.version ?? 0) + 1 };
  server.blobs = [...server.blobs.filter((b) => b !== cur), next];
  return Promise.resolve(wire(next));
}
const put = (kind: string, value: unknown) => server.blobs.push({ projectId: "p1", kind, body: JSON.stringify(value), keyVersion: 0, version: 1 });
const stored = <T,>(kind: string): T | null => { const b = server.blobs.find((x) => x.kind === kind); return b ? (JSON.parse(b.body) as T) : null; };
const puts = (kind: string) => server.calls.filter((c) => c.method === "PUT" && decodeURIComponent(c.path).endsWith("/blobs/" + kind));

// ---------------------------------------------------------------- the papers

const SCHAEFER: StoredEntry = { author: "Schaefer, C.; Denke, C.; Harke, H.", year: "2019", title: "Open-label placebos reduce test anxiety and improve self-management skills", doi: "10.1038/s41598-019-49466-6", pid: "ka", rl: true };
const PUTWAIN: StoredEntry = { author: "Putwain, D.", year: "2008", title: "Examination stress and test anxiety", pid: "kb", rl: true, oa: "https://example.org/putwain.pdf" };
const KIECOLT: StoredEntry = { author: "", year: "2011", title: "Omega-3 supplementation lowers inflammation and anxiety", pid: "kc", rl: true };
const COHEN: StoredEntry = { author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences", type: "Book", pid: "kd", rl: true };
const shelfEntry = (id: string, over: Partial<ShelfEntry> = {}): ShelfEntry => ({ id, title: "T " + id, file: id + ".pdf", size: 10, added: "2026-01-01T00:00:00.000Z", total: 2, kept: 2, ...over });
const paperOf = (nHighlights = 0, pages = ["First page text.", "Second page text."]): ShelfPaper =>
  ({ pages, notes: Array.from({ length: nHighlights }, (_, i) => ({ id: "n" + i, page: 1, quote: "First page", note: "", at: "2026-01-01T00:00:00.000Z" })), cells: {} });

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel));
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tids = (id: string) => $$(`[data-testid="${id}"]`);
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 400; i++) { if (pred()) return; await settle(10); }
  throw new Error(what + " not reached");
}
async function mount(ui: React.ReactNode = <ReadingList />) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(ui); });
  await settle(20);
  return { unmount: () => { act(() => { root.unmount(); }); roots.splice(roots.indexOf(root), 1); } };
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
async function pick(input: HTMLElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function openMore(row: HTMLElement) {
  await act(async () => { row.querySelector('[data-testid="rl-more"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect($('[role="menu"]')).not.toBeNull();
}
const fileOf = (name: string, size: number) => new File(["x".repeat(size)], name);
const rowOf = (text: string) => tids("rl-row").find((r) => r.textContent!.includes(text))!;

beforeEach(() => {
  server = { blobs: [], calls: [] };
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset();
  h.download.mockReset();
  h.extract.mockReset();
  heldBlobs.clear();
  resetAp();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the list of kept papers", () => {
  it("kept papers show with and without a PDF, in library order, the PDFs no kept paper took after them, and the practice paper last", async () => {
    put("citations", [SCHAEFER, PUTWAIN, KIECOLT, COHEN]);
    put("shelf_index", [
      shelfEntry("s2", { title: "Loose PDF, the second", added: "2026-03-01T00:00:00.000Z", pid: "kx" }),
      shelfEntry("s1", { title: "Loose PDF, the first", added: "2026-02-01T00:00:00.000Z", pid: "ky" }),
      shelfEntry("sa", { title: SCHAEFER.title!, pid: "ka", doi: SCHAEFER.doi })
    ]);
    put("shelf_paper:sa", paperOf(2));
    put("shelf_paper:s1", paperOf());
    put("shelf_paper:s2", paperOf());
    await mount();
    await until(() => tids("rl-row").length === 6 && tids("rl-status").length === 6, "the rows");
    expect(tids("rl-short").map((x) => x.textContent)).toEqual([
      "Schaefer et al., 2019: open-label placebos reduce test",
      "Putwain, 2008: examination stress and test",
      "2011: omega-3 supplementation lowers inflammation",
      "Cohen, 1988: statistical power analysis for",
      "Loose PDF, the first",
      "Loose PDF, the second"
    ]);
    // The canvas's rows: reading with highlights, no PDF, authors missing, a book that is reference only.
    expect(tids("rl-status").map((x) => x.textContent)).toEqual([
      "Reading. 2 highlights", "Not read yet. No PDF", "Not read yet. No PDF. Authors missing", "Book. Reference only", "Not read yet", "Not read yet"
    ]);
    // The practice paper is the last row, and after the papers the list has nothing else.
    const items = $$("[data-testid=rl-list] > li");
    expect(items.at(-1)).toBe(tid("rl-practice"));
    expect(items).toHaveLength(7);
    expect(tid("rl-practice")!.textContent).toContain("Practice paper (fictional)");
    expect(tid("rl-intro")!.textContent).toBe(E.rl_intro_off);
    expect(E.rl_intro).toBe("Papers you keep, with or without their PDF. A PDF stays on your computer; its text is saved to your account, locked with your passphrase. Only you can read it.");
  });

  it("a paper with an open-access link and no PDF has Get the free PDF, in a new tab, with the line that says what to do next; one with a PDF has none", async () => {
    put("citations", [PUTWAIN, { ...SCHAEFER, oa: "https://example.org/schaefer.pdf" }, { ...KIECOLT, oa: "javascript:alert(1)" }]);
    put("shelf_index", [shelfEntry("sa", { pid: "ka" })]);
    put("shelf_paper:sa", paperOf());
    await mount();
    await until(() => tids("rl-row").length === 3, "the rows");
    const link = rowOf("Putwain").querySelector("a")!;
    expect(link.textContent).toBe("Get the free PDF");
    expect(link.getAttribute("href")).toBe("https://example.org/putwain.pdf");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(rowOf("Putwain").querySelector('[data-testid="rl-free"]')!.textContent).toBe("Get the free PDF Save it, then add it here with Add your own PDF.");
    expect(rowOf("Schaefer").querySelector("a")).toBeNull();
    expect(rowOf("2011").querySelector("a")).toBeNull();
  });

  it("Try a practice paper loads the fictional paper into Analyse a paper and says where it is", async () => {
    await mount();
    expect(tid("rl-practice-loaded")).toBeNull();
    await click(tid("rl-practice-btn"));
    expect(getAp().doc?.sample).toBe(true);
    expect(tid("rl-practice-loaded")!.textContent).toBe(E.rl_practice_loaded);
  });

  it("a line for a paper's automatic full text can be put under its status (the seam for Europe PMC)", async () => {
    put("citations", [PUTWAIN]);
    await mount(<ReadingList textState={(p) => <p data-testid="rl-text">{"Looking for the free text of " + p.pid}</p>} />);
    await until(() => tids("rl-row").length === 1, "the rows");
    expect(rowOf("Putwain").querySelector('[data-testid="rl-text"]')!.textContent).toBe("Looking for the free text of kb");
  });

  it("More on a paper only the reading list has: Add to my references puts it in the library with its pid, on the reading list, and it then has an entry", async () => {
    put("citations", []);
    put("shelf_index", [shelfEntry("s1", { title: "A loose PDF", pid: "kz", doi: "10.1000/loose" })]);
    put("shelf_paper:s1", paperOf());
    await mount();
    await until(() => tids("rl-row").length === 1 && !(tid("rl-read") as HTMLButtonElement).disabled, "the rows");
    await openMore(tids("rl-row")[0]!);
    expect($$('[role="menuitem"]').map((x) => x.textContent)).toEqual(["Rename", "Add to my references", "Remove from reading list"]);
    await click($('[data-testid="rl-item-refs"]'));
    await until(() => puts("citations").length > 0, "the library save");
    expect(stored<StoredEntry[]>("citations")).toEqual([{ title: "A loose PDF", doi: "10.1000/loose", pid: "kz", rl: true }]);
    // The same paper, now with an entry (no author yet): it keeps its place and says what is missing; More no longer offers to add it.
    await until(() => tid("rl-status")?.textContent === "Not read yet. Authors missing", "the status");
    expect(tids("rl-row")).toHaveLength(1);
    await openMore(tids("rl-row")[0]!);
    expect($$('[role="menuitem"]').map((x) => x.textContent)).toEqual(["Remove the PDF text"]);
  });

  it("Add to my references never adds a paper twice, and a paper with no pid is not added", () => {
    const entry = shelfEntry("s1", { title: "A loose PDF", pid: "kz", doi: "10.1000/loose" });
    let lib: StoredEntry[] = [PUTWAIN];
    const d = { update: (fn: (prev: StoredEntry[]) => StoredEntry[]) => { lib = fn(lib); return true; } };
    expect(addToReferences(entry, d)).toBe(true);
    const once = lib;
    expect(once).toEqual([PUTWAIN, { title: "A loose PDF", doi: "10.1000/loose", pid: "kz", rl: true }]);
    // Pressed again (or a second window did it first): the library is left exactly as it is.
    expect(addToReferences(entry, d)).toBe(true);
    expect(lib).toBe(once);
    const update = vi.fn(() => true);
    expect(addToReferences(shelfEntry("s2"), { update })).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("the PDF text of a kept paper can be removed after the question; the paper stays on the list as No PDF", async () => {
    put("citations", [PUTWAIN]);
    put("shelf_index", [shelfEntry("s1", { pid: "kb" })]);
    put("shelf_paper:s1", paperOf());
    await mount();
    await until(() => tids("rl-row").length === 1 && tid("rl-status")?.textContent === "Not read yet", "the rows");
    await openMore(tids("rl-row")[0]!);
    expect($('[data-testid="rl-item-remove"]')!.textContent).toBe("Remove the PDF text");
    expect($$('[role="menuitem"]')).toHaveLength(1);
    await click($('[data-testid="rl-item-remove"]'));
    expect(tid("rl-confirm")!.textContent).toContain(E.rl_remove_ask_pdf);
    await click(tid("rl-remove-yes"));
    await until(() => (stored<ShelfIndex>("shelf_index") ?? [1]).length === 0, "the entry removed");
    await until(() => tid("rl-status")?.textContent === "Not read yet. No PDF", "the status");
    expect(tids("rl-row")).toHaveLength(1);
  });
});

describe("one status region while the list loads (wave A LATER T18)", () => {
  it("the list shows one loading sign, then the rows, with no other status region in between", async () => {
    put("citations", [PUTWAIN, COHEN]);
    put("shelf_index", [shelfEntry("s1", { pid: "kb" })]);
    put("shelf_paper:s1", paperOf());
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    h.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if ((init.method ?? "GET") === "GET" && decodeURIComponent(path).endsWith("/blobs/citations")) await gate;
      return fakeApi(path, init);
    });
    await mount();
    const list = tid("reading-list")!;
    expect(list.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(list.querySelector('[role="status"]')!.getAttribute("data-testid")).toBe("panel-loading");
    expect(tids("rl-row")).toHaveLength(0);
    expect(tid("rl-empty")).toBeNull();
    release();
    await until(() => tids("rl-row").length === 2, "the rows");
    expect(tid("panel-loading")).toBeNull();
    expect(tid("rl-intro")).not.toBeNull();
  });
});

// ---------------------------------------------------------------- Add your own PDF

describe("Add your own PDF", () => {
  const PAGE = (title: string, doi: string) => [title + "\n" + "Some words about sleep. ".repeat(20) + "\nhttps://doi.org/" + doi + "\n"];

  it("a PDF whose DOI is a kept paper's attaches to it, titled from the paper's metadata (W15), and the library is not touched", async () => {
    put("citations", [SCHAEFER, PUTWAIN]);
    h.extract.mockImplementation(async () => ({ pages: PAGE(SCHAEFER.title!, SCHAEFER.doi!), total: 1 }));
    // The page's own fetch is what reaches Crossref (the blob api double above never does), so that is the double that must stay unused.
    const crossref = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", crossref);
    try {
      await mount();
      await until(() => tids("rl-row").length === 2, "the rows");
      expect(rowOf("Schaefer").querySelector('[data-testid="rl-status"]')!.textContent).toBe("Not read yet. No PDF");
      await pick(tid("rl-file")!, [fileOf("scan-2019_final(3).pdf", 5)]);
      await until(() => puts("shelf_index").length > 0, "the index save");
      const entry = stored<ShelfIndex>("shelf_index")![0]!;
      expect(entry).toMatchObject({ title: SCHAEFER.title, doi: SCHAEFER.doi, pid: "ka", file: "scan-2019_final(3).pdf" });
      expect(tid("rl-add-status")!.textContent).toBe(`scan-2019_final(3).pdf: added to ${SCHAEFER.title}.`);
      // The paper keeps its place and now has a PDF; nothing new is on the list and the library was not written.
      await until(() => rowOf("Schaefer").querySelector('[data-testid="rl-status"]')?.textContent === "Not read yet", "the status");
      expect(tids("rl-row")).toHaveLength(2);
      expect(puts("citations")).toHaveLength(0);
      expect(crossref).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("a PDF with a DOI not kept yet keeps the paper from Crossref's record (one request, the DOI only) and attaches to it", async () => {
    put("citations", [PUTWAIN]);
    const title = "Daily screen time and sleep quality in adolescents";
    const doi = "10.1038/s41598-019-49731-x";
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ message: { title: [title], DOI: doi, author: [{ family: "Lee", given: "Ann" }], issued: { "date-parts": [[2021]] }, "container-title": ["Sleep Journal"], "article-number": "13317" } }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    h.extract.mockImplementation(async () => ({ pages: PAGE(title, doi), total: 1 }));
    try {
      await mount();
      await until(() => tids("rl-row").length === 1, "the rows");
      await pick(tid("rl-file")!, [fileOf("sleep.pdf", 5)]);
      await until(() => puts("shelf_index").length > 0 && puts("citations").length > 0, "the saves");
      expect(seen).toHaveLength(1);
      expect(seen[0]).toContain("api.crossref.org/works/10.1038");
      const lib = stored<StoredEntry[]>("citations")!;
      expect(lib).toHaveLength(2);
      // crLookupDoiV2, as the paste box and Keep: Crossref lists no page, so its article number is the pages.
      expect(lib[1]).toMatchObject({ title, doi, rl: true, author: expect.stringContaining("Lee"), pages: "13317" });
      expect(stored<ShelfIndex>("shelf_index")![0]).toMatchObject({ title, doi, pid: lib[1]!.pid });
      expect(tid("rl-add-status")!.textContent).toBe(`sleep.pdf: kept as ${title} and added.`);
      await until(() => tids("rl-row").length === 2, "the new paper's row");
      expect(rowOf("Lee").querySelector('[data-testid="rl-status"]')!.textContent).toBe("Not read yet");
    } finally { vi.unstubAllGlobals(); }
  });

  it("a PDF whose DOI Crossref cannot give is a paper only the reading list has, with the title from its first line", async () => {
    put("citations", [PUTWAIN]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    h.extract.mockImplementation(async () => ({ pages: PAGE("Some Unknown Paper About Sleep", "10.9999/unknown"), total: 1 }));
    try {
      await mount();
      await until(() => tids("rl-row").length === 1, "the rows");
      await pick(tid("rl-file")!, [fileOf("unknown.pdf", 5)]);
      await until(() => puts("shelf_index").length > 0, "the index save");
      expect(stored<ShelfIndex>("shelf_index")![0]).toMatchObject({ title: "Some Unknown Paper About Sleep" });
      expect(stored<ShelfIndex>("shelf_index")![0]).not.toHaveProperty("doi");
      expect(puts("citations")).toHaveLength(0);
      expect(tid("rl-add-status")!.textContent).toBe("unknown.pdf: added to your reading list.");
    } finally { vi.unstubAllGlobals(); }
  });

  it("a second PDF of a paper that has one is not stored, and says so", async () => {
    put("citations", [SCHAEFER]);
    put("shelf_index", [shelfEntry("sa", { pid: "ka" })]);
    put("shelf_paper:sa", paperOf());
    h.extract.mockImplementation(async () => ({ pages: PAGE(SCHAEFER.title!, SCHAEFER.doi!), total: 1 }));
    await mount();
    await until(() => tids("rl-row").length === 1, "the rows");
    await pick(tid("rl-file")!, [fileOf("again.pdf", 5)]);
    await until(() => tid("rl-add-status")?.textContent?.includes("already has a PDF") ?? false, "the status");
    expect(tid("rl-add-status")!.textContent).toBe(`again.pdf: ${SCHAEFER.title} already has a PDF.`);
    expect(server.calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  it("Add your own PDF and the restore are disabled while a batch runs, and enabled again when it is done", async () => {
    put("citations", [PUTWAIN]);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    h.extract.mockImplementation(async () => { await gate; return { pages: ["Some Paper About Sleep\n" + "word ".repeat(60)], total: 1 }; });
    await mount();
    await until(() => tids("rl-row").length === 1, "the rows");
    const add = () => tid("rl-add") as HTMLButtonElement, restore = () => tid("sh-restore") as HTMLButtonElement;
    expect([add().disabled, restore().disabled]).toEqual([false, false]);
    await pick(tid("rl-file")!, [fileOf("a.pdf", 5)]);
    expect([add().disabled, restore().disabled]).toEqual([true, true]);
    release();
    await until(() => puts("shelf_index").length > 0 && !add().disabled, "the batch done");
    expect(restore().disabled).toBe(false);
  });

  it("they are disabled while the list is not known: its index is locked", async () => {
    put("citations", [PUTWAIN]);
    server.blobs.push({ projectId: "p1", kind: "shelf_index", body: "AAAAAAAAAAAAAAAA.sealed", keyVersion: 1, version: 1 });
    const was = { decryptBody: vault.decryptBody, ensureUnlocked: vault.ensureUnlocked };
    vault.decryptBody = async (d: { bodyHtml: string; keyVersion: number }) => { if (d.keyVersion > 0) throw new Error("vault-locked"); return d.bodyHtml; };
    vault.ensureUnlocked = async () => false;
    try {
      await mount();
      await until(() => !!tid("rl-locked"), "the locked note");
      expect((tid("rl-add") as HTMLButtonElement).disabled).toBe(true);
      expect((tid("sh-restore") as HTMLButtonElement).disabled).toBe(true);
    } finally { Object.assign(vault, was); }
  });

  describe("addOwnPdf with fakes", () => {
    const NOW = new Date("2026-10-19T10:00:00.000Z");
    function fake(over: Partial<OwnPdfOps> = {}) {
      const st = { index: [] as ShelfIndex, status: [] as string[], created: [] as string[] };
      const ops: OwnPdfOps = {
        t, alive: () => true, library: () => [], entries: () => st.index, canWriteIndex: () => true,
        updateIndex: (u) => { st.index = u(st.index); return true; },
        createPaper: async (id) => { st.created.push(id); },
        updatePaper: () => true, flushPaper: async () => true, deletePaper: async () => true, paper: () => null,
        extract: async (f) => ({ pages: [f.name + " " + "word ".repeat(60)], total: 1 }),
        resolveTitle: async (pages, stem) => ({ title: shTitleGuess(pages, stem) }),
        setStatus: (s) => { st.status.push(s); }, toast: () => {}, now: () => NOW,
        lookupDoi: async () => null, keep: async () => null,
        ...over
      };
      return { st, ops };
    }

    it("three PDFs look their titles up at the same time: with 4 s each they are done before 8 s, and a fourth waits for a free place", async () => {
      vi.useFakeTimers();
      const started: string[] = [];
      const finished: string[] = [];
      const { st, ops } = fake({
        resolveTitle: (_pages, stem) => { started.push(stem); return new Promise((res) => { setTimeout(() => { finished.push(stem); res({ title: "Title of " + stem }); }, 4000); }); }
      });
      const done = addOwnPdf(["a", "b", "c", "d"].map((n) => fileOf(n + ".pdf", 1)), ops);
      await vi.advanceTimersByTimeAsync(0);
      expect(OWN_PDF_PARALLEL).toBe(3);
      expect(started).toEqual(["a", "b", "c"]);
      await vi.advanceTimersByTimeAsync(3999);
      expect(finished).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(finished).toEqual(["a", "b", "c"]);
      expect(started).toEqual(["a", "b", "c", "d"]);
      await vi.advanceTimersByTimeAsync(4000);
      await done;
      // Eight seconds for four papers; one after the other it would be sixteen. They are stored in the order they were chosen.
      expect(st.index.map((e) => e.file)).toEqual(["a.pdf", "b.pdf", "c.pdf", "d.pdf"]);
      expect(st.index.map((e) => e.title)).toEqual(["Title of a", "Title of b", "Title of c", "Title of d"]);
    });

    it("three PDFs are done before 8 s", async () => {
      vi.useFakeTimers();
      const { st, ops } = fake({ resolveTitle: (_p, stem) => new Promise((res) => { setTimeout(() => res({ title: stem }), 4000); }) });
      let finished = false;
      void addOwnPdf(["a", "b", "c"].map((n) => fileOf(n + ".pdf", 1)), ops).then(() => { finished = true; });
      await vi.advanceTimersByTimeAsync(7999);
      expect(finished).toBe(true);
      expect(st.index).toHaveLength(3);
    });

    it("each PDF is stored as soon as its own text and title are read, not after the whole batch; the sentences stay in the order chosen", async () => {
      vi.useFakeTimers();
      const wait: Record<string, number> = { a: 4000, b: 1000, c: 2500 };
      const { st, ops } = fake({ resolveTitle: (_p, stem) => new Promise((res) => { setTimeout(() => res({ title: "Title of " + stem }), wait[stem]!); }) });
      const done = addOwnPdf(["a", "b", "c"].map((n) => fileOf(n + ".pdf", 1)), ops);
      await vi.advanceTimersByTimeAsync(999);
      expect(st.index).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(st.index.map((e) => e.file)).toEqual(["b.pdf"]);
      await vi.advanceTimersByTimeAsync(1500);
      expect(st.index.map((e) => e.file)).toEqual(["b.pdf", "c.pdf"]);
      await vi.advanceTimersByTimeAsync(1500);
      await done;
      expect(st.index.map((e) => e.file)).toEqual(["b.pdf", "c.pdf", "a.pdf"]);
      expect(st.status.at(-1)).toBe("a.pdf: added to your reading list. b.pdf: added to your reading list. c.pdf: added to your reading list.");
    });

    it("nothing is stored for a PDF once the list was left, whether that happened while Crossref was asked for its DOI or while the paper was being kept", async () => {
      let alive = true;
      const cr = { title: "Crossref title", doi: "10.1/x", author: "Lee, A." } as CitationEntry;
      const keep = vi.fn(async () => ({ state: "kept" as const, pid: "kx" }));
      const one = fake({ alive: () => alive, resolveTitle: async () => ({ title: "T", doi: "10.1/x" }), lookupDoi: async () => { alive = false; return cr; }, keep });
      await addOwnPdf([fileOf("a.pdf", 1)], one.ops);
      expect(keep).not.toHaveBeenCalled();
      expect(one.st.created).toEqual([]);
      expect(one.st.index).toEqual([]);
      alive = true;
      const two = fake({ alive: () => alive, resolveTitle: async () => ({ title: "T", doi: "10.1/x" }), lookupDoi: async () => cr, keep: async () => { alive = false; return { state: "kept" as const, pid: "kx" }; } });
      await addOwnPdf([fileOf("a.pdf", 1)], two.ops);
      expect(two.st.created).toEqual([]);
      expect(two.st.index).toEqual([]);
    });

    it("a title lookup that fails falls back to v1's first line; a file that is not a PDF, one already there and a scanned one are said so, in the order chosen", async () => {
      const { st, ops } = fake({
        entries: () => [shelfEntry("p0", { file: "dup.pdf", size: 100 })],
        resolveTitle: async () => { throw new Error("offline"); },
        extract: async (f) => (f.name === "scan.pdf" ? "no-text" : { pages: ["First line of the paper\n" + "word ".repeat(60)], total: 300 })
      });
      await addOwnPdf([fileOf("notes.txt", 1), fileOf("dup.pdf", 100), fileOf("scan.pdf", 2), fileOf("ok.pdf", 3)], ops);
      expect(st.status.at(-1)).toBe("notes.txt: not a PDF. dup.pdf: already in your reading list. scan.pdf: no readable text, so it looks scanned. It was not added. ok.pdf: added to your reading list. Only the first 1 of 300 pages were read.");
      expect(st.index.map((e) => e.title)).toEqual(["First line of the paper"]);
    });
  });
});

// ---------------------------------------------------------------- the backup

describe("the backup", () => {
  it("the backup file carries doi and pid where the paper has them, and nothing is added where it has not", async () => {
    const items: Array<ShelfItem & { paper: ShelfPaper }> = [
      { ...shelfEntry("s1", { pid: "ka", doi: "10.1038/x" }), paper: paperOf(1) },
      { ...shelfEntry("s2"), paper: paperOf() }
    ];
    expect(toRecord(items[0]!)).toMatchObject({ id: "s1", doi: "10.1038/x", pid: "ka" });
    expect(Object.keys(toRecord(items[1]!))).toEqual(["id", "title", "file", "size", "added", "pages", "total", "notes", "cells"]);
    const sent: Blob[] = [];
    backupShelf(items, { t, now: () => new Date("2026-10-19T10:00:00.000Z"), download: (_n, b) => { sent.push(b); }, setStatus: () => {} });
    const text = await new Promise<string>((done) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.readAsText(sent[0]!); });
    const bundle = JSON.parse(text) as { papers: Array<Record<string, unknown>> };
    expect(bundle.papers.map((p) => [p.id, p.doi, p.pid])).toEqual([["s1", "10.1038/x", "ka"], ["s2", undefined, undefined]]);
  });

  it("words typed in Compare go into the backup, and a restore into an empty project brings them back to Compare (Task 22 fix round)", async () => {
    put("citations", [SCHAEFER]);
    put("shelf_index", [shelfEntry("sa", { title: SCHAEFER.title!, pid: "ka", doi: SCHAEFER.doi })]);
    put("shelf_paper:sa", { ...paperOf(1), cells: { Sample: "the old copy, which Compare never writes" } });
    // The student types in Compare.
    const first = await mount(<CompareTab />);
    await until(() => tids("cmp-row").length === 1, "the Compare row");
    const typeIn = (el: HTMLElement, value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const box = (col: string) => tid("cmp-row")!.querySelector<HTMLTextAreaElement>(`textarea[aria-label$=", ${col}"]`)!;
    typeIn(box("Sample"), "58 first-year students");
    typeIn(box("Weak points"), "One university only");
    await until(() => (stored<ApNotes>("ap_notes")?.["p:ka"]?.cells?.Sample ?? "") === "58 first-year students", "the cell is saved");
    first.unmount();
    // Back up the Reading list.
    const list = await mount(<ReadingList />);
    await until(() => tids("rl-row").length === 1 && !tid("panel-loading") && tid("rl-row")!.getAttribute("aria-busy") === null, "the list, with the paper's text read");
    await click(tid("sh-backup"));
    expect(h.download).toHaveBeenCalledTimes(1);
    const sent = h.download.mock.calls[0]![1] as Blob;
    const text = await new Promise<string>((done) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.readAsText(sent); });
    const bundle = JSON.parse(text) as { papers: Array<{ id: string; pid?: string; cells: Record<string, string> }> };
    // The file has what was typed in Compare, not the copy nothing writes any more.
    expect(bundle.papers.map((p) => [p.id, p.pid, p.cells])).toEqual([["sa", "ka", { Sample: "58 first-year students" }]]);
    list.unmount();
    // A new account: nothing in the project. The restore reads the file.
    server = { blobs: [], calls: [] };
    heldBlobs.clear();
    const empty = await mount(<ReadingList />);
    await until(() => !tid("panel-loading") && tid("rl-empty") !== null, "the empty list");
    await pick(tid("sh-rest")!, [new File([text], "backup.json", { type: "application/json" })]);
    await until(() => tid("rl-add-status")?.textContent === "Papers restored: 1.", "the restore");
    await until(() => (stored<ShelfIndex>("shelf_index")?.length ?? 0) === 1, "the index is saved");
    const pid = stored<ShelfIndex>("shelf_index")![0]!.pid!;
    expect(pid).toMatch(/^k/);
    await until(() => (stored<ApNotes>("ap_notes")?.["p:" + pid]?.cells ?? null) !== null, "the note's cells");
    // The note is whole (stages and card, ruling B2-R11) and holds the typed cells.
    expect(stored<ApNotes>("ap_notes")!["p:" + pid]).toMatchObject({ stages: {}, card: {}, pid, cells: { Sample: "58 first-year students" } });
    empty.unmount();
    // Compare in the new project shows them.
    await mount(<CompareTab />);
    await until(() => tids("cmp-row").length === 1, "the row after the restore");
    expect(box("Sample").value).toBe("58 first-year students");
  });
});

// ---------------------------------------------------------------- the blob clients

describe("a shelf paper's blob client says when its save is refused", () => {
  const box: { s: ShelfStore | null } = { s: null };
  async function mountStore() {
    function Probe() { box.s = useShelfStore(); return null; }
    return mount(<Probe />);
  }

  beforeEach(() => {
    put("shelf_index", [shelfEntry("pa", { pid: "ka" })]);
    put("shelf_paper:pa", paperOf());
  });

  it("a conflict on a paper's highlights shows the conflict toast once", async () => {
    await mountStore();
    await until(() => box.s!.papers.get("pa")?.value != null, "the paper");
    // Another window keeps saving first.
    server.conflict = (kind) => kind === "shelf_paper:pa";
    act(() => { expect(box.s!.ops.updatePaper("pa", (p) => ({ ...p, notes: [...p.notes, { id: "n1", page: 1, quote: "First page", note: "", at: "x" }] }))).toBe(true); });
    await act(async () => { await box.s!.ops.flushPaper("pa"); });
    expect(puts("shelf_paper:pa")).toHaveLength(3);
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(E.blob_conflict);
    // What was typed is still shown.
    expect(box.s!.papers.get("pa")!.value!.notes).toHaveLength(1);
  });

  it("an edit to a paper deleted in another window says so, once, and does not bring the paper back", async () => {
    await mountStore();
    await until(() => box.s!.papers.get("pa")?.value != null, "the paper");
    server.blobs = server.blobs.filter((b) => b.kind !== "shelf_paper:pa");
    act(() => { expect(box.s!.ops.updatePaper("pa", (p) => ({ ...p, cells: { Sample: "40" } }))).toBe(true); });
    await act(async () => { await box.s!.ops.flushPaper("pa"); });
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith("This was deleted in another window, so your change to it was not saved.");
    expect(server.blobs.some((b) => b.kind === "shelf_paper:pa")).toBe(false);
  });

  it("no toast comes after the list was left", async () => {
    const m = await mountStore();
    await until(() => box.s!.papers.get("pa")?.value != null, "the paper");
    server.conflict = (kind) => kind === "shelf_paper:pa";
    act(() => { box.s!.ops.updatePaper("pa", (p) => ({ ...p, cells: { Sample: "40" } })); });
    m.unmount();
    await until(() => puts("shelf_paper:pa").length === 3, "the three tries");
    await settle(50);
    expect(h.toast).not.toHaveBeenCalled();
  });
});

describe("ruling B2-R14 and the counts", () => {
  it("papers that are attached to notes: a note kept under p:<pid> with the student's words makes the row Reading", async () => {
    const notes: ApNotes = { "p:kb": { stages: { design: { mine: "A cohort study of students." } }, card: {}, pid: "kb" } };
    put("citations", [PUTWAIN]);
    put("ap_notes", notes);
    await mount();
    await until(() => tid("rl-status")?.textContent === "Reading. No PDF", "the status");
    expect(server.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});

// ---------------------------------------------------------------- Task 21a fix round

describe("keyboard focus after Rename and Remove (Task 21a fix round)", () => {
  async function loosePdf() {
    put("citations", []);
    put("shelf_index", [shelfEntry("s1", { title: "A loose PDF", pid: "kz" })]);
    put("shelf_paper:s1", paperOf());
    await mount();
    await until(() => tids("rl-row").length === 1 && !(tid("rl-read") as HTMLButtonElement).disabled, "the row");
  }

  it("Rename puts the focus in the title box, not back on More; Cancel gives it back to More", async () => {
    await loosePdf();
    (tid("rl-more") as HTMLElement).focus();
    await openMore(tids("rl-row")[0]!);
    await click($('[data-testid="rl-item-rename"]'));
    await settle(60);
    expect(tid("rl-title")).not.toBeNull();
    expect(document.activeElement).toBe(tid("rl-title"));
    await click(tid("rl-rename-cancel"));
    expect(tid("rl-title")).toBeNull();
    expect(document.activeElement).toBe(tid("rl-more"));
  });

  it("Save title gives the focus back to More", async () => {
    await loosePdf();
    await openMore(tids("rl-row")[0]!);
    await click($('[data-testid="rl-item-rename"]'));
    await settle(60);
    await act(async () => { (tid("rl-rename") as HTMLFormElement).requestSubmit(); });
    expect(tid("rl-title")).toBeNull();
    expect(document.activeElement).toBe(tid("rl-more"));
  });

  it("Remove puts the focus on Keep it, the safe answer, not back on More; answering Keep it gives it back to More", async () => {
    await loosePdf();
    (tid("rl-more") as HTMLElement).focus();
    await openMore(tids("rl-row")[0]!);
    await click($('[data-testid="rl-item-remove"]'));
    await settle(60);
    expect(tid("rl-confirm")).not.toBeNull();
    expect(document.activeElement).toBe(tid("rl-remove-no"));
    await click(tid("rl-remove-no"));
    expect(tid("rl-confirm")).toBeNull();
    expect(document.activeElement).toBe(tid("rl-more"));
  });

  it("a menu item that opens no form (Add to my references) leaves the focus on More, as the menu does", async () => {
    await loosePdf();
    await openMore(tids("rl-row")[0]!);
    await click($('[data-testid="rl-item-refs"]'));
    await settle(60);
    expect(document.activeElement).toBe(tid("rl-more"));
  });
});

describe("a row's status hears the student's own words (Task 21a fix round)", () => {
  const TAKE: ApNotes = { "p:kb": { stages: { design: { mine: "A cohort study of students." } }, card: {}, pid: "kb" } };

  it("while the notes are being read the list shows its loading sign, so no row says Not read yet first; then the status the student's words make", async () => {
    put("citations", [PUTWAIN]);
    put("ap_notes", TAKE);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    h.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if ((init.method ?? "GET") === "GET" && decodeURIComponent(path).endsWith("/blobs/ap_notes")) await gate;
      return fakeApi(path, init);
    });
    await mount();
    await settle(100);
    expect(tid("panel-loading")).not.toBeNull();
    expect(tids("rl-row")).toHaveLength(0);
    expect(tids("rl-status")).toHaveLength(0);
    release();
    await until(() => tid("rl-status")?.textContent === "Reading. No PDF", "the status from the notes");
    expect(tid("panel-loading")).toBeNull();
  });

  it("a note written in this window by another panel of the Reading tab changes the row's status at once", async () => {
    put("citations", [PUTWAIN]);
    function Tab() {
      const notes = useApNotes("p1");
      return (
        <>
          <ReadingList notes={notes} />
          <button type="button" data-testid="write-take" onClick={() => { notes.put({ id: "p:kb", title: PUTWAIN.title! }, (n) => { n.stages.design = { mine: "A cohort study of students." }; }); }}>write</button>
        </>
      );
    }
    await mount(<Tab />);
    await until(() => tid("rl-status")?.textContent === "Not read yet. No PDF", "the row");
    await click(tid("write-take"));
    await until(() => tid("rl-status")?.textContent === "Reading. No PDF", "the new status");
  });

  it("notes that do not open on this device are said so, as an index or a library that does not open is", async () => {
    put("citations", [PUTWAIN]);
    server.blobs.push({ projectId: "p1", kind: "ap_notes", body: "AAAAAAAAAAAAAAAA.sealed", keyVersion: 1, version: 1 });
    await mount();
    await until(() => !!tid("rl-broken"), "the broken note");
    expect(tid("rl-broken")!.textContent).toBe(E.rl_broken);
  });

  it("notes that are locked are said so too", async () => {
    put("citations", [PUTWAIN]);
    server.blobs.push({ projectId: "p1", kind: "ap_notes", body: "AAAAAAAAAAAAAAAA.sealed", keyVersion: 1, version: 1 });
    const was = { decryptBody: vault.decryptBody, ensureUnlocked: vault.ensureUnlocked };
    vault.decryptBody = async (d: { bodyHtml: string; keyVersion: number }) => { if (d.keyVersion > 0) throw new Error("vault-locked"); return d.bodyHtml; };
    vault.ensureUnlocked = async () => false;
    try {
      await mount();
      await until(() => !!tid("rl-locked"), "the locked note");
      expect(tid("rl-locked")!.textContent).toBe(E.rl_locked);
    } finally { Object.assign(vault, was); }
  });
});
