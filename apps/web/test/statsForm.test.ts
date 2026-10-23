import { describe, expect, it } from "vitest";
import { STATS_TEST_OPTIONS, STAT_TESTS, statsParseText } from "@appuscholar/core";
import { currentForm, defaultForm, fieldColumns, TEST_GROUPS, toStatsForm } from "../lib/tools/stats/form";
import { casesOf, fixtureFiles } from "./support/statsGolden";

/*
 * Task B2: the Run test form (v1 statsFieldsRender 11809-11833). The expected forms are v1's own, read from core's golden fixtures (test/golden/stats/<test>.json,
 * captured by driving v1's form): for every case the form v1 held when Run was pressed.
 */

const all = fixtureFiles().flatMap(casesOf);

describe("the test chooser", () => {
  it("the five groups hold the 26 tests in core's v1 order", () => {
    expect(TEST_GROUPS.flatMap((g) => g.keys)).toEqual(Object.keys(STATS_TEST_OPTIONS));
    expect(Object.keys(STATS_TEST_OPTIONS)).toHaveLength(26);
    expect(Object.keys(STAT_TESTS)).toHaveLength(26);
  });
});

describe("the form's fields come from v1's rules", () => {
  it("covers the 26 fixture files and a few hundred cases", () => {
    expect(fixtureFiles()).toHaveLength(26);
    expect(all.length).toBeGreaterThan(250);
  });

  it("every case: v1's defaults, then the case's named columns, are the form v1 held", () => {
    let checked = 0;
    for (const c of all) {
      const data = statsParseText(c.csv)!;
      const f = defaultForm(data, c.test);
      for (const [id, given] of Object.entries(c.values ?? {})) {
        const field = STAT_TESTS[c.test].fields.find((x) => x.id === id);
        f.values[id] = field ? String(data.cols.find((x) => x.name === given)!.index) : given; // a select names a column, an extra field gives its text
      }
      for (const [id, names] of Object.entries(c.ticked ?? {})) f.ticked[id] = data.cols.filter((x) => names.includes(x.name)).map((x) => x.index);
      expect(toStatsForm(f), c.id).toEqual(c.form);
      checked++;
    }
    expect(checked).toBe(all.length);
  });

  it("a yes/no field offers the two-answer columns of either type", () => {
    const data = statsParseText("a,b,c\nyes,1,x\nno,0,y\nyes,1,z")!;
    const field = STAT_TESTS.mcnemar.fields.find((f) => f.type === "binary")!;
    expect(fieldColumns(data, field).map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("keeps the student's form for the same table and test, and starts over for another", () => {
    const data = statsParseText("g,s\nA,1\nB,2\nA,3\nB,4")!;
    const other = statsParseText("g,s\nA,1\nB,2")!;
    const mine = { ...defaultForm(data, "ttestInd"), values: { dv: "0", iv: "0" } };
    expect(currentForm(data, "ttestInd", mine)).toBe(mine);
    expect(currentForm(other, "ttestInd", mine)).not.toBe(mine);
    expect(currentForm(data, "anova1", mine).test).toBe("anova1");
  });

  it("sorts ticked columns into column order for core (the order changes the coefficient table)", () => {
    const data = statsParseText("y,a,b\n1,2,3\n2,3,5")!;
    const f = { ...defaultForm(data, "mregress"), ticked: { preds: [2, 1] } };
    expect(toStatsForm(f).ticked.preds).toEqual([1, 2]);
  });
});
