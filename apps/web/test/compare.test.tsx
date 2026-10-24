// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { AP_COLS, buildGapFinderPromptV2, buildLitReviewPrompt, fieldLabel, SHELF_DEFAULT_COLS } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";
import { createBlobServer, fakeVault, unlock, type FakeVault, type Server } from "./support/blobServer";
import { generateVaultKey } from "../lib/vault/crypto";

/*
 * Compare (wave B Task 22, register row D-S2-128; canvas Compare): one table of the kept papers whose cells are the student's own words (the matrix columns, then the paper card's
 * fields) and, beside it, "Write from these papers" (Draft a paragraph, Find the gap). The blobs are the real clients over a fake api that keeps versions, as the server does;
 * the vault is a real one (fakeVault), so a locked vault is tested for what it does to a save.
 */

const h = vi.hoisted(() => ({
  api: vi.fn(), vault: null as unknown, toast: vi.fn(), callAI: vi.fn(), openExport: vi.fn(),
  editor: null as unknown, inserts: [] as Array<{ type: string; ai: string } | undefined>
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" }, settings: { field: "education" } }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({
    project: { id: "p1" }, projectId: "p1", openExport: h.openExport,
    requestInsert: async (run: (e: never) => void, message?: { type: string; ai: string }) => {
      h.inserts.push(message);
      run(h.editor as never);
      return true;
    }
  })
}));

import { CompareTab } from "../components/literature/CompareTab";
import { resetCompareAi } from "../lib/papers/compareAi";
import {
  CARD_FIELDS, cardColsOf, compareCsv, compareTable, rsPaperFromEntry, STAGE_FIELDS, stageColsOf, toggleCardCol, toggleStageCol
} from "../lib/papers/compare";
import { papersOf } from "../lib/papers/list";
import { exportProject } from "../lib/export/projectExport";
import { resetBrokenAnswers } from "../lib/analyse/notes";
import { heldBlobs } from "../lib/blobs/held";
import type { ApNotes, ShelfIndex, StoredEntry } from "../lib/blobs/kinds";
import { tFormat } from "../lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => tFormat(E, E, k, "en", v);

// ---------------------------------------------------------------- the papers

