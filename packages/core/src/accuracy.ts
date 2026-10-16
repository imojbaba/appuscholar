/* v1 accItems / accDiff / accCheck (index.html:2517-2549). Compares the student's original with the AI result:
   numbers, author-year citations and quoted phrases. This does not depend on the AI obeying the prompt.
   Spelled-out numbers ("sixty") are not read. */
export type AccKind = "continue" | "improve" | "expand";
export interface AccItems { n: string[]; c: string[]; q: string[] }

export function accItems(s: string): AccItems {
  let t = String(s || "").replace(/−/g, "-").replace(/[‘’]/g, "'");
  const out: AccItems = { n: [], c: [], q: [] };
  t = t.replace(/[“"]([^”"]{4,200})[”"]/g, (_m: string, a: string) => { out.q.push(a.trim().replace(/\s+/g, " ").toLowerCase()); return " "; });
  t = t.replace(/\(?[A-Z][\p{L}'-]+(?:,? (?:&|and) [A-Z][\p{L}'-]+)?(?: et al\.)?,? \(?(?:1[89]|20)\d\d[a-z]?\)?/gu, (m: string) => { out.c.push(m.replace(/[()]/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim()); return " "; });
  (t.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\d+(?:\.\d+)?%?|\.\d+%?/g) || []).forEach(x => out.n.push(x.replace(/,/g, "").replace(/^0(?=\.)/, "")));
  return out;
}

function accDiff(a: string[], b: string[]): { missing: string[]; added: string[] } {
  const left = b.slice(), miss: string[] = [];
  a.forEach(x => { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); else miss.push(x); });
  return { missing: miss, added: left };
}

export function accCheck(orig: string, res: string, kind: AccKind): { warn: boolean; msg: string; missing: string[]; added: string[] } {
  const A = accItems(orig), B = accItems(res);
  const n = accDiff(A.n, B.n), c = accDiff(A.c, B.c), q = accDiff(A.q, B.q);
  const miss = [...n.missing, ...c.missing, ...q.missing.map(x => "“" + x + "”")];
  const add = [...n.added, ...c.added, ...q.added.map(x => "“" + x + "”")];
  const J = (a: string[]) => a.slice(0, 8).join(", ") + (a.length > 8 ? " and " + (a.length - 8) + " more" : "");
  let msg = "", warn = false;
  if (kind === "improve" || kind === "expand") {
    if (miss.length) { msg += "Dropped from your text: " + J(miss) + ". "; warn = true; }
    if (add.length) { msg += "New in the result and not in your text, so unverified: " + J(add) + ". "; warn = true; }
  } else if (add.length) { msg += "Not from your text, so unverified: " + J(add) + ". "; warn = true; }
  if (warn) msg += "Check each one against your sources before you accept, or delete it.";
  else msg = "Checked: every number, citation and quoted phrase in your text is unchanged" + (kind === "continue" ? " and none was added." : ".");
  return { warn, msg, missing: miss, added: add };
}
