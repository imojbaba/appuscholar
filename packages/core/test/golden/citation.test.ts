import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CIT_STYLES, apa6Authors, apaAuthors, chicagoAuthors, citEdList, citFmt, citInitials, citIsNumbered, citKind, citLastName, citNames, citWho, harvardAuthors, ieeeAuthors, mlaAuthors, vancAuthors } from "../../src/citation";
import type { CitationEntry, CitationStyle, Formatted } from "../../src/citation";
import { CIT_MON_ABB, CIT_MON_IEEE, CIT_MON_MLA, CIT_MONTHS } from "../../src/data/citation-tables";
import { readFixture } from "./harness/fixture";

/**
 * citation.ts (v1 7053-7465, the citation engine) against v1 running. Every expected value is read from test/golden/citation/cases.json (`golden:capture citation`), which holds v1's citFmt for each
 * entry of the hand-written entries.json in every style with n = 0 and n = 3, citKind for v1's seven type values and six Hindi names, and the helpers called directly as `{ fn, args, out }`;
 * tables.json holds v1's month tables and CIT_STYLES, which src/data/citation-tables.ts is generated from.
 * What is typed here is what the brief and the register spell out: the corpus ids, the seven kinds, the `[?]` and `n.d.` checks of the brief, and the literals of register rows F23a-F23c.
 */

type Entry = { id: string; entry: CitationEntry };
type Case = { id: string; style: CitationStyle; n: number; out: Formatted };
type Helper = { fn: string; args: unknown[]; out: unknown };

const fx = readFixture<{ entries: Entry[]; cases: Case[]; kinds: Array<{ t: string; out: string }>; helpers: Helper[] }>("citation", "cases");
const entries = JSON.parse(readFileSync(new URL("./citation/entries.json", import.meta.url), "utf8")) as Entry[];
const entryOf = (id: string) => entries.find((e) => e.id === id)!.entry;
const outOf = (id: string, style: CitationStyle, n: number) => fx.cases.find((c) => c.id === id && c.style === style && c.n === n)!.out;

