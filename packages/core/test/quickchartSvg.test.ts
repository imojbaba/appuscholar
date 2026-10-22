import { describe, expect, it } from "vitest";
import { chartParseLines, quickChartSvg } from "../src";

/*
 * quickChartSvg (Task B5): the quick bar and line chart as a self-contained svg string, replacing v1's Chart.js canvas (chartGenerate 4874-4898, register row D-W2-8).
 * v1 drew `beginAtZero: true` on both charts, kept the colours #a78bfa and #5b21b6, showed no legend, and refused an empty list with a toast (the caller says that here: the function answers "").
 * Nothing in this file is v1 output (v1 drew a canvas); the checks are of the picture's own rules: a bar starts at zero, a label is text and never markup, the picture is readable by a screen reader.
 */

const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const num = (tag: string, name: string): number => parseFloat(attr(tag, name) ?? "NaN");
const tags = (svg: string, name: string): string[] => svg.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];
/** The y-axis tick labels: <text text-anchor="end"> in the left margin. */
const yTicks = (svg: string): Array<{ y: number; text: string }> =>
  [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].filter((m) => attr(m[1]!, "text-anchor") === "end" && !attr(m[1]!, "transform")).map((m) => ({ y: parseFloat(attr(m[1]!, "y")!) - 4, text: m[2]! }));
/** The one horizontal line drawn as the zero baseline (class-free: the line that spans the plot and is marked data-axis="base" is not used, the stroke #333 line that is not a tick). */
const baseline = (svg: string): number => {
  const ls = tags(svg, "line").filter((l) => attr(l, "data-base") === "1");
  expect(ls.length).toBe(1);
  return num(ls[0]!, "y1");
};
const bars = (svg: string) => tags(svg, "rect").filter((r) => attr(r, "data-bar") === "1");

describe("quickChartSvg: quick bar chart starts at zero", () => {
  const rows = [{ label: "A", val: 95 }, { label: "B", val: 99 }, { label: "C", val: 97 }, { label: "D", val: 96 }];
  const svg = quickChartSvg(rows, "bar", "Scores");

  it("the lowest y-axis tick is 0 although every value is 95 to 99", () => {
    const ticks = yTicks(svg).map((t) => parseFloat(t.text));
    expect(ticks.length).toBeGreaterThan(2);
    expect(Math.min(...ticks)).toBe(0);
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(99);
  });
  it("the zero tick sits on the baseline and every bar's base is the baseline", () => {
    const base = baseline(svg);
    const zero = yTicks(svg).find((t) => parseFloat(t.text) === 0)!;
    expect(zero.y).toBeCloseTo(base, 1);
    const bs = bars(svg);
    expect(bs.length).toBe(4);
    for (const b of bs) expect(num(b, "y") + num(b, "height")).toBeCloseTo(base, 1);
  });
  it("heights are in proportion to the values (a bar is its length): 99 against 95", () => {
    const [a, b] = bars(svg);
    expect(num(b!, "height") / num(a!, "height")).toBeCloseTo(99 / 95, 2);
  });
  it("the same holds for the line chart: its axis includes zero (v1: beginAtZero on both)", () => {
    const l = quickChartSvg(rows, "line", "Scores");
    expect(Math.min(...yTicks(l).map((t) => parseFloat(t.text)))).toBe(0);
    const base = baseline(l);
    expect(yTicks(l).find((t) => parseFloat(t.text) === 0)!.y).toBeCloseTo(base, 1);
    // every plotted point is above the baseline (values are positive), none is on it
    for (const c of tags(l, "circle")) expect(num(c, "cy")).toBeLessThan(base);
  });
  it("negative values hang below the baseline, which stays at zero", () => {
    const n = quickChartSvg([{ label: "up", val: 4 }, { label: "down", val: -3 }], "bar", "");
    const base = baseline(n);
    const [up, down] = bars(n);
    expect(num(up!, "y") + num(up!, "height")).toBeCloseTo(base, 1);
    expect(num(down!, "y")).toBeCloseTo(base, 1);
    expect(Math.min(...yTicks(n).map((t) => parseFloat(t.text)))).toBeLessThan(0);
    expect(Math.max(...yTicks(n).map((t) => parseFloat(t.text)))).toBeGreaterThanOrEqual(4);
  });
  it("all values zero still draws an axis with zero on it", () => {
    const z = quickChartSvg([{ label: "a", val: 0 }, { label: "b", val: 0 }], "bar", "");
    expect(z).not.toBe("");
    expect(yTicks(z).map((t) => parseFloat(t.text))).toContain(0);
    expect(yTicks(z).length).toBeGreaterThan(1);
  });
  it("is deterministic and one root svg with a viewBox", () => {
    expect(quickChartSvg(rows, "bar", "Scores")).toBe(svg);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect((svg.match(/<svg\b/g) ?? []).length).toBe(1);
    expect(attr(tags(svg, "svg")[0]!, "viewBox")).toMatch(/^0 0 \d+ \d+$/);
    expect(attr(tags(svg, "svg")[0]!, "xmlns")).toBe("http://www.w3.org/2000/svg");
  });
});

