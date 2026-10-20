// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { citFmt, crToEntry, sanitizeHtml, type CitationEntry } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";

type Lib = CitationEntry[];
type Blob = { value: Lib | null; loading: boolean; locked: boolean; broken?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  blob: null as unknown as Blob,
  blobArgs: [] as unknown[],
  project: null as { id: string } | null,
  toast: vi.fn(),
  editor: null as unknown,
  me: null as { id: string; scratchProjectId: string } | null
}));
// The library is the `citations` blob; the check caches (Task 8a) are read through the same hook and are empty here.
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (...a: unknown[]) => {
    if (a[0] !== "citations") return { value: {}, loading: false, locked: false, set: () => {}, flush: async () => true };
    h.blobArgs = a;
    return h.blob;
  }
}));
// The quote box calls the AI through useCallAI (Task 8b); these tests make no call.
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => async () => "" }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: {} }) }));
vi.mock("@/components/workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ project: h.project, documents: [], currentDoc: null, selectDoc: async () => true, showTool: () => {} }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off", decryptBody: async () => "" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { CitePanel } from "../components/tools/cite/CitePanel";
import { filledForm, EMPTY_CITE_FORM, resetCiteForm } from "../lib/cite/form";
import { resetCiteStyle } from "../lib/cite/useLibrary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
/** The Crossref and eutils responses Task 4 recorded live (packages/core/test/fetch/recorded), served by URL. */
const REC_DIR = join(__dirname, "../../../packages/core/test/fetch/recorded");
type Rec = { url: string; status: number; headers: Record<string, string>; body: string };
const RECS = new Map<string, Rec>(readdirSync(REC_DIR).filter((f) => f.endsWith(".json") && f !== "v2-manifest.json").map((f) => {
  const r = JSON.parse(readFileSync(join(REC_DIR, f), "utf8")) as Rec;
  return [r.url, r];
}));
const rec = (url: string) => RECS.get(url)!;
const work = (url: string) => (JSON.parse(rec(url).body) as { message: Parameters<typeof crToEntry>[0] }).message;
const DOI_JOURNAL = "https://api.crossref.org/works/10.1037%2F0003-066x.55.1.68";
const DOI_CHAPTER = "https://api.crossref.org/works/10.1093%2Foso%2F9780199974467.003.0001";
const DOI_MISSING = "https://api.crossref.org/works/10.9999%2Fappuscholar-no-such-doi-2026";
const PMID_SUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=9500320";
const DOI_LANCET = "https://api.crossref.org/works/10.1016%2Fs0140-6736(97)11096-0";
const TITLE_Q = "Self-determination theory and the facilitation of intrinsic motivation";
const TITLE_URL = "https://api.crossref.org/works?rows=1&query.bibliographic=" + encodeURIComponent(TITLE_Q);
let requested: string[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  requested.push(url);
  const r = RECS.get(url);
  if (!r) throw new TypeError("Failed to fetch");
  return new Response(r.body, { status: r.status, headers: r.headers["content-type"] ? { "content-type": r.headers["content-type"] } : {} });
});

const BANDURA: CitationEntry = { type: "Book", author: "Bandura, Albert", year: "1977", title: "Social learning theory", source: "Prentice Hall" };
const MILLER: CitationEntry = { type: "Journal article", author: "Miller, George A.; Smith, Jane B.; Lee, Kim", year: "2020", title: "The magical number seven", source: "Psychological Review", volume: "63", issue: "2", pages: "81-97", doi: "10.1037/h0043158" };

