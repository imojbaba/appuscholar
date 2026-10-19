import { pFromT, normalCDF } from "./pvalue";
import { smean, ssd } from "./statsmath";
import type { ParsedData } from "./intake";
import type { StatsBlock } from "./stats-core";
import { VZ_COL, VZ_GRAY, VZ_I18N } from "./data/chart-tables";

export { VZ_COL, VZ_GRAY, VZ_I18N };

/* v1's Chart Studio (S8, the "Research figures" dialog), the compute half: the palettes and helpers (index.html:3642-3667: VZ_COL, VZ_GRAY, vzEsc, vzQuant, vzTCrit, vzQNorm, vzNice,
   vzFmt, vzSummary), vzGroups (3668-3675), the defaults vzSync writes into the axis labels (3702-3704) and vzDefaults (3708-3721), vzCaption (3738-3742), the frame, axes and table
   (3743-3782: vzFrame, vzSvgOpen, vzYAxis, vzXLabel, vzScaleY, vzJit, vzTableHTML, vzCatLabel) and the four charts (3783-3878: vzBox, vzBar, vzHist, vzQQ). VZ_COL, VZ_GRAY and every `vz_*`
   string of I18N.en and I18N.hi (2101, 2330) are emitted from v1 into data/chart-tables.ts (golden:capture charts --emit), never retyped.
   Not ported (page code): VZ (3642's state object), vzPalette's read of #vzPal (3645; vzPalette here takes the options), vzLoad (3676-3689: parses #vzPaste with statsParseText and
   fills the column selects, whose "no grouping" option is t('vz_none')), t0, vzUseLab, vzOpen, the show/hide half of vzSync (3698-3706), the input listener that sets dataset.touched (3707), vzDraw
   (3722-3737: reads the dialog, writes #vzOut, #vzTable and #vzWarn, or the vz_nodata message when vzGroups gives nothing), and vzImgHTML, vzInsert, vzDownload (3879-3907: rasterise
   the SVG and insert or download it; register row D-W2-9).
   The strings, arithmetic, literals and branch order are v1's: the SVG's attribute order and every literal (font-size="12.5", r="3.2", fill-opacity=".55" and ".45", r="3.8",
   `Math.min(90,bw*.5)`, `bx*.25`, `bx*.9`, the 640 by 420 frame with margins 64, 20, 44 or 20, and 62, 70 or 56), every coordinate concatenated raw as v1 prints it (only the histogram's
   curve goes through toFixed(1)), vzJit's 12.9898, 78.233 and 43758.5453, vzNice's 1e-9 and `+v.toFixed(10)`, vzScaleY's rules (zero for bars, the typed limits, `max=min+1`, ticks kept
   within 1e-9), vzTCrit's 60 and vzQNorm's 70 bisections, the histogram's `Math.max(5,Math.ceil(Math.log2(n)+1))` bins, its 80-point curve and its skew Σ((x − m)/s)³/n (register row
   F16), vzQNorm((i+0.5)/n) in the Q-Q plot and its line through the quartiles, vzBox's `if(s.out.indexOf(v)>=0&&false)return;` (a dead branch, so every point is drawn, outliers too),
   vzGroups' `map` object and `order` array (data order; a group named like an Object.prototype member, such as constructor, makes `map[k].push` throw, as in v1), vzEsc (v1's own escape,
   which leaves `'` alone, unlike escHTML).
   What differs from v1's text:
   - types, `export`, and `!` on indexed reads (noUncheckedIndexedAccess), `counts[b]!++` among them;
   - every read of the dialog becomes a parameter: vzGroups(data, yIdx, gIdx) takes the parsed data (v1: VZ.data) and the column indexes (v1: `parseInt(#vzY.value,10)` and #vzG.value,
     whose '' is gIdx null); the charts take VzOptions, whose fields are #vzType, #vzPal ('gray' or anything else, which v1's option calls 'colour': only `==='gray'` is tested), the
     title (#vzTitle when #vzTitleIn is ticked, else ''), #vzPts, #vzN, #vzErr, #vzBins, #vzYMin, #vzYMax, #vzYL and #vzXL; vzScaleY takes yMin and yMax; vzDefaults(type, yName, gName,
     err, showPts) takes the score column's name (v1: the #vzY option's text, `||'score'`), the grouping column's name ('' when none is picked), #vzErr and #vzPts, and returns
     `{ title, note }` (v1 writes them into #vzTitle and #vzNote when the student has not typed there); vzAxisDefaults(type, yName, gLabel) is the half of vzSync that fills #vzYL and
     #vzXL, where gLabel is the grouping select's text (the panel's t('vz_none') when none is picked); vzCaption(fig, title, note) takes #vzFig, #vzTitle and #vzNote;
   - `t(key)` is the parameter `tr`: the caller resolves `vz_*` keys in the student's language (v1's t() falls back to I18N.en, then to the key);
   - vzTableHTML becomes vzTableBlock, a table block whose first row is the header cells and then one row per group, each cell the string v1 put between the tags (vzEsc'd text, the n,
     the six toFixed(2) numbers); each chart returns `{ svg, table, warn? }` where `table` is v1's `key+vzTableHTML(rows)` as blocks: the `<p class="desc" style="margin:6px 0">` key a note
     of its innerHTML (vzKey(text), the note of vzEsc(text)), then the table block; vzBar returns `warn` ('' when there is none, as v1 does) and vzBox, vzHist and vzQQ none;
   - vzChart(o, gs, tr) is vzDraw's dispatch `{box:vzBox,bar:vzBar,hist:vzHist,qq:vzQQ}[ty]`, and returns null where vzDraw shows vz_nodata (no groups);
   - vzHist's `a` (#vzYMin, read and never used: the histogram's axis starts at 0) is dropped (no-unused-vars); `new Array(k).fill(0)` is typed `new Array<number>(k)`. */

