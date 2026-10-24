import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { captureRecord, captureRecordV2, decodeCapture, type CitationEntry } from "@appuscholar/core";
import type { StoredEntry } from "../lib/blobs/kinds";
import { fillEmptyIn } from "../lib/cite/fillEmpty";
import { CAPTURE_PREFIX, fileCapture, readCapture, type FileCaptureDeps } from "../lib/cite/capture";

/*
 * The one-click capture's page side after wave B Task 20 (register row D-S2-125): the bookmark opens the adding screen, which reads the payload from the address (readCapture, the
 * address is left as it is) and files the paper through Task 18's keepEntry (fileCapture). v1's confirm question and its toasts are gone with the workspace tab (the adding screen
 * shows the paper instead). The bookmarklet's source, the decode and the entry are core's (packages/core/test/golden/citcapture.test.ts, citcapture-v2.test.ts, citcapture-v3.test.ts).
 * The payloads here are the golden ones from test/golden/citshare/cases.json, so what v1's bookmarklet sent is read as before.
 */
type Run = { libAfter: CitationEntry[] };
type Fx = {
  libBefore: CitationEntry[];
  captures: Array<{ id: string; hash: string; accepted: Run }>;
  bad: Array<{ id: string; hash: string }>;
};
const FX = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/citshare/cases.json"), "utf8")) as Fx;
const bad = (id: string) => FX.bad.find((b) => b.id === id)!;

