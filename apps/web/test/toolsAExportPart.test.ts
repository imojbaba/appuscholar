import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetMarkdown, ctriMarkdown, piCvText } from "@appuscholar/core";
import { exportProject, EXPORT_PARTS, type ExportDeps, type ProjectExportDeps } from "../lib/export/projectExport";
import { exportPartList } from "../lib/export/moduleParts";
import { VaultError } from "../lib/vault/crypto";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";
import en from "../messages/en.json";
import { exportParts } from "../components/tools/design";
import { datedName } from "../lib/tools/design/files";
import { localDay } from "../lib/vault/export";

/*
 * Task A3: the three files of Design and ethics also join the project export (Task G3's ExportPartDef). One part, `design`, builds
 * design/ctri-readiness.md, design/pi-cv.txt and design/trial-budget.md from the project's three blobs with the same core functions the
 * tabs' downloads use. A blob never filled leaves its file out.
 */

const GOLDEN = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/design/cases.json"), "utf8")) as {
  ctri: Array<{ id: string; checks: Record<string, boolean>; text: string }>;
  budget: Array<{ id: string; stored: Array<{ label: string; amount: string }> | null; rows: Array<{ label: string; amount: string }>; text: string }>;
};
const NOW = new Date(2026, 9, 21, 14, 30);
const CTRI = GOLDEN.ctri.find((c) => c.id === "some")!;
const BUDGET = GOLDEN.budget.find((c) => c.id === "indian-total-1234567")!;
const BLOBS_FULL: Record<string, unknown> = {
  design_ctri: { checklist: CTRI.checks, done: true },
  design_pi: { checklist: { 1: true }, cv: "Dr A. Rao\nPhD, Psychology", done: true },
  design_budget: { rows: BUDGET.stored, done: true }
};
const t = (k: string, v?: Record<string, string | number>) => (v ? k + JSON.stringify(v) : k);

function deps(blobs: Record<string, unknown>, over: Partial<ExportDeps> = {}): ExportDeps {
  return {
    project: { id: "p1", title: "Study", titleKeyVersion: 0, deks: [] }, t,
    listDocuments: async () => [], getDocument: async () => { throw new Error("none"); }, decrypt: async () => "",
    openTitle: async (x) => ({ state: "open", text: x.title }),
    readBlob: async (kind) => (kind in blobs ? JSON.stringify(blobs[kind]) : null),
    writingRecord: async () => { throw new Error("none"); }, aiUseLog: async () => [],
    now: NOW, ...over
  } as ExportDeps;
}
const part = () => exportParts[0]!;
const read = async (b: string | Blob) => (typeof b === "string" ? b : await new Response(b).text());

