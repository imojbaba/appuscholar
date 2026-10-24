/* Europe PMC's open-access full text (Wave B2, Task 21b; OJ's answer 2, rulings B2-R21 and B2-R35). v1 has nothing like it: a student adds a PDF by hand. The Reading list asks Europe PMC
   for the text of a kept paper that has a DOI or a PMC number, so a paper that is open access comes in by itself. Europe PMC answers cross-origin requests (checked 2026-10-24: both
   endpoints send `access-control-allow-origin: *`), so the page asks directly and the API sees nothing.
   Two requests at most, both GET with no header and no body:
   - `search?query=DOI:<doi>&format=json&resultType=lite` names the paper's PMCID (a DOI of plain characters is sent as it is; any other is quoted and percent-encoded, because an unquoted
     "(" gives no hit);
   - `<PMCID>/fullTextXML` gives the JATS XML, which the web side reads into pages of text.
   Only a DOI or a PMC number is ever sent: no title, no author, no key, no mailto. A paper is asked for only when the search lists a PMCID and says it is open access and in Europe
   PMC (`isOpenAccess` Y and `inEPMC` Y): Europe PMC holds the full text of other papers too, but may not serve it.
   The answer tells the caller whether to ask again. "none": Europe PMC has no text for this paper (no record, no PMCID, not open access) or answered with any status but 200 (an unknown
   PMCID answers 500 JSON, not 404), so the caller remembers it. "failed": the fetch threw (offline, or CORS refused it) or a 200 was not what Europe PMC sends (a network's sign-in page),
   so the caller tries again next session. It never rejects. Public bibliographic data only. test/fetch/europepmc.test.ts over the recordings of 2026-10-24
   (test/fetch/recorded, `capture.mjs --only epmc-...`). */

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest/";
/** A DOI as citExtractDoi reads one, with no white space, quote, backslash or angle bracket in it. */
const DOI = /^10\.\d{4,9}\/[^\s"\\<>]+$/;
const PMCID = /^PMC\d{1,10}$/;
/** JATS as Europe PMC sends it: an optional XML declaration, then the `article` element. */
const JATS = /^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?<article[\s>]/;

type SearchHit = { doi?: unknown; pmcid?: unknown; isOpenAccess?: unknown; inEPMC?: unknown };

export type EpmcResult = { result: "ok"; pmcid: string; xml: string } | { result: "none" } | { result: "failed" };

const none = (): EpmcResult => ({ result: "none" });
const failed = (): EpmcResult => ({ result: "failed" });

/** The search for a DOI: a DOI of plain characters as it is, any other quoted and percent-encoded with the slash kept. */
function searchUrl(doi: string): string{
  const q=/^[A-Za-z0-9._/-]+$/.test(doi)?doi:encodeURIComponent('"'+doi+'"').replace(/%2F/g,"/");
  return REST+"search?query=DOI:"+q+"&format=json&resultType=lite";
}

/**
 * The open-access full text of a paper, by its PMCID or else its DOI. A PMCID (any case) goes straight to fullTextXML; with a DOI only, the search names the PMCID first, and only a hit
 * for this DOI (any case, anywhere in the list) with a PMCID, `isOpenAccess` Y and `inEPMC` Y is asked for. A reference that is neither a DOI nor a PMCID sends nothing and finds no text.
 */
export async function epmcFullText(f: typeof fetch,ref: { doi?: string; pmcid?: string }): Promise<EpmcResult>{
  const given=String(ref.pmcid||"").trim().toUpperCase();
  let pmcid=PMCID.test(given)?given:"";
  if(!pmcid){
    const doi=String(ref.doi||"").trim();
    if(!DOI.test(doi))return none();
    try{
      const s=await f(searchUrl(doi));
      if(s.status!==200)return none();
      const j=await s.json() as { resultList?: { result?: SearchHit[] | null } | null } | null;
      const hits=(j&&j.resultList&&Array.isArray(j.resultList.result))?j.resultList.result:[];
      const hit=hits.find(h=>!!h&&typeof h.doi==="string"&&h.doi.toLowerCase()===doi.toLowerCase()&&typeof h.pmcid==="string"&&PMCID.test(h.pmcid)&&h.isOpenAccess==="Y"&&h.inEPMC==="Y");
      if(!hit)return none();
      pmcid=hit.pmcid as string;
    }catch{return failed()}
  }
  try{
    const r=await f(REST+pmcid+"/fullTextXML");
    if(r.status!==200)return none();
    const xml=await r.text();
    return JATS.test(xml)?{result:"ok",pmcid,xml}:failed();
  }catch{return failed()}
}
