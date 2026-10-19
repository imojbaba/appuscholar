import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 15's scale library (v1 index.html: SCALES and SL_PENDING 11394-11419, slById 11420, slVarNames and slText 11426-11432, slCodebook 11450-11455, slScore and slBand 11456-11469,
 * slScoreOpen 11470-11486, slScoreRun 11487-11512). Every expected value is what v1 returned, downloaded or wrote on its page.
 *
 * - `varNames`, `text` (slText with no second argument, true and false), `codebook` (slCodebook with `pdDownload` replaced by a recorder of its name and text): per scale, direct calls.
 * - `score`: slScore per scale and coding on 8 matrices (clean, a missing cell, an out-of-range cell, a non-integer, NaN, a mixed multi-row matrix, the extremes, an empty matrix).
 * - `band`: slBand on every SWLS boundary (9, 10, 14, 15, 19, 20, 24, 25, 29, 30, 35, 36), 4, 9.5, 0, -1 and null, and RSES on 20, 0 and null (RSES has no bands: '').
 * - `runs`: page-bound slScoreRun. Each case's CSV goes into #statsPaste and statsParse() (with `_rtSkip`), slScoreOpen(id) renders #slScoreMap; the guesses are read off the selects
 *   (`guess`, the column index each select had selected, -1 when none), then the case's own columns (`set`, by header name, or -1 to leave "Choose a column") are selected where the
 *   case gives them, #slCoding is set, and slScoreRun() is called with `stkAlpha` wrapped to record its result. Recorded: `data` (window._statsData's headers and rows at slScoreOpen),
 *   `idx` (the selects' values as slScoreRun reads them), `coding` (the select's index), #slScoreOut's innerHTML and textContent, #statsPaste's value after the run, `alpha` (what stkAlpha
 *   returned, null when slScoreRun did not call it) and `mean`/`sd`, computed in the page by slScoreRun's own line 11507, cut out of v1's source, over the valid totals (slScore on the
 *   matrix of 11494, also cut out of the source: neither is a value slScoreRun leaves anywhere).
 * - `tables.json` (and, under --emit, src/data/scale-tables.ts): SCALES and SL_PENDING read through eval.
 */

export type ScaleCoding = { label: string; min: number; max: number; dir: string };
export type ScoreCase = { id: string; scale: string; coding: number; mat: Array<Array<number | null>>; out: { totals: Array<number | null>; bad: number; miss: number } };
export type BandCase = { scale: string; t: number | null; band: string };
export type RunCase = {
  id: string; scale: string; csv: string; data: { headers: string[]; rows: string[][] }; guess: number[]; idx: number[]; coding: number;
  html: string; text: string; paste: string; alpha: number | null; mean: number | null; sd: number | null; toasts: string[];
};
export type ScalesFx = {
  varNames: Record<string, string[]>; text: Record<string, { plain: string; credit: string; none: string }>; codebook: Record<string, { name: string; text: string }>;
  score: ScoreCase[]; band: BandCase[]; runs: RunCase[];
};

