import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 12's Quick chart dialog (v1 index.html: chartParseLines 4868-4873, _vennNum and vennGenerate 4899-4939), page-bound: every expected value is what v1 returned or built; the only
 * hand-written inputs are the texts and field strings below.
 * - `parse`: the text goes into #chartData and v1's chartParseLines() runs; its rows are recorded.
 * - `venn`: every Venn field (#vennA, #vennASize, #vennB, #vennBSize, #vennC, #vennCSize, #vennAB, #vennAC, #vennBC, #vennABC, #vennTitle) is set as a string and vennGenerate() runs; the
 *   `<svg…</svg>` of window._chartMakerPendingHTML (v1's string, read through eval) is `svg`, and the capture checks that the rest of that string is the img-wrap span v1 puts round it.
 * chartGenerate (4874-4898, Chart.js) is not captured: register row D-W2-8.
 */

export type ParseCase = { id: string; text: string; rows: Array<{ label: string; val: number }> };
export type VennInput = { a: string; aSize: string; b: string; bSize: string; c: string; cSize: string; ab: string; ac: string; bc: string; abc: string; title: string };
export type VennCase = { id: string; input: VennInput; svg: string };

const TEXTS: Array<[string, string]> = [
  ["placeholder", "Anxious,14\nAvoidant,9\nSecure,22\nDisorganized,5"],
  ["no-comma-line-dropped", "no comma here\nA,3"],
  ["last-comma-splits", "a,b,1\nx,y,2.5\n,,3"],
  ["value-not-a-number-dropped", "x,abc\ny,3\nz,NaN"],
  ["blank-lines", "\n\nA,1\n\n   \nB,2\n"],
  ["spaces-and-tabs", "  Spaced label  ,  7  \n tab\t, 8\t"],
  ["parseFloat-forms", "A,1e3\nB,-2\nC,.5\nD,3abc\nE,\nF,Infinity\nG,-0"],
  ["empty", ""],
  ["crlf", "A,1\r\nB,2\r\n"],
  ["empty-label", ",5\nlabel only,"],
];

const blank: VennInput = { a: "", aSize: "", b: "", bSize: "", c: "", cSize: "", ab: "", ac: "", bc: "", abc: "", title: "" };
const VENN: Array<[string, Partial<VennInput>]> = [
  ["two-sets", { a: "Anxiety", aSize: "18", b: "Depression", bSize: "12", ab: "7" }],
  ["two-sets-title", { a: "Anxiety", aSize: "18", b: "Depression", bSize: "12", ab: "7", title: "  Comorbidity overlap  " }],
  ["two-sets-c-counts-ignored", { a: "Anxiety", aSize: "18", b: "Depression", bSize: "12", ab: "7", c: "   ", cSize: "10", ac: "4", bc: "3", abc: "2" }],
  ["three-sets", { a: "Anxiety", aSize: "18", b: "Depression", bSize: "12", c: "Insomnia", cSize: "10", ab: "7", ac: "4", bc: "3", abc: "2" }],
  ["three-sets-title", { a: "Anxiety", aSize: "18", b: "Depression", bSize: "12", c: "Insomnia", cSize: "10", ab: "7", ac: "4", bc: "3", abc: "2", title: "Comorbidity overlap" }],
  ["negative-and-text-counts-are-0", { a: "A1", aSize: "-3", b: "B1", bSize: "abc", ab: "" }],
  ["three-sets-negative-and-text", { a: "A1", aSize: "5", b: "B1", bSize: "-1", c: "C1", cSize: "x", ab: "-0.5", ac: "", bc: "2", abc: "-7" }],
  ["empty-names-two-sets", { a: "", aSize: "1", b: "  ", bSize: "2", ab: "3" }],
  ["empty-names-three-sets", { a: " ", aSize: "1", b: "", bSize: "2", c: " Z ", cSize: "3", ab: "4", ac: "5", bc: "6", abc: "7" }],
  ["escaped-names-and-title", { a: '<b>Tom & "Jerry"</b>', aSize: "1", b: "Kids' <set>", bSize: "2", ab: "0", title: "A < B & 'C'" }],
  ["escaped-three-sets", { a: "a<1", aSize: "1", b: "b>2", bSize: "2", c: "c&\"3\"", cSize: "3", ab: "4", ac: "5", bc: "6", abc: "7", title: "<script>x</script>" }],
  ["decimal-and-parseFloat-forms", { a: "A", aSize: "1.5", b: "B", bSize: "2.50", ab: "1e2", c: "C", cSize: " 7 ", ac: "7abc", bc: "-0", abc: ".25" }],
  ["hindi-names", { a: "चिंता", aSize: "18", b: "अवसाद", bSize: "12", ab: "7", title: "सह-रुग्णता" }],
];

const FIELD_IDS: Record<keyof VennInput, string> = { a: "vennA", aSize: "vennASize", b: "vennB", bSize: "vennBSize", c: "vennC", cSize: "vennCSize", ab: "vennAB", ac: "vennAC", bc: "vennBC", abc: "vennABC", title: "vennTitle" };

function captureParse(v1: V1): ParseCase[] {
  return TEXTS.map(([id, text]) => {
    v1.setValue("chartData", text);
    if ((v1.document.getElementById("chartData") as HTMLTextAreaElement).value !== text.replace(/\r\n?/g, "\n") && (v1.document.getElementById("chartData") as HTMLTextAreaElement).value !== text)
      throw new Error(`quickchart ${id}: #chartData did not take the text`);
    const rows = v1.call<Array<{ label: string; val: number }>>("chartParseLines").map((r) => ({ label: r.label, val: r.val }));
    return { id, text: (v1.document.getElementById("chartData") as HTMLTextAreaElement).value, rows };
  });
}

function captureVenn(v1: V1): VennCase[] {
  return VENN.map(([id, over]) => {
    const input: VennInput = { ...blank, ...over };
    for (const [k, fid] of Object.entries(FIELD_IDS) as Array<[keyof VennInput, string]>) {
      v1.setValue(fid, input[k]);
      if ((v1.document.getElementById(fid) as HTMLInputElement).value !== input[k]) throw new Error(`quickchart venn ${id}: #${fid} did not take ${JSON.stringify(input[k])}`);
    }
    v1.eval("_chartMakerPendingHTML=null");
    v1.call("vennGenerate");
    const html = v1.eval<string | null>("_chartMakerPendingHTML");
    if (typeof html !== "string") throw new Error(`quickchart venn ${id}: vennGenerate set nothing`);
    const a = html.indexOf("<svg"), b = html.indexOf("</svg>");
    if (a < 0 || b < a) throw new Error(`quickchart venn ${id}: no svg`);
    const svg = html.slice(a, b + 6);
    if (html !== '<span class="img-wrap" contenteditable="false" style="width:420px">' + svg + '<span class="img-handle" title="Drag to resize"></span></span>&nbsp;')
      throw new Error(`quickchart venn ${id}: unexpected wrapper ${html.slice(0, a)} … ${html.slice(b + 6)}`);
    return { id, input, svg };
  });
}

export const quickchart: Engine = {
  name: "quickchart",
  async capture(v1, opts) {
    const parse = captureParse(v1);
    const venn = captureVenn(v1);
    console.log(`quickchart: ${parse.length} chartParseLines texts (${parse.reduce((s, p) => s + p.rows.length, 0)} rows), ${venn.length} Venn cases (${venn.filter((v) => v.svg.includes('viewBox="0 0 420 320"')).length} with three sets)`);
    return [writeFixture("quickchart", "cases", { parse, venn }, v1, opts.check)];
  },
};
