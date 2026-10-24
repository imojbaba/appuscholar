import helpGuideEn from "./help-guide.en.json";
import helpGuideHi from "./help-guide.hi.json";
import helpReportEn from "./help-report.en.json";
import helpReportHi from "./help-report.hi.json";
import helpRecapEn from "./help-recap.en.json";
import helpRecapHi from "./help-recap.hi.json";
import helpBackupEn from "./help-backup.en.json";
import helpBackupHi from "./help-backup.hi.json";
import helpInstallEn from "./help-install.en.json";
import helpInstallHi from "./help-install.hi.json";
import helpThemeEn from "./help-theme.en.json";
import helpThemeHi from "./help-theme.hi.json";
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

/**
 * Every tool's own copy (Task G4, rulings R13 and R14), by file name: `<tool>.en.json` and `<tool>.hi.json` for the eight tool modules of
 * stages 3 to 6 (lib/tools/registry.ts). Imported statically, so the build carries them and lib/i18n.tsx merges them into t(); a tool session
 * adds keys to its own two files only. A Hindi file starts with its `$draft` marker (keys starting with `$` are never copy). test/i18n.test.ts
 * checks that every file in this folder is listed here.
 */
export const TOOL_MESSAGE_FILES: Readonly<Record<string, Record<string, string>>> = {
  "help-guide.en.json": helpGuideEn, "help-guide.hi.json": helpGuideHi,
  "help-report.en.json": helpReportEn, "help-report.hi.json": helpReportHi,
  "help-recap.en.json": helpRecapEn, "help-recap.hi.json": helpRecapHi,
  "help-backup.en.json": helpBackupEn, "help-backup.hi.json": helpBackupHi,
  "help-install.en.json": helpInstallEn, "help-install.hi.json": helpInstallHi,
  "help-theme.en.json": helpThemeEn, "help-theme.hi.json": helpThemeHi,
  "close.en.json": closeEn, "close.hi.json": closeHi,
  "design.en.json": designEn, "design.hi.json": designHi,
  "qual.en.json": qualEn, "qual.hi.json": qualHi,
  "slides.en.json": slidesEn, "slides.hi.json": slidesHi,
  "stats.en.json": statsEn, "stats.hi.json": statsHi,
  "style.en.json": styleEn, "style.hi.json": styleHi,
  "viva.en.json": vivaEn, "viva.hi.json": vivaHi,
  "words.en.json": wordsEn, "words.hi.json": wordsHi
};
