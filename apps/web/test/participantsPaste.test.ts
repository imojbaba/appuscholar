import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addPeople, listCsv } from "../lib/tools/participants/list";
import { emptyList } from "../lib/blobs/kinds/participants";
import { parsePaste, pasteSummary } from "../lib/tools/participants/paste";
import { DICTS, tFormat } from "../lib/i18n";

/*
 * Task 6: Paste a list reads text into people for addPeople (spec 2026-10-24-participants-design.md §5 "Paste a list" and call C16). One person per line; the text after the first comma
 * is other spellings; a key file (the first cell of its first line is ParticipantCode) or a line that starts with a code like P001 keeps its codes.
 */

describe("parsePaste: names", () => {
  it("one person per line; the name is the first cell and the text after the first comma is other spellings, comma-separated", () => {
    expect(parsePaste("Priya Sharma, Priya, प्रिया\nRahul Verma\nAsha Kumari,Asha")).toEqual([
      { name: "Priya Sharma", spellings: ["Priya", "प्रिया"] },
      { name: "Rahul Verma", spellings: [] },
      { name: "Asha Kumari", spellings: ["Asha"] }
    ]);
  });

  it("skips blank lines and lines of spaces, reads CRLF and a leading byte-order mark, trims every cell", () => {
    expect(parsePaste("﻿  Priya Sharma ,  Priya  \r\n\r\n   \r\nRahul Verma\r\n")).toEqual([
      { name: "Priya Sharma", spellings: ["Priya"] },
      { name: "Rahul Verma", spellings: [] }
    ]);
  });

  it("drops empty cells after the name (a trailing comma, two commas in a row)", () => {
    expect(parsePaste("Priya Sharma,\nRahul Verma,,Rahul,")).toEqual([
      { name: "Priya Sharma", spellings: [] },
      { name: "Rahul Verma", spellings: ["Rahul"] }
    ]);
  });

  it("removes the quotes around a cell, and a comma inside quotes stays in the cell", () => {
    expect(parsePaste('"Priya Sharma","Priya"\n"Sharma, Rahul",Rahul\n"Say ""Raj""",Raj')).toEqual([
      { name: "Priya Sharma", spellings: ["Priya"] },
      { name: "Sharma, Rahul", spellings: ["Rahul"] },
      { name: 'Say "Raj"', spellings: ["Raj"] }
    ]);
  });

  it("reads tab-separated lines the same way (a list pasted from a spreadsheet)", () => {
    expect(parsePaste("Priya Sharma\tPriya\tप्रिया\nRahul Verma")).toEqual([
      { name: "Priya Sharma", spellings: ["Priya", "प्रिया"] },
      { name: "Rahul Verma", spellings: [] }
    ]);
  });

  it("a line with no name in it is not a person", () => {
    expect(parsePaste(",Priya\n\"\"\n  \t  ")).toEqual([]);
    expect(parsePaste("")).toEqual([]);
  });
});

