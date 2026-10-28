import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { emitTables, encodeSpecial, writeFixture } from "../harness/fixture";
import { docInnerText } from "../../../src/doctext";

/**
 * Task 9's citation cross-check (v1 12100-12157) on the hand-written corpus in documents.json, `{ id, plain | html, lib, style }`: `plain` is the text ccOpen would read (12159), `html` a document body,
 * `lib` the library (v1 reads it from localStorage, 12160) and `style` the value of #citStyle when the check runs. The corpus is the one input a person writes. What it takes from elsewhere is copied, not
 * retyped: the HTML of four documents and the Hindi heading (with its variants) from the Task 3 corpus, most library entries from Task 8's entries.json, and the stop-word document from v1's own list;
 * the Devanagari surnames of one document are typed. Every output below is v1's own.
 *
 * - `cases`: one record per document, `{ id, html?, plain, lib, style, refs, out, split, cites, parsed }`. The inputs sit beside the outputs (the test compares them with documents.json).
 *   `plain` is the document as it stands, or for an `html` document the text the page would read: jsdom has no innerText, so it is the pinned converter's, `docInnerText(html)` with U+00A0 as a space (ccOpen
 *   12159), which is the contract of Task 3 (src/doctext.ts); v1's ccAnalyse then runs on that text. `style` is put in #citStyle first, since ccAnalyse's library branch calls `citFmt(d)` (12139) with
 *   no number and no style, and citFmt takes the style from the page (7325). `out` is ccAnalyse(plain, lib). `split` is ccSplit(plain), `cites` is ccCites on its body, and `parsed` is ccParseRef on each line of
 *   its list (null when there is no heading): the three pieces ccAnalyse is made of, called by themselves on the same text.
 * - `refs`: for every library entry, v1's `citFmt(d).ref` as ccAnalyse calls it. The capture also calls `citFmt(d, 0, style)` and `citFmt(d, undefined, style)` and throws unless all three agree to the
 *   last field: v1's `num=(n&&n>0)?n:0` (7331) makes an absent number and 0 the same, which is why the port passes 0 and the style (src/crosscheck.ts), and the test holds the port's `citFmt(d, 0, style).ref`
 *   to these.
 * - `patterns`: CC_SN and CC_YR (12101-12102), the strings every regex of the check is built from.
 * - `lev`: ccLev over ten pairs by direct call. The early return of 9 (a length difference above 2) is not visible through ccAnalyse, which only asks whether the distance is at most 2.
 * - `helpers`: `{ fn, args, out }` for ccNorm, ccKey and ccYrMatch over the strings and years the corpus uses and a few it does not.
 * - `tables.json` (and, under --emit, src/data/crosscheck-tables.ts): CC_STOP (12103) as an array in v1's order.
 */

type Doc = { id: string; plain?: string; html?: string; lib: Array<Record<string, string>>; style: string };

/** Ten pairs: equal, one substitution, a transposition (two edits), one insertion, a length difference of exactly 2 and of 3 (the early return), equal length and far apart, empty strings, and a raw diacritic. */
const LEV: Array<[string, string]> = [
  ["smith", "smith"], ["smith", "smyth"], ["smith", "smiht"], ["smith", "smithe"], ["smith", "smithee"], ["smith", "smithers"], ["smith", "jones"], ["", ""], ["", "ab"], ["muller", "m\u00fcller"],
];

/** The year strings ccYrMatch is given: the shapes CC_YR reads, n.d. in two cases and with a letter, and two a library entry can hold (v1 passes `String(d.year).trim()`). */
const YEARS = ["2019", "2019a", "2019b", "2020", "n.d.", "N.D.", "n.d.a", "in press", "2019A"];
const NORMS = ["Smith", "SMITH", "  Smith  ", "O\u2019Brien", "O'Brien", "O'\u2019Brien", "Smith-Jones", "van der Berg", "van  der  Berg", "Smith, Jones", "M\u00fcller", "\u010capek", "Mu\u0308ller", "a\u02ffb", "a\u0300b", "a\u036fb", "a\u0370b", "WHO", "Smith2", "a1b2c", "\u0936\u0930\u094d\u092e\u093e", ""];
const KEYS: Array<[string, string]> = [["Smith", "2020"], ["Smith", "2020A"], ["O\u2019Brien", "n.d."], ["M\u00fcller", ""], ["", "2020"], ["van der Berg", "2017a"]];

