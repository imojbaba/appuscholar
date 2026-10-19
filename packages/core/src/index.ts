export const CORE_VERSION = "0.1.0";
export { sanitizeHtml, wordCount } from "./sanitize";
export { parseV1Backup, v1BodyToHtml, chunkV1Documents } from "./v1import";
export type { V1Backup, V1Document, V1Project, V1ParseResult, V1ImportDocument } from "./v1import";
export { unlockV1Backup, isLockedV1Backup } from "./v1locked";
export type { V1UnlockResult } from "./v1locked";
export { scanText, maskText, PD_KINDS } from "./pd";
export { accCheck, accItems } from "./accuracy";
export { provHash, originCount, originShare } from "./origin";
export type { OriginStats } from "./origin";
export { classifyAiUse } from "./aiuse";
export type { AiUseGroup } from "./aiuse";
export { PLAIN_OUT, contentLangInstruction, fieldLabel, buildWritingPrompt, buildDraftFirstPrompt, buildChatPrompt } from "./prompts";
export type { WritingKind, Built } from "./prompts";
export { PROVIDERS, PROV_ORDER } from "./providers";
export type { ProviderId, ProviderInfo } from "./providers";
export { docInnerText, docTextContent } from "./doctext";
export { gammaln, betai, gammaq, erf, normalCDF, pFromT, pFromF, pFromChi, pFromZ } from "./pvalue";
export { noLead, pCell, fmtP } from "./statfmt";
export { ncFind, ncJudge, ncPOf, ncFmtP, numbersCheck, numbersCheckHtml, numbersSummary } from "./numbers";
export type { NcKind, NcFind, NcNote, NcJudge } from "./numbers";
export { escHTML, escAttr } from "./html";
export { CIT_STYLES, citFmt, citKind, citLastName, citNames, citInitials, citIsNumbered, apaAuthors, apa6Authors, mlaAuthors, chicagoAuthors, harvardAuthors, vancAuthors, ieeeAuthors } from "./citation";
export type { CitationStyle, CitationEntry, CitationKind, Formatted } from "./citation";
export { CC_SN, CC_YR, CC_STOP, ccNorm, ccKey, ccYrMatch, ccSplit, ccParseRef, ccCites, ccLev, ccAnalyse, crossCheckHtml } from "./crosscheck";
export type { CcCite, CcRef, CcUniq, CcMissing, CcResult } from "./crosscheck";
export { citKey, citNumFor, docPlainForCitations, citRegex, citNumsIn, citUsageNumbered, citUsage, bibliography, bibliographyHtml, mergeLibrary, exportLibrary, LIBRARY_FILE_NAME, LIBRARY_IMPORT_MAX_BYTES } from "./citlib";
export type { PlainDoc, Usage } from "./citlib";
export { AP_SAMPLE, AP_STAGES, AP_HEADS, AP_STOP, AP_NAME, apSquash, apToks, apHeadName, apBuild, apPick, apJson, apCheckQuote, apNumbers, apRefDois, retrNormDoi, retrValidDoi } from "./analyse";
export type { ApChunk, ApDoc, ApStage, ApNumber } from "./analyse";
export { pdCsvCell, pdCsv } from "./csv";
export { RS_DESIGNS, RS_DESIGN, rsReconstructAbstract, rsOaStatus, rsQuickCheck, rsRankParse, rsCleanTerm, rsBuildQuery, rsDedupe, rsFilterPass, rsCsvText, rsAuthorsToCit, rsEntryFromResult, rsCorpusText } from "./research";
export type { RsQuick, RsPaper, RsFilter } from "./research";
export { buildIdeaPrompt } from "./prompts-idea";
export { HELPER_TEMPS, HELPER_MIN_CHARS, VIVA_MIN_WORDS, DEVIL_MIN_WORDS, buildHelperPrompt, buildDevilPrompt, buildVivaPrompt } from "./prompts-helpers";
export type { HelperKind } from "./prompts-helpers";
export { QUICK_READ_MIN_CHARS, buildQuickReadPrompt, buildRankPrompt, buildSuggestTermsPrompt, buildLitReviewPrompt, buildGapFinderPrompt } from "./prompts-research";
export { AP_RULES, LESSON_QUESTION_MAX_CHARS, buildAskPrompt, buildWalkPrompt, buildLessonAskPrompt } from "./prompts-analyse";
export {
  smean, svar, ssd, smedian, ranks, stkNormCdf, stkQnorm, stkPoly, stkShapiro, stkBrownForsythe, stkRSS, stkAnova2, stkOLS, stkLogit, stkAUC, stkSimpleEffects,
  plRng, plNorm, plSim, pwLogPois, pwNcChiSf, pwNcFSf, pwNctCdf, pwChiCrit, pwPowerT, pwPowerF, pwPower, pwSolveN, pwSolveEffect,
  stkTCrit, stkFQuant, stkTieTerm, stkHolm, stkKruskal, stkDunn, stkSpearman, stkCorrMat, stkOmega, stkAlpha, stkRng, stkOmegaBoot,
  STK_GL, stkGL, stkPhi, stkPtukey, stkQtukey, stkWelchAnova, stkGamesHowell, stkLogChoose, stkFisherRC, stkFisher2x2, stkExactMW, stkExactSR, stkBinomTwo,
} from "./statsmath";
export type { Anova2, Anova2Row, Ols, Logit, LogitFit, Eff, SimRun, PowerTest, PowerSpec, Kruskal, DunnPair, Spearman, Omega, Welch, GamesHowellPair, FisherRC } from "./statsmath";
export { statsSplitLine, statsParseText } from "./intake";
export type { ParsedData, ParsedCol } from "./intake";
export { PD_HDR, PD_LABEL, PD_DEFAULT, pdTestVal, pdScan, pdTransform } from "./pdscan";
export type { PdKind, PdFound, PdChoice, PdTransform } from "./pdscan";
export { STAT_TESTS, statsColVals, statsGroupBy, stkIsBinaryCol, stkBinData, stkBinom5, sig, stkAssumpBlock, stkAssumpFor, stkAnova2Cells, stkMRData, finishResult } from "./stats-core";
export type { StatsTestKey, StatsForm, StatsCtx, StatsBlock, StatsResult, StatsOk, StatsFail, StatsTestDef, StatsField, StatsFieldType, StatsExtra, BinData, Anova2Cells, MRData, MRRef } from "./stats-core";
export { runStats } from "./stats";
export { runTtestInd, runTtestPaired, runAnova1, runTukey, runRegression, runPearson } from "./stats-means";
export { runMannwhitney, runWilcoxon, runKruskal, runSpearman, runWelchAnova } from "./stats-ranks";
