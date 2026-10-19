import type { ParsedData } from "./intake";
import { STAT_TESTS } from "./stats-core";
import type { StatsForm, StatsTestKey } from "./stats-core";

/* v1's results-to-data linking (S7): a fingerprint of the loaded table, the record of a Statistics Lab run that a sentence inserted into the document carries, the record of each named
   dataset, and the check that tells the student which inserted results still match the data. rtHash (index.html:9372-9377), rtRegister's set record (9382-9388), rtCapture
   (12260-12269), rtFirstP and rtSig (12270-12271), rtScan (12272-12286) and the significance-flip rule of rtRerunOne (12325).
   Not ported (the panel's): rtDsName (9378: `#statsDsName` trimmed, or 'Untitled data'), rtNameChanged (9379), rtLoad and rtSave (9380-9381: JSON in localStorage, `{}` on a missing
   or unreadable key), rtOpen (12287-12305: the dialog and its rt_* strings), rtJump (12306-12312), rtRerunOne's re-run through the form and the editor (12313-12330, all but
   the flip rule), rtRerun and rtRerunAll (12331-12349); register row D-W2-10.
   Kept as v1 wrote it: rtHash's string (each column `name+'\u0002'+type` joined by '\u0001', then '\u0003', then each row joined by '\u0001', the rows joined by '\u0004'), its two hashes
   over charCodeAt (UTF-16 code units: FNV-1a from 0x811c9dc5 with `h1^=c;h1=Math.imul(h1,16777619)>>>0` and djb2 from 5381 with `h2=(Math.imul(h2,33)+c)>>>0`) and its result
   `h1.toString(16)+'-'+h2.toString(16)+'-'+str.length` (a cell that holds a separator makes the same string as a table with more cells, so the same hash, as in v1); rtRegister's rule
   that the set is written as `{hash, ts, n}` (n the row count) when the name has none or its hash changed, and otherwise left with its first ts; rtCapture's field, multi and extra
   reading (a select field is recorded only when its value is a column index of the data, a multi field always, from its checked boxes, an extra whenever the form has it); rtFirstP's
   regex `/p\s*([<=])\s*(\.\d+|0?\.\d+|1\.0+)/` on `str||''` (lower-case p, `<` or `=` only, the first match) and its `'0'+m[2]` for a leading point; rtSig's `<` → `v<=0.05` and
   `=` → `v<0.05`; rtScan's statuses and reasons in its order (no record: unk, rt_why_norec; no set for the run's dataset: unk, rt_why_noset; the set's hash is the run's: cur, '';
   otherwise stale, rt_why_stale, with `when` the set's ts), the reasons returned as i18n keys for the panel's t(); the flip rule
   `rtSig(old)!==null&&rtSig(neu)!==null&&rtSig(old)!==rtSig(neu)`.
   What differs from v1's text:
   - types and `export`; `const`/`let` for `var` (rtHash's `var h1=…,h2=…,i,c` becomes `let h1=…,h2=…` with a loop-scoped `let i` and `const c`); v1's local names are kept as
     aliases of the new parameters (rtSetRecord's `name`, rtRunRecord's `d` and `key`, rtScanTags's `el` for a tag), and rtRunRecord's `el` is the field's value rather than its element;
   - rtRunRecord(data, test, form, ds, hash) is rtCapture without the page: v1's `window._statsData` is `data`, `#statsTest`'s value `test`, `window._statsDsName||rtDsName()` the `ds`
     the caller passes, `window._statsHash` the `hash` (null after a parse rtRegister skipped, as v1's), `#sf_<id>`'s value `form.values[id]` (an element that exists is a value that is
     not undefined), and the `.sfm_<id>:checked` boxes' `parseInt(c.value,10)` the indexes of `form.ticked[id]`, `[]` when the form has none (v1's querySelectorAll finds no box);
     v1's `if(!d)return null` is the caller's (there is no run without data). A ticked index with no column throws a TypeError where v1's `.name` does, which statsResultsShow's try
     (11992) turns into `_statsRun=null`: the form offers a box only for a column, so neither is reached;
   - rtSetRecord(data, ds, sets, now) is rtRegister's write without the page: `rtDsName()` is the `ds` passed, `rtLoad('appu_statsets')` the `sets` passed, `Date.now()` the `now` passed,
     and v1's change to the loaded object followed by `rtSave` is a new object returned (the one passed is not changed); setting `window._statsHash` and `window._statsDsName` (and
     `_rtSkip`'s early return) is the caller's;
   - rtScanTags(tags, runs, sets) is rtScan without the page: v1's `editor.querySelectorAll('.stat-tag')` with each `data-run` is `tags`, `rtLoad('appu_statruns')` and
     `rtLoad('appu_statsets')` are `runs` and `sets`; each item drops `el` and `run` (the panel holds the elements and looks the run up), and v1's
     `el.classList.toggle('stat-stale',it.status==='stale')` is the panel's, from `status`;
   - rtFlip(oldSentence, newSentence) is 12325's expression with `run.sentence` and `neu` as parameters;
   - `!` on indexed reads (noUncheckedIndexedAccess) where v1 reads unchecked (a multi field's `d.cols[…].name`), and `m[1]`/`m[2]` read as the regex guarantees them. */

