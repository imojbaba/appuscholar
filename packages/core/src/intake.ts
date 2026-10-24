/* v1's data intake (index.html:9348-9371): statsSplitLine splits one line of a table on a delimiter, honouring double quotes, and statsParseText turns the text of a pasted or uploaded
   table into headers, rows and a description of each column. v1's statsParse (9389) and statsUpload (9403), the page code that reads the text box or the file and calls statsParseText,
   are not ported; every v1 tool that reads a table (the statistics tools, the personal-data scan in pdscan.ts) starts from statsParseText's result, `ParsedData` here.
   The code is v1's as v1 wrote it, line for line: lines are split on CRLF, CR or LF and the ones holding only white space dropped; the delimiter is a tab when the first line holds one and
   a comma otherwise (so a semicolon file is one column); a doubled quote inside quotes is one quote; every cell is trimmed; a row whose field count is not the header's is dropped, with no
   count kept (register row D-W2-2); a column is numeric when it has a value and every value that is not empty matches `/^-?\d+(\.\d+)?$/`, so `.5`, `1e3`, `+2`, `1,5`, a Unicode minus and
   `1 000` make it categorical (register row F17) and a column of 1s and 2s is numeric (register row F3); a blank header is named `'Col'+(i+1)`.
   test/golden/intake.test.ts holds both functions to v1's outputs on the corpus in test/golden/intake/corpus.json.
   What differs from v1's text is only what TypeScript needs:
   - parameter and return types, the exported types ParsedCol and ParsedData, and `export`;
   - statsParseText's local `split` takes `(l: string)`, since an arrow with no contextual type needs its parameter typed, and the arrow that builds a column declares its return type
     `ParsedCol` so that `type` keeps its two literals;
   - `!` on `lines[0]` (twice; `lines` is not empty after the early return) and on `v` in the numeric test (the filter before it drops undefined), for noUncheckedIndexedAccess. */

export type ParsedCol = { name: string; index: number; type: "numeric" | "categorical"; n: number };
export type ParsedData = { headers: string[]; rows: string[][]; cols: ParsedCol[] };

export function statsSplitLine(l: string,delim: string): string[]{
  const out=[];let cur='',inQ=false;
  for(let i=0;i<l.length;i++){
    const c=l[i];
    if(c==='"'){if(inQ&&l[i+1]==='"'){cur+='"';i++}else inQ=!inQ}
    else if(c===delim&&!inQ){out.push(cur);cur=''}
    else cur+=c;
  }
  out.push(cur);return out.map(s=>s.trim());
}
export function statsParseText(text: string): ParsedData | null{
  const lines=text.split(/\r\n|\r|\n/).filter(l=>l.trim().length);
  if(!lines.length)return null;
  const delim=lines[0]!.includes('\t')?'\t':',';
  const split=(l: string)=>statsSplitLine(l,delim);
  const headers=split(lines[0]!);
  const rows=lines.slice(1).map(split).filter(r=>r.length===headers.length);
  const cols=headers.map((h,i): ParsedCol=>{
    const vals=rows.map(r=>r[i]).filter(v=>v!==undefined&&v!=='');
    const numeric=vals.length>0&&vals.every(v=>/^-?\d+(\.\d+)?$/.test(v!));
    return{name:h||('Col'+(i+1)),index:i,type:numeric?'numeric':'categorical',n:vals.length};
  });
  return{headers,rows,cols};
}
