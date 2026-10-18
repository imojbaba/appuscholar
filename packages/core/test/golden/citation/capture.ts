import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";

/**
 * Task 8's citation engine (v1 7053-7465) on the hand-written corpus in entries.json, `{ id, entry }`, `entry` being the object citReadForm (7466) builds. The corpus is the one input a person
 * writes (its Hindi type names copied from v1's bytes, never typed); every output below is v1's own.
 *
 * - `cases`: citFmt(entry, n, style) for every entry, every style (the keys of v1's CIT_STYLES, in v1's order) and n in {0, 3}: 0 is a source with no library number, 3 a numbered one. The style
 *   is always passed, so v1 never reads #citStyle (7325). `entries` is the corpus the cases were captured from (the input beside the output); the test compares it with entries.json.
 * - `kinds`: citKind over the seven type values of v1's own #citType select (881) and the six Hindi names citKind tests (7077-7082), read from v1's source text with the pattern below.
 * - `helpers`: `{ fn, args, out }`, the shape smoke/capture.ts uses, each over the corpus strings v1 hands it: citLastName, the seven author formatters (vancAuthors as citFmt calls it, with
 *   (6, 6) and (6, 3)) and citWho in every style over the author strings; citEdList in every mode over the editor strings; citNames over both, and citInitials over the first names it finds in them;
 *   citKind over the type strings; citIsNumbered over the styles and one name that is not a style.
 * - `tables.json` (and, under --emit, src/data/citation-tables.ts): CIT_MONTHS, CIT_MON_MLA, CIT_MON_ABB, CIT_MON_IEEE and CIT_STYLES (7064-7073) as v1 holds them.
 * - `devanagari.json`: `{ ranges, strings, runs }`. `strings` is every quoted string holding a Devanagari letter in the v1 line ranges core has ported (RANGES), with JavaScript escapes decoded (ruling R9).
 *   `runs` is every maximal run of Devanagari code points anywhere in those ranges' source text, a regex literal or a comment included (v1 12109 holds the heading pattern of the cross-check in a regex
 *   literal, which no quoted-string pattern sees), each once, in order of appearance (ruling T8-T9). devanagari.test.ts checks both: that core holds each string and each run, and that it holds no other.
 *   A task that ports a range appends it to RANGES and re-captures citation; cases.json and tables.json must stay `same`.
 */

/** The v1 line ranges, [first, last], whose ports have landed in core (ruling R5). A task that ports a range appends it here and re-captures `citation`. */
export const RANGES: Array<[first: number, last: number]> = [
  [2500, 2500], // fieldName (Task 13, prompts.ts: fieldLabel)
  [2606, 2606], // escHTML (Task 8, html.ts)
  [3608, 3624], // vivaAsk (Task 13, prompts-helpers.ts: buildVivaPrompt, VIVA_MIN_WORDS)
  [8033, 8033], // escAttr (Task 8, html.ts)
  [7053, 7465], // the citation engine (Task 8, citation.ts)
  [7488, 7493], // citKey and citNumFor (Task 10, citlib.ts)
  [7510, 7555], // v1's backlinks comment (kept in citlib.ts), citPlainDocs, citRegex, citNumsIn, citUsageNumbered and citUsage (Task 10, citlib.ts)
  [7564, 7565], // retrNormDoi and retrValidDoi (Task 11, analyse.ts)
  [7871, 7881], // citInsertBib (Task 10, citlib.ts); not 7882-7887, the comment that opens the next function, which core does not port (its line 7885 holds a Devanagari word)
  [7991, 8023], // citExport and citImport (Task 10, citlib.ts)
  [8041, 8049], // rsReconstructAbstract (Task 12, research.ts)
  [8055, 8060], // rsOaStatus (Task 12, research.ts)
  [8127, 8127], // RS_DESIGNS (Task 12, data/research-tables.ts)
  [8128, 8130], // rsQuickPrompt (Task 13, prompts-research.ts: buildQuickReadPrompt)
  [8131, 8160], // rsQuickCheck (Task 12, research.ts)
  [8191, 8195], // rsCsvText (Task 12, research.ts)
  [8206, 8208], // rsRankPrompt (Task 13, prompts-research.ts: buildRankPrompt)
  [8209, 8219], // rsRankParse (Task 12, research.ts)
  [8237, 8244], // RS_DESIGN (Task 12, data/research-tables.ts)
  [8245, 8250], // rsCleanTerm (Task 12, research.ts)
  [8256, 8256], // the prompt inside rsSuggestTerms (Task 13, prompts-research.ts: buildSuggestTermsPrompt); not the rest of rsSuggestTerms, 8251-8255 and 8257-8263
  [8273, 8282], // rsBuildQuery (Task 12, research.ts); 8283 opens researchSearch
  [8312, 8314], // the de-duplication inside researchSearch (Task 12, research.ts: rsDedupe); not 8311, the merge before it, nor the rest of researchSearch
  [8336, 8346], // rsFilterPass (Task 12, research.ts)
  [8455, 8464], // rsAuthorsToCit (Task 12, research.ts)
  [8465, 8470], // rsEntryFromResult (Task 12, research.ts)
  [8525, 8529], // rsCorpusText (Task 12, research.ts)
  [8530, 8551], // researchLitReview and researchGapFinder (Task 13, prompts-research.ts: buildLitReviewPrompt, buildGapFinderPrompt)
  [8568, 8580], // ideaAssess (Task 13, prompts-idea.ts: buildIdeaPrompt)
  [8592, 8615], // PSYCH_PROMPTS and psychTool (Task 13, prompts-helpers.ts: buildHelperPrompt, HELPER_TEMPS, HELPER_MIN_CHARS)
  [8619, 8630], // devilTool (Task 13, prompts-helpers.ts: buildDevilPrompt, DEVIL_MIN_WORDS)
  [8633, 8690], // the distribution core (Task 6, pvalue.ts)
  [9461, 9462], // pdCsvCell and pdCsv (Task 12, csv.ts)
  [9837, 9837], // AP_SAMPLE (Task 11, data/analyse-tables.ts)
  [9839, 9881], // AP_STAGES (data/analyse-tables.ts), AP_HEADS, AP_STOP (its words in data/analyse-tables.ts), apSquash, apToks, apHeadName and apBuild (Task 11, analyse.ts); not apLoad, 9882-9891
  [9987, 10017], // apPick, apJson and apCheckQuote (Task 11, analyse.ts); not apQuotesHTML, 10018-10026, nor the prompts of Task 14 from 10027
  [10066, 10105], // apNumbers (Task 11, analyse.ts)
  [10435, 10435], // AP_NAME (Task 11, data/analyse-tables.ts)
  [11225, 11235], // apRefDois (Task 11, analyse.ts)
  [11980, 11982], // noLead, pCell and fmtP (Task 6, statfmt.ts)
  [12100, 12157], // the citation cross-check (Task 9, crosscheck.ts)
  [12195, 12257], // the Numbers check (Task 7, numbers.ts)
];

