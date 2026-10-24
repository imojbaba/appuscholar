// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import JSZip from "jszip";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildShelfSummaryPromptV2, fieldLabel, shTitleGuess, shBackupFileName, shColsOf, shSnippetParts, shTokens, type ShRecord } from "@appuscholar/core";
import en from "../messages/en.json";

/*
 * The Reading shelf (v1 11513-11725, the dialog 1247-1254). The orchestration (lib/shelf/actions.ts, shelfSummarise) is driven with fakes and checked against what v1 did with the same
 * inputs (packages/core/test/golden/shelf/cases.json, `golden:capture shelf`): shAddFiles' status line and records, shSaveHL's quotes and toasts, shRestore's checks and count,
 * shBackup's bundle, shMatrixCsv's text, shColAdd/shColDel, and shSummarise's note, prompt, options and summary box. The dialog is then mounted with the real store
 * (lib/shelf/useShelf.ts, useProjectBlob) over a fake blob api: papers added, renamed and removed (a second press, the paper's blob deleted), search and passages, highlights
 * saved to the paper's blob, the matrix columns in shelf_cols, the summary gate, backup and restore, and R16's confirm over a blob that does not open.
 */

type Spec = { pages?: Array<Array<{ str: string; hasEOL?: boolean }>>; numPages?: number; error?: string };
type Fx = {
  papers: Array<{ id: string; title: string; pages: string[] }>;
  search: Array<{ q: string; note: boolean; empty: string | null; cards: Array<{ id: string; page: number }> }>;
  find: Array<{ q: string; empty: string | null; cards: Array<{ id: string; page: number }> }>;
  add: { files: Array<{ name: string; size: number; pdf?: Spec }>; status: string; records: Array<{ title: string; file: string; size: number; pages: string[]; total: number }> };
  quotes: Array<{ pageText: string; selection: string; note: string; toasts: string[]; notes: Array<{ idShape: boolean; page: number; quote: string; note: string }> }>;
  summaries: Array<{ field: string | null; prompt: string; opts: Record<string, unknown>; pages: string[]; mine: string; notes: Array<{ note: string }>; out: string }>;
  trim: { reply: string; out: string };
  gate: Array<{ text: string; out: boolean }>;
  colOps: Array<{ op: ["add", string] | ["del", number]; out: string[]; stored: string | null }>;
  csv: Array<{ stored: string | null; papers: Array<{ title: string; cells?: Record<string, string> }>; name: string; text: string }>;
  backup: { keys: string[]; bundle: { app: string; v: number; papers: ShRecord[] }; status: string };
  restore: Array<{ text: string; status: string; stored: Array<{ id: string; pages: string[]; notes: unknown[]; cells: object }> }>;
};
const FX = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/shelf/cases.json"), "utf8")) as Fx;
const E = en as Record<string, string>;

type SBlob = { projectId: string; kind: string; body: string; keyVersion: number };
type Call = { path: string; method: string; body?: { body: string; keyVersion: number } };
const h = vi.hoisted(() => ({
  api: vi.fn(),
  toast: vi.fn(),
  download: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => "OK"),
  extract: vi.fn(),
  editor: null as unknown,
  openExport: vi.fn()
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
// The vault is off: bodies are plaintext JSON (keyVersion 0); a body stored with a key version does not open here (it is "broken").
const vault = {
  status: "off", known: async () => "off", ensureUnlocked: async () => true,
  encryptBody: async (_d: unknown, s: string) => ({ bodyHtml: s, keyVersion: 0 }),
  decryptBody: async (d: { bodyHtml: string; keyVersion: number }) => { if (d.keyVersion > 0) throw new Error("corrupt"); return d.bodyHtml; }
};
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => vault }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1" }, projectId: "p1", openExport: h.openExport }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" }, settings: { field: "education" } }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download }));
vi.mock("@/lib/shelf/extract", async (orig) => ({ ...(await orig<typeof import("../lib/shelf/extract")>()), extractPdfPages: (f: File) => h.extract(f) }));