const ABS_SCHAEFER = "Students sat an exam after two weeks of open-label placebo pills. Test anxiety fell more than in a no-pill group.";
const ABS_PUTWAIN = "An overview of how examination stress harms wellbeing and grades in school and university students.";
const SCHAEFER: StoredEntry = { author: "Schaefer, C.; Denke, C.; Harke, H.", year: "2019", title: "Open-label placebos reduce test anxiety and improve self-management skills", doi: "10.1038/s41598-019-49466-6", pid: "ka", rl: true, abstract: ABS_SCHAEFER, source: "Scientific Reports" };
const PUTWAIN: StoredEntry = { author: "Putwain, D.", year: "2008", title: "Examination stress and test anxiety", pid: "kb", rl: true, abstract: ABS_PUTWAIN };
const KIECOLT: StoredEntry = { author: "", year: "2011", title: "Omega-3 supplementation lowers inflammation and anxiety", pid: "kc", rl: true };
const COHEN: StoredEntry = { author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences", type: "Book", pid: "kd", rl: true };
const LIB = [SCHAEFER, PUTWAIN, KIECOLT, COHEN];
const SHELF: ShelfIndex = [
  { id: "s1", title: SCHAEFER.title!, file: "schaefer.pdf", size: 10, added: "2026-01-01T00:00:00.000Z", total: 2, kept: 2, pid: "ka", doi: SCHAEFER.doi },
  { id: "s2", title: "Loose PDF", file: "loose.pdf", size: 10, added: "2026-02-01T00:00:00.000Z", total: 2, kept: 2, pid: "kx" }
];
const NOTES: ApNotes = {
  "p:ka": {
    title: SCHAEFER.title, pid: "ka", stages: { design: { mine: "Two groups, pills or no pills" }, sample: { mine: "58 first-year students" } },
    card: { strengths: "Control group; real exam" }, cells: { Sample: "58 university students", Method: "Randomised trial" }
  },
  "p:kb": { title: PUTWAIN.title, pid: "kb", stages: { gap: { mine: "Background only." }, design: { mine: "A review, not an experiment" } }, card: { verdict: "Background for the introduction" }, cells: {} },
  // An old note that moved to p:ka: it is the same paper and is never listed or shown twice.
  aopenlabelplacebos2034: { title: SCHAEFER.title, stages: {}, card: { strengths: "OLD TEXT" }, movedTo: "p:ka" }
};
const SHORT = {
  ka: "Schaefer et al., 2019: open-label placebos reduce test", kb: "Putwain, 2008: examination stress and test", kc: "2011: omega-3 supplementation lowers inflammation",
  kd: "Cohen, 1988: statistical power analysis for", kx: "Loose PDF"
};
/** The walk-through columns (Across's four by default, ruling B2-R40) sit between the matrix columns and the card fields. */
const STAGE_HEADS = ["Design", "Sample", "Measures", "Statistics"];
const MATRIX_HEADS = ["Sample", "Method", "Key finding"];
const CARD_HEADS = ["Strengths", "Weak points", "My verdict", "Notes"];
const HEADS = ["Paper", ...MATRIX_HEADS, ...STAGE_HEADS, ...CARD_HEADS];
const FROM_WALK = " (from your walk-through)";

// ---------------------------------------------------------------- the harness

let server: Server;
let vault: FakeVault;
const roots: Root[] = [];
const editors: Editor[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel));
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tids = (id: string) => $$(`[data-testid="${id}"]`);
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function until(pred: () => boolean | Promise<boolean>, what = "condition") {
  for (let i = 0; i < 500; i++) { if (await pred()) return; await settle(10); }
  throw new Error(what + " not reached");
}
async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<CompareTab />); });
  await settle(20);
  return { root, rerender: () => act(async () => { root.render(<CompareTab />); }), unmount: () => { act(() => { root.unmount(); }); roots.splice(roots.indexOf(root), 1); } };
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLElement, value: string) {
  act(() => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** A fresh server with the canvas's kept papers; a test seeds more, or less, before it mounts. */
function seed(over: { lib?: StoredEntry[]; shelf?: ShelfIndex; notes?: ApNotes | null } = {}) {
  server.putPlain("citations", over.lib ?? LIB);
  server.putPlain("shelf_index", over.shelf ?? SHELF);
  if (over.notes !== null) server.putPlain("ap_notes", over.notes ?? NOTES);
}
const rowOf = (pidOrShort: string) => tids("cmp-row").find((r) => r.textContent!.includes(pidOrShort in SHORT ? SHORT[pidOrShort as keyof typeof SHORT] : pidOrShort))!;
const cell = (row: HTMLElement, col: string) => row.querySelector<HTMLTextAreaElement>(`textarea[aria-label$=", ${col}"]`)!;
/** A walk-through box: its label says where its words come from, so it is told apart from a matrix column of the same name (W19). */
const stageCell = (row: HTMLElement, col: string) => row.querySelector<HTMLTextAreaElement>(`textarea[aria-label$=", ${col}${FROM_WALK}"]`)!;
const valuesOf = (row: HTMLElement) => [...row.querySelectorAll("textarea")].map((x) => x.value);
const stored = <T,>(kind: string) => server.value<T>(kind);
const tickFor = (short: string) => tids("cmp-tick").find((c) => c.closest("label")!.textContent!.includes(short)) as HTMLInputElement;
const heads = () => tids("cmp-col-head").map((x) => x.querySelector(".cmp-col-name")!.textContent!.trim());

beforeEach(async () => {
  server = createBlobServer("p1");
  vault = await fakeVault({ status: "off" });
  h.vault = vault;
  h.api.mockReset().mockImplementation(server.api);
  h.toast.mockReset();
  h.callAI.mockReset().mockResolvedValue("Draft text.");
  h.openExport.mockReset();
  h.inserts.length = 0;
  heldBlobs.clear();
  resetBrokenAnswers();
  resetCompareAi();
  const ed = new Editor({ extensions: editorExtensions, content: "<p>My introduction.</p>" });
  editors.push(ed);
  h.editor = ed;
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- the table

describe("Compare: the table", () => {
  it("one table joins matrix cells and card fields by paper id", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(heads()).toEqual(HEADS);
    // Every kept paper is a row, in the Reading list's order: the library's four, then the PDF no kept paper took.
    expect(tids("cmp-paper").map((x) => x.textContent)).toEqual([SHORT.ka, SHORT.kb, SHORT.kc, SHORT.kd, SHORT.kx]);
    // The matrix cells, then the walk-through answers (the note's stages, read-only), then the card fields.
    expect(valuesOf(rowOf("ka"))).toEqual(["58 university students", "Randomised trial", "", "Two groups, pills or no pills", "58 first-year students", "", "", "Control group; real exam", "", "", ""]);
    // Another paper's note is its own: the card of Putwain is in Putwain's row, and the old note that moved to p:ka shows nowhere.
    expect(valuesOf(rowOf("kb"))).toEqual(["", "", "", "A review, not an experiment", "", "", "", "", "", "Background for the introduction", ""]);
    expect($("[data-testid=compare-tab]")!.textContent).not.toContain("OLD TEXT");
    expect(tid("cmp-table")!.closest(".cmp-scroll")).not.toBeNull();
  });

  it("every cell is labelled with its paper and column (W19)", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    const labels = tids("cmp-cell").map((x) => x.getAttribute("aria-label")!);
    expect(labels).toHaveLength(5 * 11);
    // Unique, even though the matrix has a column called Sample and so has the walk-through: the walk-through's says where its words come from.
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toBe(SHORT.ka + ", Sample");
    expect(labels[3]).toBe(SHORT.ka + ", Design" + FROM_WALK);
    expect(labels[4]).toBe(SHORT.ka + ", Sample" + FROM_WALK);
    expect(labels.at(-1)).toBe(SHORT.kx + ", Notes");
    const named = [...MATRIX_HEADS, ...STAGE_HEADS.map((c) => c + FROM_WALK), ...CARD_HEADS];
    for (const r of tids("cmp-row")) {
      const short = r.querySelector('[data-testid="cmp-paper"]')!.textContent!;
      expect([...r.querySelectorAll("textarea")].map((x) => x.getAttribute("aria-label"))).toEqual(named.map((c) => short + ", " + c));
    }
    // The row's name is its header, and each column's heading is a column header.
    expect(tids("cmp-paper")[0]!.tagName).toBe("TH");
    expect(tids("cmp-paper")[0]!.getAttribute("scope")).toBe("row");
    expect(tids("cmp-col-head")[0]!.getAttribute("scope")).toBe("col");
  });

  it("a paper with no cells and no note is listed, and its first cell is written to its own note, with stages and card (R24, R11)", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    // Kiecolt has no note at all; Cohen is a book with none either.
    expect(valuesOf(rowOf("kc"))).toEqual(Array(11).fill(""));
    typeIn(cell(rowOf("kc"), "Method"), "Survey");
    await until(async () => (await stored<ApNotes>("ap_notes"))?.["p:kc"] !== undefined, "the first cell's save");
    const notes = (await stored<ApNotes>("ap_notes"))!;
    expect(notes["p:kc"]).toEqual({ stages: {}, card: {}, title: KIECOLT.title, pid: "kc", cells: { Method: "Survey" } });
    // The other notes are as they were, the moved one included.
    expect(notes["p:ka"]).toEqual(NOTES["p:ka"]);
    expect(notes.aopenlabelplacebos2034).toEqual(NOTES.aopenlabelplacebos2034);
  });

  it("a card field is written to card[field] of the paper's note and a cell to cells[column], leaving the paper's other words alone", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    typeIn(cell(rowOf("kb"), "Weak points"), "Self-report only.");
    typeIn(cell(rowOf("kb"), "Key finding"), "Exam stress harms grades");
    await until(async () => (await stored<ApNotes>("ap_notes"))?.["p:kb"]?.card.weak === "Self-report only.", "the save");
    expect((await stored<ApNotes>("ap_notes"))!["p:kb"]).toEqual({
      ...NOTES["p:kb"], card: { verdict: "Background for the introduction", weak: "Self-report only." }, cells: { "Key finding": "Exam stress harms grades" }
    });
  });

  it("two PDFs of one paper are one row, and a paper that has no id yet cannot be written to", async () => {
    seed({ shelf: [...SHELF, { id: "s3", title: "Schaefer again", file: "again.pdf", size: 1, added: "2026-03-01T00:00:00.000Z", total: 1, kept: 1, pid: "ka" }], lib: [...LIB, { author: "Lee, K.", year: "2020", title: "A paper the migration has not reached", rl: true }] });
    await mount();
    await until(() => tids("cmp-row").length > 0, "the rows");
    expect(tids("cmp-paper").filter((x) => x.textContent === SHORT.ka)).toHaveLength(1);
    const noId = tids("cmp-row").find((r) => r.textContent!.includes("Lee, 2020"))!;
    expect(noId.querySelectorAll("textarea")).toHaveLength(11);
    expect([...noId.querySelectorAll("textarea")].every((x) => x.readOnly)).toBe(true);
  });

  it("a 409 replays the cell onto the newer notes, and the other window's note survives", async () => {
    seed();
    let raced = false;
    server.onPut = async (kind) => {
      if (kind !== "ap_notes" || raced) return;
      raced = true;
      server.putPlain("ap_notes", { ...NOTES, "p:kz": { title: "Written elsewhere", stages: {}, card: {}, cells: { Sample: "12" } } });
    };
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    typeIn(cell(rowOf("kd"), "Notes"), "A classic.");
    await until(async () => (await stored<ApNotes>("ap_notes"))?.["p:kd"] !== undefined, "the replayed save");
    const notes = (await stored<ApNotes>("ap_notes"))!;
    expect(notes["p:kd"]!.card).toEqual({ notes: "A classic." });
    expect(notes["p:kz"]!.cells).toEqual({ Sample: "12" });
    expect(h.toast).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- the columns

describe("Compare: the card columns and Choose columns (R25)", () => {
  it("all four card fields show when ap_cols has nothing, or is core's default list", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(heads().slice(8)).toEqual(CARD_HEADS);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    server.putPlain("ap_cols", ["design", "sample", "measures", "stats", "verdict"]);
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows again");
    expect(heads().slice(8)).toEqual(CARD_HEADS);
  });

  it("an ap_cols list shows the card fields among its keys, in the card's order", async () => {
    seed();
    server.putPlain("ap_cols", ["design", "notes", "strengths"]);
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(heads()).toEqual(["Paper", ...MATRIX_HEADS, "Design", "Strengths", "Notes"]);
    expect(cell(rowOf("ka"), "Strengths").value).toBe("Control group; real exam");
  });

  it("Choose columns edits both lists: the card fields in ap_cols, the matrix columns in shelf_cols", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(tid("cmp-cols")).toBeNull();
    await click(tid("cmp-choose"));
    expect(tid("cmp-choose")!.getAttribute("aria-expanded")).toBe("true");
    expect(tid("cmp-cols")).not.toBeNull();
    // Take Weak points out: ap_cols is stored with the other three card fields and the four walk-through columns the table was showing.
    const weak = $('[data-testid="cmp-card-col-weak"]') as HTMLInputElement;
    expect(weak.checked).toBe(true);
    await click(weak);
    await until(async () => (await stored<string[]>("ap_cols")) !== null, "ap_cols saved");
    expect(await stored<string[]>("ap_cols")).toEqual(["design", "sample", "measures", "stats", "strengths", "verdict", "notes"]);
    expect(heads().slice(8)).toEqual(["Strengths", "My verdict", "Notes"]);
    // A column of the student's own: added to the defaults, then the first one removed.
    typeIn(tid("cmp-col-name")!, "  Sample size ");
    await click(tid("cmp-col-add"));
    await until(async () => (await stored<string[]>("shelf_cols")) !== null, "shelf_cols saved");
    expect(await stored<string[]>("shelf_cols")).toEqual([...SHELF_DEFAULT_COLS, "Sample size"]);
    expect(heads().slice(0, 5)).toEqual(["Paper", ...MATRIX_HEADS, "Sample size"]);
    await click(tids("cmp-col-del")[0]!);
    await until(async () => ((await stored<string[]>("shelf_cols")) ?? []).length === 3, "the column removed");
    expect(await stored<string[]>("shelf_cols")).toEqual(["Method", "Key finding", "Sample size"]);
    expect(heads()).toEqual(["Paper", "Method", "Key finding", "Sample size", ...STAGE_HEADS, "Strengths", "My verdict", "Notes"]);
    // A cell typed in the new column goes to cells["Sample size"] of the paper.
    typeIn(cell(rowOf("ka"), "Sample size"), "58");
    await until(async () => (await stored<ApNotes>("ap_notes"))?.["p:ka"]?.cells?.["Sample size"] === "58", "the cell's save");
    expect((await stored<ApNotes>("ap_notes"))!["p:ka"]!.cells).toEqual({ Sample: "58 university students", Method: "Randomised trial", "Sample size": "58" });
  });

  it("the card-field helpers leave the stage keys exactly as the student chose them, and never store a list that would read as something else (B2-R25, B2-R40)", () => {
    expect(CARD_FIELDS).toEqual(["strengths", "weak", "verdict", "notes"]);
    expect(cardColsOf(undefined)).toEqual([...CARD_FIELDS]);
    expect(cardColsOf([])).toEqual([...CARD_FIELDS]);
    expect(cardColsOf(["design", "sample", "measures", "stats", "verdict"])).toEqual([...CARD_FIELDS]);
    expect(cardColsOf(["verdict", "design"])).toEqual(["verdict"]);
    expect(cardColsOf(["design"])).toEqual([]);
    expect(cardColsOf(["notes", "weak"])).toEqual(["weak", "notes"]);
    // From nothing stored the list is written out as it reads (the four stage columns and all four card fields), then the one field is taken out; the stage keys are untouched.
    expect(toggleCardCol(undefined, "weak", false)).toEqual(["design", "sample", "measures", "stats", "strengths", "verdict", "notes"]);
    expect(toggleCardCol(["design", "sample", "measures", "stats", "verdict"], "notes", false)).toEqual(["design", "sample", "measures", "stats", "strengths", "weak", "verdict"]);
    // Every key it stores except "notes" is one of core's AP_COLS keys.
    const keys = new Set(AP_COLS.map(([k]) => k));
    expect(toggleCardCol(undefined, "notes", false)!.every((k) => keys.has(k))).toBe(true);
    // A field goes in its place, and a list a student chose by hand keeps its order and the keys it has (a stage the student did not choose is never added).
    expect(toggleCardCol(["design", "verdict"], "weak", true)).toEqual(["design", "weak", "verdict"]);
    expect(toggleCardCol(["strengths"], "notes", true)).toEqual(["strengths", "notes"]);
    expect(toggleCardCol(["results", "design", "strengths"], "weak", true)).toEqual(["results", "design", "strengths", "weak"]);
    expect(toggleCardCol(["results", "design", "strengths"], "strengths", false)).toEqual(["results", "design"]);
    // A last card field taken out of a list that has stage columns leaves the stage columns, and no card field.
    expect(toggleCardCol(["results", "strengths"], "strengths", false)).toEqual(["results"]);
    expect(cardColsOf(["results"])).toEqual([]);
    // Two results cannot be told from "nothing chosen" when read back, so they are not stored (the caller keeps the list as it was): nothing left at all ([] reads as the defaults), and the
    // four default stage columns with only My verdict (that list is core's default list, which reads as all four card fields).
    expect(toggleCardCol(["strengths"], "strengths", false)).toBeNull();
    expect(toggleCardCol(["design", "sample", "measures", "stats", "strengths", "verdict"], "strengths", false)).toBeNull();
    expect(toggleStageCol(["design"], "design", false)).toBeNull();
    // The default list is "nothing chosen yet": a toggle writes out what it shows (all four card fields) before it changes the one.
    expect(toggleStageCol(["design", "sample", "measures", "stats", "verdict"], "stats", true)).toEqual(["design", "sample", "measures", "stats", "strengths", "weak", "verdict", "notes"]);
  });

  it("the walk-through helpers: the stage keys as Across chose them, ticked and unticked in place, the card fields untouched", () => {
    expect(STAGE_FIELDS).toEqual(["design", "sample", "measures", "stats", "results", "limits"]);
    // Across's reading of the list (core's apAcrossCols): the default list when nothing is stored, the stored keys in the stored order otherwise, keys outside AP_COLS dropped.
    expect(stageColsOf(null)).toEqual(["design", "sample", "measures", "stats"]);
    expect(stageColsOf([])).toEqual(["design", "sample", "measures", "stats"]);
    expect(stageColsOf("not a list")).toEqual(["design", "sample", "measures", "stats"]);
    expect(stageColsOf(["verdict", "results", "bogus", "design", "limits"])).toEqual(["results", "design", "limits"]);
    expect(stageColsOf(["verdict"])).toEqual([]);
    expect(stageColsOf(["x", "y"])).toEqual([]);
    // From nothing stored: written out as it reads, then the one stage is taken out or put in; the card fields stay all four.
    expect(toggleStageCol(undefined, "design", false)).toEqual(["sample", "measures", "stats", "strengths", "weak", "verdict", "notes"]);
    expect(toggleStageCol(undefined, "results", true)).toEqual(["design", "sample", "measures", "stats", "results", "strengths", "weak", "verdict", "notes"]);
    // A chosen list keeps its card fields exactly.
    expect(toggleStageCol(["design", "verdict"], "limits", true)).toEqual(["design", "limits", "verdict"]);
    expect(toggleStageCol(["design", "verdict"], "design", false)).toEqual(["verdict"]);
    expect(cardColsOf(toggleStageCol(["design", "verdict"], "design", false))).toEqual(["verdict"]);
    // The last column of all cannot be taken out (that list is [], which reads as the defaults).
    expect(toggleStageCol(["design"], "design", false)).toBeNull();
  });

  it("what a toggle stores reads back as exactly what was asked, from every starting list; it is refused only where the list could not say it", () => {
    const starts: Array<string[] | null> = [
      null, [], ["design", "sample", "measures", "stats", "verdict"], ["verdict"], ["strengths"], ["design"], ["notes"], ["results", "limits"], ["design", "weak", "notes"],
      ["design", "sample", "measures", "stats", "strengths", "weak", "verdict", "notes"], ["verdict", "results", "design", "limits"]
    ];
    /** What no list can say: nothing chosen at all ([] reads as the defaults), and the default stage columns with only My verdict (core's default list reads as all four card fields). */
    const unsayable = (stages: Set<string>, cards: Set<string>) =>
      (stages.size === 0 && cards.size === 0) || (cards.size === 1 && cards.has("verdict") && ["design", "sample", "measures", "stats"].every((k) => stages.has(k)) && stages.size === 4);
    const check = (from: string[] | null, label: string, to: string[] | null, stages: Set<string>, cards: Set<string>) => {
      if (to === null) { expect(unsayable(stages, cards), label).toBe(true); return; }
      expect(unsayable(stages, cards), label).toBe(false);
      expect([...stageColsOf(to)].sort(), label).toEqual([...stages].sort());
      expect([...cardColsOf(to)].sort(), label).toEqual([...cards].sort());
    };
    for (const from of starts) {
      for (const on of [true, false]) {
        for (const k of STAGE_FIELDS) {
          const stages = new Set(stageColsOf(from)), cards = new Set(cardColsOf(from));
          if (on) stages.add(k); else stages.delete(k);
          check(from, JSON.stringify([from, "stage", k, on]), toggleStageCol(from, k, on), stages, cards);
        }
        for (const k of CARD_FIELDS) {
          const stages = new Set(stageColsOf(from)), cards = new Set(cardColsOf(from));
          if (on) cards.add(k); else cards.delete(k);
          check(from, JSON.stringify([from, "card", k, on]), toggleCardCol(from, k, on), stages, cards);
        }
      }
    }
  });
});

// ---------------------------------------------------------------- the walk-through side by side (B2-R40)

describe("Compare: the walk-through answers side by side (ruling B2-R40)", () => {
  it("shows each paper's walk-through answers after the matrix columns and before the card fields: four by default, read-only, each headed 'From your walk-through'", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(heads()).toEqual(HEADS);
    // Only the walk-through columns carry the note, and it is part of the heading a screen reader reads.
    const stageHeads = tids("cmp-col-head").slice(4, 8);
    expect(stageHeads.map((x) => x.querySelector(".cmp-col-note")?.textContent)).toEqual(Array(4).fill("From your walk-through"));
    expect(tids("cmp-col-head").filter((x) => x.querySelector(".cmp-col-note")).length).toBe(4);
    // The student's own answer from the note's stage, as Across read it; a stage the note has no words for is empty.
    expect(stageCell(rowOf("ka"), "Design").value).toBe("Two groups, pills or no pills");
    expect(stageCell(rowOf("ka"), "Sample").value).toBe("58 first-year students");
    expect(stageCell(rowOf("ka"), "Measures").value).toBe("");
    expect(stageCell(rowOf("kb"), "Design").value).toBe("A review, not an experiment");
    // Beside the matrix's own Sample cell, which is another box.
    expect(cell(rowOf("ka"), "Sample").value).toBe("58 university students");
    // Read-only everywhere, even for a paper that has an id, and a note about where to write them under the table.
    expect(tids("cmp-row").flatMap((r) => [...r.querySelectorAll("textarea")].slice(3, 7)).every((x) => x.readOnly)).toBe(true);
    expect(tids("cmp-row").flatMap((r) => [...r.querySelectorAll("textarea")].slice(0, 3)).every((x) => !x.readOnly)).toBe(true);
    expect(tid("cmp-stage-foot")!.textContent).toBe("The walk-through columns can be read here. Write them in Analyse a paper.");
  });

  it("typing in a walk-through box writes nothing", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    const box = stageCell(rowOf("ka"), "Design");
    typeIn(box, "Changed here");
    await settle(1200);
    expect(server.puts("ap_notes")).toHaveLength(0);
    expect(stageCell(rowOf("ka"), "Design").value).toBe("Two groups, pills or no pills");
    expect((await stored<ApNotes>("ap_notes"))!["p:ka"]!.stages).toEqual(NOTES["p:ka"]!.stages);
  });

  it("the stage columns are the ones Across chose: ap_cols' stage keys in the stored order, none when it holds none, the default four when it is empty", async () => {
    seed();
    server.putPlain("ap_cols", ["verdict", "results", "bogus", "design", "limits"]);
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(heads()).toEqual(["Paper", ...MATRIX_HEADS, "Results", "Design", "Limitations", "My verdict"]);
    expect(stageCell(rowOf("ka"), "Design").value).toBe("Two groups, pills or no pills");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    server.putPlain("ap_cols", ["verdict"]);
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows again");
    expect(heads()).toEqual(["Paper", ...MATRIX_HEADS, "My verdict"]);
    expect(tid("cmp-stage-foot")).toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    server.putPlain("ap_cols", []);
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows once more");
    expect(heads()).toEqual(HEADS);
  });

  it("Choose columns offers the six stages, ticked as the list holds them, and a tick stores the list with the card fields untouched", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    await click(tid("cmp-choose"));
    const box = (k: string) => $(`[data-testid="cmp-stage-col-${k}"]`) as HTMLInputElement;
    expect(STAGE_FIELDS.map((k) => box(k).checked)).toEqual([true, true, true, true, false, false]);
    expect(STAGE_FIELDS.map((k) => box(k).closest("label")!.textContent)).toEqual(["Design", "Sample", "Measures", "Statistics", "Results", "Limitations"]);
    await click(box("results"));
    await until(async () => (await stored<string[]>("ap_cols")) !== null, "ap_cols saved");
    // Written out from the defaults, Results put in its place; the four card fields are all there, as the table showed them.
    expect(await stored<string[]>("ap_cols")).toEqual(["design", "sample", "measures", "stats", "results", "strengths", "weak", "verdict", "notes"]);
    expect(heads()).toEqual(["Paper", ...MATRIX_HEADS, ...STAGE_HEADS, "Results", ...CARD_HEADS]);
    await click(box("design"));
    await until(async () => ((await stored<string[]>("ap_cols")) ?? []).length === 8, "Design taken out");
    expect(await stored<string[]>("ap_cols")).toEqual(["sample", "measures", "stats", "results", "strengths", "weak", "verdict", "notes"]);
    expect(heads()).toEqual(["Paper", ...MATRIX_HEADS, "Sample", "Measures", "Statistics", "Results", ...CARD_HEADS]);
    // A card field taken out now leaves the stage columns exactly as they are.
    await click($('[data-testid="cmp-card-col-notes"]'));
    await until(async () => ((await stored<string[]>("ap_cols")) ?? []).length === 7, "Notes taken out");
    expect(await stored<string[]>("ap_cols")).toEqual(["sample", "measures", "stats", "results", "strengths", "weak", "verdict"]);
    expect(heads()).toEqual(["Paper", ...MATRIX_HEADS, "Sample", "Measures", "Statistics", "Results", "Strengths", "Weak points", "My verdict"]);
  });

  it("a choice that cannot be stored is not stored, and the panel says so", async () => {
    seed();
    server.putPlain("ap_cols", ["strengths"]);
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    await click(tid("cmp-choose"));
    expect(tid("cmp-cols-refused")).toBeNull();
    const strengths = $('[data-testid="cmp-card-col-strengths"]') as HTMLInputElement;
    expect(strengths.checked).toBe(true);
    await click(strengths);
    expect(tid("cmp-cols-refused")!.textContent).toBe("That choice cannot be saved. Tick one more column, or untick a different one.");
    expect(strengths.checked).toBe(true);
    await settle(1200);
    expect(server.puts("ap_cols")).toHaveLength(0);
    expect(heads().slice(4)).toEqual(["Strengths"]);
    // A choice that can be stored clears the line.
    await click($('[data-testid="cmp-card-col-notes"]'));
    expect(tid("cmp-cols-refused")).toBeNull();
    await until(async () => ((await stored<string[]>("ap_cols")) ?? []).length === 2, "ap_cols saved");
    expect(await stored<string[]>("ap_cols")).toEqual(["strengths", "notes"]);
  });
});