describe("quickChartSvg: labels are text, never markup", () => {
  const hostile = '<img src=x onerror=alert(1)>';
  it("escapes a hostile label, a hostile title and ampersands and quotes, in the picture and in its description", () => {
    for (const type of ["bar", "line"] as const) {
      const svg = quickChartSvg([{ label: hostile, val: 3 }, { label: 'Tom & "Jerry"', val: 5 }, { label: "</text><script>alert(2)</script>", val: 1 }], type, '<svg onload=alert(3)>');
      expect(svg).not.toContain("<img");
      expect(svg).not.toContain("<script");
      expect((svg.match(/<svg\b/g) ?? []).length).toBe(1);
      expect(svg).not.toMatch(/<svg onload/);
      expect(svg).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(svg).toContain("Tom &amp; &quot;Jerry&quot;");
      // every tag in the string is one of the picture's own
      const names = new Set([...svg.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
      const allowed = new Set(["circle", "desc", "line", "polyline", "rect", "svg", "text", "title"]);
      expect([...names].filter((n) => !allowed.has(n!))).toEqual([]);
      for (const bad of ["img", "script", "foreignObject", "image", "a", "style", "use"]) expect(names.has(bad), bad).toBe(false);
    }
  });
  it("a long label is cut, not allowed to run across the picture", () => {
    const svg = quickChartSvg([{ label: "x".repeat(200), val: 1 }], "bar", "");
    expect(svg).not.toContain("x".repeat(41));
    expect([...svg.matchAll(/<text\b[^>]*text-anchor="middle"[^>]*>(x+)<\/text>/g)].map((m) => m[1]!.length)).toEqual([22]);
  });
});

describe("quickChartSvg: readable by a screen reader and self-contained", () => {
  const svg = quickChartSvg([{ label: "Anxious", val: 14 }, { label: "Secure", val: 22 }], "bar", "Attachment style");
  it("has role img, a <title> with the chart's title and a <desc> that lists the values", () => {
    const root = tags(svg, "svg")[0]!;
    expect(attr(root, "role")).toBe("img");
    expect(attr(root, "aria-labelledby")).toMatch(/\S+ \S+/);
    expect(svg).toMatch(/<title id="[^"]+">Attachment style<\/title>/);
    const desc = /<desc id="[^"]+">([^<]*)<\/desc>/.exec(svg)![1]!;
    expect(desc).toContain("Anxious");
    expect(desc).toContain("14");
    expect(desc).toContain("Secure");
    expect(desc).toContain("22");
    expect(desc.toLowerCase()).toContain("bar chart");
  });
  it("an untitled chart still has a title element that names its kind", () => {
    expect(quickChartSvg([{ label: "a", val: 1 }], "line", "")).toMatch(/<title id="[^"]+">Line chart<\/title>/);
    expect(quickChartSvg([{ label: "a", val: 1 }], "bar", "   ")).toMatch(/<title id="[^"]+">Bar chart<\/title>/);
  });
  it("loads nothing from outside: no font file, link, image or url() (the only address is the svg namespace)", () => {
    for (const type of ["bar", "line"] as const) {
      const s = quickChartSvg([{ label: "a", val: 1 }, { label: "b", val: 2 }], type, "t");
      expect(s).not.toMatch(/url\(|@import|@font-face|xlink|href|<image|<use/i);
      expect(s.match(/https?:\/\/[^"'\s<]*/g)).toEqual(["http://www.w3.org/2000/svg"]);
      expect(s).toMatch(/font-family="[^"]*(Arial|sans-serif)[^"]*"/);
    }
  });
  it("draws v1's colours and no legend (the title is drawn only when given)", () => {
    expect(svg).toContain('fill="#a78bfa"');
    expect(svg).toContain('stroke="#5b21b6"');
    expect(svg).toContain(">Attachment style</text>");
    expect(quickChartSvg([{ label: "a", val: 1 }], "bar", "")).not.toMatch(/font-weight="bold"[^>]*>[^<]*<\/text>/);
  });
});

describe("quickChartSvg: nothing to draw", () => {
  it("empty rows give '' (v1 refused with a toast and drew nothing)", () => {
    expect(quickChartSvg([], "bar", "x")).toBe("");
    expect(quickChartSvg([], "line", "")).toBe("");
    expect(quickChartSvg(chartParseLines("no comma here\nname,notanumber\n  \n"), "bar", "")).toBe("");
  });
  it("a value that is not a finite number is left out (parseFloat('1e999') is Infinity); all left out gives ''", () => {
    expect(quickChartSvg([{ label: "a", val: Infinity }, { label: "b", val: NaN }], "bar", "")).toBe("");
    const svg = quickChartSvg([{ label: "a", val: Infinity }, { label: "b", val: 2 }], "bar", "");
    expect(bars(svg).length).toBe(1);
    expect(svg).not.toMatch(/Infinity|NaN/);
  });
  it("what chartParseLines reads from a student's lines is what is drawn, in order", () => {
    const svg = quickChartSvg(chartParseLines("Anxious,14\nAvoidant,9\nSecure,22\nDisorganized,5\n"), "bar", "");
    expect(bars(svg).length).toBe(4);
    const labels = [...svg.matchAll(/<text\b[^>]*text-anchor="(?:middle|end)"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    for (const l of ["Anxious", "Avoidant", "Secure", "Disorganized"]) expect(labels).toContain(l);
    expect(labels.indexOf("Anxious")).toBeLessThan(labels.indexOf("Avoidant"));
    expect(labels.indexOf("Secure")).toBeLessThan(labels.indexOf("Disorganized"));
  });
  it("a long list keeps every bar inside the picture", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: "L" + i, val: i + 1 }));
    const svg = quickChartSvg(many, "bar", "");
    const w = parseFloat(attr(tags(svg, "svg")[0]!, "viewBox")!.split(" ")[2]!);
    const bs = bars(svg);
    expect(bs.length).toBe(40);
    for (const b of bs) { expect(num(b, "x")).toBeGreaterThanOrEqual(0); expect(num(b, "x") + num(b, "width")).toBeLessThanOrEqual(w); expect(num(b, "width")).toBeGreaterThan(0); }
  });
});
