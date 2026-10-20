import { describe, it, expect } from "vitest";
import { citExtractDoi, citExtractPmid, citLookup, crFirstByTitle, crLookupDoi, crLookupTitle, rcCheckOne, rcCheckOneV2, rcFillPatch, rcSim } from "../../src/fetch/crossref";
import type { RcCheck } from "../../src/fetch/crossref";
import type { CitationEntry } from "../../src/citation";
import { citLastName } from "../../src/citation";
import { LOOKUP_FIELDS } from "../golden/fetch/capture";
import { RECORDINGS, fx, replay } from "./replay";

/**
 * crossref.ts (v1 rcWords 7728, rcSim 7729, rcCompare 7735, rcCheckOne 7750 inside rcRun 7772, citExtractDoi 7907, citExtractPmid 7911, citLookup 7931)
 * on the recorded Crossref and E-utilities bodies, against what v1 stored in appu_refcheck and what citLookup put in the form, and the URLs v1 requested.
 */

const pick = (form: Record<string, string>) => Object.fromEntries(LOOKUP_FIELDS.map((k) => [k, form[k]]));
const withoutT = ({ t, ...rest }: { t: number } & Record<string, unknown>) => ({ rest, t });

describe("citLookup is v1's citLookup: the route, the URLs, the fields it fills and its toast", () => {
  it("covers each Crossref type, a 404, PMIDs with and without a DOI, a link with no DOI, titles and Crossref unreachable", () => {
    expect(new Set(fx.lookups.map((l) => l.toastKey))).toEqual(new Set(["cite_lookup_ok", "cite_lookup_nf", "cite_lookup_nopmid", "cite_lookup_empty", "cite_lookup_fail"]));
    expect(new Set(fx.lookups.filter((l) => l.toastKey === "cite_lookup_ok").map((l) => l.form.type))).toEqual(new Set(["Journal article", "Book chapter", "Book", "Conference paper", "Thesis", "Report"]));
  });
  for (const l of fx.lookups)
    it(`${l.input} → ${l.toastKey}`, async () => {
      const r = replay(l.throwFor);
      const out = await citLookup(r.f, { doi: "", url: l.input, title: "" });
      expect(r.unknown).toEqual([]);
      expect(r.requested).toEqual(l.requested);
      expect("cite_lookup_" + out.result).toBe(l.toastKey);
      if (out.result === "ok") expect(out.entry).toEqual(pick(l.form));
      else expect(out.entry).toBeUndefined();
    });
  it("reads the DOI field first, then the link, then the title (7934-7936)", async () => {
    const r = replay();
    await citLookup(r.f, { doi: "", url: "https://example.com/x", title: "Protein measurement with the Folin phenol reagent" });
    expect(r.requested).toEqual(["https://api.crossref.org/works?rows=1&query.bibliographic=Protein%20measurement%20with%20the%20Folin%20phenol%20reagent"]);
    const r2 = replay();
    await citLookup(r2.f, { doi: "10.4324/9780203771587", url: "PMID: 9500320", title: "Protein measurement with the Folin phenol reagent" });
    expect(r2.requested).toEqual(["https://api.crossref.org/works/10.4324%2F9780203771587"]);
  });
  it("crLookupDoi and crFirstByTitle give the entry citLookup fills, null when Crossref has none", async () => {
    const ok = fx.lookups.find((l) => l.input === "10.4324/9780203771587" && !l.throwFor.length)!;
    expect(await crLookupDoi(replay().f, "10.4324/9780203771587")).toEqual(pick(ok.form));
    expect(await crLookupDoi(replay().f, "10.9999/appuscholar-no-such-doi-2026")).toBeNull();
    const title = fx.lookups.find((l) => l.input === "Protein measurement with the Folin phenol reagent")!;
    expect(await crFirstByTitle(replay().f, title.input)).toEqual(pick(title.form));
    expect(await crFirstByTitle((async () => new Response('{"message":{"items":[]}}')) as typeof fetch, "x")).toBeNull();
    await expect(crLookupDoi((async () => new Response("", { status: 500 })) as typeof fetch, "10.1000/x")).rejects.toThrow("HTTP 500");
  });
});

