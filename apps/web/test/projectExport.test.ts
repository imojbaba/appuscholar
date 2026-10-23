import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { AIU_V1_BRACKET, AIU_V2_BRACKET, aiuBuildV2, apAcrossCsv, bibliography, exportLibrary, PROVIDERS, rsCsvText, SHELF_DEFAULT_COLS, shMatrixCsv, type AiuEntry, type CitationEntry, type RsPaper } from "@appuscholar/core";
import { acrossData } from "../lib/analyse/cards";
import { DEFAULT_EXPORT_PARTS, EXPORT_PARTS, exportProject, keptPapers, projectExportFileName, saveProjectExport, type ExportPart, type ProjectExportDeps } from "../lib/export/projectExport";
import { VaultError } from "../lib/vault/crypto";
import { localDay } from "../lib/vault/export";
import { projectKeyId, type OpenedTitle, type Titled } from "../lib/vault/titles";
import type { WritingRecord } from "../lib/writingRecord";
import { exportPartList } from "../lib/export/moduleParts";
import type { ExportPartDef } from "../lib/tools/registry";

// Every tool module this file does not set up itself is pinned to its unbuilt stub, so a tool session's real export parts never appear here (session C, 2026-10-22).
vi.mock("@/components/tools/stats", () => ({ built: false }));
vi.mock("@/components/tools/qual", () => ({ built: false }));
vi.mock("@/components/tools/style", () => ({ built: false }));
vi.mock("@/components/tools/words", () => ({ built: false }));
vi.mock("@/components/tools/close", () => ({ built: false }));
vi.mock("@/components/tools/slides", () => ({ built: false }));
vi.mock("@/components/tools/viva", () => ({ built: false }));

/*
 * Task G3 (ruling R7): one tool module mocked as built, declaring one export part, as a session's module does. Its build reads the project's
 * blobs through the export's deps and hands back its files.
 */
const mod = vi.hoisted(() => {
  const part = {
    part: "designPack", labelKey: "exp_part_design_pack", detailKey: "exp_detail_design_pack", formatKey: "exp_format_text", ticked: true,
    build: async (d: { readBlob(kind: string): Promise<string | null>; now: Date }) => [
      { path: "design/pathway.txt", data: "Pathway: " + (await d.readBlob("design_reg")) },
      { path: "design/budget.csv", data: new Blob(["label,amount\nTravel,2500\n"], { type: "text/csv" }) },
      { path: "design/made.txt", data: d.now.toISOString() }
    ]
  };
  // The module's list, changed in place by the collision test (and put back after it).
  return { part, parts: [part] as unknown[] };
});
vi.mock("@/components/tools/design", () => ({ built: true, exportParts: mod.parts }));

/** The copy as keys: the cards CSV and the labels come out as their keys, so the test reads what the export asked t() for. */
const t = (k: string, v?: Record<string, string | number>) => (v ? k + JSON.stringify(v) : k);
const NOW = new Date(2026, 9, 21, 14, 30);

