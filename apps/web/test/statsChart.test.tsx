// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { smean, smedian, ssd, statsParseText, type StatsTestKey } from "@appuscholar/core";
import en from "../messages/en.json";
import statsEn from "../messages/tools/stats.en.json";
import { ResultChart } from "../components/tools/stats/ResultChart";
import { defaultForm } from "../lib/tools/stats/form";
import { runLabTest } from "../lib/tools/stats/run";
import { resultChart, type ChartSpec } from "../lib/tools/stats/resultChart";
import { casesOf, fixtureFiles } from "./support/statsGolden";

/*
 * Task B2, ledger R3: the chart under a result (v1 statsChart* 11884-11979), drawn as SVG elements from a spec; bars start at zero (R2).
 */

const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
const w = (k: string, v?: Record<string, string | number>) => (E[k] ?? k).replace(/\{(\w+)\}/g, (m, n: string) => (v && n in v ? String(v[n]) : m));
const KIND: Record<string, ChartSpec["kind"] | null> = {
  desc: "hist", ttest1: "hist", mregress: "hist", ttestInd: "bars", anova1: "bars", welchAnova: "bars", tukey: "bars", ttestPaired: "bars", mannwhitney: "bars", wilcoxon: "bars", kruskal: "bars",
  gof: "bars", mcnemar: "bars", cochran: "bars", friedman: "bars", rmanova: "bars", mediate: "bars", regression: "scatter", pearson: "scatter", spearman: "scatter", chisq: "grouped",
  anova2: "lines", mixed: "lines", moderate: "slopes", logistic: null, alpha: null
};

function specOf(csv: string, test: StatsTestKey, values: Record<string, string>, ticked: Record<string, number[]> = {}) {
  const data = statsParseText(csv)!;
  const f = { ...defaultForm(data, test), values: { ...defaultForm(data, test).values, ...values }, ticked: { ...defaultForm(data, test).ticked, ...ticked } };
  const o = runLabTest(data, test, f, w);
  if (o.kind !== "ok") throw new Error("no result: " + JSON.stringify(o));
  return { data, spec: o.chart };
}

