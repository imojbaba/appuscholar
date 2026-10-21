// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { bookmarkletHref, bookmarkletHrefV2, exportLibrary, LIBRARY_FILE_NAME, LIBRARY_IMPORT_MAX_BYTES, PSYCH_STARTERS, type CitationEntry } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";

/*
 * The library block's buttons after the cards (v1 940-946: Insert reference list, Load classic psychology sources, Export / Import, the class-sharing note), the quote block
 * (914-919) and the one-click capture's <details> (921-928), rendered in the Citation Manager. Expected values are v1's own: test/golden/citlib (citExport, citImport and the
 * size cap, captured from v1 running) and test/golden/citshare (psychLoadStarters, the empty export, the bookmarklet).
 */
type Lib = CitationEntry[];
type Blob = { value: Lib | null; loading: boolean; locked: boolean; broken?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  blob: null as unknown as Blob,
  toast: vi.fn(),
  editor: null as unknown,
  project: null as { id: string; contentLang?: string } | null,
  settings: {} as Record<string, unknown>,
  callAI: vi.fn(),
  download: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (...a: unknown[]) => a[0] !== "citations" ? { value: {}, loading: false, locked: false, set: () => {}, flush: async () => true } : h.blob
}));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => h.callAI }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: h.settings }) }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: h.project, documents: [], currentDoc: null, selectDoc: async () => true, go: () => {},
  // The shell's insert: into the test's editor; with none, the document did not open.
  requestInsert: async (run: (e: never) => void) => { const e = h.editor as { isDestroyed?: boolean } | null; if (!e || e.isDestroyed) return false; run(e as never); return true; } }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off", decryptBody: async () => "" }) }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { CitePanel } from "../components/tools/cite/CitePanel";
import { resetCiteForm } from "../lib/cite/form";
import { resetCiteStyle } from "../lib/cite/useLibrary";
import { IMPORT_TOO_LARGE, LIBRARY_EXPORTED, readFileText } from "../lib/cite/share";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const GOLDEN = join(__dirname, "../../../packages/core/test/golden");
const CITLIB = JSON.parse(readFileSync(join(GOLDEN, "citlib/cases.json"), "utf8")) as {
  lib: Lib; export: { text: string; download: string; toast: string };
  imports: Array<{ id: string; text: string; toast: string; libAfter: Lib }>;
  cap: { accepted: { size: number; toast: string }; refused: { size: number; toast: string } };
};
const SHARE = JSON.parse(readFileSync(join(GOLDEN, "citshare/cases.json"), "utf8")) as {
  starters: Array<{ id: string; lib: Lib; libAfter: Lib; toast: string }>; exportEmpty: string[]; bookmarklet: { href: string };
  quotes: Array<{ id: string; calls: Array<{ prompt: string; opts: Record<string, unknown> }>; block: string[]; toasts: string[] }>;
};

