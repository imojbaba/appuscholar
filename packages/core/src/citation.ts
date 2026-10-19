/* v1's citation engine, "Citation engine (Version 5)" (index.html:7056-7465): one source entry in, and out its reference in one of eight styles (APA 7, APA 6, MLA 9, Chicago author-date, Harvard,
   Vancouver, IEEE, AMA 11) as plain text (`ref`) and as HTML with italics (`refHTML`, escaped with html.ts's escHTML), its in-text form (`intext`), the AMA superscript flag (`sup`) and the library number (`num`).
   v1's author marks every style rule CHECK (7062-7063, 7218); they are ported exactly as they are (Decision 5; register rows F23, F23a-F23c): the same strings, regex sources and flags, spaces inside each
   concatenation and branch order; the italic markers IA = U+0001 and IB = U+0002; citListJoin's Oxford flag; citInitials's all-caps rule, as one line; and citFmt's closing `ref.replace(/[ \t]{2,}/g,' ').trim()`.
   The four month tables and CIT_STYLES (7064-7073) are not declared here: they are imported from data/citation-tables.ts, which the golden harness generates from v1 (`golden:capture citation --emit`).
   What differs from v1's text is only what TypeScript and this package's lint need:
   - parameter and return types, `export`, and the types below;
   - citFmt's style is a required parameter: v1's `const st=styleOverride||document.getElementById('citStyle').value;` (7325) is `const st=style;`, since core reads no page;
   - a `!` on each read that v1 trusts to exist (noUncheckedIndexedAccess): the first piece of a split, the last word of a name, the first entries of a list already checked to be long enough,
     the three groups of an accessed date, the first letter of a part that is not empty;
   - citIsNumbered reads CIT_STYLES `as StyleTable`, indexed by any string as v1 indexed it; citNum hands parseInt `x as string` (v1 passes undefined as well, which parseInt reads as NaN);
   - ieeeAuthors's `let l` is `const l` (prefer-const: it is never reassigned).
   Not ported: the section comment 7053 and citGetLib and citSaveLib (7054-7055, the library in localStorage). */
import { CIT_MONTHS, CIT_MON_ABB, CIT_MON_IEEE, CIT_MON_MLA, CIT_STYLES } from "./data/citation-tables";
import { escHTML } from "./html";

export { CIT_STYLES };
export type CitationStyle = "apa" | "apa6" | "mla" | "chicago" | "harvard" | "vancouver" | "ieee" | "ama";
/** A source as v1 stores it: the object citReadForm (7466) builds from the form, every value a trimmed string; citImport (7999) stores the same keys except month, day, accessed, container, editors, number and degree. */
export type CitationEntry = { author?: string; year?: string; title?: string; source?: string; volume?: string; issue?: string; pages?: string; doi?: string; url?: string; month?: string; day?: string; accessed?: string; container?: string; editors?: string; number?: string; degree?: string; type?: string; style?: string; lang?: string };
export type CitationKind = "journal" | "book" | "web" | "chapter" | "report" | "thesis" | "conf";
export type Formatted = { ref: string; refHTML: string; intext: string; sup: boolean; num: number };
/** One name of an author or editor list as citNames reads it: `Last, First` or, with no comma, an organisation. */
type CitName = { last: string; first: string; org: boolean };
/** CIT_STYLES indexed by any string, as citIsNumbered reads it. */
type StyleTable = Readonly<Record<string, { readonly numbered: boolean; readonly head: string } | undefined>>;
/** What citFmt hands citFmtExtra (7335). */
type ExtraContext = { y: string; ns: CitName[]; link: string; bareDoi: string; num: number; moName: string | undefined };

export function citLastName(a: string | undefined): string{a=(a||'').split(';')[0]!.trim();if(!a)return'Author';
  if(a.includes(','))return a.split(',')[0]!.trim();
  const p=a.split(/\s+/);return p[p.length-1]!}
/* ---- Citation engine (Version 5) ----------------------------------------------------------
   One entry object in, three things out: ref (plain text), refHTML (with italics) and intext.
   Italic spans are marked with control characters while a reference is assembled, then turned into
   <i> tags (refHTML) or removed (ref). All eight style rules below follow the published manuals as
   I know them and are marked CHECK: one entry per style should be compared with the manual. */