export type RtRun = { test: StatsTestKey; label: string; ds: string; hash: string | null; fields: Record<string, string>; multi: Record<string, string[]>; extra: Record<string, string> };
/** A run as statsInsert stores it in `appu_statruns` (12017-12018): the record, the inserted sentence and the time it was inserted. */
export type RtSavedRun = RtRun & { sentence: string; ts: number };
export type RtSet = { hash: string; ts: number; n: number };
export type RtTag = { id: string };
export type RtStatus = "cur" | "stale" | "unk";
export type RtWhy = "" | "rt_why_norec" | "rt_why_noset" | "rt_why_stale";
export type RtScanItem = { id: string; status: RtStatus; why: RtWhy; when?: number };
export type RtFirstP = { op: "<" | "="; v: number };

export function rtHash(data: ParsedData): string{
  const str=data.cols.map(function(c){return c.name+'\u0002'+c.type}).join('\u0001')+'\u0003'+data.rows.map(function(r){return r.join('\u0001')}).join('\u0004');
  let h1=0x811c9dc5,h2=5381;
  for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);h1^=c;h1=Math.imul(h1,16777619)>>>0;h2=(Math.imul(h2,33)+c)>>>0}
  return h1.toString(16)+'-'+h2.toString(16)+'-'+str.length;
}

export function rtSetRecord(data: ParsedData,ds: string,sets: Record<string, RtSet>,now: number): Record<string, RtSet>{
  const name=ds,h=rtHash(data),out={...sets},old=out[name];
  if(!old||old.hash!==h)out[name]={hash:h,ts:now,n:data.rows.length};
  return out;
}

export function rtRunRecord(data: ParsedData,test: StatsTestKey,form: StatsForm,ds: string,hash: string | null): RtRun{
  const d=data,key=test,cfg=STAT_TESTS[key],run: RtRun={test:key,label:cfg.label,ds:ds,hash:hash,fields:{},multi:{},extra:{}};
  cfg.fields.forEach(function(f){
    if(f.multi){run.multi[f.id]=(form.ticked[f.id]??[]).map(function(c){return d.cols[c]!.name});return}
    const el=form.values[f.id];if(el!==undefined&&d.cols[parseInt(el,10)])run.fields[f.id]=d.cols[parseInt(el,10)]!.name;
  });
  (cfg.extra||[]).forEach(function(f){const el=form.values[f.id];if(el!==undefined)run.extra[f.id]=el});
  return run;
}

export function rtFirstP(str: string | null | undefined): RtFirstP | null{const m=/p\s*([<=])\s*(\.\d+|0?\.\d+|1\.0+)/.exec(str||'');if(!m)return null;const v=parseFloat(m[2]!.charAt(0)==='.'?'0'+m[2]:m[2]!);return{op:m[1] as "<" | "=",v:v}}
export function rtSig(str: string | null | undefined): boolean | null{const q=rtFirstP(str);return q?(q.op==='<'?q.v<=0.05:q.v<0.05):null}
export function rtFlip(oldSentence: string,newSentence: string): boolean{return rtSig(oldSentence)!==null&&rtSig(newSentence)!==null&&rtSig(oldSentence)!==rtSig(newSentence)}

export function rtScanTags(tags: RtTag[],runs: Record<string, RtSavedRun>,sets: Record<string, RtSet>): RtScanItem[]{
  const out: RtScanItem[]=[];
  tags.forEach(function(el){
    const id=el.id,run=runs[id],it: RtScanItem={id:id,status:'unk',why:'rt_why_norec'};
    if(run){
      const ds=sets[run.ds];
      if(!ds){it.why='rt_why_noset'}
      else if(ds.hash===run.hash){it.status='cur';it.why=''}
      else{it.status='stale';it.why='rt_why_stale';it.when=ds.ts}
    }
    out.push(it);
  });
  return out;
}
