// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AP_SAMPLE, apBuild } from "@appuscholar/core";
import en from "../messages/en.json";
import { withPanelFixes } from "../scripts/i18n-overrides.mjs";

/*
 * The reader (wave B Task 27, register row D-S2-131; canvas Read) and the intake of Analyse a paper that moved into it. The reader is mounted over the real shelf store, library and notes
 * on a fake blob api that keeps versions, as the server does (the Reading list's tests do the same). A kept paper opens by its id and keeps its notes under `p:<pid>`; a paper with no PDF
 * opens on the abstract Keep stored; the latest choice of a paper wins (W20); the tabs are in the pinned order and the open one is `?tab=`; the pasted text of v1's intake opens in the reader
 * from the Reading list's More with its notes under v1's id; the practice paper is the pid `sample`. The v1 intake cases (the pasted-text and file goldens of core's `appanel`, read from
 * packages/core/test/golden/appanel/cases.json) are here too, driven through the form that took over the upload field and the paste box.
 */

type SBlob = { projectId: string; kind: string; body: string; keyVersion: number; version: number };
const h = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), go: vi.fn(async (_href: string) => true), callAI: vi.fn(async (..._a: unknown[]) => "OK"), query: "",
  mammoth: vi.fn(async (_o: unknown) => ({ value: "" })), noMammoth: false
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(h.query), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/lit/reading/ka" }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
const vault = {
  status: "off", known: async () => "off", ensureUnlocked: async () => true,
  encryptBody: async (_d: unknown, s: string) => ({ bodyHtml: s, keyVersion: 0 }),
  decryptBody: async (d: { bodyHtml: string; keyVersion: number }) => { if (d.keyVersion > 0) throw new Error("corrupt"); return d.bodyHtml; }
};
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => vault }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1" }, projectId: "p1", go: h.go, openExport: vi.fn() }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" }, settings: { field: "education" } }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: vi.fn() }));
vi.mock("mammoth/mammoth.browser", () => ({ get default() { if (h.noMammoth) throw new Error("chunk failed"); return { extractRawText: h.mammoth }; } }));

