import { z } from "zod";
import type { CitationEntry, RcCheck } from "@appuscholar/core";
import { CLOSE_SCHEMAS, type CloseShapes } from "./kinds/close";
import { DESIGN_SCHEMAS, type DesignShapes } from "./kinds/design";
import { QUAL_SCHEMAS, type QualShapes } from "./kinds/qual";
import { STATS_SCHEMAS, type StatsShapes } from "./kinds/stats";
import { STYLE_SCHEMAS, type StyleShapes } from "./kinds/style";
import { VIVA_SCHEMAS, type VivaShapes } from "./kinds/viva";
import { WORDS_SCHEMAS, type WordsShapes } from "./kinds/words";

/**
 * The stage panels' blob kinds, one blob per kind per project, as the api lists them (apps/api/src/routes/blobWrite.ts BLOB_KINDS and
 * SHELF_PAPER_KIND): keep the strings exactly as they are there. The stage 3 to 6 tools' kinds (Task G3, ruling R8) come after the stage 2
 * ones, one per v1 key group, each tool's shapes in its own `kinds/<tool>.ts`; every kind has its stage in KIND_STAGE (lib/frame/stages.ts).
 */
export const BLOB_KINDS = [
  "idea_intake", "citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "ap_cols", "rs_prefs", "shelf_cols",
  "design_reg", "design_proto", "design_ec", "design_ctri", "design_pi", "design_budget", "stats_sets", "stats_runs", "stats_prefs", "qual_codes", "qual_prefs",
  "style_profile", "style_samples", "style_meta", "words_bank", "words_prefs", "close_prefs", "viva_log"
] as const;
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

/** Idea & Feasibility intake: the four fields of the form, and (wave B, Task 9) the AI read of them as it came, with when it was made (ISO). Optional, so an intake stored before it still parses. */
const IdeaIntakeSchema = z.looseObject({ topic: str, resources: str, timeframe: str, constraints: str, read: z.looseObject({ text: str, at: str }).optional() });
/**
 * One source as v1 stores it (core's CitationEntry: every known value a string, all optional), and, from wave B (Task 17), the fields a kept paper carries:
 * `pid` (its one stable id, lib/papers/ids), `rl` (on the reading list), `abstract` (up to 4,000 characters), `oa` (the open-access link) and `ack` (the attention
 * items the student has dismissed). All optional, so an entry stored before them (or by an older tab) still parses.
 */
const CitationEntrySchema = z.looseObject({
  author: str.optional(), year: str.optional(), title: str.optional(), source: str.optional(), volume: str.optional(), issue: str.optional(),
  pages: str.optional(), doi: str.optional(), url: str.optional(), month: str.optional(), day: str.optional(), accessed: str.optional(),
  container: str.optional(), editors: str.optional(), number: str.optional(), degree: str.optional(), type: str.optional(), style: str.optional(), lang: str.optional(),
  pid: str.optional(), rl: z.boolean().optional(), abstract: str.optional(), oa: str.optional(), ack: z.array(str).optional()
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
  f: z.looseObject({ title: str, year: z.union([num, str]), author: str, doi: str, authors: str.optional(), volume: str.optional(), issue: str.optional(), pages: str.optional() }).optional(),
  viaTitle: z.literal(true).optional(),
  /** Fix wave A (W27, W28; register D-S2-33): the fields the source leaves empty that Crossref has. Optional keys, so build 6c38396's loose schema still reads what is written here. */
  miss: z.array(z.enum(["author", "volume", "issue", "pages"])).optional(),
  t: num
});
const RefCheckCacheSchema = z.record(str, RcCheckSchema);
/** The Reading shelf's list of papers; each paper's text is its own `shelf_paper:<id>` blob. `added` is v1's ISO date string. */
/**
 * Fix wave A (W15, register row D-S2-28): `doi` is the DOI printed on a new paper's first page, kept optional so an entry stored before it (or by build 6c38396) still parses.
 * Wave B (Task 17): `pid` is the kept paper's stable id, the one its library entry and its notes carry (lib/papers/ids); optional, so an entry stored before it still parses.
 */
const ShelfIndexSchema = z.array(z.looseObject({ id: str, title: str, file: str, size: num, added: str, total: num, kept: num, doi: str.optional(), pid: str.optional() }));
/** A highlight or note on a shelf paper (v1 11681: id, page, quote, note, at). */
const HighlightSchema = z.looseObject({ id: str, page: num, quote: str, note: str, at: str });
const ShelfPaperSchema = z.looseObject({ pages: z.array(str), notes: z.array(HighlightSchema), cells: z.record(str, str) });
/** A quotation of a walk-through reply as apCheckQuote checked it (v1 10010-10017): the text, found or not, and why not or where. */
const ApQuoteSchema = z.looseObject({ q: str, ok: z.boolean(), why: str.optional(), page: num.optional(), sec: str.optional(), label: str.optional() });
/**
 * One stage's reply as apWalkShow keeps it (v1 10057-10059, core's ApWalkRes): apPick's numbers, then the raw text (a reply that was not JSON) or the reading, the checked quotations,
 * what the paper does not report, what to judge, and the check question with its answer. Every field optional, as a stored note may come from an older v1.
 */
