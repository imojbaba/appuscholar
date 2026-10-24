import JSZip from "jszip";
import {
  AP_STAGES, aiuBuildV2, apAcrossCols, apAcrossCsv, bibliography, exportLibrary, PROVIDERS, rsCsvText, SHELF_DEFAULT_COLS, shColsOf,
  type AiuEntry, type ApNoteLike, type CitationEntry, type CitationStyle, type RsPaper
} from "@appuscholar/core";
import { acrossData, cardLabels, stageName } from "@/lib/analyse/cards";
import { forLibraryFile, noteHasWork, pidOfNote } from "@/lib/papers/ids";
import { parseBlob, shelfPaperKind, type BlobKind, type BlobShape, type Highlight } from "@/lib/blobs/kinds";
import { backupShelf, downloadMatrix, type ShelfItem, type T } from "@/lib/shelf/actions";
import { VaultError } from "@/lib/vault/crypto";
import { htmlFile, localDay, unique, zipName, type ExportDoc, type ExportDocSummary } from "@/lib/vault/export";
import { fileTitle, projectKeyId, UNTITLED, type OpenedTitle, type Titled } from "@/lib/vault/titles";
import type { ExportPartDef } from "@/lib/tools/registry";
import { APP_VERSION } from "@/lib/version";
import { buildRecordText, openRecordTitles, type WritingRecord } from "@/lib/writingRecord";
import { wordText } from "./word";

/*
 * One export place (Task 12; register D-S2-42): the parts of one project the student ticks, in one zip. Every file is made by the builder the
 * tool's own download uses (v1's and wave A's): the documents as the account export writes them, exportLibrary and the reference list,
 * rsCsvText, the matrix CSV and the shelf backup, the cards CSV, the writing record and aiuBuildV2. Like the account export, everything is read
 * as ciphertext and opened here, and the folder and file names come from opened titles ("untitled" when a title does not open).
 */

export type ExportPart = "documents" | "question" | "citations" | "search" | "notes" | "compare" | "record" | "aiuse" | "readingBackup";
export const EXPORT_PARTS: readonly ExportPart[] = ["documents", "question", "citations", "search", "notes", "compare", "record", "aiuse", "readingBackup"];
/**
 * A part as the dialog ticks it and openExport(preselect) names it: a built-in part, or a tool module's own part by its id (ExportPartDef.part;
 * ruling R7). Module parts are listed after the built-in ones (lib/export/moduleParts).
 */
export type ExportPartId = ExportPart | string;
/** Every part but the reading list backup (it carries the PDFs' text, and only moves a reading list to another account). */
export const DEFAULT_EXPORT_PARTS: ExportPart[] = EXPORT_PARTS.filter((p) => p !== "readingBackup");

/** What the project export reads, all of it the browser's (see ExportDeps in lib/vault/export.ts): ciphertext from the api, opened here. */
export type ProjectExportDeps = {
  /** The project, with its title as the api lists it (ciphertext when titleKeyVersion is 1 or more). */
  project: Titled;
  /** The copy (lib/i18n t): the cards CSV's and the question's labels are the panels' own. */
  t: T;
  /** GET /projects/:id/documents. */
  listDocuments(): Promise<ExportDocSummary[]>;
  getDocument(id: string): Promise<ExportDoc>;
  decrypt(doc: ExportDoc): Promise<string>;
  /** openTitle (lib/vault/titles) under the vault: the project's key id is projectKeyId(id), a document's its own id. */
  openTitle(t: Titled, keyId: string): Promise<OpenedTitle>;
  /** A blob of this project opened in the browser (GET /projects/:id/blobs/:kind, then the vault), or null when the project has none. */
  readBlob(kind: BlobKind): Promise<string | null>;
  /** GET /projects/:id/writing-record. */
  writingRecord(): Promise<WritingRecord>;
  /** GET /ai/log?projectId=<id>: this project's AI-use log, as the AI-use statement reads it (rows logged with no project are not in it). */
  aiUseLog(): Promise<AiuEntry[]>;
};
/** What a tool module's export part builds from (ExportPartDef in lib/tools/registry.ts; ruling R7): the project export's reads, and the export's time. */
export type ExportDeps = ProjectExportDeps & { now: Date };
/** `progress` hears each ticked part as its files are made, a module's part by its id (the dialog's line while the zip is built, W31). */
export type ProjectExportOptions = { style: CitationStyle; now: Date; lastSearch: RsPaper[] | null; progress?(part: ExportPartId): void };

/** appuscholar-<title>-YYYY-MM-DD.zip: the opened title as zipName makes it, by the local calendar day. */
export function projectExportFileName(title: string, now: Date): string {
  return `appuscholar-${zipName(title)}-${localDay(now)}.zip`;
}

