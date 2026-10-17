/* v1's two HTML escapes, with types: escHTML (index.html:2606), which turns & < > " ' into &amp; &lt; &gt; &quot; &#39; and is what v1 escapes text with before it goes into markup
   (citation.ts's refHTML among others), and escAttr (8033), which escapes only the double quote, for a value inside a double-quoted attribute. Both turn null and undefined into "" and anything else into
   String(s). escHTML is v1's const arrow function; what differs from v1's text is the parameter and return types, `export`, and the map read `as Record<string, string>` with a `!`, so that TypeScript
   lets a matched character index it (the regex only matches its five keys). */
export const escHTML=(s: unknown): string=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string, string>)[c]!);
export function escAttr(s: unknown): string{return String(s==null?'':s).replace(/"/g,'&quot;')}
