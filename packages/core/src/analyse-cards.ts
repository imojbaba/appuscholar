/* The walk-through's reply, the paper card's text and "📊 My paper cards side by side" of v1's Analyse a paper ("Analyse a paper (Version 30)" and "paper cards side by side (Version 35)",
   index.html build 2026.10.13a): what apWalkShow makes of the reply (10057-10059), apCardText (10124-10135), and AP_COLS with apAcrossCols, apAcrossColToggle, apAcrossCell, apAcrossRows and
   apAcrossData (9938-9964), which the panel (apps/web/components/tools/analyse) draws, saves and downloads. The code is v1's as v1 wrote it, cut out of its lines and changed only by the edits
   listed here:
   - each piece is a function of its own with typed parameters and `export`; what v1 reads from its page state or from localStorage is a parameter: the loaded paper (`AP.doc`, `doc`), apPick's
     numbers (`pk`, from core's buildWalkPrompt), the reply's text (callAI's answer, which apCall reads with apJson, 10029), the paper's note (`apNoteGet()`, `note`), the last reference check
     (`AP.refs`, `refs`), the stored notes (`apNotes()`, `all`), the stored column list (`LS.get(AP_COLS_KEY)` as JSON, `stored`) and the AI-columns box (`apAcrossAi()`, `ai`);
   - apWalkRes returns the object apWalkShow keeps (`o`, 10057-10059) in place of writing it into AP.res and the notes; apAcrossColToggle returns the new column list in place of storing it;
   - the copy is a parameter, as the panel gives it through t(): the stage names (AP_STAGES' `name`), the card's headings and words (`L`, 10126-10133: "PAPER CARD", "My words:", …, and the
     closing line) and the table's (`L`, 9961: "Paper", "(my words)", "(AI reading, check it)" and AP_COLS' labels by key); each is joined to its neighbour with the space or line break v1 has
     there, so v1's English gives v1's text byte for byte;
   - AP_COLS is read from data/analyse-cards-tables.ts, generated from v1.
   Golden: test/golden/appanel (v1's apWalkShow, apCardText, apAcrossCols, apAcrossColToggle, apAcrossData and pdCsv driven in jsdom). */
import { AP_COLS as AP_COLS_TABLE } from "./data/analyse-cards-tables";
import { apCheckQuote, apJson } from "./analyse";
import type { ApDoc } from "./analyse";
import { pdCsv } from "./csv";

export type ApQuoteCheck = ReturnType<typeof apCheckQuote>;
/** One stage's reply as apWalkShow keeps it (10057-10059) in AP.res and in the notes: apPick's numbers, then the raw text (not JSON) or the reading, up to 4 checked quotations, what the paper does not report, what to judge, and the check question with its answer. */
export type ApWalkRes = { partial: boolean; n: number; of: number; raw?: string; reading?: string; quotes: ApQuoteCheck[]; not_stated?: string[]; watch?: string; cq?: string; ca?: string };
/** A paper's note as v1 stores it in appu_ap_notes (apNotePut 9895): the stages' own words and replies, the card's fields, the title. */
export type ApNoteLike = { stages?: Record<string, { mine?: string; res?: { reading?: unknown } | null } | undefined>; card?: Record<string, unknown>; title?: string };

/** apWalkShow (10057-10059): the reply read by apJson (apCall 10029); not JSON keeps the raw text; else the reading, up to 4 quotations each checked against the paper, not_stated as strings, watch_for, check_question and check_answer. */
export function apWalkRes(doc: ApDoc, pk: { partial: boolean; n: number; of: number }, out: string): ApWalkRes{
  const r=(apJson(out) as Record<string, unknown> | null)||{_raw:String(out||'')};
  const o={partial:pk.partial,n:pk.n,of:pk.of} as ApWalkRes;
  if(r._raw!==undefined){o.raw=r._raw as string;o.quotes=[]}
  else{o.reading=String(r.reading||'');o.quotes=(Array.isArray(r.quotes)?r.quotes:[]).slice(0,4).map((q: unknown)=>apCheckQuote(doc,q as string));o.not_stated=Array.isArray(r.not_stated)?r.not_stated.map(String):[];o.watch=String(r.watch_for||'');o.cq=String(r.check_question||'');o.ca=String(r.check_answer||'')}
  return o;
}

/** The card's words (10126-10133), as the panel gives them. */
export type ApCardLabels = {
  head: string; myWords: string; notWritten: string; reading: string; refHead: string; doisRead: string; known: string; flagged: string; none: string; warning: string;
  strengths: string; weak: string; verdict: string; notes: string; closing: string;
};
/** AP.refs as apCardText reads it: the reference check's DOIs, what OpenAlex knew, what it flagged, and `finished` once it ran to the end (any other state, a `none` box included, adds no line). */
export type ApCardRefs = { dois?: string[]; seen?: Record<string, unknown>; flag?: Record<string, unknown>; finished?: boolean; none?: string } | null | undefined;