import { ApiError } from "../lib/api";
import { tFormat } from "../lib/i18n";
import { fromFile, fromKept, fromPaste, isCurrentIntake, loadPaper, nextIntake } from "../lib/analyse/intake";
import { useApNotes } from "../lib/analyse/notes";
import { getAp, resetAp } from "../lib/analyse/useApDoc";
import { heldBlobs } from "../lib/blobs/held";
import type { ApNotes, ShelfIndex, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import { paperPageUrl, readerBy, readerHref, readerPageOf, readerTabOf, textKindOf } from "../lib/reader/load";
import { ReadingList } from "../components/literature/ReadingList";
import { Reader } from "../components/reader/Reader";
import { ReadCheck } from "../components/reader/PaperText";
import type { ShelfEntry } from "../lib/shelf/actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => tFormat(E, E, k, "en", v);

// ---------------------------------------------------------------- a fake blob api with versions

let server: { blobs: SBlob[]; calls: Array<{ path: string; method: string }>; gate: Map<string, Promise<void>> };
const wire = (b: SBlob) => ({ kind: b.kind, body: b.body, keyVersion: b.keyVersion, deks: [], updatedAt: "2026-10-19T00:00:00.000Z", version: b.version });
async function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  server.calls.push({ path, method });
  const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  if (!m) throw new ApiError(404, "not-found");
  const projectId = m[1]!, kind = decodeURIComponent(m[2]!);
  if (method === "GET") await server.gate.get(kind);
  const cur = server.blobs.find((b) => b.projectId === projectId && b.kind === kind);
  if (method === "GET") { if (!cur) throw new ApiError(404, "not-found"); return wire(cur); }
  if (method === "DELETE") { server.blobs = server.blobs.filter((b) => b !== cur); return null; }
  const ifMatch = (init.headers as Record<string, string> | undefined)?.["if-match"];
  if (ifMatch !== undefined && Number(ifMatch.replace(/"/g, "")) !== (cur?.version ?? 0)) throw new ApiError(409, "version-conflict");
  const body = JSON.parse(String(init.body)) as { body: string; keyVersion: number };
  const next: SBlob = { projectId, kind, body: body.body, keyVersion: body.keyVersion, version: (cur?.version ?? 0) + 1 };
  server.blobs = [...server.blobs.filter((b) => b !== cur), next];
  return wire(next);
}
const put = (kind: string, value: unknown) => server.blobs.push({ projectId: "p1", kind, body: JSON.stringify(value), keyVersion: 0, version: 1 });
const stored = <T,>(kind: string): T | null => { const b = server.blobs.find((x) => x.kind === kind); return b ? (JSON.parse(b.body) as T) : null; };
const puts = (kind: string) => server.calls.filter((c) => c.method === "PUT" && decodeURIComponent(c.path).endsWith("/blobs/" + kind));
const gets = (kind: string) => server.calls.filter((c) => c.method === "GET" && decodeURIComponent(c.path).endsWith("/blobs/" + kind));
/** Holds every read of a blob until `release()`. */
function hold(kind: string): () => void {
  let release!: () => void;
  server.gate.set(kind, new Promise<void>((r) => { release = r; }));
  return release;
}

// ---------------------------------------------------------------- the papers

const PAGES = [
  "Open-label placebos reduce test anxiety. " + "Students given placebo pills felt calmer before the test. ".repeat(10),
  "Method. " + "Fifty-eight students took part in a randomised trial over two weeks. ".repeat(10),
  "Results. " + "Test anxiety fell more in the placebo group than in the comparison group. ".repeat(10)
];
const ABSTRACT = "Test anxiety affects many students. We asked whether open-label placebo pills, given with an honest explanation, lower test anxiety in the two weeks before an exam. Fifty-eight students took part in a randomised trial and filled in questionnaires before and after. Anxiety was lower in the placebo group.";
const SCHAEFER: StoredEntry = {
  author: "Schaefer, C.; Denke, C.; Harke, H.", year: "2019", title: "Open-label placebos reduce test anxiety and improve self-management skills", source: "Scientific Reports",
  doi: "10.1038/s41598-019-49466-6", pid: "ka", rl: true, abstract: ABSTRACT
};
const PUTWAIN: StoredEntry = { author: "Putwain, D.", year: "2008", title: "Examination stress and test anxiety", pid: "kb", rl: true, abstract: ABSTRACT };
const BARE: StoredEntry = { author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences", pid: "kd", rl: true };
const shelfEntry = (id: string, over: Partial<ShelfEntry> = {}): ShelfEntry => ({ id, title: "T " + id, file: id + ".pdf", size: 10, added: "2026-01-01T00:00:00.000Z", total: 3, kept: 3, ...over });
const paperOf = (nHighlights = 0, pages = PAGES): ShelfPaper =>
  ({ pages, notes: Array.from({ length: nHighlights }, (_, i) => ({ id: "n" + i, page: 1, quote: "Students given placebo pills", note: "", at: "2026-01-01T00:00:00.000Z" })), cells: {} });
/** The corpus as the golden capture loaded it: a paper, with its text, its source kind and whether it is the sample. */
const CORE_TEST = join(__dirname, "../../../packages/core/test");

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
/** The reader over the Reading tab's one store of the project's notes, as LitPlace mounts it. */
function Harness({ pid }: { pid: string }) {
  const notes = useApNotes("p1");
  return <Reader pid={pid} notes={notes} />;
}
/** The Reading list and, under it, the same store of notes (the list's rows read what the reader writes). */
function ListHarness() {
  const notes = useApNotes("p1");
  return <ReadingList notes={notes} />;
}
async function mount(ui: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(ui); });
  await settle(20);
  return root;
}
const open = (pid: string, query = "") => { h.query = query; return mount(<Harness pid={pid} />); };
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function openListMore() {
  await act(async () => { tid("rl-list-more")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect($('[role="menu"]')).not.toBeNull();
}
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const SAMPLE_TITLE = AP_SAMPLE[0]!.split("\n")[0]!;

beforeEach(() => {
  server = { blobs: [], calls: [], gate: new Map() };
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset(); h.go.mockClear(); h.callAI.mockReset().mockResolvedValue("OK"); h.mammoth.mockReset(); h.noMammoth = false;
  h.query = "";
  heldBlobs.clear();
  resetAp();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** Kept papers: Schaefer with its PDF text (the reading-list paper `sa`), Putwain with only its abstract, Cohen with neither; `second` adds a fourth, Denke, with a PDF of its own (`sb`). */
const DENKE: StoredEntry = { author: "Denke, C.", year: "2020", title: "Honest placebos and the exam period in a second sample", pid: "kc", rl: true, abstract: ABSTRACT };
function seed(over: { highlights?: number; shelf?: Partial<ShelfEntry>; second?: boolean } = {}) {
  put("citations", over.second ? [SCHAEFER, PUTWAIN, BARE, DENKE] : [SCHAEFER, PUTWAIN, BARE]);
  put("shelf_index", [shelfEntry("sa", { title: SCHAEFER.title!, pid: "ka", doi: SCHAEFER.doi, ...over.shelf }), ...(over.second ? [shelfEntry("sb", { title: DENKE.title!, pid: "kc", added: "2026-02-01T00:00:00.000Z" })] : [])]);
  put("shelf_paper:sa", paperOf(over.highlights ?? 0));
  if (over.second) put("shelf_paper:sb", paperOf(0, PAGES.map((p) => "Second sample. " + p)));
}

describe("the reader opens a kept paper (wave B Task 27)", () => {
  it("the reader opens a kept paper by its id and keys its notes p:<pid>", async () => {
    seed();
    await open("ka", "tab=card");
    await until(() => !!tid("reader-title"), "the reader");
    expect(tid("reader-title")!.textContent).toBe(SCHAEFER.title);
    // The text is the PDF's, read once, and the paper's notes are the note Compare reads.
    expect(getAp().doc!.id).toBe("p:ka");
    expect(getAp().doc!.src).toBe("pdf");
    expect(getAp().doc!.pages).toEqual(PAGES);
    expect(getAp().doc!.abstractOnly).toBe(false);
    expect(tid("reader-text")!.textContent).toBe(PAGES[0]);
    // The line under the title (canvas Read): authors as the list names them, year, journal, the page, and the paper's own page.
    expect(tid("reader-by")!.textContent).toBe("Schaefer et al., 2019, Scientific Reports. Page 1 of 3. Open the paper's page");
    const link = tid("reader-open-page") as HTMLAnchorElement;
    expect([link.getAttribute("href"), link.target, link.rel]).toEqual(["https://doi.org/10.1038/s41598-019-49466-6", "_blank", "noopener noreferrer"]);
    // A card field is written to the paper's note under p:<pid>, not under v1's id.
    typeIn($("#apC_strengths") as HTMLTextAreaElement, "A clear, honest design.");
    await until(() => puts("ap_notes").length > 0, "the notes save");
    const notes = stored<ApNotes>("ap_notes")!;
    expect(Object.keys(notes)).toEqual(["p:ka"]);
    expect(notes["p:ka"]!.card.strengths).toBe("A clear, honest design.");
    expect(notes["p:ka"]!.title).toBe(SCHAEFER.title);
  });

  it("the paper's text is read once for the reader, apart from the store's own read of each paper of the list", async () => {
    seed();
    await open("ka");
    await until(() => !!tid("reader-title"), "the reader");
    // One read for the document the engines are sent (readPaperOnce) and one by the store's client that holds the paper's highlights.
    expect(gets("shelf_paper:sa")).toHaveLength(2);
  });

  it("a paper without a PDF opens on its abstract and says so", async () => {
    seed();
    await open("kb", "tab=walk");
    await until(() => !!tid("reader-title"), "the reader");
    expect(getAp().doc!.id).toBe("p:kb");
    expect(getAp().doc!.src).toBe("abstract");
    expect(getAp().doc!.abstractOnly).toBe(true);
    expect(getAp().doc!.pages[0]).toContain(ABSTRACT);
    // v1's head of the abstract (rsAnalyse 8411): title, authors and year, "Abstract", then the abstract.
    expect(getAp().doc!.pages[0]).toBe("Examination stress and test anxiety\nPutwain, D. (2008)\nAbstract\n" + ABSTRACT);
    expect(tid("reader-abstract-only")!.textContent).toBe("Only the abstract is here. Add your own PDF to read the whole paper.");
    expect(tid("reader-text")!.textContent).toContain(ABSTRACT);
    expect(tid("reader-prev")).toBeNull();
    // An abstract never shows the walk-through (apRender 11277), and the reference check needs a reference list.
    expect(tid("reader-walk-closed")!.textContent).toBe(E.reader_walk_needs_pdf);
    // Only the store's own read of the list's papers: nothing is read for the document the engines are sent.
    expect(gets("shelf_paper:sa")).toHaveLength(1);
  });

  it("a PDF paper does not say it is only the abstract", async () => {
    seed();
    await open("ka");
    await until(() => !!tid("reader-title"), "the reader");
    expect(tid("reader-abstract-only")).toBeNull();
  });

  it("a paper with neither a PDF nor an abstract says there is no text and offers the list", async () => {
    seed();
    await open("kd");
    await until(() => !!tid("reader-no-text"), "the message");
    expect(tid("reader-no-text")!.textContent).toBe("There is no text to read yet. Add your own PDF from the Reading list.");
    expect(tid("reader-title")!.textContent).toBe(BARE.title);
    expect(getAp().doc).toBeNull();
    expect(tid("reader-tabs")).toBeNull();
  });

  it("an unknown paper says it is not on the list, with a link to the list", async () => {
    seed();
    await open("nope");
    await until(() => !!tid("reader-missing"), "the message");
    expect(tid("reader-missing")!.textContent).toContain("This paper is not on your reading list.");
    const link = tid("reader-missing-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/p/p1/lit/reading");
    expect(getAp().doc).toBeNull();
  });

  it("a library entry that is not on the reading list is not on it for the reader either", async () => {
    put("citations", [{ ...SCHAEFER, rl: false }]);
    await open("ka");
    await until(() => !!tid("reader-missing"), "the message");
  });

  it("a paper whose text does not open says so and loads nothing", async () => {
    put("citations", [SCHAEFER]);
    put("shelf_index", [shelfEntry("sa", { title: SCHAEFER.title!, pid: "ka" })]);
    await open("ka");
    await until(() => !!tid("reader-unreadable"), "the message");
    expect(tid("reader-unreadable")!.textContent).toBe(SCHAEFER.title + " could not be read");
    expect(getAp().doc).toBeNull();
    expect(tid("reader-tabs")).toBeNull();
  });

  it("the page the address names is the page shown, and Previous and Next change it and the line under the title", async () => {
    seed();
    await open("ka", "page=2");
    await until(() => !!tid("reader-title"), "the reader");
    expect(tid("reader-text")!.textContent).toBe(PAGES[1]);
    expect(tid("reader-by")!.textContent).toContain("Page 2 of 3.");
    await click(tid("reader-next"));
    expect(tid("reader-text")!.textContent).toBe(PAGES[2]);
    expect(tid("reader-by")!.textContent).toContain("Page 3 of 3.");
    expect((tid("reader-next") as HTMLButtonElement).disabled).toBe(true);
    await click(tid("reader-prev"));
    await click(tid("reader-prev"));
    expect(tid("reader-text")!.textContent).toBe(PAGES[0]);
    expect((tid("reader-prev") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Europe PMC's text says where it came from, under the title (Task 21b)", async () => {
    seed({ shelf: { src: "epmc" } });
    await open("ka");
    await until(() => !!tid("reader-title"), "the reader");
    expect(tid("reader-epmc")!.textContent).toBe("Full text from Europe PMC (open access).");
    expect(textKindOf({ pid: "ka", entry: SCHAEFER, shelf: { ...shelfEntry("sa"), src: "epmc" }, note: null })).toBe("epmc");
  });

  it("a PDF the student added does not say Europe PMC", async () => {
    seed();
    await open("ka");
    await until(() => !!tid("reader-title"), "the reader");
    expect(tid("reader-epmc")).toBeNull();
  });
});

describe("choosing another paper while one loads (W20)", () => {
  it("fromKept: the later choice wins, and the earlier one loads nothing and says nothing", async () => {
    const lib = [SCHAEFER, PUTWAIN];
    const index: ShelfIndex = [shelfEntry("sa", { pid: "ka" })];
    let done!: (v: { pages: string[] }) => void;
    const slow = fromKept(nextIntake(), "ka", { toast: h.toast, t, lib, index, read: () => new Promise((r) => { done = r; }) });
    const later = await fromKept(nextIntake(), "kb", { toast: h.toast, t, lib, index, read: async () => null });
    expect(later).toBe(true);
    done({ pages: PAGES });
    expect(await slow).toBe(false);
    expect(getAp().doc!.id).toBe("p:kb");
    expect(toasts()).toEqual([]);
  });

  it("fromKept: a read that fails for an earlier choice is not reported once another was made", async () => {
    const lib = [SCHAEFER];
    const index: ShelfIndex = [shelfEntry("sa", { pid: "ka" })];
    const slow = fromKept(nextIntake(), "ka", { toast: h.toast, t, lib, index, read: async () => null });
    const ticket = nextIntake();
    expect(await slow).toBe(false);
    expect(isCurrentIntake(ticket)).toBe(true);
    expect(toasts()).toEqual([]);
  });

  it("fromKept: a paper that is not on the list, or has nothing to read, loads nothing; a PDF whose text cannot be read is not replaced by its abstract", async () => {
    const lib = [SCHAEFER, BARE];
    const index: ShelfIndex = [shelfEntry("sa", { pid: "ka" })];
    const d = { toast: h.toast, t, lib, index, read: async () => null };
    expect(await fromKept(nextIntake(), "zz", d)).toBe(false);
    expect(await fromKept(nextIntake(), "kd", d)).toBe(false);
    expect(await fromKept(nextIntake(), "ka", d)).toBe(false);
    expect(getAp().doc).toBeNull();
    expect(toasts()).toEqual([]);
  });

  it("the reader: opening another paper while the first is being read shows the later one", async () => {
    seed({ second: true });
    const release = hold("shelf_paper:sa");
    h.query = "";
    const root = await mount(<Harness pid="ka" />);
    await settle(30);
    expect(getAp().doc).toBeNull();
    await act(async () => { root.render(<Harness pid="kc" />); });
    await until(() => getAp().doc?.id === "p:kc", "the later paper");
    release();
    await settle(60);
    expect(getAp().doc!.id).toBe("p:kc");
    expect(tid("reader-title")!.textContent).toBe(DENKE.title);
    expect(getAp().doc!.pages[0]).toContain("Second sample.");
  });
});

describe("the tabs", () => {
  it("are in the pinned order, with the number of highlights, and Your take first is open first", async () => {
    seed({ highlights: 2 });
    await open("ka");
    await until(() => !!tid("reader-tabs"), "the tabs");
    const bar = tid("reader-tabs")!;
    expect(bar.getAttribute("role")).toBe("tablist");
    const tabs = Array.from(bar.querySelectorAll<HTMLAnchorElement>('[role="tab"]'));
    expect(tabs.map((x) => x.textContent)).toEqual(["Your take first", "Ask", "Check numbers", "Walk-through", "Card", "Highlights (2)"]);
    expect(tabs.map((x) => x.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false", "false", "false"]);
    // The open one is in the address: the first has none, the others `?tab=`.
    expect(tabs.map((x) => x.getAttribute("href"))).toEqual([
      "/p/p1/lit/reading/ka", "/p/p1/lit/reading/ka?tab=ask", "/p/p1/lit/reading/ka?tab=numbers", "/p/p1/lit/reading/ka?tab=walk", "/p/p1/lit/reading/ka?tab=card", "/p/p1/lit/reading/ka?tab=highlights"
    ]);
    expect(tid("reader-panel")!.getAttribute("role")).toBe("tabpanel");
    expect(tid("reader-panel")!.getAttribute("aria-labelledby")).toBe("rd-tab-take");
    expect(tid("reader-take")).not.toBeNull();
  });

  it("the tab named by ?tab= is the open one; one that is not a tab is Your take first", async () => {
    seed();
    const names: Record<string, string> = { ask: "ap-ask", numbers: "reader-numbers", walk: "ap-box", card: "ap-card", highlights: "reader-highlights" };
    for (const [tab, marker] of Object.entries(names)) {
      await open("ka", "tab=" + tab);
      await until(() => !!tid("reader-tabs"), "the tabs");
      expect(tid("reader-tab-" + tab)!.getAttribute("aria-selected")).toBe("true");
      expect(tid("reader-tab-take")!.getAttribute("aria-selected")).toBe("false");
      expect(tid("reader-panel")!.getAttribute("aria-labelledby")).toBe("rd-tab-" + tab);
      if (marker !== "ap-box") expect(tid(marker), tab).not.toBeNull();
      act(() => { for (const r of roots.splice(0)) r.unmount(); });
      document.body.innerHTML = "";
    }
    await open("ka", "tab=nonsense");
    await until(() => !!tid("reader-tabs"), "the tabs");
    expect(tid("reader-tab-take")!.getAttribute("aria-selected")).toBe("true");
    expect([readerTabOf(null), readerTabOf("card"), readerTabOf("nope")]).toEqual(["take", "card", "take"]);
  });

  it("the address of a paper, its tab and its page", () => {
    expect(readerHref("p1", "ka")).toBe("/p/p1/lit/reading/ka");
    expect(readerHref("p1", "ka", { tab: "take" })).toBe("/p/p1/lit/reading/ka");
    expect(readerHref("p1", "ka", { tab: "walk", page: 3 })).toBe("/p/p1/lit/reading/ka?tab=walk&page=3");
    expect(readerHref("p1", "ka", { page: 1 })).toBe("/p/p1/lit/reading/ka");
  });

  it("Highlights ({n}) counts what the student saved, not the lines kept before an AI summary", async () => {
    put("citations", [SCHAEFER]);
    put("shelf_index", [shelfEntry("sa", { pid: "ka" })]);
    put("shelf_paper:sa", { ...paperOf(1), notes: [...paperOf(1).notes, { id: "s1", page: 0, quote: "", note: "My own summary before the AI: x", at: "2026-01-01T00:00:00.000Z" }] });
    await open("ka");
    await until(() => !!tid("reader-tabs"), "the tabs");
    expect(tid("reader-tab-highlights")!.textContent).toBe("Highlights (1)");
  });

  it("a paper with no PDF has no highlights to keep, and says how to get some; Your take first is open to it all the same (Task 28)", async () => {
    seed();
    await open("kb", "tab=highlights");
    await until(() => !!tid("reader-tabs"), "the tabs");
    expect(tid("reader-highlights-none")!.textContent).toBe("Add your own PDF to keep highlights.");
    expect(tid("reader-tab-highlights")!.textContent).toBe("Highlights (0)");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    await open("kb", "");
    await until(() => !!tid("take-box"), "the box");
    expect(tid("reader-take")!.querySelector("label")!.textContent).toBe("In two lines, what does this paper say?");
  });
});

describe("what the tabs keep from today's Analyse a paper", () => {
  it("Highlights saves the selected passage on the paper's blob, marks it on the page, and counts it", async () => {
    seed();
    await open("ka", "tab=highlights");
    await until(() => !!tid("reader-highlights"), "the tab");
    const node = tid("reader-text")!.querySelector("span")!.firstChild as Text;
    const at = node.data.indexOf("placebo pills");
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + "placebo pills".length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    typeIn(tid("sh-note") as HTMLTextAreaElement, "  the pills  ");
    await click(tid("sh-save-hl"));
    expect(h.toast).toHaveBeenCalledWith("Highlight saved");
    await until(() => puts("shelf_paper:sa").length > 0, "the paper's save");
    expect(stored<ShelfPaper>("shelf_paper:sa")!.notes).toEqual([expect.objectContaining({ page: 1, quote: "placebo pills", note: "the pills" })]);
    expect(Array.from(tid("reader-text")!.querySelectorAll("mark")).map((m) => m.textContent)).toEqual(["placebo pills"]);
    expect(tid("reader-tab-highlights")!.textContent).toBe("Highlights (1)");
    // A selection outside the paper's text is "Select some text on the page first".
    window.getSelection()!.removeAllRanges();
    await click(tid("sh-save-hl"));
    expect(h.toast).toHaveBeenLastCalledWith("Select some text on the page first");
    // Go to page and Delete.
    await click(tid("reader-next"));
    await click(tid("sh-hl-go"));
    expect(tid("reader-text")!.textContent).toBe(PAGES[0]);
    await click(tid("sh-hl-del"));
    await until(() => stored<ShelfPaper>("shelf_paper:sa")!.notes.length === 0, "the highlight deleted");
  });

  it("Check numbers has the numbers check and, for a full paper, the reference check; an abstract has no reference list to check", async () => {
    seed();
    await open("ka", "tab=numbers");
    await until(() => !!tid("reader-numbers"), "the tab");
    expect(tid("ap-num-btn")!.textContent).toBe(E.ap2_num_btn);
    expect(tid("ap-ref-btn")).not.toBeNull();
    expect(tid("ap-numbers")).toBeNull();
    await click(tid("ap-num-btn"));
    expect(tid("ap-numbers")).not.toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    await open("kb", "tab=numbers");
    await until(() => !!tid("reader-numbers"), "the tab");
    expect(tid("ap-ref-btn")).toBeNull();
    expect(tid("ap-num-btn")).not.toBeNull();
  });

  it("Ask and the walk-through ask for the box about the paper, as v1 did; the card does not", async () => {
    seed();
    await open("ka", "tab=ask");
    await until(() => !!tid("ap-ask"), "the tab");
    expect(tid("ap-consent")!.textContent).toBe(E.ap2_consent);
    expect(tid("ap-num-btn")).toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    await open("ka", "tab=walk");
    await until(() => !!tid("ap-consent"), "the walk-through");
    expect(tid("ap-consent")).not.toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    await open("ka", "tab=card");
    await until(() => !!tid("ap-card"), "the card");
    expect(tid("ap-consent")).toBeNull();
  });

  it("every answer names its paper (ap_about)", async () => {
    seed();
    await open("ka", "tab=ask");
    await until(() => !!tid("ap-ask"), "the tab");
    act(() => { (document.querySelector("#apOK") as HTMLInputElement).click(); });
    h.callAI.mockResolvedValue('{"in_paper":true,"answer":"Fifty-eight students.","quotes":[]}');
    typeIn($("#apQ") as HTMLTextAreaElement, "Who took part in the study?");
    await click(tid("ap-ask-btn"));
    await until(() => !!tid("ap-answer"), "the answer");
    expect(tid("ap-about")!.textContent).toBe("About: " + SCHAEFER.title);
  });
});

describe("Read pasted text, from the Reading list's More (v1's paste intake)", () => {
  const PASTED = "Peer tutoring and statistics anxiety\n" + "Students who met a peer tutor every week reported less worry about statistics than students who did not. ".repeat(8);

  it("Read pasted text opens the reader on the text and keeps its notes under v1's id", async () => {
    seed();
    await mount(<ListHarness />);
    await until(() => tids("rl-row").length === 3, "the rows");
    await openListMore();
    expect($$('[role="menuitem"]').map((x) => x.textContent)).toEqual(["Read pasted text"]);
    await click(tid("rl-item-paste"));
    expect(tid("rl-paste")).not.toBeNull();
    typeIn(tid("ap-paste") as HTMLTextAreaElement, PASTED);
    await click(tid("ap-paste-btn"));
    expect(h.go).toHaveBeenCalledWith("/p/p1/lit/reading/pasted");
    const id = apBuild("Peer tutoring and statistics anxiety", [PASTED.trim()], "paste").id;
    expect(getAp().doc!.id).toBe(id);
    expect(id.startsWith("a")).toBe(true);
    // It is not on the list: still three papers.
    expect(tids("rl-row")).toHaveLength(3);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    // The reader on it: its title, its text, a card field written under v1's id.
    await open("pasted", "tab=card");
    await until(() => !!tid("reader-title"), "the reader");
    expect(tid("reader-title")!.textContent).toBe("Peer tutoring and statistics anxiety");
    expect(tid("reader-by")!.textContent).toBe("Pasted text. It is not on your reading list.");
    expect(tid("reader-abstract-only")).toBeNull();
    typeIn($("#apC_notes") as HTMLTextAreaElement, "Read it twice.");
    await until(() => puts("ap_notes").length > 0, "the notes save");
    expect(Object.keys(stored<ApNotes>("ap_notes")!)).toEqual([id]);
    expect(stored<ApNotes>("ap_notes")![id]!.card.notes).toBe("Read it twice.");
  });

  it("nothing is read from a pasted box that is empty: v1's sentence, and the reader is not opened", async () => {
    seed();
    await mount(<ListHarness />);
    await until(() => tids("rl-row").length === 3, "the rows");
    await openListMore();
    await click(tid("rl-item-paste"));
    await click(tid("ap-paste-btn"));
    expect(toasts()).toEqual(["Paste the paper text first"]);
    expect(h.go).not.toHaveBeenCalled();
  });

  it("the pasted text is gone after a reload: the reader says so and links to the list", async () => {
    seed();
    await open("pasted");
    await until(() => !!tid("reader-pasted-gone"), "the message");
    expect(tid("reader-pasted-gone")!.textContent).toContain("That pasted text is not here any more.");
    expect((tid("reader-missing-link") as HTMLAnchorElement).getAttribute("href")).toBe("/p/p1/lit/reading");
  });

  it("the practice paper and a kept paper are not the pasted text", async () => {
    seed();
    await open("ka");
    await until(() => !!tid("reader-title"), "the reader");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    await open("pasted");
    await until(() => !!tid("reader-pasted-gone"), "the message");
  });
});

describe("the practice paper is the pid sample", () => {
  it("opens v1's fictional paper with no tick, its notes under v1's id", async () => {
    await open("sample", "tab=card");
    await until(() => !!tid("reader-title"), "the reader");
    expect(tid("reader-title")!.textContent).toBe(SAMPLE_TITLE);
    expect(getAp().doc!.sample).toBe(true);
    expect(getAp().doc!.id).toBe(apBuild(SAMPLE_TITLE, [...AP_SAMPLE], "pdf").id);
    expect(tid("reader-by")!.textContent).toBe("Made up for practice. Not a real study. Page 1 of 3.");
    expect(tid("reader-open-page")).toBeNull();
    expect(toasts()).toEqual([]);
    typeIn($("#apC_verdict") as HTMLTextAreaElement, "Fictional, so it proves nothing.");
    await until(() => puts("ap_notes").length > 0, "the notes save");
    expect(Object.keys(stored<ApNotes>("ap_notes")!).every((k) => !k.startsWith("p:"))).toBe(true);
  });

  it("the Reading list's practice row opens it in the reader", async () => {
    await mount(<ListHarness />);
    await click(tid("rl-practice-btn"));
    expect(h.go).toHaveBeenCalledWith("/p/p1/lit/reading/sample");
    expect(tid("rl-practice-loaded")).toBeNull();
  });
});

describe("the line under the title and the paper's own page (pure)", () => {
  const paper = (entry: StoredEntry | null, shelf: Record<string, unknown> | null = null) => ({ pid: "k", entry, shelf: shelf ? { ...shelfEntry("s"), ...shelf } : null, note: null });
  it("authors as the list names them, then the year and the journal, each left out when the paper lacks it", () => {
    expect(readerBy(paper(SCHAEFER), t)).toBe("Schaefer et al., 2019, Scientific Reports.");
    expect(readerBy(paper({ author: "Putwain, D.", year: "2008", title: "x" }), t)).toBe("Putwain, 2008.");
    expect(readerBy(paper({ author: "Cohen, J.; Cohen, P.", year: "", title: "x", container: "A book" }), t)).toBe("Cohen and Cohen, A book.");
    expect(readerBy(paper({ title: "x", source: "Journal of X" }), t)).toBe("Journal of X.");
    expect(readerBy(paper(null), t)).toBe("");
  });
  it("the paper's page is its DOI's address (the DOI as the list stores it, lower case, any prefix removed), else its web address, else nothing", () => {
    expect(paperPageUrl(paper(SCHAEFER))).toBe("https://doi.org/10.1038/s41598-019-49466-6");
    expect(paperPageUrl(paper({ title: "x", doi: "https://doi.org/10.1000/ABC(1)<2>" }))).toBe("https://doi.org/10.1000/abc(1)%3C2%3E");
    expect(paperPageUrl(paper(null, { doi: "10.1000/from-pdf" }))).toBe("https://doi.org/10.1000/from-pdf");
    expect(paperPageUrl(paper({ title: "x", url: "https://example.org/paper" }))).toBe("https://example.org/paper");
    expect(paperPageUrl(paper({ title: "x", url: "javascript:alert(1)" }))).toBe("");
    expect(paperPageUrl(paper({ title: "x" }))).toBe("");
  });
  it("?page= is a whole number from 1, anything else the first page", () => {
    expect([readerPageOf("3"), readerPageOf("0"), readerPageOf("-2"), readerPageOf("2.5"), readerPageOf("two"), readerPageOf(null), readerPageOf("")]).toEqual([3, 1, 1, 1, 1, 1, 1]);
  });
  it("the kinds of text a paper can have", () => {
    expect(textKindOf(paper(SCHAEFER))).toBe("abstract");
    expect(textKindOf(paper({ ...SCHAEFER, abstract: "Too short." }))).toBe("none");
    expect(textKindOf(paper(BARE))).toBe("none");
    expect(textKindOf(paper(BARE, {}))).toBe("pdf");
    expect(textKindOf(paper(BARE, { src: "epmc" }))).toBe("epmc");
  });
});

describe("the Reading list opens the reader", () => {
  it("Read on a row opens that paper; a paper with only its abstract can be read too, one with nothing cannot", async () => {
    seed();
    await mount(<ListHarness />);
    await until(() => tids("rl-row").length === 3 && !(tids("rl-read")[0] as HTMLButtonElement | undefined)?.disabled, "the rows");
    const rows = tids("rl-row");
    const readOf = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('[data-testid="rl-read"]');
    expect(readOf(rows[0]!)!.disabled).toBe(false);
    expect(readOf(rows[1]!)!.disabled).toBe(false);
    expect(readOf(rows[2]!)).toBeNull();
    await click(readOf(rows[0]!));
    expect(h.go).toHaveBeenLastCalledWith("/p/p1/lit/reading/ka");
    await click(readOf(rows[1]!));
    expect(h.go).toHaveBeenLastCalledWith("/p/p1/lit/reading/kb");
  });

  it("a paper on the list with no id yet cannot be addressed: Read says so and opens nothing", async () => {
    put("citations", []);
    put("shelf_index", [shelfEntry("sa", { title: "A loose PDF" })]);
    put("shelf_paper:sa", paperOf());
    await mount(<ListHarness />);
    await until(() => tids("rl-row").length === 1 && !(tid("rl-read") as HTMLButtonElement).disabled, "the row");
    await click(tid("rl-read"));
    expect(h.go).not.toHaveBeenCalled();
    expect(toasts()).toEqual(["This paper is not ready to open yet. Try again in a moment."]);
  });

  it("a Search hit opens the reader at its page", async () => {
    seed();
    await mount(<ListHarness />);
    await until(() => tids("rl-row").length === 3 && !(tids("rl-read")[0] as HTMLButtonElement).disabled, "the rows");
    const d = tid("rl-tools") as HTMLDetailsElement;
    await act(async () => { d.open = true; d.dispatchEvent(new Event("toggle")); });
    typeIn(tid("sh-q") as HTMLInputElement, "randomised trial");
    await click(tid("sh-search-run"));
    await until(() => tids("sh-result").length > 0, "a hit");
    await click(tid("sh-open-page"));
    expect(h.go).toHaveBeenLastCalledWith("/p/p1/lit/reading/ka?page=2");
  });
});

describe("what was read (v1's check of what Appuscholer read)", () => {
  const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/appanel/cases.json"), "utf8")) as { heads: Array<{ id: string; text: string; pre: string }> };
  type Paper = { id: string; src: string; title?: string; pages?: string[]; from?: "AP_SAMPLE" };
  const CORPUS = JSON.parse(readFileSync(join(CORE_TEST, "golden/analyse/papers.json"), "utf8")) as Paper[];
  function paperOf2(id: string): { title: string; pages: string[]; src: string; sample: boolean } {
    if (id === "sample@apSample") return { title: SAMPLE_TITLE, pages: [...AP_SAMPLE], src: "pdf", sample: true };
    if (id === "sample-x3") return { title: SAMPLE_TITLE + " (three times)", pages: [...AP_SAMPLE, ...AP_SAMPLE, ...AP_SAMPLE], src: "pdf", sample: false };
    const p = CORPUS.find((x) => x.id === id)!;
    return p.from === "AP_SAMPLE" ? { title: SAMPLE_TITLE, pages: [...AP_SAMPLE], src: p.src, sample: false } : { title: p.title!, pages: p.pages!, src: p.src, sample: false };
  }

  it.each(FX.heads.map((x) => [x.id, x] as const))("%s: the pages and characters read, the sections found and the text the AI is sent are v1's", async (id, c) => {
    const p = paperOf2(id);
    loadPaper(p.title, p.pages, p.src, p.sample, { toast: h.toast, t });
    await mount(<ReadCheck d={getAp().doc!} />);
    // v1's head is the title, then (an abstract) its warning, then this; the reader says those two in its header.
    const v1 = withPanelFixes(c.text);
    const rest = v1.slice(p.title.length).replace(withPanelFixes(E.ap2_abstract_only_shallow_an!), "");
    expect(tid("ap-read")!.textContent).toBe(rest);
    expect(tid("ap-preview")!.textContent).toBe(c.pre);
  });
});

describe("the intake that moved in (v1 9882-9932): a pasted text and a file", () => {
  type Doc = { title: string; src: string; pages: string[]; sample: boolean; abstractOnly: boolean } | null;
  type Fx = {
    files: Array<{ id: string; name: string; input: { pages?: string[]; text?: string }; toasts: string[]; doc: Doc }>;
    pastes: Array<{ id: string; text: string; toasts: string[]; doc: Doc }>;
  };
  const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/appanel/cases.json"), "utf8")) as Fx;
  const docRecord = (): Doc => { const d = getAp().doc; return d ? { title: d.title, src: d.src, pages: [...d.pages], sample: d.sample, abstractOnly: d.abstractOnly } : null; };

  async function openPaste() {
    await mount(<ListHarness />);
    await openListMore();
    await click(tid("rl-item-paste"));
  }

  it.each(FX.pastes.map((p) => [p.id, p] as const))("pasted text, %s: v1's toasts and AP.doc, and the reader opens only when it loaded", async (_id, c) => {
    await openPaste();
    typeIn(tid("ap-paste") as HTMLTextAreaElement, c.text);
    await click(tid("ap-paste-btn"));
    expect(toasts()).toEqual(c.toasts);
    expect(docRecord()).toEqual(c.doc);
    expect(h.go.mock.calls.length).toBe(c.doc ? 1 : 0);
  });

  it.each(FX.files.filter((f) => /\.(docx|txt)$/i.test(f.name)).map((f) => [f.id, f] as const))("a Word or text file, %s: v1's toasts and AP.doc", async (_id, c) => {
    const text = c.input.text ?? "";
    if (c.id === "docx-no-reader") h.noMammoth = true;
    h.mammoth.mockResolvedValue({ value: text });
    await openPaste();
    const input = tid("ap-file") as HTMLInputElement;
    expect(input.accept).toBe(".docx,.txt");
    Object.defineProperty(input, "files", { value: [new File([text], c.name)], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(toasts()).toEqual(c.toasts);
    expect(docRecord()).toEqual(c.doc);
    expect(input.value).toBe("");
    expect(h.go.mock.calls.length).toBe(c.doc ? 1 : 0);
  });

  it.each(FX.files.filter((f) => !/\.(docx|txt)$/i.test(f.name)).map((f) => [f.id, f] as const))("fromFile, %s (a PDF or another kind): v1's toasts and AP.doc", async (_id, c) => {
    const pages = c.input.pages;
    const extractPdf = c.id === "pdf-error" ? async () => { throw new Error("Invalid PDF structure."); } : async () => (pages ? { pages, total: pages.length } : ("no-text" as const));
    const ok = await fromFile(nextIntake(), new File([""], c.name), { toast: h.toast, t, extractPdf: extractPdf as never });
    expect(toasts()).toEqual(c.toasts);
    expect(docRecord()).toEqual(c.doc);
    expect(ok).toBe(!!c.doc);
  });

  it("a paste chosen while a kept paper is still being read wins (W20)", async () => {
    seed();
    const release = hold("shelf_paper:sa");
    h.query = "";
    const root = await mount(<Harness pid="ka" />);
    await settle(20);
    expect(getAp().doc).toBeNull();
    expect(fromPaste(nextIntake(), "My pasted paper on reading\n" + "pasted words ".repeat(60), { toast: h.toast, t })).toBe(true);
    release();
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(getAp().doc!.title).toBe("My pasted paper on reading");
    act(() => { root.unmount(); });
    roots.splice(roots.indexOf(root), 1);
  });
});

describe("the reader: the layout rules (375 px wide, tokens only)", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const start = css.indexOf("/* The reader (wave B Task 27");
  const end = css.indexOf("/* end reader */");
  const block = css.slice(start, end);
  const rules = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]!.trim(), at: m.index ?? 0 }));
  const phoneAt = block.indexOf("@media (max-width: 700px)");

  it("the tabs scroll sideways inside their own bar on a phone, and the page does not; the text and the tools stack and fit", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(phoneAt).toBeGreaterThan(-1);
    const phone = rules.filter((r) => r.at > phoneAt);
    const bar = phone.find((r) => r.sel === ".rd-tabs")!.body;
    expect(bar).toMatch(/flex-wrap:\s*nowrap/);
    expect(bar).toMatch(/overflow-x:\s*auto/);
    // A tab keeps its size in the bar (it is the bar that scrolls); the columns can shrink below their content (no sideways page scroll) and the text breaks inside long words.
    expect(rules.find((r) => r.sel === ".rd-tabs a" && r.at < phoneAt)?.body).toMatch(/flex:\s*none/);
    expect(rules.find((r) => r.sel === ".rd-main" && r.at < phoneAt)?.body).toMatch(/min-width:\s*0/);
    expect(rules.find((r) => r.sel === ".rd-side" && r.at < phoneAt)?.body).toMatch(/min-width:\s*0/);
    expect(rules.find((r) => r.sel === ".rd-page" && r.at < phoneAt)?.body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(phone.find((r) => r.sel === ".rd-main")?.body).toMatch(/flex-basis:\s*100%/);
    expect(phone.find((r) => r.sel === ".rd-side")?.body).toMatch(/flex-basis:\s*100%/);
  });

  it("every control is at least 44 px high: the tabs, Previous and Next, the way back and the link to the paper's page", () => {
    for (const sel of [".rd-tabs a", ".rd-btn", ".rd-back", ".rd-by a", ".rd-away a"]) expect(rules.find((r) => r.sel === sel)?.body, sel).toMatch(/min-height:\s*44px/);
  });

  it("uses colour tokens only: no hex or rgb colour", () => {
    expect(rules.length).toBeGreaterThan(15);
    for (const r of rules) expect(r.body, r.sel).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});
