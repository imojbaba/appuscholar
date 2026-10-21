import { STYLE_MIN_WORDS } from "@appuscholar/core";

/*
 * My style's limits, as v1 wrote them inline in styleAnalyzeFiles and readFileText (index.html:7021-7051, 6985-7013), named once here.
 * The core engine holds the others: the profile's 1,500 characters, the 60 words of the live check and the 100 samples a project keeps.
 */

/** "Learn from my files (up to 100)": the first 100 files chosen are read (v1 7022: `.slice(0,100)`). */
export const STYLE_MAX_FILES = 100;
/** A file over this is skipped, not read (v1 7033: `f.size>25*1024*1024`). A file of exactly this size is read. */
export const STYLE_MAX_FILE_BYTES = 25 * 1024 * 1024;
/** A PDF is read to this many pages (v1 6993: `Math.min(pdf.numPages,80)`). */
export const STYLE_MAX_PDF_PAGES = 80;
/** "Learn from my writing" needs this many words in the document (v1 6979), and so does a set of files (v1 7041). */
export const STYLE_DOC_MIN_WORDS = STYLE_MIN_WORDS;
