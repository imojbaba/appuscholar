// The Hindi re-map (Task 39): v2's panel Hindi (ap2_, rs2_, sh2_ keys) was the English text until Dr. Sharma gave Hindi. Her newest v1
// (build 2026.10.24a, commit f5336be) has Hindi for the Research panel, Analyse a paper, the Reading shelf, toasts and dialogs, under v1 key
// names that differ from v2's. This module matches v2's English copies to that Hindi by the English text and writes the result as data.
//
// Usage (from apps/web), when a newer v1 is to be mapped:
//   node scripts/v1-hindi-remap.mjs <newest v1 index.html> <pinned v1 index.html> --commit <commit of the newest v1>
// The pinned v1 is the one extract-v1-i18n.mjs reproduces messages/ from (commit c8c5373, build 2026.10.13a). The v2 side of the match is the
// dictionaries as extract-v1-i18n.mjs holds them AT THE RE-MAP STEP (dictionariesAtRemap: everything before the re-map, nothing after it), so the
// remap file never depends on messages/, and a step that comes after the re-map (the copy pass, the emoji switch) cannot change the English it records.
// The result is scripts/fixtures/v1-hindi-remap.json. extract-v1-i18n.mjs applies it (applyV1HindiRemap) at that step and then runs the later
// steps; then the dictionaries are regenerated and `pnpm --filter @appuscholar/web i18n:remap` refreshes the sheet.
//
// Where v1 keeps Hindi (the sources, taken in this order; the v1 key of a result names its source):
//   I18N          the dictionary block, en and hi by key:                           ap_ask
//   AP_STAGES_HI  stage names and questions of Analyse a paper (v1 version 98): {stage: [name, ask]}, paired with AP_STAGES by the stage key: AP_STAGES_HI.gap.name
//   TOAST_HI      toasts (version 104): the Hindi by the English text:               TOAST_HI["Highlight off"]
//   STATIC_HI     fixed text inside dialogs (version 106): the Hindi by the English text: STATIC_HI["Start →"]
// TOAST_HI_RE (28 patterns, not texts) is not a source. The three tables are read as literals of strings (readV1Literal): nothing else of v1 runs.
//
// Match kinds, in order (the first that finds v1 Hindi decides):
//   exact        the v1 English is the v2 English
//   normalised   the same words once emoji, white space, tags and the Appuscholer/Appuscholar spelling are ignored (a Hindi whose tags differ is then refused)
//   placeholders the same words with v1's placeholder names ({n}, {d}) renamed to v2's ({doisCount}, {done}) by the order they first appear
// An English text that v1 gives two different Hindi values, in one source or in two, is not mapped (ambiguous). v1 Hindi that cannot be used as it is
// (other tags, other placeholders, other emoji) is not mapped either (rejected). No Hindi is written here: every value is Dr. Sharma's own, adjusted only in
// ways that keep the two languages alike: the Appuscholar spelling, the English's edge white space, the English's leading emoji.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { withPanelFixes } from "./i18n-overrides.mjs";

export const REMAP_URL = new URL("./fixtures/v1-hindi-remap.json", import.meta.url);

export const KIND = { EXACT: "exact", NORMALISED: "normalised", PLACEHOLDERS: "placeholders" };

/** English copies that are names or formats, not sentences: they stay as they are in both languages, whatever v1 has. */
export const KEEP_ENGLISH = [
  "erase_confirm_word", "exp_format_csv", "exp_format_json", "research_ext_base", "research_ext_jstor", "research_ext_scholar",
  "research_ext_sciencedirect", "research_src_pubmed", "tab_name_count", "vz_png", "vz_svg",
];

