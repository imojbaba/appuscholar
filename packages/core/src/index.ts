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
export { RS_DESIGNS, RS_DESIGN, rsReconstructAbstract, rsOaStatus, rsQuickCheck, rsRankParse, rsCleanTerm, rsBuildQuery, pmTopicBlock, rsBuildQueryV2, rsDedupe, rsFilterPass, rsCsvText, rsAuthorsToCit, rsEntryFromResult, rsCorpusText } from "./research";
export type { RsQuick, RsPaper, RsFilter } from "./research";
export { buildIdeaPrompt, buildIdeaPromptV2, IDEA_AREA_FORMAT_V1, IDEA_AREA_FORMAT_V2 } from "./prompts-idea";
export { HELPER_TEMPS, HELPER_MIN_CHARS, VIVA_MIN_WORDS, DEVIL_MIN_WORDS, buildHelperPrompt, buildDevilPrompt, buildVivaPrompt } from "./prompts-helpers";
export type { HelperKind } from "./prompts-helpers";
export { QUICK_READ_MIN_CHARS, buildQuickReadPrompt, buildRankPrompt, buildSuggestTermsPrompt, buildLitReviewPrompt, buildGapFinderPrompt, buildGapFinderPromptV2 } from "./prompts-research";
export { AP_RULES, LESSON_QUESTION_MAX_CHARS, buildAskPrompt, buildWalkPrompt, buildLessonAskPrompt } from "./prompts-analyse";
// Stage 2: network fetchers (Task 4)
export { pace } from "./fetch/types";
export type { OaPaper, PmPaper, RsBrief, SearchResult } from "./fetch/types";
export { oaUrl, rsFetchOpenAlex, oaSearch, rsOaBrief, oaConnected, retrFetchBatch, oaRetractions, apRefCheck } from "./fetch/openalex";
export type { ApRefs } from "./fetch/openalex";
export { rsPubmedAbstracts, rsFetchPubmed, pmSearch, pmSearchV2, pmidToDoi, pmFullPages } from "./fetch/pubmed";
export { rcWords, rcSim, rcCompare, rcCheckOne, rcCheckOneV2, rcFillPatch, citExtractDoi, citExtractPmid, crToEntry, crLookupDoi, crFirstByTitle, crLookupTitle, citLookup } from "./fetch/crossref";
export type { CrWork, RcCheck } from "./fetch/crossref";
// Stage 2: Citation Manager checks (Task 8a)
export { citMissingNumbers, citCaretEntry } from "./citlib";
// Stage 2: Citation Manager classic sources (Task 8b), generated from v1 by the golden harness
export { PSYCH_STARTERS } from "./data/classic-sources";
// Stage 2: Citation Manager one-click capture (Task 8b)
export { bookmarkletSource, bookmarkletHref, decodeCapture, captureConfirmText, captureRecord, captureIsDuplicate } from "./citcapture";
// Fix wave A, Task 8 (W1, W2): the capture and the search keep every author, the volume, the issue and the pages
export { bookmarkletSourceV2, bookmarkletHrefV2, capNameToCit, captureRecordV2, captureYearV2, captureMatch } from "./citcapture";
export { rsAuthorListToCit, rsEntryFromResultV2 } from "./research";
export type { CaptureData } from "./citcapture";
// Stage 2: Research related terms, sort orders and fold (Task 9)
export { rsParseTerms, rsSortResults, rsFoldIndex } from "./research";
// Stage 2: Reading shelf (Task 11)
export { appuStem, SH_STOP, shTokens, shCount, shSnippet, shSnippetParts, htmlMarksToParts, shRank, shBestSentence, shRankPages, shFindPassages, SH_MAX_PAGES, SH_MIN_CHARS, shPageText, shChars, shTitleGuess, shPaperId, shNoteId, shSummaryNoteId, shMarkedParts, shQuoteFind, shMineOk, shStripEmails, shSummaryText, SHELF_SUMMARY_MAX_CHARS, SHELF_SUMMARY_BUDGET_V2, SHELF_SUMMARY_TIER0_CAP_V2, shSummaryPick, buildShelfSummaryPrompt, buildShelfSummaryPromptV2, SHELF_DEFAULT_COLS, shColsOf, shColsAdd, shColsDel, shMatrixCsv, shBackupBundle, shBackupFileName, shRestoreParse } from "./shelf";
export type { SnippetPart, ShHit, ShSearchHit, ShPassage, ShTextItem, ShNote, ShRecord } from "./shelf";
// Fix wave A (W15, register row D-S2-28): a new shelf paper takes its title from its DOI or the library
export { SHELF_TITLE_TIMEOUT_MS, shPaperDoi, shTitleOnPage, resolveShelfTitle } from "./shelf-title";
// Stage 2: Analyse a paper, the page's rules and formats (Task 12)
export { apFileKind, apFileStem, apDocxText, apTitleOf, apLoadRefusal, apShelfLabel, apPreview, apNumP } from "./analyse-page";
// Stage 2: Analyse a paper, the walk-through's reply, the paper card and the cards side by side (Task 13)
export { apWalkRes, apCardText, AP_COLS, apAcrossCols, apAcrossColToggle, apAcrossCell, apAcrossRows, apAcrossData, apAcrossCsv } from "./analyse-cards";
export type { ApWalkRes, ApNoteLike, ApCardLabels, ApCardRefs, ApAcrossLabels, ApQuoteCheck } from "./analyse-cards";
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
export { runDesc, runTtest1, runTtestInd, runTtestPaired, runAnova1, runTukey, runRegression, runPearson } from "./stats-means";
export { runMannwhitney, runWilcoxon, runKruskal, runSpearman, runWelchAnova } from "./stats-ranks";
export { runChisq, runGof, runMcnemar, runCochran, runFriedman } from "./stats-counts";
export { runAnova2, runMregress } from "./stats-factorial";
export { runLogistic, runRmanova, runAlpha } from "./stats-models";
export { runModerate, runMediate, runMixed } from "./stats-advanced";
export {
  TG_Q, TG_RES, TG_IMP, TG_EXTRA, TG_DEMO, GEN_DESIGNS, STATS_TEST_OPTIONS, TG_CHECK_TEXT, TG_CHECK_FALLBACK, TG_WHY_TEXT, GEN_TEXT,
  tgNext, tgRes, tgWhyItems, tgExtra, tgSkew, tgQuant, tgOutliers, tgCheck, tgCheckNumbers, tgCheckCounts, tgCountsText, genVerdict,
} from "./guide";
export type {
  TgQuestionKey, TgAnswers, TgQuestion, TgResKey, TgResEntry, TgResult, TgNextOut, TgWhyItem, TgExtra, TgDemo, GenDesignKey, GenDesign,
  TgCheckSel, TgNumbersRow, TgNumbers, TgCounts, TgCheckOut, GenVerdict,
} from "./guide";
export { PW_INFO, POWER_FOOTER_NOTE, pwArt, pwNum, powerCompute, simulatorParse, simulatorCompute, simulatorHtml } from "./power";
export type { PowerTestKey, PowerMode, PowerInput, PowerResult, SimBin, SimLast, SimResult } from "./power";
export {
  VZ_COL, VZ_GRAY, VZ_I18N, vzPalette, vzEsc, vzQuant, vzTCrit, vzQNorm, vzNice, vzFmt, vzSummary, vzGroups, vzAxisDefaults, vzDefaults, vzCaption,
  vzFrame, vzSvgOpen, vzYAxis, vzXLabel, vzScaleY, vzJit, vzTableBlock, vzCatLabel, vzBox, vzBar, vzHist, vzQQ, vzChart,
} from "./charts";
export type { VzType, VzOptions, VzGroup, VzSummary, VzScale, VzFrame, VzChart, VzTr } from "./charts";
export { chartParseLines, vennNum, vennSvg } from "./quickchart";
export type { ChartRow, VennInput } from "./quickchart";
export { rtHash, rtSetRecord, rtRunRecord, rtFirstP, rtSig, rtFlip, rtScanTags } from "./rtlink";
export type { RtRun, RtSavedRun, RtSet, RtTag, RtStatus, RtWhy, RtScanItem, RtFirstP } from "./rtlink";
export {
  DESIGN_ITEMS, EC_DOCS, CTRI_FIELDS, PI_ITEMS, BUDGET_DEFAULTS, DESIGN_TOASTS, REG_WARN, regPathway, regDone, protoDone, protocolMarkdown, ecMinorsNote, checklistDone,
  ecDoneAfterToggle, ecDoneAfterSave, ethicsStatement, consentMarkdown, ctriMarkdown, piDone, piCvText, budgetRows, budgetTotal, budgetTotalText, budgetMarkdown, budgetDone,
  designDashboard,
} from "./design";
export type { DesignKey, RegState, ProtoFields, EcState, BudgetRow, DesignDashboard } from "./design";
export { AIU_MONTHS, aiuDate, aiuJoin, aiuInRange, aiuBuild } from "./aiustatement";
export type { AiuEntry, AiuTicks, AiuStyle, AiuInput, AiuBuilt } from "./aiustatement";
export { SCALES, SL_PENDING, slById, slVarNames, slText, slCodebookRows, slCodebookCsv, slScore, slBand, slGuessColumns, slScoreData } from "./scales";
export type { Scale, ScaleShape, ScaleCoding, ScaleBand, SlScore, SlScoreData } from "./scales";
export { QUAL_PALETTE, qualNextColor, qualDescendantIds, qualDeleteCascade, qualPassageText, qualBuildMarkdown } from "./qual";
export type { QualCode, QualPassage } from "./qual";
export {
  STY_FW, STY_VOCAB, STY_BANDS, STY_PASSAGES, STYLE_PROFILE_MAX, STYLE_MIN_WORDS, STYLE_LIVE_MIN_WORDS, STYLE_SAMPLES_MAX, styleWordCount, styleLiveWordCount, styleFeatures, styleAddSample, styleSamplesKeep,
  styleStats, styleOutliers, styleMeasured, styleCompose, styleKnownWords, styleVocabNote, styleLevelRule, styleLiveCompare, styleLivePassage, styleLiveNext, styleVocabOrder, styleVocabScore,
  styleProfileSave, styleVoiceOffNote, stylePrompt, styleSampleCorpus, buildStyleAnalyzePrompt, buildStyleFilesPrompt, buildStyleTryPrompt,
} from "./style";
export type { StyleFeatures, StyleSample, StyleLevel, StyleBandKey, StyleLiveRow, StyleLiveResult } from "./style";
