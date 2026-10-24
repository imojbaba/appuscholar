import closeEn from "./close.en.json";
import closeHi from "./close.hi.json";
import designEn from "./design.en.json";
import designHi from "./design.hi.json";
import qualEn from "./qual.en.json";
import qualHi from "./qual.hi.json";
import slidesEn from "./slides.en.json";
import slidesHi from "./slides.hi.json";
import statsEn from "./stats.en.json";
import statsHi from "./stats.hi.json";
import styleEn from "./style.en.json";
import styleHi from "./style.hi.json";
import vivaEn from "./viva.en.json";
import vivaHi from "./viva.hi.json";
import wordsEn from "./words.en.json";
import wordsHi from "./words.hi.json";
import dictationEn from "./dictation.en.json";
import dictationHi from "./dictation.hi.json";
import aipillEn from "./aipill.en.json";
import aipillHi from "./aipill.hi.json";
import samplesEn from "./samples.en.json";
import samplesHi from "./samples.hi.json";
import picturesEn from "./pictures.en.json";
import picturesHi from "./pictures.hi.json";
import captionsEn from "./captions.en.json";
import captionsHi from "./captions.hi.json";
import studioEn from "./studio.en.json";
import studioHi from "./studio.hi.json";
import dockEn from "./dock.en.json";
import dockHi from "./dock.hi.json";

/**
 * Every tool's own copy (Task G4, rulings R13 and R14), by file name: `<tool>.en.json` and `<tool>.hi.json` for the eight tool modules of
 * stages 3 to 6 (lib/tools/registry.ts). Imported statically, so the build carries them and lib/i18n.tsx merges them into t(); a tool session
 * adds keys to its own two files only. A Hindi file starts with its `$draft` marker (keys starting with `$` are never copy). test/i18n.test.ts
 * checks that every file in this folder is listed here.
 */
export const TOOL_MESSAGE_FILES: Readonly<Record<string, Record<string, string>>> = {
  "close.en.json": closeEn, "close.hi.json": closeHi,
  "design.en.json": designEn, "design.hi.json": designHi,
  "qual.en.json": qualEn, "qual.hi.json": qualHi,
  "slides.en.json": slidesEn, "slides.hi.json": slidesHi,
  "stats.en.json": statsEn, "stats.hi.json": statsHi,
  "style.en.json": styleEn, "style.hi.json": styleHi,
  "viva.en.json": vivaEn, "viva.hi.json": vivaHi,
  "words.en.json": wordsEn, "words.hi.json": wordsHi,
  "dictation.en.json": dictationEn, "dictation.hi.json": dictationHi,
  "aipill.en.json": aipillEn, "aipill.hi.json": aipillHi,
  "samples.en.json": samplesEn, "samples.hi.json": samplesHi,
  "pictures.en.json": picturesEn, "pictures.hi.json": picturesHi,
  "captions.en.json": captionsEn, "captions.hi.json": captionsHi,
  "studio.en.json": studioEn, "studio.hi.json": studioHi,
  "dock.en.json": dockEn, "dock.hi.json": dockHi
};
