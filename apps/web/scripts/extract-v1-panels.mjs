// Stage-2 panel copy: the English literals of v1's Research panel, Analyse a paper and Reading shelf that carry no data-i18n key.
// extractV1Panels(src) -> { en: { key: text }, manifest: { key: { lines, sha256 } } }; applyV1Panels merges it into both dictionaries.
//
// What is extracted (decisions R1 of the stage-2 plan, Task 1):
//  - static HTML windows: every run of text (and inline <b>) and every placeholder / title / aria-label of an element WITHOUT a data-i18n
//    key. An element with data-i18n keeps its existing key (the whole subtree is skipped); a title or placeholder is skipped only when its
//    own data-i18n-title / data-i18n-placeholder is present.
//  - JS windows: every string literal that is student-visible copy. A literal is HTML (it has tags) or plain text; concatenations
//    'a'+name+'b' are joined into 'a{name}b' when the operand is a plain identifier (name, f.name, x.length), and are otherwise left as
//    separate fixed parts (an operand that is student or AI content never goes into a key). Prompts for the AI, word lists, ids, class
//    names, CSS and the like are left out by the filters below.
//  - entities decoded; tags stripped except <b>...</b> (tHtml renders it); runs of white space collapsed; strings under 2 characters, pure
//    punctuation and emoji-only strings are skipped.
// Keys: <prefix>_<id in snake_case> when the element has an id (the panel's own letters dropped: rsTermsBtn -> rs2_terms_btn), else a slug of
// the first four words; the twelve AP_STAGES questions and names are ap2_stage_<k>_ask / _name. A repeat of the same text under the same
// prefix reuses the key; a different text under the same slug gets _2, _3. The manifest records, per key, the v1 lines of the first
// occurrence and the sha256 of those lines joined by \n.
import { createHash } from "node:crypto";

/** The windows (1-based, inclusive v1 line numbers of index.html build 2026.10.13a). Lecture, lesson, theatre, quiz and TTS copy
 *  (10136-11220 and 10821-10870 included) is not in this line, so the AP windows stop before it and resume at the reference check. */
export const V1_WINDOWS = [
  { kind: "html", prefix: "rs2", from: 941, to: 1034 },
  { kind: "html", prefix: "ap2", from: 741, to: 760 },
  { kind: "html", prefix: "sh2", from: 1247, to: 1254 },
  { kind: "js", prefix: "ap2", from: 9832, to: 10136 },
  { kind: "js", prefix: "ap2", from: 11221, to: 11334 },
  { kind: "js", prefix: "sh2", from: 11513, to: 11725 },
  // Research, the script side (Task 9, ruling R10): the OpenAlex key setting (1186-1190) and its toasts and 429 sentence (8029-8032), the quick
  // read box and its toasts (8161-8190), the CSV toast (8196), the fit chip (8201-8205), rsRank (8220-8234), the related terms (8251-8272) and
  // researchSearch to researchGapFinder (8283-8551). Left out: what core ports as data or prompt text (rsCsvText's column heads 8191-8195, the rank and
  // quick-read prompts, RS_DESIGN 8237-8244, rsBuildQuery 8273-8282, rsAuthorsToCit and rsEntryFromResult 8455-8470, rsOaBrief 8492-8497,
  // rsCorpusText 8525-8529), the paper head handed to Analyse (8411) and the manual entry's type (8445).
  { kind: "html", prefix: "rs2", from: 1186, to: 1190 },
  { kind: "js", prefix: "rs2", from: 8029, to: 8032 },
  { kind: "js", prefix: "rs2", from: 8161, to: 8190 },
  { kind: "js", prefix: "rs2", from: 8196, to: 8196 },
  { kind: "js", prefix: "rs2", from: 8201, to: 8205 },
  { kind: "js", prefix: "rs2", from: 8220, to: 8234 },
  { kind: "js", prefix: "rs2", from: 8251, to: 8272 },
  { kind: "js", prefix: "rs2", from: 8283, to: 8410 },
  { kind: "js", prefix: "rs2", from: 8412, to: 8444 },
  { kind: "js", prefix: "rs2", from: 8446, to: 8452 },
  { kind: "js", prefix: "rs2", from: 8471, to: 8491 },
  { kind: "js", prefix: "rs2", from: 8498, to: 8524 },
  { kind: "js", prefix: "rs2", from: 8530, to: 8551 },
];

