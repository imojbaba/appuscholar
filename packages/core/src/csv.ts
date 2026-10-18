/* v1's CSV writer (index.html, in the personal-data scan section from 9411): pdCsvCell (9461) writes one value, null and undefined as "", quoting it when it holds a double quote, a comma, a
   carriage return, a line feed or a tab, with each double quote doubled; pdCsv (9462) writes the header row and then the rows, cells joined by commas and rows by "\n". v1 writes every CSV file
   through it: the Research tool's result list (rsCsvText, research.ts), the personal-data transform, the word bank, the paper cards, the questionnaire items and the reading matrix. The code is v1's
   as v1 wrote it, cut out of index.html by a script, with the same pattern, `[",\r\n\t]`, and the same joins. What differs from v1's text: parameter and return types, `export`, and three casts
   that change no value: pdCsvCell's `v`, an `unknown` that its first statement makes a String, is read `as string` after it (TypeScript does not narrow an `unknown` parameter on assignment),
   and pdCsv's header row is `[headers as unknown[]]`, so that the rows, `unknown[][]`, can be concatenated to it. */
export function pdCsvCell(v: unknown): string{v=String(v==null?'':v);return /[",\r\n\t]/.test(v as string)?'"'+(v as string).replace(/"/g,'""')+'"':v as string}
export function pdCsv(headers: string[],rows: unknown[][]): string{return[headers as unknown[]].concat(rows).map(r=>r.map(pdCsvCell).join(',')).join('\n')}
