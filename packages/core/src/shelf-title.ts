/* Fix wave A (walk fault W15, register row D-S2-28): the title a PDF newly added to the Reading shelf takes. v1 named it by the first line of page 1 (shGuessTitle 11576-11579,
   `shTitleGuess` in shelf.ts, unchanged), which for a journal article is its running header ("1 Scientific Repo R t S | (2019) 9:13317 | ..."). A DOI printed on page 1 is asked of the
   library and then of Crossref (DOI only); a title is taken only when it is itself on page 1, so a DOI that is a reference or a "see also" cannot rename the paper. */
import { apSquash, retrNormDoi } from "./analyse";
import type { CitationEntry } from "./citation";
import { citExtractDoi } from "./fetch/crossref";
import { shTitleGuess } from "./shelf";

/** How long adding a paper waits for Crossref's title before it falls back. */
export const SHELF_TITLE_TIMEOUT_MS = 4000;

/** The DOI printed on page 1, or null. */
export function shPaperDoi(pages: string[]): string | null{
  return citExtractDoi(pages[0] ?? "")||null;
}

/** Whether `title` is printed in the first 4,000 characters of `page` (letters and digits only, any case); a title shorter than 20 such characters is too short to trust. */
export function shTitleOnPage(title: string,page: string): boolean{
  const t=apSquash(title);
  return t.length>=20&&apSquash(page.slice(0,4000)).includes(t);
}

/** `p`, or null when it has not settled in `ms` (or rejects). */
function within<T>(p: Promise<T>,ms: number): Promise<T | null>{
  return new Promise<T | null>(resolve=>{
    const timer=setTimeout(()=>resolve(null),ms);
    p.then(v=>{clearTimeout(timer);resolve(v)},()=>{clearTimeout(timer);resolve(null)});
  });
}

/**
 * The title and DOI for a new shelf paper, in this order: (1) a DOI on page 1 that a library entry has: its title; (2) a DOI on page 1 whose Crossref title is on page 1; (3) the longest
 * library title that is on page 1; (4) v1's first-line guess. `doi` is returned whenever page 1 prints one. A lookup that throws or takes 4 s is skipped.
 */
export async function resolveShelfTitle(pages: string[],fileStem: string,d: { lib: CitationEntry[]; lookupDoi(doi: string): Promise<CitationEntry | null> }): Promise<{ title: string; doi?: string }>{
  const doi=shPaperDoi(pages);
  const first=pages[0]??"";
  const out=(title: string)=>doi?{title,doi}:{title};
  if(doi){
    const own=d.lib.find(e=>retrNormDoi(e.doi||"")===doi&&String(e.title||"").trim());
    if(own)return out(String(own.title).trim());
    const cr=await within(Promise.resolve().then(()=>d.lookupDoi(doi)),SHELF_TITLE_TIMEOUT_MS);
    const ct=String(cr?.title||"").trim();
    if(ct&&shTitleOnPage(ct,first))return out(ct);
  }
  let best="";
  for(const e of d.lib){
    const t=String(e.title||"").trim();
    if(t.length>best.length&&shTitleOnPage(t,first))best=t;
  }
  if(best)return out(best);
  return out(shTitleGuess(pages,fileStem));
}
