import { describe, it, expect, vi, afterEach } from "vitest";
import { pace } from "../../src/fetch/types";
import { xmlAll, xmlParse, xmlText } from "../../src/fetch/xml";

afterEach(() => vi.useRealTimers());

describe("pace: the pause between calls (rcRun 7785, 200 ms)", () => {
  it("resolves after 200 ms by default, not before", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = pace().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(199);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    await p;
  });
  it("resolves after the given time", async () => {
    vi.useFakeTimers();
    let done = false;
    void pace(1000).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});

describe("the XML reader rsPubmedAbstracts uses in place of DOMParser (register D-S2-5)", () => {
  const doc = xmlParse('<?xml version="1.0" ?>\n<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2025//EN" "https://dtd.nlm.nih.gov/x.dtd">\n<!-- c -->'
    + '<Set><A x="1 &amp; 2" y=\'q\'><B>one &lt;<i>two</i>&#62; &#x41;<![CDATA[ <raw> ]]></B><C/><B>three</B></A></Set>');
  it("elements in document order, attributes and text content as the DOM gives them", () => {
    const bs = xmlAll(doc, (e) => e.name === "B");
    expect(bs.map(xmlText)).toEqual(["one <two> A <raw> ", "three"]);
    expect(xmlAll(doc, (e) => e.name === "A")[0]!.attrs).toEqual({ x: "1 & 2", y: "q" });
    expect(xmlAll(doc, (e) => e.name === "C")).toHaveLength(1);
    expect(xmlAll(doc, (e) => e.name === "b")).toHaveLength(0); // names are case-sensitive, as in an XML document
  });
  it("throws on what an XML parser rejects", () => {
    for (const bad of ["<a><b></a>", "<a>", "<a>&nbsp;</a>", "<a>x & y</a>", "<a b=1></a>", "</a>"]) expect(() => xmlParse(bad), bad).toThrow();
  });
});

describe("index.ts exports the fetchers", () => {
  it("each by name", async () => {
    const core = await import("../../src/index");
    for (const name of ["pace", "oaUrl", "oaSearch", "oaConnected", "oaRetractions", "retrFetchBatch", "apRefCheck", "pmSearch", "pmidToDoi", "crLookupDoi", "crLookupTitle", "crFirstByTitle", "rcCheckOne", "citLookup", "citExtractDoi", "citExtractPmid"])
      expect(typeof (core as Record<string, unknown>)[name], name).toBe("function");
  });
});