const ApWalkResSchema = z.looseObject({
  partial: z.boolean().optional(), n: num.optional(), of: num.optional(), raw: str.optional(), reading: str.optional(), quotes: z.array(ApQuoteSchema).optional(),
  not_stated: z.array(str).optional(), watch: str.optional(), cq: str.optional(), ca: str.optional()
});
/**
 * Analyse a paper's notes, by v1's docId ('a' + the squashed title cut at 24 + the characters read, apBuild 9880), as v1's apNotePut (9895) writes appu_ap_notes: per stage key (AP_STAGES' k)
 * the student's own words (`mine`, apDraft 10118) and the reply (`res`, apWalkShow 10061), each written lazily so either may be missing; the card's fields (apCardField 10121: strengths,
 * weak, verdict, notes; the lesson adds verdict and reflection, 11190-11191); the paper's title. `chars` is never written by v1 (kept optional).
 * Wave B (Task 17): a note kept under `p:<pid>` (one per paper) also carries `pid`, the student's `take` and the AI `summary` (Task 28), the kept `checks` of Check numbers
 * (Task 30), the Compare table's `cells` (copied from the shelf paper's matrix once), and, on an old `a...` note that was merged into it, `movedTo`. All optional; `stages`
 * and `card` stay required, so a note the migration writes always carries them (empty when it has nothing).
 */
const ApNoteSchema = z.looseObject({
  stages: z.record(str, z.looseObject({ mine: str.optional(), res: ApWalkResSchema.optional() })),
  card: z.looseObject({ strengths: str.optional(), weak: str.optional(), verdict: str.optional(), notes: str.optional(), reflection: str.optional() }),
  title: str.optional(),
  chars: num.optional(),
  pid: str.optional(),
  take: str.optional(),
  summary: z.looseObject({ text: str, at: str, partial: z.boolean() }).optional(),
  checks: z.looseObject({
    numbers: z.looseObject({ bad: num, total: num, at: str }).optional(),
    refs: z.looseObject({ flagged: num, total: num, at: str }).optional()
  }).optional(),
  cells: z.record(str, str).optional(),
  movedTo: str.optional()
});
const ApNotesSchema = z.record(str, ApNoteSchema);
/** Compare's walk-through and paper-card columns (v1's "📊 My paper cards side by side", appu_ap_cols, 9939-9941, which Compare replaced in Task 22): AP_COLS keys in AP_COLS order, and Compare's own `notes` key (ruling B2-R25); a list only (ruling R28). */
const ApColsSchema = z.array(str);
/** Compare's matrix column names (v1's Reading shelf matrix, appu_shelf_cols, 11697; ruling R14). An empty list means the default columns, as v1's shCols reads it. */
const ShelfColsSchema = z.array(str);
/** Research panel preferences: "Rank by fit to my question". */
const RsPrefsSchema = z.looseObject({ rank: z.boolean() });

export type IdeaIntake = z.infer<typeof IdeaIntakeSchema>;
/** A library entry as this build stores it (ruling B2-R3): core's CitationEntry, a port type that is never edited, plus the fields of CitationEntrySchema above. */
export type StoredEntry = CitationEntry & { pid?: string; rl?: boolean; abstract?: string; oa?: string; ack?: string[] };
export type CitationLibrary = StoredEntry[];
export type RetractionCache = z.infer<typeof RetractionCacheSchema>;
export type RefCheckCache = Record<string, RcCheck>;
export type ShelfIndex = z.infer<typeof ShelfIndexSchema>;
export type Highlight = z.infer<typeof HighlightSchema>;
export type ShelfPaper = z.infer<typeof ShelfPaperSchema>;
export type ApNotes = z.infer<typeof ApNotesSchema>;
export type ApNote = z.infer<typeof ApNoteSchema>;
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
} & DesignShapes & StatsShapes & QualShapes & StyleShapes & WordsShapes & CloseShapes & VivaShapes;
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
  shelf_cols: ShelfColsSchema,
  ...DESIGN_SCHEMAS, ...STATS_SCHEMAS, ...QUAL_SCHEMAS, ...STYLE_SCHEMAS, ...WORDS_SCHEMAS, ...CLOSE_SCHEMAS, ...VIVA_SCHEMAS
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
