/* The graders of the AI-quality sets (wave B, Task Q1). Each one is pure: a reply (a string) and what it is held against go in, a small plain result comes out. None calls a model.
   They reuse core's own checks and do not reimplement them: apCheckQuote (the quotation guard of Analyse a paper), apJson (the reply reader), accItems (the numbers, citations and quoted
   phrases of a text), classifyAiUse (the AI-use label of a prompt). What each one measures is one of the known weak spots of the AI features: areas not named, limitations not found,
   gaps named by number, numbers the paper never printed, quotations that are not in the paper, a prompt that logs under the wrong label. */
import { accItems, apCheckQuote, apJson, classifyAiUse } from "@appuscholar/core";
import type { AiUseGroup, ApDoc, RsPaper } from "@appuscholar/core";

/** Letters, digits and the marks a reply may put before a line's first word (list bullets, numbers, markdown). */
const LEAD = /^[\s>*_#\-–—•·]*(?:\(?\d{1,2}[.)]\s+|\(\d{1,2}\)\s*)?[\s*_]*/u;

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether a text holds the word as a word of its own (not inside a longer one). Add the flag "i" to ignore case. */
const hasWord = (text: string, word: string, flags = "u"): boolean => new RegExp("(?<![\\p{L}])" + esc(word) + "(?![\\p{L}])", flags).test(text);

/* ---- quotations ---------------------------------------------------------------------------------------------------------------------------------- */

/** The strings of the "quotes" array of a reply that is meant to be JSON but does not parse (a comma left before the bracket, a quotation mark inside a string left unescaped, a reply cut off).
 *  A string ends at a quotation mark that is followed by a comma and the next string, by the closing bracket, or by the end of the reply; a string that is cut off is not taken. */
function quotesArrayOf(reply: string): string[] {
  const open = /"quotes"\s*:\s*\[/.exec(reply);
  if (!open) return [];
  const item = /\s*"([\s\S]*?)"(?=\s*(?:,\s*(?:"|\]|$)|\]|$))\s*,?/y;
  item.lastIndex = open.index + open[0].length;
  const out: string[] = [];
  for (let m = item.exec(reply); m; m = item.exec(reply)) {
    let q = m[1]!;
    try { const v: unknown = JSON.parse(`"${q}"`); if (typeof v === "string") q = v; } catch { /* the string is not valid JSON: keep it as written */ }
    if (q.trim() !== "") out.push(q);
  }
  return out;
}

/** The quotations of a reply: the strings of the "quotes" array when the reply is the JSON object the Ask and the Walk-through ask for (read as far as it goes when it does not parse), else the
 *  quoted phrases of the running text of a reply with no JSON in it. */
function quotesOf(reply: string): string[] {
  const r = String(reply || "");
  const j = apJson(r) as { quotes?: unknown } | null;
  if (j && typeof j === "object") return Array.isArray(j.quotes) ? j.quotes.filter((q): q is string => typeof q === "string" && q.trim() !== "") : [];
  return /\{|"quotes"/.test(r) ? quotesArrayOf(r) : accItems(r).q;
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

/** The string values of a JSON value (arrays and objects inside it too), in order. */
function stringsOf(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(stringsOf);
  if (v && typeof v === "object") return Object.values(v).flatMap(stringsOf);
  return [];
}

/** The words of a reply: the string values of the JSON object the Ask and the Walk-through return (its keys and the quotation marks round its values are not words), else the reply itself. */
function wordsOf(reply: string): string {
  const j = apJson(reply);
  return j && typeof j === "object" ? stringsOf(j).join("\n") : reply;
}

/** accItems's pattern for a citation, with the names and the year as groups. */
const CITE = /\(?([A-Z][\p{L}'-]+(?:,? (?:&|and) [A-Z][\p{L}'-]+)?(?: et al\.)?),? \(?((?:1[89]|20)\d\d[a-z]?)\)?/gu;

/** The citations of a text ("Smith (2019)", "(Walker et al., 2017)", "(Smith & Jones, 2019)") and the text without them. accItems takes "Overall 1950" for a citation too; here a citation has a
 *  bracket, a pair of names or "et al.", and a capital word with a bare year stays in the text as a number (its first letter put in lower case, so that accItems leaves it be). */
function splitCitations(text: string): { rest: string; cites: Array<{ who: string; year: string }> } {
  const cites: Array<{ who: string; year: string }> = [];
  const rest = text.replace(CITE, (m: string, who: string, year: string) => {
    if (!/[()]|&| and | et al\./.test(m)) return m.replace(who, who.toLowerCase());
    cites.push({ who, year });
    return " ";
  });
  return { rest, cites };
}

/** The numbers and the citations of the reply that the source does not hold, numbers first, each once, in the order the reply gives them. A source's number inside quotation marks counts as the
 *  source's, and so does the year of a citation in it; a trailing % is not compared (so "45%" in the reply matches "45%" and "45" in the source). Spelled-out numbers are not read, as accItems
 *  does not read them. A reply that is a JSON object is read by its string values. A citation is foreign, as "Smith (2019)", unless its year is in the source and so is each of its surnames
 *  (as words, in any case); the source of the gap finder and the literature review is therefore rsCorpusText of the papers, which carries their authors and years. A citation written without a
 *  bracket ("Smith 2019") is read as a number, as is the year of "Zhao and colleagues (2026)". */
export function gradeNumbers(source: string, reply: string): { foreign: string[] } {
  const srcText = String(source || "").replace(/[‘’]/g, "'");
  const held = new Set<string>();
  const add = (n: string) => held.add(pct(n));
  accItems(srcText.replace(/[“”"]/g, " ")).n.forEach(add);
  const src = accItems(srcText);
  src.n.forEach(add);
  src.c.forEach((c) => { const y = c.match(/(?:1[89]|20)\d\d(?=[a-z]?$)/); if (y) add(y[0]); });
  const { rest, cites } = splitCitations(withoutEnumerators(wordsOf(String(reply || "").replace(/[‘’]/g, "'"))).replace(/[“”"]/g, " "));
  const foreign: string[] = [];
  for (const n of accItems(rest).n) if (!held.has(pct(n)) && !foreign.includes(n)) foreign.push(n);
  for (const { who, year } of cites) {
    const shown = `${who} (${year})`;
    const surnames = who.replace(/ et al\.$/, "").split(/,? (?:&|and) /);
    const known = held.has(year.replace(/[a-z]$/, "")) && surnames.every((n) => hasWord(srcText, n, "iu"));
    if (!known && !foreign.includes(shown)) foreign.push(shown);
  }
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

/** The Limitations heading of a summary: "Limitations", "Study limitations" or "Limitations and strengths" at the start of a line or after a full stop, then a colon, a hyphen, an en dash
 *  (\u2013) or an em dash (\u2014), or the end of the line. */
const LIMITATIONS_HEAD = /(?:^|\n|\.\s+)[ \t>*_#\-\u2013\u2014\u2022\u00b7]*(?:study\s+)?limitations?(?:\s+and\s+strengths?)?[ \t*_]*(?:[:\u2013\u2014-]|(?=[ \t\r]*(?:\n|$)))[ \t*_]*/i;
/** Another heading of a summary, which ends the Limitations part. */
const OTHER_HEAD = /(?:^|\n|\.\s+)[ \t>*_#\-\u2013\u2014\u2022\u00b7]*(?:aim|methods?|key findings?|findings|results?)\b[ \t*_]*:/i;

/** The text under the Limitations heading of a summary (to the next of its other headings), or null when the reply has no such heading. */
function limitationsPart(reply: string): string | null {
  const r = String(reply || "");
  const at = LIMITATIONS_HEAD.exec(r);
  if (!at) return null;
  const rest = r.slice(at.index + at[0].length);
  const next = OTHER_HEAD.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Whether the reply writes "not reported" (or "not stated", "none mentioned") as its Limitations, and which of the expected limitations it names. Each expected entry is a phrase, or phrases split
 *  by | of which any one is enough ("self-rated|self-report"); a phrase is looked for, in any case, in the Limitations part only. A reply with no Limitations part names none and does not
 *  write "not reported". `hits` gives the expected entries as they were written. */
export function gradeLimitations(reply: string, expected: string[]): { notReported: boolean; hits: string[] } {
  const part = limitationsPart(reply);
  if (part === null) return { notReported: false, hits: [] };
  const low = part.toLowerCase();
  const head = part.replace(/^[\s*_"'(\-–—•]+/, "").slice(0, 90).toLowerCase();
  const notReported = /^(not (reported|stated|given|mentioned|discussed|available)|none (reported|stated|given|mentioned)|no limitations? (were |are )?(reported|stated|given|mentioned)|(the )?(authors?|paper|text) (do|does|did) not (report|state|mention|give|name) (any )?limitations?)/.test(head);
  return { notReported, hits: expected.filter((e) => e.split("|").some((alt) => alt.trim() !== "" && low.includes(alt.trim().toLowerCase()))) };
}

/* ---- the gap finder's and the literature review's names for the papers ------------------------------------------------------------------- */

/** The first author's surname of a paper: the last word of the first name in authorList (the names are "Given Family"), else of the first name of the card line `authors`. */
export function firstSurname(p: Pick<RsPaper, "authors" | "authorList">): string {
  const first = (p.authorList && p.authorList[0]) || String(p.authors || "").split(/\s*[;,]\s*/)[0] || "";
  const words = first.trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1]!.replace(/[.,;]+$/, "") : "";
}

/** Whether the reply refers to the papers by number ("Paper 1", "papers 2 and 3", "paper(s) 2", "(paper 1)", "[1, 2]", "the second paper"; not a list numbered "(1)", "(2)", nor "study 3 hours"),
 *  and which papers it names by the first author's surname (the surname as a word of its own, capital letter as in the paper). Wave A's gap finder asks for "(Surname, 2019)", never a number; this is the check that it does. */
export function gradeGapNames(reply: string, papers: RsPaper[]): { numbered: boolean; named: string[] } {
  const r = String(reply || "");
  const numbered =
    /\b(?:papers?|stud(?:y|ies)|articles?|abstracts?|sources?)\s*(?:\(s\))?\s*#?\s*\d{1,2}\b(?!\s*(?:%|(?:hours?|hrs?|h|minutes?|mins?|days?|weeks?|months?|years?|times?)\b))/i.test(r) ||
    /\[\s*\d{1,2}(?:\s*[,–-]\s*\d{1,2})*\s*\]/.test(r) ||
    /\b(?:first|second|third|fourth|fifth)\s+(?:paper|study|article|abstract)\b/i.test(r);
  const named: string[] = [];
  for (const p of papers) {
    const s = firstSurname(p);
    if (s && !named.includes(s) && hasWord(r, s)) named.push(s);
  }
  return { numbered, named };
}

/* ---- the AI-use label ---------------------------------------------------------------------------------------------------------------------------- */

/** Whether classifyAiUse gives the prompt exactly the expected label and group (the help assistant's prompt, which is not logged, never matches). */
export function gradeLabel(prompt: string, expected: { k: string; g: AiUseGroup }): boolean {
  const got = classifyAiUse(prompt);
  return got !== null && got.k === expected.k && got.g === expected.g;
}
