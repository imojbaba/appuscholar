import { QUAL_PALETTE } from "./data/qual-tables";

export { QUAL_PALETTE };

/* v1's qualitative coding (O2), the parts that compute: qualNextColor (index.html:6189), qualDescendantIds (6205-6209), qualDeleteCode's cascade and confirm text (6235-6241),
   qualFindPassages' trim rule (6294-6295) and qualBuildMarkdown (6311-6325). QUAL_PALETTE (6186) is emitted from v1 into data/qual-tables.ts (golden:capture qual --emit), never
   retyped. Not ported (the panel's, register row D-W2-14): qualCodesGet and qualCodesSet (6187-6188, localStorage appu_qual_codes), qualAddCode and qualRenameCode (the prompts and
   the `'q'+Date.now().toString(36)+…` id), qualUnwrapSpansInHTML and qualUnwrapCodesEverywhere (the DOM sweep of every stored document after a delete), qualTagSelection (the span
   around the selection), qualToggleColors, qualRenderTree, qualOpenPassages, qualExportMarkdown (the download), and qualFindPassages' scan of every stored document's HTML for
   `.qual-tag[data-qcode]` spans with the `d.title||'Untitled'` document name.
   The strings and order are v1's: qualNextColor's `length%QUAL_PALETTE.length`; qualDescendantIds' depth-first order (the code, then each child's subtree in array order); the confirm
   text `'Delete "'+c.name+'"'+extra+'? The passage text itself stays in your document — only the tag is removed.'` with extra `' and its '+(ids.length-1)+' sub-code(s)'` when the
   code has descendants; qualBuildMarkdown's `# Coded passages` header, `'#'.repeat(Math.min(depth+2,6))` headings walked from the roots (`parentId===null`; a code whose parent is
   missing is never reached, as in v1), `_No passages tagged yet._`, `'- **'+p.doc+':** "'+p.text.replace(/\s+/g,' ')+'"'` and the blank line after each code.
   What differs from v1's text:
   - types and `export`;
   - qualNextColor takes the number of codes (v1 reads qualCodesGet().length);
   - qualDeleteCascade(codes, id) is qualDeleteCode's computation: null where v1 returns before asking (no such code), else the codes left, the removed ids (qualDescendantIds) and the
     confirm text; asking, unwrapping the spans, storing and the toast are the panel's;
   - qualPassageText(raw) is qualFindPassages' `(span.textContent||'').trim()` and `if(txt)`: the trimmed text, null when it is empty;
   - qualBuildMarkdown takes the codes (v1's qualCodesGet()) and passagesOf (v1's qualFindPassages: every tagged span of that code, in document order, as { doc, text }).
   - `!` on qualNextColor's indexed read (noUncheckedIndexedAccess): the modulo keeps the index in range for a count of 0 or more. */

export type QualCode = { id: string; name: string; parentId: string | null; color: string };
export type QualPassage = { doc: string; text: string };

export function qualNextColor(count: number): string{return QUAL_PALETTE[count%QUAL_PALETTE.length]!}
export function qualDescendantIds(id: string,codes: QualCode[]): string[]{
  const out=[id];
  codes.filter(c=>c.parentId===id).forEach(c=>out.push(...qualDescendantIds(c.id,codes)));
  return out;
}
export function qualDeleteCascade(codes: QualCode[],id: string): { codes: QualCode[]; removed: string[]; confirm: string } | null{
  const c=codes.find(x=>x.id===id);if(!c)return null;
  const ids=qualDescendantIds(id,codes);
  const extra=ids.length>1?' and its '+(ids.length-1)+' sub-code(s)':'';
  const confirm='Delete "'+c.name+'"'+extra+'? The passage text itself stays in your document — only the tag is removed.';
  return{codes:codes.filter(x=>!ids.includes(x.id)),removed:ids,confirm};
}
export function qualPassageText(raw: string): string | null{const txt=(raw||'').trim();return txt?txt:null}
export function qualBuildMarkdown(codes: QualCode[],passagesOf: (codeId: string) => QualPassage[]): string{
  const lines=['# Coded passages',''];
  function walk(parentId: string | null,depth: number){
    codes.filter(c=>c.parentId===parentId).forEach(c=>{
      lines.push('#'.repeat(Math.min(depth+2,6))+' '+c.name);
      const passages=passagesOf(c.id);
      if(!passages.length)lines.push('_No passages tagged yet._');
      else passages.forEach(p=>lines.push('- **'+p.doc+':** "'+p.text.replace(/\s+/g,' ')+'"'));
      lines.push('');
      walk(c.id,depth+1);
    });
  }
  walk(null,0);
  return lines.join('\n');
}
