/* v1's citation library services (index.html): a source's key and library number (citKey 7488, citNumFor 7489-7493), which of the student's documents cite it (citPlainDocs 7515-7523, citRegex
   7524-7529, citNumsIn 7530-7538, citUsageNumbered 7539-7548, citUsage 7549-7555), the reference list block (citInsertBib 7871-7881) and the library file (citExport 7991-7998, citImport 7999-8023).
   In v2 the library and the documents live encrypted in the vault, so what v1 read from the page or from localStorage inside a function is a parameter here, decrypted by the caller: `lib` for the
   stored library (citGetLib 7054), the documents' HTML for docsGet (3114), `style` for #citStyle's value. The code is v1's as v1 wrote it, cut out of index.html by a script and changed only by the
   edits listed here: the same strings, regex sources and flags (citRegex's pattern and `gu`, citNumsIn's dash class with v1's en dash, citUsageNumbered's bracket pattern), the same 200-wide range
   cap, sort, markup, `slice(0,2000)`, duplicate rule and import defaults, in v1's order. What differs from v1's text:
   - parameter and return types, `export`, and the types PlainDoc and Usage;
   - citNumFor(lib, d): v1's `const l=citGetLib()` is `const l=lib`;
   - docPlainForCitations(id, title, html) is citPlainDocs for one document. v1 maps docsGet() (3114: imgHydrate on each body), takes the open document's HTML from the live editor (7518) and passes
     each body through bodyToHTML (7519); here the caller hands the document's HTML (v2 bodies are HTML already, and the panel hands the editor's HTML for the open document). A document with no
     body is passed as "": v1's `(d.body||'')` (7518) has no counterpart here, and docTextContent and docElementTexts throw a TypeError on anything but a string. v1's `div.textContent`
     is docTextContent(html), whose `||''` is kept; `[].map.call(div.querySelectorAll('sup,...'),x=>x.textContent||'')` is docElementTexts(html,citSupMatch) (doctext.ts, over its one tokeniser),
     citSupMatch being 7520's selector read clause by clause (new: exported for doctext-elements.test.ts, not from index.ts); an element's textContent is never null, so that `||''` has
     nothing to do and is dropped. v1's comment above citPlainDocs (7510-7514) is kept above it;
   - citUsage(entry, docs, idx, style): v1's `document.getElementById('citStyle').value` (7550) is `style`;
   - citNumsIn's `new Set()` is `new Set<number>()`, citUsageNumbered's and citUsage's `const out=[]` is `Usage[]`; a `!` on each read v1 trusts to exist (noUncheckedIndexedAccess): `l[i]` in
     citNumFor, `m[1]` and `m[2]` in citNumsIn;
   - bibliography(lib, style) is citInsertBib's 7871-7876 with `const l=lib` and `const st=style`, returning the data the block is made of: `head` is the style's heading text (CIT_STYLES, unescaped),
     `numbered`, and the items in v1's order, each with its index in the library, its number (`numbered?x.i+1:0`, 7878) and `fmt`, citFmt(d,number,style) (v1's citFmt(d,n) reads the style from
     #citStyle, 7325). bibliographyHtml(lib, style) is 7877-7879: the same heading and item markup around escHTML(head) and each item's refHTML, returned instead of handed to
     insertHTMLBlockIntoEditor; the heading is escaped after the items are formatted (both are pure). The empty-library toast (7872) and the toast after inserting (7880) are the panel's: v1 inserts
     nothing for an empty library, and bibliography([]) has no items;
   - exportLibrary(lib) is the text of citExport's file, `JSON.stringify(l,null,2)` (7994), and LIBRARY_FILE_NAME its `a.download` (7995); the Blob, the download and the toast are the panel's;
   - mergeLibrary(existing, incoming) is citImport's onload body (8004-8018). `incoming` is the parsed file, v1's `JSON.parse(r.result)`: the panel reads and parses the file, and a file that does not
     parse is the same outcome as one whose root is not an array (v1 shows one toast for both, 8018). `const l=citGetLib()` is `const l=existing.slice()`: v1's is a fresh array parsed from storage,
     so the caller's array is not changed (the entries already in it stay the caller's objects). citSaveLib(l) and the two toasts become the result, { ok: true, lib, added } or { ok: false, reason:
     "not-a-library" }, and `catch(e)` is `catch` (the binding was unused). An imported entry keeps v1's 12 fields (8010-8013): month, day, accessed, container, editors, number and degree are dropped;
   - LIBRARY_IMPORT_MAX_BYTES is the size citImport checks before reading, `3*1024*1024` (8001); the panel checks the File against it (register row D-W1-2).
   Not ported: the page code of 7466-7509 (citReadForm, citClearForm, citInsertAtCursor, citPutIntext, citInsert, citAdd, citDel) and citRender (7819), which calls these functions. These lines declare
   with const and let only, so no `var` changed. */
