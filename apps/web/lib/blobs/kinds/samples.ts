import { z } from "zod";

/*
 * Writing samples (wave D, v1 `appu_writing_samples`): per document, the words the student typed themselves (AI-inserted text left out), kept as
 * a derived copy for a future style trainer. Opt-in (Settings.writingSampleCapture). v1 shape: title, text, words, updated (ms). Objects are loose:
 * a field a later version adds is kept. Unguarded in lib/blobs/useProjectBlob (the copy is rebuilt from the documents), and not work in KIND_STAGE.
 */

const str = z.string();
const num = z.number();

/** By document id; one entry per document, overwritten on each capture. */
const WritingSamplesSchema = z.record(str, z.looseObject({ title: str, text: str, words: num, updated: num }));

export type WritingSamples = z.infer<typeof WritingSamplesSchema>;

/** The writing samples kind and what it holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type SamplesShapes = { writing_samples: WritingSamples };
export const SAMPLES_SCHEMAS: Record<keyof SamplesShapes, z.ZodType> = { writing_samples: WritingSamplesSchema };
