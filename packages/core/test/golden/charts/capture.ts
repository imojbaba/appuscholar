import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";
import type { StatsBlock } from "../../../src/stats-core";
import { readBlocks } from "../stats/drive";

/**
 * Task 12's Chart Studio (v1 index.html: VZ_COL, VZ_GRAY and the helpers 3642-3667, vzGroups 3668-3675, vzSync 3698-3706, vzDefaults 3708-3721, vzDraw 3722-3737, vzCaption 3738-3742, the
 * frame, axes and table 3743-3782, vzBox, vzBar, vzHist, vzQQ 3783-3878), page-bound: every expected value is what v1's dialog drew; the only hand-written inputs are the CSVs and the field
 * values of CASES and the arguments of the direct calls.
 *
 * - `cases`: for each case, `localStorage.appu_lang` is set to 'hi' for a Hindi case (v1's t() reads it through getLang, 2438) and removed after; the CSV goes into #vzPaste and vzLoad()
 *   runs (VZ.data must then be non-null); #vzType, #vzY, #vzG (column indexes found by column name; '' for no grouping), #vzPal, #vzErr, #vzBins, #vzPts, #vzN, #vzTitleIn, #vzFig, #vzYMin
 *   and #vzYMax are set. A `defaults` case clears `dataset.touched` on #vzTitle, #vzNote, #vzXL and #vzYL and calls vzSync() (which writes the axis labels, then draws, and vzDraw's
 *   vzDefaults writes the title and the note); a case with `labels` sets those four with `dataset.touched='1'` and calls vzDraw(). Recorded: `VZ.svg` (v1's string, read through eval),
 *   the string vzDraw assigned to #vzTable.innerHTML (an own innerHTML setter on #vzTable keeps it, as power/capture.ts does for #plOut) and #vzTable read back as blocks by
 *   stats/drive.ts's readBlocks, #vzWarn's text when vzDraw showed it, `VZ.caption`, the four fields as they stood after the draw (`fields`: what vzSync and vzDefaults wrote in a defaults case, what the case typed otherwise; `typed` tells which), and
 *   `selects`, the texts vzSync and vzDefaults read from #vzY and #vzG (`gName` is '' when the '' option, v1's t('vz_none'), is picked; `gLabel` is that option's text either way).
 *   `options` is what vzBox/vzBar/vzHist/vzQQ read from the dialog, as the port's VzOptions: #vzPal's 'colour' is recorded as "color" (v1 tests only `==='gray'`), `title` is #vzTitle's
 *   value when #vzTitleIn is ticked and '' otherwise. A number input (#vzBins, #vzYMin, #vzYMax, #vzFig) cannot hold text: jsdom, like the browser, sanitises 'abc' to '', and the case
 *   records what the field held (`given` keeps what was typed).
 * - `direct`: vzNice, vzFmt, vzQuant, vzSummary, vzJit, vzTCrit, vzQNorm and vzEsc called on v1's window.
 * - `tables.json` (and, under --emit, src/data/chart-tables.ts): VZ_COL, VZ_GRAY, and VZ_I18N, the `vz_*` keys of I18N.en and I18N.hi (2101, 2330) read through eval.
 */

export type VzOptionsRec = { type: string; palette: string; title: string; showPts: boolean; showN: boolean; err: string; bins: string; yMin: string; yMax: string; yLabel: string; xLabel: string };
export type VzFieldsRec = { title: string; note: string; xl: string; yl: string };
export type VzSelectsRec = { yName: string; gName: string; gLabel: string };
export type ChartCase = {
  id: string; csv: string; lang: "en" | "hi"; yIdx: number | null; gIdx: number | null; options: VzOptionsRec; fig: string; given: Record<string, string>;
  svg: string; tableHtml: string | null; table: StatsBlock[]; warn: string | null; caption: { n: number; title: string; note: string } | null;
  typed: boolean; fields: VzFieldsRec; selects: VzSelectsRec; nodata: string | null; threw: string | null;
};
export type DirectCall = { args: unknown[]; out: unknown };
export type ChartDirect = Record<"nice" | "fmt" | "quant" | "summary" | "jit" | "tcrit" | "qnorm" | "esc", DirectCall[]>;