/** Names the brief fixes: the first text that starts with the given words takes this key (within its prefix; a fourth member names the
 *  attribute item, placeholder / title / aria, it applies to). */
const NAME_OVERRIDES = [
  ["ap2", "I am allowed to read this paper", "ap2_consent"],
  ["sh2", "Add PDFs you have the right to read", "sh2_intro"],
  ["rs2", "OpenAlex key (optional)", "rs2_oa_key_label"],
  ["rs2", "Paste a free OpenAlex key", "rs2_oa_key_placeholder", "placeholder"],
  ["rs2", "Paper search uses OpenAlex.", "rs2_oa_key_desc"],
];

/** String literals that are not copy: assigned to these names, or property values of these names. */
const SKIP_DECLS = new Set(["AP_SAMPLE", "AP_STOP", "AP_RULES", "AP_HEADS", "SH_STOP", "prompt", "callAI"]);
const SKIP_PROPS = new Set(["brief", "terms", "none", "why"]);
const SKIP_CALLS = new Set(["callAI", "apCall"]);
const SKIP_CONTENT = [/^You are /, /^RULES:/, /PAPER (START|END)/, /^PAPER TEXT/, /^\[[^\]]*\]$/];
/** Word endings that are not copy on their own (FRAGMENTS below keys the ones a panel composes). The Lesson tab's label (11284) is extracted: Task 12 shows the tab for the sample. */
const SKIP_TEXT = new Set(["s are"]); // "s are" is the plural half of a ternary, not a sentence

/**
 * Fixed parts of a sentence that the rules above cannot keep (a lower-case word, a plural ending, a part whose neighbour is an expression), keyed for the panel that composes the
 * sentence (ruling R10, Task 12): the v1 line, a piece of that line's source the part sits in (checked to be there), the literal itself (checked to be inside that piece), the key,
 * and the text: the literal trimmed, with the neighbouring operand as a {placeholder} where the panel fills one in.
 */
export const FRAGMENTS = [
  { prefix: "ap2", line: 10016, src: "'page '+u.page", literal: "page ", key: "ap2_page_n", text: "page {page}" },
  { prefix: "ap2", line: 10016, src: "'section: '+u.sec", literal: "section: ", key: "ap2_section_sec", text: "section: {sec}" },
  { prefix: "ap2", line: 11263, src: "(R.dois.length===1?'':'s')", literal: "s", key: "ap2_dois_s", text: "s" },
  { prefix: "ap2", line: 11265, src: "(fl.length===1?' is':'s are')", literal: " is", key: "ap2_reference_is", text: "is" },
  { prefix: "ap2", line: 11265, src: "(fl.length===1?' is':'s are')", literal: "s are", key: "ap2_references_are", text: "s are" },
  { prefix: "ap2", line: 11280, src: "d.pages.length+' pages, '", literal: " pages, ", key: "ap2_n_pages", text: "{n} pages," },
];
const MAX_COPY_CHARS = 900;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", times: "×", larr: "←", rarr: "→" };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
  });
}

// ---------------------------------------------------------------------------------------------------------------- JS tokenizer
const SIMPLE_ID = /^[A-Za-z_$][\w$]*$/;
const REGEX_AFTER_KW = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do"]);

function unescapeJs(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|.)/gs, (m, e) => {
    if (e[0] === "u" && e.length > 1) return String.fromCodePoint(parseInt(e[1] === "{" ? e.slice(2, -1) : e.slice(1), 16));
    if (e[0] === "x" && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === "n" || e === "r" || e === "t") return " ";
    if (e === "\n" || e === "\r\n") return "";
    return e;
  });
}

