// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import { heldBlobs } from "../lib/blobs/held";
import type { ShelfIndex, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import { createBlobServer, fakeVault, type Server } from "./support/blobServer";
import { recordedFetch, RECS, type RecordedFetch } from "./support/recordedFetch";

/*
 * The Reading list while Europe PMC's open-access text is on its way (wave B Task 21b, register row D-S2-127; OJ's answer 2): the quiet line "Getting the free full text…" under a row,
 * the text arriving in the open list at once (the runner writes through the list's own store), "Get the free PDF" back with its line when Europe PMC has no text or could not be asked,
 * a PDF that Add your own PDF keeps is not asked for, and a text the student removes is not brought back. The list is the real one over a fake blob server; the page's fetch is core's
 * recorded Europe PMC responses.
 */

const h = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), extract: vi.fn(), vault: null as unknown }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1" }, projectId: "p1", openExport: vi.fn() }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" }, settings: { field: "education" } }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => vi.fn(async () => "OK") }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: vi.fn() }));
vi.mock("@/lib/shelf/extract", async (orig) => ({ ...(await orig<typeof import("../lib/shelf/extract")>()), extractPdfPages: (f: File) => h.extract(f) }));

import { CiteLibraryProvider } from "../lib/cite/useLibrary";
import { FullTextRunner } from "../components/frame/FullTextRunner";
import { ReadingList } from "../components/literature/ReadingList";
import { useFullTextLine } from "../components/literature/useFullTextLine";
import { fullText, setFullTextFetch } from "../lib/papers/fullText";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest/";
const WALK_DOI = "10.1038/s41598-019-49466-6";
const NO_PMC = "10.1037/0003-066x.55.1.68";
const WALK_TITLE = "Open-label placebos reduce test anxiety and improve self-management skills";
const FULL = REST + "PMC6746734/fullTextXML";
const WALK: StoredEntry = { pid: "kwalk", rl: true, author: "Schaefer, C.; Denke, C.", year: "2019", title: WALK_TITLE, doi: WALK_DOI, oa: "https://example.org/walk.pdf" };
const RYAN: StoredEntry = { pid: "kryan", rl: true, author: "Ryan, R.; Deci, E.", year: "2000", title: "Self-determination theory and the facilitation of intrinsic motivation", doi: NO_PMC, oa: "https://example.org/ryan.pdf" };
const PUTWAIN: StoredEntry = { pid: "kput", rl: true, author: "Putwain, D.", year: "2008", title: "Examination stress and test anxiety", oa: "https://example.org/putwain.pdf" };

let server: Server;
let rf: RecordedFetch;
const roots: Root[] = [];
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel));
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tids = (id: string) => $$(`[data-testid="${id}"]`);
const rowOf = (text: string) => tids("rl-row").find((r) => r.textContent!.includes(text))!;
const quiet = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5)); });
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error(what + " not reached");
}
/** LitPlace's Reading tab, without the rest of the place: the list with the line that follows the queue. */
function Reading() {
  const textState = useFullTextLine();
  return <ReadingList textState={textState} />;
}
async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<CiteLibraryProvider><FullTextRunner /><Reading /></CiteLibraryProvider>); });
}
/** Holds every request to Europe PMC until `open()`, then answers it from the recordings. */
function holdRequests() {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  setFullTextFetch((async (input: RequestInfo | URL, init?: RequestInit) => { await gate; return rf.fetch(input, init); }) as typeof fetch);
  return open;
}
const wait = (row: HTMLElement) => row.querySelector('[data-testid="rl-text-wait"]');
const free = (row: HTMLElement) => row.querySelector('[data-testid="rl-free"]');
const rows = async (n: number) => { await until(() => tids("rl-row").length >= n && tids("rl-status").length >= n, "the rows"); };

beforeEach(async () => {
  server = createBlobServer("p1");
  h.vault = await fakeVault({ status: "off" });
  h.api.mockReset().mockImplementation(server.api);
  h.toast.mockReset();
  h.extract.mockReset();
  rf = recordedFetch();
  setFullTextFetch(rf.fetch as unknown as typeof fetch);
  heldBlobs.clear();
  fullText.reset();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  setFullTextFetch(null);
  fullText.reset();
  vi.unstubAllGlobals();
});

describe("while the text is on its way", () => {
  it("the row says so quietly and waits with the free-PDF link; the text then arrives in the open list, which reads it, with no PDF note and no line", async () => {
    server.putPlain("citations", [WALK, PUTWAIN]);
    const open = holdRequests();
    await mount();
    await rows(2);
    await until(() => !!wait(rowOf("Schaefer")), "the line");
    expect(wait(rowOf("Schaefer"))!.textContent).toBe("Getting the free full text…");
    expect(E.rl_text_getting).toBe("Getting the free full text…");
    // The link waits for it; a paper with no DOI is not asked for, so its link stays.
    expect(free(rowOf("Schaefer"))).toBeNull();
    expect(free(rowOf("Putwain"))).not.toBeNull();
    expect(wait(rowOf("Putwain"))).toBeNull();
    expect(rowOf("Schaefer").querySelector('[data-testid="rl-status"]')!.textContent).toBe("Not read yet. No PDF");
    open();
    await until(() => !wait(rowOf("Schaefer")) && rowOf("Schaefer").querySelector('[data-testid="rl-status"]')?.textContent === "Not read yet", "the text in the list");
    expect(free(rowOf("Schaefer"))).toBeNull();
    const read = rowOf("Schaefer").querySelector<HTMLButtonElement>('[data-testid="rl-read"]')!;
    await until(() => !read.disabled, "Read enabled");
    // The open list saves the new entry as it saves any change of its index, a moment after it shows it.
    await until(() => server.find("shelf_index") !== undefined, "the index saved");
    const index = (await server.value<ShelfIndex>("shelf_index"))!;
    expect(index[0]).toMatchObject({ pid: "kwalk", doi: WALK_DOI, src: "epmc" });
    expect(((await server.value<ShelfPaper>("shelf_paper:" + index[0]!.id))!.pages[0]!).startsWith(WALK_TITLE.slice(0, 20))).toBe(true);
  });

  it("papers go one after the other: the second row's line is still there while the first is asked", async () => {
    server.putPlain("citations", [WALK, RYAN]);
    const open = holdRequests();
    await mount();
    await rows(2);
    await until(() => !!wait(rowOf("Schaefer")) && !!wait(rowOf("Ryan")), "both lines");
    open();
    await until(() => !wait(rowOf("Schaefer")) && !wait(rowOf("Ryan")), "both done");
    expect(rf.requested.filter((u) => u.startsWith(REST))).toEqual([
      REST + "search?query=DOI:" + WALK_DOI + "&format=json&resultType=lite", FULL, REST + "search?query=DOI:" + NO_PMC + "&format=json&resultType=lite"
    ]);
  });
});