// ---------------------------------------------------------------- being read (W8)

describe("Compare: the loading sign while its saved work is read (W8, register row D-S2-34)", () => {
  it.each(["ap_notes", "ap_cols", "shelf_cols"] as const)("while %s is being read the loading sign shows, never 'No papers yet', an empty table or a column to choose", async (kind) => {
    seed();
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/blobs/" + kind) && (init?.method ?? "GET") === "GET") await hold;
      return server.api(path, init);
    });
    await mount();
    await settle(30);
    expect(tid("panel-loading")).not.toBeNull();
    expect(tid("panel-loading")!.getAttribute("aria-busy")).toBe("true");
    expect(tid("panel-loading")!.textContent).toContain(E.blob_loading);
    for (const id of ["cmp-table", "cmp-empty", "cmp-locked", "cmp-error", "cmp-choose", "cmp-write"]) expect(tid(id), id).toBeNull();
    expect(tids("cmp-cell")).toHaveLength(0);
    release();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(tid("panel-loading")).toBeNull();
    expect(valuesOf(rowOf("ka"))[0]).toBe("58 university students");
  });
});

// ---------------------------------------------------------------- write from these papers

describe("Compare: Write from these papers", () => {
  it("lists every kept paper; one with no abstract stored cannot be ticked", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(tid("cmp-write")!.textContent).toContain("The AI uses only the papers you tick, and only their abstracts.");
    expect(tids("cmp-tick")).toHaveLength(5);
    expect(tids("cmp-tick").map((c) => (c as HTMLInputElement).disabled)).toEqual([false, false, true, true, true]);
    expect(tids("cmp-no-abstract")).toHaveLength(3);
    expect(tids("cmp-no-abstract")[0]!.textContent).toBe("No abstract stored");
    expect(tickFor(SHORT.kc).getAttribute("aria-describedby")).toBe(tids("cmp-no-abstract")[0]!.id);
    // Nothing is ticked at first, and nothing is asked until two papers are.
    expect(tids("cmp-tick").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    await click(tid("cmp-draft"));
    expect(h.callAI).not.toHaveBeenCalled();
    expect(tid("cmp-write-status")!.textContent).toBe("Tick at least 2 papers first.");
  });

  it("Draft and Find the gap send v1's and wave A's prompts over the ticked papers' abstracts", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    await click(tickFor(SHORT.ka));
    await click(tickFor(SHORT.kb));
    const papers = [rsPaperFromEntry(SCHAEFER), rsPaperFromEntry(PUTWAIN)];
    await click(tid("cmp-draft"));
    await until(() => h.callAI.mock.calls.length === 1, "the draft's request");
    const lit = buildLitReviewPrompt(fieldLabel("education"), papers);
    expect(h.callAI.mock.calls[0]).toEqual([lit.prompt, { temp: lit.temp, max: lit.max }]);
    expect(lit.prompt).toContain("Abstract: " + ABS_SCHAEFER);
    expect(lit.prompt).toContain("Abstract: " + ABS_PUTWAIN);
    await until(() => tid("cmp-ai") !== null, "the draft");
    await click(tid("cmp-gap"));
    await until(() => h.callAI.mock.calls.length === 2, "the gap request");
    const gap = buildGapFinderPromptV2(fieldLabel("education"), papers);
    expect(h.callAI.mock.calls[1]).toEqual([gap.prompt, { temp: gap.temp, max: gap.max }]);
    // Only the papers ticked: the one with no abstract is not in either prompt.
    expect(gap.prompt).not.toContain("Omega-3");
    // A paper the retraction check flagged says so to the AI (rsCorpusText's warning).
    expect(rsPaperFromEntry(SCHAEFER, true).retracted).toBe(true);
    expect(buildLitReviewPrompt("x", [rsPaperFromEntry(SCHAEFER, true)]).prompt).toContain("WARNING: this paper is marked as retracted");
  });

  it("a paper the retraction cache flags is sent to the AI as retracted", async () => {
    seed();
    server.putPlain("retraction_cache", { "10.1038/s41598-019-49466-6": { r: true, t: 1 } });
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    await click(tickFor(SHORT.ka));
    await click(tickFor(SHORT.kb));
    await click(tid("cmp-draft"));
    await until(() => h.callAI.mock.calls.length === 1, "the request");
    const prompt = h.callAI.mock.calls[0]![0] as string;
    expect(prompt.match(/WARNING: this paper is marked as retracted/g)).toHaveLength(1);
    expect(prompt.indexOf("Abstract: " + ABS_SCHAEFER)).toBeLessThan(prompt.indexOf("WARNING"));
    expect(prompt.indexOf("WARNING")).toBeLessThan(prompt.indexOf("Abstract: " + ABS_PUTWAIN));
  });

  it("the result stays beside the table after it arrives (W25), gold-edged and labelled", async () => {
    seed();
    h.callAI.mockResolvedValue("Sleep and test anxiety have been studied with pills (Schaefer et al., 2019).");
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    await click(tickFor(SHORT.ka));
    await click(tickFor(SHORT.kb));
    h.callAI.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r("Sleep and test anxiety have been studied with pills (Schaefer et al., 2019)."), 30)));
    await click(tid("cmp-draft"));
    expect(tid("cmp-write-status")!.textContent).toBe("Reading 2 abstracts and drafting…");
    // While the request runs the buttons say so without losing focus, and a second press asks nothing more.
    expect(tid("cmp-draft")!.getAttribute("aria-disabled")).toBe("true");
    expect((tid("cmp-draft") as HTMLButtonElement).disabled).toBe(false);
    await click(tid("cmp-gap"));
    expect(h.callAI).toHaveBeenCalledTimes(1);
    await until(() => tid("cmp-ai") !== null, "the draft");
    expect(tid("cmp-write-status")!.textContent).toBe("The answer is ready below.");
    expect(tid("cmp-draft")!.getAttribute("aria-disabled")).toBeNull();
    const box = tid("cmp-ai")!;
    expect(box.classList.contains("ai-read")).toBe(true);
    expect(box.querySelector('[data-testid="cmp-ai-label"]')!.textContent).toBe("AI draft from 2 abstracts. Check every claim against the papers.");
    expect(box.querySelector('[data-testid="cmp-ai-text"]')!.textContent).toBe("Sleep and test anxiety have been studied with pills (Schaefer et al., 2019).");
    // Beside the table, in the same tab: the table is still there and was not touched, nothing was inserted, and no toast spoke.
    expect(tids("cmp-row")).toHaveLength(5);
    expect(box.closest(".cmp-aside")).not.toBeNull();
    expect(tid("cmp-scroll")!.contains(box)).toBe(false);
    expect(h.inserts).toEqual([]);
    expect(h.toast).not.toHaveBeenCalled();
    // Editing a cell keeps it; asking for the gaps replaces it with the gaps' label.
    typeIn(cell(rowOf("ka"), "Notes"), "x");
    expect(tid("cmp-ai")).not.toBeNull();
    await click(tid("cmp-gap"));
    await until(() => tid("cmp-ai-label")?.textContent === "AI: gaps these papers leave open. Judge them yourself.", "the gaps' label");
    // Leaving the tab and coming back: the result is still there for this project.
    const m = await mount();
    expect(tids("cmp-ai-label").map((x) => x.textContent)).toEqual(["AI: gaps these papers leave open. Judge them yourself.", "AI: gaps these papers leave open. Judge them yourself."]);
    m.unmount();
  });

  it("Dismiss takes the result away; a failed request says why in the aside, with no toast", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    await click(tickFor(SHORT.ka));
    await click(tickFor(SHORT.kb));
    await click(tid("cmp-draft"));
    await until(() => tid("cmp-ai") !== null, "the draft");
    await click(tid("cmp-dismiss"));
    expect(tid("cmp-ai")).toBeNull();
    h.callAI.mockRejectedValueOnce(new Error("Add an AI key in AI Provider / Key first."));
    await click(tid("cmp-gap"));
    await until(() => tid("cmp-write-error") !== null, "the error");
    expect(tid("cmp-write-error")!.textContent).toBe("Add an AI key in AI Provider / Key first.");
    expect(tid("cmp-ai")).toBeNull();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("Put in my document inserts once, as AI text", async () => {
    seed();
    h.callAI.mockResolvedValue("A paragraph for the literature review.");
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    await click(tickFor(SHORT.ka));
    await click(tickFor(SHORT.kb));
    await click(tid("cmp-draft"));
    await until(() => tid("cmp-ai") !== null, "the draft");
    // Two presses before the first has finished put the text in once.
    await act(async () => { tid("cmp-put")!.click(); tid("cmp-put")!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await settle(10);
    expect(h.inserts).toEqual([{ type: "insert", ai: "A paragraph for the literature review." }]);
    const html = (h.editor as Editor).getHTML();
    expect(html.match(/class="ai-ins"/g)).toHaveLength(1);
    expect(html).toContain("A paragraph for the literature review.");
    expect(html).toContain("My introduction.");
    // The one toast Compare makes: it went in.
    expect(h.toast.mock.calls.map((c) => c[0])).toEqual([E.idea_inserted]);
    expect(tid("cmp-ai")).not.toBeNull();
  });

  it("the prompt is kept under the request limit: too many long abstracts say so and send nothing", async () => {
    const long = "word ".repeat(800);
    const many = Array.from({ length: 16 }, (_, i): StoredEntry => ({ author: "Author, A.", year: "20" + String(10 + i), title: "Paper number " + i + " on exam stress and sleep", pid: "kl" + i, rl: true, abstract: long }));
    seed({ lib: many, shelf: [], notes: {} });
    await mount();
    await until(() => tids("cmp-row").length === 16, "the rows");
    for (const c of tids("cmp-tick")) await click(c);
    await click(tid("cmp-draft"));
    expect(h.callAI).not.toHaveBeenCalled();
    expect(tid("cmp-write-status")!.textContent).toBe("That is too much text for one request. Untick some papers.");
  });
});

// ---------------------------------------------------------------- under the table

describe("Compare: under the table", () => {
  it("says what empty cells are and where the table goes, with an Export link for the comparison", async () => {
    seed();
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(tid("cmp-foot")!.textContent).toBe("Empty cells are ones you have not written yet. The table goes out with the rest of your work from Export project.");
    await click(tid("cmp-export"));
    expect(h.openExport).toHaveBeenCalledWith("compare");
    expect(tid("cmp-export")!.textContent).toBe("Export");
  });

  it("with no kept paper it says so and offers nothing to write from", async () => {
    seed({ lib: [], shelf: [], notes: {} });
    await mount();
    await until(() => tid("cmp-empty") !== null, "the empty line");
    expect(tid("cmp-empty")!.textContent).toBe("No papers yet. Keep a paper in Find, then come back to compare it.");
    expect(tid("cmp-table")).toBeNull();
    expect(tid("cmp-draft")).toBeNull();
  });
});

// ---------------------------------------------------------------- the vault

describe("Compare: a locked vault waits", () => {
  it("a locked vault shows its sentence and no cell to type in; once it opens the saved words are there; a save made while it is locked is held and sent after", async () => {
    const vk = await generateVaultKey();
    const open = await fakeVault({ status: "unlocked", vk });
    await server.putSealed(open, "citations", LIB);
    await server.putSealed(open, "shelf_index", SHELF);
    await server.putSealed(open, "ap_notes", NOTES);
    vault = await fakeVault({ status: "locked", locked: true, vk });
    h.vault = vault;
    const m = await mount();
    await until(() => tid("cmp-locked") !== null, "the locked sentence");
    expect(tid("cmp-locked")!.textContent).toBe("Your comparison is locked. Unlock your vault to read it and save your changes.");
    expect(tids("cmp-cell")).toHaveLength(0);
    expect(tid("cmp-table")).toBeNull();
    expect(tid("cmp-empty")).toBeNull();
    expect(server.puts()).toHaveLength(0);
    // The vault opens: the saved words are read, as they were, and nothing was written meanwhile.
    unlock(vault);
    await m.rerender();
    await until(() => tids("cmp-row").length === 5, "the rows after the unlock");
    expect(cell(rowOf("ka"), "Sample").value).toBe("58 university students");
    expect(tid("cmp-locked")).toBeNull();
    expect(server.puts()).toHaveLength(0);
    // The vault locks again; a cell typed now is shown, held, and sent after the next unlock, sealed.
    vault.lock();
    typeIn(cell(rowOf("kd"), "Notes"), "A classic, typed while locked.");
    await settle(1100);
    expect(server.puts("ap_notes")).toHaveLength(0);
    expect(cell(rowOf("kd"), "Notes").value).toBe("A classic, typed while locked.");
    unlock(vault);
    await m.rerender();
    await until(() => server.puts("ap_notes").length === 1, "the held save");
    const sent = await server.value<ApNotes>("ap_notes", vault);
    expect(sent!["p:kd"]!.card.notes).toBe("A classic, typed while locked.");
    expect(sent!["p:ka"]).toEqual(NOTES["p:ka"]);
    expect(server.find("ap_notes")!.keyVersion).toBeGreaterThan(0);
  }, 30_000);

  it("notes that do not open on this device say so, show the table empty-handed, and the first write asks before it replaces them", async () => {
    seed();
    server.store({ projectId: "p1", kind: "ap_notes", body: "not a note blob", keyVersion: 0, deks: [] });
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    await mount();
    await until(() => tid("cmp-broken") !== null, "the broken line");
    expect(tid("cmp-broken")!.textContent).toBe("Part of your saved comparison cannot be opened on this device. Nothing was changed.");
    await until(() => tids("cmp-row").length === 5, "the rows");
    typeIn(cell(rowOf("kd"), "Notes"), "a");
    typeIn(cell(rowOf("kd"), "Notes"), "ab");
    expect(ask.mock.calls).toEqual([[E.vault_ap_broken_confirm]]);
  });
});

// ---------------------------------------------------------------- the export

describe("Compare: the export's table is Compare's table (R27)", () => {
  /** jsdom's Blob has no arrayBuffer(); the export reads a file through it. */
  const readBytes = (b: Blob) => new Promise<ArrayBuffer>((done) => { const r = new FileReader(); r.onload = () => done(r.result as ArrayBuffer); r.readAsArrayBuffer(b); });
  async function exported(parts: Array<"compare">) {
    const had = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function (this: Blob) { return readBytes(this); };
    const zip = await exportProject({
      project: { id: "p1", title: "P", titleKeyVersion: 0, deks: [] }, t,
      listDocuments: async () => [], getDocument: async () => { throw new Error("none"); }, decrypt: async () => "", openTitle: async () => ({ state: "unreadable" }),
      readBlob: async (kind) => { const v = await stored<unknown>(kind); return v === null ? null : JSON.stringify(v); },
      writingRecord: async () => { throw new Error("none"); }, aiUseLog: async () => []
    }, parts, { style: "apa", now: new Date(), lastSearch: null }).finally(() => { Blob.prototype.arrayBuffer = had; });
    return JSZip.loadAsync(await readBytes(zip));
  }
  const csv = async (z: JSZip, name: string) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await z.file(name)!.async("uint8array"));

  it("compare/table.csv has the papers that have a cell or a card field, with Compare's columns, by paper id", async () => {
    seed();
    server.putPlain("shelf_cols", ["Sample", "Design"]);
    server.putPlain("ap_cols", ["verdict", "strengths"]);
    const z = await exported(["compare"]);
    const lines = (await csv(z, "compare/table.csv")).split("\n");
    // The columns on screen: Paper, the matrix columns by their stored names, then the card fields chosen. A paper with nothing written (Cohen, Kiecolt, the loose PDF) has no row.
    expect(lines[0]).toBe("\uFEFFPaper,Sample,Design,Strengths,My verdict");
    expect(lines.slice(1)).toEqual([
      SCHAEFER.title + ",58 university students,,Control group; real exam,",
      PUTWAIN.title + ",,,,Background for the introduction"
    ]);
    // The note that moved to p:ka is not a second row.
    expect(lines.join("\n")).not.toContain("OLD TEXT");
  });

  it("is the table on screen: the same columns, in the same order, for the same lists", async () => {
    seed();
    server.putPlain("ap_cols", ["notes", "weak"]);
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    const onScreen = heads();
    const z = await exported(["compare"]);
    const header = (await csv(z, "compare/table.csv")).split("\n")[0]!.replace("\uFEFF", "").split(",");
    expect(onScreen).toEqual(["Paper", "Sample", "Method", "Key finding", "Weak points", "Notes"]);
    expect(header).toEqual(["Paper", "Sample", "Method", "Key finding", "Weak points", "Notes"]);
  });

  it("the walk-through columns are on screen only: table.csv does not carry them, paper-cards.csv still does, and a paper with only walk-through words has no row in the table file", async () => {
    seed({ notes: { "p:ka": { ...NOTES["p:ka"]!, cells: {}, card: {} }, "p:kb": { ...NOTES["p:kb"]!, cells: {}, card: {} } } });
    await mount();
    await until(() => tids("cmp-row").length === 5, "the rows");
    expect(heads()).toEqual(HEADS);
    expect(stageCell(rowOf("ka"), "Design").value).toBe("Two groups, pills or no pills");
    const z = await exported(["compare"]);
    expect(z.file("compare/table.csv")).toBeNull();
    const cards = await csv(z, "compare/paper-cards.csv");
    expect(cards).toContain("Two groups, pills or no pills");
    expect(cards.split("\n")[0]).toContain("Design (my words)");
  });

  it("writes no table when nothing is written in it", async () => {
    seed({ notes: {} });
    const z = await exported(["compare"]);
    expect(z.file("compare/table.csv")).toBeNull();
  });
});

