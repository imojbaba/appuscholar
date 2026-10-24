// Usage: node scripts/extract-v1-i18n.mjs /path/to/appuscholer/index.html [outDir] [--no-remap]
// The dictionaries in messages/ are generated, with one exception: the nine v2 keys in i18n-overrides.mjs
// (terms_d1..d4, terms_ver, welcome_intro, faq_a_lost, faq_a_key, sap_desc) are applied after extraction, so re-running this keeps them,
// and their v1 Hindi strings are replaced by the HINDI_DRAFTS (drafts for Dr. Sharma's review, not yet approved).
// V2_STRINGS (vault, export, account deletion: new copy with no v1 equivalent) are added after that, in both languages; a key that collides with a v1 key throws.
// The panel copy of v1 that has no data-i18n key (Research, Analyse a paper, Reading shelf) is added last by extract-v1-panels.mjs as rs2_/ap2_/sh2_ keys,
// Hindi = English until Dr. Sharma provides Hindi, and messages/v1-panels.manifest.json records each key's v1 lines and their sha256.
// Last, applyV1HindiRemap writes the Hindi that Dr. Sharma has since given in her newest v1 over those English copies (scripts/fixtures/v1-hindi-remap.json,
// made by v1-hindi-remap.mjs from build 2026.10.24a). It runs after the panel fixes, so those still see the English in both languages; it throws if a
// key's English is not the recorded one. --no-remap leaves this step out: v1-hindi-remap.mjs uses that to read the dictionaries before the remap.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { applyOverrides, applyHindiDrafts, applyV2Strings, applyPanelFixes } from "./i18n-overrides.mjs";
import { extractV1Panels, applyV1Panels } from "./extract-v1-panels.mjs";
import { applyV1HindiRemap, readRemapFile, readV1I18N } from "./v1-hindi-remap.mjs";
const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const src = readFileSync(args[0], "utf8");
const outDir = args[1] ? pathToFileURL(args[1].replace(/\/?$/, "/")) : new URL("../messages/", import.meta.url);
const I18N = readV1I18N(src);   // the block is string literals only (verified by the parity test below)
I18N.en = applyOverrides(I18N.en);
I18N.hi = applyHindiDrafts(I18N.hi);
({ en: I18N.en, hi: I18N.hi } = applyV2Strings(I18N.en, I18N.hi));   // new v2 copy with no v1 equivalent; throws if a key collides with a v1 key
const panels = extractV1Panels(src);
({ en: I18N.en, hi: I18N.hi } = applyV1Panels(I18N.en, I18N.hi, panels));   // throws if a panel key collides with an existing key
({ en: I18N.en, hi: I18N.hi } = applyPanelFixes(I18N.en, I18N.hi));   // v1 panel typos ("Appuscholer", W21); throws if a key is missing or has no match
if (!process.argv.includes("--no-remap")) ({ en: I18N.en, hi: I18N.hi } = applyV1HindiRemap(I18N.en, I18N.hi, readRemapFile()));   // Dr. Sharma's newer Hindi; throws if a recorded English changed
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("v1-panels.manifest.json", outDir), JSON.stringify(panels.manifest, null, 2) + "\n");
for (const lang of ["en", "hi"]) {
  const sorted = Object.fromEntries(Object.keys(I18N[lang]).sort().map(k => [k, I18N[lang][k]]));
  writeFileSync(new URL(`${lang}.json`, outDir), JSON.stringify(sorted, null, 2) + "\n");
}
console.log("en", Object.keys(I18N.en).length, "hi", Object.keys(I18N.hi).length);