describe("parsePaste: codes (C16)", () => {
  it("a key file: ParticipantCode in the first cell of the first line (any case, comma or tab), then each line is code, name; the other cells are not read", () => {
    const key = "ParticipantCode,Name\nP003,Priya Sharma\nP007,Rahul Verma\n";
    expect(parsePaste(key)).toEqual([
      { name: "Priya Sharma", spellings: [], code: "P003" },
      { name: "Rahul Verma", spellings: [], code: "P007" }
    ]);
    expect(parsePaste("participantcode\tName\tParent\nP001\tAsha Kumari\tSita")).toEqual([{ name: "Asha Kumari", spellings: [], code: "P001" }]);
    expect(parsePaste('"PARTICIPANTCODE","Name"\n"P010","Kiran Rao"')).toEqual([{ name: "Kiran Rao", spellings: [], code: "P010" }]);
  });

  it("in a key file the first line is the heading, not a person; a row without a name is skipped; a first cell that is not a code is passed on as it is", () => {
    expect(parsePaste("ParticipantCode,Name\nP001\nP002,\nP004,Imran")).toEqual([{ name: "Imran", spellings: [], code: "P004" }]);
    expect(parsePaste("ParticipantCode,Name\nX9,Imran")).toEqual([{ name: "Imran", spellings: [], code: "X9" }]);
  });

  it("without that heading, a line whose first cell is a code (P and one to six digits, any case) is code, name, then other spellings", () => {
    expect(parsePaste("P001,Priya Sharma,Priya\np002,Rahul Verma\nP0003 ,Asha Kumari\nPriya Sharma")).toEqual([
      { name: "Priya Sharma", spellings: ["Priya"], code: "P001" },
      { name: "Rahul Verma", spellings: [], code: "P002" },
      { name: "Asha Kumari", spellings: [], code: "P0003" },
      { name: "Priya Sharma", spellings: [] }
    ]);
  });

  it("a name that only looks like a code is not one: P and seven digits, Pooja, Priya1", () => {
    expect(parsePaste("P1234567,Rahul\nPooja Rani,Pooja\nPriya1")).toEqual([
      { name: "P1234567", spellings: ["Rahul"] },
      { name: "Pooja Rani", spellings: ["Pooja"] },
      { name: "Priya1", spellings: [] }
    ]);
  });

  it("a lone code with no name is not a person", () => {
    expect(parsePaste("P001")).toEqual([]);
  });
});

describe("parsePaste with addPeople", () => {
  it("a key file's codes are kept and next moves past the highest", () => {
    const r = addPeople(emptyList(), parsePaste("ParticipantCode,Name\nP003,Priya Sharma\nP007,Rahul Verma"), "2026-10-24");
    expect(r.added.map((p) => [p.code, p.name])).toEqual([["P003", "Priya Sharma"], ["P007", "Rahul Verma"]]);
    expect(r.list.next).toBe(8);
    expect(r.skipped).toEqual([]);
  });
});

describe("pasteSummary: the sentence after Paste a list", () => {
  const t = (key: string, vars?: Record<string, string | number>) => tFormat(DICTS.en, DICTS.hi, key, "en", vars);
  const sentence = (text: string, today = "2026-10-24") => {
    const parsed = parsePaste(text);
    const base = addPeople(emptyList(), parsePaste("Priya Sharma\nRahul Verma\nAsha Kumari"), today).list;
    const r = addPeople(base, parsed, today);
    return pasteSummary(t, r.added, r.skipped, parsed);
  };

  it("one person, a run of codes, and the people skipped because the name is already listed", () => {
    expect(sentence("Meena Gupta")).toBe("Added 1 person (P004).");
    expect(sentence("Meena Gupta\nNeha Singh\nPriya Sharma")).toBe("Added 2 people (P004\u2013P005). Skipped 1 already on your list: Priya Sharma.");
  });

  it("codes that do not run on are each named; nobody added says so", () => {
    expect(sentence("ParticipantCode,Name\nP010,Meena Gupta\nP020,Neha Singh")).toBe("Added 2 people (P010, P020).");
    expect(sentence("Priya Sharma\nRahul Verma")).toBe("Nobody was added. Skipped 2 already on your list: Priya Sharma, Rahul Verma.");
  });

  it("a name whose code someone else holds is skipped with its code", () => {
    expect(sentence("P002,Meena Gupta\nP009,Neha Singh")).toBe("Added 1 person (P009). Skipped 1 whose code is already used: P002 Meena Gupta.");
  });

  it("a code is shown as it is stored: P0003 is P003", () => {
    expect(sentence("P0003,Meena Gupta\np009,Neha Singh")).toBe("Added 1 person (P009). Skipped 1 whose code is already used: P003 Meena Gupta.");
  });

  it("a long list of skipped names shows ten and how many more", () => {
    const many = Array.from({ length: 12 }, (_, i) => "Person" + String.fromCharCode(65 + i)).join("\n");
    const parsed = parsePaste(many);
    const l = addPeople(emptyList(), parsed, "2026-10-24").list;
    const again = addPeople(l, parsed, "2026-10-24");
    expect(pasteSummary(t, again.added, again.skipped, parsed)).toBe(
      "Nobody was added. Skipped 12 already on your list: PersonA, PersonB, PersonC, PersonD, PersonE, PersonF, PersonG, PersonH, PersonI, PersonJ and 2 more."
    );
  });
});