/** Emoji and pictographs, the joiners and variation selectors that go with them (as a regex character-class body). */
export const EMOJI_CLASS = "\\p{Extended_Pictographic}\\p{Emoji_Presentation}\\u{FE0F}\\u{200D}\\u{2600}-\\u{27BF}\\u{2B50}\\u{2B55}";
const EMOJI_RE = new RegExp(`[${EMOJI_CLASS}]`, "gu");
const LEAD_RE = new RegExp(`^(?:[${EMOJI_CLASS}]+\\s*)+`, "u");
const MARKUP_RE = /<\/?[a-z][^>]*>|&#?\w+;/gi;
const PLACEHOLDER_RE = /\{(\w+)\}/g;

/** The text without emoji and pictographs, spaces tidied. */
export function stripEmoji(s) {
  return s.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
}

/** The English as the match sees it: no emoji, one space between words, "Appuscholar" spelt the v2 way. */
export function normaliseEnglish(s) {
  return stripEmoji(withPanelFixes(s));
}

/** The words alone: normalised English without tags, so "<b>Check yourself.</b>" and "Check yourself." are found together (and then refused when the tags differ). */
const wordsOf = s => normaliseEnglish(s).replace(MARKUP_RE, "");

/** The text with its placeholders numbered by first appearance ({a} {b} {a} -> {#0} {#1} {#0}), and the names in that order. */
export function placeholderForm(s) {
  const names = [];
  const form = s.replace(PLACEHOLDER_RE, (_, n) => `{#${names.includes(n) ? names.indexOf(n) : names.push(n) - 1}}`);
  return { form, names };
}

const namesOf = s => [...new Set([...s.matchAll(PLACEHOLDER_RE)].map(m => m[1]))].sort().join();
const markupOf = s => (s.match(MARKUP_RE) ?? []).join("").toLowerCase();
const emojiOf = s => (s.match(EMOJI_RE) ?? []).filter(c => c !== "\u{FE0F}" && c !== "\u{200D}").join("");
const leadOf = s => (s.match(LEAD_RE) ?? [""])[0];
/** All placeholders renamed at once (one pass), so names that swap places do not run into each other. */
const rename = (s, from, to) => { const m = new Map(from.map((n, i) => [n, to[i]])); return s.replace(PLACEHOLDER_RE, (all, n) => (m.has(n) ? `{${m.get(n)}}` : all)); };

/** v1's Hindi written for this v2 English, or { reject } with the reason it cannot be used. `to` is v2's placeholder names in order; `src.names` is v1's. */
function convert(src, english, to) {
  let h = withPanelFixes(src.hi);
  if (namesOf(h) !== [...src.names].sort().join()) return { reject: "placeholders differ" };
  h = rename(h, src.names, to).trim();
  const [le, lh] = [leadOf(english.trim()), leadOf(h)];
  if (le.trim() !== lh.trim()) h = le + h.slice(lh.length);   // both languages lead with the same emoji, or none
  h = english.match(/^\s*/)[0] + h + english.match(/\s*$/)[0];
  if (markupOf(h) !== markupOf(english)) return { reject: "tags differ" };
  if (emojiOf(h) !== emojiOf(english)) return { reject: "emoji differ" };
  return { hi: h };
}

/**
 * Matches the English copies of v2's dictionaries (Hindi still equal to English) to v1's Hindi, from every source (`v1` as readV1Hindi gives it). Pure.
 * @param {{ en: Record<string, string>, hi: Record<string, string>, v1: { en: Record<string, string>, hi: Record<string, string> }, keepEnglish?: string[] }} a
 * @returns {{ keys: Record<string, { en: string, hi: string, v1Key: string, kind: string }>, ambiguous: Record<string, { en: string, v1: string[][] }>, rejected: Record<string, { en: string, v1Key: string, reason: string }>, keepEnglish: string[], noV1Hindi: string[] }}
 */