// ---------------------------------------------------------------- the model

describe("Compare: the table model and the paper the AI reads", () => {
  it("rsPaperFromEntry is the paper the prompts quote: authors as a result's card line, every name, the stored abstract, the DOI", () => {
    const p = rsPaperFromEntry({ ...SCHAEFER, author: "Schaefer, Carolin; Denke, C.; Harke, H.; Olk, N.; Enge, S.", url: "https://example.org" });
    expect(p).toEqual({
      title: SCHAEFER.title, authors: "Carolin Schaefer, C. Denke, H. Harke, N. Olk, et al.", authorList: ["Carolin Schaefer", "C. Denke", "H. Harke", "N. Olk", "S. Enge"],
      year: "2019", venue: "Scientific Reports", doi: SCHAEFER.doi, url: "https://example.org", source: "", abstract: ABS_SCHAEFER
    });
    // No author, abstract or DOI: v1's own words for no authors, and no abstract key (rsCorpusText says "not available").
    expect(rsPaperFromEntry(KIECOLT)).toEqual({ title: KIECOLT.title, authors: "Unknown authors", authorList: [], year: "2011", venue: "", doi: "", source: "" });
    expect(rsPaperFromEntry({ author: "World Health Organization", year: "2020", title: "A report", container: "WHO" }).authors).toBe("World Health Organization");
  });

  it("compareTable lists the papers by pid once, and compareCsv keeps the rows that have words in a shown column", () => {
    const papers = papersOf(LIB, SHELF, NOTES);
    const table = compareTable(papers, [...SHELF_DEFAULT_COLS], [], ["verdict"], t);
    expect(table.columns.map((c) => c.label)).toEqual(["Sample", "Method", "Key finding", "My verdict"]);
    expect(table.rows.map((r) => r.pid)).toEqual(["ka", "kb", "kc", "kd", "kx"]);
    expect(table.rows[0]!.values).toEqual(["58 university students", "Randomised trial", "", ""]);
    // Putwain's card is only in a column that is shown here; hide it and the paper has no words in the table.
    const noVerdict = compareTable(papers, [...SHELF_DEFAULT_COLS], [], ["strengths"], t);
    expect(compareCsv(noVerdict, "Paper")!.split("\n").slice(1)).toHaveLength(1);
    expect(compareCsv(compareTable(papersOf(LIB, SHELF, {}), ["Sample"], [], ["notes"], t), "Paper")).toBeNull();
  });

  it("the walk-through columns come after the matrix columns and before the card fields, take the note's stage words, and are not in the table file", () => {
    const papers = papersOf(LIB, SHELF, NOTES);
    const table = compareTable(papers, ["Sample"], ["limits", "design"], ["verdict"], t);
    expect(table.columns.map((c) => [c.kind, c.key, c.label])).toEqual([["cell", "Sample", "Sample"], ["stage", "limits", "Limitations"], ["stage", "design", "Design"], ["card", "verdict", "My verdict"]]);
    // A cell says where it is from, so it cannot be mistaken for the matrix column of the same name; only a walk-through column has the note.
    expect(table.columns.map((c) => c.note ?? null)).toEqual([null, "From your walk-through", "From your walk-through", null]);
    expect(table.columns.map((c) => c.aria)).toEqual(["Sample", "Limitations" + FROM_WALK, "Design" + FROM_WALK, "My verdict"]);
    expect(table.rows[0]!.values).toEqual(["58 university students", "", "Two groups, pills or no pills", ""]);
    expect(table.rows[1]!.values).toEqual(["", "", "A review, not an experiment", "Background for the introduction"]);
    // The file has the matrix columns and the card fields, and the papers that have words in them: Schaefer's matrix cell, Putwain's verdict. Walk-through words alone make no row.
    const lines = compareCsv(table, "Paper")!.split("\n");
    expect(lines[0]).toBe("Paper,Sample,My verdict");
    expect(lines.slice(1)).toEqual([SCHAEFER.title + ",58 university students,", PUTWAIN.title + ",,Background for the introduction"]);
    expect(compareCsv(compareTable(papersOf(LIB, SHELF, { "p:ka": { stages: { design: { mine: "x" } }, card: {} } }), ["Sample"], ["design"], [], t), "Paper")).toBeNull();
  });

  it("a paper whose note has no cells key shows the reading-list copy of its cells when asked to (the export's case, B2-R7); a note that has cells, even {}, wins", () => {
    const notes: ApNotes = {
      "p:ka": { title: "a", pid: "ka", stages: {}, card: {} },
      "p:kb": { title: "b", pid: "kb", stages: {}, card: {}, cells: {} }
    };
    const papers = papersOf(LIB, SHELF, notes);
    const old = (p: { pid: string }) => (p.pid === "ka" || p.pid === "kb" ? { Sample: "old " + p.pid, Other: "ignored?" } : undefined);
    const without = compareTable(papers, ["Sample"], [], [], t);
    expect(without.rows.map((r) => r.values[0])).toEqual(["", "", "", "", ""]);
    const withOld = compareTable(papers, ["Sample"], [], [], t, old);
    expect(withOld.rows.map((r) => r.values[0])).toEqual(["old ka", "", "", "", ""]);
    // A non-text value in the old copy is not a cell.
    expect(compareTable(papers, ["Sample"], [], [], t, () => ({ Sample: 3 as unknown as string })).rows[0]!.values[0]).toBe("");
  });
});

