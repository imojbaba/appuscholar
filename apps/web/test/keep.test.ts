import { describe, expect, it, vi } from "vitest";
import * as core from "@appuscholar/core";
import type { StoredEntry } from "../lib/blobs/kinds";
import { CROSSREF_FILL_TIMEOUT_MS, keepEntry, keepResult, libraryKnown, libraryRead, resultEntry, type KeepDeps, type KeepResultDeps } from "../lib/papers/keep";
import { insertResult } from "../lib/research/library";
import { tFormat } from "../lib/i18n";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

/*
 * Keep (wave B Task 18, register row D-S2-123): the one door through which a paper joins the library and the reading list. keepEntry decides "kept" or "already" by
 * paperMatch against a library that has been read; keepResult keeps a search result with its abstract and open-access link, then asks Crossref for what OpenAlex lacks.
 */

const E = en as Record<string, string>;
const t = (key: string, vars?: Record<string, string | number>) => tFormat(E, hi as Record<string, string>, key, "en", vars);

const SLEEP: core.CitationEntry = { author: "Smith, J.", year: "2020", title: "Sleep duration and exam anxiety in first-year students", source: "Sleep Health", volume: "", issue: "", pages: "", doi: "10.1000/sleep.1", url: "", type: "Journal article", style: "apa" };

/** A library as the blob holds it: `update` runs the change on the stored entries at once, as a read blob does. */
function make(start: StoredEntry[] = [], over: Partial<KeepDeps> = {}) {
  const log = { lib: start, updates: 0 };
  const d: KeepDeps = {
    lib: start, ready: true, loading: false, locked: false, broken: false, error: false,
    update: (fn) => { log.updates++; log.lib = fn(log.lib); return true; },
    ...over
  };
  return { d, log };
}

describe("libraryRead", () => {
  it("is true only for a library that has been read: not loading, locked, broken, failed or without a project", () => {
    const ok = { ready: true, loading: false, locked: false, broken: false, error: false };
    expect(libraryRead(ok)).toBe(true);
    for (const k of ["loading", "locked", "broken", "error"] as const) expect(libraryRead({ ...ok, [k]: true }), k).toBe(false);
    expect(libraryRead({ ...ok, ready: false })).toBe(false);
  });
});

describe("libraryKnown", () => {
  it("is true while the stored library is known, even after a save failed (the keep is then held for a retry); false while loading, locked, broken or without a project", () => {
    const ok = { ready: true, loading: false, locked: false, broken: false, error: false };
    expect(libraryKnown(ok)).toBe(true);
    // a failed save sets error, and the library is still the one that was read: Kept must not turn back into Keep
    const failed = { ...ok, error: true };
    expect(libraryKnown(failed)).toBe(true);
    expect(libraryRead(failed)).toBe(false);
    for (const k of ["loading", "locked", "broken"] as const) expect(libraryKnown({ ...ok, [k]: true }), k).toBe(false);
    expect(libraryKnown({ ...ok, ready: false })).toBe(false);
  });
});

