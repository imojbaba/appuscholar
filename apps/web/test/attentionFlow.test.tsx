// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { citKey, type CitationEntry, type RcCheck } from "@appuscholar/core";
import en from "../messages/en.json";
import type { ApNotes, RefCheckCache, ShelfIndex, StoredEntry } from "../lib/blobs/kinds";
import { heldBlobs } from "../lib/blobs/held";
import { createBlobServer, fakeVault, type FakeVault, type Server } from "./support/blobServer";

/*
 * "Needs your attention" across its three places (wave B Task 24, register row D-S2-130), over one fake server that keeps versions as the real one does: a fix made in the Citations tab clears
 * the home's item and does not bring "not checked" back; Keep 1988 survives a reload; Merge the two (ruling B2-R29) from the home repoints the reading list, moves the notes, drops the dropped
 * entry's Crossref answer and makes the home read again; Check now runs the Crossref check and says nothing of its own when it finishes, while a check that reached nothing keeps v1's toast.
 */

const h = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), go: vi.fn(async () => true), vault: null as unknown, paperIds: "done" as string }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", activeProjectId: "p1", scratchProjectId: "s1" }, settings: {}, update: async () => undefined, reload: async () => undefined }) }));
vi.mock("@/lib/vault/useVault", async (orig) => ({ ...(await orig<typeof import("../lib/vault/useVault")>()), useVault: () => h.vault }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => async () => "" }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
const project = { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0, deks: [], field: "Psychology", stage: "lit", status: "active", contentLang: "en", kind: "research" };
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({
    project, projectId: "p1", go: h.go, place: null, openExport: vi.fn(), paperIds: h.paperIds, documents: [], currentDoc: null, selectDoc: vi.fn(async () => true),
    requestInsert: async () => false
  })
}));
vi.mock("@/components/tools/design", () => ({ built: false }));
vi.mock("@/components/tools/stats", () => ({ built: false }));
vi.mock("@/components/tools/qual", () => ({ built: false }));
vi.mock("@/components/tools/style", () => ({ built: false }));
vi.mock("@/components/tools/words", () => ({ built: false }));
vi.mock("@/components/tools/close", () => ({ built: false }));
vi.mock("@/components/tools/slides", () => ({ built: false }));
vi.mock("@/components/tools/viva", () => ({ built: false }));

import { CiteLibraryProvider, resetCiteStyle } from "../lib/cite/useLibrary";
import { resetCheckBusy } from "../lib/cite/checks";
import { resetCiteActive } from "../lib/cite/active";
import { resetCiteForm } from "../lib/cite/form";
import { CitationsTab } from "../components/literature/CitationsTab";
import { ProjectHome, highlightCache } from "../components/frame/ProjectHome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;

let server: Server;
let vault: FakeVault;
const roots: Root[] = [];
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const text = (id: string) => q(id)?.textContent ?? "";
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error(what + " not reached");
}
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function click(el: HTMLElement) { await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); }); }
/** Mounts a place inside the shell's library provider, as the app does. */
function mount(ui: React.ReactNode): Root {
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  roots.push(root);
  act(() => { root.render(<CiteLibraryProvider>{ui}</CiteLibraryProvider>); });
  return root;
}
/** Leaves the place: its unsent saves are sent (the blob clients see them through when disposed of), and the next place waits for them. */
async function leave() {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  await settle(40);
}

