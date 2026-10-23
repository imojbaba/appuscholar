import { escHTML } from "./html";
import { vzFmt, vzNice } from "./charts";

/* v1's Quick chart dialog (S9), the compute half: chartParseLines (index.html:4868-4873), _vennNum (4899) and the SVG vennGenerate builds (4900-4936; vennGenerate runs to 4940).
   Not ported: chartGenerate (4874-4898: draws a bar or line chart with Chart.js on a canvas and keeps it as a PNG; register row D-W2-8), chartTypeChange (4856-4867, shows and hides the
   fields), the preview, the img-wrap span vennGenerate puts round the SVG into _chartMakerPendingHTML (4937-4939) and chartInsertToDoc (4941-4946): page code.
   The strings, literals and order are v1's: the last comma splits a line, both halves trimmed by the line's own trim; parseFloat, and a NaN drops the line; _vennNum's
   `isNaN(v)||v<0?0:v`; the 2-set and 3-set SVG with every circle's centre, radius, colour and opacity, every text's position, size and fill, the counts concatenated raw (so 2.50 prints
   2.5 and 1e2 prints 100), and the names and title through escHTML; is3 is `c.trim()!==''`, the names fall back to A, B and C after trim, the title is trimmed.
   What differs from v1's text:
   - types and `export`; chartParseLines takes the text (v1 reads #chartData.value) and its `.filter(Boolean)` after the map becomes a type-guard filter on null (the map gives an
     object or null only, so the same rows are kept); `{label,val}` is typed;
   - vennNum takes the field's string (v1's `_vennNum(id)` reads `document.getElementById(id).value`); vennSvg takes every Venn field's string as VennInput (v1 reads #vennA, #vennASize,
     #vennB, #vennBSize, #vennC, #vennCSize, #vennAB, #vennAC, #vennBC, #vennABC and #vennTitle) and returns `svg` (v1 writes it into #chartPreviewBox and _chartMakerPendingHTML). */

export type ChartRow = { label: string; val: number };
export type VennInput = { a: string; aSize: string; b: string; bSize: string; c: string; cSize: string; ab: string; ac: string; bc: string; abc: string; title: string };

