import { z } from "zod";

/*
 * Statistics and charts (v1 `stats`, session B). The data rows themselves are never stored (ruling R1): only the data sets' fingerprints, the
 * inserted results' run records and two preferences. Objects are loose: a field a later version adds is kept.
 * R16 guard (lib/blobs/useProjectBlob UNGUARDED): stats_sets and stats_runs are guarded (the panel asks before it sets over a blob that does
 * not open); stats_prefs is not (a toggle never asks).
 */

const str = z.string();
const num = z.number();

/**
 * v1 appu_statsets (rtRegister 9382-9388): by data set name, its fingerprint (rtHash 9372-9377), when it was registered (ms) and its row count,
 * so a result in the document can be told current or stale.
 */
const StatsSetsSchema = z.record(str, z.looseObject({ hash: str, ts: num, n: num }));
/**
 * v1 appu_statruns (statsInsert 12013-12021, rtRerunOne 12327): by run id (the `data-run` of the result's span in the document), the run as
 * rtCapture records it (12260-12270: test, label, data set name, its hash, the columns by field, the multi-column fields, the extra options),
 * with the sentence inserted and when (ms). v1 keeps the newest 300. An object by id, as v1 stores it, not a list.
 */
const StatsRunsSchema = z.record(str, z.looseObject({
  test: str, label: str, ds: str, hash: str, fields: z.record(str, str), multi: z.record(str, z.array(str)), extra: z.record(str, str), sentence: str, ts: num
}));
/** Two v1 keys in one (ruling R8): the data set name last typed (appu_statsname, 9379, 12005) and the practice gate (appu_gen_first, 12574-12576). */
const StatsPrefsSchema = z.looseObject({ statsname: str.optional(), gen_first: z.boolean().optional() });

export type StatsSets = z.infer<typeof StatsSetsSchema>;
export type StatsRuns = z.infer<typeof StatsRunsSchema>;
export type StatsPrefs = z.infer<typeof StatsPrefsSchema>;

/** Statistics' kinds and what each holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type StatsShapes = { stats_sets: StatsSets; stats_runs: StatsRuns; stats_prefs: StatsPrefs };
export const STATS_SCHEMAS: Record<keyof StatsShapes, z.ZodType> = { stats_sets: StatsSetsSchema, stats_runs: StatsRunsSchema, stats_prefs: StatsPrefsSchema };