const complete = (over: Partial<StoredEntry>): StoredEntry => ({ type: "Journal article", volume: "9", issue: "1", pages: "1-9", ...over });
const OMEGA = complete({ pid: "komega", author: "", year: "2011", title: "Omega-3 supplementation lowers inflammation and anxiety in medical students", doi: "10.1016/j.bbi.2011.07.229" });
const SCHAEFER = complete({ pid: "kschaefer", author: "Schaefer, M.; Denke, C.", year: "2019", title: "Open-label placebos reduce test anxiety and improve self-management skills", doi: "10.1038/s41598-019-49466-6" });
const COHEN: StoredEntry = { pid: "kcohen", type: "Book", author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences", doi: "10.4324/9780203771587" };
const ok = (): RcCheck => ({ s: "ok", m: [], f: { title: "x", year: 2020, author: "x", doi: "" }, t: 1 });
const answer = (e: CitationEntry, c: RcCheck): RefCheckCache => ({ [citKey(e)]: c });
const NO_AUTHOR: RcCheck = {
  s: "diff", m: [{ k: "author", v: "Kiecolt-Glaser" }], miss: ["author"],
  f: { title: "x", year: 2011, author: "Kiecolt-Glaser", doi: "", authors: "Kiecolt-Glaser, Janice K.; Belury, Martha A." }, t: 1
};
const YEAR_DIFFERS: RcCheck = { s: "diff", m: [{ k: "year", v: "2013" }], f: { title: "x", year: 2013, author: "Cohen", doi: "" }, t: 1 };

beforeEach(async () => {
  vault = await fakeVault({ status: "off" });
  h.vault = vault;
  h.paperIds = "done";
  server = createBlobServer("p1");
  h.api.mockReset().mockImplementation(server.api);
  h.toast.mockReset();
  h.go.mockClear();
  heldBlobs.clear();
  highlightCache.clear();
  resetCheckBusy(); resetCiteActive(); resetCiteStyle(); resetCiteForm();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stored = <T,>(kind: string) => server.value<T>(kind);

describe("one fix, three places", () => {
  it("a fix in Citations clears the home's item, and the paper does not come back as not checked", async () => {
    server.putPlain("citations", [OMEGA, SCHAEFER]);
    server.putPlain("refcheck_cache", { ...answer(OMEGA, NO_AUTHOR), ...answer(SCHAEFER, ok()) });
    mount(<ProjectHome />);
    await until(() => !!q("home-attention"));
    expect(qa("attention-text").map((x) => x.textContent)).toEqual(["2011: omega-3 supplementation lowers inflammation has no authors. Crossref lists Kiecolt-Glaser and Belury."]);
    await leave();

    // In Citations: Use Crossref details (asks first; only the empty field, the author, changes).
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(<CitationsTab />);
    await until(() => qa("source-row").length === 2);
    expect(q("attention-fix")!.textContent).toBe("Use Crossref details");
    await click(q("attention-fix")!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toBe(E.rc_fill_confirm!.replace("{list}", "Author: Kiecolt-Glaser, Janice K.; Belury, Martha A."));
    expect(h.toast.mock.calls.map((c) => c[0])).toEqual([E.rc_filled]);
    await until(() => qa("source-status")[0]!.textContent === "Checked");
    await leave();

    const lib = (await stored<StoredEntry[]>("citations"))!;
    expect(lib[0]!.author).toBe("Kiecolt-Glaser, Janice K.; Belury, Martha A.");
    // The answer moved with the paper's key, so it is not "not checked" now.
    expect(Object.keys((await stored<RefCheckCache>("refcheck_cache"))!)).toContain(citKey(lib[0]!));

    // Home again: nothing needs attention, so there is no card.
    mount(<ProjectHome />);
    await until(() => text("home-detail-lit").includes("Papers kept: 2"));
    await settle(60);
    expect(q("home-attention")).toBeNull();
  });

  it("Keep 1988 survives a reload: the stored entry holds the kind, and neither the tab nor the home lists the difference again", async () => {
    server.putPlain("citations", [COHEN]);
    server.putPlain("refcheck_cache", answer(COHEN, YEAR_DIFFERS));
    mount(<CitationsTab />);
    await until(() => qa("source-row").length === 1);
    expect(q("attention-fix")!.textContent).toBe("Keep 1988");
    expect(text("source-status")).toBe("Year differs from Crossref");
    q("attention-fix")!.focus();
    await click(q("attention-fix")!);
    await until(() => text("source-status") === "Checked");
    // The button is gone with its item: the focus is on the paper's row, not lost to the page.
    await settle(20);
    expect(document.activeElement).toBe(q("source-row"));
    await leave();
    expect((await stored<StoredEntry[]>("citations"))![0]!.ack).toEqual(["year"]);

    // A reload: nothing is held from before, the blobs are read again.
    heldBlobs.clear();
    mount(<CitationsTab />);
    await until(() => qa("source-row").length === 1);
    expect(text("source-status")).toBe("Checked");
    expect(qa("attention-item")).toHaveLength(0);
    await leave();
    mount(<ProjectHome />);
    await until(() => text("home-detail-lit").includes("Papers kept: 1"));
    await settle(60);
    expect(q("home-attention")).toBeNull();
  });

  it("Check now (the home's 'not checked' item) runs the Crossref check; when it finishes it says nothing but the item leaves; a check that reached nothing keeps v1's toast and the item stays", async () => {
    server.putPlain("citations", [SCHAEFER, COHEN]);
    server.putPlain("refcheck_cache", answer(SCHAEFER, ok()));
    mount(<ProjectHome />);
    await until(() => !!q("home-attention"));
    expect(qa("attention-text").map((x) => x.textContent)).toEqual(["1 source has not been checked against Crossref."]);
    expect(q("attention-fix")!.textContent).toBe("Check now");

    // No network: v1's error toast, and the item is still there.
    await click(q("attention-fix")!);
    await until(() => h.toast.mock.calls.some((c) => c[0] === E.rc_fail), "the error toast");
    expect(h.toast.mock.calls.map((c) => c[0])).toEqual([E.rc_busy, E.rc_fail]);
    expect(qa("attention-text")).toHaveLength(1);

    // Crossref answers: Cohen's reprint is a year apart, so the list now has the difference, and no toast says the check is done.
    h.toast.mockReset();
    resetCheckBusy();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: { title: ["Statistical power analysis for the behavioral sciences"], issued: { "date-parts": [[1988]] }, author: [{ family: "Cohen" }], DOI: "10.4324/9780203771587", type: "book" } }), { status: 200, headers: { "content-type": "application/json" } })));
    await click(q("attention-fix")!);
    await until(() => !q("home-attention"), "the card leaving");
    expect(h.toast.mock.calls.map((c) => c[0])).toEqual([E.rc_busy]);
    await leave();
    expect(Object.keys((await stored<RefCheckCache>("refcheck_cache"))!).sort()).toEqual([citKey(COHEN), citKey(SCHAEFER)].sort());
  });
});

