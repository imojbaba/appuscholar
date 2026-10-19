import { AP_SAMPLE, apDocxText, apFileKind, apFileStem, apLoadRefusal, apShelfLabel, apTitleOf, shTitleGuess } from "@appuscholar/core";
import type { ShelfIndex } from "@/lib/blobs/kinds";
import { extractPdfPages, PdfReaderUnavailable } from "@/lib/shelf/extract";
import { loadDoc } from "./useApDoc";

/*
 * The four ways a paper reaches Analyse a paper (v1 9882-9932): a file, pasted text, a paper of the Reading shelf and the practice paper, and Research's "📄 Analyse this paper" (an abstract,
 * kept as the workspace's pendingAnalyse). The rules and titles are core's (analyse-page.ts, golden `appanel`); the sentences are v1's, through t().
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

/** apLoad (9882-9891): v1's two refusals (an abstract under 150 characters that are not white space, any other paper under 500), else the paper is loaded. */
export function loadPaper(title: string, pages: string[], src: string, isSample: boolean, d: Pick<IntakeDeps, "toast" | "t">): boolean {
  const r = apLoadRefusal(pages, src);
  if (r) { d.toast(r === "abstract" ? d.t("ap2_this_search_result_has") : d.t("ap2_this_file_has_too")); return false; }
  loadDoc(title, pages, src, isSample);
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
export async function fromFile(f: File, d: IntakeDeps): Promise<boolean> {
  const kind = apFileKind(f.name);
  try {
    d.toast(d.t("ap2_reading", { name: f.name }));
    if (kind === "pdf") {
      const r = await (d.extractPdf ?? extractPdfPages)(f);
      // Task 11's extractor stops at fewer than 200 characters (a scanned PDF); v1 reads those pages and apLoad refuses them with this sentence.
      if (r === "no-text" || r === "not-a-pdf") { d.toast(d.t("ap2_this_file_has_too")); return false; }
      return loadPaper(shTitleGuess(r.pages, apFileStem(f.name, "pdf")), r.pages, "pdf", false, d);
    }
    if (kind === "docx") {
      const t = apDocxText(await (d.readDocx ? d.readDocx(f) : browserReadDocx(f, d.t)));
      return loadPaper(apTitleOf(t, f.name), [t], "docx", false, d);
    }
    if (kind === "txt") return loadPaper(apFileStem(f.name, "txt"), [await (d.readText ?? readFileText)(f)], "txt", false, d);
    d.toast(kind === "doc" ? d.t("ap2_old_doc_files_cannot") : d.t("ap2_use_a_pdf_a"));
    return false;
  } catch (e) {
    d.toast(e instanceof PdfReaderUnavailable ? d.t("sh2_the_pdf_reader_needs") : e instanceof Error && e.message ? e.message : d.t("ap2_could_not_read_that"));
    return false;
  }
}

/** apFromPaste (9894-9899): the pasted text trimmed, its title the first line of more than 8 characters ("Pasted paper" when none). */
export function fromPaste(text: string, d: Pick<IntakeDeps, "toast" | "t">): boolean {
  const t = (text || "").trim();
  if (!t) { d.toast(d.t("ap2_paste_the_paper_text")); return false; }
  return loadPaper(apTitleOf(t, d.t("ap2_pasted_paper")), [t], "paste", false, d);
}

/**
 * apShelfFill (9917-9922): the dropdown's first line and one line per paper of the shelf. `unread` is useShelf's loading, locked or broken: while the index is not read the first line is
 * "Choose a paper from your Reading shelf" (register D-S2-15); a read shelf with no index yet (null: no paper was ever added) or an empty one is "Your Reading shelf is empty", as v1.
 */
export function shelfOptions(index: ShelfIndex | null, unread: boolean, t: T): { empty: string; items: Array<{ id: string; label: string }> } {
  if (index === null && unread) return { empty: t("ap2_choose_a_paper_from"), items: [] };
  const list = index ?? [];
  return { empty: list.length ? t("ap2_choose_a_paper_from") : t("ap2_your_reading_shelf_is"), items: list.map((p) => ({ id: p.id, label: apShelfLabel(p, t("ap2_paper")) })) };
}

/**
 * apFromShelf (9923-9927): the paper chosen ("Choose a paper first" when none), loaded as a PDF under its title, else its file name. Its text is the shelf's own blob, read once (`loadPaper`, Task 11):
 * a paper whose text cannot be read on this device (locked and not unlocked, or broken) is reported with the shelf's own words, where v1's records always have their text.
 */
export async function fromShelf(id: string, d: Pick<IntakeDeps, "toast" | "t"> & { index: ShelfIndex | null; read(id: string): Promise<{ pages: string[] } | null> }): Promise<boolean> {
  const p = (d.index ?? []).find((x) => x.id === id);
  if (!p) { d.toast(d.t("ap2_choose_a_paper_first")); return false; }
  const paper = await d.read(p.id);
  if (!paper) { d.toast((p.title || p.file) + " " + d.t("sh2_could_not_be_read")); return false; }
  return loadPaper(p.title || p.file, paper.pages || [], "pdf", false, d);
}

/** apSample (9932): v1's fictional practice paper, its title the first line of its first page; no tick needed. */
export function fromSample(d: Pick<IntakeDeps, "toast" | "t">): boolean {
  return loadPaper(AP_SAMPLE[0]!.split("\n")[0]!, AP_SAMPLE.slice(), "pdf", true, d);
}

/** Research's "📄 Analyse this paper" (rsAnalyse 8407-8419, apLoad(title, [head+abstract], 'abstract', false)): the abstract the workspace kept (ruling R7), loaded abstract-only. */
export function fromPending(p: { title: string; pages: string[]; src: "abstract" }, d: Pick<IntakeDeps, "toast" | "t">): boolean {
  return loadPaper(p.title, p.pages.slice(), p.src, false, d);
}
