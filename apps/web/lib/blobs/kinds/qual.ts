import { z } from "zod";

/*
 * Qualitative coding (v1 `qual`, session B). The tagged passages live in the documents (`span.qual-tag[data-qcode]`), never here (v1 6181-6184).
 * Objects are loose: a field a later version adds is kept.
 * R16 guard (lib/blobs/useProjectBlob UNGUARDED): qual_codes is guarded (the panel asks before it sets over a blob that does not open);
 * qual_prefs is not (a toggle never asks).
 */

const str = z.string();

/** v1 appu_qual_codes (qualCodesGet/qualCodesSet 6187-6188, qualAddCode 6190-6196): the codes, flat, each with its parent's id (null at the top) and colour. */
const QualCodesSchema = z.array(z.looseObject({ id: str, name: str, parentId: str.nullable(), color: str }));
/** v1 appu_qual_showcolors (qualToggleColors 6264-6268; read at 13674, where no value means shown), as ruling R8 names it. */
const QualPrefsSchema = z.looseObject({ showcolors: z.boolean().optional() });

export type QualCodes = z.infer<typeof QualCodesSchema>;
export type QualPrefs = z.infer<typeof QualPrefsSchema>;

/** Coding's kinds and what each holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type QualShapes = { qual_codes: QualCodes; qual_prefs: QualPrefs };
export const QUAL_SCHEMAS: Record<keyof QualShapes, z.ZodType> = { qual_codes: QualCodesSchema, qual_prefs: QualPrefsSchema };
