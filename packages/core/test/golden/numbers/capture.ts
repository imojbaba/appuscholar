import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { encodeSpecial, writeFixture } from "../harness/fixture";

/**
 * Task 7's Numbers check (v1 12195-12257) on the hand-written corpus in sentences.json: `{ id, text }` for a sentence, `{ id, html }` for a document body.
 * The corpus is the one input a person writes; every output below is v1's own.
 *
 * - `find` is v1's `ncFind(text)` and `judged` is `ncJudge` over each of its items (the judged objects carry `pcalc` NaN in the form and df branches, which the fixture stores as `{"$n":"NaN"}`).
 *   A sentence is passed to ncFind as it stands. A body goes through the editor, as ncOpen 12353 reads it: `setEditorHtml(html)`, then `editor.textContent` (recorded as `textContent`).
 * - `summary` is what ncOpen shows. The same text is put in the editor and ncOpen runs (the dialog's showModal is stubbed, so it opens); the counts are read back from the rendered line in #ncSum,
 *   whose template is `t('nc_sum')` ({n}, {ok}, {w}, {e} filled in at 12357). When nothing is found, ncOpen shows `t('nc_none')` instead, which holds no counts: that line is then checked to be
 *   `nc_none` with an empty `window._ncItems`, and the record is zeros. `shown` keeps the rendered line as the evidence. ncOpen's own item list is also checked here to be
 *   `ncFind(text)` with `ncJudge(f)` attached as `j`, which is what numbers.ts's numbersCheck returns.
 * - `pof` is `ncPOf` called directly, as `{ f, x, out }`. ncJudge hands it statistics that are never negative (`a`, `b` and `ax` are 0 or more), so the grid adds the signs it never sees and, for r, the points
 *   either side of the 0.9999999 clip (12224). A kind it does not know gives `undefined` in v1 (the switch has no default): that record has no `out`, since the fixture drops undefined.
 * - `fmt` is `ncFmtP` over the p values below: the brief's {NaN, Infinity, 0, 0.0004, 0.001, 0.05, 0.5, 1}, with the other side of each cut: -Infinity (not finite, like NaN), 0.0005 (< .001),
 *   0.0015 and 0.9996 (toFixed(3) rounds up) and a negative p (< .001, so it prints "< .001").
 */
const FMT_P = [NaN, Infinity, -Infinity, 0, 0.0004, 0.0005, 0.001, 0.0015, 0.05, 0.5, 0.9996, 1, -0.2];

const XS = [-2.5, 0, 0.3, 1, 2.5, 20];
const POF: Array<{ f: { kind: string; df1: number | null; df2: number | null }; xs: number[] }> = [
  { f: { kind: "t", df1: 21, df2: null }, xs: XS },
  { f: { kind: "F", df1: 3, df2: 50 }, xs: XS },
  { f: { kind: "chi", df1: 3, df2: null }, xs: XS },
  { f: { kind: "H", df1: 2, df2: null }, xs: XS },
  { f: { kind: "r", df1: 58, df2: null }, xs: [...XS, -1.5, 0.9999999, 1.5] },
  { f: { kind: "z", df1: null, df2: null }, xs: XS },
  { f: { kind: "x", df1: 1, df2: null }, xs: [1] },
];

type Entry = { id: string; text?: string; html?: string };
type Counts = { n: number; ok: number; warn: number; err: number };

/** The counts on the rendered `nc_sum` line: the template's placeholders are turned into digit groups, so no English is typed here. Null when the line is not that template. */
function countsOn(shown: string, template: string): Counts | null {
  const order = [...template.matchAll(/\{(n|ok|w|e)\}/g)].map((m) => m[1]);
  const pattern = template.split(/\{(?:n|ok|w|e)\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(\\d+)");
  const m = new RegExp(`^${pattern}$`).exec(shown);
  if (!m) return null;
  const at = (name: string) => Number(m[order.indexOf(name) + 1]);
  const counts = { n: at("n"), ok: at("ok"), warn: at("w"), err: at("e") };
  if (order.length !== 4 || !Object.values(counts).every(Number.isInteger)) throw new Error(`numbers: could not read four counts from "${shown}" with the template "${template}"`);
  return counts;
}

export const numbers: Engine = {
  name: "numbers",
  async capture(v1, { check }) {
    const corpus = JSON.parse(readFileSync(new URL("./sentences.json", import.meta.url), "utf8")) as Entry[];
    const ids = new Set<string>();
    for (const e of corpus) {
      if (ids.has(e.id)) throw new Error(`numbers: sentences.json has the id ${e.id} twice`);
      ids.add(e.id);
      if ((e.text === undefined) === (e.html === undefined)) throw new Error(`numbers: ${e.id} must have exactly one of text and html`);
    }

    const template = v1.call<string>("t", "nc_sum");
    const nothingFound = v1.call<string>("t", "nc_none");
    const sumLine = v1.document.getElementById("ncSum");
    if (!sumLine) throw new Error("numbers: v1 has no #ncSum");

    const cases = [];
    const summary = [];
    for (const { id, text: sentence, html } of corpus) {
      let text: string;
      if (html !== undefined) {
        v1.setEditorHtml(html);
        text = v1.editor().textContent ?? "";
      } else {
        text = sentence as string;
        v1.editor().textContent = text;
        if (v1.editor().textContent !== text) throw new Error(`numbers: the editor did not keep the text of ${id}`);
      }

      const find = v1.call<unknown[]>("ncFind", text);
      const judged = find.map((f) => v1.call<unknown>("ncJudge", f));
      cases.push(html !== undefined ? { id, html, textContent: text, find, judged } : { id, text, find, judged });

      v1.call("ncOpen");
      const items = (v1.window as unknown as { _ncItems: unknown[] })._ncItems;
      const viaOpen = JSON.stringify(encodeSpecial(items));
      const viaParts = JSON.stringify(encodeSpecial(find.map((f, i) => ({ ...(f as object), j: judged[i] }))));
      if (viaOpen !== viaParts) throw new Error(`numbers: ncOpen's items for ${id} are not ncFind + ncJudge`);
      const shown = sumLine.textContent ?? "";
      const counts = countsOn(shown, template);
      if (counts) {
        if (counts.n !== items.length) throw new Error(`numbers: ${id}: the line says ${counts.n} found, ncOpen holds ${items.length}`);
        summary.push({ id, shown, ...counts });
      } else if (shown === nothingFound && items.length === 0) summary.push({ id, shown, n: 0, ok: 0, warn: 0, err: 0 });
      else throw new Error(`numbers: ${id}: #ncSum reads "${shown}", neither the nc_sum line nor nc_none`);
    }

    const pof = POF.flatMap(({ f, xs }) =>
      xs.map((x) => {
        const out = v1.call<number | undefined>("ncPOf", f, x);
        if (out !== undefined && typeof out !== "number") throw new Error(`numbers: v1 ncPOf(${f.kind}, ${x}) returned ${typeof out}`);
        return { f, x, out };
      }),
    );
    const fmt = FMT_P.map((p) => ({ p, out: v1.call<string>("ncFmtP", p) }));
    return [writeFixture("numbers", "cases", { cases, pof, fmt, summary }, v1, check)];
  },
};