export type VzType = "box" | "bar" | "hist" | "qq";
export type VzOptions = {
  type: VzType; palette: "color" | "gray"; title: string; showPts: boolean; showN: boolean; err: "none" | "ci" | "sd" | "se"; bins: string; yMin: string; yMax: string; yLabel: string; xLabel: string;
};
export type VzGroup = { name: string; vals: number[] };
export type VzSummary = {
  n: number; mean: number; sd: number; se: number; ci: number; median: number; q1: number; q3: number; min: number; max: number; wlo: number; whi: number; out: number[]; sorted: number[];
};
export type VzScale = { min: number; max: number; ticks: number[]; step: number };
export type VzFrame = { W: number; H: number; X0: number; X1: number; Y0: number; Y1: number; ml: number; mt: number; mb: number };
export type VzChart = { svg: string; table: StatsBlock[]; warn?: string };
export type VzTr = (key: string) => string;
type VzRow = { name: string; s: VzSummary };

export function vzPalette(o: Pick<VzOptions, "palette">): readonly string[] {return o.palette==='gray'?VZ_GRAY:VZ_COL}
export function vzEsc(x: unknown): string {return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
export function vzQuant(sorted: number[],p: number): number {const n=sorted.length;if(n===1)return sorted[0]!;const h=(n-1)*p,lo=Math.floor(h),hi=Math.ceil(h);return sorted[lo]!+(h-lo)*(sorted[hi]!-sorted[lo]!)}
export function vzTCrit(df: number): number {if(df<1)return NaN;let lo=0,hi=200;for(let i=0;i<60;i++){const m=(lo+hi)/2;if(pFromT(m,df)>0.05)lo=m;else hi=m}return (lo+hi)/2}
export function vzQNorm(p: number): number {let lo=-9,hi=9;for(let i=0;i<70;i++){const m=(lo+hi)/2;if(normalCDF(m)<p)lo=m;else hi=m}return (lo+hi)/2}
export function vzNice(min: number,max: number,n: number): VzScale {
  if(!(max>min)){min-=1;max+=1}
  const span=max-min,s0=span/(n||5),mag=Math.pow(10,Math.floor(Math.log10(s0))),nm=s0/mag;
  const step=(nm<1.5?1:nm<3?2:nm<7?5:10)*mag;
  const lo=Math.floor(min/step+1e-9)*step,hi=Math.ceil(max/step-1e-9)*step,ticks=[];
  for(let v=lo;v<=hi+step/2;v+=step)ticks.push(+v.toFixed(10));
  return{min:lo,max:hi,ticks:ticks,step:step};
}
export function vzFmt(v: number,step: number): string {const d=step>=1?0:Math.min(4,Math.ceil(-Math.log10(step)));return v.toFixed(d)}
export function vzSummary(vals: number[]): VzSummary {
  const s=vals.slice().sort((a,b)=>a-b),n=s.length,m=smean(s),sd=n>1?ssd(s):0;
  const q1=vzQuant(s,.25),q3=vzQuant(s,.75),iqr=q3-q1;
  const loF=q1-1.5*iqr,hiF=q3+1.5*iqr;
  const inside=s.filter(v=>v>=loF&&v<=hiF),out=s.filter(v=>v<loF||v>hiF);
  const se=n>1?sd/Math.sqrt(n):0,ci=n>1?vzTCrit(n-1)*se:0;
  return{n:n,mean:m,sd:sd,se:se,ci:ci,median:vzQuant(s,.5),q1:q1,q3:q3,min:s[0]!,max:s[n-1]!,
    wlo:inside.length?inside[0]!:s[0]!,whi:inside.length?inside[inside.length-1]!:s[n-1]!,out:out,sorted:s};
}
export function vzGroups(data: ParsedData,yIdx: number,gIdx: number | null): VzGroup[] {
  const d=data,y=yIdx;
  if(isNaN(y))return[];
  if(gIdx===null){const v=d.rows.map(r=>parseFloat(r[y] as string)).filter(x=>!isNaN(x));return v.length?[{name:'All',vals:v}]:[]}
  const gi=gIdx,map: Record<string, number[]>={},order: string[]=[];
  d.rows.forEach(r=>{const k=r[gi],v=parseFloat(r[y] as string);if(k===undefined||k===''||isNaN(v))return;if(!map[k]){map[k]=[];order.push(k)}map[k]!.push(v)});
  return order.map(k=>({name:k,vals:map[k]!}));
}
/** The axis labels vzSync writes into #vzYL and #vzXL while the student has not typed there (3702-3704): `yName` is the score select's text, `gLabel` the grouping select's. */
export function vzAxisDefaults(type: VzType,yName: string,gLabel: string): { yl: string; xl: string } {
  const ty=type,yn=yName||'';
  const yl=ty==='hist'?yn:(ty==='qq'?'Sample quantiles':yn);
  const xl=ty==='hist'?yn:(ty==='qq'?'Theoretical quantiles (z)':gLabel||'');
  return{yl:yl,xl:xl};
}
export function vzDefaults(type: VzType,yName: string,gName: string,err: string,showPts: boolean): { title: string; note: string } {
  const ty=type,y=yName||'score';
  const g=ty==='box'||ty==='bar'?gName:'';
  const ti=ty==='box'?'Distribution of '+y+(g?' by '+g:''):ty==='bar'?'Mean '+y+(g?' by '+g:''):ty==='hist'?'Distribution of '+y:'Normal Q-Q plot of '+y;
  const ebn=({ci:'95% confidence intervals',sd:'standard deviations',se:'standard errors'} as Record<string, string>)[err];
  const no=ty==='box'?'Boxes show the median and interquartile range. Whiskers reach the most extreme values within 1.5 times the interquartile range. Each point is one participant.'
    :ty==='bar'?'Bars show means.'+(ebn?' Error bars show '+ebn+'.':'')+(showPts?' Each point is one participant.':'')
    :ty==='hist'?'The dashed curve is a normal distribution with the same mean and standard deviation as the data.'
    :'Points close to the line indicate a distribution close to normal.';
  return{title:ti,note:no};
}
export function vzCaption(fig: string,title: string,note: string): { n: number; title: string; note: string } {
  const n=parseInt(fig,10)||1,ti=title.trim(),no=note.trim();
  return{n:n,title:ti,note:no};
}
/* shared frame: returns helpers for one figure */
export function vzFrame(o: { w?: number; h?: number; title?: string; mb?: number }): VzFrame {
  const W=o.w||640,H=o.h||420,ml=64,mr=20,mt=o.title?44:20,mb=o.mb||62;
  const X0=ml,X1=W-mr,Y0=H-mb,Y1=mt;
  return{W:W,H:H,X0:X0,X1:X1,Y0:Y0,Y1:Y1,ml:ml,mt:mt,mb:mb};
}
export function vzSvgOpen(F: VzFrame,aria: string,title: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+F.W+' '+F.H+'" width="'+F.W+'" height="'+F.H+'" style="max-width:100%;height:auto" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="'+vzEsc(aria)+'"><rect width="'+F.W+'" height="'+F.H+'" fill="#ffffff"/>'+
    (title?'<text x="'+(F.W/2)+'" y="26" text-anchor="middle" font-size="15" font-weight="700" fill="#1a1a1a">'+vzEsc(title)+'</text>':'');
}
export function vzYAxis(F: VzFrame,sc: VzScale,label: string): string {
  let g='<line x1="'+F.X0+'" y1="'+F.Y1+'" x2="'+F.X0+'" y2="'+F.Y0+'" stroke="#333" stroke-width="1.5"/>';
  sc.ticks.forEach(v=>{const y=F.Y0-(v-sc.min)/(sc.max-sc.min)*(F.Y0-F.Y1);
    g+='<line x1="'+(F.X0-5)+'" y1="'+y+'" x2="'+F.X0+'" y2="'+y+'" stroke="#333" stroke-width="1.5"/><text x="'+(F.X0-9)+'" y="'+(y+4)+'" text-anchor="end" font-size="12" fill="#333">'+vzFmt(v,sc.step)+'</text>'});
  if(label)g+='<text transform="rotate(-90)" x="'+(-(F.Y0+F.Y1)/2)+'" y="16" text-anchor="middle" font-size="13" fill="#1a1a1a">'+vzEsc(label)+'</text>';
  return g;
}
export function vzXLabel(F: VzFrame,label: string): string {return label?'<text x="'+((F.X0+F.X1)/2)+'" y="'+(F.H-8)+'" text-anchor="middle" font-size="13" fill="#1a1a1a">'+vzEsc(label)+'</text>':''}
export function vzScaleY(vals: number[],zero: boolean,yMin: string,yMax: string): VzScale {
  let lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals);
  if(zero){lo=Math.min(0,lo);hi=Math.max(0,hi)}
  const sc=vzNice(lo,hi,6);
  const a=yMin,b=yMax;
  if(a!==''&&!isNaN(parseFloat(a)))sc.min=parseFloat(a);
  if(b!==''&&!isNaN(parseFloat(b)))sc.max=parseFloat(b);
  if(!(sc.max>sc.min))sc.max=sc.min+1;
  sc.ticks=sc.ticks.filter(v=>v>=sc.min-1e-9&&v<=sc.max+1e-9);
  return sc;
}
export function vzJit(i: number,k: number): number {const h=Math.sin((i+1)*12.9898+(k+1)*78.233)*43758.5453;return (h-Math.floor(h))-0.5}
export function vzTableBlock(rows: VzRow[],tr: VzTr): StatsBlock {
  const h: string[][]=[[vzEsc(tr('vz_th_group')),'n','M','SD','Mdn','Q1','Q3','Min','Max']];
  rows.forEach(r=>{const s=r.s;h.push([vzEsc(r.name),''+s.n,s.mean.toFixed(2),s.sd.toFixed(2),s.median.toFixed(2),s.q1.toFixed(2),s.q3.toFixed(2),s.min.toFixed(2),s.max.toFixed(2)])});
  return{kind:'table',rows:h};
}
export function vzCatLabel(F: VzFrame,i: number,bw: number,name: string,n: number,showN: boolean): string {
  const cx=F.X0+(i+.5)*bw;
  let t1='<text x="'+cx+'" y="'+(F.Y0+18)+'" text-anchor="middle" font-size="12.5" fill="#1a1a1a">'+vzEsc(String(name).slice(0,22))+'</text>';
  if(showN)t1+='<text x="'+cx+'" y="'+(F.Y0+33)+'" text-anchor="middle" font-size="11.5" fill="#555">n = '+n+'</text>';
  return t1;
}
const vzKey=(text: string): StatsBlock=>({kind:'note',html:vzEsc(text)});
export function vzBox(gs: VzGroup[],o: VzOptions,tr: VzTr): VzChart {
  const title=o.title,pal=vzPalette(o),showPts=o.showPts,showN=o.showN;
  const rows=gs.map(g=>({name:g.name,s:vzSummary(g.vals)}));
  const all: number[]=[];rows.forEach(r=>r.s.sorted.forEach(v=>all.push(v)));
  const sc=vzScaleY(all,false,o.yMin,o.yMax),F=vzFrame({title:title,mb:showN?70:56});
  const yp=(v: number)=>F.Y0-(v-sc.min)/(sc.max-sc.min)*(F.Y0-F.Y1);
  const bw=(F.X1-F.X0)/rows.length,bx=Math.min(90,bw*.5);
  let g=vzSvgOpen(F,'Box plot of '+(o.yLabel||'scores'),title)+vzYAxis(F,sc,o.yLabel);
  g+='<line x1="'+F.X0+'" y1="'+F.Y0+'" x2="'+F.X1+'" y2="'+F.Y0+'" stroke="#333" stroke-width="1.5"/>';
  rows.forEach((r,i)=>{
    const s=r.s,c=pal[i%pal.length]!,cx=F.X0+(i+.5)*bw,stroke=pal===VZ_GRAY?'#1a1a1a':c;
    g+='<line x1="'+cx+'" y1="'+yp(s.wlo)+'" x2="'+cx+'" y2="'+yp(s.q1)+'" stroke="'+stroke+'" stroke-width="2"/><line x1="'+cx+'" y1="'+yp(s.q3)+'" x2="'+cx+'" y2="'+yp(s.whi)+'" stroke="'+stroke+'" stroke-width="2"/>';
    g+='<line x1="'+(cx-bx*.25)+'" y1="'+yp(s.wlo)+'" x2="'+(cx+bx*.25)+'" y2="'+yp(s.wlo)+'" stroke="'+stroke+'" stroke-width="2"/><line x1="'+(cx-bx*.25)+'" y1="'+yp(s.whi)+'" x2="'+(cx+bx*.25)+'" y2="'+yp(s.whi)+'" stroke="'+stroke+'" stroke-width="2"/>';
    g+='<rect x="'+(cx-bx/2)+'" y="'+yp(s.q3)+'" width="'+bx+'" height="'+Math.max(1,yp(s.q1)-yp(s.q3))+'" fill="'+c+'" fill-opacity="'+(pal===VZ_GRAY?1:.25)+'" stroke="'+stroke+'" stroke-width="2" rx="2"/>';
    g+='<line x1="'+(cx-bx/2)+'" y1="'+yp(s.median)+'" x2="'+(cx+bx/2)+'" y2="'+yp(s.median)+'" stroke="#1a1a1a" stroke-width="3"/>';
    s.out.forEach(v=>{g+='<circle cx="'+cx+'" cy="'+yp(v)+'" r="4" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/>'});
    if(showPts)r.s.sorted.forEach((v,k)=>{if(s.out.indexOf(v)>=0&&false)return;g+='<circle cx="'+(cx+vzJit(k,i)*bx*.9)+'" cy="'+yp(v)+'" r="3.2" fill="'+(pal===VZ_GRAY?'#111':c)+'" fill-opacity=".55" stroke="#fff" stroke-width=".8"/>'});
    g+='<path d="M'+cx+' '+(yp(s.mean)-5)+' l5 5 l-5 5 l-5 -5 z" fill="#fff" stroke="#1a1a1a" stroke-width="1.6"/>';
    g+=vzCatLabel(F,i,bw,r.name,s.n,showN);
  });
  g+=vzXLabel(F,o.xLabel)+'</svg>';
  const key=vzKey(tr('vz_box_key'));
  return{svg:g,table:[key,vzTableBlock(rows,tr)]};
}
export function vzBar(gs: VzGroup[],o: VzOptions,tr: VzTr): VzChart {
  const title=o.title,pal=vzPalette(o),showPts=o.showPts,showN=o.showN,err=o.err;
  const rows=gs.map(g=>({name:g.name,s:vzSummary(g.vals)}));
  const eb=(s: VzSummary)=>err==='ci'?s.ci:err==='sd'?s.sd:err==='se'?s.se:0;
  const all: number[]=[];rows.forEach(r=>{all.push(r.s.mean+eb(r.s));all.push(Math.max(r.s.mean-eb(r.s),0));if(showPts)r.s.sorted.forEach(v=>all.push(v))});
  const sc=vzScaleY(all.concat([0]),true,o.yMin,o.yMax),F=vzFrame({title:title,mb:showN?70:56});
  let warn='';
  const mn=o.yMin;
  if(mn!==''&&parseFloat(mn)>0)warn=tr('vz_bar_zero');
  const yp=(v: number)=>F.Y0-(v-sc.min)/(sc.max-sc.min)*(F.Y0-F.Y1);
  const bw=(F.X1-F.X0)/rows.length,bx=Math.min(90,bw*.5);
  let g=vzSvgOpen(F,'Bar chart of means of '+(o.yLabel||'scores'),title)+vzYAxis(F,sc,o.yLabel);
  rows.forEach((r,i)=>{
    const s=r.s,c=pal[i%pal.length]!,cx=F.X0+(i+.5)*bw,top=yp(s.mean),base=yp(Math.max(sc.min,0));
    g+='<rect x="'+(cx-bx/2)+'" y="'+Math.min(top,base)+'" width="'+bx+'" height="'+Math.max(1,Math.abs(base-top))+'" fill="'+c+'" stroke="'+(pal===VZ_GRAY?'#1a1a1a':'none')+'" rx="3"/>';
    const e=eb(s);
    if(e>0){g+='<line x1="'+cx+'" y1="'+yp(s.mean-e)+'" x2="'+cx+'" y2="'+yp(s.mean+e)+'" stroke="#1a1a1a" stroke-width="2"/><line x1="'+(cx-8)+'" y1="'+yp(s.mean+e)+'" x2="'+(cx+8)+'" y2="'+yp(s.mean+e)+'" stroke="#1a1a1a" stroke-width="2"/><line x1="'+(cx-8)+'" y1="'+yp(s.mean-e)+'" x2="'+(cx+8)+'" y2="'+yp(s.mean-e)+'" stroke="#1a1a1a" stroke-width="2"/>'}
    if(showPts)s.sorted.forEach((v,k)=>{g+='<circle cx="'+(cx+vzJit(k,i)*bx*.9)+'" cy="'+yp(v)+'" r="3.2" fill="#1a1a1a" fill-opacity=".45" stroke="#fff" stroke-width=".8"/>'});
    g+=vzCatLabel(F,i,bw,r.name,s.n,showN);
  });
  g+='<line x1="'+F.X0+'" y1="'+yp(Math.max(sc.min,0))+'" x2="'+F.X1+'" y2="'+yp(Math.max(sc.min,0))+'" stroke="#333" stroke-width="1.5"/>';
  g+=vzXLabel(F,o.xLabel)+'</svg>';
  const key=vzKey(tr(err==='none'?'vz_bar_key_none':'vz_bar_key_'+err));
  return{svg:g,table:[key,vzTableBlock(rows,tr)],warn:warn};
}
export function vzHist(gs: VzGroup[],o: VzOptions,tr: VzTr): VzChart {
  const title=o.title,pal=vzPalette(o);
  const vals: number[]=[];gs.forEach(g=>g.vals.forEach(v=>vals.push(v)));
  const s=vzSummary(vals),n=vals.length;
  let k=parseInt(o.bins,10);
  if(!(k>=3))k=Math.max(5,Math.ceil(Math.log2(n)+1));
  const xs=vzNice(s.min,s.max,k>10?10:Math.max(4,k)),lo=Math.min(xs.min,s.min),hi=Math.max(xs.max,s.max),bwid=(hi-lo)/k||1;
  const counts=new Array<number>(k).fill(0);
  vals.forEach(v=>{let b=Math.floor((v-lo)/bwid);if(b>=k)b=k-1;if(b<0)b=0;counts[b]!++});
  const curve: Array<[number, number]>=[];
  if(s.sd>0)for(let i=0;i<=80;i++){const x=lo+(hi-lo)*i/80,pdf=Math.exp(-0.5*Math.pow((x-s.mean)/s.sd,2))/(s.sd*Math.sqrt(2*Math.PI));curve.push([x,n*bwid*pdf])}
  const ymaxData=Math.max.apply(null,counts.concat(curve.map(p=>p[1])));
  const ysc=vzNice(0,ymaxData,5);
  const b=o.yMax;
  if(b!==''&&!isNaN(parseFloat(b)))ysc.max=parseFloat(b);
  ysc.min=0;ysc.ticks=ysc.ticks.filter(v=>v<=ysc.max+1e-9);
  const F=vzFrame({title:title});
  const xp=(v: number)=>F.X0+(v-lo)/(hi-lo)*(F.X1-F.X0),yp=(v: number)=>F.Y0-(v-ysc.min)/(ysc.max-ysc.min)*(F.Y0-F.Y1);
  let g=vzSvgOpen(F,'Histogram of '+(o.xLabel||'scores'),title)+vzYAxis(F,ysc,'Frequency');
  g+='<line x1="'+F.X0+'" y1="'+F.Y0+'" x2="'+F.X1+'" y2="'+F.Y0+'" stroke="#333" stroke-width="1.5"/>';
  counts.forEach((c,i)=>{const x0=xp(lo+i*bwid),x1=xp(lo+(i+1)*bwid);
    g+='<rect x="'+(x0+1)+'" y="'+yp(c)+'" width="'+Math.max(1,x1-x0-2)+'" height="'+Math.max(0,F.Y0-yp(c))+'" fill="'+pal[0]+'" fill-opacity="'+(pal===VZ_GRAY?1:.8)+'" stroke="'+(pal===VZ_GRAY?'#1a1a1a':'none')+'" rx="2"/>'});
  if(curve.length)g+='<polyline fill="none" stroke="#1a1a1a" stroke-width="2" stroke-dasharray="6 4" points="'+curve.map(p=>xp(p[0]).toFixed(1)+','+yp(Math.min(p[1],ysc.max)).toFixed(1)).join(' ')+'"/>';
  const xt=vzNice(lo,hi,6);
  xt.ticks.forEach(v=>{if(v<lo-1e-9||v>hi+1e-9)return;const x=xp(v);g+='<line x1="'+x+'" y1="'+F.Y0+'" x2="'+x+'" y2="'+(F.Y0+5)+'" stroke="#333" stroke-width="1.5"/><text x="'+x+'" y="'+(F.Y0+19)+'" text-anchor="middle" font-size="12" fill="#333">'+vzFmt(v,xt.step)+'</text>'});
  g+=vzXLabel(F,o.xLabel)+'</svg>';
  const skew=(function(){if(n<3||s.sd===0)return 0;let m3=0;vals.forEach(v=>{m3+=Math.pow((v-s.mean)/s.sd,3)});return m3/n})();
  const note=vzKey(tr('vz_hist_key').replace('{s}',skew.toFixed(2)));
  return{svg:g,table:[note,vzTableBlock([{name:'All',s:s}],tr)]};
}
export function vzQQ(gs: VzGroup[],o: VzOptions,tr: VzTr): VzChart {
  const title=o.title,pal=vzPalette(o);
  const vals: number[]=[];gs.forEach(g=>g.vals.forEach(v=>vals.push(v)));
  const s=vzSummary(vals),n=s.n,srt=s.sorted;
  const th=srt.map((_,i)=>vzQNorm((i+0.5)/n));
  const xs=vzNice(Math.min.apply(null,th),Math.max.apply(null,th),6),ys=vzNice(srt[0]!,srt[n-1]!,6);
  const F=vzFrame({title:title});
  const xp=(v: number)=>F.X0+(v-xs.min)/(xs.max-xs.min)*(F.X1-F.X0),yp=(v: number)=>F.Y0-(v-ys.min)/(ys.max-ys.min)*(F.Y0-F.Y1);
  let g=vzSvgOpen(F,'Normal Q-Q plot',title)+vzYAxis(F,ys,o.yLabel);
  g+='<line x1="'+F.X0+'" y1="'+F.Y0+'" x2="'+F.X1+'" y2="'+F.Y0+'" stroke="#333" stroke-width="1.5"/>';
  xs.ticks.forEach(v=>{const x=xp(v);g+='<line x1="'+x+'" y1="'+F.Y0+'" x2="'+x+'" y2="'+(F.Y0+5)+'" stroke="#333" stroke-width="1.5"/><text x="'+x+'" y="'+(F.Y0+19)+'" text-anchor="middle" font-size="12" fill="#333">'+vzFmt(v,xs.step)+'</text>'});
  const z1=vzQNorm(.25),z3=vzQNorm(.75),slope=(s.q3-s.q1)/(z3-z1),icpt=s.q1-slope*z1;
  g+='<clipPath id="vzqqclip"><rect x="'+F.X0+'" y="'+F.Y1+'" width="'+(F.X1-F.X0)+'" height="'+(F.Y0-F.Y1)+'"/></clipPath><line clip-path="url(#vzqqclip)" x1="'+xp(xs.min)+'" y1="'+yp(icpt+slope*xs.min)+'" x2="'+xp(xs.max)+'" y2="'+yp(icpt+slope*xs.max)+'" stroke="#1a1a1a" stroke-width="2" stroke-dasharray="6 4"/>';
  srt.forEach((v,i)=>{g+='<circle cx="'+xp(th[i]!)+'" cy="'+yp(v)+'" r="3.8" fill="'+pal[0]+'" fill-opacity=".8" stroke="#fff" stroke-width=".8"/>'});
  g+=vzXLabel(F,o.xLabel)+'</svg>';
  return{svg:g,table:[vzKey(tr('vz_qq_key')),vzTableBlock([{name:'All',s:s}],tr)]};
}
/** vzDraw's dispatch (3727-3731): null where vzDraw shows t('vz_nodata') instead of a chart (no groups). */
export function vzChart(o: VzOptions,gs: VzGroup[],tr: VzTr): VzChart | null {
  const fn={box:vzBox,bar:vzBar,hist:vzHist,qq:vzQQ}[o.type];
  if(!gs.length)return null;
  return fn(gs,o,tr);
}