/* CIT_MONTHS, CIT_MON_MLA, CIT_MON_ABB, CIT_MON_IEEE and CIT_STYLES (7064-7073) are imported from data/citation-tables.ts, generated from v1. */
export function citIsNumbered(st: string): boolean{return !!((CIT_STYLES as StyleTable)[st]&&(CIT_STYLES as StyleTable)[st]!.numbered)}
export function citKind(t: string | undefined): CitationKind{
  t=String(t||'');
  if(/^book$/i.test(t)||t==='पुस्तक')return'book';
  if(/^website$/i.test(t)||t==='वेबसाइट')return'web';
  if(/^book chapter$/i.test(t)||t==='पुस्तक अध्याय')return'chapter';
  if(/^report$/i.test(t)||t==='रिपोर्ट')return'report';
  if(/^thesis/i.test(t)||t==='शोध-प्रबंध')return'thesis';
  if(/^conference/i.test(t)||t==='सम्मेलन शोध-पत्र')return'conf';
  return'journal';
}
const IA='\u0001',IB='\u0002';
function I(x: string | undefined): string{x=String(x==null?'':x);return x?IA+x+IB:''}
function citBare(x: string): string{return String(x).replace(/[\u0001\u0002]/g,'')}
function citHTMLof(x: string): string{return escHTML(String(x)).replace(/\u0001/g,'<i>').replace(/\u0002/g,'</i>')}
function dot(x: string | undefined): string{x=String(x==null?'':x).trim();if(!x)return'';return /[.?!]$/.test(citBare(x))?x:x+'.'}
function citTrimDot(x: string | undefined): string{return String(x==null?'':x).trim().replace(/\.$/,'')}
function doiUrl(d: CitationEntry): string{
  if(d.doi)return'https://doi.org/'+String(d.doi).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,'');
  return d.url?String(d.url).trim():'';
}
function citDoiBare(d: CitationEntry): string{return d.doi?String(d.doi).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,''):''}
/* names */
export function citNames(raw: string | undefined): CitName[]{
  return (raw||'').split(';').map(x=>x.trim()).filter(Boolean).map(n=>{
    if(n.includes(',')){const i=n.indexOf(',');return{last:n.slice(0,i).trim(),first:n.slice(i+1).trim(),org:false}}
    return{last:n,first:'',org:true};
  });
}
export function citInitials(first: string): string[]{
  const out: string[]=[];
  String(first||'').split(/[\s]+/).filter(Boolean).forEach(w=>{
    w.split('-').forEach(part=>{
      const p=part.replace(/\./g,'');
      if(!p)return;
      if(/^[A-Z]{2,3}$/.test(p)&&!/[a-z]/.test(p)&&(part.includes('.')||p.length<=3&&first.trim().split(/\s+/).length===1))p.split('').forEach(c=>out.push(c));
      else out.push(p[0]!.toUpperCase());
    });
  });
  return out;
}
function citIn(n: CitName,dots: boolean,sp?: boolean): string{const i=citInitials(n.first);return i.length?i.map(c=>c+(dots?'.':'')).join(dots?(sp===false?'':' '):''):''}
function citListJoin(l: string[],andWord: string,oxford: boolean): string{
  if(l.length<=1)return l.join('');
  if(l.length===2)return l[0]+' '+andWord+' '+l[1];
  return l.slice(0,-1).join(', ')+(oxford?',':'')+' '+andWord+' '+l[l.length-1];
}
function apaName(a: string): string{
  a=a.trim();if(!a.includes(','))return a;
  const n=citNames(a)[0]!;const i=citIn(n,true);
  return n.last+(i?', '+i:'');
}
export function apaAuthors(raw: string | undefined): string{
  const l=(raw||'').split(';').map(x=>x.trim()).filter(Boolean).map(apaName);
  if(!l.length)return'Author';
  if(l.length===1)return l[0]!;
  if(l.length<=20)return l.slice(0,-1).join(', ')+', & '+l[l.length-1];
  return l.slice(0,19).join(', ')+', . . . '+l[l.length-1];
}
/* An organisation or a name with no final full stop gets one before the date: World Health Organization. (2022). */
function apaHead(au: string): string{return /\.$/.test(au)?au:au+'.'}
export function apa6Authors(raw: string | undefined): string{
  const l=(raw||'').split(';').map(x=>x.trim()).filter(Boolean).map(apaName);
  if(!l.length)return'Author';
  if(l.length===1)return l[0]!;
  if(l.length<=7)return l.slice(0,-1).join(', ')+', & '+l[l.length-1];
  return l.slice(0,6).join(', ')+', . . . '+l[l.length-1];
}
export function mlaAuthors(raw: string | undefined): string{
  const ns=citNames(raw);if(!ns.length)return'';
  const full=(n: CitName)=>n.org?n.last:n.last+(n.first?', '+n.first:'');
  const rev=(n: CitName)=>n.org?n.last:(n.first?n.first+' ':'')+n.last;
  if(ns.length===1)return full(ns[0]!);
  if(ns.length===2)return full(ns[0]!)+', and '+rev(ns[1]!);
  return full(ns[0]!)+', et al';
}
export function chicagoAuthors(raw: string | undefined): string{
  const ns=citNames(raw);if(!ns.length)return'';
  const full=(n: CitName)=>n.org?n.last:n.last+(n.first?', '+n.first:'');
  const rev=(n: CitName)=>n.org?n.last:(n.first?n.first+' ':'')+n.last;
  let l=ns.map((n,i)=>i===0?full(n):rev(n)),etal=false;
  if(l.length>10){l=l.slice(0,7);etal=true}
  if(etal)return l.join(', ')+', et al';
  if(l.length===2)return l[0]+', and '+l[1];
  return citListJoin(l,'and',true);
}
export function harvardAuthors(raw: string | undefined): string{
  const ns=citNames(raw);if(!ns.length)return'';
  const l=ns.map(n=>n.org?n.last:n.last+(citIn(n,true,false)?', '+citIn(n,true,false):''));
  return citListJoin(l,'and',false);
}
export function vancAuthors(raw: string | undefined,max: number,keep: number): string{
  const ns=citNames(raw);if(!ns.length)return'';
  let l=ns.map(n=>n.org?n.last:n.last+(citIn(n,false)?' '+citIn(n,false):'')),etal=false;
  if(l.length>max){l=l.slice(0,keep);etal=true}
  return l.join(', ')+(etal?', et al':'');
}
export function ieeeAuthors(raw: string | undefined): string{
  const ns=citNames(raw);if(!ns.length)return'';
  const l=ns.map(n=>n.org?n.last:(citIn(n,true)?citIn(n,true)+' ':'')+n.last);
  if(l.length>6)return l[0]+' et al.';
  return citListJoin(l,'and',true);
}
/* dates */
function citNum(x: string | undefined): number{const n=parseInt(x as string,10);return isFinite(n)&&n>0?n:0}
function citAccParts(d: CitationEntry): { y: number; m: number; d: number } | null{
  const m=String(d.accessed||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?{y:+m[1]!,m:+m[2]!,d:+m[3]!}:null;
}
function citPg(p: string | undefined,dash: boolean): string{p=String(p||'').trim();return dash?p.replace(/\s*[-–—]\s*/g,'–'):p}
function citPP(p: string): string{return /[-–—,]/.test(String(p))?'pp. '+citPg(p,true):'p. '+p}
function citLink(d: CitationEntry): string{return doiUrl(d)}
export function citWho(ns: ReturnType<typeof citNames>,st: CitationStyle): string{
  const ln=(n: CitName)=>n.org?n.last:n.last;
  const l=ns.map(ln);
  if(!l.length)return'Author';
  const one=l[0]!;
  if(st==='apa'||st==='apa6'){
    if(st==='apa'){return l.length>=3?one+' et al.':l.length===2?one+' & '+l[1]:one}
    if(l.length>=6)return one+' et al.';
    return l.length>=3?l.slice(0,-1).join(', ')+', & '+l[l.length-1]:l.length===2?one+' & '+l[1]:one;
  }
  if(st==='mla'||st==='chicago'){
    if(st==='chicago'&&l.length===3)return l[0]+', '+l[1]+', and '+l[2];
    return l.length>=(st==='mla'?3:4)?one+' et al.':l.length===2?one+' and '+l[1]:l.length===3?l[0]+', '+l[1]+', and '+l[2]:one;
  }
  if(st==='harvard'){
    return l.length>=4?one+' et al.':l.length===3?l[0]+', '+l[1]+' and '+l[2]:l.length===2?one+' and '+l[1]:one;
  }
  return one;
}
/* Editors, written the way each style wants them. */
export function citEdList(raw: string | undefined,mode: "apa" | "first-last" | "harvard" | "vanc" | "ieee"): { txt: string; n: number }{
  const ns=citNames(raw);if(!ns.length)return{txt:'',n:0};
  const init=(n: CitName,dots: boolean,sp?: boolean)=>citIn(n,dots,sp);
  const fl=(n: CitName)=>n.org?n.last:(n.first?n.first+' ':'')+n.last;
  let txt='';
  if(mode==='apa'){const l=ns.map(n=>n.org?n.last:(init(n,true)?init(n,true)+' ':'')+n.last);txt=l.length>2?l.slice(0,-1).join(', ')+', & '+l[l.length-1]:l.join(' & ')}
  else if(mode==='first-last'){txt=citListJoin(ns.map(fl),'and',true)}
  else if(mode==='harvard'){txt=citListJoin(ns.map(n=>n.org?n.last:(init(n,true,false)?init(n,true,false)+' ':'')+n.last),'and',false)}
  else if(mode==='vanc'){txt=ns.map(n=>n.org?n.last:n.last+(init(n,false)?' '+init(n,false):'')).join(', ')}
  else if(mode==='ieee'){txt=citListJoin(ns.map(n=>n.org?n.last:(init(n,true)?init(n,true)+' ':'')+n.last),'and',true)}
  return{txt:txt,n:ns.length};
}
/* Book chapter, report, thesis and conference paper, all eight styles. CHECK against the manuals. */
function citFmtExtra(st: CitationStyle,kind: CitationKind,d: CitationEntry,c: ExtraContext): { ref: string; intext: string; sup: boolean }{
  const y=c.y,link=c.link,bareDoi=c.bareDoi,num=c.num;
  const ctr=d.container||'',pub=d.source||'',pgRaw=d.pages||'';
  const deg=d.degree||'';
  const pg=(dash: boolean)=>pgRaw?citPg(pgRaw,dash):'';
  const mk=(ref: string,intext: string,sup?: boolean)=>({ref:ref,intext:intext,sup:!!sup});
  if(st==='apa'||st==='apa6'){
    const six=st==='apa6';
    const au=six?apa6Authors(d.author):apaAuthors(d.author);
    const date=y+(kind==='conf'&&c.moName?', '+c.moName:'');
    const head=apaHead(au)+' ('+date+'). ';
    const loc=six?(bareDoi?'doi:'+bareDoi:(d.url?'Retrieved from '+String(d.url).trim():'')):link;
    const e=citEdList(d.editors,'apa');
    const pp=pgRaw?' (pp. '+pg(true)+')':'';
    let ref='';
    if(kind==='chapter'||kind==='conf'){
      const eds=(kind==='chapter'&&e.txt)?e.txt+' ('+(e.n>1?'Eds.':'Ed.')+'), ':'';
      ref=head+dot(d.title)+' In '+eds+I(ctr)+pp+'. '+(pub?dot(pub):'')+(loc?' '+loc:'');
    }else if(kind==='report'){
      ref=head+dot(I(d.title)+(d.number?' (Report No. '+d.number+')':''))+(pub?' '+dot(pub):'')+(loc?' '+loc:'');
    }else{
      ref=head+I(d.title)+' ['+(deg||'Doctoral dissertation')+(pub?', '+pub:'')+']. '+(loc||'');
    }
    return mk(ref,'('+citWho(c.ns,six?'apa6':'apa')+', '+y+')');
  }
  if(st==='mla'){
    const au=mlaAuthors(d.author),head=au?dot(au)+' ':'';
    const e=citEdList(d.editors,'first-last');
    const ed=e.txt?'edited by '+(e.n>2?citNames(d.editors)[0]!.first+' '+citNames(d.editors)[0]!.last+' et al.':e.txt):'';
    const lk=link?' '+link+'.':'';
    let ref='';
    if(kind==='chapter'||kind==='conf'){
      ref=head+'"'+dot(d.title)+'" '+dot([I(ctr),kind==='chapter'?ed:'',pub,y,pgRaw?citPP(pgRaw):''].filter(Boolean).join(', '))+lk;
    }else if(kind==='report'){
      ref=head+dot(I(d.title))+' '+dot([d.number?'Report '+d.number:'',pub,y].filter(Boolean).join(', '))+lk;
    }else{
      ref=head+dot(I(d.title))+' '+dot(y)+' '+dot([pub,deg||'Doctoral dissertation'].filter(Boolean).join(', '))+lk;
    }
    return mk(ref,'('+citWho(c.ns,'mla')+')');
  }
  if(st==='chicago'){
    const au=chicagoAuthors(d.author),head=(au?dot(au)+' ':'')+y+'. ';
    const e=citEdList(d.editors,'first-last');
    const lk=link?' '+link+'.':'';
    let ref='';
    if(kind==='chapter'||kind==='conf'){
      ref=head+'"'+dot(d.title)+'" In '+I(ctr)+(kind==='chapter'&&e.txt?', edited by '+e.txt:'')+(pgRaw?', '+pg(true):'')+'. '+(pub?dot(pub):'')+lk;
    }else if(kind==='report'){
      ref=head+dot(I(d.title))+(d.number?' Report no. '+d.number+'.':'')+(pub?' '+dot(pub):'')+lk;
    }else{
      ref=head+'"'+dot(d.title)+'" '+dot((deg||'PhD diss.')+(pub?', '+pub:''))+lk;
    }
    return mk(ref,'('+citWho(c.ns,'chicago')+' '+y+')');
  }
  if(st==='harvard'){
    const au=harvardAuthors(d.author),head=(au?au+' ':'')+'('+y+') ';
    const e=citEdList(d.editors,'harvard');
    const av=link?' Available at: '+link+'.':'';
    let ref='';
    if(kind==='chapter'){
      ref=head+"'"+citTrimDot(d.title)+"', in "+(e.txt?e.txt+' ('+(e.n>1?'eds.':'ed.')+') ':'')+I(ctr)+'. '+dot([pub,pgRaw?citPP(pgRaw):''].filter(Boolean).join(', '))+av;
    }else if(kind==='conf'){
      ref=head+"'"+citTrimDot(d.title)+"', "+I(ctr)+'. '+dot([pub,pgRaw?citPP(pgRaw):''].filter(Boolean).join(', '))+av;
    }else if(kind==='report'){
      ref=head+dot(I(d.title))+' '+dot([pub,d.number?'Report no. '+d.number:''].filter(Boolean).join(', '))+av;
    }else{
      ref=head+dot(I(d.title))+' '+dot(deg||'Doctoral thesis')+(pub?' '+dot(pub):'')+av;
    }
    return mk(ref,'('+citWho(c.ns,'harvard')+', '+y+')');
  }
  if(st==='vancouver'||st==='ama'){
    const ama=st==='ama';
    const au=vancAuthors(d.author,6,ama?3:6),head=au?dot(au)+' ':'';
    const e=citEdList(d.editors,'vanc');
    const py=dot([pub,y].filter(Boolean).join('; '));
    let ref='';
    if(kind==='chapter'){
      ref=head+dot(d.title)+' In: '+(e.txt?e.txt+', '+(ama?'eds. ':'editors. '):'')+dot(ama?I(ctr):ctr)+' '+(ama?dot([pub,y].filter(Boolean).join('; ')+(pgRaw?':'+pg(false):'')):py+(pgRaw?' p. '+pg(false)+'.':''));
    }else if(kind==='conf'){
      ref=ama?head+dot(d.title)+' Presented at: '+dot([ctr,y].filter(Boolean).join('; ')):head+dot(d.title)+' In: '+dot(ctr)+' '+py+(pgRaw?' p. '+pg(false)+'.':'');
    }else if(kind==='report'){
      ref=head+dot(ama?I(d.title):d.title)+' '+py+(d.number?(ama?' Report '+d.number+'.':' Report No.: '+d.number+'.'):'');
    }else{
      ref=ama?head+dot(I(d.title))+' '+dot(deg||'Dissertation')+' '+py:head+dot(d.title)+' ['+(deg?deg.toLowerCase():'dissertation')+']. '+py;
    }
    if(!ama&&link&&kind!=='report')ref+=' Available from: '+link;
    if(ama&&bareDoi)ref+=' doi:'+bareDoi;
    return mk(ref,'['+(num||'?')+']',ama);
  }
  /* ieee */
  const au=ieeeAuthors(d.author);
  const e=citEdList(d.editors,'ieee');
  let ref='';
  if(kind==='chapter'){
    ref=(au?au+', ':'')+'"'+citTrimDot(d.title)+',"'+' in '+I(ctr)+(e.txt?', '+e.txt+(e.n>1?', Eds. ':', Ed. '):'. ')+(pub?pub+', ':'')+y+(pgRaw?', '+citPP(pgRaw):'')+'.';
  }else if(kind==='conf'){
    ref=(au?au+', ':'')+'"'+citTrimDot(d.title)+',"'+' in '+I(ctr)+', '+y+(pgRaw?', '+citPP(pgRaw):'')+'.';
  }else if(kind==='report'){
    ref=(au?au+', ':'')+'"'+citTrimDot(d.title)+',"'+(pub?' '+pub+',':'')+(d.number?' Rep. '+d.number+',':'')+' '+y+'.';
  }else{
    ref=(au?au+', ':'')+'"'+citTrimDot(d.title)+',"'+' '+(deg==="Master's thesis"?"M.S. thesis":deg==='Undergraduate thesis'?'B.S. thesis':'Ph.D. dissertation')+(pub?', '+pub:'')+', '+y+'.';
  }
  if(bareDoi)ref=ref.replace(/\.$/,'')+', doi: '+bareDoi+'.';
  return mk(ref,'['+(num||'?')+']');
}
export function citFmt(d: CitationEntry,n: number,style: CitationStyle): Formatted{
  const st=style;
  const kind=citKind(d.type);
  const ns=citNames(d.author);
  const y=(d.year||'').trim()||'n.d.';
  const mo=citNum(d.month),dy=citNum(d.day),acc=citAccParts(d);
  const link=citLink(d),bareDoi=citDoiBare(d);
  const num=(n&&n>0)?n:0;
  let ref='',intext='',sup=false;
  const moName=mo?CIT_MONTHS[mo-1]:'';
  if(kind==='chapter'||kind==='report'||kind==='thesis'||kind==='conf'){
    const r=citFmtExtra(st,kind,d,{y:y,ns:ns,link:link,bareDoi:bareDoi,num:num,moName:moName});
    ref=r.ref;intext=r.intext;sup=r.sup;
  }else if(st==='apa'){
    const who=citWho(ns,'apa');
    const date=y+(kind==='web'&&moName?', '+moName+(dy?' '+dy:''):'');
    const head=apaHead(apaAuthors(d.author))+' ('+date+'). ';
    if(kind==='journal'){
      const vol=d.volume?', '+d.volume:'';
      const tail=(d.source?I(d.source+vol)+(d.issue?'('+d.issue+')':''):(d.issue?'('+d.issue+')':''))+(d.pages?', '+citPg(d.pages,true):'');
      ref=head+dot(d.title)+(tail?' '+dot(tail):'')+(link?' '+link:'');
    }else if(kind==='book'){
      ref=head+dot(I(d.title))+(d.source?' '+dot(d.source):'')+(link?' '+link:'');
    }else{
      ref=head+dot(I(d.title))+(d.source?' '+dot(d.source):'')+(link?' '+link:'');
    }
    intext='('+who+', '+y+')';
  }else if(st==='apa6'){
    const who=citWho(ns,'apa6');
    const date=y+(kind==='web'&&moName?', '+moName+(dy?' '+dy:''):'');
    const head=apaHead(apa6Authors(d.author))+' ('+date+'). ';
    const retrieved=acc?'Retrieved '+CIT_MONTHS[acc.m-1]+' '+acc.d+', '+acc.y+', from ':'Retrieved from ';
    const loc=bareDoi?'doi:'+bareDoi:(d.url?retrieved+String(d.url).trim():'');
    if(kind==='journal'){
      const tail=[d.source?I(d.source):'',d.volume?I(d.volume)+(d.issue?'('+d.issue+')':''):(d.issue?'('+d.issue+')':''),d.pages?citPg(d.pages,true):''].filter(Boolean).join(', ');
      ref=head+dot(d.title)+(tail?' '+dot(tail):'')+(loc?' '+loc:'');
    }else if(kind==='book'){
      ref=head+dot(I(d.title))+(d.source?' '+dot(d.source):'')+(loc?' '+loc:'');
    }else{
      ref=head+dot(I(d.title))+(loc?' '+loc:'');
    }
    intext='('+who+', '+y+')';
  }else if(st==='mla'){
    const au=mlaAuthors(d.author);
    const head=au?dot(au)+' ':'';
    const pubDate=(kind==='web'&&dy&&mo?dy+' '+CIT_MON_MLA[mo-1]+' ':(kind==='web'&&mo?CIT_MON_MLA[mo-1]+' ':''))+y;
    const url=link;
    const accTxt=acc?' Accessed '+acc.d+' '+CIT_MON_MLA[acc.m-1]+' '+acc.y+'.':'';
    if(kind==='journal'){
      const parts=[d.source?I(d.source):'',d.volume?'vol. '+d.volume:'',d.issue?'no. '+d.issue:'',y,d.pages?citPP(d.pages):''].filter(Boolean);
      ref=head+'"'+dot(d.title)+'" '+dot(parts.join(', '))+(link?' '+url+'.':'');
    }else if(kind==='book'){
      ref=head+dot(I(d.title))+' '+dot([d.source,y].filter(Boolean).join(', '))+(link?' '+url+'.':'');
    }else{
      ref=head+'"'+dot(d.title)+'" '+dot([d.source?I(d.source):'',pubDate,url].filter(Boolean).join(', '))+accTxt;
    }
    const pg=d.pages?String(d.pages).split(/[–-]/)[0]!.trim():'';
    const who=citWho(ns,'mla');
    intext='('+who+(pg&&kind==='journal'?' '+pg:'')+')';
  }else if(st==='chicago'){
    const au=chicagoAuthors(d.author);
    const head=(au?dot(au)+' ':'')+y+'. ';
    const accTxt=acc?' Accessed '+CIT_MONTHS[acc.m-1]+' '+acc.d+', '+acc.y+'.':'';
    if(kind==='journal'){
      const vi=(d.volume?d.volume:'')+(d.issue?' ('+d.issue+')':'');
      const tail=(d.source?I(d.source):'')+(vi?' '+vi:'')+(d.pages?': '+citPg(d.pages,true):'');
      ref=head+'"'+dot(d.title)+'" '+dot(tail)+(link?' '+link+'.':'');
    }else if(kind==='book'){
      ref=head+dot(I(d.title))+(d.source?' '+dot(d.source):'')+(link?' '+link+'.':'');
    }else{
      const dt=moName?moName+(dy?' '+dy:'')+', '+y:'';
      ref=head+'"'+dot(d.title)+'" '+(d.source?dot(d.source)+' ':'')+(dt?dot(dt)+' ':'')+(link?link+'.':'')+accTxt;
    }
    intext='('+citWho(ns,'chicago')+' '+y+')';
  }else if(st==='harvard'){
    const au=harvardAuthors(d.author);
    const head=(au?au+' ':'')+'('+y+') ';
    const accTxt=acc?' (Accessed: '+acc.d+' '+CIT_MONTHS[acc.m-1]+' '+acc.y+')':'';
    if(kind==='journal'){
      const vi=(d.volume?d.volume:'')+(d.issue?'('+d.issue+')':'');
      const tail=[d.source?I(d.source):'',vi,d.pages?citPP(d.pages):''].filter(Boolean).join(', ');
      ref=head+"'"+citTrimDot(d.title)+"', "+dot(tail)+(link?' Available at: '+link+accTxt+'.':'');
    }else if(kind==='book'){
      ref=head+dot(I(d.title))+(d.source?' '+dot(d.source):'')+(link?' Available at: '+link+accTxt+'.':'');
    }else{
      ref=head+dot(I(d.title))+(d.source?' '+dot(d.source):'')+(link?' Available at: '+link+accTxt+'.':'');
    }
    intext='('+citWho(ns,'harvard')+', '+y+')';
  }else if(st==='vancouver'){
    const au=vancAuthors(d.author,6,6);
    const head=au?dot(au)+' ':'';
    const mon=mo?CIT_MON_ABB[mo-1]:'';
    const accTxt=acc?'[cited '+acc.y+' '+CIT_MON_ABB[acc.m-1]+' '+acc.d+'] ':'';
    if(kind==='journal'){
      const yr=y+(mon?' '+mon:'');
      const tail=yr+(d.volume?';'+d.volume:'')+(d.issue?'('+d.issue+')':'')+(d.pages?':'+citPg(d.pages,false):'');
      ref=head+dot(d.title)+' '+(d.source?dot(d.source)+' ':'')+dot(tail)+(bareDoi?' doi:'+bareDoi:(d.url?' Available from: '+String(d.url).trim():''));
    }else if(kind==='book'){
      ref=head+dot(d.title)+' '+dot([d.source,y].filter(Boolean).join('; '))+(link?' Available from: '+link:'');
    }else{
      const pd=y+(mon?' '+mon:'')+(mon&&dy?' '+dy:'');
      ref=head+citTrimDot(d.title)+' [Internet]. '+(d.source?d.source+'; ':'')+pd+' '+accTxt+(link?'Available from: '+link:'');
    }
    intext='['+(num||'?')+']';
  }else if(st==='ieee'){
    const au=ieeeAuthors(d.author);
    const mon=mo?CIT_MON_IEEE[mo-1]+' ':'';
    const accTxt=acc?' (accessed '+CIT_MON_IEEE[acc.m-1]+' '+acc.d+', '+acc.y+')':'';
    if(kind==='journal'){
      const parts=[d.source?I(d.source):'',d.volume?'vol. '+d.volume:'',d.issue?'no. '+d.issue:'',d.pages?citPP(d.pages):'',mon+y].filter(Boolean);
      ref=(au?au+', ':'')+'"'+citTrimDot(d.title)+',"'+' '+parts.join(', ')+(bareDoi?', doi: '+bareDoi+'.':'.');
    }else if(kind==='book'){
      ref=(au?au+', ':'')+I(citTrimDot(d.title))+'. '+(d.source?d.source+', ':'')+y+'.';
    }else{
      ref=(au?dot(au)+' ':'')+'"'+dot(d.title)+'" '+(d.source?dot(d.source)+' ':'')+(link?'[Online]. Available: '+link:'')+accTxt;
    }
    intext='['+(num||'?')+']';
  }else{ /* ama */
    const au=vancAuthors(d.author,6,3);
    const head=au?dot(au)+' ':'';
    if(kind==='journal'){
      const tail=y+(d.volume?';'+d.volume:'')+(d.issue?'('+d.issue+')':'')+(d.pages?':'+citPg(d.pages,false):'');
      ref=head+dot(d.title)+' '+(d.source?dot(I(d.source))+' ':'')+dot(tail)+(bareDoi?' doi:'+bareDoi:'');
    }else if(kind==='book'){
      ref=head+dot(I(d.title))+' '+dot([d.source,y].filter(Boolean).join('; '))+(link?' '+link:'');
    }else{
      const pub=moName?' Published '+moName+(dy?' '+dy:'')+', '+y+'.':' Published '+y+'.';
      const ac=acc?' Accessed '+CIT_MONTHS[acc.m-1]+' '+acc.d+', '+acc.y+'.':'';
      ref=head+dot(d.title)+' '+(d.source?dot(d.source):'')+pub+ac+(link?' '+link:'');
    }
    intext='['+(num||'?')+']';sup=true;
  }
  ref=ref.replace(/[ \t]{2,}/g,' ').trim();
  let pre='';
  if(num){
    if(st==='ieee')pre='['+num+'] ';
    else if(st==='vancouver'||st==='ama')pre=num+'. ';
  }
  const refPlain=pre+citBare(ref);
  const refHTML=escHTML(pre)+citHTMLof(ref);
  return{ref:refPlain,refHTML:refHTML,intext:intext,sup:sup,num:num};
}
