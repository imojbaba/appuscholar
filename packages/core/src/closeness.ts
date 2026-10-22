import { CL_STOP_WORDS, CL_HOMO as CL_HOMO_TABLE } from "./data/closeness-tables";
import { docTextContent } from "./doctext";

/* v1's closeness check (index.html "Closeness check (Version 36)", 6820-6972), the parts that compute: CL_STOP (6830), clTok (6831-6841), CL_HOMO (6842), clExcludeRanges (6843-6851),
   clHtmlToText (6852-6854), clK and clMin (6855-6856), clCompare (6859-6899), closeInit's document filter (6905), clGather (6919-6936), clRun's two guards (6938-6941) and
   clReportText (6967-6972). CL_STOP (a Set built from one space-separated string) and CL_HOMO are emitted from v1 into data/closeness-tables.ts (golden:capture closeness --emit), never
   retyped; CL_STOP is built here from the emitted words in v1's order. clTok, clExcludeRanges and clCompare are v1's text with types, `export`, and `!` on indexed reads
   (noUncheckedIndexedAccess).
   Not ported (the panel's): closeInit's shelf listing and checkboxes (shAll, escAttr, escHTML), clSet (writing the two settings to localStorage), clRun's toasts, `Date.now()` timing and
   `CL.res`, clRender (the page; it is redesigned in the frame, and "close to" is its word, never "copied"), clDownload, clNorm (unused).
   What differs from v1's text:
   - clK(stored) and clMin(stored) take the stored string (v1 reads LS.get('appu_close_k') and ('appu_close_min')); null or undefined is "never stored", as v1's `||'6'` and `||'8'` read it;
   - clHtmlToText is docTextContent (doctext.ts, register F26): v1 reads `d.innerText||d.textContent` of a detached div, which Chrome answers with textContent and jsdom (v1's golden
     capture) has no innerText for, so both give the text with no separator between blocks (`<p>a</p><p>b</p>` is "ab");
   - clReportText(r, dateIso) takes the date (v1 reads `new Date().toISOString().slice(0,10)`): a full ISO string or its first ten characters; the result's `text` and `ms`, which clRun
     sets and the report ignores, need not be there;
   - clGather(picked, shelf, docs, pasted) is clGather's computation without the page: `picked` is the values of the ticked boxes in the order they stand in the page ("s:<paper id>" for a
     paper on the Reading shelf, "d:<document id>" for one of the student's other documents, anything else ignored, an id that is not in the lists ignored), `shelf` is CL.shelf, `docs`
     CL.docs and `pasted` the textarea's value;
   - clOtherDocs(docs, currentId) is the filter closeInit puts into CL.docs (documents other than the open one whose body is longer than 200 characters), clEnoughWords(text) the 30-word
     guard of clRun (true where v1 went on to compare); CL_MIN_WORDS is its 30.
   Caution: a result is only as good as its sources. clCompare reads `sources[i].text` and `sources[i].pageStarts` (character offsets of each page's start in `text`, as clGather builds them). */

export const CL_STOP: Set<string> = new Set<string>(CL_STOP_WORDS);
/** Look-alike letters from Cyrillic and Greek mapped back to Latin, applied only inside words that already mix scripts. */
export const CL_HOMO: Readonly<Record<string, string>> = CL_HOMO_TABLE;

export type ClTok = { w: string; s: number; e: number };
export type ClSource = { name: string; kind: string; text: string; pageStarts?: number[] };
export type ClRun = { src: number; also: number[]; from: number; to: number; words: number; mine: string; theirs: string; page: number; cs: number; ce: number };
export type ClResult = {
  counted: number; total: number; covered: number; pct: number; runs: ClRun[];
  per: Array<{ name: string; kind: string; words: number; runs: number }>; k: number; minRun: number; sources: Array<{ name: string; kind: string }>;
};
export type ClShelfPaper = { id: string; title?: string; file?: string; pages?: Array<string | null | undefined> };
export type ClDoc = { id: string; title?: string; body?: string };