/** A quoted string holding a Devanagari letter (the brief's pattern, used on v1's lines here and on core's files in devanagari.test.ts): a quote, characters that are neither quotes nor line breaks, a quote. */
export const DEVANAGARI_STRING = /["'`]([^"'`\n]*[ऀ-ॿ][^"'`\n]*)["'`]/g;

/** A maximal run of Devanagari code points (U+0900 to U+097F) anywhere in a line: in a string, a regex literal or a comment. Written with escapes, so this file holds no Devanagari of its own. */
export const DEVANAGARI_RUN = /[\u0900-\u097f]+/g;

const SIMPLE_ESCAPES: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "0": "\0" };
/** A string's body with JavaScript's escapes decoded (ruling R9: Devanagari strings are compared as values, both ways). A body with no backslash comes back as it is. */
export function decodeEscapes(body: string): string {
  return body.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g, (_m: string, cp?: string, u?: string, x?: string, c?: string) =>
    cp !== undefined ? String.fromCodePoint(parseInt(cp, 16)) : u !== undefined ? String.fromCharCode(parseInt(u, 16)) : x !== undefined ? String.fromCharCode(parseInt(x, 16)) : (SIMPLE_ESCAPES[c!] ?? c!));
}

const DEVANAGARI = /[ऀ-ॿ]/g;
const devanagariCount = (s: string) => (s.match(DEVANAGARI) ?? []).length;

/** The Devanagari strings of v1's lines first..last, in order, each once. A Devanagari letter outside a quoted string (a comment, a regex literal) is reported here and recorded by devanagariRuns. */
function devanagariStrings(lines: string[], first: number, last: number): string[] {
  const found: string[] = [];
  for (let n = first; n <= last; n++) {
    const line = lines[n - 1];
    if (line === undefined) throw new Error(`citation: v1 has no line ${n}`);
    let inStrings = 0;
    for (const m of line.matchAll(DEVANAGARI_STRING)) {
      const whole = m[0], body = m[1]!;
      if (whole[0] !== whole[whole.length - 1]) throw new Error(`citation: v1 line ${n}: a Devanagari string between two different quotes, ${whole}; the pattern needs widening`);
      if (/(?:^|[^\\])(?:\\\\)*\\$/.test(body)) throw new Error(`citation: v1 line ${n}: a Devanagari string that holds an escaped quote, ${whole}; read the whole literal (ruling R9)`);
      const s = decodeEscapes(body);
      if (!found.includes(s)) found.push(s);
      inStrings += devanagariCount(whole);
    }
    if (devanagariCount(line) > inStrings) console.log(`citation: v1 line ${n} has Devanagari outside a quoted string (a comment or a regex literal); it is recorded in runs, not in strings`);
  }
  return found;
}

/** The maximal Devanagari runs of v1's lines first..last, wherever they stand in a line, in order of appearance, each once. */
function devanagariRuns(lines: string[], first: number, last: number): string[] {
  const found: string[] = [];
  for (let n = first; n <= last; n++) {
    const line = lines[n - 1];
    if (line === undefined) throw new Error(`citation: v1 has no line ${n}`);
    for (const m of line.matchAll(DEVANAGARI_RUN)) if (!found.includes(m[0])) found.push(m[0]);
  }
  return found;
}