export function buildV1HindiRemap({ en, hi, v1, keepEnglish = KEEP_ENGLISH }) {
  const copyKeys = Object.keys(en).filter(k => hi[k] === en[k]).sort();
  for (const k of keepEnglish) if (!copyKeys.includes(k)) throw new Error(`keep-English key is not an English copy: ${k}`);
  // v1 entries that carry Hindi (a Hindi equal to the English, or none, is no source), in v1's order, indexed three ways.
  const sources = Object.keys(v1.en)
    .filter(k => typeof v1.hi[k] === "string" && v1.hi[k].trim() !== "" && v1.hi[k].trim() !== v1.en[k].trim())
    .map(k => { const norm = wordsOf(v1.en[k]); return { k, en: v1.en[k], hi: v1.hi[k], norm, form: placeholderForm(norm).form, names: placeholderForm(v1.en[k]).names }; });
  const index = by => { const m = new Map(); for (const s of sources) { const key = by(s); if (!m.has(key)) m.set(key, []); m.get(key).push(s); } return m; };
  const exact = index(s => s.en), same = index(s => s.norm), shaped = index(s => s.form);
  // Two Hindi values that differ only in the spelling, an edge space, a leading emoji or the placeholder names are one value.
  const canon = s => { const h = withPanelFixes(s.hi).trim(); return rename(h.slice(leadOf(h).length), s.names, s.names.map((_, i) => `#${i}`)); };
  const out = { keys: {}, ambiguous: {}, rejected: {}, keepEnglish: [...keepEnglish].sort(), noV1Hindi: [] };
  for (const k of copyKeys) {
    if (keepEnglish.includes(k)) continue;
    const e = en[k], norm = wordsOf(e), form = placeholderForm(norm).form;
    const [group, kind] = exact.has(e) ? [exact.get(e), KIND.EXACT] : same.has(norm) ? [same.get(norm), KIND.NORMALISED] : shaped.has(form) ? [shaped.get(form), KIND.PLACEHOLDERS] : [null, null];
    if (!group) { out.noV1Hindi.push(k); continue; }
    if (new Set(group.map(canon)).size > 1) { out.ambiguous[k] = { en: e, v1: group.map(s => [s.k, s.hi]) }; continue; }
    const r = convert(group[0], e, placeholderForm(e).names);
    if (r.reject) out.rejected[k] = { en: e, v1Key: group[0].k, reason: r.reject };
    else out.keys[k] = { en: e, hi: r.hi, v1Key: group[0].k, kind };
  }
  return out;
}

/**
 * Writes the remapped Hindi into the dictionaries. A listed key must hold exactly the recorded English and still have the English as its Hindi;
 * anything else throws (the pinned v1 is fixed, so a mismatch means the remap file is out of date). Returns new objects; English is untouched.
 */
export function applyV1HindiRemap(en, hi, remap) {
  const outHi = { ...hi };
  for (const [k, e] of Object.entries(remap.keys)) {
    if (!(k in en) || !(k in hi)) throw new Error(`remap key ${k}: missing from the ${k in en ? "Hindi" : "English"} dictionary`);
    if (en[k] !== e.en) throw new Error(`remap key ${k}: the English is not the one recorded, so the remap file is out of date (run scripts/v1-hindi-remap.mjs again)`);
    if (hi[k] !== en[k]) throw new Error(`remap key ${k}: the Hindi is not an English copy, so it is not written over`);
    outHi[k] = e.hi;
  }
  return { en: { ...en }, hi: outHi };
}

/** The I18N block of v1's index.html as { en, hi } (a literal of strings, read the way extract-v1-i18n.mjs always has). */
export function readV1I18N(src) {
  const start = src.indexOf("const I18N={");
  const end = src.indexOf("\n};", start);
  if (start < 0 || end < 0) throw new Error("I18N block not found");
  return new Function("return " + src.slice(start + "const I18N=".length, end + 2))();
}

/** The places v1 keeps Hindi, in the order the matcher takes them. The v1 key of a remap entry begins with its place, or is a bare I18N key. */
export const SOURCES = ["I18N", "AP_STAGES_HI", "TOAST_HI", "STATIC_HI"];

/**
 * The place a v1 key, as the remap file records it, comes from.
 * @param {string} v1Key
 * @returns {string}
 */