type Labels = { title: string; note: string; xl: string; yl: string };
type Spec = {
  id: string; csv: string; y: string | null; g: string | null; type: "box" | "bar" | "hist" | "qq"; pal?: "colour" | "gray"; err?: string; bins?: string; pts?: boolean; showN?: boolean;
  titleIn?: boolean; fig?: string; yMin?: string; yMax?: string; labels?: Labels; lang?: "hi"; wantThrow?: boolean; wantNodata?: boolean;
};

const QQ60 = "score\n" + Array.from({ length: 60 }, (_, i) => (50 + 12 * Math.sin(i * 1.7) + (i % 7) * 1.3 - (i % 5 === 0 ? 8 : 0)).toFixed(1)).join("\n");
const ONEVAL = "group,score\nA,12\nA,15\nA,11\nB,9\nC,14\nC,18";
const HINDI = "समूह,अंक\nनियंत्रण,12\nनियंत्रण,14\nनियंत्रण,11\nप्रयोग,18\nप्रयोग,21\nप्रयोग,17";
const SPECIAL = 'group,score\n"Low & ""mid"" <1>",3\n"Low & ""mid"" <1>",5\nA very long group name that is cut,7\nA very long group name that is cut,9\nB\'s,4';
const OUTLIERS = "group,score\nA,1\nA,2\nA,2\nA,3\nA,3\nA,4\nA,30\nB,10\nB,11\nB,12\nB,12\nB,13\nB,-9";
const NEG = "group,change\nA,-3\nA,-5\nA,-1\nB,2\nB,4\nB,3\nC,-0.5\nC,0.5";
const MANY = "group,score\n" + Array.from({ length: 9 }, (_, i) => [0, 1, 2].map((j) => `G${i + 1},${10 + i * 2 + j * (i % 3 + 1)}`).join("\n")).join("\n");
const CONST = "group,score\nA,5\nA,5\nA,5";
const DECIMALS = "group,rt\nA,0.0121\nA,0.0134\nA,0.0127\nA,0.0119\nB,0.0152\nB,0.0161\nB,0.0148\nB,0.0157";
const NODATA = "group,score\nA,\nB,";
const CTOR = "group,score\nA,1\nconstructor,2";