import { ApiError } from "../lib/api";
import { tFormat } from "../lib/i18n";
import { shelfSummarise } from "../lib/ai/actions";
import { heldBlobs } from "../lib/blobs/held";
import type { ShelfIndex, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import {
  addColumn, addFiles, backupShelf, deleteColumn, downloadMatrix, readFileText, removePaper, renamePaper, restoreShelf, saveHighlight, type ShelfEntry, type ShelfItem, type ShelfOps
} from "../lib/shelf/actions";
import { PdfReaderUnavailable, type PdfDoc } from "../lib/shelf/extract";
import { ShelfDialog } from "../components/tools/shelf/ShelfDialog";
import { exportProject } from "../lib/export/projectExport";
import { useShelf, writeIndexDetached } from "../lib/shelf/useShelf";
import { blobId } from "../lib/blobs/kinds";
import type { BlobVault } from "../lib/blobs/useProjectBlob";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = (k: string, v?: Record<string, string | number>) => tFormat(E, E, k, "en", v);
const NOW = new Date("2026-10-19T10:00:00.000Z");
const DEFAULTS = ["Sample", "Method", "Key finding"];
const EMPTY: ShelfPaper = { pages: [], notes: [], cells: {} };
/** A pdf.js stand-in for one file, from the specs the v1 capture drove shExtractPdf with. */
const readPdfOf = (spec: Spec) => async (): Promise<PdfDoc> => {
  if (spec.error !== undefined) throw new Error(spec.error);
  return { numPages: spec.numPages ?? spec.pages!.length, getPage: async (k: number) => ({ getTextContent: async () => ({ items: spec.pages![k - 1] ?? [] }) }) };
};
const fileOf = (name: string, size: number) => new File(["x".repeat(size)], name);
/** A blob's text with a byte-order mark kept (FileReader's readAsText drops it; jsdom's Blob has no text()). */
const blobText = (b: Blob) => new Promise<string>((done, fail) => {
  const r = new FileReader();
  r.onload = () => done(new TextDecoder("utf-8", { ignoreBOM: true }).decode(r.result as ArrayBuffer));
  r.onerror = () => fail(r.error);
  r.readAsArrayBuffer(b);
});

/** ShelfOps over plain arrays, recording what was stored and in what order. */
function fakeOps(init: { library?: StoredEntry[]; entries?: ShelfEntry[]; papers?: Record<string, ShelfPaper>; extract?: ShelfOps["extract"]; resolveTitle?: ShelfOps["resolveTitle"]; canWrite?: boolean; create?: ShelfOps["createPaper"]; alive?: () => boolean } = {}) {
  const st = { index: init.entries ?? [] as ShelfIndex, papers: { ...(init.papers ?? {}) } as Record<string, ShelfPaper>, status: [] as string[], toasts: [] as string[], log: [] as string[], created: [] as Array<[string, ShelfPaper]> };
  const ops: ShelfOps = {
    t,
    alive: init.alive ?? (() => true),
    library: () => init.library ?? [],
    entries: () => st.index,
    canWriteIndex: () => init.canWrite ?? true,
    updateIndex: (u) => { st.index = u(st.index); st.log.push("index"); return true; },
    createPaper: init.create ?? (async (id, p) => { st.created.push([id, p]); st.papers[id] = p; st.log.push("create:" + id); }),
    updatePaper: (id, u) => { st.papers[id] = u(st.papers[id] ?? EMPTY); st.log.push("update:" + id); return true; },
    flushPaper: async () => true,
    deletePaper: async (id) => { st.log.push("delete:" + id); delete st.papers[id]; return true; },
    paper: (id) => st.papers[id] ?? null,
    extract: init.extract ?? (async () => "no-text"),
    // The default is v1's first-line guess, so the golden cases above hold; the W15 cases below pass their own.
    resolveTitle: init.resolveTitle ?? (async (pages, stem) => ({ title: shTitleGuess(pages, stem) })),
    setStatus: (s) => { st.status.push(s); },
    toast: (m) => { st.toasts.push(m); },
    now: () => NOW
  };
  return { st, ops };
}

describe("addFiles is shAddFiles", () => {
  it("v1's status line and records over v1's batch: not a PDF, already on the shelf, scanned, added (first 200 of 205), the two errors; each paper stored before its index entry", async () => {
    // The dialog's tests replace extractPdfPages; this one runs the real one over the stand-in documents.
    const { extractPdfPages } = await vi.importActual<typeof import("../lib/shelf/extract")>("../lib/shelf/extract");
    const specs = new Map<File, Spec>();
    const files = FX.add.files.map((f) => { const file = fileOf(f.name, f.size); specs.set(file, f.pdf ?? {}); return file; });
    const { st, ops } = fakeOps({
      entries: [{ id: "p0", title: "Dup", file: "dup.pdf", size: 100, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1 }],
      extract: (f) => extractPdfPages(f, readPdfOf(specs.get(f)!))
    });
    await addFiles(files, ops);
    expect(st.status[0]).toBe("Reading notes.docx…");
    expect(st.status.at(-1)!.split(" | ")).toEqual(FX.add.status.split(" | "));
    expect(st.created.map(([, p]) => p.pages)).toEqual(FX.add.records.map((r) => r.pages));
    expect(st.created.every(([id, p]) => /^p[0-9a-z]+$/.test(id) && p.notes.length === 0 && Object.keys(p.cells).length === 0)).toBe(true);
    expect(st.index.slice(1).map((e) => ({ title: e.title, file: e.file, size: e.size, total: e.total, kept: e.kept }))).toEqual(
      FX.add.records.map((r) => ({ title: r.title, file: r.file, size: r.size, total: r.total, kept: r.pages.length })));
    expect(st.index.slice(1).every((e) => e.added === NOW.toISOString())).toBe(true);
    const ids = st.created.map(([id]) => id);
    expect(st.log).toEqual(ids.flatMap((id) => ["create:" + id, "index"]));
  });
  it("pdf.js that does not load says v1's sentence; a paper that cannot be stored is not added; a kept broken index adds nothing (R16)", async () => {
    const one = fakeOps({ extract: async () => { throw new PdfReaderUnavailable(); } });
    await addFiles([fileOf("a.pdf", 3)], one.ops);
    expect(one.st.status.at(-1)).toBe("a.pdf: " + E.sh2_the_pdf_reader_needs);
    const two = fakeOps({ extract: async () => ({ pages: ["x".repeat(300)], total: 1 }), create: async () => { throw new Error(E.vault_save_locked); } });
    await addFiles([fileOf("b.pdf", 3)], two.ops);
    expect(two.st.status.at(-1)).toBe("b.pdf: " + E.vault_save_locked);
    expect(two.st.index).toEqual([]);
    const three = fakeOps({ canWrite: false, extract: vi.fn() });
    await addFiles([fileOf("c.pdf", 3)], three.ops);
    expect(three.st.status).toEqual([]);
    expect(three.ops.extract).not.toHaveBeenCalled();
  });
});

describe("a reading-list paper gets its pid when it is added or restored (wave B, Task 17)", () => {
  const LIBRARY: StoredEntry[] = [
    { title: "Daily screen time and sleep quality in adolescents", doi: "10.1038/s41598-019-49731-x", pid: "klibrary01" },
    { title: "Another kept paper about study habits", pid: "klibrary02" }
  ];
  const page = (name: string) => ({ pages: [name + " text ".repeat(60)], total: 1 });
  const old = (id: string, extra: Partial<ShelfEntry> = {}): ShelfEntry => ({ id, title: "Old " + id, file: id + ".pdf", size: 1, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1, ...extra });

  it("a new paper with the library entry's DOI takes its pid; one matched by title takes it too; one the library does not hold gets its own", async () => {
    const named: Record<string, { title: string; doi?: string }> = {
      byDoi: { title: "Screen time and sleep, as printed on the page", doi: "10.1038/S41598-019-49731-X" },
      byTitle: { title: "Another kept paper about study habits" },
      alone: { title: "A paper the library does not hold at all" }
    };
    const { st, ops } = fakeOps({ library: LIBRARY, extract: async (f) => page(f.name), resolveTitle: async (_p, stem) => named[stem]! });
    await addFiles([fileOf("byDoi.pdf", 1), fileOf("byTitle.pdf", 2), fileOf("alone.pdf", 3)], ops);
    expect(st.index.map((e) => e.pid?.slice(0, 1))).toEqual(["k", "k", "k"]);
    expect(st.index[0]!.pid).toBe("klibrary01");
    expect(st.index[1]!.pid).toBe("klibrary02");
    expect(LIBRARY.map((e) => e.pid)).not.toContain(st.index[2]!.pid);
    expect(new Set(st.index.map((e) => e.pid)).size).toBe(3);
  });

  it("adding to a reading list whose older papers have no pid gives them one too", async () => {
    const { st, ops } = fakeOps({ library: LIBRARY, entries: [old("p0", { title: "Another kept paper about study habits" })], extract: async (f) => page(f.name), resolveTitle: async () => ({ title: "A new one on circadian rhythm" }) });
    await addFiles([fileOf("n.pdf", 1)], ops);
    expect(st.index[0]!.pid).toBe("klibrary02");
    expect(st.index[1]!.pid).toMatch(/^k/);
  });

  it("a restore keeps a replaced paper's pid and DOI, whatever the backup file says", async () => {
    const entry = old("p1", { pid: "kkeep", doi: "10.1/kept" });
    const { st, ops } = fakeOps({ library: LIBRARY, entries: [entry], papers: { p1: { pages: ["old"], notes: [], cells: {} } } });
    await restoreShelf(JSON.stringify({ app: "appuscholar-shelf", v: 1, papers: [{ id: "p1", title: "Restored", file: "r.pdf", pid: "klibrary02", pages: ["new"] }] }), ops);
    expect(st.index).toHaveLength(1);
    expect(st.index[0]).toMatchObject({ id: "p1", title: "Restored", file: "r.pdf", pid: "kkeep", doi: "10.1/kept" });
  });

  it("a restore takes a backup record's pid only if a library entry in this project has it; otherwise the library is matched by title, or a new pid is made", async () => {
    const { st, ops } = fakeOps({ library: LIBRARY });
    const papers = [
      { id: "p1", title: "Whatever it is called", pid: "klibrary01", pages: ["a"] },
      { id: "p2", title: "Whatever else", pid: "kfromanotheraccount", pages: ["b"] },
      { id: "p3", title: "Another kept paper about study habits", pages: ["c"] },
      { id: "p4", title: "Unheld paper", pages: ["d"] }
    ];
    await restoreShelf(JSON.stringify({ app: "appuscholar-shelf", v: 1, papers }), ops);
    const pid = (id: string) => st.index.find((e) => e.id === id)!.pid;
    expect(pid("p1")).toBe("klibrary01");
    expect(pid("p2")).not.toBe("kfromanotheraccount");
    expect(pid("p2")).toMatch(/^k/);
    expect(pid("p3")).toBe("klibrary02");
    expect(pid("p4")).toMatch(/^k/);
    expect(new Set(["p2", "p4"].map(pid)).size).toBe(2);
  });
});

describe("a new shelf paper takes its real title (W15, register row D-S2-28)", () => {
  const PAGES = ["1 Scientific Repo R t S | (2019) 9:13317 | https://doi.org/10.1038/s41598-019-49731-x Daily screen time and sleep quality in adolescents\n" + "word ".repeat(80)];
  const old = (id: string, title: string): ShelfEntry => ({ id, title, file: id + ".pdf", size: 1, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1 });
  it("the resolved title and DOI go on the new entry; the file stem and the pages are what was asked of it", async () => {
    const resolveTitle = vi.fn(async () => ({ title: "Daily screen time and sleep quality in adolescents", doi: "10.1038/s41598-019-49731-x" }));
    const { st, ops } = fakeOps({ extract: async () => ({ pages: PAGES, total: 1 }), resolveTitle });
    await addFiles([fileOf("scirep.pdf", 9)], ops);
    expect(resolveTitle).toHaveBeenCalledWith(PAGES, "scirep");
    expect(st.index).toHaveLength(1);
    expect(st.index[0]).toMatchObject({ title: "Daily screen time and sleep quality in adolescents", doi: "10.1038/s41598-019-49731-x", file: "scirep.pdf" });
  });
  it("a paper with no DOI gets no doi key; a title lookup that throws falls back to v1's guess and the paper is still added", async () => {
    const plain = fakeOps({ extract: async () => ({ pages: ["Sleep and Memory in Adolescents\n" + "word ".repeat(60)], total: 1 }), resolveTitle: async () => ({ title: "Sleep and Memory in Adolescents" }) });
    await addFiles([fileOf("a.pdf", 1)], plain.ops);
    expect(plain.st.index[0]).not.toHaveProperty("doi");
    const broken = fakeOps({ extract: async () => ({ pages: PAGES, total: 1 }), resolveTitle: async () => { throw new Error("boom"); } });
    await addFiles([fileOf("b.pdf", 2)], broken.ops);
    expect(broken.st.index.map((e) => e.title)).toEqual([shTitleGuess(PAGES, "b")]);
    expect(broken.st.status.at(-1)).toBe("b.pdf" + E.sh2_added_pages!.replace("{pagesCount}", "1"));
  });
  it("papers already on the shelf keep their titles (their Analyse notes are keyed by the title); a restore keeps each record's own", async () => {
    const resolveTitle = vi.fn(async () => ({ title: "Resolved Title Of The New Paper", doi: "10.1/x" }));
    const { st, ops } = fakeOps({ entries: [old("p0", "Named by the first line"), old("p1", "Renamed by the student")], extract: async () => ({ pages: PAGES, total: 1 }), resolveTitle });
    await addFiles([fileOf("new.pdf", 3)], ops);
    expect(resolveTitle).toHaveBeenCalledTimes(1);
    expect(st.index.map((e) => e.title)).toEqual(["Named by the first line", "Renamed by the student", "Resolved Title Of The New Paper"]);
    expect(st.index[0]).not.toHaveProperty("doi");
    // The same file added again is refused before any title is asked for; a restore asks for none.
    await addFiles([fileOf("new.pdf", 3)], ops);
    await restoreShelf(JSON.stringify({ app: "appuscholar-shelf", v: 1, papers: [{ id: "p9", title: "From the backup", file: "r.pdf", pages: PAGES }] }), ops);
    expect(resolveTitle).toHaveBeenCalledTimes(1);
    expect(st.index.at(-1)!.title).toBe("From the backup");
  });
  it("the dialog asks Crossref for the DOI printed on page 1 and names the paper by the title it gives, when that title is on the page", async () => {
    const title = "Daily screen time and sleep quality in adolescents";
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ message: { title: [title], DOI: "10.1038/s41598-019-49731-x" } }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    h.extract.mockImplementation(async () => ({ pages: PAGES, total: 1 }));
    try {
      await mount();
      await pick(tid("sh-file")!, [fileOf("scirep.pdf", 5)]);
      await until(() => puts("shelf_index").length > 0, "the index save");
      const e = stored<ShelfIndex>("shelf_index")![0]!;
      expect(e.title).toBe(title);
      expect(e.doi).toBe("10.1038/s41598-019-49731-x");
      expect(seen).toHaveLength(1);
      expect(seen[0]).toContain("api.crossref.org/works/10.1038");
    } finally { vi.unstubAllGlobals(); }
  });
  it("a Crossref title that is not on page 1 is not used by the dialog (Review Focus 3)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: { title: ["A completely different paper about reading comprehension"], DOI: "10.1038/s41598-019-49731-x" } }), { status: 200 })));
    h.extract.mockImplementation(async () => ({ pages: PAGES, total: 1 }));
    try {
      await mount();
      await pick(tid("sh-file")!, [fileOf("scirep.pdf", 5)]);
      await until(() => puts("shelf_index").length > 0, "the index save");
      expect(stored<ShelfIndex>("shelf_index")![0]!.title).toBe(shTitleGuess(PAGES, "scirep"));
    } finally { vi.unstubAllGlobals(); }
  });
});