describe("rcCheckOne is v1's reference check, entry by entry", () => {
  it("covers ok, diff (title, year, author), nf by DOI and by title, ok by title, and err", () => {
    const outs = fx.rc.entries.map((e) => e.out);
    expect(new Set(outs.map((o) => o.s))).toEqual(new Set(["ok", "diff", "nf", "err"]));
    expect(outs.some((o) => o.viaTitle)).toBe(true);
    expect(new Set(outs.flatMap((o) => ((o.m ?? []) as Array<{ k: string }>).map((m) => m.k)))).toEqual(new Set(["title", "year", "author"]));
  });
  it("the URLs, in rcRun's order, are v1's", async () => {
    const r = replay(fx.rc.throwFor);
    for (const e of fx.rc.entries) await rcCheckOne(r.f, e.entry);
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual(fx.rc.requested);
  });
  for (const e of fx.rc.entries)
    it(`${e.key} → ${String(e.out.s)}`, async () => {
      const before = Date.now();
      const { rest, t } = withoutT(await rcCheckOne(replay(fx.rc.throwFor).f, e.entry));
      expect(rest).toEqual(e.out);
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(Date.now());
    });
});

describe("crLookupTitle is rcCheckOne's title search: 3 rows, the best Jaccard similarity at least 0.6", () => {
  for (const e of fx.rc.entries.filter((x) => !x.entry.doi))
    it(e.key, async () => {
      const r = replay();
      const hit = await crLookupTitle(r.f, e.entry.title ?? "", citLastName(e.entry.author));
      expect(r.requested).toHaveLength(1);
      expect(r.requested[0]).toMatch(/^https:\/\/api\.crossref\.org\/works\?rows=3&query\.bibliographic=/);
      if (e.out.s === "nf") expect(hit).toBeNull();
      else {
        expect(hit!.score).toBeGreaterThanOrEqual(0.6);
        expect(hit!.score).toBe(rcSim(e.entry.title, hit!.entry.title));
        expect(hit!.work.DOI).toBe((e.out.f as { doi: string }).doi);
        expect(hit!.entry.doi).toBe((e.out.f as { doi: string }).doi);
      }
    });
  it("a best score just under 0.6 is no match; 0.6 itself is", async () => {
    const items = (title: string) => (async () => new Response(JSON.stringify({ message: { items: [{ title: [title], DOI: "10.1/a" }] } }))) as typeof fetch;
    // rcWords keeps words of 3 letters or more: {alpha beta gamma delta epsilon} against 3 shared of 5 = 3/(5+3-3) = 0.6
    expect((await crLookupTitle(items("alpha beta gamma"), "alpha beta gamma delta epsilon", "x"))!.score).toBe(0.6);
    expect(await crLookupTitle(items("alpha beta gamma zeta"), "alpha beta gamma delta epsilon", "x")).toBeNull(); // 3/6
  });
});

describe("citExtractDoi and citExtractPmid (7907-7919)", () => {
  it("as v1", () => {
    expect(citExtractDoi("see https://doi.org/10.1037/0003-066X.55.1.68.")).toBe("10.1037/0003-066x.55.1.68");
    expect(citExtractDoi("doi:10.1016/S0140-6736(97)11096-0)")).toBe("10.1016/s0140-6736(97)11096-0");
    expect(citExtractDoi("no doi here")).toBe("");
    expect(citExtractPmid("PMID: 9500320")).toBe("9500320");
    expect(citExtractPmid("https://www.ncbi.nlm.nih.gov/pubmed/9500320")).toBe("9500320");
    expect(citExtractPmid(" 14907713 ")).toBe("14907713");
    expect(citExtractPmid("12345")).toBe("");
  });
});