describe("keepEntry", () => {
  it("Keep adds one entry with a pid, on the reading list", () => {
    const { d, log } = make();
    const r = keepEntry(SLEEP, d);
    expect(r.state).toBe("kept");
    expect(log.lib).toHaveLength(1);
    expect(log.lib[0]).toEqual({ ...SLEEP, pid: r.pid, rl: true });
    expect(r.pid).toMatch(/^k[a-z0-9]+$/);
    expect(log.updates).toBe(1);
  });

  it("Keep on a paper already kept says it is already kept, returns the kept paper's pid and adds nothing", () => {
    const kept: StoredEntry = { ...SLEEP, pid: "kabc1234", rl: true };
    const { d, log } = make([kept]);
    expect(keepEntry({ ...SLEEP, author: "Smith, John" }, d)).toEqual({ state: "already", pid: "kabc1234" });
    expect(log.updates).toBe(0);
    expect(log.lib).toEqual([kept]);
  });

  it("the DOI decides when both papers have one, however it is written (a link, upper case)", () => {
    const { d, log } = make([{ ...SLEEP, pid: "kdoi00", rl: true }]);
    expect(keepEntry({ ...SLEEP, title: "Another title for the same paper", doi: "https://doi.org/10.1000/SLEEP.1" }, d)).toEqual({ state: "already", pid: "kdoi00" });
    // two different DOIs are two papers even when the titles are the same
    expect(keepEntry({ ...SLEEP, doi: "10.1000/sleep.2" }, d).state).toBe("kept");
    expect(log.lib).toHaveLength(2);
  });

  it("without a DOI the same long title in the same year is one paper; a short title is never matched", () => {
    const noDoi = { ...SLEEP, doi: "" };
    const { d, log } = make([{ ...noDoi, pid: "ktitle0", rl: true }]);
    expect(keepEntry({ ...noDoi, title: "SLEEP DURATION and exam-anxiety in first year students" }, d)).toEqual({ state: "already", pid: "ktitle0" });
    expect(keepEntry({ ...noDoi, year: "2021" }, d).state).toBe("kept");
    const short = make([{ ...noDoi, title: "Sleep", pid: "kshort0", rl: true }]);
    expect(keepEntry({ ...noDoi, title: "Sleep" }, short.d).state).toBe("kept");
    expect(log.lib).toHaveLength(2);
  });

  it("a kept paper that has no pid yet (the ids not run) is given one, and Keep returns it", () => {
    const { d, log } = make([{ ...SLEEP }]);
    const r = keepEntry(SLEEP, d);
    expect(r.state).toBe("already");
    expect(log.lib).toHaveLength(1);
    expect(log.lib[0]!.pid).toBe(r.pid);
  });

  it("a paper another window kept since the library was read is not added twice", () => {
    const stored: StoredEntry = { ...SLEEP, pid: "kother1", rl: true };
    // `lib` is the copy the panel showed; the stored library already holds the paper when the update runs
    const { d, log } = make([], { update: (fn) => { log.lib = fn([stored]); return true; } });
    keepEntry(SLEEP, d);
    expect(log.lib).toEqual([stored]);
  });

  it("refuses a library that has not been read, and changes nothing (the update would be queued and decide on an empty stand-in)", () => {
    for (const k of ["loading", "locked", "broken", "error"] as const) {
      const { d, log } = make([], { [k]: true });
      expect(() => keepEntry(SLEEP, d), k).toThrow(/has been read/);
      expect(log.updates, k).toBe(0);
    }
    const { d, log } = make([], { ready: false });
    expect(() => keepEntry(SLEEP, d)).toThrow(/has been read/);
    expect(log.updates).toBe(0);
  });

  it("does not claim a keep the library refused", () => {
    const { d } = make([], { update: () => false });
    expect(() => keepEntry(SLEEP, d)).toThrow(/did not take/);
  });
});

