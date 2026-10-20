import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveShelfTitle, shPaperDoi, shTitleOnPage, SHELF_TITLE_TIMEOUT_MS } from "../src/shelf-title";
import { shTitleGuess } from "../src/shelf";
import type { CitationEntry } from "../src/citation";

/**
 * A new shelf paper takes its real title (walk fault W15). The paper in the walk was named "1 Scientific Repo R t S | (2019) 9:13317 | ..." (v1's first line of page 1). The DOI printed on
 * page 1 is asked of the library, then of Crossref (its title must itself be on page 1); then a library title found on page 1; v1's guess is the fallback.
 */
const TITLE = "Daily screen time and sleep quality in adolescents";
const DOI = "10.1038/s41598-019-49731-x";
const PAGE1 = "1 Scientific Repo R t S | (2019) 9:13317 | https://doi.org/" + DOI + " " + TITLE + "\nAuthor One, Author Two\nAbstract\nWe asked whether screen time shortens sleep.";
const PAGES = [PAGE1, "Second page text"];

afterEach(() => { vi.useRealTimers(); });

describe("shPaperDoi and shTitleOnPage", () => {
  it("reads the DOI from page 1 only", () => {
    expect(shPaperDoi(PAGES)).toBe(DOI);
    expect(shPaperDoi(["no doi here", "see 10.1000/abc123 on page 2"])).toBeNull();
    expect(shPaperDoi([])).toBeNull();
  });
  it("a title is on the page when its letters and digits are in the first 4,000 characters, and it is 20 or more", () => {
    expect(shTitleOnPage(TITLE, PAGE1)).toBe(true);
    expect(shTitleOnPage("Daily SCREEN time, and sleep quality in adolescents", PAGE1)).toBe(true);
    expect(shTitleOnPage("Short title", "Short title and more")).toBe(false);
    expect(shTitleOnPage(TITLE, "x".repeat(4000) + TITLE)).toBe(false);
  });
});

describe("resolveShelfTitle (W15)", () => {
  it("a PDF that prints its DOI takes the title Crossref gives (W15)", async () => {
    const lookupDoi = vi.fn(async () => ({ title: TITLE, doi: DOI } as CitationEntry));
    const r = await resolveShelfTitle(PAGES, "scirep", { lib: [], lookupDoi });
    expect(r).toEqual({ title: TITLE, doi: DOI });
    expect(lookupDoi).toHaveBeenCalledWith(DOI);
    expect(shTitleGuess(PAGES, "scirep")).not.toBe(TITLE); // v1 would have named it by its first line
  });

  it("a DOI whose Crossref title is not on page 1 is not used (Review Focus 3)", async () => {
    // Page 1 prints another paper's DOI (a reference or a "see also"): Crossref's title for it is not on the page.
    const lookupDoi = vi.fn(async () => ({ title: "A completely different paper about reading comprehension", doi: DOI } as CitationEntry));
    const r = await resolveShelfTitle(PAGES, "scirep", { lib: [], lookupDoi });
    expect(r.title).toBe(shTitleGuess(PAGES, "scirep"));
    expect(r.title).not.toContain("reading comprehension");
    expect(r).not.toHaveProperty("doi"); // the printed DOI is not proven to be this paper's
  });

  it("a paper already in the library by DOI takes the library's title without a lookup", async () => {
    const lookupDoi = vi.fn(async () => null);
    const lib: CitationEntry[] = [{ title: "Daily Screen Time and Sleep Quality in Adolescents", doi: "https://doi.org/" + DOI.toUpperCase() }];
    const r = await resolveShelfTitle(PAGES, "scirep", { lib, lookupDoi });
    expect(r).toEqual({ title: "Daily Screen Time and Sleep Quality in Adolescents", doi: DOI });
    expect(lookupDoi).not.toHaveBeenCalled();
  });

  it("a library entry for a DOI printed on page 1 whose title is not on page 1 does not rename the paper", async () => {
    // Page 1 prints another paper's DOI first (a "see also"), and the student has that paper in the library.
    const lookupDoi = vi.fn(async () => null);
    const lib: CitationEntry[] = [{ title: "The cited paper about reading comprehension", doi: DOI }];
    const r = await resolveShelfTitle(PAGES, "scirep", { lib, lookupDoi });
    expect(r).toEqual({ title: shTitleGuess(PAGES, "scirep") });
    expect(r).not.toHaveProperty("doi");
    expect(lookupDoi).toHaveBeenCalledWith(DOI); // falls through to Crossref, whose title is checked the same way
    // Crossref's title for it is on the page: that one is used.
    const via = await resolveShelfTitle(PAGES, "scirep", { lib, lookupDoi: async () => ({ title: TITLE }) });
    expect(via).toEqual({ title: TITLE, doi: DOI });
  });

  it("with no DOI, a library title found on page 1 is used (the longest wins)", async () => {
    const page = "Header line here\n" + TITLE + ": a longitudinal study\nAbstract text";
    const lib: CitationEntry[] = [{ title: TITLE }, { title: TITLE + ": a longitudinal study" }, { title: "Not on this page at all, sorry" }];
    const lookupDoi = vi.fn(async () => null);
    const r = await resolveShelfTitle([page], "f", { lib, lookupDoi });
    expect(r).toEqual({ title: TITLE + ": a longitudinal study" });
    expect(lookupDoi).not.toHaveBeenCalled();
  });

  it("no DOI and no match: v1's first-line guess", async () => {
    const pages = ["Some First Line Of The Paper\nmore"];
    const r = await resolveShelfTitle(pages, "stem", { lib: [{ title: "Unrelated library paper title" }], lookupDoi: async () => null });
    expect(r).toEqual({ title: shTitleGuess(pages, "stem") });
    expect(r).not.toHaveProperty("doi");
    expect((await resolveShelfTitle([""], "stem", { lib: [], lookupDoi: async () => null })).title).toBe("stem");
  });

  it("Crossref failing or taking 4 s falls back without blocking the add", async () => {
    const failed = await resolveShelfTitle(PAGES, "scirep", { lib: [], lookupDoi: async () => { throw new Error("HTTP 500"); } });
    expect(failed).toEqual({ title: shTitleGuess(PAGES, "scirep") });
    // A library title on page 1 is still found when the lookup fails.
    const viaLib = await resolveShelfTitle(PAGES, "scirep", { lib: [{ title: TITLE }], lookupDoi: async () => { throw new Error("offline"); } });
    expect(viaLib).toEqual({ title: TITLE });

    vi.useFakeTimers();
    const slow = resolveShelfTitle(PAGES, "scirep", { lib: [], lookupDoi: () => new Promise(() => {}) });
    let done = false;
    void slow.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(SHELF_TITLE_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await slow).toEqual({ title: shTitleGuess(PAGES, "scirep") });
    expect(SHELF_TITLE_TIMEOUT_MS).toBe(4000);
  });
});
