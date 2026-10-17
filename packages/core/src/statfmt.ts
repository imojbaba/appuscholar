/* v1's p formatters: noLead, pCell and fmtP (index.html:11980-11982), kept as v1 wrote them, with types. pCell returns v1's HTML entity (`&lt; .001`) below .001, because v1 builds
   its table cells as HTML strings; a caller that renders it as text must not escape it a second time. */
export function noLead(s: string | number): string {return String(s).replace(/^(-?)0\./,'$1.')}
export function pCell(p: number): string {return p<0.001?'&lt; .001':noLead(p.toFixed(3))}
export function fmtP(p: number): string {return p<0.001?'p < .001':'p = '+noLead(p.toFixed(3))}
