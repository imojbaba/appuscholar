import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import en from "../messages/en.json";

const ROOT = join(__dirname, "..");
const DIRS = ["components", "lib"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

/** Values worth guarding: 3+ characters with at least one letter or digit (so "✨", "…", "—" are skipped). */
const values = new Set(
  Object.values(en as Record<string, string>)
    .map(v => v.trim())
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
});