/** The bookmarklet's hash for a payload, encoded as the bookmarklet encodes it (btoa of the UTF-8 JSON). */
const hashOf = (d: Record<string, string>) => CAPTURE_PREFIX + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(d)))));
/** What bookmarkletSourceV2 sends from a PubMed page (citation_authors, volume, issue, first page). */
const PM = { title: "Sleep timing and exam anxiety in first-year students", author: "Schaefer EM; Gonzalez CB; Lee K; Park J; Wu T", year: "2024", source: "Scientific reports", doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/41234567/", volume: "9", issue: "1", pages: "13317" };
/** The entry v1's bookmarklet left for the same PubMed page: no author, no volume, issue or pages. */
const PM_V1_ENTRY = captureRecord({ ...PM, author: "", volume: undefined, issue: undefined, pages: undefined } as never);

describe("readCapture reads the address of the adding screen", () => {
  it("a #capture= hash is a paper: the payload as sent, and the entry a Keep stores", () => {
    for (const c of FX.captures.filter((x) => x.id !== "title-only")) {
      const r = readCapture(c.hash);
      expect(r.kind, c.id).toBe("paper");
      if (r.kind !== "paper") continue;
      expect(r.data, c.id).toEqual(decodeCapture(c.hash.slice(CAPTURE_PREFIX.length)));
      expect(r.entry, c.id).toEqual(captureRecordV2(decodeCapture(c.hash.slice(CAPTURE_PREFIX.length))!));
    }
  });

  it("a hash that is not a capture is nothing to add (the address is never rewritten)", () => {
    expect(readCapture("")).toEqual({ kind: "none" });
    expect(readCapture(bad("other-hash").hash)).toEqual({ kind: "none" });
  });

  it("a payload that cannot be read, or has no title, is unreadable (v1 alerted the first and said nothing for the second)", () => {
    for (const id of ["not-base64", "not-json", "no-title", "json-null", "empty-capture"]) expect(readCapture(bad(id).hash), id).toEqual({ kind: "unreadable" });
  });

  it("W30: a bookmark dragged before the fix sends year \"09/1\"; neither the facts shown nor the entry carry it", () => {
    const r = readCapture(hashOf({ ...PM, year: "09/1" }));
    expect(r.kind).toBe("paper");
    if (r.kind !== "paper") return;
    expect(r.data.year).toBe("");
    expect(r.entry.year).toBe("");
  });

  it("a PubMed capture (bookmarkletSourceV2's payload) has every author as Surname, Initials and its volume, issue and pages (W1)", () => {
    const r = readCapture(hashOf(PM));
    expect(r.kind === "paper" && r.entry).toMatchObject({ author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T", volume: "9", issue: "1", pages: "13317" });
  });
});

/** A library as useProjectLibrary gives one: `update` applies to the stored entries, `fillEmpty` is fillEmptyIn as an update, both read the newest. */
function library(start: StoredEntry[], over: Partial<FileCaptureDeps> = {}) {
  const box = { stored: start.slice() };
  const update = vi.fn((fn: (p: StoredEntry[]) => StoredEntry[]) => { box.stored = fn(box.stored); return true; });
  const fillEmpty = vi.fn((match: (e: CitationEntry) => boolean, fill: Partial<CitationEntry>) => update((p) => fillEmptyIn(p, match, fill) as StoredEntry[]));
  const deps = (): FileCaptureDeps => ({ lib: box.stored, update, fillEmpty, ready: true, loading: false, locked: false, broken: false, error: false, ...over });
  return { box, update, fillEmpty, deps };
}
const entryOf = (hash: string) => { const r = readCapture(hash); if (r.kind !== "paper") throw new Error("not a paper"); return r.entry; };

describe("fileCapture keeps through keepEntry (Task 18)", () => {
  it("a paper not kept is kept with a pid and on the reading list; the same paper again is already kept and changes nothing", () => {
    const lib = library([...FX.libBefore]);
    const rec = entryOf(FX.captures[0]!.hash);
    expect(fileCapture(rec, lib.deps())).toEqual({ state: "kept", filled: false });
    expect(lib.box.stored).toHaveLength(FX.libBefore.length + 1);
    expect(lib.box.stored.at(-1)).toMatchObject({ ...rec, rl: true, pid: expect.stringMatching(/^k/) });
    const before = lib.box.stored;
    expect(fileCapture(rec, lib.deps())).toEqual({ state: "already", filled: false });
    expect(lib.box.stored).toBe(before);
    expect(lib.fillEmpty).not.toHaveBeenCalled();
  });

  it("every golden capture is kept once and is then already kept", () => {
    for (const c of FX.captures) {
      const lib = library([...FX.libBefore]);
      const rec = entryOf(c.hash);
      expect(fileCapture(rec, lib.deps()).state, c.id).toBe("kept");
      expect(lib.box.stored.map(({ pid: _p, rl: _r, ...e }) => e), c.id).toEqual(c.accepted.libAfter);
      expect(fileCapture(rec, lib.deps()).state, c.id).toBe("already");
      expect(lib.box.stored, c.id).toHaveLength(c.accepted.libAfter.length);
    }
  });

  it("\"Smith JA\" and \"Smith, JA\" captures of one DOI are one paper (the DOI decides, wave A LATER T8)", () => {
    const lib = library([]);
    const a = entryOf(hashOf({ ...PM, doi: "10.1038/s41598-024-00001-x", author: "Smith JA" }));
    const b = entryOf(hashOf({ ...PM, doi: "https://doi.org/10.1038/S41598-024-00001-X", author: "Smith, JA", title: "Another way of writing the title" }));
    expect(fileCapture(a, lib.deps()).state).toBe("kept");
    expect(fileCapture(b, lib.deps()).state).toBe("already");
    expect(lib.box.stored).toHaveLength(1);
  });

  it("R15: a recapture of an authorless kept paper fills its empty fields, authors first, and says so (W1 must not regress)", () => {
    const start: StoredEntry[] = [...FX.libBefore, { ...PM_V1_ENTRY, pid: "kold", rl: true }];
    const lib = library(start);
    const rec = entryOf(hashOf(PM));
    expect(fileCapture(rec, lib.deps())).toEqual({ state: "already", filled: true });
    expect(lib.box.stored).toHaveLength(start.length);
    expect(lib.box.stored.at(-1)).toEqual({ ...PM_V1_ENTRY, pid: "kold", rl: true, author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T", volume: "9", issue: "1", pages: "13317" });
    expect(lib.box.stored.slice(0, -1)).toEqual(FX.libBefore);
    // Capturing it again fills nothing: it is already kept, and nothing is saved.
    const before = lib.box.stored;
    const again = lib.fillEmpty.mock.calls.length;
    expect(fileCapture(rec, lib.deps())).toEqual({ state: "already", filled: false });
    expect(lib.box.stored).toBe(before);
    expect(lib.fillEmpty).toHaveBeenCalledTimes(again);
  });

  it("R15 holds when the student changed the year by hand, or v1 had saved \"09/1\": the same title with no author is filled, not added twice", () => {
    for (const year of ["2023", "09/1"]) {
      const start: StoredEntry[] = [{ ...PM_V1_ENTRY, year, pid: "kold", rl: true }];
      const lib = library(start);
      expect(fileCapture(entryOf(hashOf(PM)), lib.deps()), year).toEqual({ state: "already", filled: true });
      expect(lib.box.stored, year).toHaveLength(1);
      expect(lib.box.stored[0], year).toMatchObject({ year, author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T", volume: "9" });
    }
  });

  it("R15 also fills a paper kept by DOI whose authors Crossref has not given yet, with the entry that has the pid", () => {
    const kept: StoredEntry = { title: "Sleep timing and examination anxiety in first year students", author: "", year: "2024", doi: "10.1038/s41598-024-00001-x", source: "", type: "Journal article", style: "apa", pid: "kdoi", rl: true };
    const other: StoredEntry = { title: "Another paper entirely, about other things", author: "", year: "2020", doi: "10.1/other", pid: "kother", rl: true };
    const lib = library([other, kept]);
    const rec = entryOf(hashOf({ ...PM, doi: "10.1038/s41598-024-00001-x" }));
    expect(fileCapture(rec, lib.deps())).toEqual({ state: "already", filled: true });
    expect(lib.box.stored[1]).toMatchObject({ pid: "kdoi", title: kept.title, author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T", source: "Scientific reports" });
    expect(lib.box.stored[0]).toBe(other);
  });

  describe("the DOI decides when both papers have one (D-S2-125; wave A's title rules apply only when the DOIs do not disagree)", () => {
    const EDITORIAL = { title: "Editorial", source: "", volume: "", issue: "", pages: "", url: "" };
    const stored = (over: Partial<StoredEntry>): StoredEntry => ({ title: "Editorial", author: "", year: "2024", type: "Journal article", style: "apa", pid: "kold", rl: true, ...over });

    it("an authorless Editorial with one DOI and a capture of another paper called Editorial with a different DOI: the new paper is kept, nothing is filled into the old record", () => {
      const old = stored({ doi: "10.1/a" });
      const lib = library([old]);
      const rec = entryOf(hashOf({ ...EDITORIAL, author: "Smith J", year: "2024", doi: "10.1/b" }));
      expect(fileCapture(rec, lib.deps())).toEqual({ state: "kept", filled: false });
      expect(lib.box.stored).toHaveLength(2);
      expect(lib.box.stored[0]).toBe(old);
      expect(lib.box.stored[1]).toMatchObject({ title: "Editorial", author: "Smith, J", doi: "10.1/b", rl: true, pid: expect.stringMatching(/^k/) });
      expect(lib.fillEmpty).not.toHaveBeenCalled();
    });

    it("the same title and the same author with different DOIs are two papers, not a duplicate", () => {
      const old = stored({ author: "Smith, J", doi: "10.1/a" });
      const lib = library([old]);
      const rec = entryOf(hashOf({ ...EDITORIAL, author: "Smith J", year: "2024", doi: "10.1/b" }));
      expect(fileCapture(rec, lib.deps())).toEqual({ state: "kept", filled: false });
      expect(lib.box.stored).toHaveLength(2);
      expect(lib.box.stored[0]).toBe(old);
    });

    it("two DOIs that are one DOI written two ways do not disagree: the title rules still apply (a fill, a duplicate)", () => {
      const fill = library([stored({ doi: "10.1/a" })]);
      expect(fileCapture(entryOf(hashOf({ ...EDITORIAL, author: "Smith J", doi: "https://doi.org/10.1/A" })), fill.deps())).toEqual({ state: "already", filled: true });
      expect(fill.box.stored).toHaveLength(1);
      expect(fill.box.stored[0]).toMatchObject({ pid: "kold", author: "Smith, J", doi: "10.1/a" });
      const dup = library([stored({ author: "Smith, J", doi: "10.1/a" })]);
      expect(fileCapture(entryOf(hashOf({ ...EDITORIAL, author: "Smith J", doi: "https://doi.org/10.1/A" })), dup.deps())).toEqual({ state: "already", filled: false });
      expect(dup.box.stored).toHaveLength(1);
    });

    it("one side with no DOI is no disagreement: the stored paper with no DOI is filled; a capture with no DOI matches a stored paper that has one", () => {
      const noDoi = library([stored({})]);
      expect(fileCapture(entryOf(hashOf({ ...EDITORIAL, author: "Smith J", doi: "10.1/b" })), noDoi.deps())).toEqual({ state: "already", filled: true });
      expect(noDoi.box.stored).toHaveLength(1);
      expect(noDoi.box.stored[0]).toMatchObject({ author: "Smith, J" });
      const stray = library([stored({ doi: "10.1/a" })]);
      expect(fileCapture(entryOf(hashOf({ ...EDITORIAL, author: "Smith J", doi: "" })), stray.deps())).toEqual({ state: "already", filled: true });
      expect(stray.box.stored).toHaveLength(1);
    });

    it("an entry whose DOI disagrees is left out of the search, so a later entry that does match is the one filled (the shown list and the stored one)", () => {
      const other = stored({ doi: "10.1/a", pid: "kother" });
      const mine = stored({ pid: "kmine" });
      const lib = library([other, mine]);
      expect(fileCapture(entryOf(hashOf({ ...EDITORIAL, author: "Smith J", doi: "10.1/b" })), lib.deps())).toEqual({ state: "already", filled: true });
      expect(lib.box.stored).toHaveLength(2);
      expect(lib.box.stored[0]).toBe(other);
      expect(lib.box.stored[1]).toMatchObject({ pid: "kmine", author: "Smith, J" });
    });
  });

  it("a stored entry that has no pid yet is given one and counts as already kept", () => {
    const lib = library([{ ...PM_V1_ENTRY, doi: "10.1038/s41598-024-00001-x", author: "Schaefer, EM" }]);
    const r = fileCapture(entryOf(hashOf({ ...PM, doi: "10.1038/s41598-024-00001-x" })), lib.deps());
    expect(r).toEqual({ state: "already", filled: true });
    expect(lib.box.stored).toHaveLength(1);
    expect(lib.box.stored[0]).toMatchObject({ pid: expect.stringMatching(/^k/), volume: "9", author: "Schaefer, EM" });
  });

  it("a library that has not been read, or that does not open, is never written: it throws before it changes anything", () => {
    for (const over of [{ loading: true }, { locked: true }, { broken: true }, { error: true }, { ready: false }] as Array<Partial<FileCaptureDeps>>) {
      const lib = library([], over);
      expect(() => fileCapture(entryOf(hashOf(PM)), lib.deps()), JSON.stringify(over)).toThrow();
      expect(lib.update).not.toHaveBeenCalled();
      expect(lib.fillEmpty).not.toHaveBeenCalled();
    }
  });

  it("a library that will not take the paper (update answers false) is an error, not a silent success", () => {
    const lib = library([], { update: () => false });
    expect(() => fileCapture(entryOf(hashOf(PM)), lib.deps())).toThrow();
  });
});

describe("fillEmptyIn writes only the fields that are empty in the first match, and leaves the list as it is when nothing changes", () => {
  it("is what a fill uses", () => {
    const lib: CitationEntry[] = [{ title: "A", author: "" }, { title: "T", author: "", year: "2020", volume: "" }, { title: "T", author: "" }];
    const out = fillEmptyIn(lib, (e) => e.title === "T", { author: "Lee, K", year: "2024", volume: "9", pages: "" });
    expect(out).toEqual([{ title: "A", author: "" }, { title: "T", author: "Lee, K", year: "2020", volume: "9" }, { title: "T", author: "" }]);
    expect(lib[1]).toEqual({ title: "T", author: "", year: "2020", volume: "" });
    expect(fillEmptyIn(out, (e) => e.title === "T", { author: "Other", year: "1999" })).toBe(out);
    expect(fillEmptyIn(out, (e) => e.title === "nope", { author: "X" })).toBe(out);
  });
});
