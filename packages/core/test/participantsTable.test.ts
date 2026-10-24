import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { statsParseText, type ParsedData } from "../src/intake";
import { pdScan } from "../src/pdscan";
import { pdCsv } from "../src/csv";
import { buildMatcher, codeOf, type MatchPerson } from "../src/participants";
import { listTableScan, listTransform, pdScanV2, type ColumnNames, type ColumnPlan } from "../src/participantsTable";

/**
 * Tables against the participant list (spec §8.1, calls C14 and C17) and the fix for F1. pdScanV2 is v1's pdScan except that a column of open answers is not "names"; listTableScan
 * says, per column, which cells are people on the list, which names are not on it, which rows belong to a person who withdrew, and which names sit inside answers; listTransform writes
 * the table back with the student's choices. v2's own code, so there is no golden: these tests are its specification. pdscan.ts itself is v1's and is never edited.
 */
const person = (id: string, name: string, spellings: string[] = [], over: Partial<MatchPerson> = {}): MatchPerson =>
  ({ id, code: codeOf(Number(id.slice(1))), name, spellings, everyday: [], ...over });
const table = (text: string): ParsedData => {
  const d = statsParseText(text);
  if (!d) throw new Error("test table did not parse");
  return d;
};
const PRIYA = person("p1", "Priya Sharma", ["Priya"]);
const RAHUL = person("p2", "Rahul Verma", ["Rahul"]);
const OPTS = { rolls: new Map<string, string>(), nameColumns: [] as number[], suggest: false, notNames: [] as string[] };
const plan = (index: number, over: Partial<ColumnPlan> = {}): ColumnPlan => ({ index, action: "keep", inText: "keep", dropRows: false, picks: [], ...over });
const column = (scan: ColumnNames[], index: number): ColumnNames => {
  const c = scan.find((s) => s.index === index);
  if (!c) throw new Error(`no scan entry for column ${index}`);
  return c;
};

describe("pdScanV2", () => {
  it("f1OpenAnswersAreNotNames", () => {
    const data = table(
      [
        "notes",
        "Priya said she liked it in the second week of the course honestly",
        "Rahul told me he found the group work helpful most of the time",
        "Meena felt the lectures were too fast for her at the start",
      ].join("\n"),
    );
    // v1, untouched: every answer is letters and spaces, so the column "looks like names".
    expect(pdScan(data).found).toEqual([{ index: 0, name: "notes", kind: "name", why: "values" }]);
    expect(pdScan(data).freeText).toEqual([]);
    // v2: a value of more than four words is not a name, so the column goes on to the long-text rule.
    expect(pdScanV2(data)).toEqual({ found: [], freeText: ["notes"] });
  });

  it("drops only the column that has a long value, keeps the other findings and the column order of freeText", () => {
    const data = table(
      [
        "comments,full name,remarks,email",
        "Priya said she liked it in the second week of the course honestly,Asha Verma,Rahul told me he found the group work helpful most of the time,a@x.com",
        "Rahul told me he found the group work helpful most of the time,Ravi Kumar,Meena felt the lectures were too fast for her at the start,b@x.com",
        "Meena felt the lectures were too fast for her at the start,Meena Rao,Priya said she liked it in the second week of the course honestly,c@x.com",
      ].join("\n"),
    );
    const v1 = pdScan(data);
    expect(v1.found.map((f) => [f.index, f.kind, f.why])).toEqual([[0, "name", "values"], [1, "name", "heading"], [2, "name", "values"], [3, "email", "values"]]);
    const v2 = pdScanV2(data);
    expect(v2.found.map((f) => [f.index, f.kind, f.why])).toEqual([[1, "name", "heading"], [3, "email", "values"]]);
    expect(v2.freeText).toEqual(["comments", "remarks"]);
  });

  it("a name column with values of up to four words stays a name column, and five words is the first that is not", () => {
    const four = table("who\nDr Asha Verma Rao\nRavi Kumar\nMeena Rao");
    expect(pdScanV2(four)).toEqual(pdScan(four));
    expect(pdScanV2(four).found).toEqual([{ index: 0, name: "who", kind: "name", why: "values" }]);
    const five = table("who\nDr Asha Verma Rao Singh\nRavi Kumar\nMeena Rao");
    expect(pdScan(five).found).toHaveLength(1);
    expect(pdScanV2(five).found).toEqual([]);
    // five short words are not long text either: it is simply not flagged
    expect(pdScanV2(five).freeText).toEqual([]);
  });

  it("a name found by its heading is kept however long its values", () => {
    const data = table("full name,score\nPriya said she liked it in the second week of the course honestly,1\nRahul told me he found it helpful,2");
    expect(pdScanV2(data)).toEqual(pdScan(data));
    expect(pdScanV2(data).found[0]).toMatchObject({ kind: "name", why: "heading" });
  });

  it("pdScanV2KeepsV1Elsewhere", () => {
    const corpus = JSON.parse(readFileSync(new URL("./golden/pdscan/corpus.json", import.meta.url), "utf8")) as Array<{ id: string; text: string }>;
    const words = (v: string) => (v.match(/\S+/g) ?? []).length;
    let same = 0;
    let changed = 0;
    for (const entry of corpus) {
      const data = statsParseText(entry.text);
      if (!data) continue;
      const v1 = pdScan(data);
      const v2 = pdScanV2(data);
      const open = new Set(v1.found.filter((f) => f.kind === "name" && f.why === "values" && data.rows.some((r) => words((r[f.index] ?? "").trim()) > 4)).map((f) => f.index));
      if (!open.size) {
        expect(v2, entry.id).toEqual(v1);
        same++;
        continue;
      }
      // A table v2 changes: v1's findings minus the columns it dropped, and every column v1 listed as free text is still listed, in v1's order, with the dropped ones among them.
      expect(v2.found, entry.id).toEqual(v1.found.filter((f) => !open.has(f.index)));
      let at = 0;
      for (const name of v1.freeText) {
        at = v2.freeText.indexOf(name, at);
        expect(at, `${entry.id}: ${name}`).toBeGreaterThanOrEqual(0);
        at++;
      }
      expect(v2.freeText.length, entry.id).toBeGreaterThanOrEqual(v1.freeText.length);
      changed++;
    }
    expect(same).toBeGreaterThanOrEqual(20);
    expect(changed).toBeGreaterThanOrEqual(1); // free-text-letters-only-read-as-names
  });
});