/*
 * Fix wave A (W27, W28; register row D-S2-33): rcCheckOneV2 differs from v1's rcCheckOne in exactly two ways: an entry with no author is flagged when Crossref lists
 * authors, and the empty author, volume, issue and pages that Crossref has are listed in `miss` (with Crossref's values in `f`, for the fill).
 */
const SCHAEFER_TITLE = "Sleep timing and attention in adolescents";
const SCHAEFER_DOI = "10.1038/s41598-024-0001-x";
const SCHAEFER_WORK = {
  title: [SCHAEFER_TITLE], DOI: SCHAEFER_DOI, issued: { "date-parts": [[2019]] }, volume: "9", issue: "1", page: "13317", type: "journal-article", "container-title": ["Scientific reports"],
  author: [{ family: "Schaefer", given: "Ellen M." }, { family: "Gonzalez", given: "Carlos B." }, { family: "Lee", given: "Kim" }]
};
const schaeferFetch = ((async (input: RequestInfo | URL) => {
  if (String(input) === "https://api.crossref.org/works/" + encodeURIComponent(SCHAEFER_DOI)) return new Response(JSON.stringify({ message: SCHAEFER_WORK }));
  throw new Error("unexpected " + String(input));
}) as typeof fetch);
const SCHAEFER_AUTHORS = "Schaefer, Ellen M.; Gonzalez, Carlos B.; Lee, Kim";

