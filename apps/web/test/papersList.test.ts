import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import { tFormat } from "../lib/i18n";
import type { ApNote, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import { paperShort, paperStatus, papersOf, type ListedShelf, type Paper } from "../lib/papers/list";

/*
 * The Reading list's one list of kept papers (wave B Task 21a, register row D-S2-126): papersOf joins the library, the reading-list entries and the notes by pid; paperShort and
 * paperStatus write a row's two lines as the canvas's Read screen does.
 */

const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => tFormat(E, E, k, "en", v);

const shelf = (id: string, over: Partial<ListedShelf> = {}): ListedShelf =>
  ({ id, title: "T " + id, file: id + ".pdf", size: 1, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1, ...over });
const paperWith = (n: number): ShelfPaper => ({ pages: ["x"], notes: Array.from({ length: n }, (_, i) => ({ id: "n" + i, page: 1, quote: "q" + i, note: "", at: "" })), cells: {} });
const note = (over: Partial<ApNote> = {}): ApNote => ({ stages: {}, card: {}, ...over });

describe("papersOf", () => {
  const A: StoredEntry = { author: "Schaefer, C.", year: "2019", title: "Open-label placebos", pid: "ka" };
  const B: StoredEntry = { author: "Putwain, D.", year: "2008", title: "Examination stress", pid: "kb", rl: true };
  const C: StoredEntry = { author: "Hidden, H.", year: "2001", title: "Only in the library", pid: "kc", rl: false };

  it("lists the library's entries that are on the reading list in library order, then the papers only the reading list has by date added", () => {
    const s2 = shelf("s2", { pid: "kx", added: "2026-03-01T00:00:00.000Z" });
    const s1 = shelf("s1", { pid: "ky", added: "2026-02-01T00:00:00.000Z" });
    const list = papersOf([B, C, A], [s2, shelf("sa", { pid: "ka" }), s1], null);
    expect(list.map((p) => p.pid)).toEqual(["kb", "ka", "ky", "kx"]);
    expect(list.map((p) => [p.entry?.title ?? null, p.shelf?.id ?? null])).toEqual([["Examination stress", null], ["Open-label placebos", "sa"], [null, "s1"], [null, "s2"]]);
  });

  it("an entry with rl false is on the list once a PDF is attached to it", () => {
    const list = papersOf([C], [shelf("sc", { pid: "kc" })], null);
    expect(list.map((p) => [p.pid, p.entry?.title, p.shelf?.id])).toEqual([["kc", "Only in the library", "sc"]]);
  });

  it("each paper carries the note kept under p:<pid>", () => {
    const n = note({ take: "mine" });
    const list = papersOf([A, B], [], { "p:ka": n, "aOldKey": note() });
    expect(list.map((p) => p.note)).toEqual([n, null]);
  });

  it("an entry the paper-id migration has not reached still counts, with the id empty and no note", () => {
    const list = papersOf([{ author: "X, Y.", title: "No id yet" }], [shelf("s1")], { "p:": note() });
    expect(list.map((p) => [p.pid, p.entry?.title ?? null, p.note])).toEqual([["", "No id yet", null], ["", null, null]]);
  });

  it("a second PDF with the pid of a paper already listed is a row of its own, so nothing on the list is hidden", () => {
    const list = papersOf([A], [shelf("s1", { pid: "ka", added: "2026-01-01T00:00:00.000Z" }), shelf("s2", { pid: "ka", added: "2026-01-02T00:00:00.000Z" })], null);
    expect(list.map((p) => [p.entry?.title ?? null, p.shelf?.id])).toEqual([["Open-label placebos", "s1"], [null, "s2"]]);
  });
});

describe("paperShort", () => {
  const short = (e: Partial<StoredEntry>, s: ListedShelf | null = null): string => paperShort({ pid: "k", entry: Object.keys(e).length ? e : null, shelf: s, note: null }, t);

  it("one author: Surname, year: the first four words of the title in lower case", () => {
    expect(short({ author: "Putwain, D.", year: "2008", title: "Examination Stress and Its Effects on Students" })).toBe("Putwain, 2008: examination stress and its");
  });
  it("two authors are joined with and, three or more are the first with et al.", () => {
    expect(short({ author: "Cai, X.; Pan, Y.", year: "2018", title: "Attentional bias modification" })).toBe("Cai and Pan, 2018: attentional bias modification");
    expect(short({ author: "Schaefer, C.; Denke, C.; Harke, H.", year: "2019", title: "Open-label placebos reduce test anxiety" })).toBe("Schaefer et al., 2019: open-label placebos reduce test");
    expect(short({ author: "Org name", year: "2020", title: "A report" })).toBe("Org name, 2020: a report");
  });
  it("leaves out what the paper does not have, and ends no word with a comma", () => {
    expect(short({ title: "Only a title here" })).toBe("Only a title here");
    expect(short({ author: "Cohen, J.", title: "Power analysis," })).toBe("Cohen: power analysis");
    expect(short({ year: "1988", title: "Power analysis" })).toBe("1988: power analysis");
    expect(short({})).toBe("Untitled paper");
  });
  it("a paper only the reading list has is named by its title", () => {
    expect(paperShort({ pid: "k", entry: null, shelf: shelf("s1", { title: "Sleep and memory in adolescents" }), note: null }, t)).toBe("Sleep and memory in adolescents");
  });
});

describe("paperStatus", () => {
  const ENTRY: StoredEntry = { author: "Schaefer, C.", year: "2019", title: "Open-label placebos", pid: "ka" };
  const p = (over: Partial<Paper>): Paper => ({ pid: "ka", entry: ENTRY, shelf: null, note: null, ...over });
  // The four rows of the canvas's Read screen, and the cases that sit between them.
  const STATUS_CASES: Array<[string, Paper, string]> = [
    ["highlights", p({ shelf: { ...shelf("s", { pid: "ka" }), paper: paperWith(2) } }), "Reading. 2 highlights"],
    ["one highlight", p({ shelf: { ...shelf("s", { pid: "ka" }), paper: paperWith(1) } }), "Reading. 1 highlight"],
    ["no PDF", p({ entry: { ...ENTRY, author: "Putwain, D." } }), "Not read yet. No PDF"],
    ["authors missing", p({ entry: { ...ENTRY, author: "" }, shelf: shelf("s", { pid: "ka" }) }), "Not read yet. Authors missing"],
    ["a book", p({ entry: { ...ENTRY, type: "Book" } }), "Book. Reference only"],
    ["a PDF nobody has read", p({ shelf: { ...shelf("s", { pid: "ka" }), paper: paperWith(0) } }), "Not read yet"],
    ["a PDF whose text is still being read", p({ shelf: shelf("s", { pid: "ka" }) }), "Not read yet"],
    ["only the student's take", p({ shelf: shelf("s", { pid: "ka" }), note: note({ take: "Two lines of my own." }) }), "Reading"],
    ["no PDF and no authors", p({ entry: { ...ENTRY, author: undefined } }), "Not read yet. No PDF. Authors missing"],
    ["a book with no authors", p({ entry: { ...ENTRY, type: "Book", author: "" } }), "Book. Reference only. Authors missing"],
    ["a paper only the reading list has", p({ entry: null, shelf: shelf("s") }), "Not read yet"],
  ];
  it.each(STATUS_CASES)("paperStatus: %s", (_name, paper, want) => {
    expect(paperStatus(paper, t)).toBe(want);
  });
  it("a take written in a walk-through stage counts as reading too", () => {
    expect(paperStatus(p({ shelf: shelf("s"), note: note({ stages: { design: { mine: "my words" } } }) }), t)).toBe("Reading");
    expect(paperStatus(p({ shelf: shelf("s"), note: note({ stages: { design: { mine: "  " } } }) }), t)).toBe("Not read yet");
  });
});
