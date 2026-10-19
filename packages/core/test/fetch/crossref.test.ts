import { describe, it, expect } from "vitest";
import { citExtractDoi, citExtractPmid, citLookup, crFirstByTitle, crLookupDoi, crLookupTitle, rcCheckOne, rcSim } from "../../src/fetch/crossref";
import { citLastName } from "../../src/citation";
import { LOOKUP_FIELDS } from "../golden/fetch/capture";
import { fx, replay } from "./replay";

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
