import { z } from "zod";

/*
 * Words and grammar (v1 `words`, session D). The dictionary cache stays in memory (Global Constraints), never here. Objects are loose: a field
 * a later version adds is kept.
 * R16 guard (lib/blobs/useProjectBlob UNGUARDED): words_bank is guarded (the panel asks before it sets over a blob that does not open);
 * words_prefs is not (a setting never asks).
 */

const str = z.string();

/** v1 appu_wordbank (bankAdd 6647-6654; v1 keeps 500, newest first): the word, its part of speech, the meaning (160 characters), the Hindi, the day. */
const WordsBankSchema = z.array(z.looseObject({ w: str, pos: str, m: str, h: str, d: str }));
/**
 * Two v1 keys in one (ruling R8): each grammar rule's count of findings by rule id (appu_gram_stats, 6749, 6789) and the spelling standard
 * (appu_spell, gramSpellStd/gramSpellSet 6692-6693: British "uk" by default, American "us", or "off").
 */
const WordsPrefsSchema = z.looseObject({ gram_stats: z.record(str, z.number()).optional(), spell: z.enum(["uk", "us", "off"]).optional() });

export type WordsBank = z.infer<typeof WordsBankSchema>;
export type WordsPrefs = z.infer<typeof WordsPrefsSchema>;

/** Words' kinds and what each holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type WordsShapes = { words_bank: WordsBank; words_prefs: WordsPrefs };
export const WORDS_SCHEMAS: Record<keyof WordsShapes, z.ZodType> = { words_bank: WordsBankSchema, words_prefs: WordsPrefsSchema };