const LIB: CitationEntry[] = [
  { author: "Walker, Matthew", year: "2017", title: "Why we sleep", source: "Scribner", type: "Book" },
  { author: "Alvarez, Ana", year: "2020", title: "Sleep and exam anxiety", source: "Journal of Sleep", volume: "4", issue: "2", pages: "10-20", doi: "10.1/abc", type: "Journal article" }
];
const INTAKE = { topic: "Sleep and exam anxiety", resources: "Two classes", timeframe: "Six weeks", constraints: "None", read: { text: "Feasible: High. A narrow sample.", at: "2026-10-21T10:00:00.000Z" } };
const SHELF_INDEX = [{ id: "s1", title: "Sleep and exam anxiety", file: "a.pdf", size: 10, added: "2026-10-01T10:00:00.000Z", total: 3, kept: 3 }];
const SHELF_PAPER = { pages: ["one", "two", "three"], notes: [{ id: "n1", page: 2, quote: "Sleep fell by an hour", note: "Check the sample", at: "2026-10-02T10:00:00.000Z" }], cells: { Sample: "120 students" } };
const AP_NOTES = {
  a1: {
    title: "Sleep and exam anxiety",
    stages: { design: { mine: "A survey of two classes.", res: { reading: "A cross-sectional survey; causation is not shown." } } },
    card: { strengths: "Large sample", verdict: "Useful, with care" }
  }
};
const BLOBS: Record<string, unknown> = { design_reg: { type: "observational", done: true }, idea_intake: INTAKE, citations: LIB, shelf_index: SHELF_INDEX, "shelf_paper:s1": SHELF_PAPER, ap_notes: AP_NOTES, ap_cols: ["design", "verdict"], shelf_cols: [] };
const LOG: AiuEntry[] = [{ d: "2026-10-02", p: "anthropic", m: "claude", k: "Idea check", g: "feedback" }];
const RECORD: WritingRecord = {
  docs: [{ id: "d1", title: "Draft", titleKeyVersion: 0, deks: [], kind: "draft", stats: { typed: 10, ai: 0, passages: 0, kept: 0, edited: 0, unknown: 0 } }],
  sources: [], weekly: [], aiLog: { byKind: {}, byService: {}, total: 0, firstAt: null, lastAt: null, loggingOff: false }
};
const SEARCH: RsPaper[] = [{ title: "A new paper", authors: "Lee, K", year: 2024, venue: "Sleep", doi: "10.2/x", source: "OpenAlex" }];

/** Opens a title the way the vault does: "ct:<text>" under the key id it was sealed for, anything else does not open. */
async function fakeOpenTitle(t: Titled, keyId: string): Promise<OpenedTitle> {
  if (t.titleKeyVersion === 0) return { state: "open", text: t.title };
  return t.title.startsWith("ct:" + keyId + ":") ? { state: "open", text: t.title.slice(("ct:" + keyId + ":").length) } : { state: "unreadable" };
}

function deps(over: Partial<ProjectExportDeps> = {}): ProjectExportDeps {
  return {
    project: { id: "p1", title: "Sleep study", titleKeyVersion: 0, deks: [] },
    t,
    listDocuments: async () => [
      { id: "d1", title: "Draft", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "", updatedAt: "" },
      { id: "s1", title: "Source paper", titleKeyVersion: 0, deks: [], kind: "source", createdAt: "", updatedAt: "" },
      { id: "gone", title: "Gone", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "", updatedAt: "", deletedAt: "2026-10-03T10:00:00.000Z" }
    ],
    getDocument: async (id) => ({ id, bodyHtml: "ct:" + id, keyVersion: 1, deks: [] }),
    decrypt: async (doc) => `<p>The text of ${doc.id}.</p>`,
    openTitle: vi.fn(fakeOpenTitle),
    readBlob: async (kind) => (kind in BLOBS ? JSON.stringify(BLOBS[kind]) : null),
    writingRecord: async () => RECORD,
    aiUseLog: async () => LOG,
    ...over
  };
}
const unzip = async (b: Blob) => JSZip.loadAsync(await b.arrayBuffer());
const files = (z: JSZip) => Object.keys(z.files).filter((n) => !z.files[n]!.dir).sort();
const text = (z: JSZip, n: string) => z.file(n)!.async("string");
const opts = (o: Partial<Parameters<typeof exportProject>[2]> = {}) => ({ style: "apa" as const, now: NOW, lastSearch: SEARCH, ...o });

