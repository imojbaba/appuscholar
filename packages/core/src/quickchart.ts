import { escHTML } from "./html";

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
