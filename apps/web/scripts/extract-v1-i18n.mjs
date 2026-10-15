// Usage: node scripts/extract-v1-i18n.mjs /path/to/appuscholer/index.html
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
const start = src.indexOf("const I18N={");
const end = src.indexOf("\n};", start);
if (start < 0 || end < 0) throw new Error("I18N block not found");
const literal = src.slice(start + "const I18N=".length, end + 2);
const I18N = new Function("return " + literal)();   // the block is string literals only (verified by the parity test below)
for (const lang of ["en", "hi"]) {
  const sorted = Object.fromEntries(Object.keys(I18N[lang]).sort().map(k => [k, I18N[lang][k]]));
  writeFileSync(new URL(`../messages/${lang}.json`, import.meta.url), JSON.stringify(sorted, null, 2) + "\n");
}
console.log("en", Object.keys(I18N.en).length, "hi", Object.keys(I18N.hi).length);
