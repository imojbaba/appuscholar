/* Europe PMC's open-access full text (Wave B2, Task 21b; OJ's answer 2, rulings B2-R21, B2-R35 and B2-R39). v1 has nothing like it: a student adds a PDF by hand. The Reading list asks Europe PMC
   for the text of a kept paper that has a DOI or a PMC number, so a paper that is open access comes in by itself. Europe PMC answers cross-origin requests (checked 2026-10-24: both
   endpoints send `access-control-allow-origin: *`), so the page asks directly and the API sees nothing.
   Two requests at most, both GET with no header and no body:
   - `search?query=DOI:<doi>&format=json&resultType=lite` names the paper's PMCID (a DOI of plain characters is sent as it is; any other is quoted and percent-encoded, because an unquoted
     "(" gives no hit);
   - `<PMCID>/fullTextXML` gives the JATS XML, which the web side reads into pages of text.
   Only a DOI or a PMC number is ever sent: no title, no author, no key, no mailto. The gate applies to the DOI route: a paper found by its DOI is asked for only when the search lists a
   PMCID and says it is open access and in Europe PMC (`isOpenAccess` Y and `inEPMC` Y), because Europe PMC holds the full text of other papers too but may not serve it. A PMCID the
   caller gives skips the search, so it skips that gate too: the caller only gives a PMCID that Europe PMC (or PubMed Central) named for the paper.
   The answer tells the caller whether to ask again (B2-R39). "none": Europe PMC has no text for this paper, which the caller remembers: a well-formed 200 search with no usable hit
   (no record, no PMCID, not open access, not in Europe PMC), a 400 search, a 404 or 410 full text. "failed": the request did not get a real answer, which the caller tries again next
   session: the fetch threw (offline, or CORS refused it; no `status`), 408, 425, 429, any 5xx (an unknown PMCID answers 500 JSON, not 404, and a PMCID the web asks for was named by
   Europe PMC, so a 500 is the server's bad minute), any other status, or a 200 that is not what Europe PMC sends (a network's sign-in page, a search without its result list, text
   that is not JATS). `status` is the HTTP status of a non-200 answer; a thrown fetch and a 200 of the wrong shape have none. It never rejects. Public bibliographic data only.
   test/fetch/europepmc.test.ts over the recordings of 2026-10-24 (test/fetch/recorded, `capture.mjs --only epmc-...`) and inline fakes for the error statuses. */

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest/";
/** A DOI as citExtractDoi reads one, with no white space, quote, backslash or angle bracket in it. */
const DOI = /^10\.\d{4,9}\/[^\s"\\<>]+$/;
const PMCID = /^PMC\d{1,10}$/;
/**
 * JATS as Europe PMC sends it: the `article` element as the root, after any XML declaration, processing instruction, comment or DOCTYPE (with or without an internal subset) that
 * the service puts before it. Only the start of the body is read. A page that merely has an `article` element somewhere in it (a sign-in page) does not match.
 */
const JATS = /^\uFEFF?\s*(?:(?:<\?[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)\s*)*<article[\s>]/;

type SearchHit = { doi?: unknown; pmcid?: unknown; isOpenAccess?: unknown; inEPMC?: unknown };

export type EpmcResult = { result: "ok"; pmcid: string; xml: string } | { result: "none" } | { result: "failed"; status?: number };

const none = (): EpmcResult => ({ result: "none" });
const failed = (status?: number): EpmcResult => (status === undefined ? { result: "failed" } : { result: "failed", status });

/** The search for a DOI: a DOI of plain characters as it is, any other quoted and percent-encoded with the slash kept. */
function searchUrl(doi: string): string{
  const q=/^[A-Za-z0-9._/-]+$/.test(doi)?doi:encodeURIComponent('"'+doi+'"').replace(/%2F/g,"/");
  return REST+"search?query=DOI:"+q+"&format=json&resultType=lite";
}

/**
 * The open-access full text of a paper, by its PMCID or else its DOI. A PMCID (any case) goes straight to fullTextXML; with a DOI only, the search names the PMCID first, and only a hit
 * for this DOI (any case, anywhere in the list) with a PMCID, `isOpenAccess` Y and `inEPMC` Y is asked for. A reference that is neither a DOI nor a PMCID sends nothing and finds no text.
 * Which answers are "none" and which "failed" is in the header (ruling B2-R39).
 */
export async function epmcFullText(f: typeof fetch,ref: { doi?: string; pmcid?: string }): Promise<EpmcResult>{
  const given=String(ref.pmcid||"").trim().toUpperCase();
  let pmcid=PMCID.test(given)?given:"";
  if(!pmcid){
    const doi=String(ref.doi||"").trim();
    if(!DOI.test(doi))return none();
    try{
      const s=await f(searchUrl(doi));
      if(s.status===400)return none();
      if(s.status!==200)return failed(s.status);
      const j=await s.json() as { resultList?: { result?: SearchHit[] | null } | null } | null;
      const hits=j&&j.resultList&&j.resultList.result;
      if(!Array.isArray(hits))return failed();
      const hit=hits.find(h=>!!h&&typeof h.doi==="string"&&h.doi.toLowerCase()===doi.toLowerCase()&&typeof h.pmcid==="string"&&PMCID.test(h.pmcid)&&h.isOpenAccess==="Y"&&h.inEPMC==="Y");
      if(!hit)return none();
      pmcid=hit.pmcid as string;
    }catch{return failed()}
  }
  try{
    const r=await f(REST+pmcid+"/fullTextXML");
    if(r.status===404||r.status===410)return none();
    if(r.status!==200)return failed(r.status);
    const xml=await r.text();
    return JATS.test(xml.slice(0,16384))?{result:"ok",pmcid,xml}:failed();
  }catch{return failed()}
}
