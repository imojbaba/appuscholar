import { z } from "zod";

/*
 * Participants (Collection and analysis → Participants, spec 2026-10-24-participants-design.md §6): the student's list of the people in the study,
 * with their names, so it is only ever stored sealed in the vault (the api refuses it in plaintext, apps/api/src/routes/blobWrite.ts; register row
 * D-S2-116, an exception to ruling R1 for this list alone). One blob, `participants`, one project's list. Objects are loose: a field a later version
 * adds is kept. `everyday` and `about` default to an empty list and object when a stored person lacks them.
 * R16 guard (lib/blobs/useProjectBlob UNGUARDED): the kind is guarded, its panel asking before it sets over a blob that does not open.
 */

const str = z.string();

/** One person on the list. `id` is random and stable and never shown; `code` is what the study's data carries (P001); `joined` is yyyy-mm-dd. */
export const ParticipantSchema = z.looseObject({
  id: str,
  code: str,
  name: str,
  /** Other spellings and short names, as typed. */
  spellings: z.array(str),
  /** The spellings marked "also an everyday word" (a subset of `spellings`, or the name). */
  everyday: z.array(str).default([]),
  joined: str,
  consentHow: z.enum(["written", "online", "verbal", "waived"]).optional(),
  /** Under 18, ticked: only when age is not recorded. */
  minor: z.boolean().optional(),
  /** The parent's or guardian's permission. */
  guardian: z.boolean().optional(),
  /** The child's own agreement. */
  assent: z.boolean().optional(),
  contact: str.optional(),
  roll: str.optional(),
  pseudonym: str.optional(),
  /** By field id, or by the label of a field the student added (design_ec's recordOther). */
  about: z.record(str, str).default({}),
  withdrawn: z.looseObject({ on: str, data: z.enum(["remove", "keep"]) }).optional()
});

/** The list. `next` is the next code's number and never goes down; `notNames` holds the normalised words answered "Not a name"; `highlight` absent means on; `destroyedAt` is when the list was destroyed. */
export const ParticipantListSchema = z.looseObject({
  v: z.literal(1),
  /** A whole number of at least 1: codes are made from it, so a fraction or 0 would make "P0.5" or a code that was never meant to be. */
  next: z.number().int().min(1),
  people: z.array(ParticipantSchema),
  notNames: z.array(str),
  highlight: z.boolean().optional(),
  destroyedAt: str.optional()
});

export type Participant = z.infer<typeof ParticipantSchema>;
export type ParticipantList = z.infer<typeof ParticipantListSchema>;

/** A list with nobody on it, starting at P001 (a fresh object each call). */
export const emptyList = (): ParticipantList => ({ v: 1, next: 1, people: [], notNames: [] });

/** Participants' kind and what it holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type ParticipantsShapes = { participants: ParticipantList };
export const PARTICIPANTS_SCHEMAS: Record<keyof ParticipantsShapes, z.ZodType> = { participants: ParticipantListSchema };
