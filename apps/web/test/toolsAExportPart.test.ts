import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { budgetMarkdown, ctriMarkdown, piCvText } from "@appuscholar/core";
import { exportProject, EXPORT_PARTS, type ExportDeps, type ProjectExportDeps } from "../lib/export/projectExport";
import { exportPartList } from "../lib/export/moduleParts";
import { VaultError } from "../lib/vault/crypto";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";
import en from "../messages/en.json";
import { exportParts } from "../components/tools/design";

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
const t = (k: string) => k;

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

  it("a blob that does not open is left out and the rest still export; a locked vault rejects", async () => {
    const corrupt = new VaultError("corrupt");
    const files = await part().build(deps(BLOBS_FULL, { readBlob: async (k) => { if (k === "design_pi") throw corrupt; return JSON.stringify(BLOBS_FULL[k]); } }));
    expect(files.map((f) => f.path)).toEqual(["design/ctri-readiness.md", "design/trial-budget.md"]);
    // A blob that is not of its kind's shape is left out as well.
    expect((await part().build(deps(BLOBS_FULL, { readBlob: async (k) => (k === "design_budget" ? "[1,2]" : JSON.stringify(BLOBS_FULL[k])) }))).map((f) => f.path)).toEqual(["design/ctri-readiness.md", "design/pi-cv.txt"]);
    await expect(part().build(deps(BLOBS_FULL, { readBlob: async () => { throw new Error("vault-locked"); } }))).rejects.toThrow("vault-locked");
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