/** Tokens: { t: 'str'|'id'|'num'|'re'|'p', v, line, parts? }. A string's parts are [{ s } | { ph } | { brk }] (a template can hold ${expr}). */
export function tokenizeJs(code, firstLine) {
  const toks = [];
  let i = 0, line = firstLine;
  const n = code.length;
  const prevSig = () => toks[toks.length - 1];
  const regexAllowed = () => {
    const p = prevSig();
    if (!p) return true;
    if (p.t === "num" || p.t === "str" || p.t === "re") return false;
    if (p.t === "id") return REGEX_AFTER_KW.has(p.v);
    return !(p.v === ")" || p.v === "]" || p.v === "}");
  };
  while (i < n) {
    const c = code[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && code[i + 1] === "/") { while (i < n && code[i] !== "\n") i++; continue; }
    if (c === "/" && code[i + 1] === "*") {
      const e = code.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      for (let k = i; k < end; k++) if (code[k] === "\n") line++;
      i = end; continue;
    }
    if (c === '"' || c === "'") {
      const start = line;
      let j = i + 1, raw = "";
      while (j < n && code[j] !== c) {
        if (code[j] === "\\") { raw += code[j] + code[j + 1]; if (code[j + 1] === "\n") line++; j += 2; continue; }
        if (code[j] === "\n") break; // unterminated: not a string
        raw += code[j]; j++;
      }
      toks.push({ t: "str", parts: [{ s: unescapeJs(raw) }], line: start, endLine: line });
      i = j + 1; continue;
    }
    if (c === "`") {
      const start = line;
      const parts = [];
      let j = i + 1, raw = "";
      const flush = () => { if (raw) parts.push({ s: unescapeJs(raw) }); raw = ""; };
      while (j < n && code[j] !== "`") {
        if (code[j] === "\\") { raw += code[j] + code[j + 1]; if (code[j + 1] === "\n") line++; j += 2; continue; }
        if (code[j] === "$" && code[j + 1] === "{") {
          flush();
          let depth = 1, k = j + 2, expr = "";
          while (k < n && depth) { if (code[k] === "{") depth++; else if (code[k] === "}") depth--; if (depth) expr += code[k]; if (code[k] === "\n") line++; k++; }
          const e = expr.trim();
          if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(e)) parts.push({ ph: e }); else parts.push({ brk: true });
          j = k; continue;
        }
        if (code[j] === "\n") line++;
        raw += code[j]; j++;
      }
      flush();
      toks.push({ t: "str", parts, line: start, endLine: line });
      i = j + 1; continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1, cls = false;
      while (j < n) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === "\n") break;
        if (code[j] === "[") cls = true; else if (code[j] === "]") cls = false;
        else if (code[j] === "/" && !cls) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(code[j])) j++;
      toks.push({ t: "re", v: "", line });
      i = j; continue;
    }
    if (/[0-9]/.test(c)) { let j = i; while (j < n && /[0-9a-zA-Z_.]/.test(code[j])) j++; toks.push({ t: "num", v: code.slice(i, j), line }); i = j; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(code[j])) j++; toks.push({ t: "id", v: code.slice(i, j), line }); i = j; continue; }
    toks.push({ t: "p", v: c, line }); i++;
  }
  return toks;
}

const camel = s => {
  const bits = s.split(/[_]+/).filter(Boolean);
  if (bits.length === 1 && bits[0] === bits[0].toUpperCase() && bits[0].length > 1) return bits[0].toLowerCase();
  return bits.map((b, k) => { const l = b.toLowerCase() === b || b.toUpperCase() === b ? b.toLowerCase() : b; return k ? l[0].toUpperCase() + l.slice(1) : l[0].toLowerCase() + l.slice(1); }).join("");
};
function phName(expr) {
  const segs = expr.split(".");
  let last = segs.pop();
  if (last === "length" && segs.length) return camel(segs.pop()) + "Count";
  return camel(last);
}

/** Operand tokens at i (a simple identifier chain, nothing else). Returns { end, name } or null. */
function simpleOperand(toks, i) {
  if (!toks[i] || toks[i].t !== "id" || REGEX_AFTER_KW.has(toks[i].v) || toks[i].v === "typeof") return null;
  let j = i + 1, expr = toks[i].v;
  while (toks[j] && toks[j].t === "p" && toks[j].v === "." && toks[j + 1] && toks[j + 1].t === "id") { expr += "." + toks[j + 1].v; j += 2; }
  if (toks[j] && toks[j].t === "p" && (toks[j].v === "(" || toks[j].v === "[")) return null; // a call or an index
  if (/^(escHTML|escAttr|String)$/.test(expr)) return null;
  return { end: j, expr, name: phName(expr) };
}

