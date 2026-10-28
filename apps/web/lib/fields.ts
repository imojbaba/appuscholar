/** v1 FIELD_LIST (index.html:2499). A field's stored value stays v1's English (the AI reads it); only its label is translated, as settings_field_<value with _ for spaces>. */
export const FIELD_LIST = ["psychology", "education", "sociology", "medicine and health", "nursing", "management and commerce", "law", "economics", "science", "engineering and technology", "humanities"];
/** The select's value for "Other…", which opens the free-text box. */
export const OTHER_FIELD = "__other";
export const fieldKey = (f: string) => "settings_field_" + f.replace(/ /g, "_");
/** The field the student keeps: v1's default, psychology, when none is set. */
export const currentField = (field: string | undefined): string => (field ?? "psychology").trim() || "psychology";
/** A typed field, as it is stored: letters, digits, spaces and a little punctuation, at most 60 characters. */
export const cleanField = (v: string): string => v.replace(/[^\p{L}\p{N} ,&'-]/gu, "").trim().slice(0, 60);