describe("a batch stops once the dialog that started it has gone (alive() false)", () => {
  it("addFiles stores no paper after the close, and a paper whose text was already being stored still gets its index entry", async () => {
    let alive = true;
    const { st, ops } = fakeOps({
      alive: () => alive,
      extract: async (f) => { if (f.name === "b.pdf") alive = false; return { pages: ["x".repeat(300)], total: 1 }; },
      create: async (id, p) => { st.created.push([id, p]); st.log.push("create:" + id); if (st.created.length === 1) alive = false; }
    });
    await addFiles([fileOf("a.pdf", 1), fileOf("b.pdf", 2), fileOf("c.pdf", 3)], ops);
    // a: closed while its text was stored, so its entry is still written; b and c: nothing.
    expect(st.created).toHaveLength(1);
    expect(st.index.map((e) => e.file)).toEqual(["a.pdf"]);
    alive = true;
    const two = fakeOps({ alive: () => alive, extract: async () => { alive = false; return { pages: ["x".repeat(300)], total: 1 }; } });
    await addFiles([fileOf("a.pdf", 1)], two.ops);
    expect(two.st.created).toEqual([]);
    expect(two.st.index).toEqual([]);
  });
  it("restoreShelf stops before the next paper", async () => {
    let alive = true;
    const { st, ops } = fakeOps({ alive: () => alive, create: async (id, p) => { st.created.push([id, p]); alive = false; } });
    await restoreShelf(JSON.stringify({ app: "appuscholar-shelf", v: 1, papers: [{ id: "p1", pages: ["a"] }, { id: "p2", pages: ["b"] }] }), ops);
    expect(st.created.map(([id]) => id)).toEqual(["p1"]);
    expect(st.index.map((e) => e.id)).toEqual(["p1"]);
  });
});

describe("the reader's highlights and the papers' titles are v1's", () => {
  it("saveHighlight stores v1's quote and note with v1's toasts (shSaveHL)", () => {
    for (const q of FX.quotes) {
      const { st, ops } = fakeOps({ papers: { q: { pages: [q.pageText], notes: [], cells: {} } } });
      saveHighlight("q", 1, q.selection, q.note, ops);
      expect(st.toasts, q.selection).toEqual(q.toasts);
      expect(st.papers.q!.notes.map((n) => ({ idShape: /^n[0-9a-z]+$/.test(n.id), page: n.page, quote: n.quote, note: n.note }))).toEqual(q.notes);
      expect(st.papers.q!.notes.every((n) => n.at === NOW.toISOString())).toBe(true);
    }
  });
  it("renamePaper trims, and an empty title falls back to the file name (shRename); removePaper deletes the blob, then the entry", async () => {
    const e = (id: string): ShelfEntry => ({ id, title: "T" + id, file: id + ".pdf", size: 1, added: "", total: 1, kept: 1 });
    const { st, ops } = fakeOps({ entries: [e("a"), e("b")] });
    renamePaper("a", "  New title  ", ops);
    renamePaper("b", "   ", ops);
    expect(st.index.map((x) => x.title)).toEqual(["New title", "b.pdf"]);
    expect(await removePaper("a", ops)).toBe(true);
    expect(st.log.slice(-2)).toEqual(["delete:a", "index"]);
    expect(st.index.map((x) => x.id)).toEqual(["b"]);
    const kept = fakeOps({ entries: [e("a")] });
    kept.ops.deletePaper = async () => false;
    expect(await removePaper("a", kept.ops)).toBe(false);
    expect(kept.st.index).toHaveLength(1);
  });
});