import { CIT_STYLES, citFmt, citIsNumbered, citLastName } from "./citation";
import type { CitationEntry, CitationStyle, Formatted } from "./citation";
import { docElementTexts, docTextContent } from "./doctext";
import { escHTML } from "./html";

/** One document as citPlainDocs (7521) reads it: the text with each run of white space made one space, and the text of each superscript. */
export type PlainDoc = { id: string; title: string; text: string; sups: string[] };
/** A document that cites a source, and how many times (citUsageNumbered 7545, citUsage 7553). */
export type Usage = { id: string; title: string; n: number };

export function citKey(d: CitationEntry): string{return[citLastName(d.author),String(d.year||'').trim(),String(d.title||'').trim().toLowerCase()].join('|')}
export function citNumFor(lib: CitationEntry[],d: CitationEntry): { n: number; saved: boolean }{
  const l=lib,k=citKey(d);
  for(let i=0;i<l.length;i++)if(citKey(l[i]!)===k)return{n:i+1,saved:true};
  return{n:l.length+1,saved:false};
}
/* [v1's wording, kept as v1 wrote it (7510-7514). docPlainForCitations reads neither localStorage nor the live editor: the caller hands it each document's HTML.] */
/* Backlinks, scaled down to one student: for each library source, which of their own documents
   cite it. No graph database — a plain-text scan of the documents already in localStorage, matching
   the author's surname followed within ~40 characters by the year, which covers (Smith, 2020),
   (Smith & Lee, 2020), (Smith et al., 2020) and Smith (2020) alike. The open document is read from
   the live editor, not its last autosave, so a citation typed a second ago already counts. */
