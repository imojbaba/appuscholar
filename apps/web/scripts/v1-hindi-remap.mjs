// The Hindi re-map (Task 39): v2's panel Hindi (ap2_, rs2_, sh2_ keys) was the English text until Dr. Sharma gave Hindi. Her newest v1
// (build 2026.10.24a, commit f5336be) has Hindi for the Research panel, Analyse a paper, the Reading shelf, toasts and dialogs, under v1 key
// names that differ from v2's. This module matches v2's English copies to that Hindi by the English text and writes the result as data.
//
// Usage (from apps/web), when a newer v1 is to be mapped:
//   node scripts/v1-hindi-remap.mjs <newest v1 index.html> <pinned v1 index.html> --commit <commit of the newest v1>
// The pinned v1 is the one extract-v1-i18n.mjs reproduces messages/ from (commit c8c5373, build 2026.10.13a). The v2 side of the match is the
// dictionaries as extract-v1-i18n.mjs builds them from it BEFORE the remap (run with --no-remap), so the remap file never depends on messages/.
// The result is scripts/fixtures/v1-hindi-remap.json. extract-v1-i18n.mjs applies it last (applyV1HindiRemap), then the dictionaries are
// regenerated and `pnpm --filter @appuscholar/web i18n:remap` refreshes the sheet.
//
// Match kinds, in order (the first that finds v1 Hindi decides):
//   exact        the v1 English is the v2 English
//   normalised   the same words once emoji, white space, tags and the Appuscholer/Appuscholar spelling are ignored (a Hindi whose tags differ is then refused)
//   placeholders the same words with v1's placeholder names ({n}, {d}) renamed to v2's ({doisCount}, {done}) by the order they first appear
// An English text that v1 gives two different Hindi values is not mapped (ambiguous). v1 Hindi that cannot be used as it is (other tags,
// other placeholders, other emoji) is not mapped either (rejected). No Hindi is written here: every value is Dr. Sharma's own, adjusted only in
// ways that keep the two languages alike: the Appuscholar spelling, the English's edge white space, the English's leading emoji.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
 * Matches the English copies of v2's dictionaries (Hindi still equal to English) to v1's I18N Hindi. Pure.
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--commit");
  const commit = flag >= 0 ? argv[flag + 1] : undefined;
  const [newest, pinned] = argv.filter((a, i) => !a.startsWith("--") && i !== flag + 1);
  if (!newest || !pinned || !commit) throw new Error("usage: node scripts/v1-hindi-remap.mjs <newest v1 index.html> <pinned v1 index.html> --commit <commit of the newest v1>");
  const raw = readFileSync(newest);
  const v1 = readV1I18N(raw.toString("utf8"));
  // v2's dictionaries before the remap: the same build as extract-v1-i18n.mjs, from the pinned v1, with the remap step left out.
  const tmp = mkdtempSync(join(tmpdir(), "v1-hindi-remap-"));
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL("./extract-v1-i18n.mjs", import.meta.url)), pinned, tmp, "--no-remap"], { stdio: "pipe" });
    const [en, hi] = ["en.json", "hi.json"].map(f => JSON.parse(readFileSync(join(tmp, f), "utf8")));
    const built = buildV1HindiRemap({ en, hi, v1 });
    writeFileSync(REMAP_URL, serializeRemap({ v1: v1Stamp(raw, commit), ...built }));
    const n = o => Object.keys(o).length;
    const kinds = Object.values(built.keys).reduce((c, e) => ({ ...c, [e.kind]: (c[e.kind] ?? 0) + 1 }), {});
    console.log(`remapped ${n(built.keys)} (${JSON.stringify(kinds)}), ambiguous ${n(built.ambiguous)}, rejected ${n(built.rejected)}, kept English ${built.keepEnglish.length}, no v1 Hindi ${built.noV1Hindi.length}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