describe("exportProject", () => {
  it("every part is ticked by default except the reading list backup", () => {
    expect(DEFAULT_EXPORT_PARTS).toEqual(EXPORT_PARTS.filter((p) => p !== "readingBackup"));
  });

  it("the zip holds every ticked part at its path and nothing else", async () => {
    const z = await unzip(await exportProject(deps(), [...EXPORT_PARTS], opts()));
    expect(files(z)).toEqual([
      "ai-use-statement.txt",
      "citations/library.json", "citations/references.txt",
      "compare/paper-cards.csv", "compare/table.csv",
      "documents/Draft.doc", "documents/Draft.html", "documents/sources/Source paper.doc", "documents/sources/Source paper.html",
      "notes/Sleep and exam anxiety.txt",
      "question.txt",
      "reading-list-backup.json",
      "search/kept-papers.csv", "search/last-search.csv",
      "writing-record.txt"
    ]);
    expect(await text(z, "documents/Draft.html")).toContain("The text of d1.");
    expect(await text(z, "documents/Draft.doc")).toContain("The text of d1.");
    expect(await text(z, "citations/library.json")).toBe(exportLibrary(LIB));
    expect(await text(z, "search/kept-papers.csv")).toBe("﻿" + rsCsvText(keptPapers(LIB)));
    expect(await text(z, "search/last-search.csv")).toBe("﻿" + rsCsvText(SEARCH));
    expect(await text(z, "compare/table.csv")).toBe("﻿" + shMatrixCsv("sh2_paper", [...SHELF_DEFAULT_COLS], [{ title: SHELF_INDEX[0]!.title, cells: SHELF_PAPER.cells }]));
    expect(await text(z, "compare/paper-cards.csv")).toBe("﻿" + apAcrossCsv(acrossData(t, AP_NOTES, ["design", "verdict"], false)));
    const q = await text(z, "question.txt");
    expect(q).toContain("idea_topic_label\nSleep and exam anxiety");
    expect(q).toContain("idea_constraints_label\nNone");
    expect(q).toContain("exp_ai_read\nFeasible: High. A narrow sample.");
    const statement = aiuBuildV2({ list: LOG, keep: { "Idea check": 1 }, other: "", fmt: "course", ticks: { own: false, reword: false, cite: false, facts: false, noData: false }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS });
    expect(await text(z, "ai-use-statement.txt")).toBe("text" in statement ? statement.text : "");
    expect(await text(z, "writing-record.txt")).toContain("WRITING-PROCESS RECORD");
    expect(await text(z, "writing-record.txt")).toContain("Date: " + localDay(NOW));
    const backup = JSON.parse(await text(z, "reading-list-backup.json")) as { app: string; papers: Array<{ id: string; pages: string[] }> };
    expect(backup.app).toBe("appuscholar-shelf");
    expect(backup.papers.map((p) => [p.id, p.pages])).toEqual([["s1", SHELF_PAPER.pages]]);
  });

  it("an unticked part is absent", async () => {
    const all = [...EXPORT_PARTS];
    for (const part of all) {
      const z = await unzip(await exportProject(deps(), all.filter((p) => p !== part), opts()));
      const prefix: Record<ExportPart, string> = {
        documents: "documents/", question: "question.txt", citations: "citations/", search: "search/", notes: "notes/", compare: "compare/",
        record: "writing-record.txt", aiuse: "ai-use-statement.txt", readingBackup: "reading-list-backup.json"
      };
      expect(files(z).filter((n) => n.startsWith(prefix[part]))).toEqual([]);
      expect(files(z).length).toBeGreaterThan(0);
    }
    const z = await unzip(await exportProject(deps(), ["question"], opts()));
    expect(files(z)).toEqual(["question.txt"]);
  });

  it("the reference list follows the chosen style", async () => {
    for (const style of ["apa", "vancouver"] as const) {
      const z = await unzip(await exportProject(deps(), ["citations"], opts({ style })));
      const b = bibliography(LIB, style);
      expect(await text(z, "citations/references.txt")).toBe(b.head + "\n\n" + b.items.map((x) => x.fmt.ref).join("\n\n") + "\n");
    }
    const apa = await text(await unzip(await exportProject(deps(), ["citations"], opts({ style: "apa" }))), "citations/references.txt");
    const van = await text(await unzip(await exportProject(deps(), ["citations"], opts({ style: "vancouver" }))), "citations/references.txt");
    expect(apa).not.toBe(van);
    // Vancouver numbers in library order; APA sorts by surname.
    expect(van.indexOf("Walker")).toBeLessThan(van.indexOf("Alvarez"));
    expect(apa.indexOf("Alvarez")).toBeLessThan(apa.indexOf("Walker"));
  });

  it("reading notes mark AI text as AI", async () => {
    const z = await unzip(await exportProject(deps(), ["notes"], opts()));
    const n = await text(z, "notes/Sleep and exam anxiety.txt");
    // The highlight with its page and the student's note on it; the student's own words; the AI's reading, marked.
    expect(n).toContain("exp_highlights\n");
    expect(n).toContain('exp_page{"page":2}: "Sleep fell by an hour"');
    expect(n).toContain("Check the sample");
    expect(n).toContain("ap2_my_words_2 A survey of two classes.");
    expect(n).toContain("AI: A cross-sectional survey; causation is not shown.");
    expect(n).toContain("ap2_strengths_2\nLarge sample");
    // Every label is the copy's (t), but the AI's mark, which the plan fixes as "AI:".
    expect(n).not.toMatch(/Highlights|p\. 2|REFLECTION/);
    // The AI's reading never appears without its mark.
    expect(n.split("\n").filter((l) => l.includes("cross-sectional"))).toEqual(["AI: A cross-sectional survey; causation is not shown."]);
  });

  it("reading notes are one file per paper id: two papers with the same title stay apart", async () => {
    const index = [...SHELF_INDEX, { ...SHELF_INDEX[0]!, id: "s2", file: "b.pdf" }];
    const second = { ...SHELF_PAPER, notes: [{ id: "n2", page: 5, quote: "A second paper's line", note: "", at: "2026-10-02T10:00:00.000Z" }] };
    const notes = { ...AP_NOTES, a2: { title: "Sleep and exam anxiety", stages: { design: { mine: "Another paper's design." } }, card: {} } };
    const blobs: Record<string, unknown> = { ...BLOBS, shelf_index: index, "shelf_paper:s2": second, ap_notes: notes };
    const z = await unzip(await exportProject(deps({ readBlob: async (k) => (k in blobs ? JSON.stringify(blobs[k]) : null) }), ["notes"], opts()));
    const all = files(z);
    expect(all).toHaveLength(4);
    const got = await Promise.all(all.map((n) => text(z, n)));
    // A title that names two shelf papers and two notes: no guess which goes with which, so each is a file of its own.
    for (const line of ["Sleep fell by an hour", "A second paper's line", "A survey of two classes.", "Another paper's design."]) {
      expect(got.filter((g) => g.includes(line))).toHaveLength(1);
    }
    expect(got.filter((g) => g.includes("Sleep fell by an hour") && g.includes("A survey of two classes."))).toHaveLength(0);
  });

  it("a project with no AI use gets v2's statement: the log is this project's in the account, not \"in this browser\" (D-S2-58)", async () => {
    const z = await unzip(await exportProject(deps({ aiUseLog: async () => [] }), ["aiuse"], opts()));
    const statement = await text(z, "ai-use-statement.txt");
    expect(statement).toContain(AIU_V2_BRACKET);
    expect(statement).not.toContain(AIU_V1_BRACKET);
    expect(statement).not.toMatch(/in (this|my) browser/);
  });

  it("with no search this session the search list is the kept papers", async () => {
    const z = await unzip(await exportProject(deps(), ["search"], opts({ lastSearch: null })));
    expect(files(z)).toEqual(["search/kept-papers.csv"]);
    const csv = await text(z, "search/kept-papers.csv");
    expect(csv).toBe("﻿" + rsCsvText(keptPapers(LIB)));
    expect(csv).toContain("Why we sleep");
    expect(csv).toContain("10.1/abc");
  });

  it("a document or a blob that does not open is listed in unreadable.txt, and the rest still export", async () => {
    const d = deps({
      decrypt: async (doc) => { if (doc.id === "s1") throw new VaultError("corrupt"); return `<p>The text of ${doc.id}.</p>`; },
      readBlob: async (kind) => {
        if (kind === "ap_notes") throw new VaultError("corrupt");
        if (kind === "shelf_paper:s1") return "not json {";
        if (kind === "idea_intake") return JSON.stringify({ topic: 5 });
        return kind in BLOBS ? JSON.stringify(BLOBS[kind]) : null;
      }
    });
    const z = await unzip(await exportProject(d, [...EXPORT_PARTS], opts()));
    expect(files(z)).toContain("documents/Draft.html");
    expect(files(z)).not.toContain("documents/sources/Source paper.html");
    expect(files(z)).not.toContain("question.txt");
    expect(files(z)).toContain("citations/library.json");
    expect(await text(z, "unreadable.txt")).toBe([
      "exp_unreadable_head", "",
      'exp_unreadable_doc{"name":"Source paper"}',
      'exp_unreadable_data{"name":"exp_part_question"}',
      'exp_unreadable_paper{"name":"Sleep and exam anxiety"}',
      'exp_unreadable_data{"name":"exp_part_notes"}',
      ""
    ].join("\n"));
    // Everything opens: no such file.
    expect(files(await unzip(await exportProject(deps(), [...EXPORT_PARTS], opts())))).not.toContain("unreadable.txt");
    // A locked vault is not unreadable: the export rejects.
    await expect(exportProject(deps({ readBlob: async () => { throw new Error("vault-locked"); } }), ["question"], opts())).rejects.toThrow("vault-locked");
  });

  it("the export dialog lists a part a module declares, and the zip holds its files", async () => {
    // The dialog's list: the built-in parts in their order, then each built module's parts.
    const list = exportPartList();
    expect(list.slice(0, EXPORT_PARTS.length)).toEqual(EXPORT_PARTS);
    expect(list.slice(EXPORT_PARTS.length)).toEqual([mod.part]);
    const def = list.at(-1) as ExportPartDef;
    expect([def.part, def.labelKey, def.detailKey, def.formatKey, def.ticked]).toEqual(["designPack", "exp_part_design_pack", "exp_detail_design_pack", "exp_format_text", true]);
    // Ticked with a built-in part: its files are in the zip at their paths, and the progress line hears it after the built-in parts.
    const progress = vi.fn();
    const z = await unzip(await exportProject(deps(), ["question", def], opts({ progress })));
    expect(files(z)).toEqual(["design/budget.csv", "design/made.txt", "design/pathway.txt", "question.txt"]);
    expect(await text(z, "design/pathway.txt")).toBe('Pathway: {"type":"observational","done":true}');
    expect(await text(z, "design/budget.csv")).toBe("label,amount\nTravel,2500\n");
    expect(await text(z, "design/made.txt")).toBe(NOW.toISOString());
    expect(progress.mock.calls.map((c) => c[0])).toEqual(["question", "designPack"]);
    // Not ticked: nothing of it.
    expect(files(await unzip(await exportProject(deps(), ["question"], opts())))).toEqual(["question.txt"]);
  });

  it("a module part cannot overwrite a file: a path already in the zip, unreadable.txt or another module's path is refused, and a part id must be its own (fix round 1)", async () => {
    const part = (id: string, path: string): ExportPartDef => ({ ...mod.part, part: id, build: async () => [{ path, data: "x" }] });
    // A built-in part's file, and the export's own unreadable.txt.
    await expect(exportProject(deps(), ["question", part("designA", "question.txt")], opts())).rejects.toThrow(/question\.txt/);
    await expect(exportProject(deps(), ["documents", part("designA", "documents/Draft.html")], opts())).rejects.toThrow(/documents\/Draft\.html/);
    await expect(exportProject(deps(), [part("designA", "unreadable.txt")], opts())).rejects.toThrow(/unreadable\.txt/);
    // Two modules' parts with the same path: the second is refused.
    await expect(exportProject(deps(), [part("designA", "design/a.txt"), part("statsA", "design/a.txt")], opts())).rejects.toThrow(/design\/a\.txt/);
    // Paths of their own are fine.
    expect(files(await unzip(await exportProject(deps(), ["question", part("designA", "design/a.txt"), part("statsA", "stats/a.txt")], opts())))).toEqual(["design/a.txt", "question.txt", "stats/a.txt"]);
    // A part id is a built-in part's or another module part's: the list refuses it.
    try {
      mod.parts.splice(0, mod.parts.length, mod.part, { ...mod.part, part: "question" });
      expect(() => exportPartList()).toThrow(/question/);
      mod.parts.splice(0, mod.parts.length, mod.part, { ...mod.part });
      expect(() => exportPartList()).toThrow(/designPack/);
    } finally {
      mod.parts.splice(0, mod.parts.length, mod.part);
    }
    expect(exportPartList().at(-1)).toBe(mod.part);
  });

  it("reports each ticked part as it is built", async () => {
    const progress = vi.fn();
    await exportProject(deps(), ["documents", "citations", "aiuse"], opts({ progress }));
    expect(progress.mock.calls.map((c) => c[0])).toEqual(["documents", "citations", "aiuse"]);
  });

  it("a deleted document is left out and never fetched", async () => {
    const getDocument = vi.fn(async (id: string) => ({ id, bodyHtml: "ct:" + id, keyVersion: 1, deks: [] }));
    await exportProject(deps({ getDocument }), ["documents"], opts());
    expect(getDocument).not.toHaveBeenCalledWith("gone");
  });

  it("sealed titles name the files by their opened text, or untitled", async () => {
    const d = deps({
      listDocuments: async () => [
        { id: "d1", title: "ct:d1:My draft", titleKeyVersion: 1, deks: [], kind: "draft", createdAt: "", updatedAt: "" },
        { id: "d2", title: "ct:other:Nope", titleKeyVersion: 1, deks: [], kind: "draft", createdAt: "", updatedAt: "" }
      ]
    });
    const z = await unzip(await exportProject(d, ["documents"], opts()));
    expect(files(z)).toEqual(["documents/My draft.doc", "documents/My draft.html", "documents/untitled.doc", "documents/untitled.html"]);
  });
});

