import { z } from "zod";

/*
 * My writing style (v1 `style`, session D): the profile, the samples' features (never their text, v1 6368-6374) and the declaration and checks.
 * Objects are loose: a field a later version adds is kept.
 * R16 guard (lib/blobs/useProjectBlob UNGUARDED): all three kinds are guarded, the panel asking before it sets over a blob that does not open.
 */

const str = z.string();
const num = z.number();

/** Two v1 keys in one (ruling R8): the profile text (appu_style_profile, cut at 1,500 characters, styleSave 6367) and "Use my style" (appu_style_on, 6363-6365). */
const StyleProfileSchema = z.looseObject({ profile: str, on: z.boolean() });
/**
 * v1 appu_style_samples (styleAddSample 6426-6432, styleFeatures 6399-6415; v1 keeps 100): each sample's id, name and day, then its features
 * only: words, sentences, sentence length mean and spread, word length, lexical spread, function-word shares, punctuation rates and long words.
 */
const StyleSamplesSchema = z.array(z.looseObject({
  id: str, name: str, date: str, n: num, sc: num, sm: num, ssd: num, wl: num, ls: num, fw: z.array(num), pu: z.array(num), vw: z.array(str)
}));
/**
 * v1 appu_style_meta (styleMeta/styleMetaSet 6418-6419): the declaration's day (styleDeclToggle 6421-6425), the live check's passage and result
 * (6497-6507), the "does this sound like you" answer (6547); plus appu_style_vocab_level (styleVocabScore 6527-6531) as `vocab_level` (ruling R8).
 */
const StyleMetaSchema = z.looseObject({
  decl: str.optional(),
  livePassage: num.optional(),
  live: z.looseObject({ date: str, matched: num, total: num }).optional(),
  fb: z.enum(["ok", "off"]).optional(),
  vocab_level: z.looseObject({ score: num, k: z.enum(["basic", "general", "advanced", "high"]), date: str }).optional()
});

export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type StyleSamples = z.infer<typeof StyleSamplesSchema>;
export type StyleMeta = z.infer<typeof StyleMetaSchema>;

/** My style's kinds and what each holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type StyleShapes = { style_profile: StyleProfile; style_samples: StyleSamples; style_meta: StyleMeta };
export const STYLE_SCHEMAS: Record<keyof StyleShapes, z.ZodType> = { style_profile: StyleProfileSchema, style_samples: StyleSamplesSchema, style_meta: StyleMetaSchema };
