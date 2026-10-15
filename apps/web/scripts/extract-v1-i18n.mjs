// Usage: node scripts/extract-v1-i18n.mjs /path/to/appuscholer/index.html [outDir]
// The dictionaries in messages/ are generated, with one exception: the eight v2 keys in i18n-overrides.mjs
// (terms_d1..d4, terms_ver, welcome_intro, faq_a_lost, faq_a_key; English only) are applied after extraction, so re-running this keeps them.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { applyOverrides } from "./i18n-overrides.mjs";
const src = readFileSync(process.argv[2], "utf8");
const outDir = process.argv[3] ? pathToFileURL(process.argv[3].replace(/\/?$/, "/")) : new URL("../messages/", import.meta.url);
const start = src.indexOf("const I18N={");
const end = src.indexOf("\n};", start);
if (start < 0 || end < 0) throw new Error("I18N block not found");
const literal = src.slice(start + "const I18N=".length, end + 2);
const I18N = new Function("return " + literal)();   // the block is string literals only (verified by the parity test below)
I18N.en = applyOverrides(I18N.en);
mkdirSync(outDir, { recursive: true });
for (const lang of ["en", "hi"]) {
  const sorted = Object.fromEntries(Object.keys(I18N[lang]).sort().map(k => [k, I18N[lang][k]]));
  writeFileSync(new URL(`${lang}.json`, outDir), JSON.stringify(sorted, null, 2) + "\n");
}
console.log("en", Object.keys(I18N.en).length, "hi", Object.keys(I18N.hi).length);
