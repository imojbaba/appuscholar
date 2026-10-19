import { z } from "zod";
import type { CitationEntry, RcCheck } from "@appuscholar/core";

/**
 * The stage panels' blob kinds, one blob per kind per project, as the api lists them (apps/api/src/routes/blobWrite.ts BLOB_KINDS and
 * SHELF_PAPER_KIND): keep the strings exactly as they are there.
 */
export const BLOB_KINDS = ["idea_intake", "citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "ap_cols", "rs_prefs", "shelf_cols"] as const;
export type FixedBlobKind = (typeof BLOB_KINDS)[number];
/** One shelf paper's extracted text: `shelf_paper:<id>`, the id 1 to 64 characters of [A-Za-z0-9_-]. */
export type ShelfPaperKind = `shelf_paper:${string}`;
export type BlobKind = FixedBlobKind | ShelfPaperKind;
const SHELF_PAPER_KIND = /^shelf_paper:[A-Za-z0-9_-]{1,64}$/;
/** The api's own test of a kind (a `shelf_paper:` kind with an id outside the pattern is refused there with 400). */
export const isBlobKind = (kind: string): kind is BlobKind => (BLOB_KINDS as readonly string[]).includes(kind) || SHELF_PAPER_KIND.test(kind);
export const shelfPaperKind = (id: string): ShelfPaperKind => `shelf_paper:${id}`;

/** The id the vault keys this blob's dek and its caches by: never the same string as a document id. */
export const blobId = (projectId: string, kind: BlobKind): string => `blob:${projectId}:${kind}`;

// Objects are loose (unknown keys are kept, never stripped): a field a later version of a panel adds survives a read by this one.
const str = z.string();
const num = z.number();

/** Idea & Feasibility intake: the four fields of the form. */
const IdeaIntakeSchema = z.looseObject({ topic: str, resources: str, timeframe: str, constraints: str });
/** One source as v1 stores it (core's CitationEntry: every known value a string, all optional). */
const CitationEntrySchema = z.looseObject({
  author: str.optional(), year: str.optional(), title: str.optional(), source: str.optional(), volume: str.optional(), issue: str.optional(),
  pages: str.optional(), doi: str.optional(), url: str.optional(), month: str.optional(), day: str.optional(), accessed: str.optional(),
  container: str.optional(), editors: str.optional(), number: str.optional(), degree: str.optional(), type: str.optional(), style: str.optional(), lang: str.optional()
});
const CitationLibrarySchema = z.array(CitationEntrySchema);
/** By normalised DOI: retracted or not (`r`), and when it was looked up (`t`, ms), as v1 7569 stores it: `c[d]={r:!!flag,t:Date.now()}`. */
const RetractionCacheSchema = z.record(str, z.looseObject({ r: z.boolean(), t: num }));
/**
 * By citKey (surname|year|lowercase title, v1 rcRun 7780): the Crossref check's result as core's rcCheckOne returns it and v1 stores it in appu_refcheck:
 * `s` ok/diff/nf/err, the differences `m`, what Crossref holds `f`, `viaTitle` when it came from a title search, and `t` (ms).
 */
const RcCheckSchema = z.looseObject({
  s: z.enum(["ok", "diff", "nf", "err"]),
  m: z.array(z.looseObject({ k: z.enum(["title", "year", "author"]), v: str })).optional(),
  f: z.looseObject({ title: str, year: z.union([num, str]), author: str, doi: str }).optional(),
  viaTitle: z.literal(true).optional(),
  t: num
});
const RefCheckCacheSchema = z.record(str, RcCheckSchema);
/** The Reading shelf's list of papers; each paper's text is its own `shelf_paper:<id>` blob. `added` is v1's ISO date string. */
const ShelfIndexSchema = z.array(z.looseObject({ id: str, title: str, file: str, size: num, added: str, total: num, kept: num }));
/** A highlight or note on a shelf paper (v1 11681: id, page, quote, note, at). */
const HighlightSchema = z.looseObject({ id: str, page: num, quote: str, note: str, at: str });
const ShelfPaperSchema = z.looseObject({ pages: z.array(str), notes: z.array(HighlightSchema), cells: z.record(str, str) });
/**
 * Analyse a paper's notes, by paper (document) id. A stage holds the student's own words (`mine`) and the AI's reading (`res`, the walk's
 * result object, not checked here); v1 creates both lazily, so each may be missing. The card's fields are the student's; loose here.
 */
const ApNoteSchema = z.looseObject({
  stages: z.record(str, z.looseObject({ mine: str.optional(), res: z.unknown().optional() })),
  card: z.record(str, z.unknown()),
  title: str.optional(),
  chars: num.optional()
});
const ApNotesSchema = z.record(str, ApNoteSchema);
/** The shelf matrix's column names. */
const ApColsSchema = z.array(str);
/** The Reading shelf matrix's column names (v1 appu_shelf_cols, 11697; ruling R14). An empty list means the default columns, as v1's shCols reads it. */
const ShelfColsSchema = z.array(str);
/** Research panel preferences: "Rank by fit to my question". */
const RsPrefsSchema = z.looseObject({ rank: z.boolean() });

export type IdeaIntake = z.infer<typeof IdeaIntakeSchema>;
export type CitationLibrary = CitationEntry[];
export type RetractionCache = z.infer<typeof RetractionCacheSchema>;
export type RefCheckCache = Record<string, RcCheck>;
export type ShelfIndex = z.infer<typeof ShelfIndexSchema>;
export type Highlight = z.infer<typeof HighlightSchema>;
export type ShelfPaper = z.infer<typeof ShelfPaperSchema>;
export type ApNotes = z.infer<typeof ApNotesSchema>;
export type ApCols = z.infer<typeof ApColsSchema>;
export type RsPrefs = z.infer<typeof RsPrefsSchema>;
export type ShelfCols = z.infer<typeof ShelfColsSchema>;

type FixedShapes = {
  idea_intake: IdeaIntake;
  citations: CitationLibrary;
  retraction_cache: RetractionCache;
  refcheck_cache: RefCheckCache;
  shelf_index: ShelfIndex;
  ap_notes: ApNotes;
  ap_cols: ApCols;
  rs_prefs: RsPrefs;
  shelf_cols: ShelfCols;
};
/** What a blob of kind K holds. */
export type BlobShape<K extends BlobKind> = K extends FixedBlobKind ? FixedShapes[K] : ShelfPaper;

const SCHEMAS: Record<FixedBlobKind, z.ZodType> = {
  idea_intake: IdeaIntakeSchema,
  citations: CitationLibrarySchema,
  retraction_cache: RetractionCacheSchema,
  refcheck_cache: RefCheckCacheSchema,
  shelf_index: ShelfIndexSchema,
  ap_notes: ApNotesSchema,
  ap_cols: ApColsSchema,
  rs_prefs: RsPrefsSchema,
  shelf_cols: ShelfColsSchema
};
const schemaOf = (kind: BlobKind): z.ZodType | null =>
  (BLOB_KINDS as readonly string[]).includes(kind) ? SCHEMAS[kind as FixedBlobKind] : SHELF_PAPER_KIND.test(kind) ? ShelfPaperSchema : null;

/** A blob's plaintext as its kind's value, or null when it is not JSON or not of that shape (the panel reports it as broken, never crashes). */
export function parseBlob<K extends BlobKind>(kind: K, json: string): BlobShape<K> | null {
  const schema = schemaOf(kind);
  if (!schema) return null;
  let data: unknown;
  try { data = JSON.parse(json); } catch { return null; }
  const r = schema.safeParse(data);
  return r.success ? (r.data as BlobShape<K>) : null;
}
