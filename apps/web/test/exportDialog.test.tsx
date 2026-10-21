// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * The export place (wave B Task 12, register D-S2-42): the dialog's copy is the Export canvas's, its ticks are the parts, the reference style is
 * chosen here, and Download zip shows what it is building while it builds, with the button disabled (W31: the export was silent for about 20 s).
 * Every tool's own download is now an Export link that opens the dialog with only its part ticked (W11).
 */

const h = vi.hoisted(() => ({ api: vi.fn(), download: vi.fn(), toast: vi.fn(), hold: null as null | Promise<void> }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/export/download", async (orig) => ({ ...(await orig<typeof import("../lib/export/download")>()), downloadBlob: h.download }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-exp", scratchProjectId: "s1" }, settings: {} }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/popout/sync", () => ({ useInsertTarget: () => ({ ready: false, block: () => {}, citation: () => {} }) }));

import { ApiError } from "../lib/api";
import { heldBlobs } from "../lib/blobs/held";
import { useProjectBlob } from "../lib/blobs/useProjectBlob";
import { VaultProvider } from "../lib/vault/useVault";
import { ProjectProvider, type ProjectValue } from "../components/frame/ProjectContext";
import { ExportDialog, exportPartsFor } from "../components/export/ExportDialog";
import { CiteShare } from "../components/tools/cite/CiteShare";
import { Matrix } from "../components/tools/shelf/Matrix";
import { DEFAULT_EXPORT_PARTS, EXPORT_PARTS, type ExportPart } from "../lib/export/projectExport";
import type { Library } from "../lib/cite/useLibrary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
const ticked = () => EXPORT_PARTS.filter((p) => (tid("exp-part-" + p) as HTMLInputElement | null)?.checked);

const LIB = [
  { author: "Walker, Matthew", year: "2017", title: "Why we sleep", source: "Scribner", type: "Book" },
  { author: "Alvarez, Ana", year: "2020", title: "Sleep and exam anxiety", source: "Journal of Sleep", type: "Journal article" }
];
const project = { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0, deks: [], field: "", stage: "idea", status: "active", contentLang: "en", kind: "research" };
const doc = { id: "D1", projectId: "p1", title: "My first document", titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z" };
const RECORD = { docs: [], sources: [], weekly: [], aiLog: { byKind: {}, byService: {}, total: 0, firstAt: null, lastAt: null, loggingOff: false } };
/** The account's AI-use log: one row of this project, one of another, one saved with no project. */
const LOG_ROWS = [
  { projectId: "p1", e: { d: "2026-10-02", p: "anthropic", m: "claude", k: "Idea check", g: "feedback" } },
  { projectId: "p2", e: { d: "2026-10-03", p: "groq", m: "gpt-oss", k: "Search terms", g: "feedback" } },
  { projectId: null, e: { d: "2026-10-04", p: "gemini", m: "flash", k: "Title ideas", g: "feedback" } }
];
const aiLog = (path: string) => {
  const pid = new URL(path, "http://x").searchParams.get("projectId");
  return LOG_ROWS.filter((r) => pid === null || r.projectId === pid).map((r) => r.e);
};
const unzipped = async (b: Blob) => JSZip.loadAsync(await new Promise<ArrayBuffer>((done) => { const r = new FileReader(); r.onload = () => done(r.result as ArrayBuffer); r.readAsArrayBuffer(b); }));
const audits = () => h.api.mock.calls.filter(([p, init]) => p === "/me/export-audit" && (init as { method?: string } | undefined)?.method === "POST");

beforeEach(() => {
  h.download.mockReset(); h.toast.mockReset(); h.hold = null;
  heldBlobs.clear();
  h.api.mockReset().mockImplementation(async (path: string) => {
    if (path === "/me/vault") throw new ApiError(404, "not-found");
    if (path === "/projects/p1/documents") return [doc];
    if (path === "/documents/D1") return { ...doc, bodyHtml: "<p>Hello.</p>", keyVersion: 0, deks: [] };
    if (path === "/projects/p1/blobs/citations") return { kind: "citations", body: JSON.stringify(LIB), keyVersion: 0, deks: [], updatedAt: "2026-10-21T00:00:00Z" };
    if (path.startsWith("/projects/p1/blobs/")) throw new ApiError(404, "not-found");
    if (path === "/projects/p1/writing-record") { if (h.hold) await h.hold; return RECORD; }
    if (path.startsWith("/ai/log")) return aiLog(path);
    if (path === "/me/export-audit") return undefined;
    throw new ApiError(404, "not-found");
  });
});

/** The shell's part of the export place: openExport opens the dialog, with only the preselected part ticked when one is given. */
function Harness({ children, openExport }: { children?: React.ReactNode; openExport?: (p?: ExportPart) => void }) {
  const [parts, setParts] = useState<ExportPart[] | null>(null);
  const value = {
    project, projectId: "p1", documents: [doc], currentDoc: null, flushOpen: async () => true,
    openExport: (p?: ExportPart) => { openExport?.(p); setParts(exportPartsFor(p)); }
  } as unknown as ProjectValue;
  return (
    <ProjectProvider value={value}>
      {children}
      <button type="button" data-testid="open-all" onClick={() => value.openExport()} />
      <ExportDialog parts={parts} onClose={() => setParts(null)} />
    </ProjectProvider>
  );
}
async function render(node?: React.ReactNode, openExport?: (p?: ExportPart) => void) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><Harness openExport={openExport}>{node}</Harness></VaultProvider>); });
}
/** A panel with the question's blob mounted; `box.set` is its set(). */
type IdeaBox = { set?: (v: { topic: string; resources: string; timeframe: string; constraints: string }) => void };
function ideaPanel(box: IdeaBox) {
  return function Idea() {
    const b = useProjectBlob("idea_intake", "p1");
    box.set = b.set;
    return <span data-testid="idea-loaded">{b.loading ? "" : "yes"}</span>;
  };
}
const library = { lib: LIB, style: "apa", ready: true, update: () => true } as unknown as Library;

