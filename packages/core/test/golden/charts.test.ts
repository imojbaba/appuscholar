import { describe, it, expect } from "vitest";
import {
  VZ_COL, VZ_GRAY, VZ_I18N, vzGroups, vzChart, vzDefaults, vzAxisDefaults, vzCaption, vzNice, vzFmt, vzQuant, vzSummary, vzJit, vzTCrit, vzQNorm, vzEsc,
} from "../../src/charts";
import type { VzOptions, VzType } from "../../src/charts";
import { tgSkew } from "../../src/guide";
import { statsParseText } from "../../src/intake";
import type { StatsBlock } from "../../src/stats-core";
import type { ChartCase, ChartDirect } from "./charts/capture";
import { decodeText } from "./stats/render";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * The Chart Studio (charts.ts) against v1's dialog (`golden:capture charts`, charts/capture.ts): every expected string and number is what v1 drew or returned. A case's svg is held to
 * VZ.svg by toBe (the coordinates come from the same arithmetic; register row D-W1-16 for the ones that pass through Math.exp or Math.log: the bar chart's 95% CI and the Q-Q plot's
 * theoretical quantiles are printed raw), its table blocks to #vzTable read back by cell text and, joined into v1's markup, to the string vzDraw assigned to #vzTable by toBe; its
 * warning, caption, defaults and axis labels by toEqual. The direct calls by expectGolden. `tr` is v1's t() (2439): the Hindi string when the key is in I18N.hi, else I18N.en's, else the key.
 */

type Fx = { cases: ChartCase[]; direct: ChartDirect };
type I18n = Record<string, string>;
const fx = readFixture<Fx>("charts", "cases");
const mode = goldenMode(fx);
const tables = readFixture<{ tables: { VZ_COL: string[]; VZ_GRAY: string[]; VZ_I18N: { en: I18n; hi: I18n } } }>("charts", "tables");

const EN = VZ_I18N.en as I18n, HI = VZ_I18N.hi as I18n;
const trFor = (lang: "en" | "hi") => {
  const d = lang === "hi" ? HI : EN;
  return (k: string): string => (k in d ? d[k]! : EN[k] || k);
};
const cells = (b: StatsBlock): unknown => (b.kind === "table" ? b.rows.map((r) => r.map(decodeText)) : b.kind === "note" ? decodeText(b.html) : b);
/** v1's `key+vzTableHTML(rows)` (3804, 3772-3776), joined back from the port's blocks. */
const tableHtml = (blocks: StatsBlock[]): string => {
  const [key, tbl] = blocks;
  if (key?.kind !== "note" || tbl?.kind !== "table" || blocks.length !== 2) throw new Error("not a key note and a table");
  const [head, ...rows] = tbl.rows;
  return '<p class="desc" style="margin:6px 0">' + key.html + "</p>" + '<table class="stats-table"><tr>' + head!.map((c) => "<th>" + c + "</th>").join("") + "</tr>" +
    rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</table>";
};

describe("charts: tables", () => {
  it("VZ_COL and VZ_GRAY are v1's, emitted", () => {
    expect(VZ_COL as unknown).toEqual(tables.tables.VZ_COL);
    expect(VZ_GRAY as unknown).toEqual(tables.tables.VZ_GRAY);
  });
  it("VZ_I18N.en and .hi hold every vz_* string of v1's I18N byte for byte (data/chart-tables.ts, the file devanagari.test.ts exempts)", () => {
    expect(Object.keys(EN)).toEqual(Object.keys(tables.tables.VZ_I18N.en));
    expect(Object.keys(HI)).toEqual(Object.keys(tables.tables.VZ_I18N.hi));
    for (const [k, v] of Object.entries(tables.tables.VZ_I18N.en)) expect(EN[k] === v, k).toBe(true);
    for (const [k, v] of Object.entries(tables.tables.VZ_I18N.hi)) expect(HI[k] === v, k).toBe(true);
    expect(Object.keys(EN).length).toBe(44);
  });
  it("every vz_* key of I18N.en has a Hindi string (v1 lacks none, so t() never falls back to English for a vz_* key)", () => {
    expect(Object.keys(EN).filter((k) => !(k in HI))).toEqual([]);
  });
});

describe("charts: the fixture's coverage", () => {
  it("covers the four charts in both palettes, in Hindi, the bar warning, no data, and the vzGroups throw", () => {
    const seen = new Set(fx.cases.filter((c) => c.svg).map((c) => `${c.options.type}/${c.options.palette}`));
    expect(seen.size).toBe(8);
    expect(new Set(fx.cases.filter((c) => c.lang === "hi").map((c) => c.options.type)).size).toBe(4);
    expect(fx.cases.filter((c) => c.warn !== null).map((c) => c.id)).toEqual(["anova1-bar-ymin-5-warns"]);
    expect(fx.cases.filter((c) => c.nodata !== null).length).toBe(1);
    expect(fx.cases.filter((c) => c.threw !== null).length).toBe(1);
    expect((fx.cases.find((c) => c.id === "qq60-qq")!.svg.match(/r="3\.8"/g) ?? []).length).toBe(60);
  });
});