// ---- Task 8 (R25a): the list's own CSV is read back with its other spellings -----------------------------------------------------------------------------

describe("parsePaste: the list's own download (Download the list → Paste a list)", () => {
  const TODAY = "2026-10-24";
  const built = () => addPeople(emptyList(), [
    { name: "Priya Sharma", spellings: ["Priya", "प्रिया"] },
    { name: "Rahul Verma", spellings: [] },
    { name: "Sharma, Asha", spellings: ["Asha", "Sharma, A.", 'Say "Ashu"'] },
    { name: "Mohd. Imran", spellings: ["Imran"] }
  ], TODAY).list;

  it("reads the Other spellings column, joined with '; ', beside the code and the name", () => {
    const csv = "ParticipantCode,Name,Other spellings,Joined\nP001,Priya Sharma,Priya; प्रिया,2026-10-02\nP002,Rahul Verma,,2026-10-02\n";
    expect(parsePaste(csv)).toEqual([
      { name: "Priya Sharma", spellings: ["Priya", "प्रिया"], code: "P001" },
      { name: "Rahul Verma", spellings: [], code: "P002" }
    ]);
  });

  it("finds the spellings column by its heading wherever it is, in any case, and reads a file with no such column as a key file (no spellings, as before)", () => {
    expect(parsePaste("ParticipantCode,Name,Joined,OTHER SPELLINGS\nP005,Kiran Rao,2026-10-02,Kiran;K. Rao")).toEqual([{ name: "Kiran Rao", spellings: ["Kiran", "K. Rao"], code: "P005" }]);
    expect(parsePaste("ParticipantCode,Name,Score\nP005,Kiran Rao,7")).toEqual([{ name: "Kiran Rao", spellings: [], code: "P005" }]);
  });

  it("round trip: download, paste into an empty list, and the codes, names and spellings are the same", () => {
    const src = built();
    const csv = listCsv(src, ["age"]);
    const back = addPeople(emptyList(), parsePaste("\uFEFF" + csv), TODAY);
    expect(back.skipped).toEqual([]);
    expect(back.list.people.map((p) => p.code)).toEqual(src.people.map((p) => p.code));
    expect(back.list.people.map((p) => p.name)).toEqual(src.people.map((p) => p.name));
    expect(back.list.people.map((p) => p.spellings)).toEqual(src.people.map((p) => p.spellings));
    expect(back.list.next).toBe(src.next);
  });

  it("round trip with the list's own tab/CRLF forms: the same text through a spreadsheet's line ends", () => {
    const src = built();
    const back = addPeople(emptyList(), parsePaste(listCsv(src, []).replace(/\n/g, "\r\n")), TODAY);
    expect(back.list.people.map((p) => [p.code, p.name, p.spellings])).toEqual(src.people.map((p) => [p.code, p.name, p.spellings]));
  });

  it("pasting the download into the same list adds nobody: every name is already there", () => {
    const src = built();
    const r = addPeople(src, parsePaste(listCsv(src, [])), TODAY);
    expect(r.added).toEqual([]);
    expect(r.skipped).toHaveLength(4);
  });
});

describe("the byte-order mark is written as an escape, never as the invisible character", () => {
  it.each(["components/tools/participants/Actions.tsx", "lib/tools/participants/paste.ts"])("%s", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src.includes("\uFEFF")).toBe(false);
    expect(src).toContain("\\uFEFF");
  });
});
