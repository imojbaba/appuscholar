import { AP_SAMPLE, apDocxText, apFileKind, apFileStem, apLoadRefusal, apTitleOf, shTitleGuess } from "@appuscholar/core";
import type { ShelfIndex, StoredEntry } from "@/lib/blobs/kinds";
import { noteKey } from "@/lib/papers/ids";
import { papersOf, type Paper } from "@/lib/papers/list";
import { extractPdfPages, PdfReaderUnavailable } from "@/lib/shelf/extract";
import { loadDoc } from "./useApDoc";

/*
 * The ways a paper reaches the reader (v1 9882-9932, wave B Task 27): a kept paper of the Reading list (its text, else its abstract), pasted text, a Word or text file, and the practice paper. v1's
 * dropdown of the Reading shelf and Research's "📄 Analyse this paper" (an abstract handed over through the workspace) are the Reading list's Read and Find's "Read it now" now: both open
 * `fromKept` by the paper's id. The rules and titles are core's (analyse-page.ts, golden `appanel`); the sentences are v1's, through t().
 */
type T = (key: string, vars?: Record<string, string | number>) => string;
export type IntakeDeps = {
  toast(msg: string): void;
  t: T;
  /** Task 11's extractor (the first 200 pages); a test passes a fake. */
  extractPdf?: typeof extractPdfPages;
  /** mammoth's extractRawText value; a test passes a fake. Throws when the Word reader cannot be loaded. */
  readDocx?(file: File): Promise<string>;
  readText?(file: File): Promise<string>;
};

/*
 * Each choice of a paper takes a ticket (nextIntake) before anything else and every step that waits checks it again (isCurrentIntake): the latest choice wins, and a paper still being read when
 * another was chosen is dropped without a toast and without loading (fix wave A, Task 16; walk fault W20, register D-S2-30). v1 loaded whichever read finished last.
 */
let intakeCount = 0;
export const nextIntake = (): number => ++intakeCount;
export const isCurrentIntake = (n: number): boolean => n === intakeCount;

/** apLoad (9882-9891): v1's two refusals (an abstract under 150 characters that are not white space, any other paper under 500), else the paper is loaded. */
export function loadPaper(title: string, pages: string[], src: string, isSample: boolean, d: Pick<IntakeDeps, "toast" | "t">, idOverride?: string): boolean {
  const r = apLoadRefusal(pages, src);
  if (r) { d.toast(r === "abstract" ? d.t("ap2_this_search_result_has") : d.t("ap2_this_file_has_too")); return false; }
  loadDoc(title, pages, src, isSample, idOverride);
  return true;
}

async function readBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.onerror = () => reject(r.error); r.readAsArrayBuffer(file); });
}
async function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = () => reject(r.error); r.readAsText(file); });
}
/** mammoth's extractRawText, as v1 calls it (9907); the chunk that holds mammoth not arriving is v1's "The Word reader needs the internet once to load" (9906). */
async function browserReadDocx(file: File, t: T): Promise<string> {
  let mammoth: typeof import("mammoth");
  try { mammoth = (await import("mammoth/mammoth.browser")).default; } catch { throw new Error(t("ap2_the_word_reader_needs")); }
  const o = await mammoth.extractRawText({ arrayBuffer: await readBuffer(file) });
  return o.value || "";
}

/** apFromFile (9900-9916): "Reading <name>…", then a PDF (its first 200 pages; the title from its first page, else the name), a Word .docx, a .txt; an old .doc and any other kind are refused. */
export async function fromFile(ticket: number, f: File, d: IntakeDeps): Promise<boolean> {
  const kind = apFileKind(f.name);
  try {
    d.toast(d.t("ap2_reading", { name: f.name }));
    if (kind === "pdf") {
      const r = await (d.extractPdf ?? extractPdfPages)(f);
      if (!isCurrentIntake(ticket)) return false;
      // Task 11's extractor stops at fewer than 200 characters (a scanned PDF); v1 reads those pages and apLoad refuses them with this sentence.
      if (r === "no-text" || r === "not-a-pdf") { d.toast(d.t("ap2_this_file_has_too")); return false; }
      return loadPaper(shTitleGuess(r.pages, apFileStem(f.name, "pdf")), r.pages, "pdf", false, d);
    }
    if (kind === "docx") {
      const raw = await (d.readDocx ? d.readDocx(f) : browserReadDocx(f, d.t));
      if (!isCurrentIntake(ticket)) return false;
      const t = apDocxText(raw);
      return loadPaper(apTitleOf(t, f.name), [t], "docx", false, d);
    }
    if (kind === "txt") {
      const text = await (d.readText ?? readFileText)(f);
      if (!isCurrentIntake(ticket)) return false;
      return loadPaper(apFileStem(f.name, "txt"), [text], "txt", false, d);
    }
    d.toast(kind === "doc" ? d.t("ap2_old_doc_files_cannot") : d.t("ap2_use_a_pdf_a"));
    return false;
  } catch (e) {
    if (!isCurrentIntake(ticket)) return false;
    d.toast(e instanceof PdfReaderUnavailable ? d.t("sh2_the_pdf_reader_needs") : e instanceof Error && e.message ? e.message : d.t("ap2_could_not_read_that"));
    return false;
  }
}

