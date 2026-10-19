import { AIU_MONTHS } from "./data/design-tables";

export { AIU_MONTHS };

/* v1's AI-use statement builder (D2): aiuDate, aiuJoin and aiuInRange (index.html:5461-5467) and aiuBuild (5492-5537). AIU_MONTHS (5461) is emitted from v1 into
   data/design-tables.ts (golden:capture design --emit), never retyped. Not ported: aiuOpen (5468-5477), aiuToggle (5478), aiuRender (5479-5487: the row ticks, the panel's), aiuClear
   (5488-5491) and aiuCopy (5538-); aiuRecord (5453) logs through Phase 2's classifyAiUse (aiuse.ts).
   The strings, branch order and early returns are v1's: aiuDate's regex `^(\d{4})-(\d{2})-(\d{2})$` and `parseInt(m[3],10)+' '+AIU_MONTHS[parseInt(m[2],10)-1]+' '+m[1]` (a month
   out of range prints "undefined", as v1's does), its `String(d||'')` fallback; aiuJoin; aiuInRange's `(!f||e.d>=f)&&(!t||e.d<=t)` string comparison; in aiuBuild the refusal (with
   its `request`/`requests`), the no-use text, the provider and model pairs in first-use order (`PROVIDERS[e.p]?PROVIDERS[e.p].name:e.p`, ` (model)` only when there is a model),
   `on` one date or `between` two (the sorted dates' first and last), `by.g`'s four groups (text, feedback, explain, other; an unknown group counts as other), fmtG's
   `sort((a,b)=>g[b]-g[a])` (stable: equal counts keep first-use order) and `(n request[s])`, the J (journal) phrasings, `other.replace(/[.\s]+$/,'')` and "Outside Appuscholar, " only
   when the log was used, the five tick sentences, the style-profile sentence, the `[Say which passages…]` rule (used, some text help, the reword box not ticked), the thesis count
   sentence (with v1's "1 request were logged"), the closing sentence and the head by format.
   What differs from v1's text:
   - types and `export`; aiuDate takes `d` (v1: the same), aiuInRange takes the log and the two date strings (v1 reads `aiuLog()`, #aiuFrom and #aiuTo);
   - aiuBuild takes AiuInput: `list` is what aiuInRange returned (5493), `keep` the data-k of every ticked .aiuRow (5494), `other` #aiuOther's raw value (trimmed here, as 5496 does),
     `fmt` #aiuFmt (course, thesis or journal), `ticks` the five checkboxes (own #aiuOwn, reword #aiuReword, cite #aiuCite, facts #aiuFacts, noData #aiuNoData; v1's `ck(id)`),
     `style` the writing-style profile (on: styleIsOn(), decl: styleMeta().decl, samples: styleSamples().length; register row D-W2-13) and `providers` the provider table v1 reads
     as PROVIDERS (the panel passes providers.ts's);
   - `showToast(m);return` becomes `{ refuse: m }` and `out.value=…` becomes `{ text }`; v1's try/catch around the style sentence guards styleMeta and styleSamples, which read
     storage; here the three values are plain inputs, so there is no try, and `styleIsOn()&&sm.decl&&ss.length` reads `sm.on&&sm.decl&&n` with `n` for `ss.length`;
   - `const me=J?'the author':'I'` (5512), declared and never read, is dropped (no-unused-vars); `let first` is a `const` (prefer-const); `by.g[e.g]||by.g.other` and the `g[k]` reads
     carry the `!` of noUncheckedIndexedAccess. */

export type AiuEntry = { d: string; p: string; m: string; k: string; g: string };
export type AiuTicks = { own: boolean; reword: boolean; cite: boolean; facts: boolean; noData: boolean };
export type AiuStyle = { on: boolean; decl: string; samples: number };
export type AiuInput = {
  list: AiuEntry[]; keep: Record<string, 1>; other: string; fmt: "course" | "thesis" | "journal" | string; ticks: AiuTicks; style: AiuStyle; providers: Record<string, { name: string }>;
};
export type AiuBuilt = { text: string } | { refuse: string };

export function aiuDate(d: string | null | undefined): string {const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d||'');return m?(parseInt(m[3]!,10)+' '+AIU_MONTHS[parseInt(m[2]!,10)-1]+' '+m[1]):String(d||'')}
export function aiuJoin(a: readonly string[]): string {return a.length<2?(a[0]||''):a.slice(0,-1).join(', ')+' and '+a[a.length-1]}
export function aiuInRange(log: readonly AiuEntry[], from: string, to: string): AiuEntry[] {
  const f=from||'',t=to||'';
  return log.filter(e=>(!f||e.d>=f)&&(!t||e.d<=t));
}