describe("saveProjectExport", () => {
  it("one audit row per download", async () => {
    const audit = vi.fn(async () => {});
    const download = vi.fn();
    await saveProjectExport(deps(), DEFAULT_EXPORT_PARTS, opts(), { audit, download });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    // The audit row is written after the zip is built and before it is saved, as the account export does.
    expect(audit.mock.invocationCallOrder[0]!).toBeLessThan(download.mock.invocationCallOrder[0]!);
    await saveProjectExport(deps(), ["question"], opts(), { audit, download });
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it("a failed build writes no audit row and saves nothing", async () => {
    const audit = vi.fn(async () => {});
    const download = vi.fn();
    const d = deps({ listDocuments: async () => { throw new Error("offline"); } });
    await expect(saveProjectExport(d, ["documents"], opts(), { audit, download })).rejects.toThrow("offline");
    expect(audit).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("a sealed project title gives the opened name in the zip's file name", async () => {
    const download = vi.fn();
    const d = deps({ project: { id: "p1", title: "ct:" + projectKeyId("p1") + ":Sleep and anxiety", titleKeyVersion: 1, deks: [] } });
    await saveProjectExport(d, ["question"], opts(), { audit: async () => {}, download });
    expect(download).toHaveBeenCalledWith("appuscholar-Sleep and anxiety-2026-10-21.zip", expect.any(Blob));
    expect(d.openTitle).toHaveBeenCalledWith(d.project, projectKeyId("p1"));
  });
});

describe("projectExportFileName", () => {
  it("is appuscholar-<title>-<local day>.zip, the title as zipName makes it", () => {
    expect(projectExportFileName("Sleep: and/anxiety?", NOW)).toBe("appuscholar-Sleep andanxiety-2026-10-21.zip");
    expect(projectExportFileName("untitled", NOW)).toBe("appuscholar-untitled-2026-10-21.zip");
  });
});