describe("charts: every case against v1's dialog", () => {
  for (const c of fx.cases) {
    it(c.id, () => {
      const tr = trFor(c.lang);
      const data = statsParseText(c.csv)!;
      const o = c.options as VzOptions;
      if (c.threw !== null) {
        expect(() => vzGroups(data, c.yIdx ?? NaN, c.gIdx)).toThrow(TypeError);
        return;
      }
      // the defaults vzSync and vzDefaults write while the student has not typed
      if (!c.typed) {
        expect(vzDefaults(o.type, c.selects.yName, c.selects.gName, o.err, o.showPts)).toEqual({ title: c.fields.title, note: c.fields.note });
        expect(vzAxisDefaults(o.type, c.selects.yName, c.selects.gLabel)).toEqual({ yl: c.fields.yl, xl: c.fields.xl });
      }
      if (c.gIdx === null) expect(c.selects.gLabel).toBe(tr("vz_none"));
      expect(o.title).toBe(o.title === "" ? "" : c.fields.title);
      const gs = vzGroups(data, c.yIdx ?? NaN, c.gIdx);
      const r = vzChart(o, gs, tr);
      if (c.nodata !== null) {
        expect(gs).toEqual([]);
        expect(r).toBeNull();
        expect(c.nodata).toBe(tr("vz_nodata"));
        return;
      }
      expect(r).not.toBeNull();
      expect(r!.svg).toBe(c.svg);
      expectGolden(r!.table.map(cells), c.table.map(cells), mode, "table");
      expect(tableHtml(r!.table)).toBe(c.tableHtml);
      expect(r!.warn ? r!.warn : null).toEqual(c.warn);
      expect(vzCaption(c.fig, c.fields.title, c.fields.note)).toEqual(c.caption);
    });
  }
  it("a typed bins value that is not a number draws the automatic bins, as an empty field does (#vzBins is a number input, so v1's page cannot hold 'abc')", () => {
    const c = fx.cases.find((x) => x.id === "anova1-hist-bins-abc")!;
    expect(c.given.vzBins).toBe("abc");
    expect(c.options.bins).toBe("");
    const gs = vzGroups(statsParseText(c.csv)!, c.yIdx!, c.gIdx);
    expect(vzChart({ ...(c.options as VzOptions), bins: "abc" }, gs, trFor("en"))!.svg).toBe(c.svg);
  });
  it("F16 (noted): the histogram's skew in its key note is Σ((x-m)/s)³/n (3858), not tgSkew's adjusted form", () => {
    const c = fx.cases.find((x) => x.id === "skewed-hist")!;
    const vals = statsParseText(c.csv)!.rows.map((r) => parseFloat(r[0]!));
    const note = decodeText((c.table[0] as { html: string }).html);
    const shown = /Skewness = (-?\d+\.\d\d)/.exec(note)![1]!;
    const n = vals.length, m = vals.reduce((s, v) => s + v, 0) / n, sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
    expect(shown).toBe((vals.reduce((s, v) => s + ((v - m) / sd) ** 3, 0) / n).toFixed(2));
    expect(tgSkew(vals).toFixed(2)).not.toBe(shown);
  });
});

describe("charts: direct calls against v1's functions", () => {
  const types: VzType[] = ["box", "bar", "hist", "qq"];
  it("vzNice", () => { for (const d of fx.direct.nice) expectGolden(vzNice(...(d.args as [number, number, number])), d.out as ReturnType<typeof vzNice>, mode, JSON.stringify(d.args)); });
  it("vzFmt", () => { for (const d of fx.direct.fmt) expect(vzFmt(...(d.args as [number, number]))).toBe(d.out); });
  it("vzQuant", () => { for (const d of fx.direct.quant) expectGolden(vzQuant(...(d.args as [number[], number])), d.out as number, mode, JSON.stringify(d.args)); });
  it("vzSummary", () => { for (const d of fx.direct.summary) expectGolden(vzSummary(d.args[0] as number[]), d.out as ReturnType<typeof vzSummary>, mode, JSON.stringify(d.args)); });
  it("vzJit", () => { for (const d of fx.direct.jit) expectGolden(vzJit(...(d.args as [number, number])), d.out as number, mode, JSON.stringify(d.args)); });
  it("vzTCrit (through pFromT)", () => { for (const d of fx.direct.tcrit) expectGolden(vzTCrit(d.args[0] as number), d.out as number, mode, JSON.stringify(d.args)); });
  it("vzQNorm (through normalCDF)", () => { for (const d of fx.direct.qnorm) expectGolden(vzQNorm(d.args[0] as number), d.out as number, mode, JSON.stringify(d.args)); });
  it("vzEsc (v1's own: & < > \" escaped, ' left)", () => { for (const d of fx.direct.esc) expect(vzEsc(d.args[0])).toBe(d.out); });
  it("vzChart gives null for no groups, for every type", () => {
    for (const type of types) expect(vzChart({ ...(fx.cases[0]!.options as VzOptions), type }, [], trFor("en"))).toBeNull();
  });
});
