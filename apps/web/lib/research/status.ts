/*
 * The Research status line, composed as researchSearch builds #rsStatus (v1 index.html 8316-8329) and rsRank's disclosure (8319-8320).
 * The sentences are v1's: their fixed parts are rs2_* keys extracted from those lines (Task 1's extractor, ruling R10; the extractor trims a
 * part, so the spaces v1 puts around it are added back here), and the few parts the extractor cannot key (a lower-case word and the plural
 * endings: " paper", "s", " found", "es", the closing ")") are v1's literals, cited by line (ruling R15). The result is byte-equal to v1's
 * #rsStatus for the same inputs (apps/web/test/researchSearch.test.ts, against the fetch golden's recorded runs).
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/** What rsRank (8220-8234) counts: papers scored, words sent (the prompts split on white space), batches that could not be scored. */
export type RankCount = { scored: number; words: number; failed: number };

/** researchSearch 8318: the status while the AI ranks. */
export const rankingStatus = (t: T, n: number): string => t("rs2_papers_found_reading_titles", { mergedCount: n });

/** 8319: ' · ranked by fit to your question (S of N scored, about W words sent to your AI)' and, when a batch failed, '; F batch(es) could not be scored'. `toLocaleString()` with no locale, as v1. */
export function rankNote(t: T, rr: RankCount, n: number): string {
  return " " + t("rs2_ranked_by_fit_to", { scored: rr.scored, mergedCount: n }) + " " + rr.words.toLocaleString() + " " + t("rs2_words_sent_to_your")
    + (rr.failed ? t("rs2_batch", { failed: rr.failed }) + (rr.failed === 1 ? "" : "es") + " " + t("rs2_could_not_be_scored") : "");
}

/** 8320: ' · ranking failed (message), shown in the order returned'. */
export const rankFailedNote = (t: T, message: string): string => " " + t("rs2_ranking_failed") + message + t("rs2_shown_in_the_order");

/** The fetchers' "429" (register D-S2-6) is v1's oaHttpError sentence (8032); any other error is shown as the fetcher gives it. */
export const sourceDetail = (t: T, error: string): string => (error === "429" ? t("rs2_the_free_daily_openalex") : error);

/** 8307-8308, 8311: a source that failed, as "could not reach" lists it: `OpenAlex (the sentence)`. */
export const failedSource = (t: T, source: string, error: string): string => source + " (" + sourceDetail(t, error) + ")";

export type StatusParts = {
  /** The number of papers after the merge and the de-duplication. */
  count: number;
  /** How many related terms the search added (rsPickedTerms). */
  termsCount: number;
  fellBack: boolean;
  design: string;
  /** The kind of study's option label, as the select shows it (8325 cuts it at " ("). */
  designLabel: string;
  /** rankNote / rankFailedNote, or "". */
  rankNote: string;
  /** failedSource for each source that could not be reached, in job order. */
  failed: string[];
};

/** researchSearch 8325-8329: the final status sentence. */
export function statusLine(t: T, s: StatusParts): string {
  const how = (s.termsCount && !s.fellBack ? " " + t("rs2_searched_your_words_plus", { termsCount: s.termsCount }) + (s.termsCount === 1 ? "" : "s") + ")" : "")
    + (s.fellBack ? " " + t("rs2_the_related_terms_made") : "")
    + (s.design !== "any" ? " " + t("rs2_kind_of_study_3") + " " + s.designLabel.replace(/ \(.*$/, "") : "");
  const reach = s.failed.length ? " " + t("rs2_could_not_reach") + " " + s.failed.join("; ") : "";
  return s.count
    ? s.count + " paper" + (s.count === 1 ? "" : "s") + " found" + how + s.rankNote + reach
    : t("rs2_no_papers_found") + how + (s.failed.length ? reach : t("rs2_try_a_broader_search"));
}