describe("the fallback", () => {
  it("when Europe PMC has no text, Get the free PDF is back with its line, and the answer is remembered", async () => {
    server.putPlain("citations", [RYAN]);
    await mount();
    await rows(1);
    await until(() => !wait(rowOf("Ryan")) && !!free(rowOf("Ryan")), "the link");
    expect(free(rowOf("Ryan"))!.textContent).toBe("Get the free PDF Save it, then add it here with Add your own PDF.");
    await until(() => (server.blobs.find((b) => b.kind === "citations") && JSON.parse(server.find("citations")!.body)[0].ft?.none === NO_PMC) === true, "the none saved");
  });

  it("when Europe PMC cannot be asked, the link shows too and nothing is remembered", async () => {
    const unasked: StoredEntry = { ...RYAN, doi: "10.9999/not-recorded" };
    server.putPlain("citations", [unasked]);
    await mount();
    await rows(1);
    await until(() => rf.unrecorded().length === 1 && !wait(rowOf("Ryan")) && !!free(rowOf("Ryan")), "the link");
    rf.forget();
    await quiet();
    expect(server.puts("citations")).toEqual([]);
    expect(JSON.parse(server.find("citations")!.body)[0].ft).toBeUndefined();
  });
});

describe("a PDF the student adds, and a text the student removes", () => {
  it("a paper that Add your own PDF keeps is not asked for text: a PDF is coming for it", async () => {
    server.putPlain("citations", [PUTWAIN]);
    const title = "Daily screen time and sleep quality in adolescents";
    const doi = "10.1038/s41598-019-49731-x";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: { title: [title], DOI: doi, author: [{ family: "Lee", given: "Ann" }], issued: { "date-parts": [[2021]] }, "container-title": ["Sleep Journal"] } }), { status: 200, headers: { "content-type": "application/json" } })));
    h.extract.mockImplementation(async () => ({ pages: [title + "\n" + "Some words about sleep. ".repeat(20) + "\nhttps://doi.org/" + doi + "\n"], total: 1 }));
    await mount();
    await rows(1);
    const input = tid("rl-file")!;
    Object.defineProperty(input, "files", { value: [new File(["xxxxx"], "sleep.pdf")], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await until(() => (JSON.parse(server.find("shelf_index")?.body ?? "[]") as ShelfIndex).length === 1, "the PDF's place");
    await quiet();
    const index = (await server.value<ShelfIndex>("shelf_index"))!;
    expect(index[0]).toMatchObject({ title, doi, file: "sleep.pdf" });
    expect(index[0]!.src).toBeUndefined();
    expect(rf.requested.filter((u) => u.startsWith(REST))).toEqual([]);
  });

  it("removing the text Europe PMC brought does not bring it back: the id is remembered as none and the paper is not asked again", async () => {
    server.putPlain("citations", [WALK]);
    await mount();
    await until(() => tids("rl-row").length === 1 && !!tids("rl-read")[0] && !(tids("rl-read")[0] as HTMLButtonElement).disabled && !wait(rowOf("Schaefer")), "the text");
    expect(rf.requested.filter((u) => u === FULL)).toHaveLength(1);
    await act(async () => { rowOf("Schaefer").querySelector('[data-testid="rl-more"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await act(async () => { document.body.querySelector<HTMLElement>('[data-testid="rl-item-remove"]')!.click(); });
    await act(async () => { tid("rl-remove-yes")!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await until(() => !!free(rowOf("Schaefer")), "the row without text");
    await until(() => server.find("shelf_index") !== undefined && (JSON.parse(server.find("shelf_index")!.body) as ShelfIndex).length === 0, "the text removed");
    await until(() => JSON.parse(server.find("citations")!.body)[0].ft?.none === WALK_DOI, "the none saved");
    fullText.viewed();
    await quiet();
    expect(rf.requested.filter((u) => u === FULL)).toHaveLength(1);
    expect(wait(rowOf("Schaefer"))).toBeNull();
    expect(free(rowOf("Schaefer"))).not.toBeNull();
  });
});

describe("the reader", () => {
  it("says under the title that the text came from Europe PMC, when it did", async () => {
    server.putPlain("citations", [WALK]);
    await mount();
    await until(() => !!tids("rl-read")[0] && !(tids("rl-read")[0] as HTMLButtonElement).disabled, "the text");
    await act(async () => { tid("rl-read")!.click(); });
    await until(() => !!tid("sh-reader-title"), "the reader");
    expect(tid("sh-src")!.textContent).toBe("Full text from Europe PMC (open access).");
    expect(E.rl_text_epmc).toBe("Full text from Europe PMC (open access).");
    expect(RECS.has(FULL)).toBe(true);
  });
});
