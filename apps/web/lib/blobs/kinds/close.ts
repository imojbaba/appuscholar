import { z } from "zod";

/*
 * The closeness check (v1 `close`, session E). Its sources and results are never stored; only its two settings are. Loose: a field a later
 * version adds is kept.
 */

/**
 * Two v1 keys in one (ruling R8): the word group (appu_close_k: 5, 6 or 8, default 6; clK 6855) and the shortest passage shown (appu_close_min:
 * 8, 10 or 15, default 8; clMin 6856), both saved by clSet 6915-6918. Numbers here, as v1 reads them (parseInt); v1's check of the allowed values stays the tool's.
 */
const ClosePrefsSchema = z.looseObject({ k: z.number().optional(), min: z.number().optional() });

export type ClosePrefs = z.infer<typeof ClosePrefsSchema>;

/** Closeness's kind and what it holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type CloseShapes = { close_prefs: ClosePrefs };
export const CLOSE_SCHEMAS: Record<keyof CloseShapes, z.ZodType> = { close_prefs: ClosePrefsSchema };
