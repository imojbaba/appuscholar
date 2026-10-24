import { describe, expect, it } from "vitest";
import { citKey, type RcCheck } from "@appuscholar/core";
import en from "../messages/en.json";
import type { RefCheckCache, RetractionCache, StoredEntry } from "../lib/blobs/kinds";
import { rcCurrent, sourceStatus } from "../lib/cite/checks";
import { HOME_LIMIT, ackField, attentionItems, attentionText, fixLabel, itemsForPaper, mineOf, type AttentionItem } from "../lib/attention";
import { tFormat } from "../lib/i18n";

/*
 * "Needs your attention" (wave B Task 24, register row D-S2-130): the data problems of a project's library, worked out from the library, the Crossref check's answers and the retraction
 * answers, in the plan's order and the plan's sentences. A pure function: the home, the Citations tab and the Reading list all show what it returns.
 */

const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => tFormat(E, E, k, "en", v);

const COHEN: StoredEntry = { pid: "kcohen", type: "Book", author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences", source: "Lawrence Erlbaum Associates", doi: "10.4324/9780203771587" };
const OMEGA: StoredEntry = { pid: "komega", type: "Journal article", author: "", year: "2011", title: "Omega-3 supplementation lowers inflammation and anxiety in medical students: a randomized controlled trial", source: "Brain, Behavior, and Immunity", volume: "25", issue: "8", doi: "10.1016/j.bbi.2011.07.229" };
const PUTWAIN: StoredEntry = { pid: "kputwain", type: "Journal article", author: "Putwain, D. W.", year: "2008", title: "Examination stress and test anxiety" };
const SCHAEFER: StoredEntry = {
  pid: "kschaefer", type: "Journal article", author: "Schaefer, M.; Denke, C.; Harke, R.; Olk, N.; Erkovan, M.; Enge, S.", year: "2019",
  title: "Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial", source: "Scientific Reports", volume: "9", pages: "13317", doi: "10.1038/s41598-019-49466-6"
};
const SHORT = {
  cohen: "Cohen, 1988: statistical power analysis for",
  omega: "2011: omega-3 supplementation lowers inflammation",
  putwain: "Putwain, 2008: examination stress and test",
  schaefer: "Schaefer et al., 2019: open-label placebos reduce test"
};

const checked = (over: Partial<RcCheck> = {}): RcCheck => ({ s: "ok", m: [], f: { title: "x", year: 2020, author: "x", doi: "10.1/x" }, t: 1, ...over });
const cache = (...pairs: Array<[StoredEntry, RcCheck]>): RefCheckCache => Object.fromEntries(pairs.map(([e, c]) => [citKey(e), c]));
const items = (o: { lib: StoredEntry[]; refcheck?: RefCheckCache | null; retraction?: RetractionCache | null }) =>
  attentionItems({ lib: o.lib, refcheck: o.refcheck === undefined ? {} : o.refcheck, retraction: o.retraction ?? null, notes: null, t });
const say = (list: AttentionItem[]) => list.map((i) => attentionText(i, t));
/** An answer that says the entry has no author and Crossref lists these. */
const NO_AUTHOR_ANSWER = checked({
  s: "diff", m: [{ k: "author", v: "Kiecolt-Glaser" }], miss: ["author"],
  f: { title: "x", year: 2011, author: "Kiecolt-Glaser", doi: OMEGA.doi!, authors: "Kiecolt-Glaser, Janice K.; Belury, Martha A.; Andridge, Rebecca; Malarkey, William B.; Glaser, Ronald" }
});

/** One case per kind, in the plan's words. */
const ATTENTION_CASES: Array<{
  name: string; lib: StoredEntry[]; refcheck?: RefCheckCache | null; retraction?: RetractionCache | null;
  expect: Array<{ kind: AttentionItem["kind"]; text: string; fix: AttentionItem["fix"]; pids: string[] }>;
}> = [
  {
    name: "retracted", lib: [COHEN], refcheck: cache([COHEN, checked()]), retraction: { [COHEN.doi!]: { r: true, t: 1 } },
    expect: [{ kind: "retracted", text: `${SHORT.cohen} has been retracted. Check before you cite it.`, fix: null, pids: ["kcohen"] }]
  },
  {
    name: "no-authors, with Crossref data", lib: [OMEGA], refcheck: cache([OMEGA, NO_AUTHOR_ANSWER]),
    expect: [{ kind: "no-authors", text: `${SHORT.omega} has no authors. Crossref lists Kiecolt-Glaser, Belury, Andridge, Malarkey and 1 more.`, fix: "crossref", pids: ["komega"] }]
  },
  {
    name: "no-authors, without Crossref data", lib: [OMEGA], refcheck: {},
    expect: [
      { kind: "no-authors", text: `${SHORT.omega} has no authors. Check the paper and add them.`, fix: null, pids: ["komega"] },
      { kind: "unchecked", text: "1 source has not been checked against Crossref.", fix: "check", pids: ["komega"] }
    ]
  },
  {
    name: "crossref-differs (the year)", lib: [COHEN], refcheck: cache([COHEN, checked({ s: "diff", m: [{ k: "year", v: "2013" }] })]),
    expect: [{ kind: "crossref-differs", text: `${SHORT.cohen}: the year differs from Crossref (2013).`, fix: "keep-mine", pids: ["kcohen"] }]
  },
  {
    name: "crossref-differs (the title and the first author)", lib: [PUTWAIN],
    refcheck: cache([PUTWAIN, checked({ s: "diff", m: [{ k: "title", v: "Examination stress and test anxiety in schools" }, { k: "author", v: "Putwayne" }] })]),
    expect: [
      { kind: "crossref-differs", text: `${SHORT.putwain}: the title differs from Crossref (Examination stress and test anxiety in schools).`, fix: "keep-mine", pids: ["kputwain"] },
      { kind: "crossref-differs", text: `${SHORT.putwain}: the first author differs from Crossref (Putwayne).`, fix: "keep-mine", pids: ["kputwain"] }
    ]
  },
  {
    name: "not-found", lib: [PUTWAIN], refcheck: cache([PUTWAIN, { s: "nf", t: 1 }]),
    expect: [{ kind: "not-found", text: `Crossref has no record of ${SHORT.putwain}. Check its title and DOI.`, fix: null, pids: ["kputwain"] }]
  },
  {
    name: "missing-fields (one item for all the journal articles)", lib: [PUTWAIN, SCHAEFER, COHEN],
    refcheck: cache(
      [PUTWAIN, checked({ s: "diff", miss: ["volume", "pages"], f: { title: "x", year: 2008, author: "Putwain", doi: "", volume: "3", pages: "1-9" } })],
      [SCHAEFER, checked({ s: "diff", miss: ["issue"], f: { title: "x", year: 2019, author: "Schaefer", doi: "", issue: "2" } })],
      // A book is not a journal article: its volume is not what a reference list is missing.
      [COHEN, checked({ s: "diff", miss: ["volume"], f: { title: "x", year: 1988, author: "Cohen", doi: "", volume: "1" } })]
    ),
    expect: [{ kind: "missing-fields", text: "Your reference list is missing volume, issue and pages for 2 journal articles.", fix: "crossref", pids: ["kputwain", "kschaefer"] }]
  },
  {
    name: "missing-fields, for one article", lib: [PUTWAIN],
    refcheck: cache([PUTWAIN, checked({ s: "diff", miss: ["volume", "pages"], f: { title: "x", year: 2008, author: "Putwain", doi: "", volume: "3", pages: "1-9" } })]),
    expect: [{ kind: "missing-fields", text: "Your reference list is missing volume and pages for 1 journal article.", fix: "crossref", pids: ["kputwain"] }]
  },
  {
    name: "duplicate (the same DOI)", lib: [COHEN, { ...COHEN, pid: "kcohen2", doi: "https://doi.org/10.4324/9780203771587", year: "" }], refcheck: cache([COHEN, checked()]),
    expect: [
      { kind: "duplicate", text: `${SHORT.cohen} is in your library twice.`, fix: "merge", pids: ["kcohen", "kcohen2"] },
      { kind: "unchecked", text: "1 source has not been checked against Crossref.", fix: "check", pids: ["kcohen2"] }
    ]
  },
  {
    name: "duplicate (no DOI: the same long title and a year that agrees)", lib: [PUTWAIN, { ...PUTWAIN, pid: "kputwain2", author: "Putwain" }], refcheck: cache([PUTWAIN, checked()]),
    expect: [{ kind: "duplicate", text: `${SHORT.putwain} is in your library twice.`, fix: "merge", pids: ["kputwain", "kputwain2"] }]
  },
  {
    name: "unchecked", lib: [COHEN, PUTWAIN, SCHAEFER], refcheck: cache([PUTWAIN, { s: "err", t: 1 }], [SCHAEFER, checked()]),
    expect: [{ kind: "unchecked", text: "2 sources have not been checked against Crossref.", fix: "check", pids: ["kcohen", "kputwain"] }]
  }
];

describe("attentionItems", () => {
  it.each(ATTENTION_CASES)("attentionItems: $name", (c) => {
    const out = items({ lib: c.lib, refcheck: c.refcheck, retraction: c.retraction });
    expect(out.map((i) => ({ kind: i.kind, text: attentionText(i, t), fix: i.fix, pids: i.pids }))).toEqual(c.expect);
    // Every item has an id of its own, and its words are in the dictionary.
    expect(new Set(out.map((i) => i.id)).size).toBe(out.length);
    for (const i of out) expect(E[i.key]).toBeTypeOf("string");
  });

  it("is quiet for a library that is checked, whole and has nothing retracted", () => {
    expect(items({ lib: [COHEN, SCHAEFER], refcheck: cache([COHEN, checked()], [SCHAEFER, checked()]), retraction: { [COHEN.doi!]: { r: false, t: 1 } } })).toEqual([]);
    expect(items({ lib: [], refcheck: {} })).toEqual([]);
  });

  it("the items come in the plan's order: retracted, no authors, differs, not found, missing fields, duplicate, unchecked", () => {
    const twin: StoredEntry = { ...SCHAEFER, pid: "ktwin" };
    const lib = [OMEGA, COHEN, PUTWAIN, SCHAEFER, twin];
    const out = items({
      lib,
      refcheck: cache(
        [OMEGA, NO_AUTHOR_ANSWER],
        [COHEN, checked({ s: "diff", m: [{ k: "year", v: "2013" }] })],
        [PUTWAIN, { s: "nf", t: 1 }],
        [SCHAEFER, checked({ s: "diff", miss: ["issue"], f: { title: "x", year: 2019, author: "Schaefer", doi: "", issue: "2" } })]
      ),
      retraction: { [SCHAEFER.doi!]: { r: true, t: 1 } }
    });
    expect(out.map((i) => i.kind)).toEqual(["retracted", "retracted", "no-authors", "crossref-differs", "not-found", "missing-fields", "duplicate"]);
    expect(out.slice(0, 2).map((i) => i.pids)).toEqual([["kschaefer"], ["ktwin"]]);
  });

  it("an answer that is not in yet is not 'unchecked': with the check cache unread nothing says unchecked or differs, and an answer of 'err' is unchecked", () => {
    const out = items({ lib: [COHEN, OMEGA], refcheck: null });
    expect(out.map((i) => i.kind)).toEqual(["no-authors"]);
    expect(say(out)).toEqual([`${SHORT.omega} has no authors. Check the paper and add them.`]);
    expect(items({ lib: [COHEN], refcheck: cache([COHEN, { s: "err", t: 1 }]) }).map((i) => i.kind)).toEqual(["unchecked"]);
  });

  it("an entry that has no pid yet is left out (the paper-id migration gives it one)", () => {
    const loose: StoredEntry = { author: "", year: "2020", title: "A paper nobody has an id for yet" };
    expect(items({ lib: [loose], refcheck: {} })).toEqual([]);
  });

  it("a filled author clears its item, and it does not come back as unchecked once the answer has moved to the new key", () => {
    const filled: StoredEntry = { ...OMEGA, author: "Kiecolt-Glaser, Janice K.; Belury, Martha A." };
    // The answer under the old key (its surname was "Author"): the entry now reads as unchecked.
    const stale = items({ lib: [filled], refcheck: cache([OMEGA, NO_AUTHOR_ANSWER]) });
    expect(stale.map((i) => i.kind)).toEqual(["unchecked"]);
    // The fix moves the answer to the entry's new key: the author line leaves the answer (rcCurrent), so nothing is left.
    const moved: RefCheckCache = { [citKey(filled)]: rcCurrent(filled, NO_AUTHOR_ANSWER)! };
    expect(items({ lib: [filled], refcheck: moved })).toEqual([]);
    expect(sourceStatus(filled, moved[citKey(filled)], null)).toBe("checked");
  });

  it("Keep 1988 hides the year difference for good: the entry's ack holds the kind, and the status goes back to Checked", () => {
    const diff = checked({ s: "diff", m: [{ k: "year", v: "2013" }, { k: "title", v: "Statistical power analysis for the behavioral sciences, second edition" }] });
    const before = items({ lib: [COHEN], refcheck: cache([COHEN, diff]) });
    expect(before.map((i) => i.vars.field)).toEqual(["year", "title"]);
    expect(fixLabel(before[0]!, t)).toBe("Keep 1988");
    const kept: StoredEntry = { ...COHEN, ack: ["year"] };
    const after = items({ lib: [kept], refcheck: cache([kept, diff]) });
    expect(after.map((i) => i.vars.field)).toEqual(["title"]);
    expect(sourceStatus(kept, diff, null)).toBe("fix");
    const both: StoredEntry = { ...COHEN, ack: ["year", "title"] };
    expect(items({ lib: [both], refcheck: cache([both, diff]) })).toEqual([]);
    expect(sourceStatus(both, diff, null)).toBe("checked");
    // The stored answer itself is not touched; only how the entry reads it.
    expect(diff.m).toHaveLength(2);
  });

  it("the Keep button names what is kept: the year, the surname for the first author, 'my title' for a title", () => {
    expect(mineOf(COHEN, "year", t)).toBe("1988");
    expect(mineOf(COHEN, "author", t)).toBe("Cohen");
    expect(mineOf(COHEN, "title", t)).toBe("my title");
    const out = items({ lib: [COHEN], refcheck: cache([COHEN, checked({ s: "diff", m: [{ k: "author", v: "Cohn" }, { k: "title", v: "x" }] })]) });
    expect(out.map((i) => fixLabel(i, t))).toEqual(["Keep Cohen", "Keep my title"]);
  });

  it("a very long title Crossref holds is cut in the sentence", () => {
    const long = "A".repeat(200);
    const out = items({ lib: [COHEN], refcheck: cache([COHEN, checked({ s: "diff", m: [{ k: "title", v: long }] })]) });
    const text = attentionText(out[0]!, t);
    expect(text.length).toBeLessThan(200);
    expect(text).toContain("…)");
  });

  it("two entries that are the same paper make one item for the pair, the older one named first; three make two", () => {
    const a: StoredEntry = { ...COHEN, pid: "ka" }, b: StoredEntry = { ...COHEN, pid: "kb" }, c: StoredEntry = { ...COHEN, pid: "kc" };
    const out = items({ lib: [a, b, c], refcheck: cache([a, checked()]) }).filter((i) => i.kind === "duplicate");
    expect(out.map((i) => i.pids)).toEqual([["ka", "kb"], ["ka", "kc"]]);
    expect(new Set(out.map((i) => i.id)).size).toBe(2);
  });

  it("a library of two thousand sources is paired by DOI and title, not compared pair by pair", () => {
    const many: StoredEntry[] = Array.from({ length: 2000 }, (_, i) => ({ pid: "k" + i, author: "Author, A.", year: "2020", title: "A reasonably long title number " + i + " about sleep and learning", doi: "10.1000/x" + i }));
    const lib = [...many, { ...many[10]!, pid: "klate" }, { ...many[1999]!, pid: "klast", doi: "" }];
    const refcheck = Object.fromEntries(lib.map((e) => [citKey(e), checked()]));
    const from = Date.now();
    const out = items({ lib, refcheck });
    expect(Date.now() - from).toBeLessThan(2000);
    expect(out.filter((i) => i.kind === "duplicate").map((i) => i.pids)).toEqual([["k10", "klate"], ["k1999", "klast"]]);
  });

  it("the home shows five at most", () => {
    expect(HOME_LIMIT).toBe(5);
  });
});

describe("what a paper's own row shows", () => {
  it("itemsForPaper: the items that name the paper, a list-wide item among them only for the papers it is about", () => {
    const lib = [PUTWAIN, SCHAEFER, COHEN];
    const out = items({
      lib,
      refcheck: cache([PUTWAIN, checked({ s: "diff", miss: ["volume", "pages"], f: { title: "x", year: 2008, author: "Putwain", doi: "", volume: "3", pages: "1-9" } })], [SCHAEFER, checked()]),
      retraction: { [SCHAEFER.doi!]: { r: true, t: 1 } }
    });
    expect(itemsForPaper(out, "kputwain").map((i) => i.kind)).toEqual(["missing-fields"]);
    expect(itemsForPaper(out, "kschaefer").map((i) => i.kind)).toEqual(["retracted"]);
    // The list-wide "not checked" is for the home; a row already says "Not checked yet" in its status.
    expect(itemsForPaper(out, "kcohen")).toEqual([]);
  });

  it("a missing-fields item reads in its own words on the row of one paper, with that paper's fields", () => {
    const out = items({
      lib: [PUTWAIN, SCHAEFER],
      refcheck: cache(
        [PUTWAIN, checked({ s: "diff", miss: ["volume", "pages"], f: { title: "x", year: 2008, author: "Putwain", doi: "", volume: "3", pages: "1-9" } })],
        [SCHAEFER, checked({ s: "diff", miss: ["issue"], f: { title: "x", year: 2019, author: "Schaefer", doi: "", issue: "2" } })]
      )
    });
    const miss = out.find((i) => i.kind === "missing-fields")!;
    expect(attentionText(miss, t)).toBe("Your reference list is missing volume, issue and pages for 2 journal articles.");
    expect(attentionText(miss, t, "kputwain")).toBe(`${SHORT.putwain} is missing volume and pages, which Crossref has.`);
    expect(attentionText(miss, t, "kschaefer")).toBe(`${SHORT.schaefer} is missing issue, which Crossref has.`);
    expect(fixLabel(miss, t)).toBe("Fill them one by one");
    expect(fixLabel(miss, t, "kputwain")).toBe("Use Crossref details");
  });

  it("the fix labels", () => {
    const lib = [COHEN, { ...COHEN, pid: "kb", year: "" }];
    const out = items({ lib, refcheck: cache([COHEN, checked()]) });
    expect(out.map((i) => [i.kind, fixLabel(i, t)])).toEqual([["duplicate", "Merge the two"], ["unchecked", "Check now"]]);
    const n = items({ lib: [OMEGA], refcheck: cache([OMEGA, NO_AUTHOR_ANSWER]) })[0]!;
    expect(fixLabel(n, t)).toBe("Use Crossref details");
    // Task 30's number check has no button yet.
    expect(fixLabel({ ...n, fix: "open-numbers" }, t)).toBeNull();
    expect(fixLabel({ ...n, fix: null }, t)).toBeNull();
  });
});

describe("ackField", () => {
  it("adds the kind to the paper's ack once, and changes nothing else", () => {
    const lib: StoredEntry[] = [COHEN, { ...PUTWAIN, ack: ["title"] }];
    const out = ackField(lib, "kcohen", "year");
    expect(out[0]).toEqual({ ...COHEN, ack: ["year"] });
    expect(out[1]).toBe(lib[1]);
    expect(ackField(out, "kcohen", "year")).toBe(out);
    expect(ackField(out, "kcohen", "title")[0]!.ack).toEqual(["year", "title"]);
    expect(ackField(lib, "knobody", "year")).toBe(lib);
    expect(lib[0]).toBe(COHEN);
  });
});

describe("rcCurrent with an ack", () => {
  it("leaves out the differences the student kept, and is a match when nothing is left", () => {
    const diff = checked({ s: "diff", m: [{ k: "year", v: "2013" }] });
    expect(rcCurrent({ ...COHEN, ack: ["year"] }, diff)).toMatchObject({ s: "ok", m: [] });
    expect(rcCurrent({ ...COHEN, ack: ["title"] }, diff)).toBe(diff);
    expect(rcCurrent(COHEN, diff)).toBe(diff);
    // A field Crossref has and the source lacks is not a difference the student can keep.
    const miss = checked({ s: "diff", m: [{ k: "year", v: "2013" }], miss: ["pages"], f: { title: "x", year: 2013, author: "x", doi: "", pages: "1-2" } });
    expect(rcCurrent({ ...COHEN, ack: ["year"] }, miss)).toMatchObject({ s: "diff", m: [], miss: ["pages"] });
  });
});