describe("rcCheckOneV2 flags an authorless source and the volume, issue and pages it lacks (W27, W28)", () => {
  it("rcCheckOneV2 flags an empty author when Crossref has authors (W27)", async () => {
    const c = await rcCheckOneV2(schaeferFetch, { title: SCHAEFER_TITLE, doi: SCHAEFER_DOI, year: "2019", author: "" });
    expect(c.s).toBe("diff");
    expect(c.m).toContainEqual({ k: "author", v: "Schaefer" });
    expect(c.miss).toEqual(["author", "volume", "issue", "pages"]);
    expect(c.f).toEqual({ title: SCHAEFER_TITLE, year: 2019, author: "Schaefer", doi: SCHAEFER_DOI, authors: SCHAEFER_AUTHORS, volume: "9", issue: "1", pages: "13317" });
    // v1 called the same source a full match.
    expect((await rcCheckOne(schaeferFetch, { title: SCHAEFER_TITLE, doi: SCHAEFER_DOI, year: "2019", author: "" })).s).toBe("ok");
  });
  it("lists only the fields that are empty here: an author the student wrote and a volume stay out of miss; nothing missing is an ok with no miss key", async () => {
    const part = await rcCheckOneV2(schaeferFetch, { title: SCHAEFER_TITLE, doi: SCHAEFER_DOI, year: "2019", author: "Schaefer, Ellen M.", volume: "9" });
    expect(part.miss).toEqual(["issue", "pages"]);
    expect(part.m).toEqual([]);
    expect(part.s).toBe("diff");
    expect(part.f).toEqual({ title: SCHAEFER_TITLE, year: 2019, author: "Schaefer", doi: SCHAEFER_DOI, issue: "1", pages: "13317" });
    const full = await rcCheckOneV2(schaeferFetch, { title: SCHAEFER_TITLE, doi: SCHAEFER_DOI, year: "2019", author: "Schaefer, Ellen M.", volume: "9", issue: "1", pages: "13317" });
    expect(full.s).toBe("ok");
    expect("miss" in full).toBe(false);
  });
  it("a work Crossref lists with no authors, volume, issue or pages adds nothing to flag", async () => {
    const bare = (async () => new Response(JSON.stringify({ message: { title: ["A book"], DOI: "10.1000/b", issued: { "date-parts": [[2001]] }, type: "book" } }))) as typeof fetch;
    const c = await rcCheckOneV2(bare, { title: "A book", doi: "10.1000/b", year: "2001", author: "" });
    expect(c.s).toBe("ok");
    expect("miss" in c).toBe(false);
  });
  it("a title search flags the same way and keeps viaTitle; nf and err are v1's", async () => {
    const items = (async () => new Response(JSON.stringify({ message: { items: [SCHAEFER_WORK] } }))) as typeof fetch;
    const c = await rcCheckOneV2(items, { title: SCHAEFER_TITLE, year: "2019", author: "" });
    expect(c).toMatchObject({ s: "diff", viaTitle: true, miss: ["author", "volume", "issue", "pages"] });
    expect(c.m).toContainEqual({ k: "author", v: "Schaefer" });
    expect((await rcCheckOneV2((async () => new Response('{"message":{"items":[]}}')) as typeof fetch, { title: "zzz yyy xxx", author: "" })).s).toBe("nf");
    expect((await rcCheckOneV2((async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch, { title: "x", doi: "10.1/x" })).s).toBe("err");
  });
  it("rcCheckOneV2 is v1's rcCheckOne when nothing is missing (over the 10 recorded corpus DOIs, each entry written as Crossref lists it)", async () => {
    const dois = [...RECORDINGS.keys()].filter((u) => u.startsWith("https://api.crossref.org/works/")).map((u) => decodeURIComponent(u.slice("https://api.crossref.org/works/".length)));
    expect(dois).toHaveLength(10);
    const seen = new Set<string>();
    for (const doi of dois) {
      const d = (await crLookupDoi(replay().f, doi)) ?? { title: "Not in Crossref", author: "Doe, John", year: "2020" };
      const before = Date.now();
      const { t: t1, ...v1 } = await rcCheckOne(replay().f, { ...d, doi });
      const { t: t2, ...v2 } = await rcCheckOneV2(replay().f, { ...d, doi });
      expect(v2).toEqual(v1);
      expect(t1).toBeGreaterThanOrEqual(before); expect(t2).toBeGreaterThanOrEqual(before);
      seen.add(String(v2.s));
    }
    expect(seen.has("ok")).toBe(true);
    expect(seen.has("nf")).toBe(true);
  });
  it("asks Crossref for the same URLs as v1: a DOI or a title and a surname, nothing else", async () => {
    for (const e of fx.rc.entries) {
      const r = replay(fx.rc.throwFor);
      await rcCheckOneV2(r.f, e.entry);
      expect(r.unknown).toEqual([]);
      const r1 = replay(fx.rc.throwFor);
      await rcCheckOne(r1.f, e.entry);
      expect(r.requested).toEqual(r1.requested);
    }
  });
});

describe("rcFillPatch writes only what is empty (W27, W28)", () => {
  const c: RcCheck = {
    s: "diff", m: [{ k: "author", v: "Schaefer" }], miss: ["author", "volume", "issue", "pages"], t: 1,
    f: { title: SCHAEFER_TITLE, year: 2019, author: "Schaefer", doi: SCHAEFER_DOI, authors: SCHAEFER_AUTHORS, volume: "9", issue: "1", pages: "13317" }
  };
  const e: CitationEntry = { title: SCHAEFER_TITLE, year: "2019", doi: SCHAEFER_DOI };
  it("Fill never overwrites a field that has a value (Review Focus 5)", () => {
    expect(rcFillPatch({ ...e, volume: "12", author: "" }, c)).toEqual({ author: c.f!.authors, issue: "1", pages: "13317" });
    expect(rcFillPatch({ ...e, volume: "12", author: "Mine, A.", issue: "4", pages: "1-2" }, c)).toBeNull();
    // Blank is empty; a student's value of any kind is kept.
    expect(rcFillPatch({ ...e, author: "  ", volume: "0" }, c)).toEqual({ author: c.f!.authors, issue: "1", pages: "13317" });
  });
  it("is null with no miss, no Crossref values or nothing to write", () => {
    expect(rcFillPatch(e, { s: "ok", m: [], t: 1, f: c.f })).toBeNull();
    expect(rcFillPatch(e, { s: "diff", miss: ["volume"], t: 1 })).toBeNull();
    expect(rcFillPatch(e, { ...c, f: { ...c.f!, volume: undefined } , miss: ["volume"] })).toBeNull();
  });
});