const csvOf = (headers: string[], rows: Array<Array<string | number>>) => [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

/** 12 rows of answers to k items, row r item j given by f(r, j). */
const answers = (k: number, f: (r: number, j: number) => string | number) => Array.from({ length: 12 }, (_, r) => Array.from({ length: k }, (_, j) => f(r, j)));
const seq = (k: number, name: (i: number) => string) => Array.from({ length: k }, (_, i) => name(i + 1));
const pad2 = (i: number) => String(i).padStart(2, "0");

/** RSES raw answers on 0..3 that hang together once items 2, 5, 6, 8 and 9 are reversed. */
const rsesClean = (r: number, j: number) => { const t = r % 4; const rev = [1, 4, 5, 7, 8].includes(j); const v = (t + (j % 3 === 0 && r % 5 === 0 ? 1 : 0)) % 4; return rev ? 3 - v : v; };
const swlsClean = (r: number, j: number) => 1 + ((r + (j === 4 ? 1 : 0) + (r % 3 === 0 && j === 2 ? 2 : 0)) % 7);

type RunSpec = { id: string; scale: string; headers: string[]; rows: Array<Array<string | number>>; set?: Record<number, string | -1>; coding?: number };

function runSpecs(): RunSpec[] {
  const rsesNames = seq(10, (i) => "RSES_" + pad2(i));
  const swlsNames = seq(5, (i) => "SWLS_" + pad2(i));
  const ids = (rows: Array<Array<string | number>>) => rows.map((r, i) => ["P" + (i + 1), ...r]);
  const age = (rows: Array<Array<string | number>>) => rows.map((r, i) => [...r, 18 + i]);
  const specs: RunSpec[] = [];
  // RSES guessed by name (RSES_01...), coding 0 (0..3), every row valid
  specs.push({ id: "rses-by-name-clean", scale: "RSES", headers: ["id", ...rsesNames, "age"], rows: age(ids(answers(10, rsesClean))) });
  // RSES guessed by prefix (rses1...), coding 1 (1..4), some rows left blank: a missing cell, an out-of-range 5, a non-integer, a word, padded and "4.0" answers kept
  specs.push({
    id: "rses-by-prefix-coding1-blanks", scale: "RSES", coding: 1, headers: ["id", ...seq(10, (i) => "rses" + i)],
    rows: ids(answers(10, (r, j) => {
      const v = rsesClean(r, j) + 1;
      if (r === 1 && j === 3) return "";
      if (r === 4 && j === 0) return 5;
      if (r === 6 && j === 9) return 2.5;
      if (r === 8 && j === 5) return "often";
      if (r === 10 && j === 2) return " " + v + " ";
      if (r === 11 && j === 7) return v + ".0";
      return v;
    })),
  });
  // RSES under unrelated names (no guess), selected by hand, with RSES_total and RSES_total_2 taken: the total becomes RSES_total_3
  specs.push({
    id: "rses-unrelated-name-taken", scale: "RSES", headers: [...seq(10, (i) => "q" + i), "RSES_total", "RSES_total_2"],
    rows: answers(10, rsesClean).map((r, i) => [...r, "x" + i, ""]), set: Object.fromEntries(seq(10, (i) => "q" + i).map((n, j) => [j, n])),
  });
  // RSES under unrelated names, the columns in a shuffled order, matched by hand
  specs.push({
    id: "rses-unrelated-shuffled", scale: "RSES", headers: seq(10, (i) => "item" + String.fromCharCode(96 + i)),
    rows: answers(10, (r, j) => rsesClean(r, (j + 3) % 10)), set: Object.fromEntries(Array.from({ length: 10 }, (_, j) => [j, "item" + String.fromCharCode(96 + ((j + 7) % 10) + 1)])),
  });
  // SWLS guessed by name (SWLS_01...), with SWLS_band taken: the band becomes SWLS_band_2; bands on every total
  specs.push({ id: "swls-by-name-band-taken", scale: "SWLS", headers: [...swlsNames, "SWLS_band"], rows: answers(5, swlsClean).map((r) => [...r, "old"]) });
  // SWLS guessed by prefix (SWLS_1...: "swls1" is not "swls01", the prefix rule takes it), blanks
  specs.push({
    id: "swls-by-prefix-blanks", scale: "SWLS", headers: ["id", ...seq(5, (i) => "SWLS_" + i)],
    rows: ids(answers(5, (r, j) => (r === 2 && j === 1 ? 0 : r === 7 && j === 4 ? "" : r === 9 && j === 0 ? 8 : swlsClean(r, j)))),
  });
  // SWLS by hand, items answered against each other: a negative alpha prints as -.xx
  specs.push({
    id: "swls-negative-alpha", scale: "SWLS", headers: seq(5, (i) => "life" + String.fromCharCode(64 + i)),
    rows: answers(5, (r, j) => (j % 2 === 0 ? 1 + (r % 7) : 7 - (r % 7))), set: Object.fromEntries(seq(5, (i) => "life" + String.fromCharCode(64 + i)).map((n, j) => [j, n])),
  });
  // SWLS, answers that barely hang together (a fixed draw): a negative alpha above -1 prints as -.25 (the `^(-?)0\.` rule)
  specs.push({
    id: "swls-small-negative-alpha", scale: "SWLS", headers: swlsNames,
    rows: [[1,5,3,7,4],[5,7,3,1,6],[5,1,4,6,6],[5,5,3,4,7],[2,7,7,7,5],[5,1,2,6,2],[7,5,6,7,5],[7,5,5,5,3],[7,4,5,3,7],[7,2,2,3,4],[1,4,5,7,7],[6,7,2,5,5]],
  });
  // SWLS, every answer the same: alpha is 0/0 (NaN) and is left out of the sentence; SD 0
  specs.push({ id: "swls-constant-alpha-nan", scale: "SWLS", headers: swlsNames, rows: answers(5, () => 4) });
  // SWLS, only two rows score: the alpha guard (A.length>=3) skips stkAlpha
  specs.push({ id: "swls-two-valid-rows", scale: "SWLS", headers: swlsNames, rows: answers(5, (r, j) => (r < 2 ? swlsClean(r, j) : j === 3 ? "" : swlsClean(r, j))) });
  // SWLS, exactly three rows score: the guard admits stkAlpha
  specs.push({ id: "swls-three-valid-rows", scale: "SWLS", headers: swlsNames, rows: answers(5, (r, j) => (r < 3 ? swlsClean(r, j) : j === 0 ? 9 : swlsClean(r, j))) });
  // SWLS, a high alpha (items equal): 1.00 keeps its leading digit
  specs.push({ id: "swls-alpha-one", scale: "SWLS", headers: swlsNames, rows: answers(5, (r) => 1 + (r % 7)) });
  // the two refusals
  specs.push({ id: "refuse-choose-column", scale: "RSES", headers: ["id", ...rsesNames], rows: ids(answers(10, rsesClean)), set: { 4: -1 } });
  specs.push({ id: "refuse-same-column", scale: "SWLS", headers: swlsNames, rows: answers(5, swlsClean), set: { 3: "SWLS_01" } });
  // no row scores: answers outside the coding and missing ones, each alone and both
  specs.push({ id: "no-row-bad-and-missing", scale: "SWLS", headers: swlsNames, rows: answers(5, (r, j) => (j === 0 ? (r % 2 ? 0 : "") : swlsClean(r, j))) });
  specs.push({ id: "no-row-bad-only", scale: "RSES", coding: 1, headers: rsesNames, rows: answers(10, (r, j) => (j === 2 ? 0 : rsesClean(r, j) + 1)) });
  specs.push({ id: "no-row-missing-only", scale: "SWLS", headers: swlsNames, rows: answers(5, (r, j) => (j === 4 ? "na" : swlsClean(r, j))) });
  // a header with a comma and a quote, kept by pdCsv's quoting
  specs.push({ id: "swls-quoted-header", scale: "SWLS", headers: ['"name, first"', ...swlsNames], rows: ids(answers(5, swlsClean)).map((r) => ['"Rao, ""A"""', ...r.slice(1)]) });
  return specs;
}

export const scales: Engine = {
  name: "scales",
  async capture(v1, opts) {
    const w = v1.window as unknown as Record<string, unknown> & V1["window"];
    const d = v1.document;
    const take = () => v1.toasts.splice(0, v1.toasts.length);
    const plain = <T>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;
    const ids = v1.eval<string[]>("SCALES.map(x=>x.id)").slice();
    const scale = (id: string) => v1.call<unknown>("slById", id);
    const codings = (id: string) => plain<ScaleCoding[]>((scale(id) as { codings: unknown }).codings);

    // direct calls
    const varNames: ScalesFx["varNames"] = {}, text: ScalesFx["text"] = {}, codebook: ScalesFx["codebook"] = {};
    const downloads: Array<{ name: string; text: string }> = [];
    w.pdDownload = (name: unknown, t: unknown) => { downloads.push({ name: String(name), text: String(t) }); };
    for (const id of ids) {
      const x = scale(id);
      varNames[id] = plain<string[]>(v1.call("slVarNames", x));
      text[id] = { plain: v1.call<string>("slText", x), credit: v1.call<string>("slText", x, true), none: v1.call<string>("slText", x, false) };
      downloads.length = 0;
      v1.call("slCodebook", id);
      if (downloads.length !== 1) throw new Error(`scales codebook ${id}: ${downloads.length} downloads`);
      codebook[id] = downloads[0]!;
    }

    const score: ScoreCase[] = [];
    for (const id of ids) {
      const x = scale(id) as { items: unknown[] };
      const k = x.items.length;
      codings(id).forEach((c, ci) => {
        const mid = Math.round((c.min + c.max) / 2);
        const row = (f: (j: number) => number | null) => Array.from({ length: k }, (_, j) => f(j));
        const mats: Array<[string, Array<Array<number | null>>]> = [
          ["clean", [row((j) => c.min + (j % (c.max - c.min + 1))), row(() => mid)]],
          ["missing", [row((j) => (j === 1 ? null : mid))]],
          ["out-of-range", [row((j) => (j === 0 ? c.max + 1 : mid)), row((j) => (j === k - 1 ? c.min - 1 : mid))]],
          ["non-integer", [row((j) => (j === 2 ? mid + 0.5 : mid))]],
          ["nan", [row((j) => (j === 3 ? NaN : mid))]],
          ["mixed", [row(() => c.min), row(() => c.max), row((j) => (j === 0 ? null : j === 1 ? c.max + 1 : mid)), row((j) => (j < 2 ? 1.5 : mid)), row((j) => (j % 2 ? null : c.max))]],
          ["extremes", [row((j) => (j % 2 ? c.min : c.max))]],
          ["empty", []],
        ];
        for (const [name, mat] of mats) {
          const out = plain<ScoreCase["out"]>(v1.call("slScore", x, mat, c));
          // JSON drops NaN to null in `plain`; the matrix is recorded as given (encodeSpecial keeps NaN)
          score.push({ id: `${id}-c${ci}-${name}`, scale: id, coding: ci, mat, out });
        }
      });
    }

    const band: BandCase[] = [];
    for (const t of [9, 10, 14, 15, 19, 20, 24, 25, 29, 30, 35, 36, 4, 9.5, 0, -1, null]) band.push({ scale: "SWLS", t, band: v1.call<string>("slBand", scale("SWLS"), t) });
    for (const t of [20, 0, null]) band.push({ scale: "RSES", t, band: v1.call<string>("slBand", scale("RSES"), t) });

    // page-bound runs
    const src = v1.text.split("\n");
    const line = (n: number, starts: string) => {
      const l = src[n - 1]!.trim();
      if (!l.startsWith(starts)) throw new Error(`scales: v1 line ${n} is not ${starts}…: ${l.slice(0, 80)}`);
      return l;
    };
    const matLine = line(11494, "const mat=data.rows.map(");
    const meanLine = line(11507, "const mean=");
    const stats = new w.Function("x", "data", "idx", "coding", `${matLine}const r=slScore(x,mat,coding),valid=r.totals.filter(v=>v!=null);if(!valid.length)return null;${meanLine}return[mean,sd];`) as
      (x: unknown, data: unknown, idx: number[], coding: unknown) => [number, number] | null;
    const realAlpha = w.stkAlpha as (A: number[][]) => { alpha: number };
    let alphaCalls: Array<{ alpha: number }> = [];
    w.stkAlpha = (A: number[][]) => { const r = realAlpha(A); alphaCalls.push(r); return r; };
    const ls = v1.window.localStorage;
    const runs: RunCase[] = [];
    for (const s of runSpecs()) {
      ls.clear();
      const csv = csvOf(s.headers, s.rows);
      v1.setValue("statsPaste", csv);
      w._statsData = undefined;
      w._rtSkip = true;
      try {
        take();
        v1.call("statsParse");
        const data = w._statsData as { headers: string[]; rows: string[][] } | undefined;
        if (!data) throw new Error(`scales ${s.id}: statsParse parsed nothing`);
        const snap = plain<{ headers: string[]; rows: string[][] }>({ headers: data.headers, rows: data.rows });
        if (snap.rows.length !== 12) throw new Error(`scales ${s.id}: ${snap.rows.length} rows, not 12`);
        v1.call("slScoreOpen", s.scale);
        const x = scale(s.scale) as { items: unknown[] };
        const sel = (i: number) => d.getElementById("slm_" + i) as HTMLSelectElement;
        const guess = x.items.map((_, i) => parseInt(sel(i).value, 10)); // before any case column is set: the option slScoreOpen marked `selected`, else the first ("-1")
        for (const [i, name] of Object.entries(s.set ?? {})) {
          const k = name === -1 ? -1 : snap.headers.indexOf(name);
          if (name !== -1 && k < 0) throw new Error(`scales ${s.id}: no column ${name}`);
          sel(Number(i)).value = String(k);
          if (sel(Number(i)).value !== String(k)) throw new Error(`scales ${s.id}: slm_${i} did not take ${k}`);
        }
        const coding = s.coding ?? 0;
        v1.setValue("slCoding", String(coding));
        if ((d.getElementById("slCoding") as HTMLSelectElement).value !== String(coding)) throw new Error(`scales ${s.id}: #slCoding has no option ${coding}`);
        const idx = x.items.map((_, i) => parseInt(sel(i).value, 10));
        alphaCalls = [];
        take();
        v1.call("slScoreRun");
        if (alphaCalls.length > 1) throw new Error(`scales ${s.id}: stkAlpha called ${alphaCalls.length} times`);
        const out = d.getElementById("slScoreOut")!;
        const paste = (d.getElementById("statsPaste") as HTMLTextAreaElement).value;
        const st = paste !== csv ? stats(x, data, idx, codings(s.scale)[coding]) : null; // only a run that scored has a mean
        runs.push({
          id: s.id, scale: s.scale, csv, data: snap, guess, idx, coding, html: out.innerHTML, text: out.textContent ?? "", paste,
          alpha: alphaCalls[0] ? alphaCalls[0].alpha : null, mean: st ? st[0] : null, sd: st ? st[1] : null, toasts: take(),
        });
      } finally {
        w._rtSkip = false;
      }
    }
    ls.clear();

    const tables = { SCALES: plain<unknown>(v1.eval("SCALES")), SL_PENDING: v1.eval<string>("SL_PENDING") };
    console.log(`scales: ${ids.join(", ")}; score ${score.length}, band ${band.length}, runs ${runs.length} (${runs.filter((r) => r.paste !== r.csv).length} scored)`);
    return [
      emitTables(v1, "scales", "scale-tables", tables, opts),
      writeFixture("scales", "cases", { varNames, text, codebook, score, band, runs }, v1, opts.check),
    ];
  },
};