describe("Merge the two (ruling B2-R29)", () => {
  const KEPT: StoredEntry = { pid: "ka", type: "Book", author: "", year: "1988", title: "Statistical power analysis for the behavioral sciences", doi: "10.4324/9780203771587", rl: true };
  const DROPPED: StoredEntry = { pid: "kb", type: "Book", author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences, second edition", doi: "10.4324/9780203771587", rl: true };
  const OTHER: StoredEntry = { ...SCHAEFER };

  it("from the home: one pid is left, the notes move, the reading list points at the kept paper, the dropped paper's answer goes, and the home reads again", async () => {
    server.putPlain("citations", [KEPT, DROPPED, OTHER]);
    const index: ShelfIndex = [{ id: "s1", title: "Cohen pdf", file: "c.pdf", size: 1, added: "2026-01-01", total: 1, kept: 1, pid: "kb" }];
    server.putPlain("shelf_index", index);
    const notes: ApNotes = {
      "p:ka": { pid: "ka", stages: { design: { mine: "Kept words." } }, card: {} },
      "p:kb": { pid: "kb", stages: { design: { mine: "Dropped words." } }, card: { verdict: "Solid." } }
    };
    server.putPlain("ap_notes", notes);
    server.putPlain("refcheck_cache", {
      ...answer(KEPT, { s: "diff", m: [{ k: "author", v: "Cohen" }], miss: ["author"], f: { title: "x", year: 1988, author: "Cohen", doi: "", authors: "Cohen, Jacob" }, t: 1 }),
      ...answer(DROPPED, ok()), ...answer(OTHER, ok())
    });
    mount(<ProjectHome />);
    await until(() => !!q("home-attention"));
    await until(() => text("home-detail-lit").includes("Papers kept: 3"));
    const merge = qa("attention-item").find((i) => i.dataset.kind === "duplicate")!;
    expect(merge.querySelector('[data-testid="attention-text"]')!.textContent).toBe("1988: statistical power analysis for is in your library twice.");
    expect(merge.querySelector("button")!.textContent).toBe("Merge the two");
    await click(merge.querySelector("button")!);
    // The home reads everything again: one paper fewer, and nothing about the pair is listed.
    await until(() => text("home-detail-lit").includes("Papers kept: 2"), "the home reading again");
    await settle(60);
    expect(qa("attention-item").filter((i) => i.dataset.kind === "duplicate")).toHaveLength(0);
    expect(q("home-attention")).toBeNull();
    await leave();

    const lib = (await stored<StoredEntry[]>("citations"))!;
    expect(lib.map((e) => e.pid)).toEqual(["ka", "kschaefer"]);
    expect(lib[0]!.author).toBe("Cohen, J.");
    expect((await stored<ShelfIndex>("shelf_index"))!.map((x) => x.pid)).toEqual(["ka"]);
    const merged = (await stored<ApNotes>("ap_notes"))!;
    expect(merged["p:ka"]!.stages.design!.mine).toBe("Kept words.\n\nDropped words.");
    expect(merged["p:kb"]!.movedTo).toBe("p:ka");
    const cache = (await stored<RefCheckCache>("refcheck_cache"))!;
    expect(Object.keys(cache).sort()).toEqual([citKey(lib[0]!), citKey(OTHER)].sort());
    expect(cache[citKey(DROPPED)]).toBeUndefined();
  });
});