export const crosscheck: Engine = {
  name: "crosscheck",
  async capture(v1, opts) {
    const { check } = opts;
    const corpus = JSON.parse(readFileSync(new URL("./documents.json", import.meta.url), "utf8")) as Doc[];
    const styles = Array.from(v1.document.querySelectorAll<HTMLOptionElement>("#citStyle option"), (o) => o.value);
    const ids = new Set<string>();
    for (const d of corpus) {
      if (ids.has(d.id)) throw new Error(`crosscheck: documents.json has the id ${d.id} twice`);
      ids.add(d.id);
      if ((d.plain === undefined) === (d.html === undefined)) throw new Error(`crosscheck: ${d.id} must have exactly one of plain and html`);
      if (!styles.includes(d.style)) throw new Error(`crosscheck: ${d.id}: the style ${d.style} is not an option of #citStyle (${styles.join(", ")})`);
    }

    const same = (a: unknown, b: unknown) => JSON.stringify(encodeSpecial(a)) === JSON.stringify(encodeSpecial(b));
    const select = v1.document.getElementById("citStyle") as HTMLSelectElement | null;
    if (!select) throw new Error("crosscheck: v1 has no #citStyle");

    const cases = corpus.map((d) => {
      const plain = d.html !== undefined ? docInnerText(d.html).replace(/\u00a0/g, " ") : (d.plain as string);
      v1.setValue("citStyle", d.style);
      if (select.value !== d.style) throw new Error(`crosscheck: #citStyle did not take ${d.style} for ${d.id}`);

      // ccAnalyse's library branch: citFmt(d) with the page's style. The same call with the number given as 0 and as undefined must be the same object, entry by entry.
      const refs = d.lib.map((entry, i) => {
        const bare = v1.call<{ ref: string }>("citFmt", structuredClone(entry));
        const zero = v1.call("citFmt", structuredClone(entry), 0, d.style);
        const absent = v1.call("citFmt", structuredClone(entry), undefined, d.style);
        if (!same(bare, zero) || !same(bare, absent)) throw new Error(`crosscheck: ${d.id}: lib[${i}]: citFmt(d), citFmt(d, 0, style) and citFmt(d, undefined, style) are not the same`);
        return bare.ref;
      });

      const out = v1.call<{ body: string; heading: string }>("ccAnalyse", plain, structuredClone(d.lib));
      const split = v1.call<{ body: string; refs: string[] | null; heading: string }>("ccSplit", plain);
      if (out.body !== split.body || out.heading !== split.heading) throw new Error(`crosscheck: ${d.id}: ccAnalyse and ccSplit disagree about the body or the heading`);
      const cites = v1.call("ccCites", split.body);
      const parsed = split.refs === null ? null : split.refs.map((line) => ({ line, out: v1.call("ccParseRef", line) }));
      return { id: d.id, ...(d.html !== undefined ? { html: d.html } : {}), plain, lib: d.lib, style: d.style, refs, out, split, cites, parsed };
    });

    // A call records what it was given: arguments go through JSON before the call, as citation/capture.ts does.
    const rec = (fn: string, ...args: unknown[]) => {
      const copy = JSON.parse(JSON.stringify(args)) as unknown[];
      return { fn, args: copy, out: v1.call(fn, ...copy) };
    };
    const lev = LEV.map(([a, b]) => ({ a, b, out: v1.call<number>("ccLev", a, b) }));
    const helpers = [
      ...NORMS.map((s) => rec("ccNorm", s)),
      ...KEYS.map(([sn, yr]) => rec("ccKey", sn, yr)),
      ...YEARS.flatMap((a) => YEARS.map((b) => rec("ccYrMatch", a, b))),
    ];
    const patterns = { CC_SN: v1.eval<string>("CC_SN"), CC_YR: v1.eval<string>("CC_YR") };
    // CC_STOP is a Set in v1 (a const, reached through eval): the table is its members in insertion order.
    const CC_STOP = [...v1.eval<Set<string>>("CC_STOP")];

    return [
      emitTables(v1, "crosscheck", "crosscheck-tables", { CC_STOP }, opts),
      writeFixture("crosscheck", "cases", { patterns, cases, lev, helpers }, v1, check),
    ];
  },
};