export function chartParseLines(text: string): ChartRow[] {
  return text.split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>{const i=l.lastIndexOf(',');if(i<0)return null;
      const label=l.slice(0,i).trim(),val=parseFloat(l.slice(i+1));
      return isNaN(val)?null:{label,val};}).filter((r): r is ChartRow=>r!==null);
}
export function vennNum(raw: string): number {const v=parseFloat(raw);return isNaN(v)||v<0?0:v}
export function vennSvg(i: VennInput): string {
  const is3=i.c.trim()!=='';
  const A=i.a.trim()||'A',B=i.b.trim()||'B';
  const aOnly=vennNum(i.aSize),bOnly=vennNum(i.bSize),ab=vennNum(i.ab);
  const title=i.title.trim();
  let svg: string;
  if(!is3){
    svg='<svg viewBox="0 0 420 260" xmlns="http://www.w3.org/2000/svg" font-family="Georgia,serif">'+
      (title?'<text x="210" y="24" text-anchor="middle" font-size="16" fill="#3b0764" font-weight="bold">'+escHTML(title)+'</text>':'')+
      '<circle cx="165" cy="140" r="95" fill="#a78bfa" fill-opacity="0.55" stroke="#5b21b6" stroke-width="2"/>'+
      '<circle cx="255" cy="140" r="95" fill="#fbbf24" fill-opacity="0.55" stroke="#b45309" stroke-width="2"/>'+
      '<text x="110" y="140" text-anchor="middle" font-size="20" fill="#1e1b2e">'+aOnly+'</text>'+
      '<text x="310" y="140" text-anchor="middle" font-size="20" fill="#1e1b2e">'+bOnly+'</text>'+
      '<text x="210" y="140" text-anchor="middle" font-size="20" fill="#1e1b2e">'+ab+'</text>'+
      '<text x="90" y="70" text-anchor="middle" font-size="15" fill="#3b0764" font-weight="bold">'+escHTML(A)+'</text>'+
      '<text x="330" y="70" text-anchor="middle" font-size="15" fill="#7c2d12" font-weight="bold">'+escHTML(B)+'</text>'+
      '</svg>';
  }else{
    const C=i.c.trim()||'C';
    const cOnly=vennNum(i.cSize),ac=vennNum(i.ac),bc=vennNum(i.bc),abc=vennNum(i.abc);
    svg='<svg viewBox="0 0 420 320" xmlns="http://www.w3.org/2000/svg" font-family="Georgia,serif">'+
      (title?'<text x="210" y="24" text-anchor="middle" font-size="16" fill="#3b0764" font-weight="bold">'+escHTML(title)+'</text>':'')+
      '<circle cx="170" cy="150" r="95" fill="#a78bfa" fill-opacity="0.5" stroke="#5b21b6" stroke-width="2"/>'+
      '<circle cx="250" cy="150" r="95" fill="#fbbf24" fill-opacity="0.5" stroke="#b45309" stroke-width="2"/>'+
      '<circle cx="210" cy="220" r="95" fill="#34d399" fill-opacity="0.5" stroke="#065f46" stroke-width="2"/>'+
      '<text x="130" y="120" text-anchor="middle" font-size="17" fill="#1e1b2e">'+aOnly+'</text>'+
      '<text x="290" y="120" text-anchor="middle" font-size="17" fill="#1e1b2e">'+bOnly+'</text>'+
      '<text x="210" y="270" text-anchor="middle" font-size="17" fill="#1e1b2e">'+cOnly+'</text>'+
      '<text x="210" y="105" text-anchor="middle" font-size="17" fill="#1e1b2e">'+ab+'</text>'+
      '<text x="155" y="200" text-anchor="middle" font-size="17" fill="#1e1b2e">'+ac+'</text>'+
      '<text x="265" y="200" text-anchor="middle" font-size="17" fill="#1e1b2e">'+bc+'</text>'+
      '<text x="210" y="175" text-anchor="middle" font-size="17" fill="#1e1b2e">'+abc+'</text>'+
      '<text x="95" y="55" text-anchor="middle" font-size="14" fill="#3b0764" font-weight="bold">'+escHTML(A)+'</text>'+
      '<text x="325" y="55" text-anchor="middle" font-size="14" fill="#7c2d12" font-weight="bold">'+escHTML(B)+'</text>'+
      '<text x="210" y="310" text-anchor="middle" font-size="14" fill="#065f46" font-weight="bold">'+escHTML(C)+'</text>'+
      '</svg>';
  }
  return svg;
}

/**
 * Task B5: the quick bar and line chart as an svg string, instead of v1's Chart.js canvas (chartGenerate 4874-4898; register row D-W2-8 settled). A new function: nothing above is touched.
 * What it keeps of v1's chart: the purple fill #a78bfa with the border #5b21b6 (1.5 wide), no legend, the title only when one is given, and `beginAtZero: true` on the value axis for
 * BOTH kinds, so a bar always starts at zero (rule 14) and the line's axis includes zero too. The axis is rounded up to nice ticks by charts.ts's vzNice, and the zero baseline is a
 * line of its own (`data-base="1"`) that every bar's edge sits on (`data-bar="1"`); a negative bar hangs below it.
 * A label longer than 22 characters (14 when the bars are crowded; 40 in the description) is cut by character and ends in an ellipsis. Accessible and self-contained: role="img", a <title> and a <desc> naming the values, system fonts only, nothing loaded from outside. Every label and the title go through escHTML.
 * An empty list (v1 refused it with a toast) gives ""; a value that is not a finite number (parseFloat("1e999") is Infinity) is left out, and if none is left the answer is "" too.
 */