/** apCardText (10124-10135): "PAPER CARD", the title, each stage with words or a reply (its name in capitals, my words, the reading), the reference check's line once it finished, the four fields and the closing line. */
export function apCardText(o: { title: string; note: ApNoteLike | undefined; refs: ApCardRefs; stages: ReadonlyArray<{ k: string; name: string }>; L: ApCardLabels }): string{
  const L=o.L,n=o.note||{stages:{},card:{}},c=(n.card||{}) as Record<string, string | undefined>,stg=n.stages||{},R=o.refs;
  let t=L.head+'\n'+o.title+'\n\n';
  o.stages.forEach(s=>{
    const st=stg[s.k]||{},r=st.res;
    if(!st.mine&&!r)return;
    t+=s.name.toUpperCase()+'\n'+L.myWords+' '+(st.mine||L.notWritten)+'\n'+(r&&r.reading?L.reading+' '+r.reading+'\n':'')+'\n';
  });
  if(R&&R.finished){const f=Object.keys(R.flag||{});t+=L.refHead+'\n'+(R.dois||[]).length+' '+L.doisRead+' '+Object.keys(R.seen||{}).length+' '+L.known+' '+(f.length?f.length+' '+L.flagged+' '+f.join(', '):L.none)+L.warning+'\n\n'}
  t+=L.strengths+'\n'+(c.strengths||'')+'\n\n'+L.weak+'\n'+(c.weak||'')+'\n\n'+L.verdict+'\n'+(c.verdict||'')+'\n\n'+L.notes+'\n'+(c.notes||'')+'\n\n'+L.closing+'\n';
  return t;
}

/** AP_COLS (9938): the columns of the cards side by side, key and v1's label, in v1's order (generated from v1). */
export const AP_COLS: ReadonlyArray<readonly [string, string]> = AP_COLS_TABLE;
/** apAcrossCols (9940): the stored list when it is a non-empty array, its keys outside AP_COLS dropped (in the stored order); else design, sample, measures, stats, verdict. */
export function apAcrossCols(stored: unknown): string[]{const c=stored;if(Array.isArray(c)&&c.length)return c.filter(k=>AP_COLS.some(x=>x[0]===k));return['design','sample','measures','stats','verdict']}
/** apAcrossColToggle (9941): the column taken out, put back when `on`, and the list put in AP_COLS order. */
export function apAcrossColToggle(cols: string[],k: string,on: boolean): string[]{let c=cols.slice();c=c.filter(x=>x!==k);if(on)c.push(k);c=AP_COLS.map(x=>x[0]).filter(x=>c.indexOf(x)>=0);return c}
/** apAcrossCell (9944-9951): strengths, weak and verdict from the card; any other key the stage's own words, or with `ai` its reading. */
export function apAcrossCell(n: ApNoteLike,k: string,ai: boolean): string{
  const st=n.stages||{},cd=(n.card||{}) as Record<string, string | undefined>;
  if(k==='strengths')return cd.strengths||'';
  if(k==='weak')return cd.weak||'';
  if(k==='verdict')return cd.verdict||'';
  const x=st[k]||{};
  return ai?(x.res&&x.res.reading?String(x.res.reading):''):(x.mine||'');
}
/** apAcrossRows (9952-9958): the papers with a title and any card or stage text in some column of AP_COLS (own words or a reading), in the stored order. */
export function apAcrossRows<N extends ApNoteLike>(all: Record<string, N>): Array<{ id: string; n: N }>{
  return Object.keys(all).map(id=>({id:id,n:all[id]!})).filter(r=>{
    const n=r.n;if(!n||!n.title)return false;
    return AP_COLS.some(c=>apAcrossCell(n,c[0],false)||apAcrossCell(n,c[0],true))
  });
}
/** The table's words (9961), as the panel gives them: "Paper", "(my words)", "(AI reading, check it)" and each column's label by key. */
export type ApAcrossLabels = { paper: string; myWords: string; aiReading: string; names: Record<string, string> };
/** apAcrossData (9959-9964): the head (Paper, then each column "(my words)" except strengths, weak and verdict, and with `ai` an "(AI reading, check it)" column after each of the others), one row per paper, and the papers' ids. */
export function apAcrossData(all: Record<string, ApNoteLike>,cols: string[],ai: boolean,L: ApAcrossLabels): { head: string[]; body: string[][]; ids: string[] }{
  const rows=apAcrossRows(all);
  const head=[L.paper];cols.forEach(k=>{const nm=L.names[k]!;head.push(nm+(/^(strengths|weak|verdict)$/.test(k)?'':' '+L.myWords));if(ai&&!/^(strengths|weak|verdict)$/.test(k))head.push(nm+' '+L.aiReading)});
  const body=rows.map(r=>{const line=[r.n.title!];cols.forEach(k=>{line.push(apAcrossCell(r.n,k,false));if(ai&&!/^(strengths|weak|verdict)$/.test(k))line.push(apAcrossCell(r.n,k,true))});return line});
  return{head:head,body:body,ids:rows.map(r=>r.id)};
}
/** apAcrossCsv (9977): the table as v1's pdCsv writes it (the panel saves it as paper_cards.csv, with v1's byte-order mark). */
export function apAcrossCsv(d: { head: string[]; body: string[][] }): string{return pdCsv(d.head,d.body)}
