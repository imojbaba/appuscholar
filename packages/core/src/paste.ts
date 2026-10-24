/* Wave B2 (Task 19, register row D-S2-124; rulings B2-R17, B2-R18, B2-R20 and B2-R36): "Already have a paper? Paste a link, DOI or PubMed number". v1's Citation Manager reads a DOI,
   a doi.org or PubMed link, a PubMed number or a title (citLookup 7931-7961, fetch/crossref.ts); this reads what a student pastes into Find's box as one of five ids (a DOI, a PubMed
   number, a PMC number, an arXiv id, an OpenAlex id) and looks the paper up as a library entry. A link with no id in it and a title are told apart so the panel can say what to do; neither
   is looked up. citLookup, citExtractDoi and citExtractPmid are v1's and unchanged; the lookups here are named beside them.
   Every request goes to OpenAlex, PubMed E-utilities or Crossref, the hosts connect-src already holds; a request carries only the id. */
import type { CitationEntry } from "./citation";
import { citExtractDoi, citExtractPmid, crLookupDoiV2 } from "./fetch/crossref";
import { oaWorkByRef, oaWorkToEntry } from "./fetch/openalex";
import type { OaWork } from "./fetch/openalex";
import { pmPaperById, pmcidToIds, pmidToDoi } from "./fetch/pubmed";
import { rsEntryFromResultV2, rsReconstructAbstract } from "./research";

/** What was pasted: one of five ids, a link with no id in it, a title (any other text), or nothing. */
export type PastedRef =
  | { k: "doi" | "pmid" | "pmcid" | "arxiv" | "openalex"; v: string }
  | { k: "link" }
  | { k: "text"; v: string }
  | { k: "empty" };

/**
 * Reads a pasted string, the first match winning: blank is empty; a DOI (citExtractDoi, which reads doi.org links and publisher links that carry a `10.` DOI; lower case, and from a link the
 * DOI stops at a `?` or `#` and loses a closing `/`); an arXiv id (an arxiv.org abs or pdf link, `arXiv:` or a bare id, the version dropped); a PMC number (any case, upper-cased); a PubMed
 * number (citExtractPmid); an OpenAlex id (an openalex.org link, with or without `works/`, or a bare `W…`); any other `https?://` is a link; anything else is a title.
 */