export function clTok(text: string): ClTok[]{
  const out: ClTok[]=[];const re=/[\p{L}\p{N}\p{M}­​-‍﻿]+(?:['’][\p{L}]+|[-‐]\s*\n\s*[\p{L}\p{N}\p{M}]+)*/gu;let m: RegExpExecArray | null;
  while((m=re.exec(text))){
    let w=m[0].normalize('NFKC').replace(/[­​-‍﻿]/g,'').replace(/[-‐]\s*\n\s*/g,'').toLowerCase().replace(/’/g,"'");
    if(!w)continue;
    if(/[Ѐ-ӿͰ-Ͽ]/.test(w)&&/[a-z]/.test(w))w=w.replace(/[Ѐ-ӿͰ-Ͽ]/g,c=>CL_HOMO[c]||c);
    out.push({w:w,s:m.index,e:m.index+m[0].length});
  }
  return out;
}
export function clExcludeRanges(text: string): Array<[number, number]>{
  const r: Array<[number, number]>=[];let m: RegExpExecArray | null;
  const q1=/“[^”]{0,3000}”/g;while((m=q1.exec(text)))r.push([m.index,m.index+m[0].length]);
  const q2=/"[^"\n]{0,3000}"/g;while((m=q2.exec(text)))r.push([m.index,m.index+m[0].length]);
  const h=/\n[ \t]*(references|reference list|bibliography|works cited)[ \t]*\n/ig;let last=-1;
  while((m=h.exec(text)))last=m.index;
  if(last>=0)r.push([last,text.length]);
  return r;
}
export function clHtmlToText(html: string): string{return docTextContent(String(html||''))}
export function clK(stored?: string | null): number{const v=parseInt(stored||'6',10);return[5,6,8].indexOf(v)>=0?v:6}
export function clMin(stored?: string | null): number{const v=parseInt(stored||'8',10);return[8,10,15].indexOf(v)>=0?v:8}
/* Pure engine: studentText, sources [{name,kind,text,pageStarts?}], k (word group size), minRun. Returns result object. */
export function clCompare(studentText: string,sources: ClSource[],k: number,minRun: number): ClResult{
  const st=clTok(studentText);
  const ex=clExcludeRanges(studentText);
  const excl=new Uint8Array(st.length);
  st.forEach((t,i)=>{for(let j=0;j<ex.length;j++){if(t.s>=ex[j]![0]&&t.e<=ex[j]![1]){excl[i]=1;break}}});
  const counted=excl.reduce((a,x)=>a+(x?0:1),0);
  const srcToks=sources.map(s=>clTok(s.text));
  const index=new Map<string, Array<[number, number]>>();
  srcToks.forEach((tk,si)=>{
    for(let p=0;p+k<=tk.length;p++){
      let key=tk[p]!.w;for(let q=1;q<k;q++)key+=' '+tk[p+q]!.w;
      const a=index.get(key);
      if(!a)index.set(key,[[si,p]]);else if(a.length<3)a.push([si,p]);
    }
  });
  const mSrc=new Int16Array(st.length).fill(-1),mPos=new Int32Array(st.length).fill(-1),mAlso: Array<Array<[number, number]> | undefined>=new Array(st.length);
  for(let i=0;i+k<=st.length;i++){
    let bad=false;for(let q=0;q<k;q++){if(excl[i+q]){bad=true;break}}
    if(bad)continue;
    let key=st[i]!.w;for(let q=1;q<k;q++)key+=' '+st[i+q]!.w;
    const hit=index.get(key);if(!hit)continue;
    for(let q=0;q<k;q++){if(mSrc[i+q]!<0){mSrc[i+q]=hit[0]![0];mPos[i+q]=hit[0]![1]+q;mAlso[i+q]=hit}}
  }
  const runs: ClRun[]=[];let i=0;
  while(i<st.length){
    if(mSrc[i]!<0){i++;continue}
    let j=i;while(j+1<st.length&&mSrc[j+1]===mSrc[i]&&!excl[j+1])j++;
    const words=j-i+1;let content=0;for(let q=i;q<=j;q++){if(!CL_STOP.has(st[q]!.w))content++}
    if(words>=minRun&&content>=4){
      const si=mSrc[i]!,tk=srcToks[si]!,p0=mPos[i]!,p1=Math.min(tk.length-1,p0+words-1);
      const stext=sources[si]!.text.slice(tk[p0]!.s,tk[p1]!.e);
      let page=0;const ps=sources[si]!.pageStarts;
      if(ps){for(let z=0;z<ps.length;z++){if(ps[z]!<=tk[p0]!.s)page=z+1;else break}}
      const also=(mAlso[i]||[]).map(h=>h[0]).filter((v,n,a)=>v!==si&&a.indexOf(v)===n);
      runs.push({src:si,also:also,from:i,to:j,words:words,mine:studentText.slice(st[i]!.s,st[j]!.e),theirs:stext,page:page,cs:st[i]!.s,ce:st[j]!.e});
    }
    i=j+1;
  }
  const covered=runs.reduce((a,r)=>a+r.words,0);
  const per=sources.map((s,si)=>({name:s.name,kind:s.kind,words:runs.filter(r=>r.src===si).reduce((a,r)=>a+r.words,0),runs:runs.filter(r=>r.src===si).length}));
  return{counted:counted,total:st.length,covered:covered,pct:counted?Math.round(1000*covered/counted)/10:0,runs:runs,per:per,k:k,minRun:minRun,sources:sources.map(s=>({name:s.name,kind:s.kind}))};
}
export function clReportText(r: ClResult,dateIso: string): string{
  let t='CLOSENESS CHECK (made with Appuscholar)\nDate: '+dateIso.slice(0,10)+'\nSources compared: '+r.sources.map((s,i)=>'['+(i+1)+'] '+s.name+' ('+s.kind+')').join('; ')+'\nSettings: word groups of '+r.k+', passages of '+r.minRun+' words or more. Quoted text and the reference list left out.\nResult: '+r.pct+'% of counted words ('+r.covered+' of '+r.counted+') sit in matching passages.\n\nLIMITS: Only the listed sources were compared. The web, books, other journals and other students\' work were not checked, and ideas rewritten in new words cannot be seen. This is not a plagiarism verdict and does not meet any institution\'s similarity-report requirement.\n\n';
  r.runs.forEach((x,n)=>{t+='['+(x.src+1)+'.'+(n+1)+'] '+x.words+' words, source: '+r.sources[x.src]!.name+(x.page?', page '+x.page:'')+(x.also&&x.also.length?'; also in '+x.also.map(a=>r.sources[a]!.name).join('; '):'')+'\nYours: '+x.mine+'\nSource: '+x.theirs+'\n\n'});
  return t;
}
export function clGather(picked: string[],shelf: ClShelfPaper[],docs: ClDoc[],pasted: string): ClSource[]{
  const out: ClSource[]=[];
  picked.forEach(v=>{
    if(v.indexOf('s:')===0){
      const p=shelf.find(x=>x.id===v.slice(2));if(!p)return;
      const pages=(p.pages||[]).map(x=>String(x||''));let txt='';const starts: number[]=[];
      pages.forEach(pt=>{starts.push(txt.length);txt+=pt+'\n'});
      out.push({name:p.title||p.file||'Paper',kind:'Reading shelf',text:txt,pageStarts:starts});
    }else if(v.indexOf('d:')===0){
      const d=docs.find(x=>x.id===v.slice(2));if(!d)return;
      out.push({name:d.title||'Untitled document',kind:'your document',text:clHtmlToText(d.body||'')});
    }
  });
  const pz=(pasted||'').trim();
  if(pz)out.push({name:'Pasted passage',kind:'pasted',text:pz});
  return out;
}
export function clOtherDocs(docs: ClDoc[],currentId: string): ClDoc[]{return docs.filter(d=>d&&d.id!==currentId&&String(d.body||'').length>200)}
/** clRun's guard: it went on to compare only for a document of at least this many words (`<30` toasted "Write at least about 30 words first"). */
export const CL_MIN_WORDS=30;
export function clEnoughWords(text: string): boolean{return !(text.replace(/\s+/g,' ').trim().split(' ').length<CL_MIN_WORDS)}