describe("ExportDialog", () => {
  it("shows the Export canvas's copy, every part but the reading list backup ticked", async () => {
    await render();
    await click(tid("open-all"));
    expect(tid("export-dialog")).not.toBeNull();
    expect($("#exp-h")!.textContent).toBe("Export: Sleep and exam anxiety");
    const text = tid("export-dialog")!.textContent!;
    for (const s of [
      "Unlocked in your browser and saved to your computer. The files are readable, so keep them somewhere safe.",
      "What to include",
      "Documents", "My first document, and every other document in this project", "Word and HTML",
      "Your question and feasibility read", "The project card and the last AI read",
      "Citations", "2 sources, with the reference list in your chosen style", "Library file and reference list (text)",
      "Search lists", "Papers you searched and kept, with quick reads",
      "Reading notes", "Highlights, your own summaries and AI summaries, marked as such",
      "Comparison table and paper cards", "Your words, paper by paper",
      "Writing record", "What you typed and what came from AI, per version",
      "AI-use statement", "Which AI helped, for what, on which days; never your text",
      "Cancel", "Download zip",
      "To take every project at once, or to leave Appuscholar, use Account, Export all my work."
    ]) expect(text).toContain(s);
    // Until RIS and BibTeX exist (Task 38), the citations line does not offer them.
    expect(text).not.toContain("RIS");
    expect(ticked()).toEqual(DEFAULT_EXPORT_PARTS);
    expect(text).not.toMatch(/[—]/);
  });

  it("a per-tool Export link opens the dialog with only its part ticked (W11)", async () => {
    const opened = vi.fn();
    await render(<><CiteShare library={library} insertReady={false} /><Matrix items={[]} loading={false} cols={[]} onAddCol={() => {}} onDelCol={() => {}} onCell={() => {}} /></>, opened);
    expect(tid("cite-export")!.textContent).toBe(E.exp_link);
    await click(tid("cite-export"));
    expect(opened).toHaveBeenLastCalledWith("citations");
    expect(ticked()).toEqual(["citations"]);
    await click(tid("exp-cancel"));
    expect(tid("export-dialog")).toBeNull();
    await click(tid("sh-csv"));
    expect(opened).toHaveBeenLastCalledWith("compare");
    expect(ticked()).toEqual(["compare"]);
    // Every part can still be ticked by hand.
    await click(tid("exp-part-notes"));
    expect(ticked()).toEqual(["notes", "compare"]);
    expect(exportPartsFor()).toEqual(DEFAULT_EXPORT_PARTS);
    expect(exportPartsFor("search")).toEqual(["search"]);
  });

  it("Download zip shows what it is building and is disabled until the zip is saved (W31)", async () => {
    let release!: () => void;
    h.hold = new Promise<void>((r) => { release = r; });
    await render();
    await click(tid("open-all"));
    expect(tid("exp-progress")).toBeNull();
    await click(tid("exp-download"));
    await until(() => !!tid("exp-progress")?.textContent?.includes("Writing record"));
    expect(tid("exp-progress")!.getAttribute("role")).toBe("status");
    expect((tid("exp-download") as HTMLButtonElement).disabled).toBe(true);
    // A second press while it builds does nothing.
    await click(tid("exp-download"));
    expect(h.download).not.toHaveBeenCalled();
    release();
    await until(() => h.download.mock.calls.length === 1);
    expect(h.download.mock.calls[0]![0]).toMatch(/^appuscholar-Sleep and exam anxiety-\d{4}-\d{2}-\d{2}\.zip$/);
    await until(() => tid("export-dialog") === null);
  });

  it("one audit row per download", async () => {
    await render();
    await click(tid("open-all"));
    await click(tid("exp-download"));
    await until(() => h.download.mock.calls.length === 1);
    expect(audits()).toHaveLength(1);
    await until(() => tid("export-dialog") === null);
    await click(tid("open-all"));
    await click(tid("exp-download"));
    await until(() => h.download.mock.calls.length === 2);
    expect(audits()).toHaveLength(2);
  });

  it("the zip holds the ticked parts, with the reference list in the style chosen here", async () => {
    await render(<CiteShare library={library} insertReady={false} />);
    await click(tid("cite-export"));
    const sel = tid("exp-style") as HTMLSelectElement;
    await act(async () => { sel.value = "vancouver"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(tid("exp-download"));
    await until(() => h.download.mock.calls.length === 1);
    const b = h.download.mock.calls[0]![1] as Blob;
    const bytes = await new Promise<ArrayBuffer>((done) => { const r = new FileReader(); r.onload = () => done(r.result as ArrayBuffer); r.readAsArrayBuffer(b); });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort()).toEqual(["citations/library.json", "citations/references.txt"]);
    const refs = await zip.file("citations/references.txt")!.async("string");
    // Vancouver keeps the library's order.
    expect(refs.indexOf("Walker")).toBeLessThan(refs.indexOf("Alvarez"));
  });

  it("nothing ticked: Download zip is disabled; a failed build says so in the dialog and saves nothing", async () => {
    await render(<CiteShare library={library} insertReady={false} />);
    await click(tid("cite-export"));
    await click(tid("exp-part-citations"));
    expect((tid("exp-download") as HTMLButtonElement).disabled).toBe(true);
    await click(tid("exp-part-citations"));
    h.api.mockImplementation(async (path: string) => { if (path === "/me/vault") throw new ApiError(404, "not-found"); throw new Error("offline"); });
    await click(tid("exp-download"));
    await until(() => !!tid("exp-error"));
    expect(tid("exp-error")!.textContent).toBe(E.export_fail);
    expect(h.download).not.toHaveBeenCalled();
    expect(audits()).toHaveLength(0);
    expect((tid("exp-download") as HTMLButtonElement).disabled).toBe(false);
  });
  it("the AI-use statement holds only this project's rows (GET /ai/log?projectId)", async () => {
    await render();
    await click(tid("open-all"));
    await click(tid("exp-download"));
    await until(() => h.download.mock.calls.length === 1);
    expect(h.api.mock.calls.map(([p]) => p as string).filter((p) => p.startsWith("/ai/log"))).toEqual(["/ai/log?projectId=p1"]);
    const statement = await (await unzipped(h.download.mock.calls[0]![1] as Blob)).file("ai-use-statement.txt")!.async("string");
    expect(statement).toContain("Idea check");
    expect(statement).not.toMatch(/Search terms|Title ideas/);
  });

  it("an unsent edit and a held value are saved before the zip is built, and the zip has them", async () => {
    const stored: Record<string, string> = {};
    const base = h.api.getMockImplementation()!;
    h.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      const kind = path.startsWith("/projects/p1/blobs/") ? decodeURIComponent(path.slice("/projects/p1/blobs/".length)) : null;
      if (kind && init?.method === "PUT") { stored[kind] = (JSON.parse(init.body!) as { body: string }).body; return { kind, body: stored[kind], keyVersion: 0, deks: [], updatedAt: "2026-10-21T00:00:00Z", version: 1 }; }
      if (kind && kind in stored) return { kind, body: stored[kind], keyVersion: 0, deks: [], updatedAt: "2026-10-21T00:00:00Z", version: 1 };
      return base(path, init);
    });
    const box: IdeaBox = {};
    const sent = vi.fn(async () => []);
    heldBlobs.put("held-elsewhere", [{ value: 1 }], sent);
    const Idea = ideaPanel(box);
    await render(<Idea />);
    await until(() => tid("idea-loaded")!.textContent === "yes");
    // Typed just now: still inside the save's debounce when Download zip is pressed.
    act(() => { box.set!({ topic: "Naps before exams", resources: "", timeframe: "", constraints: "" }); });
    await click(tid("open-all"));
    await click(tid("exp-download"));
    await until(() => h.download.mock.calls.length === 1);
    expect(sent).toHaveBeenCalledTimes(1);
    const q = await (await unzipped(h.download.mock.calls[0]![1] as Blob)).file("question.txt")!.async("string");
    expect(q).toContain("Naps before exams");
    expect(tid("exp-unsaved")).toBeNull();
    await until(() => tid("export-dialog") === null);
  });

  it("changes that still cannot be saved: the zip is saved and the dialog says they are not in it", async () => {
    const base = h.api.getMockImplementation()!;
    h.api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method === "PUT") throw new Error("offline");
      return base(path, init);
    });
    const box: IdeaBox = {};
    const Idea = ideaPanel(box);
    await render(<Idea />);
    await until(() => tid("idea-loaded")!.textContent === "yes");
    act(() => { box.set!({ topic: "Naps before exams", resources: "", timeframe: "", constraints: "" }); });
    await click(tid("open-all"));
    await click(tid("exp-download"));
    await until(() => h.download.mock.calls.length === 1);
    await until(() => !!tid("exp-unsaved"));
    expect(tid("exp-unsaved")!.textContent).toBe(E.exp_unsaved);
    expect(tid("export-dialog")).not.toBeNull();
  });
});