/** apFromPaste (9894-9899): the pasted text trimmed, its title the first line of more than 8 characters ("Pasted paper" when none). */
export function fromPaste(ticket: number, text: string, d: Pick<IntakeDeps, "toast" | "t">): boolean {
  if (!isCurrentIntake(ticket)) return false;
  const t = (text || "").trim();
  if (!t) { d.toast(d.t("ap2_paste_the_paper_text")); return false; }
  return loadPaper(apTitleOf(t, d.t("ap2_pasted_paper")), [t], "paste", false, d);
}

/**
 * What a kept paper's reader needs to find the paper and read its text: the library and the reading list (`papersOf` joins them by the paper's id), and one read of a reading-list
 * paper's text (lib/shelf/useShelf's readPaperOnce, which asks for the passphrase once when the vault is locked). `lib` and `index` are the library and the reading list as they were read;
 * a library or list that has not been read is the caller's to wait for, not an empty one.
 */
export type KeptDeps = Pick<IntakeDeps, "toast" | "t"> & {
  lib: StoredEntry[];
  index: ShelfIndex | null;
  read(shelfId: string): Promise<{ pages: string[] } | null>;
};

/**
 * v1's abstract-only load of Research's "Analyse this paper" (rsAnalyse 8407-8419) from a kept paper's entry: the title, its authors with the year and journal, the line "Abstract", and the
 * stored abstract, as the one page v1 builds ('Abstract' is the head's last line, a literal of v1's script, kept in English as v1 does in every language). Empty when the entry has no abstract.
 */
export function keptAbstractPages(e: StoredEntry | null): string[] {
  const ab = (e?.abstract ?? "").trim();
  if (!e || !ab) return [];
  const head = (e.title ?? "") + "\n" + (e.author ?? "") + (e.year ? " (" + e.year + ")" : "") + (e.source ? ". " + e.source : "") + "\nAbstract\n";
  return [head + ab];
}

/** The title a kept paper is read under: the library's, else the reading list's, else its file name. */
export const keptTitle = (p: Paper): string => (p.entry?.title ?? "").trim() || (p.shelf?.title ?? "").trim() || (p.shelf?.file ?? "");

/**
 * The reader's intake (wave B Task 27; it replaces apFromShelf 9923-9927 and rsAnalyse's hand-over): the kept paper `pid` is found in the library and the reading list (`papersOf`); when a PDF's
 * text (or Europe PMC's, Task 21b) is attached to it, that text is read once and loaded as a PDF under the paper's title; else the abstract Keep stored is loaded abstract-only (`src: "abstract"`,
 * v1's apLoad refusal for one under 150 characters stands). Either way the paper's notes are kept under `p:<pid>` (loadDoc's idOverride), the key Compare reads. A paper whose text cannot be read on
 * this device (locked and not unlocked, or broken) is not replaced by its abstract: it loads nothing, so the answer is false and the reader says the paper could not be read. A paper that is not
 * on the list loads nothing. A ticket that another choice has superseded while the text was being read loads nothing and says nothing (fix wave A Task 16, W20).
 */
export async function fromKept(ticket: number, pid: string, d: KeptDeps): Promise<boolean> {
  if (!isCurrentIntake(ticket)) return false;
  const paper = papersOf(d.lib, d.index ?? [], null).find((p) => p.pid === pid);
  if (!paper) return false;
  const title = keptTitle(paper);
  if (paper.shelf) {
    const text = await d.read(paper.shelf.id);
    if (!isCurrentIntake(ticket)) return false;
    if (!text || !text.pages?.length) return false;
    return loadPaper(title, text.pages, "pdf", false, d, noteKey(pid));
  }
  const pages = keptAbstractPages(paper.entry);
  if (!pages.length) return false;
  return loadPaper(title, pages, "abstract", false, d, noteKey(pid));
}

/** apSample (9932): v1's fictional practice paper, its title the first line of its first page; no tick needed. */
export function fromSample(ticket: number, d: Pick<IntakeDeps, "toast" | "t">): boolean {
  if (!isCurrentIntake(ticket)) return false;
  return loadPaper(AP_SAMPLE[0]!.split("\n")[0]!, AP_SAMPLE.slice(), "pdf", true, d);
}