/** What a stage blob that does not open is called in unreadable.txt: the part it belongs to (the reading list's own index otherwise). */
const KIND_NAME: Partial<Record<BlobKind, string>> = {
  idea_intake: "exp_part_question", citations: "exp_part_citations", ap_notes: "exp_part_notes", ap_cols: "exp_part_compare", shelf_cols: "exp_part_compare"
};

/** The list of what did not open: the export's own file, never a module's. */
const UNREADABLE = "unreadable.txt";
/** v1's pdDownload: a byte-order mark, then the CSV's text. */
const BOM = "﻿";
const csvBlob = (text: string) => new Blob([BOM + text], { type: "text/csv;charset=utf-8" });

/** The citation library's entries as search results, for rsCsvText (the library holds no source, abstract or AI reading, so those columns are empty). */
export function keptPapers(lib: CitationEntry[]): RsPaper[] {
  return lib.map((e) => ({ title: e.title ?? "", authors: e.author ?? "", year: e.year ?? "", venue: e.source || e.container || "", doi: e.doi ?? "", url: e.url, source: "" }));
}

/** The reference list in `style` as plain text: the style's heading, then each reference (bibliography, the list Insert reference list writes). */
function referencesText(lib: CitationEntry[], style: CitationStyle): string {
  const b = bibliography(lib, style);
  return b.head + "\n\n" + b.items.map((x) => x.fmt.ref).join("\n\n") + "\n";
}

/** A tool's own download, caught: the builder hands its file to `download`, and its bytes are kept here (as they are: a text read would drop the byte-order mark). */
async function caught(run: (download: (name: string, file: Blob) => void) => void): Promise<Uint8Array | null> {
  let got: Blob | null = null;
  run((_name, file) => { got = file; });
  return got ? new Uint8Array(await (got as Blob).arrayBuffer()) : null;
}

type Paper = { title: string; highlights: Highlight[]; note?: ApNoteLike };
/**
 * One paper's reading notes: its highlights with their page and the student's note on each, the student's own words by stage, the AI's text marked
 * "AI:" (the plan's mark, in every language), the card. Every other label is the copy's.
 */
function notesText(p: Paper, t: T): string {
  const L = cardLabels(t);
  let s = p.title + "\n" + "=".repeat(p.title.length) + "\n\n";
  if (p.highlights.length) {
    s += t("exp_highlights") + "\n";
    for (const h of p.highlights) s += t("exp_page", { page: h.page }) + ": \"" + h.quote + "\"\n" + (h.note ? "  " + h.note + "\n" : "");
    s += "\n";
  }
  const stages = p.note?.stages ?? {};
  for (const st of AP_STAGES) {
    const x = stages[st.k];
    const res = x?.res as { reading?: unknown; raw?: unknown } | null | undefined;
    const ai = String(res?.reading || res?.raw || "");
    if (!x || (!x.mine && !ai)) continue;
    s += stageName(t, st.k) + "\n";
    if (x.mine) s += L.myWords + " " + x.mine + "\n";
    if (ai) s += "AI: " + ai + "\n";
    s += "\n";
  }
  const card = p.note?.card ?? {};
  const fields: Array<[string, string]> = [["strengths", L.strengths], ["weak", L.weak], ["verdict", L.verdict], ["notes", L.notes], ["reflection", t("exp_reflection")]];
  for (const [k, label] of fields) if (typeof card[k] === "string" && card[k]) s += label + "\n" + card[k] + "\n\n";
  return s;
}

/** The question's four fields under the Idea panel's labels, then the stored read after "AI read:" (exp_ai_read). */
function questionText(i: BlobShape<"idea_intake">, t: T): string {
  const f: Array<[string, string]> = [["idea_topic_label", i.topic], ["idea_resources_label", i.resources], ["idea_timeframe_label", i.timeframe], ["idea_constraints_label", i.constraints]];
  let s = f.map(([k, v]) => t(k) + "\n" + v + "\n").join("\n");
  const read = (i as { read?: { text?: unknown } }).read?.text;
  if (typeof read === "string" && read) s += "\n" + t("exp_ai_read") + "\n" + read + "\n";
  return s;
}

