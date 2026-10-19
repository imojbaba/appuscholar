"use client";
import { useSyncExternalStore } from "react";
import { citKind, type CitationEntry, type CitationStyle } from "@appuscholar/core";

/**
 * The Citation Manager's form (v1 874-912) as data: the options of its selects, the type-specific `cit-only` groups, and the form itself, which
 * lives in memory for the tab's life as v1's panel does (v1 hides a panel without removing it, so what is typed survives a switch of tool; a reload
 * empties it). The values of the selects are stored in each entry exactly as v1 stores them, so they stay English whatever the interface language.
 */

/** v1 877: the eight styles, in v1's order, with v1's labels (literals of the page, no data-i18n key). */
export const CITE_STYLE_OPTIONS: ReadonlyArray<{ value: CitationStyle; label: string }> = [
  { value: "apa", label: "APA 7th" },
  { value: "apa6", label: "APA 6th" },
  { value: "mla", label: "MLA 9th" },
  { value: "chicago", label: "Chicago (author-date)" },
  { value: "harvard", label: "Harvard" },
  { value: "vancouver", label: "Vancouver" },
  { value: "ieee", label: "IEEE" },
  { value: "ama", label: "AMA 11th" }
];
/** v1 880: the source types; the value is stored, the label is the option's data-i18n key. */
export const CITE_TYPE_OPTIONS: ReadonlyArray<{ value: string; key: string }> = [
  { value: "Journal article", key: "cite_type_journal" },
  { value: "Book", key: "cite_type_book" },
  { value: "Website", key: "cite_type_website" },
  { value: "Book chapter", key: "cite_type_chapter" },
  { value: "Report", key: "cite_type_report" },
  { value: "Thesis", key: "cite_type_thesis" },
  { value: "Conference paper", key: "cite_type_conf" }
];
/** v1 883: the source languages (cite_sourcelang_en / _hi). */
export const CITE_LANG_OPTIONS: ReadonlyArray<{ value: string; key: string }> = [
  { value: "en", key: "cite_sourcelang_en" },
  { value: "hi", key: "cite_sourcelang_hi" }
];
/** v1 892: an empty first option, then the twelve months by number (literals of the page). */
export const CITE_MONTH_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "" },
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" }, { value: "4", label: "April" },
  { value: "5", label: "May" }, { value: "6", label: "June" }, { value: "7", label: "July" }, { value: "8", label: "August" },
  { value: "9", label: "September" }, { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" }
];
/** v1 899: the kinds of thesis (literals of the page); the first is stored as "". */
export const CITE_DEGREE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Doctoral dissertation" },
  { value: "Master's thesis", label: "Master's thesis" },
  { value: "Undergraduate thesis", label: "Undergraduate thesis" }
];
/** v1 896-899: each `cit-only` group's `data-for`, the kinds (citKind) it is shown for. */
export const CITE_ONLY = { container: "chapter conf", editors: "chapter", number: "report", degree: "thesis" } as const;
/** citTypeChanged 7806-7811: a group is shown when the chosen type's kind is in its `data-for`. */
export function citOnlyShown(type: string, dataFor: string): boolean { return dataFor.split(" ").indexOf(citKind(type)) >= 0; }

/**
 * The form's fields, by the entry key each one fills (citReadForm 7466-7473); the style is the panel's style select, held apart (useLibrary).
 * `quote` is #citQuoteText (914-916), part of the form though no entry holds it: citClearForm empties it (7475) and citInsertQuote reads it (7890).
 */
export type CiteForm = {
  author: string; year: string; title: string; source: string; volume: string; issue: string; pages: string; doi: string; url: string;
  month: string; day: string; accessed: string; container: string; editors: string; number: string; degree: string; type: string; lang: string;
  quote: string;
};
/** citReadForm's element ids (7467-7472), by the key each one fills: the form's inputs carry v1's ids. */
export const CITE_FIELD_IDS: Readonly<Record<keyof CiteForm, string>> = {
  author: "citAuthor", year: "citYear", title: "citTitle", source: "citSource", volume: "citVol", issue: "citIssue", pages: "citPages", doi: "citDOI", url: "citURL",
  month: "citMonth", day: "citDay", accessed: "citAccessed", container: "citContainer", editors: "citEditors", number: "citNumber", degree: "citDegree",
  type: "citType", lang: "citSourceLang", quote: "citQuoteText"
};
/** The form key an input fills, by its element id (undefined for any other element). */
export const citeFieldOf = (id: string): keyof CiteForm | undefined =>
  (Object.keys(CITE_FIELD_IDS) as Array<keyof CiteForm>).find((k) => CITE_FIELD_IDS[k] === id);
/** The form as the page opens: every field empty, the first type and the first language (v1's selects start on their first option). */
export const EMPTY_CITE_FORM: CiteForm = {
  author: "", year: "", title: "", source: "", volume: "", issue: "", pages: "", doi: "", url: "",
  month: "", day: "", accessed: "", container: "", editors: "", number: "", degree: "", type: "Journal article", lang: "en", quote: ""
};

/** citReadForm 7466-7473: every value trimmed, in v1's key order, the style of the style select, `lang` "en" when empty. */
export function readForm(f: CiteForm, style: CitationStyle): CitationEntry {
  const v = (x: string) => x.trim();
  return {
    author: v(f.author), year: v(f.year), title: v(f.title), source: v(f.source),
    volume: v(f.volume), issue: v(f.issue), pages: v(f.pages), doi: v(f.doi), url: v(f.url),
    month: v(f.month), day: v(f.day), accessed: v(f.accessed),
    container: v(f.container), editors: v(f.editors), number: v(f.number), degree: v(f.degree),
    type: v(f.type), style: style, lang: v(f.lang) || "en"
  };
}

/** citClearForm 7474-7479: every field emptied, the quote too, but the type (and the style), and the language set back to English. */
export function clearedForm(f: CiteForm): CiteForm { return { ...EMPTY_CITE_FORM, type: f.type }; }

/** What citLookup's fill writes (7948-7964). A select set to a value it has no option for reads back "", so a month outside 1-12 is dropped. */
const FILLED = ["title", "author", "year", "month", "day", "container", "source", "editors", "volume", "issue", "pages", "doi", "url", "type"] as const;
export function filledForm(f: CiteForm, entry: CitationEntry): CiteForm {
  const out: CiteForm = { ...f };
  for (const k of FILLED) if (entry[k] !== undefined) out[k] = entry[k];
  if (!CITE_MONTH_OPTIONS.some((o) => o.value === out.month)) out.month = "";
  return out;
}

let form: CiteForm = EMPTY_CITE_FORM;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const read = () => form;
/** Replaces the form (every mounted Citation Manager sees it). */
export function setCiteForm(next: CiteForm | ((prev: CiteForm) => CiteForm)): void {
  form = typeof next === "function" ? next(form) : next;
  for (const l of listeners) l();
}
/** The form as it stands now, for work that runs after a render (the paste timer). */
export function getCiteForm(): CiteForm { return form; }
/** The form, kept for the tab's life. */
export function useCiteForm(): CiteForm { return useSyncExternalStore(subscribe, read, read); }
/** Empties the form, as a reload does (for tests). */
export function resetCiteForm(): void { setCiteForm(EMPTY_CITE_FORM); }