describe("listTableScan", () => {
  it("listedInAnyCaseAndSpacing", () => {
    const m = buildMatcher([PRIYA, RAHUL]);
    const data = table("student name\npriya  sharma\nRAHUL VERMA\nSunita Devi");
    const c = column(listTableScan(data, m, OPTS), 0);
    expect(c.listed).toEqual([{ row: 0, personId: "p1" }, { row: 1, personId: "p2" }]);
    expect(c.unlisted).toEqual(["Sunita Devi"]);
    expect(c.inText).toEqual([]);
    // the heading rule can say it is a name column too, with the same result
    expect(column(listTableScan(data, m, { ...OPTS, nameColumns: [0] }), 0)).toEqual(c);
  });

  it("a column is a name column by the caller's list or by its listed values, and only then are other values unlisted", () => {
    const m = buildMatcher([PRIYA]);
    const data = table("who,notes,other\nSunita Devi,Priya Sharma,Great course\nAnita Rao,Good,Fine");
    const none = listTableScan(data, m, OPTS);
    expect(none.find((c) => c.index === 0)).toBeUndefined(); // no list value, not named by the caller: nothing to say
    expect(column(none, 1)).toMatchObject({ listed: [{ row: 0, personId: "p1" }], unlisted: ["Good"] });
    expect(none.find((c) => c.index === 2)).toBeUndefined();
    const named = listTableScan(data, m, { ...OPTS, nameColumns: [0] });
    expect(column(named, 0).unlisted).toEqual(["Sunita Devi", "Anita Rao"]);
  });

  it("unlisted values are distinct by normal form, first seen, and empty cells are skipped", () => {
    const m = buildMatcher([PRIYA]);
    const data = table("name\nSunita Devi\n\nsunita  DEVI\nAnita Rao\nSunita Devi");
    // a blank line is dropped by the parser; a blank cell needs a second column
    const two = table("name,x\nSunita Devi,1\n,2\nsunita  DEVI,3\nAnita Rao,4\nSunita Devi,5");
    expect(column(listTableScan(data, m, { ...OPTS, nameColumns: [0] }), 0).unlisted).toEqual(["Sunita Devi", "Anita Rao"]);
    expect(column(listTableScan(two, m, { ...OPTS, nameColumns: [0] }), 0).unlisted).toEqual(["Sunita Devi", "Anita Rao"]);
  });

  it("withdrawnRowsByNameOrCode", () => {
    const imran = person("p4", "Imran Khan", ["Mohd. Imran"], { withdrawn: { on: "2026-10-15", data: "remove" } });
    const zara = person("p5", "Zara Ali", [], { withdrawn: { on: "2026-10-16", data: "keep" } });
    const m = buildMatcher([PRIYA, imran, zara]);
    const byName = column(listTableScan(table("student name,score\nPriya Sharma,1\nMohd. Imran,2\nZara Ali,3\nMeena Rao,4"), m, OPTS), 0);
    expect(byName.withdrawn).toEqual([{ row: 1, personId: "p4" }]); // Zara kept her data: never in withdrawn
    expect(byName.withdrawnAsk).toEqual([]);
    expect(byName.listed.map((l) => l.personId)).toEqual(["p1", "p4", "p5"]);
    const byCode = column(listTableScan(table("id,score\nP001,1\np004,2\nP004,3\nP005,4"), m, { ...OPTS, nameColumns: [0] }), 0);
    expect(byCode.withdrawn).toEqual([{ row: 1, personId: "p4" }, { row: 2, personId: "p4" }]);
    expect(byCode.withdrawnAsk).toEqual([]);
    // a code is already a code: it is neither a listed name nor a name that is not on the list
    expect(byCode.listed).toEqual([]);
    expect(byCode.unlisted).toEqual([]);
  });

  it("a shared spelling is asked about when some of the people who share it withdrew, and is a withdrawal only when all of them did", () => {
    const sharma = person("p1", "Priya Sharma", ["Priya"], { withdrawn: { on: "2026-10-14", data: "keep" } });
    const rao = person("p7", "Priya Rao", ["Priya"], { withdrawn: { on: "2026-10-15", data: "remove" } });
    const m = buildMatcher([sharma, rao]);
    const c = column(listTableScan(table("name,x\nPriya Rao,1\nPriya,2\nPriya Sharma,3"), m, OPTS), 0);
    // "Priya Rao" is only her: removed. "Priya" may be either: asked about, with both people, and not removed. "Priya Sharma" kept her data.
    expect(c.withdrawn).toEqual([{ row: 0, personId: "p7" }]);
    expect(c.withdrawnAsk).toEqual([{ row: 1, personIds: ["p1", "p7"] }]);
    // the cell is still listed with the first person by list order, as before
    expect(c.listed).toEqual([{ row: 0, personId: "p7" }, { row: 1, personId: "p1" }, { row: 2, personId: "p1" }]);
    // when every one who shares the spelling withdrew with remove, it is a withdrawal, with the first of them
    const both = buildMatcher([
      person("p1", "Priya Sharma", ["Priya"], { withdrawn: { on: "2026-10-14", data: "remove" } }),
      person("p7", "Priya Rao", ["Priya"], { withdrawn: { on: "2026-10-15", data: "remove" } }),
    ]);
    const all = column(listTableScan(table("name\nPriya\nPriya Rao"), both, { ...OPTS, nameColumns: [0] }), 0);
    expect(all.withdrawn).toEqual([{ row: 0, personId: "p1" }, { row: 1, personId: "p7" }]);
    expect(all.withdrawnAsk).toEqual([]);
    // a shared spelling where nobody withdrew, or where the withdrawals keep the data, says nothing
    const none = column(listTableScan(table("name\nPriya\nPriya Rao"), buildMatcher([sharma, person("p7", "Priya Rao", ["Priya"])]), { ...OPTS, nameColumns: [0] }), 0);
    expect(none.withdrawn).toEqual([]);
    expect(none.withdrawnAsk).toEqual([]);
  });

  it("namesInsideAnswers", () => {
    const m = buildMatcher([PRIYA, RAHUL]);
    const data = table("notes,score\nRahul and I studied together,5\nNobody here,7\n12,3");
    const scan = listTableScan(data, m, OPTS);
    const c = column(scan, 0);
    expect(c.inText).toHaveLength(1);
    expect(c.inText[0]?.row).toBe(0);
    expect(c.inText[0]?.finds).toEqual([{ start: 0, end: 5, text: "Rahul", personIds: ["p2"], kind: "sure" }]);
    expect(c.listed).toEqual([]);
    expect(c.unlisted).toEqual([]);
    expect(scan.find((s) => s.index === 1)).toBeUndefined();
  });

  it("a name column cell that holds exactly one listed person is that person's, not a new one, and still has its finds", () => {
    const m = buildMatcher([PRIYA, RAHUL]);
    const c = column(listTableScan(table("name\nPriya Sharma\nDr. Priya Sharma\nRahul S.\nSunita Devi"), m, OPTS), 0);
    expect(c.listed).toEqual([{ row: 0, personId: "p1" }, { row: 1, personId: "p1" }, { row: 2, personId: "p2" }]);
    expect(c.unlisted).toEqual(["Sunita Devi"]);
    expect(c.inText).toEqual([
      { row: 1, finds: [{ start: 4, end: 16, text: "Priya Sharma", personIds: ["p1"], kind: "sure" }] },
      { row: 2, finds: [{ start: 0, end: 5, text: "Rahul", personIds: ["p2"], kind: "sure" }] },
    ]);
  });

  it("a name column cell with sure finds of two people, or only an ask find, is not listed for anyone and stays unlisted", () => {
    const will = person("p6", "Will Thomas", ["Will"], { everyday: ["Will"] });
    const m = buildMatcher([PRIYA, RAHUL, will]);
    const c = column(listTableScan(table("name\nPriya Sharma\nPriya & Rahul\nWill K."), m, OPTS), 0);
    expect(c.listed).toEqual([{ row: 0, personId: "p1" }]);
    expect(c.unlisted).toEqual(["Priya & Rahul", "Will K."]);
    expect(c.inText.map((t) => [t.row, t.finds.map((f) => [f.text, f.kind])])).toEqual([[1, [["Priya", "sure"], ["Rahul", "sure"]]], [2, [["Will", "ask"]]]]);
  });

  it("a name column cell that holds a person who withdrew with remove is that person's withdrawn row", () => {
    const imran = person("p4", "Imran Khan", ["Mohd. Imran"], { withdrawn: { on: "2026-10-15", data: "remove" } });
    const m = buildMatcher([PRIYA, imran]);
    const c = column(listTableScan(table("name,x\nPriya Sharma,1\nMohd. Imran (pilot),2"), m, OPTS), 0);
    expect(c.listed).toEqual([{ row: 0, personId: "p1" }, { row: 1, personId: "p4" }]);
    expect(c.withdrawn).toEqual([{ row: 1, personId: "p4" }]);
    expect(c.unlisted).toEqual([]);
  });

  it("a comments column with one exact-name answer does not turn into new participants: long answers are never unlisted, nor listed for the names they hold", () => {
    const m = buildMatcher([PRIYA, RAHUL]);
    const long1 = "Rahul told me he found the group work helpful most of the time";
    const long2 = "Meena felt the lectures were too fast for her at the start";
    const scan = listTableScan(table(["comments", "Rahul Verma", long1, long2].join("\n")), m, OPTS);
    const c = column(scan, 0);
    expect(c.listed).toEqual([{ row: 0, personId: "p2" }]);
    expect(c.unlisted).toEqual([]);
    expect(c.inText).toEqual([{ row: 1, finds: [{ start: 0, end: 5, text: "Rahul", personIds: ["p2"], kind: "sure" }] }]);
    // four words is still a value of a name column, five is an answer
    expect(column(listTableScan(table("comments\nRahul Verma\nDr Asha Verma Rao\nDr Asha Verma Rao Singh"), m, OPTS), 0).unlisted).toEqual(["Dr Asha Verma Rao"]);
  });

  it("leftover (R49): a long cell that holds a person of the list is not a leftover; one that only holds a guess still is", () => {
    const m = buildMatcher([PRIYA, RAHUL]);
    const d = table("student name,x\nPriya Sharma,1\nPriya Sharma (absent on day two),2\nPriya Sharma & Rahul Verma,3\nMohammed Abdul Rahman Khan Siddiqui,4");
    const c = column(listTableScan(d, m, { ...OPTS, nameColumns: [0], suggest: true }), 0);
    expect(c.leftover).toEqual([{ row: 3, value: "Mohammed Abdul Rahman Khan Siddiqui" }]);
    expect(c.inText.map((t) => t.row)).toContain(1);
    expect(c.inText.map((t) => t.row)).toContain(2);
  });

  it("leftover (R49): a long cell that holds a person's code or roll number is not a leftover either", () => {
    const m = buildMatcher([PRIYA, RAHUL]);
    const d = table("student name,x\nPriya Sharma,1\nP001 (absent on day two),2\nP001 and P002 were absent on day two,3\nRoll 21CS014 was absent on day two,4\nP0011 was not on any list at all,5");
    const c = column(listTableScan(d, m, { ...OPTS, nameColumns: [0], rolls: new Map([["21cs014", "p1"]]) }), 0);
    expect(c.leftover).toEqual([{ row: 4, value: "P0011 was not on any list at all" }]);
  });

  it("leftover (R49): a name column's cells that are not on the list, not a name to add, not a code and not a placeholder are reported, and are never added as people", () => {
    const m = buildMatcher([PRIYA, RAHUL]);
    const d = table(
      [
        "student name,x",
        "Priya Sharma,1",
        "K. R. Narayanan Swamy Iyer,2",
        "Sunita Devi,3",
        "Mohammed Abdul Rahman Khan Siddiqui,4",
        "NA,5",
        "P002,6",
        "12,7",
        "Rahul,8",
        "K. R. Narayanan Swamy Iyer,9",
      ].join("\n"),
    );
    const c = column(listTableScan(d, m, { ...OPTS, nameColumns: [0] }), 0);
    expect(c.unlisted).toEqual(["Sunita Devi"]);
    expect(c.listed.map((l) => l.row)).toEqual([0, 7]);
    // Every cell (not every distinct value), with the row, as written.
    expect(c.leftover).toEqual([
      { row: 1, value: "K. R. Narayanan Swamy Iyer" },
      { row: 3, value: "Mohammed Abdul Rahman Khan Siddiqui" },
      { row: 8, value: "K. R. Narayanan Swamy Iyer" },
    ]);
    // A column that is no name column has none: its long answers are answers (nothing is said of it).
    expect(listTableScan(table("notes\nLiked it a lot in the second week of the course\nIt was fine"), m, OPTS)).toEqual([]);
  });

  it("leftover is empty when every value of the column is a name that is listed, to add, a code or a placeholder", () => {
    const m = buildMatcher([PRIYA]);
    const c = column(listTableScan(table("name,x\nPriya Sharma,1\nSunita Devi,2\nNA,3\nP001,4\n-,5"), m, { ...OPTS, nameColumns: [0] }), 0);
    expect(c.leftover).toEqual([]);
  });

  it("placeholders, numbers and values with no letter are never unlisted names", () => {
    const m = buildMatcher([PRIYA]);
    const c = column(listTableScan(table("name,x\nNA,1\n-,2\n12,3\nn/a,4\nNone,5\nNIL,6\n--,7\nSunita Devi,8"), m, { ...OPTS, nameColumns: [0] }), 0);
    expect(c.unlisted).toEqual(["Sunita Devi"]);
  });

  it("a placeholder-looking word that is also a listed spelling is the person; the placeholder rule is only for values that are not on the list", () => {
    const m = buildMatcher([person("p8", "Nil Banerjee", ["Nil"])]);
    const c = column(listTableScan(table("name,x\nNil,1\nNone,2"), m, { ...OPTS, nameColumns: [0] }), 0);
    expect(c.listed).toEqual([{ row: 0, personId: "p8" }]);
    expect(c.unlisted).toEqual([]);
  });

  it("suggestions come from first names only when asked for, are joined with the sure finds in text order, and honour notNames", () => {
    const m = buildMatcher([RAHUL]);
    const data = table("notes\nMeena and Rahul walked home");
    expect(column(listTableScan(data, m, OPTS), 0).inText[0]?.finds.map((f) => [f.text, f.kind])).toEqual([["Rahul", "sure"]]);
    const asked = column(listTableScan(data, m, { ...OPTS, suggest: true }), 0);
    expect(asked.inText[0]?.finds.map((f) => [f.text, f.kind, f.why])).toEqual([["Meena", "suggest", "first-name"], ["Rahul", "sure", undefined]]);
    const said = column(listTableScan(data, m, { ...OPTS, suggest: true, notNames: ["meena"] }), 0);
    expect(said.inText[0]?.finds.map((f) => f.text)).toEqual(["Rahul"]);
  });

  it("rollMatches", () => {
    const m = buildMatcher([PRIYA, person("p3", "Asha Rao")]);
    const rolls = new Map([["21cs014", "p3"]]);
    const scan = listTableScan(table("roll,score\n21CS014,5\n99X,3"), m, { ...OPTS, rolls });
    expect(column(scan, 0).roll).toEqual([{ row: 0, personId: "p3" }]);
    expect(column(scan, 0).unlisted).toEqual([]);
    expect(scan.find((s) => s.index === 1)).toBeUndefined();
  });

  it("an everyday, one-letter or shared spelling alone in a cell is a name only in a name column; elsewhere it is asked about as a find", () => {
    const will = person("p6", "Will Thomas", ["Will"], { everyday: ["Will"] });
    const m = buildMatcher([PRIYA, will]);
    const answers = table("answer,x\nWill,1\nGreat course,2\nThe teacher was good,3");
    const scan = listTableScan(answers, m, OPTS);
    const c = column(scan, 0);
    expect(c.listed).toEqual([]);
    expect(c.unlisted).toEqual([]); // one lone "Will" must not turn open answers into "names not on your list"
    expect(c.inText).toEqual([{ row: 0, finds: [{ start: 0, end: 4, text: "Will", personIds: ["p6"], kind: "ask", why: "everyday" }] }]);
    // told it is a name column, the same cell is the person
    expect(column(listTableScan(answers, m, { ...OPTS, nameColumns: [0] }), 0).listed).toEqual([{ row: 0, personId: "p6" }]);
    // and a sure name in the same column makes it a name column too
    const mixed = table("who\nPriya Sharma\nWill\nSunita Devi");
    expect(column(listTableScan(mixed, m, OPTS), 0)).toMatchObject({ listed: [{ row: 0, personId: "p1" }, { row: 1, personId: "p6" }], unlisted: ["Sunita Devi"] });
  });

  it("a shared spelling in a name column is listed with the first person by list order", () => {
    const m = buildMatcher([PRIYA, person("p7", "Priya Rao", ["Priya"])]);
    const c = column(listTableScan(table("name\nPriya Rao\nPriya"), m, { ...OPTS, nameColumns: [0] }), 0);
    expect(c.listed).toEqual([{ row: 0, personId: "p7" }, { row: 1, personId: "p1" }]);
  });
});