type Entry = { id: string; entry: Record<string, string | undefined> };
type Name = { last: string; first: string; org: boolean };

const distinct = <T>(xs: T[]): T[] => [...new Set(xs)];
const defined = (s: string | undefined): s is string => s !== undefined;

export const citation: Engine = {
  name: "citation",
  async capture(v1, opts) {
    const { check } = opts;
    const corpus = JSON.parse(readFileSync(new URL("./entries.json", import.meta.url), "utf8")) as Entry[];
    const ids = new Set<string>();
    for (const { id } of corpus) {
      if (ids.has(id)) throw new Error(`citation: entries.json has the id ${id} twice`);
      ids.add(id);
    }

    const lines = v1.text.split("\n");
    const hindiKinds = devanagariStrings(lines, 7075, 7084);
    const englishKinds = Array.from(v1.document.querySelectorAll<HTMLOptionElement>("#citType option"), (o) => o.value);
    if (hindiKinds.length !== 6 || englishKinds.length !== 7) throw new Error(`citation: expected citKind's six Hindi names and #citType's seven values, found ${hindiKinds.length} and ${englishKinds.length}`);
    for (const { id, entry } of corpus) if (id.startsWith("hindi-") && !hindiKinds.includes(entry.type ?? "")) throw new Error(`citation: ${id}'s type is not one of citKind's Hindi names, byte for byte`);

    const tables = Object.fromEntries(["CIT_MONTHS", "CIT_MON_MLA", "CIT_MON_ABB", "CIT_MON_IEEE", "CIT_STYLES"].map((name) => [name, v1.eval(name)]));
    const styles = Object.keys(v1.eval<Record<string, unknown>>("CIT_STYLES"));

    // The entry is copied before the call, so a function that changed its input could not change the record.
    const cases = corpus.flatMap(({ id, entry }) => styles.flatMap((style) => [0, 3].map((n) => ({ id, style, n, out: v1.call("citFmt", structuredClone(entry), n, style) }))));
    const kinds = [...englishKinds, ...hindiKinds].map((t) => ({ t, out: v1.call<string>("citKind", t) }));

    // Arguments go through JSON before the call: citWho's list comes from v1's own citNames, and the record must hold exactly what the call received.
    const rec = (fn: string, ...args: unknown[]) => {
      const copy = JSON.parse(JSON.stringify(args)) as unknown[];
      return { fn, args: copy, out: v1.call(fn, ...copy) };
    };
    const authors = distinct(corpus.map(({ entry }) => entry.author).filter(defined));
    const editors = distinct(corpus.map(({ entry }) => entry.editors).filter(defined));
    const names = distinct([...authors, ...editors]);
    const namesOf = (raw: string) => v1.call<Name[]>("citNames", raw);
    const firsts = distinct(names.flatMap((raw) => namesOf(raw).map((n) => n.first)));
    const types = distinct(corpus.map(({ entry }) => entry.type).filter(defined));
    const MODES = ["apa", "first-last", "harvard", "vanc", "ieee"]; // citEdList's modes (7211-7215)
    const helpers = [
      ...authors.map((raw) => rec("citLastName", raw)),
      ...names.map((raw) => rec("citNames", raw)),
      ...firsts.map((first) => rec("citInitials", first)),
      ...["apaAuthors", "apa6Authors", "mlaAuthors", "chicagoAuthors", "harvardAuthors"].flatMap((fn) => authors.map((raw) => rec(fn, raw))),
      ...authors.flatMap((raw) => [rec("vancAuthors", raw, 6, 6), rec("vancAuthors", raw, 6, 3)]),
      ...authors.map((raw) => rec("ieeeAuthors", raw)),
      ...authors.flatMap((raw) => styles.map((st) => rec("citWho", namesOf(raw), st))),
      ...editors.flatMap((raw) => MODES.map((mode) => rec("citEdList", raw, mode))),
      ...types.map((t) => rec("citKind", t)),
      ...[...styles, "turabian"].map((st) => rec("citIsNumbered", st)),
    ];
    for (const mode of MODES) if (!helpers.some((h) => h.fn === "citEdList" && h.args[1] === mode && (h.out as { txt: string }).txt !== "")) throw new Error(`citation: citEdList mode ${mode} gave no text for any name`);

    const ranges = RANGES.map(([first, last]) => [first, last]);
    const strings = distinct(RANGES.flatMap(([first, last]) => devanagariStrings(lines, first, last)));
    const runs = distinct(RANGES.flatMap(([first, last]) => devanagariRuns(lines, first, last)));
    return [
      emitTables(v1, "citation", "citation-tables", tables, opts),
      writeFixture("citation", "cases", { entries: corpus, cases, kinds, helpers }, v1, check),
      writeFixture("citation", "devanagari", { ranges, strings, runs }, v1, check),
    ];
  },
};
