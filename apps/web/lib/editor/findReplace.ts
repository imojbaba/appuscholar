export type Range = { start: number; end: number };

function pattern(query: string, caseSensitive: boolean): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
}

/** Every match of `query` (plain text, not a pattern) in `text`, left to right and not overlapping: "aa" is found once in "aaa". */
export function findAll(text: string, query: string, opts: { caseSensitive?: boolean } = {}): Range[] {
  if (!query) return [];
  const out: Range[] = [];
  for (const m of text.matchAll(pattern(query, !!opts.caseSensitive))) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

/** `text` with every match replaced by `replacement` (inserted literally), and how many were replaced. */
export function replaceAllText(text: string, query: string, replacement: string, opts: { caseSensitive?: boolean } = {}): { text: string; count: number } {
  const hits = findAll(text, query, opts);
  if (!hits.length) return { text, count: 0 };
  let out = "";
  let at = 0;
  for (const h of hits) { out += text.slice(at, h.start) + replacement; at = h.end; }
  return { text: out + text.slice(at), count: hits.length };
}