/** The brief's corpus: evidence script 06's six entries, then one entry per property it lists, then the controller's additions (Decision 3). */
const IDS = [
  "miller-3-authors", "bandura-book", "who-website", "roy-chapter", "sharma-thesis", "untitled-no-author-no-year",
  "authors-1", "authors-2", "authors-6", "authors-7", "authors-8", "authors-20", "authors-21", "authors-22",
  "org-no-year", "initials-hyphen", "initials-caps", "first-two-names", "comma-less-name",
  "hindi-book", "hindi-website", "hindi-chapter", "hindi-report", "hindi-thesis", "hindi-conf",
  "web-month-day-accessed", "thesis-masters", "thesis-undergrad", "conf-with-month", "report-with-number", "missing-title",
  "pages-dash-variants", "pages-dash-variants-en-dash", "pages-dash-variants-article-number", "doi-with-https-prefix", "url-only", "apa6-accessed", "trailing-dot-title",
  "edition-in-title", "translator-in-authors", "volume-without-issue", "pages-with-pp", "accessed-other-format", "doi-with-doi-prefix", "url-trailing-slash",
  "author-ampersand", "author-and", "author-et-al", "editors-one",
];
const KINDS = ["journal", "book", "web", "chapter", "report", "thesis", "conf"];
const HELPERS: Record<string, (...args: never[]) => unknown> = { citLastName, citNames, citInitials, apaAuthors, apa6Authors, mlaAuthors, chicagoAuthors, harvardAuthors, vancAuthors, ieeeAuthors, citWho, citEdList, citKind, citIsNumbered };
/** A test name for a helper call: its arguments as JSON, cut at 80 characters (the 22-author list is long). */
const label = (args: unknown[]) => {
  const s = JSON.stringify(args).slice(1, -1);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

describe("citation.ts is v1's citFmt", () => {
  it("the corpus has the brief's ids, and the fixture was captured from exactly this corpus", () => {
    for (const id of IDS) expect(entries.some((e) => e.id === id), id).toBe(true);
    expect(fx.entries).toEqual(entries);
    expect([...new Set(fx.cases.map((c) => c.id))]).toEqual(entries.map((e) => e.id));
  });
  it("at least 25 entries, eight styles, two numberings, every kind in every style", () => {
    expect(entries.length).toBeGreaterThanOrEqual(25);
    expect(fx.cases.length).toBeGreaterThanOrEqual(400);
    for (const st of Object.keys(CIT_STYLES)) for (const k of KINDS)
      expect(fx.cases.some((c) => c.style === st && citKind(entries.find((e) => e.id === c.id)!.entry.type) === k), `${st} ${k}`).toBe(true);
  });
  it("every entry is captured in every style with n = 0 and n = 3, once", () => {
    const keys = fx.cases.map((c) => `${c.id} ${c.style} ${c.n}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(entries.length * Object.keys(CIT_STYLES).length * 2);
  });
  it("the six Hindi entries reach the six kinds that are not journal", () => {
    const hindi = entries.filter((e) => e.id.startsWith("hindi-"));
    expect(hindi.map((e) => citKind(e.entry.type)).sort()).toEqual(KINDS.filter((k) => k !== "journal").sort());
  });
  for (const c of fx.cases) it(`${c.id} ${c.style} n=${c.n}`, () => expect(citFmt(entryOf(c.id), c.n, c.style)).toEqual(c.out));
  for (const k of fx.kinds) it(`citKind(${k.t})`, () => expect(citKind(k.t)).toBe(k.out));
  it("citKind is recorded for v1's seven type values and its six Hindi names, which reach all seven kinds", () => {
    expect(fx.kinds).toHaveLength(13);
    expect([...new Set(fx.kinds.map((k) => k.out))].sort()).toEqual([...KINDS].sort());
  });
  // helpers: dispatched by name, toEqual.
  for (const h of fx.helpers) it(`${h.fn}(${label(h.args)})`, () => expect(Reflect.apply(HELPERS[h.fn]!, undefined, h.args)).toEqual(h.out));
  it("every helper is recorded, and nothing else", () => {
    expect([...new Set(fx.helpers.map((h) => h.fn))].sort()).toEqual(Object.keys(HELPERS).sort());
  });
  it("numbered styles print [?] when the source has no library number (n = 0); AMA marks sup", () => {
    const e = entries.find((x) => x.id === "org-no-year")!.entry;
    expect(citFmt(e, 0, "vancouver").intext).toBe("[?]"); expect(citFmt(e, 0, "ama").sup).toBe(true); expect(citFmt(e, 0, "apa").intext).toContain("n.d.");
  });
  // The register rows' own literals, checked against v1's output, so a re-capture that changed them would leave the rows stale and fail here.
  it("register row F23a: MLA's in-text form of a journal article cites the article's first page (miller-3-authors)", () => {
    expect(outOf("miller-3-authors", "mla", 0).intext).toBe("(Miller et al. 81)");
  });
  it("register row F23b: with no author and no year, Chicago and IEEE print n.d.. and Harvard leads with (n.d.) (untitled-no-author-no-year)", () => {
    expect(outOf("untitled-no-author-no-year", "chicago", 0).ref.startsWith("n.d.. ")).toBe(true);
    expect(outOf("untitled-no-author-no-year", "ieee", 0).ref.endsWith(" n.d..")).toBe(true);
    expect(outOf("untitled-no-author-no-year", "harvard", 0).ref.startsWith("(n.d.) ")).toBe(true);
  });
  it("register row F23c: APA has only the parenthetical in-text form, no narrative one (miller-3-authors)", () => {
    const out = outOf("miller-3-authors", "apa", 0);
    expect(Object.keys(out).sort()).toEqual(["intext", "num", "ref", "refHTML", "sup"]);
    expect(out.intext).toBe("(Miller et al., 2020)");
  });
});

describe("generated citation tables equal v1's", () => {
  const t = readFixture<{ tables: Record<string, unknown> }>("citation", "tables");
  for (const [name, value] of Object.entries({ CIT_MONTHS, CIT_MON_MLA, CIT_MON_ABB, CIT_MON_IEEE, CIT_STYLES })) it(name, () => expect(JSON.stringify(value)).toBe(JSON.stringify(t.tables[name])));
  it("the fixture holds these five tables and no other", () => expect(Object.keys(t.tables).sort()).toEqual(["CIT_MONTHS", "CIT_MON_ABB", "CIT_MON_IEEE", "CIT_MON_MLA", "CIT_STYLES"]));
});