describe("the design export part (Task A3)", () => {
  it("is one part, with an id of its own and keys that exist in English and Hindi", () => {
    expect(exportParts).toHaveLength(1);
    const p = part();
    expect(p.part).toBe("design");
    expect(EXPORT_PARTS as readonly string[]).not.toContain(p.part);
    const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
    for (const k of [p.labelKey, p.detailKey, p.formatKey]) expect(E[k], k).toBeTruthy();
    for (const k of [p.labelKey, p.detailKey]) expect((designHi as Record<string, string>)[k], k).toBeTruthy();
    expect(typeof p.ticked).toBe("boolean");
  });

  it("is listed with the module parts, and passes moduleParts' validation (no built-in id, no duplicate)", () => {
    const list = exportPartList();
    expect(list.filter((x) => typeof x !== "string" && x.part === "design")).toHaveLength(1);
    expect(() => exportPartList()).not.toThrow();
  });

  it("with the three blobs filled, build() returns exactly the three files under design/ with core's bodies", async () => {
    const files = await part().build(deps(BLOBS_FULL));
    expect(files.map((f) => f.path)).toEqual(["design/ctri-readiness.md", "design/pi-cv.txt", "design/trial-budget.md"]);
    const bodies = await Promise.all(files.map((f) => read(f.data)));
    expect(bodies[0]).toBe(CTRI.text);
    expect(bodies[0]).toBe(ctriMarkdown(CTRI.checks as unknown as Record<number, boolean>));
    expect(bodies[1]).toBe(piCvText("Dr A. Rao\nPhD, Psychology"));
    expect(bodies[1]).toBe("Dr A. Rao\nPhD, Psychology");
    expect(bodies[2]).toBe(BUDGET.text);
    expect(bodies[2]).toBe(budgetMarkdown(BUDGET.rows));
  });

  it("with none filled, build() returns nothing", async () => {
    expect(await part().build(deps({}))).toEqual([]);
  });

  it("a blob never filled leaves its file out: each alone, and empty ones", async () => {
    const only = async (k: string) => (await part().build(deps({ [k]: BLOBS_FULL[k] }))).map((f) => f.path);
    expect(await only("design_ctri")).toEqual(["design/ctri-readiness.md"]);
    expect(await only("design_pi")).toEqual(["design/pi-cv.txt"]);
    expect(await only("design_budget")).toEqual(["design/trial-budget.md"]);
    // Opened but with nothing in it: ticks never touched, no cv, no rows.
    expect(await part().build(deps({ design_ctri: { done: false }, design_pi: { checklist: { 1: true }, cv: "", done: true }, design_budget: { rows: [], done: false } }))).toEqual([]);
    // A checklist the student ticked and unticked is still a checklist that was filled in: v1 would export it.
    expect((await part().build(deps({ design_ctri: { checklist: { 0: false }, done: false } }))).map((f) => f.path)).toEqual(["design/ctri-readiness.md"]);
  });

  it("a blob that does not open, or is not of its shape, is left out and named in design/unreadable.txt; the rest still export; a locked vault rejects", async () => {
    const corrupt = new VaultError("corrupt");
    const files = await part().build(deps(BLOBS_FULL, { readBlob: async (k) => { if (k === "design_pi") throw corrupt; return JSON.stringify(BLOBS_FULL[k]); } }));
    expect(files.map((f) => f.path)).toEqual(["design/ctri-readiness.md", "design/trial-budget.md", "design/unreadable.txt"]);
    // The words are the export's own (exp_unreadable_head and exp_unreadable_data), naming the piece by its row label.
    expect(files.at(-1)!.data).toBe('exp_unreadable_head\n\nexp_unreadable_data{"name":"design_row_pi"}\n');
    // A blob that is not of its kind's shape is named as well, with the others in the order the files are made.
    const wrong = await part().build(deps(BLOBS_FULL, { readBlob: async (k) => (k === "design_budget" || k === "design_ctri" ? "[1,2]" : JSON.stringify(BLOBS_FULL[k])) }));
    expect(wrong.map((f) => f.path)).toEqual(["design/pi-cv.txt", "design/unreadable.txt"]);
    expect(wrong.at(-1)!.data).toBe('exp_unreadable_head\n\nexp_unreadable_data{"name":"design_row_ctri"}\nexp_unreadable_data{"name":"design_row_budget"}\n');
    // Nothing lost, no file; a blob the project never had is not "lost".
    expect((await part().build(deps(BLOBS_FULL))).map((f) => f.path)).not.toContain("design/unreadable.txt");
    expect(await part().build(deps({}))).toEqual([]);
    await expect(part().build(deps(BLOBS_FULL, { readBlob: async () => { throw new Error("vault-locked"); } }))).rejects.toThrow("vault-locked");
  });

  it("the export's own unreadable.txt is not touched: a module's lost blob joins the zip as design/unreadable.txt beside it", async () => {
    const base = deps({ ...BLOBS_FULL, design_ctri: undefined }, { readBlob: async (k) => (k === "design_ctri" ? "not json" : k in BLOBS_FULL ? JSON.stringify(BLOBS_FULL[k]) : null) }) as ProjectExportDeps;
    const zip = await JSZip.loadAsync(await exportProject(base, [part()], { style: "apa", now: NOW, lastSearch: null }));
    expect(Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort()).toEqual(["design/pi-cv.txt", "design/trial-budget.md", "design/unreadable.txt"]);
  });

  it("the zip holds the three files under design/ when the part is ticked, and nothing of it when it is not", async () => {
    const progress = vi.fn();
    const base = deps(BLOBS_FULL) as ProjectExportDeps;
    const zip = await JSZip.loadAsync(await exportProject(base, [part()], { style: "apa", now: NOW, lastSearch: null, progress }));
    expect(Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort()).toEqual(["design/ctri-readiness.md", "design/pi-cv.txt", "design/trial-budget.md"]);
    expect(await zip.file("design/trial-budget.md")!.async("string")).toBe(BUDGET.text);
    expect(progress.mock.calls.map((c) => c[0])).toEqual(["design"]);
    const none = await JSZip.loadAsync(await exportProject(base, [], { style: "apa", now: NOW, lastSearch: null }));
    expect(Object.keys(none.files).filter((n) => !none.files[n]!.dir)).toEqual([]);
  });
});

describe("the download's date is the local day (Task A3 fix round 1)", () => {
  const was = process.env.TZ;
  beforeEach(() => { process.env.TZ = "Asia/Kolkata"; });
  afterEach(() => { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; });

  it("20:00 UTC on 21 October is 01:30 on the 22nd in India: the name carries the 22nd, which a UTC date would not", () => {
    const at = new Date("2026-10-21T20:00:00Z");
    expect(at.toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(localDay(at)).toBe("2026-10-22");
    expect(datedName("ctri", at)).toBe("ctri-readiness-2026-10-22.md");
    expect(datedName("pi", at)).toBe("pi-cv-2026-10-22.txt");
    expect(datedName("budget", at)).toBe("trial-budget-2026-10-22.md");
    expect(datedName("budget", at)).not.toContain(at.toISOString().slice(0, 10));
  });
});