describe("the matrix, the backup and the restore are v1's", () => {
  it("addColumn and deleteColumn store what shColAdd and shColDel stored, in order (the defaults come back after the last column goes)", () => {
    let stored: string[] | null = null;
    const set = (u: (prev: string[] | null) => string[]) => { stored = u(stored); };
    for (const o of FX.colOps) {
      if (o.op[0] === "add") addColumn(o.op[1], DEFAULTS, set); else deleteColumn(o.op[1], DEFAULTS, set);
      expect(shColsOf(stored, DEFAULTS), JSON.stringify(o.op)).toEqual(o.out);
      expect(JSON.stringify(stored)).toBe(o.stored);
    }
  });
  it("downloadMatrix is reading_matrix.csv with v1's text and byte-order mark", async () => {
    for (const c of FX.csv) {
      h.download.mockReset();
      const items: ShelfItem[] = c.papers.map((p, i) => ({ id: "m" + i, title: p.title, file: "", size: 0, added: "", total: 0, kept: 0, paper: { pages: [], notes: [], cells: p.cells ?? {} } }));
      downloadMatrix(items, shColsOf(c.stored ? JSON.parse(c.stored) : null, DEFAULTS), { t, download: h.download });
      const [name, blob] = h.download.mock.calls[0] as [string, Blob];
      expect(name).toBe(c.name);
      expect(blob.type).toBe("text/csv;charset=utf-8");
      expect(await blobText(blob)).toBe("﻿" + c.text);
    }
  });
  it("backupShelf writes shBackup's bundle and v1's status; papers not read yet are left out", async () => {
    h.download.mockReset();
    const statuses: string[] = [];
    const items: ShelfItem[] = [...FX.backup.bundle.papers.map((p) => ({ id: p.id, title: p.title, file: p.file, size: p.size, added: p.added, total: p.total, kept: p.pages.length, paper: { pages: p.pages, notes: p.notes, cells: p.cells } })),
      { id: "locked", title: "L", file: "l.pdf", size: 1, added: "", total: 1, kept: 1, paper: null }];
    backupShelf(items, { t, now: () => NOW, download: h.download, setStatus: (s) => statuses.push(s) });
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toBe(shBackupFileName(NOW));
    const bundle = JSON.parse(await blobText(blob)) as Record<string, unknown>;
    expect(Object.keys(bundle)).toEqual(FX.backup.keys);
    expect(bundle.exported).toBe(NOW.toISOString());
    expect(JSON.stringify(bundle.papers)).toBe(JSON.stringify(FX.backup.bundle.papers));
    expect([bundle.app, bundle.v]).toEqual([FX.backup.bundle.app, FX.backup.bundle.v]);
    expect(statuses).toEqual([FX.backup.status]);
  });
  it("restoreShelf accepts only app 'appuscholar-shelf' and stores what shRestore stored, with v1's count", async () => {
    for (const r of FX.restore) {
      const { st, ops } = fakeOps();
      await restoreShelf(r.text, ops);
      expect(st.status, r.text).toEqual([r.status]);
      expect(st.created.map(([id, p]) => ({ id, pages: p.pages, notes: p.notes, cells: p.cells }))).toEqual(r.stored.map((x) => ({ id: x.id, pages: x.pages, notes: x.notes, cells: x.cells })));
      expect(st.index.map((e) => e.id)).toEqual(r.stored.map((x) => x.id));
    }
  });
  it("restoreShelf replaces a paper with the same id, gives an id the store refuses a new one, and counts a repeated id twice as v1 does", async () => {
    const entry: ShelfEntry = { id: "p1", title: "Old", file: "old.pdf", size: 1, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1 };
    const { st, ops } = fakeOps({ entries: [entry], papers: { p1: { pages: ["old"], notes: [], cells: {} } } });
    const text = JSON.stringify({ app: "appuscholar-shelf", v: 1, papers: [{ id: "p1", title: "New", file: "new.pdf", size: 2, added: "2026-02-01T00:00:00.000Z", pages: ["new"], total: 1 }, { id: "a b", pages: ["x"] }, { id: "p1", title: "Newer", pages: ["newer"] }] });
    await restoreShelf(text, ops);
    expect(st.status).toEqual(["Restored 3 papers."]);
    expect(st.papers.p1!.pages).toEqual(["newer"]);
    expect(st.index.find((e) => e.id === "p1")!.title).toBe("Newer");
    expect(st.created).toHaveLength(1);
    expect(st.created[0]![0]).toMatch(/^p[0-9a-z]+$/);
    expect(st.index).toHaveLength(2);
  });
});

describe("shelfSummarise is shSummarise", () => {
  it("saves the student's lines first, then sends core's prompt with v1's options, and shows the reply with v1's comparison line in the summary box", async () => {
    for (const s of FX.summaries) {
      const order: string[] = [];
      const outs: string[] = [];
      const saved: unknown[] = [];
      const callAI = vi.fn(async () => { order.push("call"); return "OK"; });
      await shelfSummarise({ callAI, field: fieldLabel(s.field), t, mine: s.mine, pages: s.pages, setOut: (x) => outs.push(x), saveNote: async (n) => { order.push("note"); saved.push(n); return true; }, now: () => NOW });
      expect(order).toEqual(["note", "call"]);
      expect(saved).toEqual([{ id: "n" + NOW.getTime().toString(36), page: 0, quote: "", note: s.notes[0]!.note, at: NOW.toISOString() }]);
      // Fix wave A (W18): the prompt is buildShelfSummaryPromptV2's (the passages that matter); v1's prompt before PAPER TEXT and v1's options are unchanged.
      const v2 = buildShelfSummaryPromptV2(fieldLabel(s.field), s.pages);
      expect(callAI).toHaveBeenCalledWith(v2.prompt, s.opts);
      expect(v2.prompt.slice(0, v2.prompt.indexOf("\n\nPAPER TEXT"))).toBe(s.prompt.slice(0, s.prompt.indexOf("\n\nPAPER TEXT")));
      expect(outs).toEqual([E.sh2_reading_2, s.out]);
    }
  });
  it("a long paper's limitations section reaches the model (W18)", async () => {
    const filler = Array.from({ length: 400 }, (_, i) => `Filler sentence number ${i} about the study and nothing else of note at all.`).join("\n");
    const pages = ["Abstract\nWe studied students.\nIntroduction\n" + filler, "Limitations\nA limitation is that every participant came from one university.\n" + filler];
    const callAI = vi.fn(async (_prompt: string, _opts: object) => "OK");
    await shelfSummarise({ callAI, field: "psychology", t, mine: FX.summaries[1]!.mine, pages, setOut: () => {}, saveNote: async () => true, now: () => NOW });
    const sent = callAI.mock.calls[0]![0];
    expect(sent).toContain("A limitation is that every participant came from one university.");
    expect(sent).toContain("(selected passages: the opening, any limitations, then the discussion, method and results)");
    expect(sent.length).toBeLessThan(20000);
  });
  it("trims the reply; does nothing before the gate passes; says the error, or v1's sentence; makes no call when the note cannot be stored", async () => {
    const outs: string[] = [];
    const base = { field: "psychology", t, pages: ["p"], setOut: (x: string) => outs.push(x), saveNote: async () => true };
    await shelfSummarise({ ...base, mine: FX.summaries[1]!.mine, callAI: async () => FX.trim.reply });
    expect(outs.at(-1)).toBe(FX.trim.out);
    const callAI = vi.fn(async () => "OK");
    const saveNote = vi.fn(async () => true);
    for (const g of FX.gate.filter((x) => !x.out)) await shelfSummarise({ ...base, mine: g.text, callAI, saveNote });
    expect(callAI).not.toHaveBeenCalled();
    expect(saveNote).not.toHaveBeenCalled();
    const mine = FX.gate.find((x) => x.out)!.text;
    await shelfSummarise({ ...base, mine, callAI: async () => { throw new Error("Add your <b>Gemini</b> key first."); } });
    expect(outs.at(-1)).toBe("Add your Gemini key first.");
    await shelfSummarise({ ...base, mine, callAI: async () => { throw new Error(""); } });
    expect(outs.at(-1)).toBe(E.sh2_the_summary_could_not);
    const never = vi.fn(async () => "OK");
    await shelfSummarise({ ...base, mine, callAI: never, saveNote: async () => false });
    expect(never).not.toHaveBeenCalled();
    expect(outs.at(-1)).toBe(E.sh2_the_summary_could_not);
  });
});

// ---------------------------------------------------------------- the dialog, with the real store over a fake blob api