describe("Compare: the layout rules (375 px wide, tokens only)", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const start = css.indexOf("/* Compare (wave B Task 22");
  const end = css.indexOf("/* end Compare */");
  const block = css.slice(start, end);
  const rules = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]!.trim(), at: m.index ?? 0 }));
  const phoneAt = block.indexOf("@media (max-width: 700px)");

  it("the table scrolls inside its own box and the aside goes under it on a phone", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(phoneAt).toBeGreaterThan(-1);
    expect(rules.find((r) => r.sel === ".cmp-scroll" && r.at < phoneAt)?.body).toMatch(/overflow-x:\s*auto/);
    expect(rules.find((r) => r.sel === ".cmp-main" && r.at < phoneAt)?.body).toMatch(/min-width:\s*0/);
    expect(rules.find((r) => r.sel === ".cmp" && r.at > phoneAt)?.body).toMatch(/flex-direction:\s*column/);
  });

  it("touch targets are 44 px on a phone, and the AI box has the gold edge", () => {
    const phone = rules.filter((r) => r.at > phoneAt);
    for (const cls of [".cmp-choose", ".cmp-tick", ".cmp-btn", ".cmp-cell"]) expect(phone.find((r) => r.sel.includes(cls))?.body, cls).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/\.ai-read\s*\{[^}]*border:\s*1px solid var\(--gold\)/);
  });

  it("uses colour tokens only: no hex or rgb colour and no fixed pixel width past a phone's", () => {
    expect(rules.length).toBeGreaterThan(10);
    for (const r of rules) expect(r.body, r.sel).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    // No width fixed in pixels, a ticked box's own size apart: the table and the aside grow and shrink with the screen.
    for (const r of rules.filter((x) => !/\binput\b/.test(x.sel))) expect(r.body, r.sel).not.toMatch(/(^|[;{\s])width:\s*\d+px/m);
  });
});