export function quickChartSvg(rows: ChartRow[], type: "bar" | "line", title: string): string {
  const pts = rows.filter((r) => Number.isFinite(r.val));
  if (!pts.length) return "";
  const kind = type === "line" ? "Line chart" : "Bar chart";
  const head = title.trim();
  const n = pts.length;
  const vals = pts.map((r) => r.val);
  const lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  const sc = vzNice(lo, hi, 5);
  const W = 560, H = 340, X0 = 54, X1 = W - 16, Y1 = head ? 44 : 20, Y0 = H - 70;
  const r2 = (v: number): number => +v.toFixed(2);
  const y = (v: number): number => r2(Y0 - (v - sc.min) / (sc.max - sc.min) * (Y0 - Y1));
  const yz = y(0);
  const bw = (X1 - X0) / n, cx = (i: number): number => r2(X0 + (i + .5) * bw);
  const fmt = (v: number): string => String(+v.toFixed(4));
  // a cut counts characters, not UTF-16 units, so an emoji is never split; a cut label ends in an ellipsis
  const cutTo = (label: string, n: number): string => { const c = Array.from(label); return c.length > n ? c.slice(0, n).join("") + "…" : label; };
  const shown = pts.slice(0, 20).map((r) => cutTo(r.label, 40) + ": " + fmt(r.val)).join("; ") + (n > 20 ? "; and " + (n - 20) + " more" : "");
  const desc = kind + " of " + n + (n === 1 ? " value" : " values") + ", from " + fmt(Math.min(...vals)) + " to " + fmt(Math.max(...vals)) + ". " + shown + ".";
  let g = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" style="max-width:100%;height:auto" font-family="Arial, Helvetica, sans-serif" role="img" aria-labelledby="qc-title qc-desc">' +
    '<title id="qc-title">' + escHTML(head || kind) + '</title><desc id="qc-desc">' + escHTML(desc) + "</desc>" +
    '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>';
  if (head) g += '<text x="' + W / 2 + '" y="26" text-anchor="middle" font-size="15" font-weight="700" fill="#1a1a1a">' + escHTML(head) + "</text>";
  g += '<line x1="' + X0 + '" y1="' + Y1 + '" x2="' + X0 + '" y2="' + Y0 + '" stroke="#333" stroke-width="1.5"/>';
  for (const v of sc.ticks) {
    const ty = y(v);
    if (v !== 0) g += '<line x1="' + X0 + '" y1="' + ty + '" x2="' + X1 + '" y2="' + ty + '" stroke="#e5e7eb" stroke-width="1"/>';
    g += '<line x1="' + (X0 - 5) + '" y1="' + ty + '" x2="' + X0 + '" y2="' + ty + '" stroke="#333" stroke-width="1.5"/><text x="' + (X0 - 9) + '" y="' + r2(ty + 4) + '" text-anchor="end" font-size="12" fill="#333">' + vzFmt(v, sc.step) + "</text>";
  }
  const bar = type !== "line", barW = r2(Math.min(80, bw * .6)), slant = bw < 60, fs = bw < 30 ? 10 : 11.5, cut = slant ? 14 : 22;
  if (bar) {
    pts.forEach((r, i) => {
      const top = y(r.val);
      g += '<rect data-bar="1" x="' + r2(cx(i) - barW / 2) + '" y="' + Math.min(top, yz) + '" width="' + barW + '" height="' + r2(Math.abs(top - yz)) + '" fill="#a78bfa" stroke="#5b21b6" stroke-width="1.5"/>';
    });
  } else {
    g += '<polyline fill="none" stroke="#5b21b6" stroke-width="2" points="' + pts.map((r, i) => cx(i) + "," + y(r.val)).join(" ") + '"/>';
    pts.forEach((r, i) => { g += '<circle cx="' + cx(i) + '" cy="' + y(r.val) + '" r="4" fill="#a78bfa" stroke="#5b21b6" stroke-width="1.5"/>'; });
  }
  // the zero baseline, over the bars' edges
  g += '<line data-base="1" x1="' + X0 + '" y1="' + yz + '" x2="' + X1 + '" y2="' + yz + '" stroke="#333" stroke-width="1.5"/>';
  if (bw >= 24) pts.forEach((r, i) => {
    const up = r.val >= 0;
    g += '<text x="' + cx(i) + '" y="' + r2(y(r.val) + (up ? -5 : 13)) + '" text-anchor="middle" font-size="11" fill="#1a1a1a">' + fmt(r.val) + "</text>";
  });
  pts.forEach((r, i) => {
    const ly = Y0 + 18, name = escHTML(cutTo(r.label, cut));
    g += slant
      ? '<text x="' + cx(i) + '" y="' + ly + '" transform="rotate(-35 ' + cx(i) + " " + ly + ')" text-anchor="end" font-size="' + fs + '" fill="#1a1a1a">' + name + "</text>"
      : '<text x="' + cx(i) + '" y="' + ly + '" text-anchor="middle" font-size="' + fs + '" fill="#1a1a1a">' + name + "</text>";
  });
  return g + "</svg>";
}