export function parsePasted(s: string): PastedRef{
  const t=String(s??"").trim();
  if(!t)return{k:"empty"};
  let doi=citExtractDoi(t);
  if(doi&&/^https?:\/\//i.test(t))doi=doi.replace(/[?#].*$/,"").replace(/\/+$/,"");
  if(doi)return{k:"doi",v:doi};
  const ax=/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i.exec(t)||/arXiv:\s*(\d{4}\.\d{4,5})/i.exec(t)||/^(\d{4}\.\d{4,5})(?:v\d+)?$/.exec(t);
  if(ax)return{k:"arxiv",v:ax[1]!};
  const pmc=/\bPMC(\d{4,9})\b/i.exec(t);
  if(pmc)return{k:"pmcid",v:"PMC"+pmc[1]};
  const pmid=citExtractPmid(t);
  if(pmid)return{k:"pmid",v:pmid};
  const oa=/openalex\.org\/(?:works\/)?(W\d{4,12})/.exec(t)||/^(W\d{4,12})$/.exec(t);
  if(oa)return{k:"openalex",v:oa[1]!};
  if(/https?:\/\//i.test(t))return{k:"link"};
  return{k:"text",v:t};
}

/**
 * What the panel gets back: the paper as a library entry, with the abstract and the free copy's address when the source is OpenAlex and has them; or why there is no paper. "nf": the id
 * names no paper. "fail": a source could not be reached (a thrown fetch, an HTTP error, OpenAlex's spent budget). "link", "text" and "empty": nothing was looked up.
 */
export type PasteResult =
  | { result: "ok"; entry: CitationEntry; abstract?: string; oa?: string }
  | { result: "nf" | "fail" | "link" | "text" | "empty" };

const NF: PasteResult={result:"nf"};

/** An OpenAlex work as the panel keeps it: the entry (every author, volume, issue, pages, DOI), its abstract put back into text, and its free copy by rsFetchOpenAlex's rule (open and an http address). */
function fromWork(w: OaWork): PasteResult{
  const out: Extract<PasteResult,{ result: "ok" }>={result:"ok",entry:oaWorkToEntry(w)};
  const abstract=rsReconstructAbstract(w.abstract_inverted_index);
  if(abstract)out.abstract=abstract;
  const oa=w.open_access;
  if(oa&&oa.is_oa&&/^https?:\/\//i.test(oa.oa_url||""))out.oa=oa.oa_url as string;
  return out;
}

/** A DOI: Crossref's entry (crLookupDoiV2), else OpenAlex's work for that DOI (a DOI Crossref does not hold, such as an arXiv one). null when neither knows it. */
async function byDoi(f: typeof fetch,doi: string,key?: string): Promise<PasteResult | null>{
  const e=await crLookupDoiV2(f,doi);
  if(e)return{result:"ok",entry:e};
  const w=await oaWorkByRef(f,"doi:"+doi,key);
  return w?fromWork(w):null;
}

/** A PubMed paper kept as PubMed lists it (no Crossref entry to prefer): rsEntryFromResultV2 as "+ Citation library" writes a PubMed result. null when PubMed does not know the number. */
async function byPubmed(f: typeof fetch,pmid: string): Promise<PasteResult | null>{
  const p=await pmPaperById(f,pmid);
  if(!p)return null;
  const entry=rsEntryFromResultV2(p,"apa");
  delete entry.style;
  return{result:"ok",entry};
}

/**
 * Looks a pasted id up. The routes:
 * - doi: Crossref (crLookupDoiV2), else OpenAlex by `doi:<doi>`;
 * - pmid: the DOI PubMed lists (pmidToDoi) then Crossref's entry for it, else PubMed's own record of the paper (pmPaperById);
 * - pmcid: OpenAlex by `pmcid:<PMC number>`, else (it holds no PMC numbers; the recorded request answers 404) PubMed Central names the paper's DOI and PMID (pmcidToIds), and the DOI
 *   goes the doi route and the PMID, when the DOI finds nothing, the PubMed route;
 * - arxiv: OpenAlex by `doi:10.48550/arxiv.<id>` (an arXiv id is a DataCite DOI);
 * - openalex: OpenAlex by the id.
 * A link, a title and nothing send no request. A thrown fetch or an HTTP error from a source is "fail", never a half answer. `key` is the OpenAlex key, as everywhere.
 */
export async function pasteLookup(f: typeof fetch,r: PastedRef,key?: string): Promise<PasteResult>{
  if(r.k==="link"||r.k==="text"||r.k==="empty")return{result:r.k};
  try{
    let out: PasteResult | null=null;
    if(r.k==="doi")out=await byDoi(f,r.v,key);
    else if(r.k==="pmid"){
      const doi=await pmidToDoi(f,r.v);
      const e=doi?await crLookupDoiV2(f,doi):null;
      out=e?{result:"ok",entry:e}:await byPubmed(f,r.v);
    }else if(r.k==="pmcid"){
      const w=await oaWorkByRef(f,"pmcid:"+r.v,key);
      if(w)out=fromWork(w);
      else{
        const ids=await pmcidToIds(f,r.v);
        if(ids){
          if(ids.doi)out=await byDoi(f,ids.doi,key);
          if(!out&&ids.pmid)out=await byPubmed(f,ids.pmid);
        }
      }
    }else if(r.k==="arxiv"){
      const w=await oaWorkByRef(f,"doi:10.48550/arxiv."+r.v,key);
      out=w?fromWork(w):null;
    }else{
      const w=await oaWorkByRef(f,r.v,key);
      out=w?fromWork(w):null;
    }
    return out||NF;
  }catch{return{result:"fail"}}
}
