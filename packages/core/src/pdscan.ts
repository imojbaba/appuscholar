import { pdCsv } from "./csv";
import type { ParsedData } from "./intake";

/* v1's personal-data scan (index.html:9411-9460, items 47 and 56) and its transform (9463-9486): PD_HDR, the heading patterns by kind; PD_LABEL, the phrase the panel shows for each kind;
   PD_DEFAULT, the choice each kind starts with; pdTestVal, whether one value looks like a kind; pdScan, which columns of a parsed table look personal and which look like free text; and
   pdTransform, which writes the table back with the columns the student chose removed or replaced by a participant code, and the key that maps codes to the coded values. v1's comment
   above PD_HDR is kept (it is what the panel tells the student). pdCsvCell and pdCsv (9461-9462) are csv.ts; pdRender (9487), the page code that draws the panel, is not ported.
   The code is v1's as v1 wrote it, line for line: the same regex literals with their flags (PD_HDR's name pattern ends in the Devanagari word, outside the word boundaries, as in v1), the
   same thresholds (a kind's values at 0.6 or more of a column's non-empty values, in the order email, phone, govid, dob; the heading rule's exclusion words; a name or roll heading
   skipped when the column has 4 values or more and fewer than half are distinct; names by their values at 3 values or more, 0.8 distinct and 0.7 that look like names; free text when the
   first value is not a number and the mean length is above 40 or one value is longer than 120), the same `'Col'+(i+1)` for a blank heading, and pdTransform's `Map` from value to code,
   its codes `'P'+String(n).padStart(pad,'0')` with pad at least 3, a new code for every blank value, and ParticipantCode put where the first coded column stood among the kept ones.
   pdScan reads a `ParsedData` (intake.ts), as v1's pdScan reads statsParseText's result. test/golden/pdscan.test.ts holds every export to v1's outputs on the tables in
   test/golden/pdscan/corpus.json and on a grid of values for pdTestVal.
   What differs from v1's text is only what TypeScript and this package's lint need:
   - types: PdKind, PdFound, PdChoice, PdTransform, PD_HDR's tuple type, the Record types of PD_LABEL and PD_DEFAULT, parameter and return types, and `export`;
   - pdScan's `kind` and `why` are typed `PdKind|null` and `PdFound["why"]|''`, the loop's kind list is `as const` (so that `k` is a PdKind for pdTestVal), and the pushed record says
     `why:why as PdFound["why"]` where v1 writes the shorthand `why`, a type assertion that changes nothing at run time (a kind is never set without why);
   - pdTransform's arrays and maps are typed (`codeCols`, `dropCols`, `codes`, `key`, `rows`, `new Map<string,string>()`), `code` is declared `let code: string`, and the row loop's
     callback is `(r)=>` where v1 writes `(r,ri)=>`, whose `ri` it never reads (the no-unused-vars rule);
   - `!` for noUncheckedIndexedAccess on indexed reads that v1's control flow guarantees: pdScan's `vals[0]` (the column has a value after the early return), pdTransform's
     `data.headers[i]`, `codeCols[0]`, `r[i]` and `codes[ri]`, and on `map.get(v)` after `map.has(v)`. */

export type PdKind = "name"|"phone"|"email"|"roll"|"dob"|"address"|"govid";
export type PdFound = { index: number; name: string; kind: PdKind; why: "values"|"heading" };
export type PdChoice = "keep"|"remove"|"code";
export type PdTransform = { headers: string[]; rows: string[][]; key: { headers: string[]; rows: string[][] }; removed: number; coded: number; csv: string; keyCsv: string };

/* ============ Personal-data scan (items 47 and 56) ============
   Deterministic. Looks at column headings and at the shape of the values. It cannot see names
   written inside open answers, and the interface says so. */
