import { STAT_TESTS, stkIsBinaryCol, type ParsedCol, type ParsedData, type StatsField, type StatsForm, type StatsTestKey } from "@appuscholar/core";
import type { FormState } from "./lab";

/**
 * The Run test form (v1 statsFieldsRender 11809-11833 and the optgroups of #statsTest, 1551-1597), as data. v1 filled the form from the page; core takes a StatsForm
 * (register row D-W2-5: what fills the form is the panel's), so the defaults are made here exactly as v1's did: a column field offers the columns of its type (a
 * "binary" field the yes/no columns, whatever their type), two fields of one type start on different columns, a tick list starts all ticked unless the field says
 * `unchecked`, an extra field starts empty.
 */

export type TestGroupId = "describe" | "means" | "nonpar" | "relations" | "scales";
/** The five optgroups of v1's #statsTest, in order (1553-1593); the keys in them are core's STATS_TEST_OPTIONS in v1's order. */
export const TEST_GROUPS: ReadonlyArray<{ id: TestGroupId; keys: readonly StatsTestKey[] }> = [
  { id: "describe", keys: ["desc"] },
  { id: "means", keys: ["ttest1", "ttestInd", "ttestPaired", "welchAnova", "anova1", "tukey", "anova2", "mregress", "logistic", "moderate", "mediate", "rmanova", "friedman", "mixed"] },
  { id: "nonpar", keys: ["mannwhitney", "wilcoxon", "kruskal"] },
  { id: "relations", keys: ["pearson", "spearman", "regression", "chisq", "gof", "mcnemar", "cochran"] },
  { id: "scales", keys: ["alpha"] }
];

/** The columns a field offers (v1 11811): those of its type, or for a yes/no field those with exactly two answers. */
export function fieldColumns(data: ParsedData, field: StatsField): ParsedCol[] {
  return data.cols.filter((c) => (field.type === "binary" ? stkIsBinaryCol(data, c.index) : c.type === field.type));
}

/** What v1's form held on first draw for this test and table. */
export function defaultForm(data: ParsedData, test: StatsTestKey): FormState {
  const cfg = STAT_TESTS[test];
  const values: Record<string, string> = {};
  const ticked: Record<string, number[]> = {};
  const used: Record<string, number> = {}; // when two fields share a type, each starts on a different column
  for (const f of cfg.fields) {
    const cols = fieldColumns(data, f);
    // v1 drew a box per column, so a list with no column to offer has no boxes at all (and no key here)
    if (f.multi) { if (cols.length) ticked[f.id] = f.unchecked ? [] : cols.map((c) => c.index); continue; }
    used[f.type] = used[f.type] ?? 0;
    const pick = used[f.type]! < cols.length ? used[f.type]! : 0;
    used[f.type]!++;
    values[f.id] = cols[pick] ? String(cols[pick]!.index) : "";
  }
  for (const e of cfg.extra ?? []) values[e.id] = "";
  return { test, data, values, ticked };
}

/** The form to draw: the one the student has been filling when it is for this table and test, else the defaults (nothing is stored until a field changes). */
export function currentForm(data: ParsedData, test: StatsTestKey, form: FormState | null): FormState {
  return form && form.data === data && form.test === test ? form : defaultForm(data, test);
}

/** What core's runStats reads. */
export function toStatsForm(f: FormState): StatsForm {
  return { values: { ...f.values }, ticked: Object.fromEntries(Object.entries(f.ticked).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])) };
}
