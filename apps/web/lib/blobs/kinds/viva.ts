import { z } from "zod";

/*
 * Viva practice (v1's viva dialog, session E). The student's answers are their own: the app keeps them and never reads or grades them, and
 * nothing here is ever inserted into a document (rule 4). Loose: a field a later version adds is kept.
 * R16 guard (lib/blobs/useProjectBlob UNGUARDED): viva_log is guarded, the panel asking before it sets over a blob that does not open.
 */

/** v1 appu_viva (vivaSave 3625-3635; v1 keeps the last 60): when (ms), who asked ("viva" or "conf", 1136), the question and the student's answer. */
const VivaLogSchema = z.array(z.looseObject({ t: z.number(), aud: z.enum(["viva", "conf"]), q: z.string(), a: z.string() }));

export type VivaLog = z.infer<typeof VivaLogSchema>;

/** The viva's kind and what it holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type VivaShapes = { viva_log: VivaLog };
export const VIVA_SCHEMAS: Record<keyof VivaShapes, z.ZodType> = { viva_log: VivaLogSchema };