const roots: Root[] = [];
const editors: Editor[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<CitePanel />); });
}
async function click(testid: string) {
  const el = tid(testid)!;
  await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
}
function typeArea(id: string, value: string) {
  const el = $("#" + id) as HTMLTextAreaElement | HTMLSelectElement;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
/** Chooses a file in the hidden input, as the picker does, and waits for FileReader. */
async function choose(file: File) {
  const input = $("#citImportFile") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  for (let i = 0; i < 50 && h.toast.mock.calls.length === 0; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
/** The updater the last set() was handed, applied to `prev` (useLibrary writes the library as updates, ruling R12). */
const applied = (prev: Lib) => (h.blob.set.mock.calls.at(-1)![0] as (p: Lib | null) => Lib)(prev);

beforeEach(() => {
  h.blob = { value: [], loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) };
  h.toast.mockReset();
  h.download.mockReset();
  h.callAI.mockReset();
  h.editor = null;
  h.project = null;
  h.settings = {};
  resetCiteForm();
  resetCiteStyle();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the panel's order and copy (v1 914-947)", () => {
  it("quote block, then the capture <details>, then the library; after the cards: reference list, classics, export/import, the sharing note", () => {
    h.blob.value = CITLIB.lib.slice(0, 2);
    mount();
    const order = ["cite-quote", "cite-insertquote", "cite-bookmarklet-details", "cite-lib", "cite-insertbib", "cite-loadclassics", "cite-export", "cite-import", "cite-sharing-note"];
    const els = order.map((x) => tid(x)!);
    for (let i = 1; i < els.length; i++) expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, order[i]).toBeTruthy();
    expect($("label[for=citQuoteText]")!.textContent).toBe(E.cite_quote_label);
    expect(($("#citQuoteText") as HTMLTextAreaElement).placeholder).toBe(E.cite_quote_placeholder);
    expect(tid("cite-quote-desc")!.textContent).toBe(E.cite_quote_desc);
    expect(tid("cite-insertquote")!.textContent).toBe(E.cite_insertquote_btn);
    expect(tid("cite-insertbib")!.textContent).toBe(E.cite_insertbib_btn);
    expect(tid("cite-loadclassics")!.textContent).toBe(E.cite_loadclassics_btn);
    expect(tid("cite-export")!.textContent).toBe(E.cite_export_btn);
    expect(tid("cite-import")!.textContent).toBe(E.cite_import_btn);
    expect(tid("cite-sharing-note")!.innerHTML).toBe(E.cite_sharing_note);
    expect(($("#citImportFile") as HTMLInputElement).accept).toBe(".json,application/json");
    expect(tid("cite-bookmarklet-details")!.querySelector("summary")!.textContent).toBe(E.cite_bookmarklet_summary);
    expect(tid("cite-bookmarklet-desc")!.textContent).toBe(E.cite_bookmarklet_desc);
    expect(tid("cite-bookmarklet-note")!.textContent).toBe(E.cite_bookmarklet_note);
    // Fix wave A (W1): a bookmark dragged before keeps v1's capture code until it is dragged again.
    expect(tid("cite-bookmarklet-redrag")!.textContent).toBe("Dragged this button before? Drag it to your bookmarks bar again, so it also reads PubMed's authors and the volume, issue and pages.");
    expect(tid("cite-bookmarklet-note")!.nextElementSibling).toBe(tid("cite-bookmarklet-redrag"));
  });

  it("the bookmarklet is a draggable link carrying v1's javascript: href for this page, and a click does not follow it", () => {
    mount();
    const a = tid("cite-bookmarklet") as HTMLAnchorElement;
    expect(a.textContent).toBe(E.cite_bookmarklet_btn);
    expect(a.getAttribute("draggable")).toBe("true");
    expect(window.location.origin + window.location.pathname).toBe("http://localhost:3000/");
    // capture.test.ts holds bookmarkletHref to v1's href for http://localhost/; here it is wave A's (W1: every author, the volume, the issue and the pages), built for
    // this page, as v1 builds it for its own (13623).
    expect(a.getAttribute("href")).toBe(bookmarkletHrefV2("http://localhost:3000/"));
    expect(bookmarkletHref("http://localhost/")).toBe(SHARE.bookmarklet.href);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => { a.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
  });

  it("in a pop-out (/popout?tool=cite) the bookmarklet still opens the writing window's address, where the capture is read, not /popout", () => {
    window.history.replaceState(null, "", "/popout?tool=cite");
    try {
      mount();
      expect(tid("cite-bookmarklet")!.getAttribute("href")).toBe(bookmarkletHrefV2("http://localhost:3000/"));
    } finally { window.history.replaceState(null, "", "/"); }
  });

  it("Clear form empties the quote too (citClearForm 7475)", async () => {
    mount();
    typeArea("citQuoteText", "A quote.");
    await click("cite-clear");
    expect(($("#citQuoteText") as HTMLTextAreaElement).value).toBe("");
  });
});

describe("Insert reference list", () => {
  it("puts core's block into the open document once and toasts v1's sentence; enabled with no document open (an insert opens it, Task 11)", async () => {
    mount();
    expect((tid("cite-insertbib") as HTMLButtonElement).disabled).toBe(false);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    const e = new Editor({ extensions: editorExtensions, content: "<p>Mine.</p>" });
    editors.push(e);
    h.editor = e;
    h.blob.value = CITLIB.lib.slice(0, 3);
    mount();
    await click("cite-insertbib");
    expect(e.getHTML()).toContain('class="ref-head"');
    expect(e.getHTML().match(/class="ref-item"/g)).toHaveLength(3);
    expect(toasts()).toEqual([E.cite_bib_fmt]);
  });
});

describe("Export and import (citExport 7991-7998, citImport 7999-8023)", () => {
  it("export downloads psychology-class-library.json holding exportLibrary(lib), v1's file, and toasts v1's sentence", async () => {
    h.blob.value = CITLIB.lib;
    mount();
    await click("cite-export");
    expect(h.download).toHaveBeenCalledTimes(1);
    const [name, blob] = h.download.mock.calls[0]! as [string, globalThis.Blob];
    expect(name).toBe(LIBRARY_FILE_NAME);
    expect(name).toBe(CITLIB.export.download);
    expect(blob.type).toBe("application/json");
    const text = await readFileText(blob);
    expect(text).toBe(exportLibrary(CITLIB.lib));
    expect(text).toBe(CITLIB.export.text);
    expect(toasts()).toEqual([CITLIB.export.toast]);
    expect(LIBRARY_EXPORTED).toBe(CITLIB.export.toast);
  });
  it("an empty library exports nothing and toasts v1's sentence", async () => {
    mount();
    await click("cite-export");
    expect(h.download).not.toHaveBeenCalled();
    expect(toasts()).toEqual(SHARE.exportEmpty);
  });
  it("the Import button opens the hidden file input", async () => {
    mount();
    const input = $("#citImportFile") as HTMLInputElement;
    const picked = vi.spyOn(input, "click").mockImplementation(() => {});
    await click("cite-import");
    expect(picked).toHaveBeenCalledTimes(1);
  });
  for (const f of CITLIB.imports) {
    it(`import ${f.id}: merged through mergeLibrary as v1 merged it, with v1's toast`, async () => {
      h.blob.value = CITLIB.lib;
      mount();
      await choose(new File([f.text], "library.json", { type: "application/json" }));
      expect(toasts()).toEqual([f.toast]);
      if (f.toast.endsWith("merged into your library ✓")) expect(applied(CITLIB.lib)).toEqual(f.libAfter);
      else expect(h.blob.set).not.toHaveBeenCalled();
      expect(($("#citImportFile") as HTMLInputElement).value).toBe("");
    });
  }
  it("the size cap is v1's: the largest file it read is read, one byte more is refused with v1's toast", async () => {
    expect(LIBRARY_IMPORT_MAX_BYTES).toBe(CITLIB.cap.accepted.size);
    h.blob.value = CITLIB.lib;
    mount();
    await choose(new File(["[]" + " ".repeat(CITLIB.cap.accepted.size - 2)], "big.json"));
    expect(toasts()).toEqual([CITLIB.cap.accepted.toast]);
    h.toast.mockReset();
    h.blob.set.mockReset();
    await choose(new File(["[]" + " ".repeat(CITLIB.cap.refused.size - 2)], "bigger.json"));
    expect(toasts()).toEqual([CITLIB.cap.refused.toast]);
    expect(IMPORT_TOO_LARGE).toBe(CITLIB.cap.refused.toast);
    expect(h.blob.set).not.toHaveBeenCalled();
  });
});

describe("📖 Load classic psychology sources (psychLoadStarters 7983-7987)", () => {
  for (const s of SHARE.starters) {
    it(`${s.id}: v1's library afterwards and v1's toast`, async () => {
      h.blob.value = s.lib;
      mount();
      await click("cite-loadclassics");
      expect(applied(s.lib)).toEqual(s.libAfter);
      expect(toasts()).toEqual([s.toast]);
    });
  }
  it("the five sources are core's PSYCH_STARTERS, copied (never the shared objects)", async () => {
    mount();
    await click("cite-loadclassics");
    const out = applied([]);
    expect(out).toEqual(PSYCH_STARTERS);
    expect(out[0]).not.toBe(PSYCH_STARTERS[0]);
  });
});

describe("Insert quote", () => {
  it("English source, Hindi content language: one AI call with v1's prompt and options, the flagged span at the cursor, the textarea emptied", async () => {
    const e = new Editor({ extensions: editorExtensions, content: "<p>Mine.</p>" });
    editors.push(e);
    h.editor = e;
    h.project = { id: "p1", contentLang: "hi" };
    h.callAI.mockResolvedValue("  निरपेक्ष निर्णय का विस्तार सीमित है।\n");
    mount();
    typeArea("citQuoteText", "The span of absolute judgment is limited.");
    await click("cite-insertquote");
    const want = SHARE.quotes.find((q) => q.id === "en-hi")!;
    expect(h.callAI.mock.calls).toEqual(want.calls.map((c) => [c.prompt, c.opts]));
    expect(toasts()).toEqual(want.toasts);
    const span = new DOMParser().parseFromString(e.getHTML(), "text/html").querySelector("span.translated-quote")!;
    expect(span.getAttribute("title")).toBe("The span of absolute judgment is limited.");
    expect(span.textContent).toBe("“निरपेक्ष निर्णय का विस्तार सीमित है।” (अनुवादित)");
    expect(($("#citQuoteText") as HTMLTextAreaElement).value).toBe("");
  });
  it("with no project the content language is the default in Settings; English there inserts the quote as it is", async () => {
    const e = new Editor({ extensions: editorExtensions, content: "<p>Mine.</p>" });
    editors.push(e);
    h.editor = e;
    h.settings = { contentLang: "en" };
    mount();
    typeArea("citQuoteText", "  Memory is limited to about seven items.  ");
    await click("cite-insertquote");
    expect(h.callAI).not.toHaveBeenCalled();
    expect(e.getText()).toContain("“Memory is limited to about seven items.” ");
    expect(toasts()).toEqual(["Quote inserted ✓"]);
  });
  it("a Hindi source is quoted as written whatever the content language", async () => {
    const e = new Editor({ extensions: editorExtensions, content: "<p>Mine.</p>" });
    editors.push(e);
    h.editor = e;
    h.settings = { contentLang: "hi" };
    mount();
    typeArea("citSourceLang", "hi");
    typeArea("citQuoteText", "स्मृति की क्षमता सीमित है।");
    await click("cite-insertquote");
    expect(h.callAI).not.toHaveBeenCalled();
    expect(e.getText()).toContain("“स्मृति की क्षमता सीमित है।” ");
  });
  it("a translation whose document then does not open inserts nothing, leaves the box and shows no success", async () => {
    const e = new Editor({ extensions: editorExtensions, content: "<p>Mine.</p>" });
    h.editor = e;
    h.project = { id: "p1", contentLang: "hi" };
    let answer: (v: string) => void = () => {};
    h.callAI.mockImplementation(() => new Promise<string>((r) => { answer = r; }));
    mount();
    typeArea("citQuoteText", "The span of absolute judgment is limited.");
    await click("cite-insertquote");
    e.destroy(); // the document is gone by the time the AI answers, and none opens
    await act(async () => { answer("अनुवाद"); await new Promise((r) => setTimeout(r, 0)); });
    expect(toasts()).toEqual(["🔎 Translating quote…"]);
    expect(($("#citQuoteText") as HTMLTextAreaElement).value).toBe("The span of absolute judgment is limited.");
  });
  it("enabled with no document open: the insert opens it (Task 11)", () => {
    mount();
    expect((tid("cite-insertquote") as HTMLButtonElement).disabled).toBe(false);
  });
});