/* The selector of 7520, 'sup,span[style*="vertical-align: super"],span[style*="vertical-align:super"]', read literally for docElementTexts: a clause per part, in order; [attr*="v"] holds when the attribute's value contains v (absent: no). */
export function citSupMatch(tag: string,attr: (name: string)=>string|null): boolean{return tag==='sup'||tag==='span'&&(attr('style')??'').includes('vertical-align: super')||tag==='span'&&(attr('style')??'').includes('vertical-align:super')}
export function docPlainForCitations(id: string,title: string,html: string): PlainDoc{
  const sups=docElementTexts(html,citSupMatch);
  return{id:id,title:title||'Untitled',text:(docTextContent(html)||'').replace(/\s+/g,' '),sups:sups};
}
export function citRegex(entry: CitationEntry): RegExp | null{
  const ln=citLastName(entry.author),y=String(entry.year||'').trim();
  if(!ln||ln==='Author'||!/^\d{4}$/.test(y))return null;
  const esc=ln.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(?<![\\p{L}])'+esc+'(?![\\p{L}])[^;()]{0,40}?[\\s(,]+'+y+'[a-z]?(?!\\d)','gu');
}
export function citNumsIn(str: string): Set<number>{
  const out=new Set<number>();
  String(str).split(',').forEach(seg=>{
    const m=seg.trim().match(/^(\d{1,3})\s*[–-]\s*(\d{1,3})$/);
    if(m){const a=+m[1]!,b=+m[2]!;if(b>=a&&b-a<200)for(let i=a;i<=b;i++)out.add(i)}
    else if(/^\d{1,3}$/.test(seg.trim()))out.add(+seg.trim());
  });
  return out;
}
export function citUsageNumbered(n: number,docs: PlainDoc[]): Usage[]{
  const out: Usage[]=[];
  docs.forEach(d=>{
    let c=0;
    (d.text.match(/\[\s*\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\s*\]/g)||[]).forEach(g=>{if(citNumsIn(g.replace(/[\[\]]/g,'')).has(n))c++});
    (d.sups||[]).forEach(sx=>{if(citNumsIn(sx).has(n))c++});
    if(c)out.push({id:d.id,title:d.title,n:c});
  });
  return out;
}
export function citUsage(entry: CitationEntry,docs: PlainDoc[],idx: number,style: CitationStyle): Usage[]{
  if(citIsNumbered(style)&&idx>=0)return citUsageNumbered(idx+1,docs);
  const re=citRegex(entry);if(!re)return[];
  const out: Usage[]=[];
  docs.forEach(d=>{const n=(d.text.match(re)||[]).length;if(n)out.push({id:d.id,title:d.title,n})});
  return out;
}
export function bibliography(lib: CitationEntry[],style: CitationStyle): { head: string; numbered: boolean; items: Array<{ entry: CitationEntry; index: number; number: number; fmt: Formatted }> }{
  const l=lib;
  const st=style;
  const meta=CIT_STYLES[st]||CIT_STYLES.apa,numbered=meta.numbered;
  const items=l.map((d,i)=>({d:d,i:i}));
  if(!numbered)items.sort((a,b)=>citLastName(a.d.author).localeCompare(citLastName(b.d.author),'en',{sensitivity:'base'}));
  return{head:meta.head,numbered:numbered,items:items.map(x=>({entry:x.d,index:x.i,number:numbered?x.i+1:0,fmt:citFmt(x.d,numbered?x.i+1:0,st)}))};
}
/** An empty library gives `<p><br></p>` and the heading alone; v1 inserted nothing and showed a toast instead (7872), which the panel reproduces. */
export function bibliographyHtml(lib: CitationEntry[],style: CitationStyle): string{
  const b=bibliography(lib,style);
  const head='<p class="ref-head" style="text-align:center;margin:14px 0 8px"><b>'+escHTML(b.head)+'</b></p>';
  const body=b.items.map(x=>'<p class="ref-item" style="padding-left:2em;text-indent:-2em;margin:0 0 6px">'+x.fmt.refHTML+'</p>').join('');
  return '<p><br></p>'+head+body;
}
/** An empty library gives `[]`; v1 wrote no file and showed a toast instead (7992), which the panel reproduces. */
export function exportLibrary(lib: CitationEntry[]): string{const l=lib;return JSON.stringify(l,null,2)}
export const LIBRARY_FILE_NAME='psychology-class-library.json';
export const LIBRARY_IMPORT_MAX_BYTES=3*1024*1024;
export function mergeLibrary(existing: CitationEntry[],incoming: unknown): { ok: true; lib: CitationEntry[]; added: number } | { ok: false; reason: "not-a-library" }{
  try{
    const arr=incoming;
    if(!Array.isArray(arr))throw new Error('bad');
    const l=existing.slice();let added=0;
    arr.slice(0,2000).forEach(d=>{
      if(d&&d.author&&d.title&&!l.some(e=>e.title===String(d.title)&&e.author===String(d.author))){
        l.push({author:String(d.author),year:String(d.year||''),title:String(d.title),source:String(d.source||''),
                volume:String(d.volume||''),issue:String(d.issue||''),pages:String(d.pages||''),
                doi:String(d.doi||''),url:String(d.url||''),type:String(d.type||'Journal article'),style:String(d.style||'apa'),
                lang:String(d.lang||'en')});
        added++;
      }
    });
    return{ok:true,lib:l,added:added};
  }catch{return{ok:false,reason:'not-a-library'}}
}

/* Task 8a (Stage 2): two pieces of the Citation Manager's page code, cut from index.html as v1 wrote them, with these edits only:
   - citMissingNumbers(docs, cur, libLen) is 7810-7817: v1's `const cur=docCurrentId()` (3116, the open document's id from localStorage) is the parameter `cur`; types; the `!` v1 trusts nowhere
     (no indexed read is made here). The `[n]` bracket pattern and the superscript test `/^[\d,\s–-]+$/` (with v1's en dash) are v1's.
   - citCaretEntry(lib, text, s, e) is the matching loop of citCaretEntry 7686-7693. v1 reads the selection (7676-7684): the caret's block element (P, DIV, LI, H1-H6, BLOCKQUOTE, TD, TH, PRE),
     its textContent `text`, and `s`/`e`, the lengths of the block's text before the selection's start and end; here the caller hands those three and the library (`citGetLib()` 7685 is `lib`).
     v1's `return null` (no selection in the editor) and `return -1` (no block) stay the caller's. */
export function citMissingNumbers(docs: PlainDoc[],cur: string,libLen: number): number[]{
  const d=docs.find(x=>x.id===cur);if(!d)return[];
  const all=new Set<number>();
  (d.text.match(/\[\s*\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\s*\]/g)||[]).forEach(g=>citNumsIn(g.replace(/[\[\]]/g,'')).forEach(n=>all.add(n)));
  (d.sups||[]).forEach(sx=>{if(/^[\d,\s–-]+$/.test(sx))citNumsIn(sx).forEach(n=>all.add(n))});
  return Array.from(all).filter(n=>n>libLen).sort((a,b)=>a-b);
}
export function citCaretEntry(lib: CitationEntry[],text: string,s: number,e: number): number{
  for(let i=0;i<lib.length;i++){
    const re=citRegex(lib[i]!);if(!re)continue;
    let m;
    while((m=re.exec(text))){
      if(m.index-1<=e&&m.index+m[0].length+1>=s)return i;
      if(m[0].length===0)re.lastIndex++;
    }
  }
  return -1;
}
