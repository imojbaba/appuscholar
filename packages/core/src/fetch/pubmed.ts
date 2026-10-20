/* v1's PubMed calls (index.html build 2026.10.13a): rsPubmedAbstracts 8088-8102 (efetch XML; a failure only means no abstract), rsFetchPubmed 8103-8120
   (esearch, then esummary), the PubMed job of researchSearch 8297-8310 (withFallback and the catch, types.ts), here pmSearch, and citPmidToDoi 7920-7929,
   here pmidToDoi. The code is v1's, with the URLs, the field reads and the order kept. What differs:
   - `f` (the page's fetch) is the first argument of each function, in place of the global fetch;
   - rsPubmedAbstracts reads the XML with xml.ts in place of DOMParser: `PubmedArticle` is every element of that name, `MedlineCitation > PMID` the first
     PMID whose parent is a MedlineCitation, `Abstract > AbstractText` every AbstractText whose parent is an Abstract (register D-S2-5);
   - pmSearch builds the query with rsBuildQuery, as researchSearch does (8306); retmax 15 when ranking, else 6;
   - pmidToDoi returns null where citPmidToDoi returns '' (no DOI); an HTTP error still rejects;
   - types, and `as` casts on the JSON read.
   Wave A (walk fault W2, register row D-S2-24): rsFetchPubmed's result also carries `authorList` (every name), `volume`, `issue` and `pages` (PubMed's short range
   written out by pmFullPages); `authors` is still v1's card line. test/fetch/pubmed.test.ts holds v1View(result) to the golden. */
import { rsBuildQuery } from "../research";
import { settle, withFallback } from "./types";
import type { PmPaper, SearchResult } from "./types";
import { xmlAll, xmlParse, xmlText } from "./xml";
import type { XmlEl } from "./xml";

type ESearch = { esearchresult?: { idlist?: string[] } };
type ESummaryItem = { title?: string; authors?: Array<{ name?: string }>; pubdate?: string; fulljournalname?: string; source?: string; volume?: string; issue?: string; pages?: string; articleids?: Array<{ idtype?: string; value?: string }> };
type ESummary = { result?: Record<string, ESummaryItem | undefined> };

const child = (parent: string, name: string) => (el: XmlEl) => el.name === name && !!el.parent && el.parent.name === parent;

export async function rsPubmedAbstracts(f: typeof fetch,ids: string[]): Promise<Record<string, string>>{
  const out: Record<string, string>={};
  try{
    const r=await f('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id='+ids.join(','));
    if(!r.ok)return out;
    const doc=xmlParse(await r.text());
    xmlAll(doc,el=>el.name==='PubmedArticle').forEach(a=>{
      const pm=xmlAll(a,child('MedlineCitation','PMID'))[0];if(!pm)return;
      const parts: string[]=[];xmlAll(a,child('Abstract','AbstractText')).forEach(t=>{const lab=t.attrs['Label'];parts.push((lab?lab+': ':'')+(xmlText(t)||'').trim())});
      const txt=parts.join(' ').replace(/\s+/g,' ').trim();
      if(txt)out[xmlText(pm).trim()]=txt;
    });
  }catch{/* v1: catch(e){} */}
  return out;
}

export async function rsFetchPubmed(f: typeof fetch,q: string,per?: number): Promise<PmPaper[]>{
  const s=await f('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax='+(per||6)+'&term='+encodeURIComponent(q));
  if(!s.ok)throw new Error('HTTP '+s.status);
  const sj=await s.json() as ESearch;
  const ids=(sj.esearchresult&&sj.esearchresult.idlist)||[];
  if(!ids.length)return[];
  const d=await f('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id='+ids.join(','));
  if(!d.ok)throw new Error('HTTP '+d.status);
  const dj=await d.json() as ESummary;
  const abs=await rsPubmedAbstracts(f,ids);
  return ids.map((id): PmPaper | null=>{
    const it=dj.result&&dj.result[id];if(!it)return null;
    const authors=(it.authors||[]).map(a=>a.name).filter(Boolean) as string[];
    return{source:'PubMed',ssId:null,title:it.title||'Untitled',
      authors:authors.length>4?authors.slice(0,4).join(', ')+', et al.':authors.join(', ')||'Unknown authors',
      year:(it.pubdate||'').slice(0,4),venue:it.fulljournalname||it.source||'',
      abstract:abs[id]||'',pmid:id,citationCount:0,doi:'',url:'https://pubmed.ncbi.nlm.nih.gov/'+id+'/',
      authorList:authors,volume:String(it.volume||''),issue:String(it.issue||''),pages:pmFullPages(String(it.pages||''))};
  }).filter(Boolean) as PmPaper[];
}

/** researchSearch's PubMed job (8306): the topic with the ticked terms and the kind of study, `retmax` 15 when ranking, else 6. Never rejects. */
export function pmSearch(f: typeof fetch,o: { q: string; terms?: string[]; design?: string; retmax?: number }): Promise<SearchResult<PmPaper>>{
  const terms=o.terms||[],design=o.design||'any';
  return settle(fb=>withFallback(s=>rsFetchPubmed(f,s,o.retmax||6),t=>rsBuildQuery(o.q,'pm',t,design),terms,fb));
}

/** citPmidToDoi (7920-7929): the DOI PubMed's esummary lists for the PMID, in lower case; null when it lists none. Rejects on an HTTP error. */
export async function pmidToDoi(f: typeof fetch,pmid: string): Promise<string | null>{
  const r=await f('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id='+encodeURIComponent(pmid));
  if(!r.ok)throw new Error('HTTP '+r.status);
  const j=await r.json() as ESummary;
  const rec=j.result&&j.result[pmid];
  const ids=(rec&&rec.articleids)||[];
  const d=ids.find(x=>x.idtype==='doi');
  return d?String(d.value).toLowerCase():null;
}

/** PubMed's page range written out: PubMed drops the leading digits the last page shares with the first ("123-30" is 123-130, "1171-9" is 1171-1179). Each
 * digits-only range is widened from the first page; one that would then end before it starts, and anything else ("e0123", "13317", "S12"), is left as it is. */
export function pmFullPages(p: string): string{
  return String(p||'').replace(/\b(\d+)-(\d+)\b/g,(m,a: string,b: string)=>{
    if(b.length>=a.length)return m;
    const full=a.slice(0,a.length-b.length)+b;
    return Number(full)>=Number(a)?a+'-'+full:m;
  });
}