describe("listTransform", () => {
  const imran = person("p4", "Imran Khan", ["Mohd. Imran"], { withdrawn: { on: "2026-10-15", data: "remove" } });
  const m = buildMatcher([PRIYA, RAHUL, imran]);
  const data = table(
    ["student name,village,notes,score", "Priya Sharma,Rampur,Liked the course,7", "Sunita Devi,Kheda,Rahul and I studied together,8", "Mohd. Imran,Nagla,Left early,2"].join("\n"),
  );

  it("transformUsesListCodes", () => {
    const scan = listTableScan(data, m, OPTS);
    const asked: string[] = [];
    const out = listTransform(
      data,
      scan,
      [plan(0, { action: "codes", dropRows: true }), plan(1, { action: "remove" }), plan(2, { inText: "codes" })],
      m,
      (name) => {
        asked.push(name);
        return "P006";
      },
    );
    expect(out.headers).toEqual(["ParticipantCode", "notes", "score"]);
    expect(out.rows).toEqual([["P001", "Liked the course", "7"], ["P006", "P002 and I studied together", "8"]]);
    expect(out.added).toEqual(["Sunita Devi"]);
    expect(asked).toEqual(["Sunita Devi"]);
    expect(out.coded).toBe(1);
    expect(out.removed).toBe(1);
    expect(out.removedRows).toBe(1);
    expect(out.csv).toBe(pdCsv(out.headers, out.rows));
    expect(out.csv).toBe("ParticipantCode,notes,score\nP001,Liked the course,7\nP006,P002 and I studied together,8");
  });

  it("the same unlisted name is added once, even in two columns, and a coded column keeps its place and later ones are numbered", () => {
    const d = table("first,mid,last\nSunita Devi,5,sunita devi\nAnita Rao,6,Sunita Devi\nPriya Sharma,7,Anita  Rao");
    const scan = listTableScan(d, buildMatcher([PRIYA]), { ...OPTS, nameColumns: [0, 2] });
    let n = 5;
    const asked: string[] = [];
    const out = listTransform(d, scan, [plan(0, { action: "codes" }), plan(2, { action: "codes" })], buildMatcher([PRIYA]), (name) => {
      asked.push(name);
      return `P00${++n}`;
    });
    expect(out.headers).toEqual(["ParticipantCode", "mid", "ParticipantCode 2"]);
    expect(out.rows).toEqual([["P006", "5", "P006"], ["P007", "6", "P006"], ["P001", "7", "P007"]]);
    expect(asked).toEqual(["Sunita Devi", "Anita Rao"]);
    expect(out.added).toEqual(["Sunita Devi", "Anita Rao"]);
    expect(out.coded).toBe(2);
  });

  it("add gets the text the scan reported (first seen), not the raw cell of the first row kept", () => {
    const d = table("name,witness\nMohd. Imran,SUNITA  devi\nPriya Sharma,Sunita Devi");
    const scan = listTableScan(d, m, { ...OPTS, nameColumns: [1] });
    expect(column(scan, 1).unlisted).toEqual(["SUNITA  devi"]);
    const asked: string[] = [];
    const out = listTransform(d, scan, [plan(0, { action: "codes", dropRows: true }), plan(1, { action: "codes" })], m, (name) => {
      asked.push(name);
      return "P006";
    });
    expect(asked).toEqual(["SUNITA  devi"]);
    expect(out.added).toEqual(["SUNITA  devi"]);
    expect(out.rows).toEqual([["P001", "P006"]]);
  });

  it("a codes plan on a column with nothing to code is a no-op: header and values stay", () => {
    const d = table("name,score\nSunita Devi,1\nAnita Rao,2");
    const scan = listTableScan(d, buildMatcher([PRIYA]), OPTS); // not a name column, no listed value: no scan entry at all
    expect(scan).toEqual([]);
    const out = listTransform(d, scan, [plan(0, { action: "codes" })], buildMatcher([PRIYA]), () => "X");
    expect(out.headers).toEqual(["name", "score"]);
    expect(out.rows).toEqual([["Sunita Devi", "1"], ["Anita Rao", "2"]]);
    expect(out.coded).toBe(0);
    expect(out.added).toEqual([]);
    // remove needs no scan entry: it is the student's word
    expect(listTransform(d, scan, [plan(0, { action: "remove" })], buildMatcher([PRIYA]), () => "X").headers).toEqual(["score"]);
  });

  it("a coded column's header skips the names already in the table", () => {
    const d = table("ParticipantCode,name,participantcode 2,who\nP009,Priya Sharma,P010,Rahul Verma");
    const people = buildMatcher([PRIYA, RAHUL]);
    const scan = listTableScan(d, people, OPTS);
    const out = listTransform(d, scan, [plan(1, { action: "codes" }), plan(3, { action: "codes" })], people, () => "X");
    expect(out.headers).toEqual(["ParticipantCode", "ParticipantCode 3", "participantcode 2", "ParticipantCode 4"]);
    expect(out.rows).toEqual([["P009", "P001", "P010", "P002"]]);
    expect(out.coded).toBe(2);
    // and with one in the way, the first coded column is the second name
    const one = table("ParticipantCode,name\nP009,Priya Sharma");
    expect(listTransform(one, listTableScan(one, people, OPTS), [plan(1, { action: "codes" })], people, () => "X").headers).toEqual(["ParticipantCode", "ParticipantCode 2"]);
  });

  it("a name that is only in a row that is dropped is not added to the list", () => {
    const d = table("name,witness\nMohd. Imran,Sunita Devi\nPriya Sharma,Anita Rao");
    const scan = listTableScan(d, m, { ...OPTS, nameColumns: [1] });
    const out = listTransform(d, scan, [plan(0, { action: "codes", dropRows: true }), plan(1, { action: "codes" })], m, (name) => `<${name}>`);
    expect(out.rows).toEqual([["P001", "<Anita Rao>"]]);
    expect(out.added).toEqual(["Anita Rao"]);
  });

  it("keep leaves the column as it is; a column with no plan is untouched; roll values become the person's code", () => {
    const d = table("roll,name,score\n21CS014,Priya Sharma,5\n99X,Rahul Verma,6");
    const people = buildMatcher([PRIYA, RAHUL]);
    const scan = listTableScan(d, people, { ...OPTS, rolls: new Map([["21cs014", "p1"]]) });
    const kept = listTransform(d, scan, [plan(0, { action: "keep" })], people, () => "X");
    expect(kept.headers).toEqual(["roll", "name", "score"]);
    expect(kept.rows).toEqual([["21CS014", "Priya Sharma", "5"], ["99X", "Rahul Verma", "6"]]);
    expect(kept.coded).toBe(0);
    expect(kept.removed).toBe(0);
    expect(kept.removedRows).toBe(0);
    expect(kept.added).toEqual([]);
    const coded = listTransform(d, scan, [plan(0, { action: "codes" })], people, () => "X");
    expect(coded.headers).toEqual(["ParticipantCode", "name", "score"]);
    expect(coded.rows).toEqual([["P001", "Priya Sharma", "5"], ["99X", "Rahul Verma", "6"]]);
  });

  it("inText keep leaves sure finds as they are, and dropRows needs the plan: a withdrawn row stays when no column asks for it", () => {
    const scan = listTableScan(data, m, OPTS);
    const out = listTransform(data, scan, [plan(0, { action: "codes" }), plan(2)], m, () => "P009");
    expect(out.rows.map((r) => r[2])).toEqual(["Liked the course", "Rahul and I studied together", "Left early"]);
    expect(out.removedRows).toBe(0);
    expect(out.rows[2]?.[0]).toBe("P004"); // Imran's row stays and is coded
  });

  it("dropRows works from a column that is itself removed", () => {
    const scan = listTableScan(data, m, OPTS);
    const out = listTransform(data, scan, [plan(0, { action: "remove", dropRows: true })], m, () => "P009");
    expect(out.headers).toEqual(["village", "notes", "score"]);
    expect(out.rows).toHaveLength(2);
    expect(out.removed).toBe(1);
    expect(out.removedRows).toBe(1);
  });

  it("picksApply", () => {
    const asha = person("p3", "Asha Rao", ["Asha"], { everyday: ["Asha"] });
    const am = buildMatcher([asha]);
    const d = table("notes\nAsha helped and Asha left");
    const scan = listTableScan(d, am, OPTS);
    expect(column(scan, 0).inText[0]?.finds.map((f) => [f.text, f.kind, f.why])).toEqual([["Asha", "ask", "everyday"], ["Asha", "ask", "everyday"]]);
    const picked = listTransform(d, scan, [plan(0, { picks: [{ text: "asha", to: "P003" }] })], am, () => "X");
    expect(picked.rows).toEqual([["P003 helped and P003 left"]]);
    // no pick: left as it is, even with the sure finds going to codes
    const none = listTransform(d, scan, [plan(0, { inText: "codes" })], am, () => "X");
    expect(none.rows).toEqual([["Asha helped and Asha left"]]);
    // a pick may be the mask, and it is matched on the find's normal form
    const masked = listTransform(d, scan, [plan(0, { picks: [{ text: "ASHA ", to: "[name]" }] })], am, () => "X");
    expect(masked.rows).toEqual([["[name] helped and [name] left"]]);
  });

  it("picks answer suggestions inside answers too, alongside sure finds that go to codes", () => {
    const d = table("notes\nMeena said Rahul left");
    const people = buildMatcher([RAHUL]);
    const scan = listTableScan(d, people, { ...OPTS, suggest: true });
    const out = listTransform(d, scan, [plan(0, { inText: "codes", picks: [{ text: "meena", to: "[name]" }] })], people, () => "X");
    expect(out.rows).toEqual([["[name] said P002 left"]]);
    const unanswered = listTransform(d, scan, [plan(0, { inText: "codes" })], people, () => "X");
    expect(unanswered.rows).toEqual([["Meena said P002 left"]]);
  });

  it("leftover cells (R49) are emptied when the plan removes them, and stay when it keeps them or says nothing; they are never added as people", () => {
    const d = table("student name,score\nPriya Sharma,1\nK. R. Narayanan Swamy Iyer,2\nSunita Devi,3\nMohammed Abdul Rahman Khan Siddiqui,4");
    const scan = listTableScan(d, buildMatcher([PRIYA]), { ...OPTS, nameColumns: [0] });
    const asked: string[] = [];
    const add = (name: string) => { asked.push(name); return "P006"; };
    const removed = listTransform(d, scan, [plan(0, { action: "codes", leftover: "remove" })], buildMatcher([PRIYA]), add);
    expect(removed.headers).toEqual(["ParticipantCode", "score"]);
    expect(removed.rows).toEqual([["P001", "1"], ["", "2"], ["P006", "3"], ["", "4"]]);
    expect(asked).toEqual(["Sunita Devi"]);
    expect(removed.added).toEqual(["Sunita Devi"]);
    for (const over of [{ leftover: "keep" as const }, {}]) {
      const kept = listTransform(d, scan, [plan(0, { action: "codes", ...over })], buildMatcher([PRIYA]), () => "P006");
      expect(kept.rows).toEqual([["P001", "1"], ["K. R. Narayanan Swamy Iyer", "2"], ["P006", "3"], ["Mohammed Abdul Rahman Khan Siddiqui", "4"]]);
    }
    // A removed column has nothing left to empty.
    expect(listTransform(d, scan, [plan(0, { action: "remove", leftover: "remove" })], buildMatcher([PRIYA]), add).rows).toEqual([["1"], ["2"], ["3"], ["4"]]);
  });

  it("does not change its input", () => {
    const scan = listTableScan(data, m, OPTS);
    const before = JSON.stringify([data, scan]);
    listTransform(data, scan, [plan(0, { action: "codes", dropRows: true }), plan(1, { action: "remove" }), plan(2, { inText: "codes" })], m, () => "P006");
    expect(JSON.stringify([data, scan])).toBe(before);
  });
});