describe("which tests draw what", () => {
  it("every golden result draws the chart v1 drew for its test (alpha and logistic draw none)", () => {
    const seen = new Set<string>();
    for (const file of fixtureFiles()) {
      const test = file.replace(/\.json$/, "") as StatsTestKey;
      let n = 0;
      for (const c of casesOf(file)) {
        if (c.apa === null || c.id === "alpha-large-boot-200" || n >= 4) continue;
        const data = statsParseText(c.csv)!;
        const f = defaultForm(data, c.test); f.values = { ...c.form.values }; f.ticked = { ...c.form.ticked };
        const o = runLabTest(data, c.test, f, w);
        if (o.kind !== "ok") continue;
        n++;
        if (KIND[test] === null) expect(o.chart, c.id).toBeNull();
        else expect(o.chart?.kind, c.id).toBe(KIND[test]);
        seen.add(test);
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(KIND).sort());
  }, 120_000);

  it("pearson: a scatter of every pair with the fitted line; alpha: none", () => {
    const csv = "a,b,c\n1,2,3\n2,3,5\n3,5,4\n4,4,6\n5,7,6\n6,6,8";
    const { spec } = specOf(csv, "pearson", { v1: "0", v2: "1" });
    expect(spec?.kind).toBe("scatter");
    if (spec?.kind !== "scatter") return;
    expect(spec.points).toEqual([[1, 2], [2, 3], [3, 5], [4, 4], [5, 7], [6, 6]].map(([x, y]) => ({ x, y })));
    const xs = [1, 2, 3, 4, 5, 6], ys = [2, 3, 5, 4, 7, 6], mx = smean(xs), my = smean(ys);
    const b1 = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    expect(spec.fit![0]!.x).toBe(1);
    expect(spec.fit![0]!.y).toBeCloseTo(my + b1 * (1 - mx), 12);
    expect(spec.fit![1]!.y).toBeCloseTo(my + b1 * (6 - mx), 12);
    expect(specOf(csv, "alpha", {}, { items: [0, 1, 2] }).spec).toBeNull();
  });

  it("group means with one SD for the t-test; medians for Mann-Whitney; both from the groups' own values", () => {
    const csv = "g,s\nA,7\nA,8\nA,9\nA,8\nB,5\nB,6\nB,5\nB,9";
    const A = [7, 8, 9, 8], B = [5, 6, 5, 9];
    const t = specOf(csv, "ttestInd", { dv: "1", iv: "0" }).spec;
    expect(t).toMatchObject({ kind: "bars", labels: ["A", "B"], values: [smean(A), smean(B)] });
    if (t?.kind === "bars") expect(t.errs).toEqual([{ plus: smean(A) + ssd(A), minus: smean(A) - ssd(A) }, { plus: smean(B) + ssd(B), minus: smean(B) - ssd(B) }]);
    expect(specOf(csv, "mannwhitney", { dv: "1", iv: "0" }).spec).toMatchObject({ kind: "bars", labels: ["A", "B"], values: [smedian(A), smedian(B)] });
  });

  it("a histogram counts every value once, in 5 to 10 bins by the square root of n", () => {
    const vals = Array.from({ length: 50 }, (_, i) => (i * 7) % 23);
    const { spec } = specOf("x\n" + vals.join("\n"), "desc", { dv: "0" });
    expect(spec?.kind).toBe("hist");
    if (spec?.kind !== "hist") return;
    expect(spec.bins.reduce((a, b) => a + b, 0)).toBe(50);
    expect(spec.bins).toHaveLength(Math.max(5, Math.min(10, Math.round(Math.sqrt(50)))));
    expect(spec.start).toBe(0);
    expect(spec.title).toBe("Distribution of x");
  });

  it("the counts of a chi-square are the table's own", () => {
    const csv = "a,b\nx,p\nx,p\nx,q\ny,q\ny,q\ny,p\ny,p";
    const { spec } = specOf(csv, "chisq", { v1: "0", v2: "1" });
    expect(spec).toMatchObject({ kind: "grouped", rowLabels: ["x", "y"], colLabels: ["p", "q"], table: [[2, 1], [2, 2]] });
  });

  it("a chart never stops a result: a spec that cannot be made is null, not a throw", () => {
    const data = statsParseText("a\n1\n2")!;
    expect(resultChart(data, "pearson", { values: { v1: "9", v2: "9" }, ticked: {} }, {}, w)).toBeNull();
  });
});

describe("the picture", () => {
  const roots: Root[] = [];
  afterEach(async () => { await act(async () => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
  async function draw(spec: ChartSpec) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    await act(async () => { root.render(<ResultChart spec={spec} />); });
    return el;
  }
  const zeroY = (el: HTMLElement) => Number(el.querySelector('[data-testid="stats-chart-zero"]')!.getAttribute("y1"));

  it("quick bars start at zero: every bar of positive values stands on the zero line, whatever the values are", async () => {
    // values far from zero: a Chart.js axis that began at 0.6 would have cut the bars; here the axis holds zero
    const el = await draw({ kind: "bars", title: "t", yLabel: "y", labels: ["A", "B", "C"], values: [100.2, 101.5, 99.9], errs: [{ plus: 102, minus: 98 }, null, null] });
    const z = zeroY(el);
    const rects = [...el.querySelectorAll('[data-testid="stats-chart-bar"] rect')];
    expect(rects).toHaveLength(3);
    for (const r of rects) expect(Number(r.getAttribute("y")) + Number(r.getAttribute("height"))).toBeCloseTo(z, 6);
    // heights are in proportion to the values (a bar twice as tall means twice the value)
    const hs = rects.map((r) => Number(r.getAttribute("height")));
    expect(hs[1]! / hs[0]!).toBeCloseTo(101.5 / 100.2, 3);
    const ticks = [...el.querySelectorAll("text")].map((t) => t.textContent);
    expect(ticks).toContain("0");
  });

  it("bars with a negative value hang down from the zero line", async () => {
    const el = await draw({ kind: "bars", title: "t", yLabel: "", labels: ["A", "B"], values: [3, -2], errs: [null, null] });
    const z = zeroY(el);
    const [a, b] = [...el.querySelectorAll('[data-testid="stats-chart-bar"] rect')];
    expect(Number(a!.getAttribute("y")) + Number(a!.getAttribute("height"))).toBeCloseTo(z, 6);
    expect(Number(b!.getAttribute("y"))).toBeCloseTo(z, 6);
  });

  it("histogram and grouped bars start at zero too", async () => {
    const h = await draw({ kind: "hist", title: "t", yLabel: "n", start: 10, width: 2, bins: [3, 8, 5, 1, 2] });
    const z = zeroY(h);
    for (const r of h.querySelectorAll('[data-testid="stats-chart-bar"] rect')) expect(Number(r.getAttribute("y")) + Number(r.getAttribute("height"))).toBeCloseTo(z, 6);
    const g = await draw({ kind: "grouped", title: "t", yLabel: "n", rowLabels: ["x", "y"], colLabels: ["p", "q"], table: [[20, 30], [25, 40]] });
    const zg = zeroY(g);
    for (const r of g.querySelectorAll('[data-testid="stats-chart-bar"]')) expect(Number(r.getAttribute("y")) + Number(r.getAttribute("height"))).toBeCloseTo(zg, 6);
  });

  it("student text is drawn as text: labels that look like markup add no element and no handler", async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const el = await draw({ kind: "bars", title: evil, yLabel: evil, labels: [evil, "B"], values: [1, 2], errs: [null, null] });
    expect(el.querySelector("img, [onerror]")).toBeNull();
    expect(el.textContent).toContain("<img src=x");
    expect([...el.querySelectorAll("*")].map((n) => n.tagName.toLowerCase()).filter((t) => t === "img" || t === "script")).toEqual([]);
  });

  it("has a text alternative", async () => {
    const el = await draw({ kind: "bars", title: "Hours by group", yLabel: "", labels: ["A"], values: [1], errs: [null] });
    expect(el.querySelector("svg")!.getAttribute("role")).toBe("img");
    expect(el.querySelector("svg")!.getAttribute("aria-label")).toBe(w("stats_chart_alt", { title: "Hours by group" }));
  });
});