/**
 * The ticked parts of one project as one zip, at these paths: `documents/<title>.doc` and `.html` (sources under `documents/sources/`),
 * `question.txt`, `citations/library.json` and `citations/references.txt`, `search/kept-papers.csv` (and `search/last-search.csv` when this
 * session ran a search), `notes/<paper title>.txt`, `compare/table.csv` and `compare/paper-cards.csv`, `writing-record.txt`,
 * `ai-use-statement.txt`, `reading-list-backup.json`. A part with nothing in it writes no file. Deleted documents are left out. A document or a
 * blob that does not open (VaultError "corrupt"), or a blob that is not of its kind's shape, is left out and named in `unreadable.txt`, as the
 * account export lists it in index.json; the rest still export. Any other failure rejects.
 * A tool module's part (ExportPartDef, Task G3) comes after the built-in parts: its `build` gets the export's reads and time, and each file it
 * gives is put at its `path`. A path already in the zip (a built-in part's file, another module's) or `unreadable.txt` is refused: the export
 * rejects rather than lose a file. What a module's blobs do not open is the module's to say; a build that throws rejects the export.
 */
export async function exportProject(d: ProjectExportDeps, parts: ReadonlyArray<ExportPart | ExportPartDef>, o: ProjectExportOptions): Promise<Blob> {
  const on = new Set(parts.filter((p): p is ExportPart => typeof p === "string"));
  const zip = new JSZip();
  const t = d.t;
  const blobs = new Map<string, Promise<unknown>>();
  // What did not open, in the order it was met, each named once: unreadable.txt.
  const unreadable: string[] = [];
  const lost = (line: string) => { if (!unreadable.includes(line)) unreadable.push(line); };
  // Each blob read once, whichever parts need it; one that does not open or is not of its kind's shape reads as none, and is named.
  const blob = <K extends BlobKind>(kind: K, name?: string): Promise<BlobShape<K> | null> => {
    if (!blobs.has(kind)) {
      const bad = () => { lost(name !== undefined ? t("exp_unreadable_paper", { name }) : t("exp_unreadable_data", { name: t(KIND_NAME[kind] ?? "exp_kind_shelf") })); return null; };
      blobs.set(kind, d.readBlob(kind).then((s) => (s === null ? null : (parseBlob(kind, s) ?? bad())), (e) => {
        if (e instanceof VaultError && e.code === "corrupt") return bad();
        throw e;
      }));
    }
    return blobs.get(kind) as Promise<BlobShape<K> | null>;
  };
  // The shelf's papers in its order, each with its text, highlights and cells once read (null when its blob is missing or does not open); read once.
  let shelfRead: Promise<ShelfItem[]> | null = null;
  const shelf = (): Promise<ShelfItem[]> => (shelfRead ??= (async () => {
    const items: ShelfItem[] = [];
    for (const e of (await blob("shelf_index")) ?? []) items.push({ ...e, paper: await blob(shelfPaperKind(e.id), e.title || UNTITLED) });
    return items;
  })());
  const library = async () => (await blob("citations")) ?? [];
  const apNotes = async () => (await blob("ap_notes")) ?? {};
  const step = (part: ExportPart) => { if (on.has(part)) o.progress?.(part); return on.has(part); };

  if (step("documents")) {
    const names = new Map<string, Set<string>>();
    for (const s of await d.listDocuments()) {
      if (s.deletedAt) continue;
      const title = fileTitle(await d.openTitle(s, s.id));
      let html: string;
      try {
        html = await d.decrypt(await d.getDocument(s.id));
      } catch (e) {
        if (e instanceof VaultError && e.code === "corrupt") { lost(t("exp_unreadable_doc", { name: title })); continue; }
        throw e;
      }
      const dir = s.kind === "source" ? "documents/sources" : "documents";
      const used = names.get(dir) ?? new Set<string>();
      names.set(dir, used);
      const base = `${dir}/${unique(zipName(title), used)}`;
      zip.file(base + ".html", htmlFile(title, html));
      zip.file(base + ".doc", wordText(title, html));
    }
  }
  if (step("question")) {
    const i = await blob("idea_intake");
    if (i) zip.file("question.txt", questionText(i, t));
  }
  if (step("citations")) {
    const lib = await library();
    if (lib.length) {
      // The class-share file is v1's format: none of the fields a kept paper carries from wave B (ruling B2-R13).
      zip.file("citations/library.json", exportLibrary(forLibraryFile(lib)));
      zip.file("citations/references.txt", referencesText(lib, o.style));
    }
  }
  if (step("search")) {
    const lib = await library();
    if (lib.length) zip.file("search/kept-papers.csv", csvBlob(rsCsvText(keptPapers(lib))));
    if (o.lastSearch?.length) zip.file("search/last-search.csv", csvBlob(rsCsvText(o.lastSearch)));
  }
  if (step("notes")) {
    const items = await shelf();
    const notes = await apNotes();
    // One file per paper, by its id: two papers with the same title stay two files. A note joins the reading-list paper that has its pid (the note kept under
    // `p:<pid>`, Task 17). A note with no pid (one the migration has not reached) joins a shelf paper's file only when that title names exactly one of each; any other
    // note is a file of its own. An old note that moved to `p:<pid>` is the same paper and is not written twice, and a note with no words or card (the migration makes
    // one for every reading-list paper, to hold its cells) is no file.
    const papers = new Map<string, Paper>();
    const shelfOfPid = new Map<string, string>();
    for (const x of items) {
      if (x.paper?.notes.length) papers.set("shelf:" + x.id, { title: x.title, highlights: x.paper.notes });
      if (x.pid && !shelfOfPid.has(x.pid)) shelfOfPid.set(x.pid, "shelf:" + x.id);
    }
    const entries = Object.entries(notes).filter(([, n]) => n.movedTo === undefined).map(([id, n]) => ({ id, n, title: n.title || UNTITLED, pid: pidOfNote(id, n) }));
    for (const { id, n, title, pid } of entries) {
      const own = pid !== undefined ? papers.get(shelfOfPid.get(pid) ?? "") : undefined;
      if (own) { own.note = n; continue; }
      if (pid === undefined) {
        const shelfPapers = [...papers.entries()].filter(([k, p]) => k.startsWith("shelf:") && p.title === title);
        if (shelfPapers.length === 1 && entries.filter((e) => e.title === title).length === 1) { shelfPapers[0]![1].note = n; continue; }
      }
      if (noteHasWork(n)) papers.set("ap:" + id, { title, highlights: [], note: n });
    }
    const used = new Set<string>();
    for (const p of papers.values()) zip.file(`notes/${unique(zipName(p.title), used)}.txt`, notesText(p, t));
  }
  if (step("compare")) {
    const items = await shelf();
    const notes = await apNotes();
    if (items.length) {
      const cols = shColsOf(await blob("shelf_cols"), SHELF_DEFAULT_COLS);
      const file = await caught((download) => downloadMatrix(items, cols, { t, download }));
      if (file) zip.file("compare/table.csv", file);
    }
    const cards = acrossData(t, notes, apAcrossCols(await blob("ap_cols")), false);
    if (cards.body.length) zip.file("compare/paper-cards.csv", csvBlob(apAcrossCsv(cards)));
  }
  if (step("record")) {
    const rec = await openRecordTitles(await d.writingRecord(), d.openTitle, UNTITLED);
    zip.file("writing-record.txt", buildRecordText(rec, APP_VERSION, localDay(o.now)));
  }
  if (step("aiuse")) {
    // The statement as the AI-use panel opens it: every logged kind ticked, no other tools, no ticks, the course format, and v2's sentences on where the log is kept (D-S2-58).
    const list = await d.aiUseLog();
    const built = aiuBuildV2({
      list, keep: Object.fromEntries(list.map((e) => [e.k, 1 as const])), other: "", fmt: "course",
      ticks: { own: false, reword: false, cite: false, facts: false, noData: false }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS
    });
    zip.file("ai-use-statement.txt", "text" in built ? built.text : built.refuse);
  }
  if (step("readingBackup")) {
    const items = await shelf();
    const file = items.some((x) => x.paper) ? await caught((download) => backupShelf(items, { t, now: () => o.now, download, setStatus: () => {} })) : null;
    if (file) zip.file("reading-list-backup.json", file);
  }
  for (const m of parts) {
    if (typeof m === "string") continue;
    o.progress?.(m.part);
    for (const f of await m.build({ ...d, now: o.now })) {
      if (f.path === UNREADABLE || zip.file(f.path) !== null) throw new Error(`Export part "${m.part}" would overwrite ${f.path}.`);
      zip.file(f.path, f.data);
    }
  }
  if (unreadable.length) zip.file(UNREADABLE, t("exp_unreadable_head") + "\n\n" + unreadable.join("\n") + "\n");
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

/**
 * The export dialog's download: the zip is built, the export is logged (POST /me/export-audit, through `audit`) once it is built and before
 * it is saved, as the account export does, then saved under the project's opened title. A failed build logs nothing and saves nothing.
 */
export async function saveProjectExport(
  d: ProjectExportDeps, parts: ReadonlyArray<ExportPart | ExportPartDef>, o: ProjectExportOptions, io: { audit(): Promise<void>; download(name: string, file: Blob): void }
): Promise<void> {
  const zipped = await exportProject(d, parts, o);
  const title = fileTitle(await d.openTitle(d.project, projectKeyId(d.project.id)));
  await io.audit();
  io.download(projectExportFileName(title, o.now), zipped);
}