let server: { blobs: SBlob[]; calls: Call[] };
const wire = (b: SBlob) => ({ kind: b.kind, body: b.body, keyVersion: b.keyVersion, deks: [], updatedAt: "2026-10-19T00:00:00.000Z" });
function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(String(init.body)) as Call["body"]) : undefined;
  server.calls.push({ path, method, body });
  const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  if (!m) return Promise.reject(new ApiError(404, "not-found"));
  const projectId = m[1]!, kind = decodeURIComponent(m[2]!);
  const cur = server.blobs.find((b) => b.projectId === projectId && b.kind === kind);
  if (method === "GET") return cur ? Promise.resolve(wire(cur)) : Promise.reject(new ApiError(404, "not-found"));
  if (method === "DELETE") { if (!cur) return Promise.reject(new ApiError(404, "not-found")); server.blobs = server.blobs.filter((b) => b !== cur); return Promise.resolve(null); }
  const next = { projectId, kind, body: body!.body, keyVersion: body!.keyVersion };
  server.blobs = [...server.blobs.filter((b) => b !== cur), next];
  return Promise.resolve(wire(next));
}
const stored = <T,>(kind: string): T | null => { const b = server.blobs.find((x) => x.kind === kind); return b ? (JSON.parse(b.body) as T) : null; };
const puts = (kind: string) => server.calls.filter((c) => c.method === "PUT" && decodeURIComponent(c.path).endsWith("/blobs/" + kind));
/** The four papers of the golden corpus, on the shelf in order. */
function seedCorpus() {
  const index: ShelfIndex = FX.papers.map((p, i) => ({ id: p.id, title: p.title, file: p.id + ".pdf", size: 10 + i, added: `2026-01-0${i + 1}T00:00:00.000Z`, total: p.pages.length, kept: p.pages.length }));
  server.blobs.push({ projectId: "p1", kind: "shelf_index", body: JSON.stringify(index), keyVersion: 0 });
  for (const p of FX.papers) server.blobs.push({ projectId: "p1", kind: "shelf_paper:" + p.id, body: JSON.stringify({ pages: p.pages, notes: [], cells: {} }), keyVersion: 0 });
}

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel));
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tids = (id: string) => $$(`[data-testid="${id}"]`);
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 400; i++) { if (pred()) return; await settle(10); }
  throw new Error(what + " not reached");
}
/** Mounts the dialog open; the answer closes it as Close, Escape or the overlay does (the parent sets open to false, which unmounts its body). */
async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<ShelfDialog open onOpenChange={() => {}} />); });
  await settle(20);
  return { close: async () => { await act(async () => { root.render(<ShelfDialog open={false} onOpenChange={() => {}} />); }); } };
}
/** Holds the n-th PUT of a shelf paper until `release()`; `reached` once it has been made. */
function holdPaperPut(n: number) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const box = { reached: false, release: () => release() };
  let seen = 0;
  h.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
    if (init.method === "PUT" && decodeURIComponent(path).includes("/blobs/shelf_paper:") && ++seen === n) { box.reached = true; await gate; }
    return fakeApi(path, init);
  });
  return box;
}
const paperIds = () => server.blobs.filter((b) => b.kind.startsWith("shelf_paper:")).map((b) => b.kind.slice("shelf_paper:".length)).sort();
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function blurWith(el: HTMLElement, value: string) {
  (el as HTMLInputElement).value = value;
  await act(async () => { el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
}
async function pick(input: HTMLElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}

beforeEach(() => {
  server = { blobs: [], calls: [] };
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset();
  h.download.mockReset();
  h.callAI.mockReset().mockImplementation(async () => "OK");
  h.extract.mockReset();
  h.editor = null;
  heldBlobs.clear();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the Reading shelf dialog", () => {
  it("opens on Papers: the heading, v1's sentence, the four tabs in v1's order, the empty shelf, the backup note and Close; no storage line", async () => {
    await mount();
    const dlg = tid("shelf-dialog")!;
    expect(dlg.querySelector("h2")!.textContent).toBe("📚 Reading shelf");
    expect(dlg.textContent).toContain(E.sh2_intro);
    expect($$("#shTabs button").map((b) => b.textContent)).toEqual(["Papers", "Search", "Find passages for a sentence", "Matrix"]);
    expect(tid("sh-tab-papers")!.getAttribute("aria-selected")).toBe("true");
    expect(tid("sh-empty")!.textContent).toBe("The shelf is empty. Add a PDF to start.");
    expect(dlg.textContent).toContain("The shelf is kept apart from the normal backup. Press Back up the shelf now and then. Clearing your browser data erases the shelf.");
    expect(dlg.textContent).not.toContain(E.sh2_mb_used_of_about);
    expect(tid("sh-close")!.textContent).toBe("Close");
    expect(tid("sh-add")!.textContent).toBe("➕ Add PDFs");
  });

  it("adds PDFs with v1's per-file sentences, storing the text of a readable one (its blob, then the index) and nothing for a scanned one, with no console error", async () => {
    const err = vi.spyOn(console, "error");
    h.extract.mockImplementation(async (f: File) => (f.name === "scan.pdf" ? "no-text" : { pages: ["Sleep and Memory in Adolescents\n" + "word ".repeat(60)], total: 1 }));
    await mount();
    await pick(tid("sh-file")!, [fileOf("paper.pdf", 5), fileOf("scan.pdf", 6), fileOf("notes.txt", 7)]);
    await until(() => tid("sh-status")?.textContent?.includes("|") ?? false, "the status line");
    expect(tid("sh-status")!.textContent).toBe("paper.pdf: added, 1 pages | scan.pdf: no readable text (it looks scanned). Not added. | notes.txt: not a PDF");
    const paperPuts = server.calls.filter((c) => c.method === "PUT" && c.path.includes("shelf_paper"));
    expect(paperPuts).toHaveLength(1);
    await until(() => puts("shelf_index").length > 0, "the index save");
    const index = stored<ShelfIndex>("shelf_index")!;
    expect(index.map((e) => ({ title: e.title, file: e.file, size: e.size, total: e.total, kept: e.kept }))).toEqual([{ title: "Sleep and Memory in Adolescents", file: "paper.pdf", size: 5, total: 1, kept: 1 }]);
    expect(decodeURIComponent(paperPuts[0]!.path)).toBe(`/projects/p1/blobs/shelf_paper:${index[0]!.id}`);
    expect(JSON.parse(paperPuts[0]!.body!.body)).toEqual({ pages: ["Sleep and Memory in Adolescents\n" + "word ".repeat(60)], notes: [], cells: {} });
    expect(server.calls.findIndex((c) => c.method === "PUT" && c.path.includes("shelf_paper"))).toBeLessThan(server.calls.findIndex((c) => c.method === "PUT" && c.path.endsWith("shelf_index")));
    await until(() => tids("sh-paper").length === 1, "the paper's row");
    await until(() => tid("sh-paper-meta")!.textContent === "paper.pdf · 1 pages · 0 highlights", "the paper's line");
    expect(err).not.toHaveBeenCalled();
  });

  it("renames inline, and removes a paper only on the second press, deleting its blob and its entry", async () => {
    seedCorpus();
    await mount();
    await until(() => tids("sh-paper").length === 4, "the papers");
    expect(tids("sh-title").map((x) => (x as HTMLInputElement).value)).toEqual(FX.papers.map((p) => p.title));
    await blurWith(tids("sh-title")[0]!, "  Renamed paper  ");
    await until(() => stored<ShelfIndex>("shelf_index")![0]!.title === "Renamed paper", "the rename");
    const remove = tids("sh-remove")[1]!;
    expect(remove.textContent).toBe("Remove from shelf");
    await click(remove);
    expect(remove.textContent).toBe("Press again to remove it and its highlights");
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    await click(remove);
    await until(() => server.calls.some((c) => c.method === "DELETE"), "the delete");
    expect(decodeURIComponent(server.calls.find((c) => c.method === "DELETE")!.path)).toBe("/projects/p1/blobs/shelf_paper:pb");
    await until(() => (stored<ShelfIndex>("shelf_index") ?? []).length === 3, "the entry removed");
    expect(server.blobs.some((b) => b.kind === "shelf_paper:pb")).toBe(false);
    expect(stored<ShelfIndex>("shelf_index")!.map((e) => e.id)).toEqual(["pa", "pc", "pd"]);
  });

  it("Search shows v1's pages and marked snippets, with the AND-to-OR note; Find passages starts from the editor's selection and shows the closest sentence", async () => {
    seedCorpus();
    h.editor = { isDestroyed: false, state: { selection: { from: 1, to: 9, empty: false }, doc: { textBetween: () => "  Sleep improves\n memory in adolescents.  " } } };
    await mount();
    await until(() => tids("sh-read").every((b) => !(b as HTMLButtonElement).disabled) && tids("sh-read").length === 4, "the papers read");
    await click(tid("sh-tab-search"));
    for (const c of FX.search.filter((x) => ["memory screens", "Sleep memory", "xyzzy", "the and of"].includes(x.q))) {
      typeIn(tid("sh-q")!, c.q);
      await click(tid("sh-search-run"));
      const cards = tids("sh-result");
      const title = (id: string) => FX.papers.find((p) => p.id === id)!.title;
      expect(cards.map((x) => x.querySelector(".sh-card-head")!.textContent), c.q).toEqual(c.cards.map((k) => title(k.id) + " · page " + k.page));
      expect(!!tid("sh-or-note"), c.q).toBe(c.note);
      if (c.note) expect(tid("sh-or-note")!.textContent).toBe("No page has every word, so these pages have some of them.");
      if (c.empty !== null) expect(tid("sh-res")!.textContent).toBe(c.empty);
      cards.forEach((card, i) => {
        const k = c.cards[i]!;
        const parts = shSnippetParts(FX.papers.find((p) => p.id === k.id)!.pages[k.page - 1]!, Array.from(new Set(shTokens(c.q))), 220);
        expect(Array.from(card.querySelectorAll("mark")).map((m) => m.textContent)).toEqual(parts.filter((p) => p.mark).map((p) => p.text));
        expect(card.querySelector(".sh-snippet")!.textContent).toBe(parts.map((p) => p.text).join(""));
      });
    }
    await click(tid("sh-tab-find"));
    expect((tid("sh-sent") as HTMLTextAreaElement).value).toBe("Sleep improves memory in adolescents.");
    const f = FX.find.find((x) => x.q === "Sleep improves memory in adolescents.")!;
    await click(tid("sh-find-run"));
    expect(tids("sh-result").map((x) => x.querySelector(".sh-card-head")!.textContent)).toEqual(f.cards.map((k) => FX.papers.find((p) => p.id === k.id)!.title + " · page " + k.page));
    expect(tids("sh-snippet").every((s) => s.textContent!.startsWith("Closest sentence: "))).toBe(true);
    typeIn(tid("sh-sent")!, "Anxiety is common.");
    await click(tid("sh-find-run"));
    expect(tid("sh-res")!.textContent).toBe("No page shares enough words with that sentence.");
    // "Open this page" opens the reader on it.
    typeIn(tid("sh-sent")!, "Sleep improves memory in adolescents.");
    await click(tid("sh-find-run"));
    await click(tids("sh-open-page")[0]!);
    expect(tid("sh-reader-title")!.textContent).toBe(FX.papers.find((p) => p.id === f.cards[0]!.id)!.title);
    expect((tid("sh-pg") as HTMLInputElement).value).toBe(String(f.cards[0]!.page));
  });

  it("the reader pages through the text and saves a selected passage as a highlight on the paper's blob, marked on the page", async () => {
    seedCorpus();
    await mount();
    await until(() => tids("sh-read").length === 4 && !(tids("sh-read")[0] as HTMLButtonElement).disabled, "the papers read");
    await click(tids("sh-read")[0]!);
    expect(tid("sh-text")!.textContent).toBe(FX.papers[0]!.pages[0]);
    expect(tid("shelf-dialog")!.textContent).toContain(E.sh2_this_is_the_text);
    await click(tid("sh-next"));
    expect((tid("sh-pg") as HTMLInputElement).value).toBe("2");
    await click(tid("sh-next"));
    await click(tid("sh-next"));
    expect((tid("sh-pg") as HTMLInputElement).value).toBe("3");
    await click(tid("sh-prev"));
    expect(tid("sh-text")!.textContent).toBe(FX.papers[0]!.pages[1]);
    // Select "word lists" in the page's text.
    const node = tid("sh-text")!.querySelector("span")!.firstChild as Text;
    const at = node.data.indexOf("word lists");
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + "word lists".length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    typeIn(tid("sh-note")!, "  the task  ");
    await click(tid("sh-save-hl"));
    expect(h.toast).toHaveBeenCalledWith("Highlight saved");
    await until(() => puts("shelf_paper:pa").length > 0, "the paper's save");
    expect(stored<ShelfPaper>("shelf_paper:pa")!.notes).toEqual([expect.objectContaining({ page: 2, quote: "word lists", note: "the task" })]);
    expect(Array.from(tid("sh-text")!.querySelectorAll("mark")).map((m) => m.textContent)).toEqual(["word lists"]);
    expect(tid("sh-hl")!.textContent).toContain("p. 2 “word lists”");
    expect((tid("sh-note") as HTMLTextAreaElement).value).toBe("");
    // A selection outside the page text is "Select some text on the page first".
    window.getSelection()!.removeAllRanges();
    await click(tid("sh-save-hl"));
    expect(h.toast).toHaveBeenLastCalledWith("Select some text on the page first");
    await click(tid("sh-hl-del"));
    await until(() => stored<ShelfPaper>("shelf_paper:pa")!.notes.length === 0, "the highlight deleted");
    await click(tid("sh-back"));
    expect(tids("sh-paper")).toHaveLength(4);
  });

  it("Summarise with AI stays disabled, its reason under it, until two lines and twelve words; then the lines are saved first and the summary lands in the reader", async () => {
    seedCorpus();
    await mount();
    await until(() => tids("sh-read").length === 4 && !(tids("sh-read")[0] as HTMLButtonElement).disabled, "the papers read");
    await click(tids("sh-read")[0]!);
    const btn = tid("sh-ai") as HTMLButtonElement;
    expect(btn.textContent).toBe("Summarise with AI");
    expect(btn.disabled).toBe(true);
    expect(tid("sh-ai-why")!.textContent).toBe(E.sh2_in_your_own_words);
    expect(btn.getAttribute("aria-describedby")).toBe("shAiWhy");
    typeIn(tid("sh-mine")!, "one two three four five six\nseven eight nine ten eleven");
    expect(btn.disabled).toBe(true);
    let saveSeenAtCall = false;
    h.callAI.mockImplementation(async () => { saveSeenAtCall = (stored<ShelfPaper>("shelf_paper:pa")?.notes.length ?? 0) === 1; return "Aim: sleep."; });
    typeIn(tid("sh-mine")!, "one two three four five six\nseven eight nine ten eleven twelve");
    expect(btn.disabled).toBe(false);
    expect(tid("sh-ai-why")).toBeNull();
    await click(btn);
    await until(() => tid("sh-ai-out")!.textContent!.startsWith("Aim"), "the summary");
    expect(tid("sh-ai-out")!.textContent).toBe("Aim: sleep.\n\nCompare this with your own two lines. The AI can be wrong or miss a limitation.");
    expect(saveSeenAtCall).toBe(true);
    expect(stored<ShelfPaper>("shelf_paper:pa")!.notes[0]).toMatchObject({ page: 0, quote: "", note: "My own summary before the AI: one two three four five six\nseven eight nine ten eleven twelve" });
    const [prompt, opts] = h.callAI.mock.calls[0] as [string, unknown];
    expect(opts).toEqual({ temp: 0.2, max: 1000, noLang: true });
    expect(prompt.startsWith("You are helping a student of education read a paper.")).toBe(true);
    expect(prompt).toContain("Contact: [author email removed]");
  });

  it("the matrix shows the default columns, stores added and removed columns in shelf_cols and cells on the paper; Export opens the export place, whose table is reading_matrix.csv", async () => {
    seedCorpus();
    await mount();
    await until(() => tids("sh-read").length === 4 && !(tids("sh-read")[3] as HTMLButtonElement).disabled, "the papers read");
    await click(tid("sh-tab-matrix"));
    expect(tid("shelf-dialog")!.textContent).toContain("The cells are yours, not the AI's.");
    expect(tids("sh-col-head").map((x) => x.firstChild!.textContent!.trim())).toEqual(DEFAULTS);
    expect(tids("sh-matrix-row")).toHaveLength(4);
    typeIn(tid("sh-col")!, "  Sample size ");
    await click(tid("sh-col-add"));
    await until(() => stored<string[]>("shelf_cols") !== null, "the columns' save");
    expect(stored<string[]>("shelf_cols")).toEqual([...DEFAULTS, "Sample size"]);
    await click(tids("sh-col-del")[0]!);
    await until(() => stored<string[]>("shelf_cols")!.length === 3, "the column removed");
    expect(stored<string[]>("shelf_cols")).toEqual(["Method", "Key finding", "Sample size"]);
    await blurWith(tids("sh-cell")[0]!, "survey");
    await until(() => stored<ShelfPaper>("shelf_paper:pa")?.cells.Method === "survey", "the cell's save");
    // Wave B Task 12 (D-S2-42): v1's "Download as CSV" is now Export, with the comparison ticked; the zip's compare/table.csv is v1's file, from what is stored.
    await click(tid("sh-csv"));
    expect(h.openExport).toHaveBeenCalledWith("compare");
    expect(h.download).not.toHaveBeenCalled();
    // jsdom's Blob has no arrayBuffer(), which the export reads a tool's file with in the browser: one through FileReader, for this test.
    const readBytes = (b: Blob) => new Promise<ArrayBuffer>((done) => { const r = new FileReader(); r.onload = () => done(r.result as ArrayBuffer); r.readAsArrayBuffer(b); });
    const had = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function (this: Blob) { return readBytes(this); };
    const zip = await exportProject({
      project: { id: "p1", title: "P", titleKeyVersion: 0, deks: [] }, t: (k) => tFormat(en, en, k, "en"),
      listDocuments: async () => [], getDocument: async () => { throw new Error("none"); }, decrypt: async () => "", openTitle: async () => ({ state: "unreadable" }),
      readBlob: async (kind) => { const v = stored<unknown>(kind); return v === null ? null : JSON.stringify(v); },
      writingRecord: async () => { throw new Error("none"); }, aiUseLog: async () => []
    }, ["compare"], { style: "apa", now: new Date(), lastSearch: null }).finally(() => { Blob.prototype.arrayBuffer = had; });
    const table = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await (await JSZip.loadAsync(await readBytes(zip))).file("compare/table.csv")!.async("uint8array"));
    expect(table.split("\n")[0]).toBe("﻿Paper,Method,Key finding,Sample size");
    expect(table.split("\n")[1]).toBe("Sleep and memory in adolescents,survey,,");
  });

  it("backs up the shelf and restores a backup: a file that is not one says so; one that is adds its papers", async () => {
    await mount();
    await click(tid("sh-backup"));
    expect(h.download.mock.calls[0]![0]).toMatch(/^appuscholar-shelf-\d{4}-\d{2}-\d{2}\.json$/);
    expect(tid("sh-status")!.textContent).toBe("Shelf backed up: 0 papers.");
    await pick(tid("sh-rest")!, [new File(['{"app":"other","papers":[]}'], "b.json")]);
    await until(() => tid("sh-status")!.textContent === "That file is not a shelf backup.", "the refusal");
    const text = JSON.stringify({ app: "appuscholar-shelf", v: 1, papers: [{ id: "p9", title: "Restored", file: "r.pdf", size: 3, added: "2026-03-01T00:00:00.000Z", pages: ["Restored text"], total: 1, notes: [], cells: { Sample: "12" } }] });
    await pick(tid("sh-rest")!, [new File([text], "b.json")]);
    await until(() => tid("sh-status")!.textContent === "Restored 1 papers.", "the restore");
    expect(stored<ShelfPaper>("shelf_paper:p9")).toEqual({ pages: ["Restored text"], notes: [], cells: { Sample: "12" } });
    await until(() => (stored<ShelfIndex>("shelf_index") ?? []).length === 1, "the index save");
    // The restored paper is on the list with a pid of its own (wave B, Task 17): the library holds nothing it could be.
    expect(stored<ShelfIndex>("shelf_index")![0]).toEqual({ id: "p9", title: "Restored", file: "r.pdf", size: 3, added: "2026-03-01T00:00:00.000Z", total: 1, kept: 1, pid: expect.stringMatching(/^k[0-9a-z]+$/) });
  });

  it("closing the dialog during Add PDFs: the paper being stored still gets its index entry, and no other paper is stored after the close", async () => {
    const held = holdPaperPut(2);
    h.extract.mockImplementation(async (f: File) => ({ pages: [f.name + " " + "word ".repeat(60)], total: 1 }));
    const d = await mount();
    await pick(tid("sh-file")!, [fileOf("a.pdf", 1), fileOf("b.pdf", 2), fileOf("c.pdf", 3)]);
    await until(() => held.reached, "b's text being stored");
    await d.close();
    expect(tid("shelf-dialog")).toBeNull();
    held.release();
    await until(() => (stored<ShelfIndex>("shelf_index") ?? []).length === 2, "both entries");
    await settle(1000);
    const index = stored<ShelfIndex>("shelf_index")!;
    expect(index.map((e) => e.file)).toEqual(["a.pdf", "b.pdf"]);
    expect(paperIds()).toEqual(index.map((e) => e.id).sort());
    expect(h.extract).toHaveBeenCalledTimes(2);
  });

  it("closing the dialog during a restore: the same", async () => {
    const held = holdPaperPut(2);
    const d = await mount();
    const text = JSON.stringify({ app: "appuscholar-shelf", v: 1, papers: ["p1", "p2", "p3"].map((id) => ({ id, title: id, file: id + ".pdf", size: 1, added: "2026-03-01T00:00:00.000Z", pages: ["t"], total: 1 })) });
    await pick(tid("sh-rest")!, [new File([text], "b.json")]);
    await until(() => held.reached, "p2's text being stored");
    await d.close();
    held.release();
    await until(() => (stored<ShelfIndex>("shelf_index") ?? []).length === 2, "both entries");
    await settle(1000);
    expect(stored<ShelfIndex>("shelf_index")!.map((e) => e.id)).toEqual(["p1", "p2"]);
    expect(paperIds()).toEqual(["p1", "p2"]);
  });

  it("reopened while the closed dialog's index entry is still being written: the new dialog waits for that write and lists the paper", async () => {
    let releasePaper!: () => void, releaseIndex!: () => void;
    const paperGate = new Promise<void>((r) => { releasePaper = r; }), indexGate = new Promise<void>((r) => { releaseIndex = r; });
    const box = { paper: false, index: false };
    h.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      const p = decodeURIComponent(path);
      if (init.method === "PUT" && p.includes("/blobs/shelf_paper:") && !box.paper) { box.paper = true; await paperGate; }
      if (init.method === "PUT" && p.endsWith("/blobs/shelf_index") && !box.index) { box.index = true; await indexGate; }
      return fakeApi(path, init);
    });
    h.extract.mockImplementation(async (f: File) => ({ pages: [f.name + " " + "word ".repeat(60)], total: 1 }));
    const d = await mount();
    await pick(tid("sh-file")!, [fileOf("a.pdf", 1)]);
    await until(() => box.paper, "a's text being stored");
    await d.close();
    releasePaper();
    // The entry goes through a detached client (the dialog is gone); its PUT is out when the dialog opens again.
    await until(() => box.index, "the detached index write");
    await mount();
    await settle(50);
    releaseIndex();
    await until(() => tids("sh-paper").length === 1, "a's row in the reopened dialog");
    await settle(1000);
    expect(stored<ShelfIndex>("shelf_index")!.map((e) => e.file)).toEqual(["a.pdf"]);
  }, 15000);

  it("a detached index write never asks for the passphrase (the dialog is gone): with the vault locked its entry is held for the blob", async () => {
    server.blobs.push({ projectId: "p1", kind: "shelf_index", body: "AAAAAAAAAAAAAAAA.sealed", keyVersion: 1 });
    const locked = () => Promise.reject(new Error("vault-locked"));
    const ensureUnlocked = vi.fn(async () => true);
    const v = { known: async () => "on" as const, ensureUnlocked, encryptBody: locked, decryptBody: locked };
    const entry: ShelfEntry = { id: "pz", title: "Z", file: "z.pdf", size: 1, added: NOW.toISOString(), total: 1, kept: 1 };
    writeIndexDetached("p1", (prev) => [...(prev ?? []), entry], () => v as unknown as BlobVault);
    await until(() => heldBlobs.has(blobId("p1", "shelf_index")), "the held entry");
    expect(ensureUnlocked).not.toHaveBeenCalled();
    expect(server.calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  it("Shelf shows the loading sign, not its empty state, until its data is read (W8)", async () => {
    seedCorpus();
    // The index's read is held: the shelf is not known to be empty, nor its papers' pages known.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    h.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if ((init.method ?? "GET") === "GET" && decodeURIComponent(path).endsWith("/blobs/shelf_index")) await gate;
      return fakeApi(path, init);
    });
    await mount();
    expect(tid("sh-body")!.querySelector('[data-testid="panel-loading"]')!.textContent).toBe(E.blob_loading);
    expect(tid("sh-empty")).toBeNull();
    expect(tids("sh-paper")).toHaveLength(0);
    await click(tid("sh-tab-matrix"));
    expect(tid("sh-body")!.querySelector('[data-testid="panel-loading"]')).not.toBeNull();
    expect(tid("sh-body")!.textContent).not.toContain(E.sh2_the_shelf_is_empty_2);
    expect(tids("sh-matrix")).toHaveLength(0);
    release();
    await until(() => tids("sh-matrix-row").length === 4, "the matrix");
    expect(tid("panel-loading")).toBeNull();
    await click(tid("sh-tab-papers"));
    await until(() => tids("sh-paper").length === 4, "the papers");
    expect(tid("panel-loading")).toBeNull();
    expect(tid("sh-empty")).toBeNull();
  });

  it("a paper row shows the loading sign, not 'pages only', while that paper's text is read (W8)", async () => {
    seedCorpus();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    h.api.mockImplementation(async (path: string, init: RequestInit = {}) => {
      if ((init.method ?? "GET") === "GET" && decodeURIComponent(path).endsWith("/blobs/shelf_paper:pa")) await gate;
      return fakeApi(path, init);
    });
    await mount();
    await until(() => tids("sh-paper").length === 4, "the papers");
    await until(() => tids("sh-paper-meta").length === 3, "the other papers' lines");
    expect(tid("sh-paper-loading")!.textContent).toBe(E.blob_loading);
    expect(tids("sh-paper")[0]!.textContent).not.toContain("pages only");
    expect(tids("sh-paper")[0]!.textContent).not.toMatch(/\d+ pages/);
    expect(tids("sh-paper-meta")[0]!.textContent).toBe("pb.pdf · 2 pages · 0 highlights");
    release();
    await until(() => tids("sh-paper-meta").length === 4 && !tid("sh-paper-loading"), "the first paper's line");
    expect(tids("sh-paper-meta")[0]!.textContent).toBe("pa.pdf · 3 pages · 0 highlights");
  });

  it("a removal the server refuses says so and keeps the paper; a paper whose blob is not read shows its pages only", async () => {
    seedCorpus();
    server.blobs = server.blobs.map((b) => (b.kind === "shelf_paper:pc" ? { ...b, body: "AAAAAAAAAAAAAAAA.sealed", keyVersion: 1 } : b));
    h.api.mockImplementation(async (path: string, init: RequestInit = {}) => (init.method === "DELETE" ? Promise.reject(new ApiError(500, "server")) : fakeApi(path, init)));
    await mount();
    await until(() => tids("sh-paper").length === 4 && !(tids("sh-read")[0] as HTMLButtonElement).disabled, "the papers");
    expect(tids("sh-paper-meta")[2]!.textContent).toBe("pc.pdf · 2 pages");
    expect(tids("sh-paper-meta")[0]!.textContent).toBe("pa.pdf · 3 pages · 0 highlights");
    await click(tids("sh-remove")[0]!);
    await click(tids("sh-remove")[0]!);
    await until(() => tid("sh-status")?.textContent === E.shelf_remove_fail, "the failure");
    expect(tid("sh-status")!.textContent).toBe("That paper could not be removed. Check your connection and try again.");
    expect(tids("sh-paper")).toHaveLength(4);
    expect(server.blobs.some((b) => b.kind === "shelf_paper:pa")).toBe(true);
  });

  it("a stored index that does not open is reported, and the first write over it asks first (R16): no means nothing is stored", async () => {
    server.blobs.push({ projectId: "p1", kind: "shelf_index", body: "AAAAAAAAAAAAAAAA.sealed", keyVersion: 1 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    h.extract.mockImplementation(async () => ({ pages: ["x".repeat(300)], total: 1 }));
    await mount();
    await until(() => !!tid("sh-broken"), "the broken note");
    expect(tid("sh-broken")!.textContent).toBe(E.vault_shelf_broken);
    await pick(tid("sh-file")!, [fileOf("paper.pdf", 5)]);
    expect(confirm).toHaveBeenCalledWith(E.vault_shelf_broken_confirm);
    await settle(900);
    expect(server.calls.filter((c) => c.method === "PUT")).toEqual([]);
    confirm.mockReturnValue(true);
    await pick(tid("sh-file")!, [fileOf("paper.pdf", 5)]);
    await until(() => puts("shelf_index").length > 0, "the index replaced");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(stored<ShelfIndex>("shelf_index")!.map((e) => e.file)).toEqual(["paper.pdf"]);
  });
});

describe("useShelf, the shelf for another tool (Task 12's dropdown)", () => {
  it("lists the stored index, read only, and loadPaper reads one paper's text, highlights and cells; a missing paper is null", async () => {
    seedCorpus();
    const box: { v: ReturnType<typeof useShelf> | null } = { v: null };
    function Probe() { box.v = useShelf(); return null; }
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    await act(async () => { root.render(<Probe />); });
    await until(() => box.v!.index !== null, "the index");
    expect(box.v!.projectId).toBe("p1");
    expect(box.v!.index!.map((e) => e.id)).toEqual(FX.papers.map((p) => p.id));
    expect([box.v!.loading, box.v!.locked, box.v!.broken]).toEqual([false, false, false]);
    expect(await box.v!.loadPaper("pb")).toEqual({ pages: FX.papers[1]!.pages, notes: [], cells: {} });
    expect(await box.v!.loadPaper("nope")).toBeNull();
    await settle(900);
    expect(server.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
  it("a failed read of the index is `error` (index null), apart from a read that found no index (index null, error false)", async () => {
    const box: { v: ReturnType<typeof useShelf> | null } = { v: null };
    function Probe() { box.v = useShelf(); return null; }
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    await act(async () => { root.render(<Probe />); });
    await until(() => box.v !== null && !box.v.loading, "the first read");
    expect([box.v!.index, box.v!.loading, box.v!.locked, box.v!.broken, box.v!.error]).toEqual([null, false, false, false, false]);
    act(() => root.unmount()); roots.length = 0;
    h.api.mockImplementation(async (path: string, init: RequestInit = {}) => (/shelf_index/.test(path) && (init.method ?? "GET") === "GET" ? Promise.reject(new ApiError(500, "server")) : fakeApi(path, init)));
    const root2 = createRoot(document.createElement("div"));
    roots.push(root2);
    await act(async () => { root2.render(<Probe />); });
    await until(() => box.v!.error, "the failed read");
    expect([box.v!.index, box.v!.loading, box.v!.locked, box.v!.broken, box.v!.error]).toEqual([null, false, false, false, true]);
  });
});
