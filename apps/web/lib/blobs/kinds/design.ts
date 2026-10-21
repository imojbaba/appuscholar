import { z } from "zod";

/*
 * Design and ethics (v1 `design`, session A): one blob per v1 sub-tool key, `appu_design_<key>` for reg, proto, ec, ctri, pi and budget
 * (designGet/designSet 5873-5874), each the object v1 stores, with its `done` flag. Every field is optional, as v1's designGet answers {} for a
 * key never saved and each sub-tool writes its fields as the student fills them. Objects are loose: a field a later version adds is kept.
 */

const str = z.string();
const num = z.number();
/** A checklist's ticks by item index, as v1's toggles write it (`s.checklist[i]=v`, 6007, 6080, 6107): the indexes are JSON's string keys. */
const ChecklistSchema = z.record(str, z.boolean());

/** The ethics pathway (v1 regRender, regCompute 5898-5940): study type, population, biological samples, multi-site, and when it was checked (ms). */
const DesignRegSchema = z.looseObject({
  type: str.optional(), pop: str.optional(), bio: z.boolean().optional(), multi: z.boolean().optional(), done: z.boolean().optional(), savedAt: num.optional()
});
/** The protocol's eight texts (v1 protoLoad, protoRead, protoSave 5942-5957: bg, obj, design, part, sample, proc, risk, dmp), `done` when any is filled. */
const DesignProtoSchema = z.looseObject({
  bg: str.optional(), obj: str.optional(), design: str.optional(), part: str.optional(), sample: str.optional(), proc: str.optional(), risk: str.optional(),
  dmp: str.optional(), done: z.boolean().optional()
});
/**
 * The ethics committee package (v1 ecRender, ecToggle, ecSave 5979-6027): the documents checklist, the consent form's fields (title, pi, what,
 * risks, benefits, contact) and the approval record (status, committee, apprNo, apprDate, consentMode, minors).
 */
const DesignEcSchema = z.looseObject({
  checklist: ChecklistSchema.optional(), title: str.optional(), pi: str.optional(), what: str.optional(), risks: str.optional(), benefits: str.optional(),
  contact: str.optional(), status: str.optional(), committee: str.optional(), apprNo: str.optional(), apprDate: str.optional(), consentMode: str.optional(),
  minors: str.optional(), done: z.boolean().optional()
});
/** CTRI registration readiness (v1 ctriRender, ctriToggle 6072-6083): the fields checklist. */
const DesignCtriSchema = z.looseObject({ checklist: ChecklistSchema.optional(), done: z.boolean().optional() });
/** The investigator's readiness (v1 piRender, piToggle, piSave 6098-6116): the checklist and the CV text. */
const DesignPiSchema = z.looseObject({ checklist: ChecklistSchema.optional(), cv: str.optional(), done: z.boolean().optional() });
/** The budget (v1 budgetRows, budgetEdit 6130-6151): its rows, each a label and the amount as its input gives it (a string, "" when empty). */
const DesignBudgetSchema = z.looseObject({ rows: z.array(z.looseObject({ label: str, amount: str })).optional(), done: z.boolean().optional() });

export type DesignReg = z.infer<typeof DesignRegSchema>;
export type DesignProto = z.infer<typeof DesignProtoSchema>;
export type DesignEc = z.infer<typeof DesignEcSchema>;
export type DesignCtri = z.infer<typeof DesignCtriSchema>;
export type DesignPi = z.infer<typeof DesignPiSchema>;
export type DesignBudget = z.infer<typeof DesignBudgetSchema>;

/** Design and ethics' kinds and what each holds (lib/blobs/kinds.ts gathers every tool's into BLOB_KINDS and BlobShape). */
export type DesignShapes = { design_reg: DesignReg; design_proto: DesignProto; design_ec: DesignEc; design_ctri: DesignCtri; design_pi: DesignPi; design_budget: DesignBudget };
export const DESIGN_SCHEMAS: Record<keyof DesignShapes, z.ZodType> = {
  design_reg: DesignRegSchema, design_proto: DesignProtoSchema, design_ec: DesignEcSchema, design_ctri: DesignCtriSchema, design_pi: DesignPiSchema, design_budget: DesignBudgetSchema
};
