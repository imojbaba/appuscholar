import { describe, expect, it } from "vitest";
import { apBuild, exportLibrary } from "@appuscholar/core";
import type { ApNote, ApNotes, ShelfIndex, StoredEntry } from "../lib/blobs/kinds";
import { cellsToNotes, forLibraryFile, linkShelf, newPid, noteKey, paperMatch, pidOfNote, rekeyNotes, withPids } from "../lib/papers/ids";
import { MORNING_TITLE, SDT_DOI, SDT_TITLE, THESIS_TITLE, todayLibrary, todayNotes, todayShelf } from "./support/paperFixtures";

/*
 * The paper id (wave B, Task 17): one stable id for every kept paper, so the library, the reading list, the notes, the cards and Compare join on it.
 * The data is what today's code stores (test/support/paperFixtures.ts builds it through the writers).
 */

describe("newPid", () => {
  it("is 'k', the time in base 36 and four characters of [a-z0-9], and fits the shelf id pattern", () => {
    const pid = newPid();
    expect(pid).toMatch(/^k[0-9a-z]+$/);
    const time = pid.slice(1, -4);
    expect(Math.abs(parseInt(time, 36) - Date.now())).toBeLessThan(5000);
    expect(pid.slice(-4)).toMatch(/^[a-z0-9]{4}$/);
    expect(pid).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
  it("is not a shelf paper's id (those begin with p)", () => {
    for (let i = 0; i < 50; i++) expect(newPid().startsWith("p")).toBe(false);
  });
});

describe("withPids", () => {
  it("gives an entry without a pid one, keeps every other field, and leaves the ones that have one", async () => {
    const lib = await todayLibrary();
    expect(lib.every((e) => (e as StoredEntry).pid === undefined)).toBe(true);
    const out = withPids(lib);
    expect(out).toHaveLength(lib.length);
    out.forEach((e, i) => expect(e).toMatchObject(lib[i]!));
    expect(out.every((e) => /^k[0-9a-z]+$/.test(e.pid ?? ""))).toBe(true);
    // Once given, the same pids stay across any number of saves.
    expect(withPids(out)).toBe(out);
    expect(withPids([...out].reverse()).map((e) => e.pid)).toEqual(out.map((e) => e.pid).reverse());
  });
  it("is the same array when no entry lacks a pid", () => {
    const lib: StoredEntry[] = [{ title: "A", pid: "kone" }, { title: "B", pid: "ktwo" }];
    expect(withPids(lib)).toBe(lib);
    expect(withPids([])).toEqual([]);
  });
  it("gives a few hundred entries made in the same millisecond different pids", () => {
    const lib: StoredEntry[] = Array.from({ length: 800 }, (_, i) => ({ title: "Paper " + i }));
    const pids = withPids(lib).map((e) => e.pid);
    expect(new Set(pids).size).toBe(800);
  });
  it("does not change the array it is given", () => {
    const lib: StoredEntry[] = [{ title: "A" }];
    withPids(lib);
    expect(lib).toEqual([{ title: "A" }]);
  });
});

describe("paperMatch", () => {
  it("matches the same DOI, however it is written", () => {
    expect(paperMatch({ doi: "10.1037/X.1", title: "a" }, { doi: "https://doi.org/10.1037/x.1", title: "b" })).toBe(true);
    expect(paperMatch({ doi: " 10.1037/X.1 " }, { doi: "HTTPS://DX.DOI.ORG/10.1037/x.1" })).toBe(true);
  });
  it("two different DOIs are two papers, even with the same title", () => {
    expect(paperMatch({ doi: "10.1/a", title: SDT_TITLE, year: "2000" }, { doi: "10.1/b", title: SDT_TITLE, year: "2000" })).toBe(false);
  });
  it("without a DOI on both sides, the squashed title decides: equal and at least 20 characters", () => {
    expect(paperMatch({ title: "Why we sleep: unlocking the power of sleep and dreams" }, { title: "WHY WE SLEEP - Unlocking the Power of Sleep and Dreams!" })).toBe(true);
    expect(paperMatch({ title: "Sleep" }, { title: "sleep" })).toBe(false);
    expect(paperMatch({ title: "Why we sleep" }, { title: "Why we sleep" })).toBe(false);
    expect(paperMatch({ title: SDT_TITLE }, { title: MORNING_TITLE })).toBe(false);
  });
  it("one DOI and one without falls back to the title", () => {
    expect(paperMatch({ doi: SDT_DOI, title: SDT_TITLE }, { title: SDT_TITLE })).toBe(true);
  });
  it("the same year when both have one", () => {
    expect(paperMatch({ title: MORNING_TITLE, year: "2023" }, { title: MORNING_TITLE, year: "2023" })).toBe(true);
    expect(paperMatch({ title: MORNING_TITLE, year: "2023" }, { title: MORNING_TITLE, year: "2019" })).toBe(false);
    expect(paperMatch({ title: MORNING_TITLE, year: "2023" }, { title: MORNING_TITLE })).toBe(true);
    expect(paperMatch({ title: MORNING_TITLE, year: "2023" }, { title: MORNING_TITLE, year: "" })).toBe(true);
  });
});

describe("linkShelf", () => {
  it("a shelf paper with the library entry's DOI takes its pid; one matched by title too; an unmatched one gets its own", async () => {
    const lib = withPids(await todayLibrary());
    const { index } = todayShelf();
    const sdt = lib.find((e) => e.doi === SDT_DOI)!;
    const morning = lib.find((e) => e.title === MORNING_TITLE)!;
    const out = linkShelf(index, lib);
    expect(out).toHaveLength(3);
    expect(out[0]!.pid).toBe(sdt.pid);
    expect(out[1]!.pid).toBe(morning.pid);
    const alone = out[2]!.pid!;
    expect(alone).toMatch(/^k[0-9a-z]+$/);
    expect(lib.map((e) => e.pid)).not.toContain(alone);
    // Every field of an entry stays.
    out.forEach((e, i) => expect(e).toMatchObject(index[i]!));
    expect(index.every((e) => e.pid === undefined)).toBe(true);
  });
  it("the DOI decides before the title: a library entry with the DOI wins over an earlier one with only the title", () => {
    const lib: StoredEntry[] = [{ title: SDT_TITLE, pid: "kbytitle" }, { title: "Something else entirely about motivation", doi: SDT_DOI, pid: "kbydoi" }];
    const out = linkShelf([{ id: "p1", title: SDT_TITLE, doi: SDT_DOI, file: "a.pdf", size: 1, added: "", total: 1, kept: 1 }], lib);
    expect(out[0]!.pid).toBe("kbydoi");
  });
  it("a pid a shelf entry has stays, and the same array comes back when none lacks one", () => {
    const index: ShelfIndex = [{ id: "p1", title: "A", file: "a.pdf", size: 1, added: "", total: 1, kept: 1, pid: "kkeep" }];
    expect(linkShelf(index, [{ title: "A", pid: "kother" }])).toBe(index);
    const mixed: ShelfIndex = [...index, { id: "p2", title: "B", file: "b.pdf", size: 1, added: "", total: 1, kept: 1 }];
    const out = linkShelf(mixed, []);
    expect(out[0]!.pid).toBe("kkeep");
    expect(out[1]!.pid).toMatch(/^k/);
  });
  it("never takes the pid of a library entry that has none, and never hands one pid to two unmatched papers", () => {
    const index: ShelfIndex = Array.from({ length: 300 }, (_, i) => ({ id: "p" + i, title: "Unmatched paper number " + i, file: i + ".pdf", size: 1, added: "", total: 1, kept: 1 }));
    const out = linkShelf(index, [{ title: "Unmatched paper number 3" }]);
    expect(out[3]!.pid).toMatch(/^k/);
    expect(new Set(out.map((e) => e.pid)).size).toBe(300);
  });
});

describe("noteKey", () => {
  it("is p: and the pid", () => {
    expect(noteKey("kabc123")).toBe("p:kabc123");
  });
  it("pidOfNote reads the pid of a note kept under p:<pid>, or the one it carries", () => {
    expect(pidOfNote("p:kabc", { stages: {}, card: {} })).toBe("kabc");
    expect(pidOfNote("a123", { stages: {}, card: {}, pid: "kxyz" })).toBe("kxyz");
    expect(pidOfNote("a123", { stages: {}, card: {} })).toBeUndefined();
  });
});

describe("rekeyNotes", () => {
  const papers = [{ pid: "ksdt", title: SDT_TITLE }, { pid: "kmorning", title: MORNING_TITLE }];

  it("a note keyed by title and length moves to p:<pid>; the old key stays, with movedTo", () => {
    const { notes, keys } = todayNotes();
    const out = rekeyNotes(notes, papers);
    expect(out["p:kmorning"]).toMatchObject({ title: MORNING_TITLE, pid: "kmorning", stages: {}, card: { notes: "Small sample from one college." } });
    // The old note is still there, whole, and says where it went.
    expect(out[keys.morningPdf]).toEqual({ ...notes[keys.morningPdf], movedTo: "p:kmorning" });
    // A note about nothing on the list is not touched.
    expect(out[keys.pasted]).toBe(notes[keys.pasted]);
    // The input is not changed.
    expect(notes[keys.morningPdf]!.movedTo).toBeUndefined();
    expect(Object.keys(notes)).toEqual(Object.keys(todayNotes().notes));
  });

  it("the same paper read as an abstract and as a PDF ends on one note with both stages", () => {
    const { notes, keys } = todayNotes();
    // Two readings of one paper have two keys (the characters read differ) and one title.
    expect(keys.sdtAbstract).not.toBe(keys.sdtPdf);
    const out = rekeyNotes(notes, papers);
    const merged = out["p:ksdt"]!;
    expect(Object.keys(merged.stages).sort()).toEqual(["design", "gap"]);
    expect(merged.stages.design).toEqual(notes[keys.sdtPdf]!.stages.design);
    expect(out[keys.sdtAbstract]!.movedTo).toBe("p:ksdt");
    expect(out[keys.sdtPdf]!.movedTo).toBe("p:ksdt");
    expect(merged.pid).toBe("ksdt");
    expect(merged.title).toBe(SDT_TITLE);
  });

  it("the student's words of every reading are kept: distinct texts of one stage, and distinct values of one card field, are joined in note order with a blank line; the same text is there once (B2-R31)", () => {
    const a: ApNote = { title: SDT_TITLE, stages: { gap: { res: { reading: "first reading" } }, design: { mine: "words one", res: { reading: "r1" } }, stats: { mine: "same words" } }, card: { strengths: "", weak: "first weak", verdict: "same verdict" } };
    const b: ApNote = { title: SDT_TITLE, stages: { gap: { mine: "my words", res: { reading: "second reading" } }, design: { mine: "words two" }, stats: { mine: "same words" }, limits: { res: { reading: "only here" } } }, card: { strengths: "second strengths", weak: "second weak", verdict: "same verdict", notes: "second notes" } };
    const out = rekeyNotes({ a1: a, a2: b }, papers);
    const m = out["p:ksdt"]!;
    // Words in only one reading are that reading's, with its AI reading.
    expect(m.stages.gap).toEqual(b.stages.gap);
    expect(m.stages.limits).toEqual(b.stages.limits);
    // Words in both: both are there, the first reading's first; the AI reading is the first note with words'.
    expect(m.stages.design).toEqual({ mine: "words one\n\nwords two", res: { reading: "r1" } });
    // The same text in both readings is there once.
    expect(m.stages.stats).toEqual({ mine: "same words" });
    expect(m.card).toEqual({ strengths: "second strengths", weak: "first weak\n\nsecond weak", verdict: "same verdict", notes: "second notes" });
    // Every text either reading held is in the merged note.
    for (const text of ["words one", "words two", "first weak", "second weak"]) expect(JSON.stringify(m)).toContain(text);
    // The inputs are not changed.
    expect(a.stages.design!.mine).toBe("words one");
  });

  it("texts that differ only in the white space around them are the same text", () => {
    const out = rekeyNotes({
      a1: { title: SDT_TITLE, stages: { gap: { mine: "It joins them." } }, card: { verdict: "Good" } },
      a2: { title: SDT_TITLE, stages: { gap: { mine: "  It joins them.\n" } }, card: { verdict: "Good " } }
    }, papers);
    expect(out["p:ksdt"]!.stages.gap).toEqual({ mine: "It joins them." });
    expect(out["p:ksdt"]!.card.verdict).toBe("Good");
  });

  it("a note already kept under p:<pid> comes first, and an old note for the same paper joins it later", () => {
    const kept: ApNote = { title: SDT_TITLE, pid: "ksdt", stages: { gap: { mine: "kept words" } }, card: { verdict: "kept verdict" }, cells: { Sample: "n=1" }, take: "my take" };
    const late: ApNote = { title: SDT_TITLE, stages: { gap: { mine: "late words" }, design: { mine: "late design" } }, card: { verdict: "late verdict", notes: "late notes" } };
    const out = rekeyNotes({ "p:ksdt": kept, a9: late }, papers);
    expect(out["p:ksdt"]).toMatchObject({ pid: "ksdt", cells: { Sample: "n=1" }, take: "my take", stages: { gap: { mine: "kept words\n\nlate words" }, design: { mine: "late design" } }, card: { verdict: "kept verdict\n\nlate verdict", notes: "late notes" } });
    expect(out.a9!.movedTo).toBe("p:ksdt");
    // And that is the end of it: the second run adds nothing.
    expect(rekeyNotes(out, papers)).toBe(out);
  });

  it("a second run changes nothing, and the same object comes back", () => {
    const { notes } = todayNotes();
    const once = rekeyNotes(notes, papers);
    expect(rekeyNotes(once, papers)).toBe(once);
  });

  it("a note that already moved is not touched again: what a tab on the previous build writes to its old key stays there, the note it moved to is as it was (B2-R34)", () => {
    const first = rekeyNotes({ a1: { title: SDT_TITLE, stages: { design: { mine: "A survey." } }, card: { verdict: "Useful" } } }, papers);
    const edited: ApNotes = { ...first, a1: { ...first.a1!, stages: { ...first.a1!.stages, limits: { mine: "Written in the previous build." } }, card: { ...first.a1!.card, weak: "Self-report only." } } };
    expect(rekeyNotes(edited, papers)).toBe(edited);
    expect(edited["p:ksdt"]!.stages.limits).toBeUndefined();
  });

  it("a title two different papers share is left alone, and so is a note without a title", () => {
    const twin = [{ pid: "k1", title: SDT_TITLE }, { pid: "k2", title: SDT_TITLE.toUpperCase() }];
    const notes: ApNotes = { a1: { title: SDT_TITLE, stages: {}, card: { verdict: "v" } }, a2: { stages: {}, card: { verdict: "no title" } } };
    expect(rekeyNotes(notes, twin)).toBe(notes);
    expect(rekeyNotes(notes, [{ pid: "k1", title: SDT_TITLE }])["a2"]).toBe(notes.a2);
  });

  it("a paper known twice with the same pid (the library and the reading list) is one paper", () => {
    const out = rekeyNotes({ a1: { title: SDT_TITLE, stages: {}, card: { verdict: "v" } } }, [{ pid: "ksdt", title: SDT_TITLE }, { pid: "ksdt", title: SDT_TITLE.toLowerCase() }]);
    expect(out["p:ksdt"]!.card.verdict).toBe("v");
  });

  it("matches the real key rule: a note made by apBuild for a title is found by the title", () => {
    const id = apBuild(THESIS_TITLE, ["x ".repeat(30)], "pdf").id;
    expect(id).toMatch(/^a/);
    const out = rekeyNotes({ [id]: { title: THESIS_TITLE, stages: {}, card: { weak: "w" } } }, [{ pid: "kthesis", title: THESIS_TITLE }]);
    expect(out[id]!.movedTo).toBe("p:kthesis");
  });
});

describe("cellsToNotes", () => {
  it("a paper's matrix cells are copied to its note where the note has none, and a paper with no note gets one that has stages and card", () => {
    const notes: ApNotes = { "p:ka": { title: "A", pid: "ka", stages: { gap: { mine: "words" } }, card: { verdict: "v" } } };
    const out = cellsToNotes(notes, [
      { pid: "ka", title: "A", cells: { Sample: "40" } },
      { pid: "kb", title: "B", cells: {} }
    ]);
    expect(out["p:ka"]).toEqual({ ...notes["p:ka"], cells: { Sample: "40" } });
    expect(out["p:kb"]).toEqual({ title: "B", pid: "kb", stages: {}, card: {}, cells: {} });
    expect(notes["p:ka"]!.cells).toBeUndefined();
  });
  it("cells a note already has (even {}) are not written over, and the same object comes back when there is nothing to add", () => {
    const notes: ApNotes = { "p:ka": { stages: {}, card: {}, cells: { Sample: "typed in Compare" } }, "p:kb": { stages: {}, card: {}, cells: {} } };
    const out = cellsToNotes(notes, [{ pid: "ka", title: "A", cells: { Sample: "old" } }, { pid: "kb", title: "B", cells: { Sample: "old" } }]);
    expect(out).toBe(notes);
  });
});

describe("forLibraryFile", () => {
  it("leaves out pid, rl, abstract, oa, ack, ft and pmcid, which the class-share file never carried, and keeps every other field", () => {
    const lib: StoredEntry[] = [{ author: "Lee, K.", title: "A paper", year: "2024", doi: "10.1/x", pid: "kone", rl: true, abstract: "Long text", oa: "https://example.org/a.pdf", ack: ["numbers"], ft: { none: "10.1/x" }, pmcid: "PMC1", type: "Journal article", style: "apa" }];
    const file = JSON.parse(exportLibrary(forLibraryFile(lib))) as Array<Record<string, unknown>>;
    expect(file).toEqual([{ author: "Lee, K.", title: "A paper", year: "2024", doi: "10.1/x", type: "Journal article", style: "apa" }]);
  });
});