function specs(anova1: string): Spec[] {
  const out: Spec[] = [];
  const types = ["box", "bar", "hist", "qq"] as const;
  // A. every type in both palettes on the anova1 demo, grouped by arm, at the dialog's defaults
  for (const type of types) for (const pal of ["colour", "gray"] as const) out.push({ id: `anova1-${type}-${pal}`, csv: anova1, y: "score", g: "arm", type, pal });
  // B. points and n under each group off and on, for box and bar
  for (const type of ["box", "bar"] as const) for (const [pts, showN] of [[false, true], [true, false], [false, false]] as const)
    out.push({ id: `anova1-${type}-pts-${pts ? "on" : "off"}-n-${showN ? "on" : "off"}`, csv: anova1, y: "score", g: "arm", type, pts, showN });
  // C. every error bar of the bar chart (ci is in A)
  for (const err of ["none", "sd", "se"]) out.push({ id: `anova1-bar-err-${err}`, csv: anova1, y: "score", g: "arm", type: "bar", err });
  out.push({ id: "anova1-bar-gray-err-se-no-pts", csv: anova1, y: "score", g: "arm", type: "bar", pal: "gray", err: "se", pts: false });
  // D. histogram bins
  for (const bins of ["3", "12", "abc", "2", "40"]) out.push({ id: `anova1-hist-bins-${bins}`, csv: anova1, y: "score", g: "arm", type: "hist", bins });
  // E, F. axis limits: the bar warning, and the limits each chart reads or ignores
  out.push({ id: "anova1-bar-ymin-5-warns", csv: anova1, y: "score", g: "arm", type: "bar", yMin: "5" });
  out.push({ id: "anova1-bar-ymin-0", csv: anova1, y: "score", g: "arm", type: "bar", yMin: "0" });
  out.push({ id: "anova1-bar-ymin-neg2", csv: anova1, y: "score", g: "arm", type: "bar", yMin: "-2" });
  out.push({ id: "anova1-bar-ymax-50", csv: anova1, y: "score", g: "arm", type: "bar", yMax: "50" });
  out.push({ id: "anova1-hist-ymax-100", csv: anova1, y: "score", g: "arm", type: "hist", yMax: "100" });
  out.push({ id: "anova1-hist-ymin-5-ignored", csv: anova1, y: "score", g: "arm", type: "hist", yMin: "5" });
  out.push({ id: "anova1-box-ymin-10-ymax-30", csv: anova1, y: "score", g: "arm", type: "box", yMin: "10", yMax: "30" });
  out.push({ id: "anova1-box-ymin-above-ymax", csv: anova1, y: "score", g: "arm", type: "box", yMin: "30", yMax: "10" });
  out.push({ id: "anova1-qq-ymin-0-ignored", csv: anova1, y: "score", g: "arm", type: "qq", yMin: "0", yMax: "5" });
  // G. a one-value group (SD 0), and a single value overall
  out.push({ id: "oneval-box", csv: ONEVAL, y: "score", g: "group", type: "box" });
  out.push({ id: "oneval-bar", csv: ONEVAL, y: "score", g: "group", type: "bar" });
  out.push({ id: "single-value-hist", csv: "score\n7", y: "score", g: null, type: "hist" });
  out.push({ id: "single-value-qq", csv: "score\n7", y: "score", g: null, type: "qq" });
  // H. no grouping column picked: one group, All
  out.push({ id: "anova1-box-no-groups", csv: anova1, y: "score", g: null, type: "box" });
  out.push({ id: "anova1-bar-no-groups", csv: anova1, y: "score", g: null, type: "bar" });
  // I. Hindi column and group names
  out.push({ id: "hindi-names-box", csv: HINDI, y: "अंक", g: "समूह", type: "box" });
  out.push({ id: "hindi-names-bar", csv: HINDI, y: "अंक", g: "समूह", type: "bar" });
  // J. 60 values
  out.push({ id: "qq60-qq", csv: QQ60, y: "score", g: null, type: "qq" });
  out.push({ id: "qq60-hist", csv: QQ60, y: "score", g: null, type: "hist" });
  out.push({ id: "qq60-box", csv: QQ60, y: "score", g: null, type: "box" });
  out.push({ id: "skewed-hist", csv: "score\n1\n1\n2\n2\n3\n4\n6\n9\n15", y: "score", g: null, type: "hist" }); // register row F16: the skew in the key note
  // K. the Hindi interface: the table's key note and header in Hindi
  for (const type of types) out.push({ id: `anova1-${type}-hindi`, csv: anova1, y: "score", g: "arm", type, lang: "hi" });
  out.push({ id: "anova1-box-no-groups-hindi", csv: anova1, y: "score", g: null, type: "box", lang: "hi" });
  out.push({ id: "anova1-bar-err-none-hindi", csv: anova1, y: "score", g: "arm", type: "bar", err: "none", lang: "hi" });
  // L. the title drawn inside the picture
  for (const type of types) out.push({ id: `anova1-${type}-title-in`, csv: anova1, y: "score", g: "arm", type, titleIn: true });
  // M. labels typed by the student, with characters vzEsc escapes, a note with spaces round it, figure 3
  const typed: Labels = { title: '  Scores <by> arm & "group"  ', note: "  Note with 'quotes' & <tags>.  ", xl: "Arm <x> & \"y\"", yl: "Score 'z' > 0" };
  for (const type of types) out.push({ id: `anova1-${type}-typed-labels`, csv: anova1, y: "score", g: "arm", type, titleIn: true, fig: "3", labels: typed });
  out.push({ id: "anova1-box-empty-labels", csv: anova1, y: "score", g: "arm", type: "box", titleIn: true, labels: { title: "", note: "", xl: "", yl: "" } });
  out.push({ id: "anova1-hist-empty-labels", csv: anova1, y: "score", g: "arm", type: "hist", labels: { title: "", note: "", xl: "", yl: "" } });
  // N. figure numbers
  out.push({ id: "anova1-box-fig-empty", csv: anova1, y: "score", g: "arm", type: "box", fig: "" });
  out.push({ id: "anova1-box-fig-7", csv: anova1, y: "score", g: "arm", type: "box", fig: "7" });
  out.push({ id: "anova1-box-fig-0", csv: anova1, y: "score", g: "arm", type: "box", fig: "0" });
  // O. outliers, negative means, more groups than colours, constant data, small decimals, names that need escaping
  out.push({ id: "outliers-box", csv: OUTLIERS, y: "score", g: "group", type: "box" });
  out.push({ id: "outliers-box-no-pts", csv: OUTLIERS, y: "score", g: "group", type: "box", pts: false });
  out.push({ id: "outliers-qq", csv: OUTLIERS, y: "score", g: null, type: "qq" });
  out.push({ id: "negative-bar-ci", csv: NEG, y: "change", g: "group", type: "bar" });
  out.push({ id: "negative-bar-sd-gray", csv: NEG, y: "change", g: "group", type: "bar", err: "sd", pal: "gray" });
  out.push({ id: "negative-box", csv: NEG, y: "change", g: "group", type: "box" });
  out.push({ id: "many-groups-box", csv: MANY, y: "score", g: "group", type: "box" });
  out.push({ id: "many-groups-bar-gray", csv: MANY, y: "score", g: "group", type: "bar", pal: "gray" });
  out.push({ id: "constant-box", csv: CONST, y: "score", g: "group", type: "box" });
  out.push({ id: "constant-bar", csv: CONST, y: "score", g: "group", type: "bar" });
  out.push({ id: "constant-hist", csv: CONST, y: "score", g: "group", type: "hist" });
  out.push({ id: "constant-qq", csv: CONST, y: "score", g: "group", type: "qq" });
  out.push({ id: "decimals-hist", csv: DECIMALS, y: "rt", g: "group", type: "hist" });
  out.push({ id: "decimals-box", csv: DECIMALS, y: "rt", g: "group", type: "box" });
  out.push({ id: "decimals-qq", csv: DECIMALS, y: "rt", g: "group", type: "qq" });
  out.push({ id: "decimals-bar-se", csv: DECIMALS, y: "rt", g: "group", type: "bar", err: "se" });
  out.push({ id: "special-names-box", csv: SPECIAL, y: "score", g: "group", type: "box" });
  out.push({ id: "special-names-bar", csv: SPECIAL, y: "score", g: "group", type: "bar", titleIn: true });
  // P. no numeric column (vzDraw draws the vz_nodata message), and a group named like an Object.prototype member (vzGroups' map lookup throws)
  out.push({ id: "no-numeric-column", csv: NODATA, y: null, g: "group", type: "box", wantNodata: true });
  out.push({ id: "group-named-constructor-throws", csv: CTOR, y: "score", g: "group", type: "box", wantThrow: true });
  return out;
}

