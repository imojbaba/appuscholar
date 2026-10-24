/* The graders of the AI-quality sets (wave B, Task Q1). Each one is pure: a reply (a string) and what it is held against go in, a small plain result comes out. None calls a model.
   They reuse core's own checks and do not reimplement them: apCheckQuote (the quotation guard of Analyse a paper), apJson (the reply reader), accItems (the numbers, citations and quoted
   phrases of a text), classifyAiUse (the AI-use label of a prompt). What each one measures is one of the known weak spots of the AI features: areas not named, limitations not found,
   gaps named by number, numbers the paper never printed, quotations that are not in the paper, a prompt that logs under the wrong label. */
import { accItems, apCheckQuote, apJson, classifyAiUse } from "@appuscholar/core";
import type { AiUseGroup, ApDoc, RsPaper } from "@appuscholar/core";

/** Letters, digits and the marks a reply may put before a line's first word (list bullets, numbers, markdown). */
const LEAD = /^[\s>*_#\-–—•·]*(?:\(?\d{1,2}[.)]\s+|\(\d{1,2}\)\s*)?[\s*_]*/u;

/* ---- quotations ---------------------------------------------------------------------------------------------------------------------------------- */

/** The quotations of a reply: the strings of the "quotes" array when the reply is the JSON object the Ask and the Walk-through ask for, else the quoted phrases of the running text. */
function quotesOf(reply: string): string[] {
  const j = apJson(reply) as { quotes?: unknown } | null;
  if (j && typeof j === "object") return Array.isArray(j.quotes) ? j.quotes.filter((q): q is string => typeof q === "string" && q.trim() !== "") : [];
  return accItems(reply).q;
}

/** How many quotations the reply gives and how many of them apCheckQuote finds word for word in the paper (a quotation too short to check counts as given and not found). */
export function gradeQuotes(doc: ApDoc, reply: string): { quotes: number; found: number } {
  const qs = quotesOf(reply);
  return { quotes: qs.length, found: qs.filter((q) => apCheckQuote(doc, q).ok).length };
}

/* ---- numbers ------------------------------------------------------------------------------------------------------------------------------------- */

const pct = (n: string): string => n.replace(/%$/, "");

/** The reply without the numbers that only count things in it: "Gap 2", "Paper 1", "paper(s) 1 and 2", "[3]", "(2)", and a list's "1." at the start of a line. */
function withoutEnumerators(s: string): string {
  return s
    .replace(/^[ \t]*\d{1,2}[.)]\s+/gm, " ")
    .replace(/\b(?:gaps?|papers?|stud(?:y|ies)|articles?|abstracts?|sources?|items?)\s*(?:\(s\))?\s*#?\s*\d{1,2}(?:\s*(?:,|and|&|–|-)\s*\d{1,2})*/gi, " ")
    .replace(/\[\d{1,2}(?:\s*[,–-]\s*\d{1,2})*\]/g, " ")
    .replace(/\(\s*\d{1,2}\s*\)/g, " ");
}

/** The numbers of the reply (accItems) that the source does not hold, in the order the reply gives them, each once. A source's number inside quotation marks counts as the source's, and so does
 *  the year of a citation in it; a trailing % is not compared (so "45%" in the reply matches "45%" and "45" in the source). Spelled-out numbers are not read, as accItems does not read them. */
export function gradeNumbers(source: string, reply: string): { foreign: string[] } {
  const held = new Set<string>();
  const add = (n: string) => held.add(pct(n));
  accItems(String(source || "").replace(/[“”"]/g, " ")).n.forEach(add);
  const src = accItems(String(source || ""));
  src.n.forEach(add);
  src.c.forEach((c) => { const y = c.match(/(?:1[89]|20)\d\d(?=[a-z]?$)/); if (y) add(y[0]); });
  const foreign: string[] = [];
  for (const n of accItems(withoutEnumerators(String(reply || ""))).n) if (!held.has(pct(n)) && !foreign.includes(n)) foreign.push(n);
  return { foreign };
}

/* ---- the idea check's areas ------------------------------------------------------------------------------------------------------------------------- */

/** Which of the named areas have a line of their own that starts with the area's name and a colon ("Time: Medium. ..."), in the order of `areas`. v1's wording, "Area: Low. ...", names none. */
export function gradeAreas(reply: string, areas: string[]): { named: string[]; missing: string[] } {
  const lines = String(reply || "").split(/\r?\n/).map((l) => l.replace(LEAD, "").toLowerCase());
  const has = (area: string): boolean => {
    const a = area.trim().toLowerCase();
    return lines.some((l) => l.startsWith(a) && /^[*_\s]*:/.test(l.slice(a.length)));
  };
  return { named: areas.filter(has), missing: areas.filter((a) => !has(a)) };
}

/* ---- the summary's limitations -------------------------------------------------------------------------------------------------------------------- */

/** The text under the Limitations heading of a summary (to the next of its other headings), or the whole reply when it has none. */
function limitationsPart(reply: string): string {
  const lines = String(reply || "").split(/\r?\n/);
  const at = lines.findIndex((l) => /^[\s>*_#\-–—•·]*limitations?\b[\s*_]*(:|—|-|$)/i.test(l));
  if (at < 0) return lines.join("\n");
  const out = [lines[at]!.replace(/^[\s>*_#\-–—•·]*limitations?[\s*_]*[:—-]?\s*/i, "")];
  for (const l of lines.slice(at + 1)) { if (/^[\s>*_#\-–—•·]*(aim|method|methods|key findings?|findings|results?)\b[\s*_]*:/i.test(l)) break; out.push(l); }
  return out.join("\n");
}

/** Whether the reply writes "not reported" (or "not stated") as its Limitations, and which of the expected limitations it names. Each expected entry is a phrase, or phrases split by | of which
 *  any one is enough ("self-rated|self-report"); a phrase is looked for, in any case, in the Limitations part only. `hits` gives the expected entries as they were written. */
export function gradeLimitations(reply: string, expected: string[]): { notReported: boolean; hits: string[] } {
  const part = limitationsPart(reply);
  const low = part.toLowerCase();
  const head = part.replace(/^[\s*_"'(\-–—•]+/, "").slice(0, 90).toLowerCase();
  const notReported = /^(not (reported|stated|given|mentioned|available)|none (reported|stated|given)|no limitations? (were |are )?(reported|stated|given|mentioned)|(the )?(authors?|paper|text) (do|does|did) not (report|state|mention|give|name) (any )?limitations?)/.test(head);
  return { notReported, hits: expected.filter((e) => e.split("|").some((alt) => alt.trim() !== "" && low.includes(alt.trim().toLowerCase()))) };
}

/* ---- the gap finder's and the literature review's names for the papers ------------------------------------------------------------------- */

/** The first author's surname of a paper: the last word of the first name in authorList (the names are "Given Family"), else of the first name of the card line `authors`. */
export function firstSurname(p: Pick<RsPaper, "authors" | "authorList">): string {
  const first = (p.authorList && p.authorList[0]) || String(p.authors || "").split(/\s*[;,]\s*/)[0] || "";
  const words = first.trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1]!.replace(/[.,;]+$/, "") : "";
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the reply refers to the papers by number ("Paper 1", "papers 2 and 3", "paper(s) 2", "[1, 2]", "(1)", "the second paper"), and which papers it names by the first author's surname
 *  (the surname as a word of its own, capital letter as in the paper). Wave A's gap finder asks for "(Surname, 2019)", never a number; this is the check that it does. */
export function gradeGapNames(reply: string, papers: RsPaper[]): { numbered: boolean; named: string[] } {
  const r = String(reply || "");
  const numbered =
    /\b(?:papers?|stud(?:y|ies)|articles?|abstracts?|sources?)\s*(?:\(s\))?\s*#?\s*\d{1,2}\b/i.test(r) ||
    /\[\s*\d{1,2}(?:\s*[,–-]\s*\d{1,2})*\s*\]/.test(r) ||
    /\(\s*(?:papers?\s*)?\d{1,2}(?:\s*(?:,|and|&|–|-)\s*\d{1,2})*\s*\)/i.test(r) ||
    /\b(?:first|second|third|fourth|fifth)\s+(?:paper|study|article|abstract)\b/i.test(r);
  const named: string[] = [];
  for (const p of papers) {
    const s = firstSurname(p);
    if (s && !named.includes(s) && new RegExp("(?<![\\p{L}])" + esc(s) + "(?![\\p{L}])", "u").test(r)) named.push(s);
  }
  return { numbered, named };
}

/* ---- the AI-use label ---------------------------------------------------------------------------------------------------------------------------- */

/** Whether classifyAiUse gives the prompt exactly the expected label and group (the help assistant's prompt, which is not logged, never matches). */
export function gradeLabel(prompt: string, expected: { k: string; g: AiUseGroup }): boolean {
  const got = classifyAiUse(prompt);
  return got !== null && got.k === expected.k && got.g === expected.g;
}