export function sourceOf(v1Key) {
  return SOURCES.slice(1).find(s => v1Key.startsWith(`${s}.`) || v1Key.startsWith(`${s}[`)) ?? SOURCES[0];
}

/**
 * The literal that v1 declares as `const NAME=...;` (an object or an array, nested as needed, of strings), or undefined when v1 has no such declaration.
 * The literal is scanned first and only then evaluated: quoted strings, brackets, commas, colons and bare names are all it may hold, so a call, a join,
 * a template or a spread throws instead of running, and nothing else of v1 runs. Throws too when NAME is declared twice or the statement goes on after it.
 */
export function readV1Literal(src, name) {
  const found = [...src.matchAll(new RegExp(`(?<![\\w$])const\\s+${name}\\s*=\\s*`, "g"))];
  if (found.length === 0) return undefined;
  if (found.length > 1) throw new Error(`${name} is declared more than once`);
  const bad = () => new Error(`${name} is not a literal of strings`);
  const from = found[0].index + found[0][0].length;
  if (src[from] !== "{" && src[from] !== "[") throw bad();
  let depth = 0, end = -1;
  for (let i = from; i < src.length && end < 0; i++) {
    const c = src[i];
    if (c === "'" || c === '"') {
      for (i++; src[i] !== c; i++) if (i >= src.length || src[i] === "\n") throw bad(); else if (src[i] === "\\") i++;
    } else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { if (--depth === 0) end = i + 1; }
    else if (!/[\s,:\w$]/.test(c)) throw bad();
  }
  if (end < 0 || !/^[ \t]*;/.test(src.slice(end))) throw bad();
  return new Function("return " + src.slice(from, end))();
}

/**
 * The Hindi that v1 keeps in tables beside I18N, as { en, hi } like I18N's two halves; each key names the table and the entry:
 *   AP_STAGES_HI.<stage>.name and .ask   the stage names and questions of Analyse a paper (the Hindi table is {stage: [name, ask]}; the English is the
 *                                        stage's in AP_STAGES; the two are paired by the stage key `k`, as apStName and apStAsk do)
 *   TOAST_HI["<English>"]                toasts (showToast looks the shown text up in the table as it is)
 *   STATIC_HI["<English>"]               fixed text inside dialogs (i18nStatic looks up a text node, its white space collapsed, or a placeholder)
 * A table that v1 lacks adds nothing (the pinned v1 has none of the three). TOAST_HI_RE is not read: its keys are patterns, not texts.
 * @returns {{ en: Record<string, string>, hi: Record<string, string> }}
 */
export function readV1Tables(src) {
  const out = { en: {}, hi: {} };
  const add = (key, e, h) => {
    if (typeof e !== "string" || typeof h !== "string") throw new Error(`${key}: the English and the Hindi are not both strings`);
    out.en[key] = e;
    out.hi[key] = h;
  };
  const stagesHi = readV1Literal(src, "AP_STAGES_HI");
  if (stagesHi !== undefined) {
    const stages = readV1Literal(src, "AP_STAGES");
    if (!Array.isArray(stages)) throw new Error("AP_STAGES_HI is there but AP_STAGES is not a list of stages");
    for (const k of Object.keys(stagesHi)) if (!stages.some(st => st.k === k)) throw new Error(`AP_STAGES_HI.${k} has no stage ${k} in AP_STAGES`);
    for (const st of stages) {
      const h = stagesHi[st.k];
      if (h === undefined) continue;   // a stage with no Hindi
      if (!Array.isArray(h) || h.length !== 2) throw new Error(`AP_STAGES_HI.${st.k} is not [name, ask]`);
      add(`AP_STAGES_HI.${st.k}.name`, st.name, h[0]);
      add(`AP_STAGES_HI.${st.k}.ask`, st.ask, h[1]);
    }
  }
  for (const table of ["TOAST_HI", "STATIC_HI"]) {
    const t = readV1Literal(src, table);
    if (t !== undefined) for (const [e, h] of Object.entries(t)) add(`${table}[${JSON.stringify(e)}]`, e, h);
  }
  return out;
}