function captureCases(v1: V1, anova1: string): ChartCase[] {
  const d = v1.document, w = v1.window;
  const el = <T extends HTMLElement>(id: string): T => {
    const e = d.getElementById(id);
    if (!e) throw new Error(`charts: v1 has no #${id}`);
    return e as T;
  };
  const ids = ["vzPaste", "vzType", "vzY", "vzG", "vzPal", "vzErr", "vzBins", "vzPts", "vzN", "vzTitleIn", "vzFig", "vzTitle", "vzNote", "vzXL", "vzYL", "vzYMin", "vzYMax", "vzWarn", "vzOut", "vzTable"];
  for (const id of ids) el(id);
  const table = el<HTMLElement>("vzTable");
  let desc: PropertyDescriptor | undefined, p: object | null = Object.getPrototypeOf(table) as object;
  while (p && !desc) { desc = Object.getOwnPropertyDescriptor(p, "innerHTML"); p = Object.getPrototypeOf(p) as object | null; }
  if (!desc?.set || !desc.get) throw new Error("charts: no innerHTML accessor");
  let assigned: string | null = null;
  Object.defineProperty(table, "innerHTML", { configurable: true, get() { return desc.get!.call(this) as string; }, set(v: string) { assigned = v; desc.set!.call(this, v); } });
  const cases: ChartCase[] = [];
  try {
    for (const c of specs(anova1)) {
      if (c.lang === "hi") w.localStorage.setItem("appu_lang", "hi");
      try {
        v1.eval("VZ.data=null;VZ.svg='';VZ.caption=null");
        v1.setValue("vzPaste", c.csv);
        let threw: string | null = null;
        const run = (fn: () => void) => { try { fn(); } catch (e) { threw = String((e as Error).message); } };
        run(() => v1.call("vzLoad"));
        if (v1.eval("VZ.data") === null) throw new Error(`charts ${c.id}: vzLoad found no data`);
        const data = v1.eval<{ cols: Array<{ name: string; index: number }> }>("VZ.data");
        const colIdx = (name: string) => {
          const col = data.cols.find((x) => x.name === name);
          if (!col) throw new Error(`charts ${c.id}: no column ${name}`);
          return String(col.index);
        };
        const sel = (id: string, v: string) => { v1.setValue(id, v); if (el<HTMLSelectElement>(id).value !== v) throw new Error(`charts ${c.id}: #${id} has no option ${JSON.stringify(v)}`); };
        sel("vzType", c.type);
        if (c.y !== null) sel("vzY", colIdx(c.y));
        else if (el<HTMLSelectElement>("vzY").value !== "") throw new Error(`charts ${c.id}: #vzY offers a column`);
        sel("vzG", c.g === null ? "" : colIdx(c.g));
        sel("vzPal", c.pal ?? "colour");
        sel("vzErr", c.err ?? "ci");
        const given: Record<string, string> = {};
        const num = (id: string, v: string) => { given[id] = v; v1.setValue(id, v); };
        num("vzBins", c.bins ?? ""); num("vzFig", c.fig ?? "1"); num("vzYMin", c.yMin ?? ""); num("vzYMax", c.yMax ?? "");
        el<HTMLInputElement>("vzPts").checked = c.pts ?? true;
        el<HTMLInputElement>("vzN").checked = c.showN ?? true;
        el<HTMLInputElement>("vzTitleIn").checked = c.titleIn ?? false;
        const four = { title: "vzTitle", note: "vzNote", xl: "vzXL", yl: "vzYL" } as const;
        v1.eval("VZ.svg='';VZ.caption=null");
        table.innerHTML = "";
        assigned = null;
        el("vzWarn").style.display = "none"; el("vzWarn").textContent = "";
        threw = null;
        if (c.labels) {
          for (const [k, id] of Object.entries(four) as Array<[keyof Labels, string]>) { const f = el<HTMLInputElement>(id); f.value = c.labels[k]; f.dataset.touched = "1"; }
          run(() => v1.call("vzDraw"));
        } else {
          for (const id of Object.values(four)) delete el<HTMLInputElement>(id).dataset.touched;
          run(() => v1.call("vzSync"));
        }
        if ((c.wantThrow ?? false) !== (threw !== null)) throw new Error(`charts ${c.id}: ${threw === null ? "expected a throw, v1 drew" : "v1 threw " + threw}`);
        const value = (id: string) => el<HTMLInputElement>(id).value;
        const opt = (id: string) => el<HTMLSelectElement>(id).selectedOptions[0];
        const yv = value("vzY"), gv = value("vzG");
        const svg = v1.eval<string>("VZ.svg");
        const warnEl = el("vzWarn");
        const caption = v1.eval<{ n: number; title: string; note: string } | null>("VZ.caption");
        const out = el("vzOut");
        const nodata = svg === "" && threw === null ? (out.textContent ?? "") : null;
        if ((c.wantNodata ?? false) !== (nodata !== null)) throw new Error(`charts ${c.id}: ${nodata === null ? "drew a chart" : "drew no chart: " + nodata}`);
        if (threw === null && nodata === null && (assigned === null || caption === null)) throw new Error(`charts ${c.id}: vzDraw did not write the table or the caption`);
        cases.push({
          id: c.id, csv: c.csv, lang: c.lang ?? "en",
          yIdx: yv === "" ? null : parseInt(yv, 10), gIdx: gv === "" ? null : parseInt(gv, 10),
          options: {
            type: value("vzType"), palette: value("vzPal") === "gray" ? "gray" : "color", title: el<HTMLInputElement>("vzTitleIn").checked ? value("vzTitle") : "",
            showPts: el<HTMLInputElement>("vzPts").checked, showN: el<HTMLInputElement>("vzN").checked, err: value("vzErr"), bins: value("vzBins"),
            yMin: value("vzYMin"), yMax: value("vzYMax"), yLabel: value("vzYL"), xLabel: value("vzXL"),
          },
          fig: value("vzFig"), given,
          svg, tableHtml: assigned, table: assigned === null ? [] : readBlocks(table, "charts " + c.id),
          warn: warnEl.style.display === "block" ? (warnEl.textContent ?? "") : null,
          caption: caption === null ? null : { n: caption.n, title: caption.title, note: caption.note },
          typed: c.labels !== undefined,
          fields: { title: value("vzTitle"), note: value("vzNote"), xl: value("vzXL"), yl: value("vzYL") },
          selects: { yName: opt("vzY")?.textContent ?? "", gName: opt("vzG")?.value ? (opt("vzG")!.textContent ?? "") : "", gLabel: opt("vzG")?.textContent ?? "" },
          nodata, threw,
        });
      } finally {
        w.localStorage.removeItem("appu_lang");
      }
    }
  } finally {
    delete (table as unknown as Record<string, unknown>).innerHTML;
  }
  return cases;
}

