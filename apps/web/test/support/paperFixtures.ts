import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apBuild, captureRecordV2, rsEntryFromResultV2, type CitationEntry, type RsPaper } from "@appuscholar/core";
import type { ApNotes, ShelfIndex, ShelfPaper, StoredEntry } from "../../lib/blobs/kinds";
import { EMPTY_CITE_FORM, readForm } from "../../lib/cite/form";
import { citeImport, loadClassics } from "../../lib/cite/share";
import { addManual } from "../../lib/research/library";

/*
 * The stored data of a project as it is today, before any paper has an id (Task 17), built through the code that writes it: a search result
 * kept from Research, the one-click capture, a manual add, the citation form, the classic sources and a v1 library file (the golden file
 * captured from v1 running, imported through the panel's own import). Names and DOIs are made up or are DOIs already in the repo's recordings.
 */

const GOLDEN = join(__dirname, "../../../../packages/core/test/golden");

export const MU_TITLE = "A Study on the Improvement of College Students’ Psychological Pressure and Anxiety by Using English Psychological Script Activities";
export const SDT_TITLE = "Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being";
export const SDT_DOI = "10.1037/0003-066X.55.1.68";
export const MORNING_TITLE = "Morning light and study focus in college students";
export const THESIS_TITLE = "An unpublished thesis chapter on sleep hygiene";

/** A search result as Research keeps it (OpenAlex). */
const MU: RsPaper = { title: MU_TITLE, authors: "Mu, X., Li, Y.", authorList: ["Xin Mu", "Yan Li"], year: 2022, venue: "Frontiers in Psychology", doi: "10.3389/fpsyg.2022.91000", source: "OpenAlex" };

/** What addManual stores: it is called with the real function, so the entry has the shape the Research panel writes. */
function manualEntry(f: { title: string; author: string; year: string; source: string; doi: string }): CitationEntry {
  let got: CitationEntry | undefined;
  addManual(f, {
    lib: [], known: true, whenRead: async () => true, toast: () => {}, t: (k) => k, clear: () => {},
    update: (fn) => { got = fn([])[0]; return true; }
  });
  return got!;
}

/** The golden v1 library file (v1's own export), imported through the Citation Manager's import. */
export async function importedFromV1(): Promise<CitationEntry[]> {
  const cases = JSON.parse(readFileSync(join(GOLDEN, "citlib/cases.json"), "utf8")) as { imports: Array<{ id: string; text: string }> };
  const text = cases.imports.find((i) => i.id === "v1-export")!.text;
  let lib: CitationEntry[] = [];
  await citeImport(new File([text], "psychology-class-library.json"), {
    lib, t: (k) => k, toast: () => {}, read: async () => text,
    update: (fn) => { lib = fn(lib); return true; }
  });
  return lib;
}