export const PD_HDR: Array<[PdKind, RegExp]>=[
  ['name',/\b(full name|first name|last name|surname|student name|participant name|respondent name|candidate name|name|naam)\b|नाम/i],
  ['phone',/\b(phone|mobile|contact|cell|whatsapp|telephone|tel)\b/i],
  ['email',/e ?mail/i],
  ['roll',/\b(roll|enrol|enrolment|enrollment|registration|reg no|admission|usn|prn|student id|matric)\b/i],
  ['dob',/\b(dob|d o b|date of birth|birth date|birthday)\b/i],
  ['address',/\b(address|village|street|pin code|pincode|postcode|zip)\b/i],
  ['govid',/\b(aadhaar|aadhar|pan|passport|voter)\b/i]
];
export const PD_LABEL: Record<PdKind, string>={name:'looks like names',phone:'looks like phone numbers',email:'looks like email addresses',roll:'looks like roll or enrolment numbers',dob:'looks like dates of birth',address:'looks like an address or place',govid:'looks like a government ID number'};
export const PD_DEFAULT: Record<PdKind, "code"|"remove">={name:'code',roll:'code',phone:'remove',email:'remove',dob:'remove',address:'remove',govid:'remove'};
export function pdTestVal(kind: PdKind,v: string): boolean{
  if(kind==='email')return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v);
  if(kind==='phone'){const d=v.replace(/[\s\-()]/g,'');return /^(\+?91)?[6-9]\d{9}$/.test(d)}
  if(kind==='govid'){const d=v.replace(/[\s\-]/g,'');return /^\d{12}$/.test(d)||/^[A-Z]{5}\d{4}[A-Z]$/.test(d)}
  if(kind==='dob')return /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.](19[4-9]\d|20[01]\d)|(19[4-9]\d|20[01]\d)[\/\-.]\d{1,2}[\/\-.]\d{1,2})$/.test(v);
  if(kind==='name')return /^[A-Za-z][A-Za-z.'’ ]*[A-Za-z.]\s+[A-Za-z][A-Za-z.'’ ]*$/.test(v);
  return false;
}
export function pdScan(data: ParsedData): { found: PdFound[]; freeText: string[] }{
  const out: PdFound[]=[],freeText: string[]=[];
  data.headers.forEach((h,i)=>{
    const vals=data.rows.map(r=>(r[i]||'').trim()).filter(v=>v!=='');
    if(!vals.length)return;
    const uniq=new Set(vals).size/vals.length,hn=String(h).toLowerCase().replace(/[_\-.]+/g,' ');
    let kind: PdKind|null=null,why: PdFound["why"]|''='';
    for(const k of ['email','phone','govid','dob'] as const){
      if(vals.filter(v=>pdTestVal(k,v)).length/vals.length>=0.6){kind=k;why='values';break}
    }
    if(!kind){
      for(const hk of PD_HDR){
        if(hk[1].test(hn)){
          if(hk[0]==='name'&&/\b(group|scale|test|condition|class|school|college|item|variable|file|sheet|course|city|state|country|institution|department|subject|task|study)\b/.test(hn))continue;
          if((hk[0]==='name'||hk[0]==='roll')&&vals.length>=4&&uniq<0.5)continue;
          kind=hk[0];why='heading';break;
        }
      }
    }
    if(!kind&&vals.length>=3&&uniq>=0.8&&vals.filter(v=>pdTestVal('name',v)).length/vals.length>=0.7){kind='name';why='values'}
    if(kind)out.push({index:i,name:h||('Col'+(i+1)),kind,why:why as PdFound["why"]});
    else if(!/^-?\d+(\.\d+)?$/.test(vals[0]!)){
      const mean=vals.reduce((a,v)=>a+v.length,0)/vals.length;
      if(mean>40||vals.some(v=>v.length>120))freeText.push(h||('Col'+(i+1)));
    }
  });
  return{found:out,freeText};
}
/* choices: {colIndex:'keep'|'remove'|'code'}. Pure function, no page access. */
export function pdTransform(data: ParsedData,choices: Record<number, PdChoice>): PdTransform{
  const codeCols: number[]=[],dropCols: number[]=[];
  data.headers.forEach((h,i)=>{const c=choices[i];if(c==='code')codeCols.push(i);else if(c==='remove')dropCols.push(i)});
  const gone=new Set(codeCols.concat(dropCols));
  const keepIdx=data.headers.map((h,i)=>i).filter(i=>!gone.has(i));
  let headers=keepIdx.map(i=>data.headers[i]!),rows: string[][];
  const key: { headers: string[]; rows: string[][] }={headers:[],rows:[]};
  if(codeCols.length){
    const first=codeCols[0]!,map=new Map<string,string>(),pad=Math.max(3,String(data.rows.length).length);
    let n=0;const codes: string[]=[];
    data.rows.forEach((r)=>{
      const v=(r[first]||'').trim();let code: string;
      if(v!==''&&map.has(v))code=map.get(v)!;
      else{n++;code='P'+String(n).padStart(pad,'0');if(v!=='')map.set(v,code);key.rows.push([code].concat(codeCols.map(c=>r[c]||'')))}
      codes.push(code);
    });
    key.headers=['ParticipantCode'].concat(codeCols.map(c=>data.headers[c]||('Col'+(c+1))));
    const at=Math.max(0,keepIdx.filter(i=>i<first).length);
    headers=headers.slice(0,at).concat(['ParticipantCode'],headers.slice(at));
    rows=data.rows.map((r,ri)=>{const base=keepIdx.map(i=>r[i]!);return base.slice(0,at).concat([codes[ri]!],base.slice(at))});
  }else rows=data.rows.map(r=>keepIdx.map(i=>r[i]!));
  return{headers,rows,key,removed:dropCols.length,coded:codeCols.length,csv:pdCsv(headers,rows),keyCsv:key.rows.length?pdCsv(key.headers,key.rows):''};
}