export function aiuBuild(i: AiuInput): AiuBuilt {
  const list=i.list,PROVIDERS=i.providers;
  const keep=i.keep;
  const use=list.filter(e=>keep[e.k]);
  const other=i.other.trim();
  const fmt=i.fmt;
  if(list.length&&!use.length&&!other){return {refuse:'The log shows '+list.length+' request'+(list.length===1?'':'s')+' in these dates. Tick them, or change the dates, before you say that no AI was used.'}}
  const J=fmt==='journal';
  if(!use.length&&!other){
    return {text:'Use of AI tools\n\n'+(J?'The author did not use AI tools in preparing this work.':'I did not use AI tools to prepare this work.')+'\n\n[Check this against your own records. The log only knows about Appuscholar in this browser.]'};
  }
  const pairs: Record<string, 1>={},pl: string[]=[];
  use.forEach(e=>{const key=e.p+'|'+e.m;if(!pairs[key]){pairs[key]=1;pl.push((PROVIDERS[e.p]?PROVIDERS[e.p]!.name:e.p)+(e.m?' ('+e.m+')':''))}});
  const dates=use.map(e=>e.d).sort(),d1=dates[0],d2=dates[dates.length-1];
  const when=!use.length?'':(d1===d2?'on '+aiuDate(d1):'between '+aiuDate(d1)+' and '+aiuDate(d2));
  const by: { g: Record<string, Record<string, number>> }={g:{text:{},feedback:{},explain:{},other:{}}};
  use.forEach(e=>{const g=by.g[e.g]||by.g.other!;g[e.k]=(g[e.k]||0)+1});
  const fmtG=(g: Record<string, number>)=>aiuJoin(Object.keys(g).sort((a,b)=>g[b]!-g[a]!).map(k=>k+' ('+g[k]+' request'+(g[k]===1?'':'s')+')'));
  const My=J?'the author\'s':'my',Me=J?'the author':'me';
  const parts: string[]=[];
  if(use.length){
    const first=(J?'During the preparation of this work the author used ':'I used ')+'Appuscholar, a writing assistant that runs in the browser and sends requests to '+aiuJoin(pl)+', '+when+'.';
    parts.push(first);
    if(Object.keys(by.g.text!).length)parts.push('The AI produced or reworded text for '+Me+' in these ways: '+fmtG(by.g.text!)+'.');
    if(Object.keys(by.g.feedback!).length)parts.push('The AI commented on '+My+' work or ideas without writing them: '+fmtG(by.g.feedback!)+'.');
    if(Object.keys(by.g.explain!).length)parts.push('The AI explained or summarised material for '+Me+': '+fmtG(by.g.explain!)+'.');
    if(Object.keys(by.g.other!).length)parts.push('The AI helped in other ways: '+fmtG(by.g.other!)+'.');
  }
  if(other)parts.push((use.length?'Outside Appuscholar, ':'')+(J?'the author':'I')+' also used '+other.replace(/[.\s]+$/,'')+'.');
  const o: string[]=[];
  if(i.ticks.own)o.push(J?'The author planned the argument and the structure.':'I planned the argument and the structure myself.');
  if(i.ticks.reword)o.push(J?'Any AI wording was rewritten by the author.':'I rewrote any AI wording in my own words before using it.');
  if(i.ticks.cite)o.push(J?'Every citation was checked against the original source.':'I checked every citation against the original source.');
  if(i.ticks.facts)o.push(J?'Every number and claim was checked against the data and the sources.':'I checked every number and claim against my data and my sources.');
  if(i.ticks.noData)o.push(J?'No participant names or identifying details were sent to an AI tool.':'I did not send participant names or identifying details to any AI tool.');
  const sm=i.style,n=sm.samples;
  if(sm.on&&sm.decl&&n&&use.length)parts.push((J?'A profile of the author\'s own writing style, built from '+n+' sample'+(n===1?'':'s')+' that the author declared as their own work on '+aiuDate(sm.decl)+', was used to match the wording of AI suggestions.':'A profile of my own writing style, built from '+n+' sample'+(n===1?'':'s')+' that I declared as my own work on '+aiuDate(sm.decl)+', was used to match the wording of AI suggestions.'));
  if(o.length)parts.push(o.join(' '));
  if(use.length&&Object.keys(by.g.text!).length&&!i.ticks.reword)parts.push('[Say which passages still contain AI wording, since you did not tick that you rewrote it.]');
  if(fmt==='thesis'&&use.length)parts.push('In all, '+use.length+' request'+(use.length===1?'':'s')+' were logged. The log is kept in my browser and I can show it to my supervisor on request.');
  parts.push(J?'After using the tool the author reviewed and edited the output and takes full responsibility for the content of the publication. No AI tool is listed as an author.':'AI is not an author of this work. I am responsible for everything in it.');
  const head=fmt==='journal'?'Declaration of AI use':(fmt==='thesis'?'Statement on the use of AI':'AI-use statement');
  return {text:head+'\n\n'+parts.join(' ')+'\n\n[Your institution or the journal decides what you must disclose. Edit this text so that it is true.]'};
}
