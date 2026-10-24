import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { DICTS } from "../lib/i18n";

const ROOT = join(__dirname, "..");
const DIRS = ["components", "lib"];

function walk(dir: string, ext: (p: string) => boolean = p => p.endsWith(".tsx")): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, ext) : ext(p) ? [p] : [];
  });
}

/**
 * What the .ts modules of the stage-2 directories (and lib/ai, whose action modules the stage-2 panels call) carry that equals a dictionary value,
 * one entry per occurrence. Each is a stored data token, not copy: the source type values of v1 880 ("Journal article", "Book" ... saved in the record,
 * labelled through cite_type_*), the sort and field ids ("year"), the source name "PubMed" and the "year" key of the retraction check's reply.
 * One entry is not a data token: lib/ai/callAI.ts's "bad-pass" sentence equals `vault_wrong`, which has Hindi. It is v1's apiMsg, a pure function with no
 * `t`, from before stage 2 (Phase 3A code); it stays pinned by controller ruling R31. A new literal anywhere in these directories, or a second use of a pinned one in the same file, fails this test until it goes through t() or is
 * added here with its reason. (The English constants that have no dictionary key, ruling R15, are not hits and are not listed.)
 */
const STAGE2_TS_KNOWN = [
  'lib/cite/form.ts "Journal article"', 'lib/cite/form.ts "Book"', 'lib/cite/form.ts "Website"', 'lib/cite/form.ts "Book chapter"',
  'lib/cite/form.ts "Report"', 'lib/cite/form.ts "Conference paper"', 'lib/cite/form.ts "Journal article"', 'lib/cite/form.ts "year"',
  'lib/research/library.ts "Journal article"', 'lib/research/useSearch.ts "year"', 'lib/research/useSearch.ts "year"', 'lib/research/useSearch.ts "PubMed"',
  'lib/blobs/kinds.ts "year"',
  'lib/ai/callAI.ts "Wrong passphrase — nothing was unlocked. Try again."',
];

/** The stage-2 directories. The walk above reads .tsx only; these also have their .ts modules read (the action modules carry student-facing sentences). */
const STAGE2_DIRS = [
  "components/tools/cite", "components/tools/research", "components/tools/shelf", "components/tools/analyse",
  "lib/cite", "lib/research", "lib/shelf", "lib/analyse", "lib/popout", "lib/blobs", "lib/ai",
];

/**
 * Keys whose value is also a data token, not copy: "DELETE" (a typed confirmation) is also the HTTP method the API client sends; the stage
 * names of the project list's spoken summary ("idea", "writing", "review") are also the stage ids (StageKey); the closeness check's source kind
 * "pasted" (close_kind_pasted) is also the result kind of the style live check (components/tools/style/StyleChecks.tsx).
 */
const NOT_COPY = new Set(["erase_confirm_word", "state_sum_idea", "state_sum_writing", "state_sum_review", "close_kind_pasted"]);

/**
 * Values worth guarding: 3+ characters with at least one letter or digit (so "✨", "…", "—" are skipped). Read from the dictionary t() reads,
 * so a tool's own copy (messages/tools/<tool>.en.json, Task G4) is guarded as v1's is.
 */
const values = new Set(
  Object.entries(DICTS.en)
    .filter(([k]) => !NOT_COPY.has(k))
    .map(([, v]) => v.trim())
    .filter(v => v.length >= 3 && /[\p{L}\p{N}]/u.test(v)),
);
// A literal that is the key argument of t( or tHtml( is a lookup, not copy. Only the characters right before the opening quote count, so another t( on the same line does not excuse a literal.
const KEY_ARG = /\b(?:t|tHtml)\(\s*$/;

/** Blanks out comments (keeping line structure) while leaving string contents alone. */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += n ?? ""; i += 2; continue; }
      // a quote that does not close on its own line was an apostrophe in JSX text, not a string
      if (c === quote || (c === "\n" && quote !== "`")) quote = null;
      i++;
      continue;
    }
    if (c === "/" && n === "/" && !/[:\w]/.test(src[i - 1] ?? " ")) { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    out += c;
    i++;
  }
  return out;
}

export function findOffenders(file: string, src: string): string[] {
  const hits: string[] = [];
  const lines = stripComments(src).split("\n");
  lines.forEach((line, idx) => {
    const found: string[] = [];
    // quoted literals: "..." '...' `...` (a literal with ${} interpolation is not an exact match, so it is skipped)
    for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`/g)) {
      if (KEY_ARG.test(line.slice(0, m.index))) continue;
      found.push(m[1] ?? m[2] ?? m[3] ?? "");
    }
    // JSX text on one line: >text<
    for (const m of line.matchAll(/>([^<>{}]+)</g)) found.push(m[1]!);
    // JSX text that sits alone on its own line
    if (!/[<>{}=;()]/.test(line)) found.push(line);
    for (const f of found) {
      const v = f.trim();
      if (values.has(v)) hits.push(`${relative(ROOT, file)}:${idx + 1} "${v}"`);
    }
  });
  return hits;
}

describe("i18n coverage", () => {
  it("finds a literal that equals a v1 value, and ignores translated lines, comments and short values", () => {
    expect(findOffenders("x.tsx", `<b>{x}</b>\nconst a = "Cancel";\nconst b = t("cancel"); // "Cancel"\n// "Cancel"\nconst c = "OK";`)).toHaveLength(1);
    expect(findOffenders("x.tsx", `<p>\n  Cancel\n</p>`)).toHaveLength(1);
    expect(findOffenders("x.tsx", `const u = "https://x"; const a = "Cancel";`)).toHaveLength(1);
    // a t( elsewhere on the line does not excuse a literal that is not its argument
    expect(findOffenders("x.tsx", `<b aria-label="Cancel" title={t("x")}>{t( "Cancel" )}</b>`)).toHaveLength(1);
    expect(findOffenders("x.tsx", `<b>{tHtml(t("Cancel"))}</b>`)).toHaveLength(0);
  });
  it("no component or lib file carries a literal that equals a v1 en.json value outside t()", () => {
    const offenders = DIRS.flatMap(d => walk(join(ROOT, d))).flatMap(f => findOffenders(f, readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("the stage-2 components and lib modules (.ts and .tsx) carry no new such literal", () => {
    const files = STAGE2_DIRS.flatMap(d => walk(join(ROOT, d), p => p.endsWith(".ts") || p.endsWith(".tsx")));
    expect(files.length).toBeGreaterThan(40);
    expect(files.map(f => relative(ROOT, f))).toEqual(expect.arrayContaining(["lib/cite/actions.ts", "lib/shelf/actions.ts", "lib/analyse/walk.ts", "lib/research/extras.ts", "components/tools/analyse/Walk.tsx"]));
    const offenders = [...files.flatMap(f => findOffenders(f, readFileSync(f, "utf8"))).map(h => h.replace(/:\d+ /, " "))].sort();
    expect(offenders).toEqual([...STAGE2_TS_KNOWN].sort());
  });
  it("every rs2_, ap2_ and sh2_ key in English is in Hindi too (English text where Dr. Sharma has not given Hindi yet), so none counts as an untranslated literal", () => {
    const keys = Object.keys(en).filter(k => /^(rs2|ap2|sh2)_/.test(k));
    expect(keys.length).toBeGreaterThan(0);
    const hindi = hi as Record<string, string>;
    expect(keys.filter(k => !(k in hindi))).toEqual([]);
  });
});
