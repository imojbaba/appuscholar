/* The pieces of v1's Analyse a paper page code ("Analyse a paper (Version 30)", index.html build 2026.10.13a) that decide or format something, which analyse.ts left out because they sit in
   the page: the intake's rules (apLoad 9882-9891, apFromPaste 9894-9899, apFromFile 9900-9916, apShelfFill 9917-9922) and two things apRender and apNumbersHTML compute while they draw
   (the preview of "Check what Appuscholer read", 11282, and the recomputed p of each statistic, 10108-10109). The panel (apps/web/components/tools/analyse) composes the sentences around them.
   The code is v1's as v1 wrote it, cut out of its lines and changed only by the edits listed here:
   - each piece is a function of its own with typed parameters and `export`; what v1 reads from the page is a parameter: the file's name (`f.name`), the pasted or extracted text, the loaded
     paper (`AP.doc`, `d`), one statistic of AP.numbers (`x`), one record of the shelf (`p`), and the fallbacks that are copy ('Pasted paper' 9897, 'Paper' 9919), which the panel gives through t();
   - apFileKind returns which of apFromFile's branches a name takes (its tests in v1's order on the lower-cased name, 9903-9914), in place of running the branch;
   - apLoadRefusal returns which of apLoad's two refusals applies (9883-9885), "abstract" or "text", or null, in place of showing the toast and returning false.
   Golden: test/golden/appanel (v1's apFromFile, apFromPaste, apLoad, apRender and apNumbersHTML driven in jsdom). */
import type { ApDoc, ApNumber } from "./analyse";

/** apFromFile (9903-9914): the branch a file's name takes, tested in v1's order on the name in lower case: .pdf, .docx, .txt, then the refused .doc; anything else is "other". */
export function apFileKind(name: string): "pdf" | "docx" | "txt" | "doc" | "other"{
  const n=name.toLowerCase();
  if(/\.pdf$/.test(n))return'pdf';
  else if(/\.docx$/.test(n))return'docx';
  else if(/\.txt$/.test(n))return'txt';
  else if(/\.doc$/.test(n))return'doc';
  else return'other';
}
/** The file's name without its .pdf (9904, the fallback title of shGuessTitle) or .txt (9912, the title of a text file), any case. */
export function apFileStem(name: string, kind: "pdf" | "txt"): string{return kind==='pdf'?name.replace(/\.pdf$/i,''):name.replace(/\.txt$/i,'')}
/** A Word file's text as apFromFile keeps it (9908): mammoth's extractRawText value with each run of three or more line breaks made two. */
export function apDocxText(value: string): string{return (value||'').replace(/\n{3,}/g,'\n\n')}
/** The title of a pasted paper (9897) and of a Word file (9909): the first line longer than 8 characters once trimmed, else the fallback ('Pasted paper', or the file's name), cut to 140 characters. */
export function apTitleOf(text: string,fallback: string): string{return (text.split('\n').map(x=>x.trim()).filter(x=>x.length>8)[0]||fallback).slice(0,140)}
/** apLoad's two refusals (9883-9885): an abstract with fewer than 150 characters that are not white space ("abstract"), any other paper with fewer than 500 ("text"); null when the paper loads. */
export function apLoadRefusal(pages: string[],src: string): "abstract" | "text" | null{
  const text=pages.join('\n');
  if(src==='abstract'){if(text.replace(/\s+/g,'').length<150)return'abstract'}
  else if(text.replace(/\s+/g,'').length<500)return'text';
  return null;
}
/** A shelf record's line in the dropdown (9919): its title, else its file name, else the fallback ('Paper'), cut to 90 characters. */
export function apShelfLabel(p: { title?: string; file?: string },fallback: string): string{return (p.title||p.file||fallback).slice(0,90)}
/** The text under "Check what Appuscholer read" (11282): every piece's text, the reference list's too, joined by a blank line, cut to 2,500 characters. */
export function apPreview(doc: ApDoc): string{const d=doc;return d.chunks.map(c=>c.text).join('\n\n').slice(0,2500)}
/** "recomputed p about …" (10108-10109): the middle of the two recomputed ends, "< .001" below .001, else three decimals without the leading 0. */
export function apNumP(x: ApNumber): string{
  const f=(x: number)=>(x<0.001?'< .001':x.toFixed(3).replace(/^0/,''));
  return f((x.lo+x.hi)/2);
}