/** The library as it is stored today: no entry has a pid, a reading-list flag, an abstract, an open-access link or an ack. */
export async function todayLibrary(): Promise<StoredEntry[]> {
  const sdt = captureRecordV2({ title: SDT_TITLE, author: "Ryan, Richard M.; Deci, Edward L.", year: "2000", source: "American Psychologist", doi: SDT_DOI, url: "https://example.org/sdt", volume: "55", issue: "1", pages: "68-78" });
  const pubmed = captureRecordV2({ title: "A fictional stand-in article for the capture test", author: "Schaefer EM; Gonzalez CB; Park JH", year: "2023", source: "Sleep Health Letters", doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/36000000/", volume: "12", issue: "4", pages: "13317" });
  const form = readForm({
    ...EMPTY_CITE_FORM, author: "Alvarez, Ana", year: "2023", title: MORNING_TITLE, source: "Journal of Student Sleep", volume: "7", issue: "1", pages: "5-19",
    month: "3", accessed: "2026-10-01", container: "", type: "Journal article"
  }, "apa");
  return [
    rsEntryFromResultV2(MU, "apa"),
    sdt,
    manualEntry({ title: "Statistical power analysis for the behavioral sciences", author: "Cohen, J.", year: "1988", source: "Lawrence Erlbaum Associates", doi: "10.4324/9780203771587" }),
    pubmed,
    form,
    ...loadClassics([]).lib.slice(0, 2),
    ...(await importedFromV1()).slice(0, 4)
  ];
}

const page = (...lines: string[]) => lines.join("\n");

/** Three papers on the reading list: one the library holds by DOI, one by title only, one it does not hold. Ids are shelf ids (shPaperId's shape). */
export function todayShelf(): { index: ShelfIndex; papers: Record<string, ShelfPaper> } {
  const index: ShelfIndex = [
    { id: "pmgq1a2b3c", title: SDT_TITLE, doi: SDT_DOI, file: "ryan-deci-2000.pdf", size: 412345, added: "2026-10-02T08:00:00.000Z", total: 12, kept: 12 },
    { id: "pmgq2d3e4f", title: MORNING_TITLE, file: "morning-light.pdf", size: 220001, added: "2026-10-03T09:30:00.000Z", total: 9, kept: 9 },
    { id: "pmgq3g4h5i", title: THESIS_TITLE, file: "thesis-chapter.pdf", size: 98765, added: "2026-10-04T11:15:00.000Z", total: 30, kept: 30 }
  ];
  const note = (id: string, page: number, quote: string, text: string) => ({ id, page, quote, note: text, at: "2026-10-05T10:00:00.000Z" });
  const papers: Record<string, ShelfPaper> = {
    pmgq1a2b3c: { pages: [page(SDT_TITLE, "Abstract", "Self-determination theory is an approach to human motivation."), page("Method", "We describe the theory.")], notes: [note("n1a", 1, "an approach to human motivation", "core idea")], cells: { Sample: "Not applicable", Method: "Review" } },
    pmgq2d3e4f: { pages: [page(MORNING_TITLE, "Abstract", "Forty students from one college took part.")], notes: [], cells: {} },
    pmgq3g4h5i: { pages: [page(THESIS_TITLE, "Introduction", "Sleep hygiene is the set of habits around bedtime.")], notes: [note("n3a", 1, "habits around bedtime", "define early")], cells: { Sample: "40 students, one college" } }
  };
  return { index, papers };
}

/** What Analyse a paper stored under the old keys ('a' + the squashed title cut at 24 + the characters read). */
export function todayNotes(): { notes: ApNotes; keys: { muAbstract: string; sdtAbstract: string; sdtPdf: string; morningPdf: string; pasted: string } } {
  const { papers } = todayShelf();
  const muAbstract = apBuild(MU_TITLE, [MU_TITLE + "\nA short abstract about script activities and anxiety in college students."], "abstract").id;
  const sdtAbstract = apBuild(SDT_TITLE, [SDT_TITLE + "\nSelf-determination theory is an approach to human motivation."], "abstract").id;
  const sdtPdf = apBuild(SDT_TITLE, papers.pmgq1a2b3c!.pages, "pdf").id;
  const morningPdf = apBuild(MORNING_TITLE, papers.pmgq2d3e4f!.pages, "pdf").id;
  const pasted = apBuild("Pasted notes for next week", ["Pasted notes for next week", "Read two papers and write a paragraph."], "paste").id;
  const notes: ApNotes = {
    [muAbstract]: { title: MU_TITLE, stages: { gap: { mine: "Anxiety is studied in students, but not with scripts.", res: { reading: "The paper tests script activities." } } }, card: {} },
    [sdtAbstract]: { title: SDT_TITLE, stages: { gap: { res: { reading: "A theory of motivation." } } }, card: { weak: "Only the abstract was read." } },
    [sdtPdf]: {
      title: SDT_TITLE,
      stages: { design: { mine: "A review of the theory, not an experiment.", res: { reading: "A narrative review." } }, gap: { mine: "It joins motivation and well-being." } },
      card: { strengths: "Clear definitions", verdict: "Worth citing" }
    },
    [morningPdf]: { title: MORNING_TITLE, stages: {}, card: { notes: "Small sample from one college." } },
    [pasted]: { title: "Pasted notes for next week", stages: { gap: { mine: "Plan the week." } }, card: {} }
  };
  return { notes, keys: { muAbstract, sdtAbstract, sdtPdf, morningPdf, pasted } };
}