const roots: Root[] = [];
const editors: Editor[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const field = (id: string) => $("#" + id) as HTMLInputElement | HTMLSelectElement;
function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<CitePanel />); });
  return root;
}
function type(id: string, value: string) {
  const el = field(id);
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
async function click(testid: string) {
  const el = tid(testid)!;
  await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
}
/** Lets the lookup's requests and the 60 ms paste timer run. */
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const shown = (testid: string) => !(tid(testid) as HTMLElement).hidden;

beforeEach(() => {
  h.blob = { value: [], loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) };
  h.blobArgs = [];
  h.project = null;
  h.editor = null;
  h.me = { id: "u1", scratchProjectId: "scratch-1" };
  h.toast.mockReset();
  requested = [];
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  resetCiteForm();
  resetCiteStyle();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Citation Manager: the form (v1 874-912)", () => {
  it("the library is the citations blob of the scratch project, or of the open project", () => {
    mount();
    expect(h.blobArgs).toEqual(["citations", "scratch-1"]);
    h.project = { id: "p-9" };
    mount();
    expect(h.blobArgs).toEqual(["citations", "p-9"]);
  });

  it("the style select offers v1's eight styles in v1's order and labels (877)", () => {
    mount();
    const opts = [...(field("citStyle") as HTMLSelectElement).options].map((o) => [o.value, o.textContent]);
    expect(opts).toEqual([["apa", "APA 7th"], ["apa6", "APA 6th"], ["mla", "MLA 9th"], ["chicago", "Chicago (author-date)"], ["harvard", "Harvard"], ["vancouver", "Vancouver"], ["ieee", "IEEE"], ["ama", "AMA 11th"]]);
  });

  it("the style note says cite_note_check for author-date styles and cite_note_numbered for numbered ones", () => {
    mount();
    expect(tid("cite-style-note")!.textContent).toBe(E.cite_note_check);
    for (const st of ["vancouver", "ieee", "ama"]) { type("citStyle", st); expect(tid("cite-style-note")!.textContent).toBe(E.cite_note_numbered); }
    for (const st of ["apa", "apa6", "mla", "chicago", "harvard"]) { type("citStyle", st); expect(tid("cite-style-note")!.textContent).toBe(E.cite_note_check); }
  });

  it("the type select carries v1's values with the cite_type_* labels; the source-language select en/hi", () => {
    mount();
    expect([...(field("citType") as HTMLSelectElement).options].map((o) => [o.value, o.textContent])).toEqual([
      ["Journal article", E.cite_type_journal], ["Book", E.cite_type_book], ["Website", E.cite_type_website], ["Book chapter", E.cite_type_chapter],
      ["Report", E.cite_type_report], ["Thesis", E.cite_type_thesis], ["Conference paper", E.cite_type_conf]
    ]);
    expect([...(field("citSourceLang") as HTMLSelectElement).options].map((o) => [o.value, o.textContent])).toEqual([["en", E.cite_sourcelang_en], ["hi", E.cite_sourcelang_hi]]);
    expect([...(field("citMonth") as HTMLSelectElement).options].map((o) => o.value)).toEqual(["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect((field("citMonth") as HTMLSelectElement).options[1]!.textContent).toBe("January");
    expect([...(field("citDegree") as HTMLSelectElement).options].map((o) => [o.value, o.textContent])).toEqual([["", "Doctoral dissertation"], ["Master's thesis", "Master's thesis"], ["Undergraduate thesis", "Undergraduate thesis"]]);
    expect((field("citAccessed") as HTMLInputElement).type).toBe("date");
  });

  it("the type shows its cit-only groups (data-for: chapter conf / chapter / report / thesis)", () => {
    mount();
    const groups = ["cite-only-container", "cite-only-editors", "cite-only-number", "cite-only-degree"];
    const vis = () => groups.map(shown);
    expect(vis()).toEqual([false, false, false, false]);
    type("citType", "Book chapter"); expect(vis()).toEqual([true, true, false, false]);
    type("citType", "Conference paper"); expect(vis()).toEqual([true, false, false, false]);
    type("citType", "Report"); expect(vis()).toEqual([false, false, true, false]);
    type("citType", "Thesis"); expect(vis()).toEqual([false, false, false, true]);
    type("citType", "Website"); expect(vis()).toEqual([false, false, false, false]);
  });

  it("the form survives the panel being closed and opened again (v1's panel stays in the page)", () => {
    const r = mount();
    type("citAuthor", "Bandura, Albert");
    type("citStyle", "mla");
    act(() => r.unmount());
    roots.splice(roots.indexOf(r), 1);
    mount();
    expect(field("citAuthor").value).toBe("Bandura, Albert");
    expect(field("citStyle").value).toBe("mla");
  });

  it("Clear form empties every field but the type, sets the language back to English and toasts 'Form cleared'", async () => {
    mount();
    for (const [id, v] of [["citAuthor", "A, B"], ["citYear", "2020"], ["citTitle", "T"], ["citSource", "S"], ["citVol", "1"], ["citIssue", "2"], ["citPages", "3"], ["citDOI", "10.1/x"], ["citURL", "u"], ["citDay", "5"], ["citAccessed", "2026-10-01"], ["citContainer", "C"], ["citEditors", "E, F"], ["citNumber", "14"]] as const) type(id, v);
    type("citMonth", "6"); type("citDegree", "Master's thesis"); type("citType", "Book"); type("citSourceLang", "hi");
    await click("cite-clear");
    for (const id of ["citAuthor", "citYear", "citTitle", "citSource", "citVol", "citIssue", "citPages", "citDOI", "citURL", "citMonth", "citDay", "citAccessed", "citContainer", "citEditors", "citNumber", "citDegree"]) expect(field(id).value).toBe("");
    expect(field("citType").value).toBe("Book");
    expect(field("citSourceLang").value).toBe("en");
    expect(toasts()).toEqual(["Form cleared"]);
  });
});

describe("Citation Manager: lookup (citLookup 7931-7961, paste 7970-7976)", () => {
  it("a DOI fills the form from Crossref and toasts busy then cite_lookup_ok", async () => {
    mount();
    type("citDOI", "10.1037/0003-066X.55.1.68");
    await click("cite-lookup");
    await settle();
    expect(requested).toEqual([DOI_JOURNAL]);
    const want = crToEntry(work(DOI_JOURNAL));
    expect(field("citTitle").value).toBe(want.title);
    expect(field("citAuthor").value).toBe(want.author);
    expect(field("citYear").value).toBe("2000");
    expect(field("citSource").value).toBe(want.source);
    expect(field("citVol").value).toBe(want.volume);
    expect(field("citPages").value).toBe(want.pages);
    expect(field("citDOI").value).toBe(want.doi);
    expect(field("citType").value).toBe("Journal article");
    expect(toasts()).toEqual([E.cite_lookup_busy, E.cite_lookup_ok]);
  });

  it("a book chapter sets the type and fills the container, which its group then shows", async () => {
    mount();
    type("citURL", "https://doi.org/10.1093/oso/9780199974467.003.0001");
    await click("cite-lookup");
    await settle();
    expect(requested).toEqual([DOI_CHAPTER]);
    expect(field("citType").value).toBe("Book chapter");
    expect(field("citContainer").value).toBe(crToEntry(work(DOI_CHAPTER)).container);
    expect(field("citMonth").value).toBe("12");
    expect(field("citURL").value).toBe("");
    expect(shown("cite-only-container")).toBe(true);
  });

  it("a DOI Crossref does not know toasts cite_lookup_nf and fills nothing", async () => {
    mount();
    type("citDOI", "10.9999/appuscholar-no-such-doi-2026");
    await click("cite-lookup");
    await settle();
    expect(requested).toEqual([DOI_MISSING]);
    expect(field("citTitle").value).toBe("");
    expect(toasts()).toEqual([E.cite_lookup_busy, E.cite_lookup_nf]);
  });

  it("a PubMed ID goes through eutils to its DOI, then Crossref", async () => {
    mount();
    type("citURL", "9500320");
    await click("cite-lookup");
    await settle();
    expect(requested).toEqual([PMID_SUMMARY, DOI_LANCET]);
    expect(field("citDOI").value).toBe(crToEntry(work(DOI_LANCET)).doi);
    expect(toasts()).toEqual([E.cite_lookup_busy, E.cite_lookup_ok]);
  });

  it("a title alone takes Crossref's first hit", async () => {
    mount();
    type("citTitle", TITLE_Q);
    await click("cite-lookup");
    await settle();
    expect(requested).toEqual([TITLE_URL]);
    expect(toasts()).toEqual([E.cite_lookup_busy, E.cite_lookup_ok]);
  });

  it("nothing to look up toasts cite_lookup_empty without busy; a network failure toasts cite_lookup_fail", async () => {
    mount();
    await click("cite-lookup");
    expect(requested).toEqual([]);
    expect(toasts()).toEqual([E.cite_lookup_empty]);
    h.toast.mockReset();
    type("citDOI", "10.5555/offline");
    await click("cite-lookup");
    await settle();
    expect(toasts()).toEqual([E.cite_lookup_busy, E.cite_lookup_fail]);
  });

  it("pasting a DOI into the link box looks it up by itself after 60 ms; pasting plain words does not", async () => {
    mount();
    const paste = (id: string, text: string) => {
      type(id, text);
      const ev = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "clipboardData", { value: { getData: () => text } });
      act(() => { field(id).dispatchEvent(ev); });
    };
    paste("citURL", "Some words with no identifier");
    await settle(100);
    expect(requested).toEqual([]);
    paste("citURL", "https://doi.org/10.1037/0003-066X.55.1.68");
    expect(requested).toEqual([]);
    await settle(100);
    expect(requested).toEqual([DOI_JOURNAL]);
    expect(toasts()).toEqual([E.cite_lookup_busy, E.cite_lookup_ok]);
  });

  it("a month outside 1-12 is left empty, as v1's select drops it", () => {
    expect(filledForm(EMPTY_CITE_FORM, { month: "13", title: "x" }).month).toBe("");
    expect(filledForm(EMPTY_CITE_FORM, { month: "7" }).month).toBe("7");
  });
});

describe("Citation Manager: + Library and Insert citation (citAdd 7507, citInsert 7505)", () => {
  function fill(e: CitationEntry) {
    if (e.type) type("citType", e.type);
    for (const [id, k] of [["citAuthor", "author"], ["citYear", "year"], ["citTitle", "title"], ["citSource", "source"], ["citVol", "volume"], ["citIssue", "issue"], ["citPages", "pages"], ["citDOI", "doi"]] as const) type(id, e[k] ?? "");
  }

  it("+ Library needs author and title", async () => {
    mount();
    type("citTitle", "Only a title");
    await click("cite-add");
    type("citTitle", ""); type("citAuthor", "Only, Author");
    await click("cite-add");
    expect(h.blob.set).not.toHaveBeenCalled();
    expect(toasts()).toEqual(["Add author and title first", "Add author and title first"]);
  });

  it("+ Library saves v1's whole form entry as an update that appends, and toasts 'Saved to library ✓'", async () => {
    mount();
    fill(BANDURA);
    await click("cite-add");
    expect(h.blob.set).toHaveBeenCalledTimes(1);
    const up = h.blob.set.mock.calls[0]![0] as (prev: Lib | null) => Lib;
    expect(typeof up).toBe("function");
    const saved: CitationEntry = {
      author: "Bandura, Albert", year: "1977", title: "Social learning theory", source: "Prentice Hall", volume: "", issue: "", pages: "", doi: "", url: "",
      month: "", day: "", accessed: "", container: "", editors: "", number: "", degree: "", type: "Book", style: "apa", lang: "en"
    };
    expect(up(null)).toEqual([saved]);
    expect(up([MILLER])).toEqual([MILLER, saved]);
    expect(toasts()).toEqual(["Saved to library ✓"]);
  });

  it("values are trimmed as citReadForm trims them", async () => {
    mount();
    type("citAuthor", "  Bandura, Albert "); type("citTitle", " Social learning theory  ");
    await click("cite-add");
    const up = h.blob.set.mock.calls[0]![0] as (prev: Lib | null) => Lib;
    expect(up(null)[0]).toMatchObject({ author: "Bandura, Albert", title: "Social learning theory" });
  });

  it("a source already in the library is saved again, as v1's citAdd saves it (7507-7508: no duplicate check)", async () => {
    h.blob.value = [MILLER];
    mount();
    fill({ ...MILLER, title: "THE MAGICAL NUMBER SEVEN", source: "Elsewhere" });
    await click("cite-add");
    expect(h.blob.set).toHaveBeenCalledTimes(1);
    const up = h.blob.set.mock.calls[0]![0] as (prev: Lib | null) => Lib;
    const next = up([MILLER]);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ author: MILLER.author, year: "2020", title: "THE MAGICAL NUMBER SEVEN" });
    expect(toasts()).toEqual(["Saved to library ✓"]);
  });

  it("an add queued before the library is known lands on top of the stored entries, a duplicate included", async () => {
    h.blob.value = null; h.blob.loading = true;
    mount();
    fill(BANDURA);
    await click("cite-add");
    const up = h.blob.set.mock.calls[0]![0] as (prev: Lib | null) => Lib;
    const stored = [{ ...BANDURA }];
    expect(up(stored)).toHaveLength(2);
    expect(up(stored)[0]).toBe(stored[0]);
  });

  it("a library that cannot be opened is overwritten only after a confirm", async () => {
    h.blob.value = null; h.blob.broken = true;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    expect(tid("cite-broken")!.textContent).toBe(E.vault_cite_broken);
    fill(BANDURA);
    await click("cite-add");
    expect(confirm).toHaveBeenCalledWith(E.vault_cite_broken_confirm);
    expect(h.blob.set).not.toHaveBeenCalled();
    expect(toasts()).toEqual([]);
    confirm.mockReturnValue(true);
    await click("cite-add");
    expect(h.blob.set).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual(["Saved to library ✓"]);
  });

  it("a locked library says so in one line, and + Library still goes to the blob (which asks for the passphrase)", async () => {
    h.blob.value = null; h.blob.locked = true;
    mount();
    expect(tid("cite-locked")!.textContent).toBe(E.vault_cite_locked);
    fill(BANDURA);
    await click("cite-add");
    expect(h.blob.set).toHaveBeenCalledTimes(1);
  });

  it("Insert citation puts ' ' + intext at the editor's cursor; unsaved in a numbered style toasts cite_num_unsaved", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    ed.view.dom.dispatchEvent(new FocusEvent("focus"));
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    h.editor = ed;
    h.blob.value = [MILLER];
    mount();
    fill(BANDURA);
    await click("cite-insert");
    expect(ed.getHTML()).toBe("<p>Learning is social. (Bandura, 1977)</p>");
    expect(toasts()).toEqual(["Citation inserted ✓"]);
    type("citStyle", "vancouver");
    await click("cite-insert");
    expect(ed.getHTML()).toBe("<p>Learning is social. (Bandura, 1977) [2]</p>");
    expect(toasts()[1]).toBe(E.cite_num_unsaved);
    expect(h.blob.set).not.toHaveBeenCalled();
  });
  it("before the student has been in the document, Insert citation goes at its end on a new line (v1 with no savedRange)", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Start.</p><p>Learning is social.</p>" });
    editors.push(ed);
    h.editor = ed;
    mount();
    fill(BANDURA);
    await click("cite-insert");
    expect(ed.getHTML()).toBe("<p>Start.</p><p>Learning is social.<br> (Bandura, 1977)</p>");
  });

  it("+ Library is disabled until the project id is known (before /me answers)", () => {
    h.me = null;
    mount();
    expect(h.blobArgs).toEqual(["citations", null]);
    expect((tid("cite-add") as HTMLButtonElement).disabled).toBe(true);
  });

  it("with no document open (no editor) Insert citation and the cards' Insert are disabled", () => {
    h.blob.value = [BANDURA];
    mount();
    expect((tid("cite-insert") as HTMLButtonElement).disabled).toBe(true);
    expect((tid("cite-use") as HTMLButtonElement).disabled).toBe(true);
    expect((tid("cite-add") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Citation Manager: the library (citRender 7819-7866)", () => {
  it("Cite shows the loading sign, not its empty state, until its data is read (W8)", () => {
    h.blob.value = null; h.blob.loading = true;
    const root = mount();
    const lib = tid("cite-lib")!;
    expect(lib.querySelector('[data-testid="panel-loading"]')!.textContent).toBe(E.blob_loading);
    expect(lib.textContent).not.toContain(E.cite_no_sources);
    expect(tid("cite-count")).toBeNull();
    expect(document.body.textContent).not.toContain("0 sources");
    // The read lands: the cards (or "No sources yet.") and the count replace the sign.
    h.blob = { ...h.blob, value: [BANDURA, MILLER], loading: false };
    act(() => { root.render(<CitePanel />); });
    expect($('[data-testid="panel-loading"]')).toBeNull();
    expect(tid("cite-count")!.textContent).toBe("2");
    expect(tid("cite-lib")!.querySelectorAll('[data-testid="cite-card"]')).toHaveLength(2);
  });

  it("a locked library shows no loading sign (W8)", () => {
    h.blob.value = null; h.blob.locked = true;
    mount();
    expect($('[data-testid="panel-loading"]')).toBeNull();
    expect(tid("cite-locked")!.textContent).toBe(E.vault_cite_locked);
  });

  it("an empty library shows 'No sources yet.' and a 0 badge", () => {
    mount();
    expect(tid("cite-count")!.textContent).toBe("0");
    expect(tid("cite-lib")!.textContent).toBe(E.cite_no_sources);
  });

  it("each card: ✕, surname and year in bold, the formatted reference, and 'Insert <in-text>'; the badge counts", () => {
    h.blob.value = [BANDURA, MILLER, { ...MILLER, author: "", year: "" }];
    mount();
    expect(tid("cite-count")!.textContent).toBe("3");
    const cards = document.body.querySelectorAll<HTMLElement>('[data-testid="cite-card"]');
    expect(cards).toHaveLength(3);
    expect(cards[0]!.querySelector("b")!.textContent).toBe("Bandura, 1977");
    expect(cards[2]!.querySelector("b")!.textContent).toBe("Author, n.d.");
    expect(cards[1]!.querySelector('[data-testid="cite-ref"]')!.innerHTML).toBe(sanitizeHtml(citFmt(MILLER, 2, "apa").refHTML));
    expect(cards[1]!.querySelector('[data-testid="cite-ref"]')!.innerHTML).toContain("<i>Psychological Review, 63</i>");
    expect([...cards].map((c) => c.querySelector('[data-testid="cite-use"]')!.textContent)).toEqual(["Insert (Bandura, 1977)", "Insert (Miller et al., 2020)", "Insert (Author, n.d.)"]);
    expect(cards[0]!.querySelector('[data-testid="cite-del"]')!.getAttribute("title")).toBe("Remove");
    // the slots Task 8 fills, in v1's order: usage line, retraction warning, Crossref line
    expect([...cards[0]!.querySelectorAll("[data-cite-slot]")].map((e) => e.getAttribute("data-cite-slot"))).toEqual(["cite-used", "cite-retr", "cite-rc"]);
  });

  it("cards follow the chosen style; AMA's button reads 'Insert ¹ (n)'", () => {
    h.blob.value = [BANDURA, MILLER];
    mount();
    type("citStyle", "ama");
    const cards = document.body.querySelectorAll<HTMLElement>('[data-testid="cite-card"]');
    expect([...cards].map((c) => c.querySelector('[data-testid="cite-use"]')!.textContent)).toEqual(["Insert ¹ (1)", "Insert ¹ (2)"]);
    expect(cards[1]!.querySelector('[data-testid="cite-ref"]')!.innerHTML).toBe(sanitizeHtml(citFmt(MILLER, 2, "ama").refHTML));
  });

  it("a card's Insert puts its citation at the cursor and toasts 'Citation inserted ✓'", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Seven.</p>" });
    editors.push(ed);
    ed.view.dom.dispatchEvent(new FocusEvent("focus"));
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    h.editor = ed;
    h.blob.value = [BANDURA, MILLER];
    mount();
    type("citStyle", "ieee");
    const btn = document.body.querySelectorAll<HTMLElement>('[data-testid="cite-use"]')[1]!;
    await act(async () => { btn.click(); });
    expect(ed.getHTML()).toBe("<p>Seven. [2]</p>");
    expect(toasts()).toEqual(["Citation inserted ✓"]);
  });

  it("✕ removes that card by index, as an update", async () => {
    h.blob.value = [BANDURA, MILLER];
    mount();
    const del = document.body.querySelectorAll<HTMLElement>('[data-testid="cite-del"]')[0]!;
    await act(async () => { del.click(); });
    const up = h.blob.set.mock.calls[0]![0] as (prev: Lib | null) => Lib;
    expect(up([BANDURA, MILLER])).toEqual([MILLER]);
    expect(up(null)).toEqual([]);
  });
});
