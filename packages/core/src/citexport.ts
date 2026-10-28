/* The citation library as RIS and BibTeX, for reference managers (Zotero, Mendeley, EndNote, LaTeX). New in v2 (Task 38; register D-S2-140): v1 exported its own JSON only,
   so this engine has no v1 port and no golden; the tests hold hand-written expected files.
   A source is read as the rest of the citation engine reads it (citation.ts): its kind from `type` (citKind), its authors from the `;`-separated "Last, First" list (citNames; a name
   with no comma is an organisation), `source` as the journal, publisher, institution, school or website, `container` as the book or proceedings a chapter or paper is in.
   Every field is trimmed, a field with nothing in it is left out, and line breaks inside a value become one space. */
import { citDoiBare, citKind, citNames, type CitationEntry, type CitationKind } from "./citation";

const clean = (x: string | undefined): string => String(x ?? "").replace(/\s+/g, " ").trim();
/** Pages "a-b" (a hyphen, en dash or em dash between two parts, spaces allowed) as the two ends; anything else is one start page. */
function pageEnds(pages: string | undefined): { sp: string; ep: string } {
  const p = clean(pages);
  const m = p.match(/^([^-–—\s]+)\s*[-–—]+\s*([^-–—\s]+)$/);
  return m ? { sp: m[1]!, ep: m[2]! } : { sp: p, ep: "" };
}

/* ---- RIS ---- */
const RIS_TYPE: Record<CitationKind, string> = { journal: "JOUR", book: "BOOK", chapter: "CHAP", conf: "CPAPER", report: "RPRT", thesis: "THES", web: "GEN" };

/** One RIS record per source: CRLF lines `TAG  - value` from TY to ER, a blank line between records. */
export function citToRis(lib: CitationEntry[]): string {
  return lib.map((e) => {
    const kind = citKind(e.type);
    const { sp, ep } = pageEnds(e.pages);
    const src = clean(e.source);
    const inBook = kind === "chapter" || kind === "conf";
    const rows: Array<[string, string]> = [
      ["TY", RIS_TYPE[kind]],
      ...citNames(e.author).map((n): [string, string] => ["AU", n.org ? clean(n.last) : clean(n.last) + (clean(n.first) ? ", " + clean(n.first) : "")]),
      ["PY", clean(e.year)],
      ["TI", clean(e.title)],
      ["T2", inBook ? clean(e.container) : kind === "journal" || kind === "web" ? src : ""],
      ["PB", kind === "journal" || kind === "web" ? "" : src],
      ["VL", clean(e.volume)],
      ["IS", clean(e.issue)],
      ["SP", sp],
      ["EP", ep],
      ["DO", clean(citDoiBare(e))],
      ["UR", clean(e.url)]
    ];
    return rows.filter(([t, v]) => t === "TY" || v).map(([t, v]) => t + "  - " + v + "\r\n").join("") + "ER  - \r\n";
  }).join("\r\n");
}

/* ---- BibTeX ---- */
const BIB_TYPE: Record<CitationKind, string> = { journal: "article", book: "book", chapter: "incollection", conf: "inproceedings", report: "techreport", thesis: "phdthesis", web: "misc" };
const BIB_ESC: Record<string, string> = { "\\": "\\textbackslash{}", "{": "\\textbraceleft{}", "}": "\\textbraceright{}", "%": "\\%", "&": "\\&", "$": "\\$", "#": "\\#", "_": "\\_" };
/** A value with `{ } % & $ # _` escaped (and a backslash, which would start a command). One pass, so an escape is never escaped again. A brace is written as a command,
 *  not as `\{`: BibTeX counts a brace even after a backslash, so one brace without its partner would run the field into the rest of the file. */
const bibEsc = (x: string): string => x.replace(/[\\{}%&$#_]/g, (c) => BIB_ESC[c]!);

/** A doi or url is written as typed (BibTeX reads these fields verbatim, so an escape would corrupt them): only what would break the braces is percent-encoded, a brace and a space. */
const bibVerbatim = (x: string): string => x.replace(/[{} ]/g, (c) => (c === " " ? "%20" : c === "{" ? "%7B" : "%7D"));

/** Lower-case ASCII letters and digits only: accents dropped (NFD), the few letters NFD leaves whole mapped, anything else removed. */
function asciiKey(x: string): string {
  const map: Record<string, string> = { "ß": "ss", "ø": "o", "æ": "ae", "œ": "oe", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i" };
  return x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ßøæœłđðþı]/g, (c) => map[c]!).replace(/[^a-z0-9]/g, "");
}
/** The a, b, … z, aa, ab, … suffix of the nth clash (1 is "a"). */
function clashSuffix(n: number): string {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s;
  return s;
}
/** First surname + year + first title word; `anon` stands in for a missing (or non-Latin) surname. */
function baseKey(e: CitationEntry): string {
  const first = citNames(e.author)[0];
  const word = clean(e.title).split(" ").map(asciiKey).find(Boolean) ?? "";
  return ((first ? asciiKey(first.last) : "") || "anon") + asciiKey(clean(e.year)) + word;
}

/** One BibTeX entry per source, a blank line between them; the key is unique in the file (a, b, … after a clash; the first keeps the plain key). */
export function citToBibtex(lib: CitationEntry[]): string {
  const used = new Set<string>();
  return lib.map((e) => {
    const kind = citKind(e.type);
    const stem = baseKey(e);
    let key = stem;
    for (let n = 1; used.has(key); n++) key = stem + clashSuffix(n);
    used.add(key);
    const src = clean(e.source);
    const names = citNames(e.author).map((n) => (n.org ? "{" + bibEsc(clean(n.last)) + "}" : bibEsc(clean(n.last)) + (clean(n.first) ? ", " + bibEsc(clean(n.first)) : "")));
    const pages = clean(e.pages).replace(/\s*[-–—]+\s*/g, "--");
    const rows: Array<[string, string]> = [
      ["author", names.join(" and ")],
      ["title", clean(e.title)],
      ["journal", kind === "journal" ? src : ""],
      ["booktitle", kind === "chapter" || kind === "conf" ? clean(e.container) : ""],
      ["publisher", kind === "book" || kind === "chapter" || kind === "conf" || kind === "web" ? src : ""],
      ["institution", kind === "report" ? src : ""],
      ["school", kind === "thesis" ? src : ""],
      ["year", clean(e.year)],
      ["volume", clean(e.volume)],
      ["number", clean(e.issue) || (kind === "report" ? clean(e.number) : "")],
      ["pages", pages],
      ["doi", clean(citDoiBare(e))],
      ["url", clean(e.url)]
    ];
    const fields = rows.filter(([, v]) => v).map(([k, v]) => "  " + k + " = {" + (k === "author" ? v : k === "doi" || k === "url" ? bibVerbatim(v) : bibEsc(v)) + "}");
    return "@" + BIB_TYPE[kind] + "{" + key + fields.map((f) => ",\n" + f).join("") + "\n}\n";
  }).join("\n");
}