function captureDirect(v1: V1): ChartDirect {
  const call = (fn: string, args: unknown[]): DirectCall => ({ args, out: v1.call(fn, ...args) }); // encodeSpecial writes NaN as {"$n": "NaN"}
  const nice: Array<[number, number, number]> = [[0, 10, 5], [0, 1, 5], [3, 97, 6], [-5, 5, 6], [5, 5, 6], [7, 3, 6], [0, 0.003, 5], [12.4, 27.9, 6], [0, 1234, 5], [-0.5, 0.25, 4], [1, 2, 0], [0, 25.13, 5]];
  const fmt: Array<[number, number]> = [[3, 1], [2.5, 0.5], [0.25, 0.05], [0.123456, 0.0001], [0.5, 1e-6], [10, 2], [0.3, 0.1], [5, 0.2], [-1.25, 0.25], [1234.5, 100]];
  const quant: Array<[number[], number]> = [[[1, 2, 3, 4], 0.25], [[1, 2, 3, 4], 0.5], [[1, 2, 3, 4], 0.75], [[5], 0.25], [[1, 10], 0.5], [[1, 2, 3, 4, 5, 6, 7], 0], [[1, 2, 3, 4, 5, 6, 7], 1], [[0.1, 0.2, 0.7], 0.75]];
  const summary: number[][] = [[1, 2, 3, 4, 5, 6, 7, 8], [5], [3, 3, 3], [1, 2, 2, 3, 3, 4, 30], [-2.5, 0, 7.25, 1.5, 3]];
  const jit: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) for (let k = 0; k < 4; k++) jit.push([i, k]);
  return {
    nice: nice.map((a) => call("vzNice", a)),
    fmt: fmt.map((a) => call("vzFmt", a)),
    quant: quant.map((a) => call("vzQuant", a)),
    summary: summary.map((a) => call("vzSummary", [a])),
    jit: jit.map((a) => call("vzJit", a)),
    tcrit: [0, 0.5, 1, 2, 10, 29, 100].map((df) => call("vzTCrit", [df])),
    qnorm: [0.01, 0.25, 0.5, 0.75, 0.99, 0.5 / 60].map((p) => call("vzQNorm", [p])),
    esc: [`a<b>&"c"'d'`, 12, null, "&amp;"].map((x) => call("vzEsc", [x])),
  };
}

