import { describe, expect, it } from "vitest";
import { pdScan, statsParseText } from "@appuscholar/core";
import { codesFor, flaggedInText, maskLabels } from "../lib/tools/stats/explainGuard";

/* Task B2 fix round 2 (N1): what the Explain request check counts as a participant's detail, and how it masks. */

function lab(csv: string) {
  const data = statsParseText(csv)!;
  return { data, scan: pdScan(data) };
}

describe("which values of a flagged column are personal details in the request", () => {
  it("a numeric 'student id' column (1 to 12) raises nothing, and leaves the statistics alone", () => {
    const rows = Array.from({ length: 12 }, (_, i) => `${i + 1},${6 + (i % 4)}`);
    const { data, scan } = lab("student id,score\n" + rows.join("\n"));
    expect(scan.found.map((f) => f.name)).toEqual(["student id"]); // the lab does flag the column
    const text = "N M SD 12 6.00 1.29 t(10) = 2.50 df 12 3 7";
    expect(flaggedInText(data, scan, [text, "t(10) = 2.50, M = 6.00"])).toEqual([]);
  });

  it("values shorter than two characters are never details", () => {
    const { data, scan } = lab("name,score\nA,1\nA,2\nB,3\nB,4\nC,5\nC,6");
    expect(flaggedInText(data, scan, ["Group A B C"])).toEqual([]);
  });

  it("a name column still counts, whole words only", () => {
    const { data, scan } = lab("name,score\nPriya Nair,7\nPriya Nair,8\nAmit Rao,5\nAmit Rao,6\nSara Khan,9\nSara Khan,10");
    const found = flaggedInText(data, scan, ["Priya Nair 2 7.5 Amit Rao 2 5.5 Sara Khan 2 9.5 and Saraswati"]);
    expect(found.map((f) => f.value).sort()).toEqual(["Amit Rao", "Priya Nair", "Sara Khan"]);
  });
});

describe("masking", () => {
  it("one pass: a code is never searched again, so no code holds another (a value 'name' beside 'Bob')", () => {
    const found = [{ kind: "name" as const, value: "Bob Lee" }, { kind: "name" as const, value: "name" }, { kind: "name" as const, value: "Bob" }];
    const codes = codesFor(found);
    const out = maskLabels("name Bob Lee and Bob; the name column", found, codes);
    expect(out).toBe("[name 2] [name 1] and [name 3]; the [name 2] column");
    expect(out.match(/\[/g)!.length).toBe(out.match(/\]/g)!.length);
    expect(out).not.toMatch(/\[[^\]]*\[/); // no nested code
  });

  it("the same value is the same code everywhere, and text outside the values is untouched", () => {
    const found = [{ kind: "name" as const, value: "Priya Nair" }];
    expect(maskLabels("Priya Nair: M = 6.00. Priya Nair again.", found, codesFor(found))).toBe("[name 1]: M = 6.00. [name 1] again.");
  });
});
