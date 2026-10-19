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
// Stage 2: network fetchers (Task 4)
export { pace } from "./fetch/types";
export type { OaPaper, PmPaper, RsBrief, SearchResult } from "./fetch/types";
export { oaUrl, rsFetchOpenAlex, oaSearch, rsOaBrief, oaConnected, retrFetchBatch, oaRetractions, apRefCheck } from "./fetch/openalex";
export type { ApRefs } from "./fetch/openalex";
export { rsPubmedAbstracts, rsFetchPubmed, pmSearch, pmidToDoi } from "./fetch/pubmed";
export { rcWords, rcSim, rcCompare, rcCheckOne, citExtractDoi, citExtractPmid, crToEntry, crLookupDoi, crFirstByTitle, crLookupTitle, citLookup } from "./fetch/crossref";
export type { CrWork, RcCheck } from "./fetch/crossref";
// Stage 2: Citation Manager checks (Task 8a)
export { citMissingNumbers, citCaretEntry } from "./citlib";
// Stage 2: Citation Manager classic sources (Task 8b), generated from v1 by the golden harness
export { PSYCH_STARTERS } from "./data/classic-sources";
// Stage 2: Citation Manager one-click capture (Task 8b)
export { bookmarkletSource, bookmarkletHref, decodeCapture, captureConfirmText, captureRecord, captureIsDuplicate } from "./citcapture";
export type { CaptureData } from "./citcapture";
// Stage 2: Research related terms, sort orders and fold (Task 9)
export { rsParseTerms, rsSortResults, rsFoldIndex } from "./research";
// Stage 2: Reading shelf (Task 11)
export { appuStem, SH_STOP, shTokens, shCount, shSnippet, shSnippetParts, htmlMarksToParts, shRank, shBestSentence, shRankPages, shFindPassages, SH_MAX_PAGES, SH_MIN_CHARS, shPageText, shChars, shTitleGuess, shPaperId, shNoteId, shSummaryNoteId, shMarkedParts, shQuoteFind, shMineOk, shStripEmails, shSummaryText, SHELF_SUMMARY_MAX_CHARS, buildShelfSummaryPrompt, SHELF_DEFAULT_COLS, shColsOf, shColsAdd, shColsDel, shMatrixCsv, shBackupBundle, shBackupFileName, shRestoreParse } from "./shelf";
export type { SnippetPart, ShHit, ShSearchHit, ShPassage, ShTextItem, ShNote, ShRecord } from "./shelf";