/** Joins 'a'+name+'b' (and 'a'+'b') chains. Returns the literals: { parts, line, endLine, prop, decls, k }. */
export function joinLiterals(toks) {
  const out = [];
  // bracket depth and the declarations in force, to tell AP_SAMPLE = [...] from prose
  const declStack = [null];
  let depth = 0;
  const declsNow = () => declStack.filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.t === "p" && "([{".includes(tk.v)) { depth++; declStack.push(tk.v === "(" && toks[i - 1] && toks[i - 1].t === "id" && SKIP_CALLS.has(toks[i - 1].v) ? "callAI" : null); continue; }
    if (tk.t === "p" && ")]}".includes(tk.v)) { if (depth > 0) { depth--; declStack.pop(); } continue; }
    if (tk.t === "p" && tk.v === ";") { declStack[declStack.length - 1] = null; continue; }
    if (tk.t === "id" && (tk.v === "const" || tk.v === "let" || tk.v === "var") && toks[i + 1] && toks[i + 1].t === "id" && toks[i + 2] && toks[i + 2].v === "=") { declStack[declStack.length - 1] = toks[i + 1].v; continue; }
    if (tk.t !== "str") continue;
    // a string compared with == / === / != / !== is a value the code tests, not copy
    if (toks[i - 1] && toks[i - 1].v === "=" && toks[i - 2] && (toks[i - 2].v === "=" || toks[i - 2].v === "!")) continue;
    // property name and the k:'..' of the enclosing object (for AP_STAGES)
    let prop = null;
    if (toks[i - 1] && toks[i - 1].v === ":" && toks[i - 2] && toks[i - 2].t === "id") prop = toks[i - 2].v;
    let kOfObject = null;
    if (prop === "ask" || prop === "name") {
      for (let b = i - 1; b >= 0 && b > i - 12; b--) {
        if (toks[b].t === "id" && toks[b].v === "k" && toks[b + 1] && toks[b + 1].v === ":" && toks[b + 2] && toks[b + 2].t === "str") { kOfObject = toks[b + 2].parts.map(p => p.s || "").join(""); break; }
      }
    }
    const parts = [...tk.parts];
    let end = i, endLine = tk.endLine;
    for (;;) {
      const plus = toks[end + 1];
      if (!plus || plus.t !== "p" || plus.v !== "+") break;
      const nx = toks[end + 2];
      if (nx && nx.t === "str") { parts.push(...nx.parts); end += 2; endLine = nx.endLine; continue; }
      const op = simpleOperand(toks, end + 2);
      if (op && toks[op.end] && toks[op.end].t === "p" && toks[op.end].v === "+" && toks[op.end + 1] && toks[op.end + 1].t === "str") {
        parts.push({ ph: op.expr, name: op.name }, ...toks[op.end + 1].parts);
        endLine = toks[op.end + 1].endLine; end = op.end + 1; continue;
      }
      break;
    }
    out.push({ parts, line: tk.line, endLine, prop, decls: declsNow(), k: kOfObject });
    i = end;
  }
  return out;
}

/** The literal's text with {name} placeholders (unique names), or null when a part cannot be named. */
function literalText(parts) {
  let s = "";
  for (const p of parts) {
    if (p.brk) { s += "\u0000"; continue; }
    if (p.s !== undefined) { s += p.s; continue; }
    s += "\u0002" + p.ph + "|" + (p.name || phName(p.ph)) + "\u0003"; // named {x} per text by finalizePlaceholders, so two operands called n in one literal stay apart
  }
  return s;
}
/** \u0002expr|name\u0003 -> {name}; two different expressions with one name become {name}, {name2}. */
function finalizePlaceholders(t) {
  const byExpr = new Map(), count = new Map();
  return t.replace(/\u0002([^|\u0003]*)\|([^\u0003]*)\u0003/g, (m, expr, name) => {
    if (!byExpr.has(expr)) { const c = (count.get(name) || 0) + 1; count.set(name, c); byExpr.set(expr, c === 1 ? name : name + c); }
    return "{" + byExpr.get(expr) + "}";
  });
}

