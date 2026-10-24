import { AP_COLS, AP_STAGES, apAcrossCsv, apAcrossData, apCardText, type ApAcrossLabels, type ApCardLabels, type ApCardRefs, type ApNoteLike } from "@appuscholar/core";
import { downloadBlob } from "@/lib/export/download";

type T = (key: string, vars?: Record<string, string | number>) => string;

/** A stage's name and its question in "Try first." (AP_STAGES' name and ask, keyed by Task 1). */
export const stageName = (t: T, k: string): string => t(`ap2_stage_${k}_name`);
export const stageAsk = (t: T, k: string): string => t(`ap2_stage_${k}_ask`);

/** AP_COLS' labels (9938), by key: the keys the extractor gave v1's words (Statistics, Results and Limitations are also stage names, the same words). */
export const AP_COL_KEYS: Record<string, string> = {
  design: "ap2_design", sample: "ap2_sample", measures: "ap2_measures", stats: "ap2_stage_stats_name", results: "ap2_stage_results_name", limits: "ap2_stage_limits_name",
  strengths: "ap2_strengths", weak: "ap2_weaknesses", verdict: "ap2_my_verdict"
};
export const colLabel = (t: T, k: string): string => t(AP_COL_KEYS[k]!);

/** The paper card's words (apCardText 10126-10133). */
export const cardLabels = (t: T): ApCardLabels => ({
  head: t("ap2_paper_card_head"), myWords: t("ap2_my_words_2"), notWritten: t("ap2_not_written"), reading: t("ap2_reading_3"), refHead: t("ap2_reference_list_check_head"),
  doisRead: t("ap2_dois_read"), known: t("ap2_known_to_openalex"), flagged: t("ap2_flagged_as_retracted"), none: t("ap2_none_flagged"), warning: t("ap2_a_warning_signal_only"),
  strengths: t("ap2_strengths_2"), weak: t("ap2_weaknesses_2"), verdict: t("ap2_my_verdict_in_one"), notes: t("ap2_my_notes"), closing: t("ap2_made_with_appuscholer_parts")
});
/** The table's words (apAcrossData 9961). */
export const acrossLabels = (t: T): ApAcrossLabels => ({
  paper: t("ap2_paper"), myWords: t("ap2_my_words"), aiReading: t("ap2_ai_reading_check_it"), names: Object.fromEntries(AP_COLS.map(([k]) => [k, colLabel(t, k)]))
});

/** v1's pdDownload (9507-9511): a byte-order mark, then the text, as text/csv (for the card's .txt too). */
const save = (name: string, text: string) => downloadBlob(name, new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));

/** apCardDownload (10136): core's apCardText with the stage names and words through t(), saved as paper-card.txt. */
export function downloadCard(t: T, o: { title: string; note: ApNoteLike | undefined; refs: ApCardRefs }): void {
  save("paper-card.txt", apCardText({ ...o, stages: AP_STAGES.map((s) => ({ k: s.k, name: stageName(t, s.k) })), L: cardLabels(t) }));
}
/** The notes that have not moved: an old note the paper-id migration moved to `p:<pid>` (it says so in `movedTo`) is the same paper as the note it moved to, and is listed once, there. */
const unmoved = (all: Record<string, ApNoteLike>): Record<string, ApNoteLike> =>
  Object.fromEntries(Object.entries(all).filter(([, n]) => (n as { movedTo?: unknown }).movedTo === undefined));
/** The table of the cards side by side (apAcrossData). */
export const acrossData = (t: T, all: Record<string, ApNoteLike>, cols: string[], ai: boolean) => apAcrossData(unmoved(all), cols, ai, acrossLabels(t));
/** apAcrossCsv (9977): the table as core's apAcrossCsv, saved as paper_cards.csv. */
export function downloadAcross(d: { head: string[]; body: string[][] }): void { save("paper_cards.csv", apAcrossCsv(d)); }