/**
 * All the Hindi the matcher may use, as { en, hi } by v1 key: the I18N block first, then the tables beside it (SOURCES gives the order).
 * @returns {{ en: Record<string, string>, hi: Record<string, string> }}
 */
export function readV1Hindi(src) {
  const base = readV1I18N(src), tables = readV1Tables(src);
  return { en: { ...base.en, ...tables.en }, hi: { ...base.hi, ...tables.hi } };
}

/** The build stamp of v1 ('2026.10.24a'). */
export function readV1Build(src) {
  const m = /const APP_BUILD='([^']+)'/.exec(src);
  if (!m) throw new Error("APP_BUILD not found");
  return m[1];
}

/** Which v1 the remap was made from: the commit (given), the build stamp and the sha256 of the file. */
export function v1Stamp(src, commit) {
  if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error(`not a commit id: ${commit}`);
  return { commit, build: readV1Build(typeof src === "string" ? src : src.toString("utf8")), sha256: createHash("sha256").update(src).digest("hex") };
}

/** One key per line, so a change to the file is readable in a diff. */
export function serializeRemap(r) {
  const j = JSON.stringify;
  const obj = o => (Object.keys(o).length ? `{\n${Object.keys(o).map(k => `${j(k)}: ${j(o[k])}`).join(",\n")}\n}` : "{}");
  const arr = a => (a.length ? `[\n${a.map(x => j(x)).join(",\n")}\n]` : "[]");
  return `{\n"v1": ${j(r.v1)},\n"keys": ${obj(r.keys)},\n"ambiguous": ${obj(r.ambiguous)},\n"rejected": ${obj(r.rejected)},\n"keepEnglish": ${arr(r.keepEnglish)},\n"noV1Hindi": ${arr(r.noV1Hindi)}\n}\n`;
}

/** The committed remap file. */
export function readRemapFile() {
  return JSON.parse(readFileSync(REMAP_URL, "utf8"));
}

async function generate(argv) {
  const flag = argv.indexOf("--commit");
  const commit = flag >= 0 ? argv[flag + 1] : undefined;
  const [newest, pinned] = argv.filter((a, i) => !a.startsWith("--") && i !== flag + 1);
  if (!newest || !pinned || !commit) throw new Error("usage: node scripts/v1-hindi-remap.mjs <newest v1 index.html> <pinned v1 index.html> --commit <commit of the newest v1>");
  const raw = readFileSync(newest);
  const v1 = readV1Hindi(raw.toString("utf8"));
  // v2's dictionaries at the re-map step: the same build as extract-v1-i18n.mjs, from the pinned v1, up to the re-map and no further. Imported here, after
  // this module has loaded, because that module imports this one (a static import, or an await while this module loads, would wait on itself).
  const { dictionariesAtRemap } = await import("./extract-v1-i18n.mjs");
  const { en, hi } = dictionariesAtRemap(readFileSync(pinned, "utf8"));
  const built = buildV1HindiRemap({ en, hi, v1 });
  writeFileSync(REMAP_URL, serializeRemap({ v1: v1Stamp(raw, commit), ...built }));
  const n = o => Object.keys(o).length;
  const count = by => Object.values(built.keys).reduce((c, e) => ({ ...c, [by(e)]: (c[by(e)] ?? 0) + 1 }), {});
  console.log(`remapped ${n(built.keys)} (${JSON.stringify(count(e => e.kind))}; by source ${JSON.stringify(count(e => sourceOf(e.v1Key)))}), ambiguous ${n(built.ambiguous)}, rejected ${n(built.rejected)}, kept English ${built.keepEnglish.length}, no v1 Hindi ${built.noV1Hindi.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generate(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
}