// ---------------------------------------------------------------------------------------------------------------- HTML runs
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTR_RE = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const COPY_ATTRS = [["placeholder", "placeholder", "placeholder"], ["title", "title", "title"], ["aria-label", "aria", "aria"]]; // [attribute, data-i18n-<x>, key suffix]
function parseAttrs(s) {
  const a = {};
  for (const m of s.matchAll(ATTR_RE)) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return a;
}
const CODE_LIKE = [/\w=["']/, /\bonclick\b|\bonchange\b|\boninput\b|\bstyle=|\bclass=/, /=>|\bfunction\s*\(|\bconst\s+\w+\s*=/, /[a-z-]+:\s*[^;\s]+;\s*[a-z-]*:/];
const hasLetter = s => /\p{L}/u.test(s.replace(/\{[A-Za-z0-9_]+\}/g, ""));
const slugWords = s => (s.replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, " ").match(/[A-Za-z0-9]+/g) || []).slice(0, 4).map(w => w.toLowerCase());
const snake = id => id.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();
const goodId = id => (id && /^[A-Za-z][A-Za-z0-9]*$/.test(id) ? id : null);

function cleanRun(raw) {
  let s = decodeEntities(finalizePlaceholders(raw)).replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
  // an unbalanced <b> (the other half is in another literal) is dropped
  const opens = (s.match(/<b>/g) || []).length, closes = (s.match(/<\/b>/g) || []).length;
  if (opens !== closes) s = s.replace(/<\/?b>/g, "").replace(/\s+/g, " ").trim();
  s = s.replace(/<b>\s*<\/b>/g, "").replace(/<b>\s+/g, "<b>").replace(/\s+<\/b>/g, "</b>").replace(/\s+/g, " ").trim();
  return s;
}
const plainOf = s => s.replace(/<\/?b>/g, "");

/** Walks an HTML source (or a piece of it) and returns copy items: { text, id, attr, a, b } (a, b: offsets in html of the item).
 *  partial: the source is a piece of a JS string, so it may start inside a tag or end in one. */
export function htmlItems(html, { partial = false } = {}) {
  const items = [];
  let src = html, base = 0;
  if (partial) {
    const lt = src.indexOf("<"), gt = src.indexOf(">");
    // a piece that opens inside a tag ('" aria-label="Title"><div ...'): its attributes still count
    const tailEnd = gt >= 0 && (lt < 0 || gt < lt) ? gt : lt < 0 && /^["']\s+[\w-]+=/.test(src) ? src.length : -1;
    if (tailEnd >= 0) {
      const a = parseAttrs(src.slice(0, tailEnd).replace(/^["']/, ""));
      for (const [attr, , suffix] of COPY_ATTRS) {
        if (a[attr] !== undefined && !("data-i18n-" + suffix in a)) {
          const t = cleanRun(a[attr]);
          if (t.length >= 2 && hasLetter(t) && !/^\{[^}]*\}$/.test(t)) items.push({ text: t, id: null, attr: suffix, a: 0, b: tailEnd });
        }
      }
      src = src.slice(tailEnd + 1); base = tailEnd + 1;
    }
    const lastLt = src.lastIndexOf("<");
    if (lastLt >= 0 && src.indexOf(">", lastLt) < 0) src = src.slice(0, lastLt);
  }
  const stack = []; // { name, id, keyed }
  let skip = 0, run = "", runId = null, runA = -1, runB = -1;
  const keyedDepth = () => stack.some(e => e.keyed);
  const flush = () => {
    const t = cleanRun(run);
    const id = runId, a = runA, b = runB;
    run = ""; runId = null; runA = runB = -1;
    if (!t || t.length < 2 || !hasLetter(t)) return;
    items.push({ text: t, id, attr: null, a: base + a, b: base + b });
  };
  const addText = (txt, at) => {
    if (!txt || skip || keyedDepth()) return;
    if (!run) { runId = stack.length ? stack[stack.length - 1].id : null; }
    const lead = txt.length - txt.trimStart().length;
    if (runA < 0 && txt.trim()) runA = at + lead;
    if (txt.trim()) runB = at + txt.trimEnd().length;
    run += txt;
  };
  let pos = 0;
  for (const m of src.matchAll(TAG_RE)) {
    addText(src.slice(pos, m.index), pos);
    pos = m.index + m[0].length;
    if (m[0].startsWith("<!--")) continue;
    const closing = m[1] === "/", name = m[2].toLowerCase();
    if (closing) {
      if (name === "b") { if (!skip && !keyedDepth() && run) run += "</b>"; continue; }
      flush();
      if (name === "style" || name === "script") { skip = Math.max(0, skip - 1); continue; }
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      continue;
    }
    const attrs = parseAttrs(m[3]);
    if (name === "b") { if (!skip && !keyedDepth()) { if (!run) runId = stack.length ? stack[stack.length - 1].id : null; run += "<b>"; } continue; }
    flush();
    if (name === "style" || name === "script") { skip++; continue; }
    const keyed = "data-i18n" in attrs;
    const self = m[0].endsWith("/>") || VOID.has(name);
    if (!skip && !keyedDepth()) {
      for (const [attr, , suffix] of COPY_ATTRS) {
        if (attrs[attr] === undefined || ("data-i18n-" + suffix) in attrs) continue;
        const t = cleanRun(attrs[attr]);
        if (t.length < 2 || !hasLetter(t) || /^\{[^}]*\}$/.test(t)) continue;
        items.push({ text: t, id: goodId(attrs.id), attr: suffix, a: base + m.index, b: base + pos });
      }
    }
    if (!self) stack.push({ name, id: goodId(attrs.id), keyed });
  }
  addText(src.slice(pos), pos);
  flush();
  return items;
}

// ---------------------------------------------------------------------------------------------------------------- filters
const TAGGED = /<\/?[a-zA-Z][^>]*>/;
/** Plain text (a literal with no markup): is it something a student reads? */
function plainAccepted(t) {
  if (t.length > MAX_COPY_CHARS || !hasLetter(t)) return false;
  if (CODE_LIKE.some(r => r.test(t)) || SKIP_CONTENT.some(r => r.test(t))) return false;
  if (/[\\^$]|\[\^|\\d/.test(t)) return false; // a regular expression or a replacement pattern
  const words = plainOf(t).replace(/\{[^}]*\}/g, "{}").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return true;
  // one word: a label (Papers, Search, Reading…) or an all-capitals heading (STRENGTHS); a lower-case word is an id, a key or a fragment
  return /^[^\p{L}\p{N}]*\p{Lu}\p{Ll}{2,}[.:!?…]?$/u.test(words[0]) || /^\p{Lu}{5,}$/u.test(words[0]);
}
/** Text between tags inside a literal that holds HTML: any real word counts. */
function markupAccepted(t) {
  const p = plainOf(t);
  return p.length <= MAX_COPY_CHARS && hasLetter(p) && !CODE_LIKE.some(r => r.test(p)) && !SKIP_CONTENT.some(r => r.test(p)) && /^[^\p{L}\p{N}]*[\p{L}\p{N}{]/u.test(p);
}

function sha(lines, a, b) { return createHash("sha256").update(lines.slice(a - 1, b).join("\n")).digest("hex"); }

function keyFor({ prefix, text, id, attr, k, prop, taken, byText, line }) {
  const hit = byText.get(prefix + "\u0001" + attr + "\u0001" + text);
  if (hit) return { key: hit, fresh: false };
  let key;
  const ov = NAME_OVERRIDES.find(([p, start, , a]) => p === prefix && (a || "") === (attr || "") && text.startsWith(start));
  const stage = !attr && k && (prop === "ask" || prop === "name");
  if (ov) key = ov[2];
  else if (stage) key = `${prefix}_stage_${k}_${prop}`;
  else {
    let base = null;
    if (id) {
      const sn = snake(id);
      const own = prefix.replace(/\d+$/, "");
      base = sn === own ? sn : sn.startsWith(own + "_") ? sn.slice(own.length + 1) : sn;
    }
    if (!base || attr) { const w = slugWords(text); base = attr && base ? base : w.length ? w.join("_") : "s" + createHash("sha1").update(text).digest("hex").slice(0, 6); }
    key = `${prefix}_${base}${attr ? "_" + attr : ""}`;
  }
  if (taken.has(key) && taken.get(key) !== text) {
    if (ov || stage) throw new Error(`panel key collision: ${key} (line ${line})`);
    let n = 2;
    while (taken.has(`${key}_${n}`) && taken.get(`${key}_${n}`) !== text) n++;
    key = `${key}_${n}`;
  }
  return { key, fresh: true };
}

const lineOf = (starts, off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo; };

/** Extracts the panel copy from the text of v1's index.html. */
export function extractV1Panels(src, windows = V1_WINDOWS, fragments = windows === V1_WINDOWS ? FRAGMENTS : []) {
  const lines = src.split("\n");
  const taken = new Map(); // key -> text
  const byText = new Map(); // prefix, attr, text -> key
  const manifest = {};
  const add = (prefix, text, { id = null, attr = null, k = null, prop = null, from, to }) => {
    if (SKIP_TEXT.has(text)) return;
    const { key, fresh } = keyFor({ prefix, text, id, attr: attr || "", k, prop, taken, byText, line: from });
    if (!fresh) return;
    taken.set(key, text);
    byText.set(prefix + "\u0001" + (attr || "") + "\u0001" + text, key);
    manifest[key] = { lines: `${from}-${to}`, sha256: sha(lines, from, to) };
  };
  for (const w of windows) {
    const chunk = lines.slice(w.from - 1, w.to).join("\n");
    if (w.kind === "html") {
      const starts = [0];
      for (let i = 0; i < chunk.length; i++) if (chunk[i] === "\n") starts.push(i + 1);
      for (const it of htmlItems(chunk)) {
        add(w.prefix, it.text, { id: it.id, attr: it.attr, from: w.from + lineOf(starts, it.a), to: w.from + lineOf(starts, Math.max(it.a, it.b - 1)) });
      }
      continue;
    }
    const toks = tokenizeJs(chunk, w.from);
    for (const lit of joinLiterals(toks)) {
      if (lit.decls.some(d => SKIP_DECLS.has(d))) continue;
      if (lit.prop && SKIP_PROPS.has(lit.prop)) continue;
      const raw = literalText(lit.parts);
      if (!raw.trim()) continue;
      for (const piece of raw.split("\u0000")) {
        if (!piece.trim()) continue;
        const marked = TAGGED.test(piece) || /^[^<]*>/.test(piece) || /^["']\s+[\w-]+=/.test(piece);
        if (marked) {
          for (const it of htmlItems(piece, { partial: true })) {
            if (it.attr || markupAccepted(it.text)) add(w.prefix, it.text, { id: it.id, attr: it.attr, from: lit.line, to: lit.endLine });
          }
        } else {
          const t = cleanRun(piece);
          if (t.length >= 2 && plainAccepted(t)) add(w.prefix, t, { k: lit.k, prop: lit.prop, from: lit.line, to: lit.endLine });
        }
      }
    }
  }
  for (const f of fragments) {
    const at = lines[f.line - 1] ?? "";
    if (!at.includes(f.src)) throw new Error(`fragment ${f.key}: line ${f.line} does not hold ${f.src}`);
    if (!f.src.includes("'" + f.literal + "'")) throw new Error(`fragment ${f.key}: ${f.src} does not hold '${f.literal}'`);
    if (f.text.replace(/\{[^}]*\}/g, "").trim() !== f.literal.trim()) throw new Error(`fragment ${f.key}: "${f.text}" is not the literal '${f.literal}'`);
    if (taken.has(f.key)) throw new Error(`fragment key collision: ${f.key}`);
    taken.set(f.key, f.text);
    manifest[f.key] = { lines: `${f.line}-${f.line}`, sha256: sha(lines, f.line, f.line) };
  }
  const keys = Object.keys(manifest).sort();
  return { en: Object.fromEntries(keys.map(k => [k, taken.get(k)])), manifest: Object.fromEntries(keys.map(k => [k, manifest[k]])) };
}

/** Adds the panel strings to both dictionaries (Hindi = English until Dr. Sharma supplies Hindi). A key that exists already throws. */
export function applyV1Panels(en, hi, panels) {
  const outEn = { ...en }, outHi = { ...hi };
  for (const [k, v] of Object.entries(panels.en)) {
    if (k in outEn || k in outHi) throw new Error(`panel key collides with an existing key: ${k}`);
    outEn[k] = v;
    outHi[k] = v;
  }
  return { en: outEn, hi: outHi };
}