export const charts: Engine = {
  name: "charts",
  async capture(v1, opts) {
    const I18N = v1.eval<Record<string, Record<string, string>>>("I18N");
    const pick = (lang: "en" | "hi") => {
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(I18N[lang]!)) if (/^vz_/.test(k)) o[k] = v;
      return o;
    };
    const VZ_I18N = { en: pick("en"), hi: pick("hi") };
    const VZ_COL = Array.from(v1.eval<string[]>("VZ_COL")), VZ_GRAY = Array.from(v1.eval<string[]>("VZ_GRAY"));
    const anova1 = v1.eval<string>("TG_DEMO.anova1.csv");
    const cases = captureCases(v1, anova1);
    const direct = captureDirect(v1);
    const by: Record<string, number> = {};
    for (const c of cases) by[`${c.options.type}/${c.options.palette}/${c.lang}`] = (by[`${c.options.type}/${c.options.palette}/${c.lang}`] ?? 0) + 1;
    const missingHi = Object.keys(VZ_I18N.en).filter((k) => !(k in VZ_I18N.hi));
    console.log(`charts: ${cases.length} cases (${JSON.stringify(by)}; ${cases.filter((c) => c.warn).length} warnings, ${cases.filter((c) => c.nodata !== null).length} no data, ${cases.filter((c) => c.threw).length} throws), ` +
      `${Object.values(direct).reduce((s, a) => s + a.length, 0)} direct calls, VZ_I18N ${Object.keys(VZ_I18N.en).length} en / ${Object.keys(VZ_I18N.hi).length} hi keys (missing in hi: ${missingHi.join(", ") || "none"})`);
    return [
      emitTables(v1, "charts", "chart-tables", { VZ_COL, VZ_GRAY, VZ_I18N }, opts),
      writeFixture("charts", "cases", { cases, direct }, v1, opts.check),
    ];
  },
};