describe("keepResult", () => {
  const OA: core.RsPaper = {
    source: "OpenAlex", title: "Growth mindset and grades in secondary school", authors: "Carol S. Dweck, David Yeager, et al.", authorList: ["Carol S. Dweck", "David Yeager", "Ann Lee"], year: "2019",
    venue: "Nature", doi: "10.1038/S41586-019-1466-Y", url: "https://doi.org/10.1038/s41586-019-1466-y", retracted: false, citationCount: 3, oaUrl: "https://europepmc.org/articles/PMC1/pdf", abstract: "A short abstract about grades."
  };
  const offline = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
  function result(lib: StoredEntry[] = [], over: Partial<KeepResultDeps> = {}) {
    const m = make(lib);
    const seeds: Array<[string, boolean]> = [];
    const fills: Array<{ match: (e: core.CitationEntry) => boolean; fill: Partial<core.CitationEntry> }> = [];
    const d: KeepResultDeps = {
      ...m.d, style: "apa", fetch: offline,
      fillEmpty: (match, fill) => { fills.push({ match, fill }); return true; },
      seedRetraction: (doi, flag) => { seeds.push([doi, flag]); },
      ...over
    };
    return { d, log: m.log, seeds, fills };
  }

  it("keeps the v2 entry (every author) with the abstract, the open-access link and the reading list, and no URL when there is a DOI", () => {
    const { d, log } = result();
    const r = keepResult(OA, d);
    expect(r.state).toBe("kept");
    expect(log.lib).toEqual([{ ...core.rsEntryFromResultV2(OA, "apa"), pid: r.pid, rl: true, abstract: "A short abstract about grades.", oa: "https://europepmc.org/articles/PMC1/pdf" }]);
    expect(log.lib[0]!.url).toBe("");
    expect(log.lib[0]!.author).toBe("Dweck, Carol S.; Yeager, David; Lee, Ann");
  });

  it("a kept paper with a DOI stores no URL; one without keeps the link it has", () => {
    expect(resultEntry(OA, "apa").url).toBe("");
    const pm = resultEntry({ ...OA, source: "PubMed", doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/31527720/" }, "apa");
    expect(pm.url).toBe("https://pubmed.ncbi.nlm.nih.gov/31527720/");
  });

  it("keeps at most 4,000 characters of the abstract, and no abstract or link field when the result has none", () => {
    expect(resultEntry({ ...OA, abstract: "x".repeat(4500) }, "apa").abstract).toHaveLength(4000);
    const bare = resultEntry({ ...OA, abstract: undefined, oaUrl: undefined }, "apa");
    expect("abstract" in bare).toBe(false);
    expect("oa" in bare).toBe(false);
    expect("abstract" in resultEntry({ ...OA, abstract: "   " }, "apa")).toBe(false);
  });

  it("a paper already kept is not added, seeds nothing and asks Crossref for nothing", () => {
    const fetchSpy = vi.fn(offline);
    const { d, log, seeds, fills } = result([{ ...core.rsEntryFromResultV2(OA, "apa"), pid: "kold001", rl: true }], { fetch: fetchSpy as unknown as typeof fetch });
    expect(keepResult(OA, d)).toEqual({ state: "already", pid: "kold001" });
    expect(log.updates).toBe(0);
    expect(seeds).toEqual([]);
    expect(fills).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("seeds the retraction cache for an OpenAlex paper with a DOI, with its flag; a PubMed paper seeds nothing", () => {
    const a = result();
    keepResult({ ...OA, retracted: true }, a.d);
    expect(a.seeds).toEqual([["10.1038/S41586-019-1466-Y", true]]);
    const b = result();
    keepResult({ ...OA, source: "PubMed", doi: "" }, b.d);
    expect(b.seeds).toEqual([]);
  });

  it("asks Crossref for the DOI only, within 4 seconds, and fills the empty fields of the entry it kept, found by its pid and not by its title", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const seen: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
    const crossref = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), signal: init?.signal });
      return new Response(JSON.stringify({ status: "ok", message: { title: ["x"], author: [{ family: "Other", given: "A." }], volume: "12", issue: "3", page: "45-67", type: "journal-article" } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const { d, log, fills } = result([], { fetch: crossref });
    const r = keepResult(OA, d);
    await vi.waitFor(() => expect(fills).toHaveLength(1));
    expect(seen.map((s) => s.url)).toEqual(["https://api.crossref.org/works/" + encodeURIComponent("10.1038/S41586-019-1466-Y")]);
    expect(timeout).toHaveBeenCalledWith(CROSSREF_FILL_TIMEOUT_MS);
    expect(CROSSREF_FILL_TIMEOUT_MS).toBe(4000);
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(fills[0]!.fill).toMatchObject({ volume: "12", issue: "3", pages: "45-67" });
    // two entries with the same title: only the one that was just kept has this pid
    const twin: StoredEntry = { ...log.lib[0]!, pid: "ktwin00" };
    expect(fills[0]!.match(log.lib[0]!)).toBe(true);
    expect(fills[0]!.match(twin)).toBe(false);
    expect(r.pid).toBe((log.lib[0] as StoredEntry).pid);
    timeout.mockRestore();
  });

  it("a lookup that fails, is slow or finds nothing changes nothing and says nothing; a PubMed paper or one with its volume, issue and pages is not looked up", async () => {
    const f500 = vi.fn(async () => new Response("", { status: 500 }));
    const a = result([], { fetch: f500 as unknown as typeof fetch });
    keepResult(OA, a.d);
    await vi.waitFor(() => expect(f500).toHaveBeenCalledTimes(1));
    expect(a.fills).toEqual([]);
    const f404 = vi.fn(async () => new Response("", { status: 404 }));
    const b = result([], { fetch: f404 as unknown as typeof fetch });
    keepResult({ ...OA, title: "Another long enough title about sleep" , doi: "10.1/other"}, b.d);
    await vi.waitFor(() => expect(f404).toHaveBeenCalledTimes(1));
    expect(b.fills).toEqual([]);
    const spy = vi.fn(offline);
    keepResult({ ...OA, source: "PubMed", doi: "10.1/pm", title: "A PubMed paper with a DOI and a long title" }, result([], { fetch: spy as unknown as typeof fetch }).d);
    keepResult({ ...OA, title: "A paper that already has all its pages", doi: "10.1/full", volume: "1", issue: "2", pages: "3-4" }, result([], { fetch: spy as unknown as typeof fetch }).d);
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("insertResult: Put a citation in my document", () => {
  const oaPaper: core.RsPaper = { source: "OpenAlex", title: "Growth mindset and grades in secondary school", authors: "Carol S. Dweck, David Yeager, et al.", year: "2019", venue: "Nature", doi: "10.1038/S41586-019-1466-Y", url: "https://doi.org/10.1038/s41586-019-1466-y", retracted: false, citationCount: 3 };
  const offline = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
  function make2(lib: StoredEntry[] = [], insertOk = true) {
    const log = { lib, toasts: [] as string[], inserted: [] as core.Formatted[], updates: 0 };
    const d: KeepResultDeps & { insert(f: core.Formatted): Promise<boolean>; toast(msg: string): void; t: typeof t } = {
      lib, ready: true, loading: false, locked: false, broken: false, error: false, style: "apa", fetch: offline, fillEmpty: () => true, seedRetraction: () => {}, t,
      update: (fn) => { log.updates++; log.lib = fn(log.lib); return true; },
      toast: (m) => { log.toasts.push(m); },
      insert: async (f) => { log.inserted.push(f); return insertOk; }
    };
    return { d, log };
  }

  it("keeps the paper, then inserts with the library's number and toasts rs_inserted", async () => {
    const { d, log } = make2([{ author: "A, B", title: "Other", year: "2000", pid: "kfirst1" }]);
    d.style = "vancouver";
    await insertResult(oaPaper, d);
    expect(log.lib).toHaveLength(2);
    expect(log.lib[1]).toMatchObject({ rl: true, doi: "10.1038/S41586-019-1466-Y" });
    expect(log.inserted).toEqual([core.citFmt(core.rsEntryFromResultV2(oaPaper, "vancouver"), 2, "vancouver")]);
    expect(log.toasts).toEqual([E.rs_inserted]);
  });

  it("a paper already kept is inserted from the kept entry, adds nothing, and a retracted one toasts the warning", async () => {
    const saved: StoredEntry = { author: "Dweck, C.", title: "Growth mindset and grades in secondary school", year: "2019", doi: "10.1038/s41586-019-1466-y", pid: "ksaved1", rl: true };
    const { d, log } = make2([saved]);
    await insertResult({ ...oaPaper, retracted: true }, d);
    expect(log.updates).toBe(0);
    expect(log.inserted).toEqual([core.citFmt(saved, 0, "apa")]);
    expect(log.toasts).toEqual([E.retr_added_warn]);
  });

  it("a document that did not open still keeps the paper and claims no insert (Task 11)", async () => {
    const { d, log } = make2([], false);
    await insertResult(oaPaper, d);
    expect(log.lib).toHaveLength(1);
    expect(log.toasts).toEqual([]);
  });
});
