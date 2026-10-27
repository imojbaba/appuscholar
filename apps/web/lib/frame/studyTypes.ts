/** A study's type (start-a-study spec, OJ 2026-10-27), as the api stores it (projects.type), in the order the new-study form lists them. */
export const STUDY_TYPES = ["ug", "masters", "phd", "course", "article", "other"] as const;
export type StudyType = (typeof STUDY_TYPES)[number];
export const studyTypeKey = (type: StudyType) => "study_type_" + type;
export const isStudyType = (v: unknown): v is StudyType => typeof v === "string" && (STUDY_TYPES as readonly string[]).includes(v);
