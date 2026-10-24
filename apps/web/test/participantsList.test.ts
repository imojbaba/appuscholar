import { describe, expect, it } from "vitest";
import { RECORD_FIELDS, codeOf, normName } from "@appuscholar/core";
import { emptyList, type Participant, type ParticipantList } from "../lib/blobs/kinds/participants";
import {
  addNotName, addPeople, addPerson, characteristicsTable, consentComplete, destroyList, editPerson, isMinor, listCsv, nextCode, suggestedShortName, toMatchPeople, withdraw
} from "../lib/tools/participants/list";

/*
 * Task 5: the participant list's pure operations (spec 2026-10-24-participants-design.md §5 and §6, calls C2, C7 and C16, rulings R6 and R17).
 * Nothing here reads or saves a blob; the hook that does is in participantsStore.test.tsx.
 */

const TODAY = "2026-10-24";
const add = (l: ParticipantList, name: string, extra: Partial<Participant> = {}) => addPerson(l, { name, spellings: [], joined: TODAY, ...extra });
const names = (l: ParticipantList) => l.people.map((p) => p.name);
const codes = (l: ParticipantList) => l.people.map((p) => p.code);

describe("nextCode (what the Add form says before the person is added)", () => {
  it("is the code addPerson gives: from next, moved on past a code a person holds", () => {
    expect(nextCode(emptyList())).toBe("P001");
    const l: ParticipantList = { ...add(add(emptyList(), "Priya Sharma").list, "Imran Khan").list, next: 1 };
    expect(nextCode(l)).toBe("P003");
    expect(add(l, "Asha Verma").person.code).toBe("P003");
    expect(nextCode({ ...emptyList(), next: 12 })).toBe("P012");
  });
});

describe("addPerson", () => {
  it("gives codes P001, P002 … from next, and moves next on", () => {
    const a = add(emptyList(), "Priya Sharma");
    expect(a.person.code).toBe("P001");
    expect(a.list.next).toBe(2);
    const b = add(a.list, "Imran Khan");
    expect(b.person.code).toBe("P002");
    expect(b.list.next).toBe(3);
    expect(codes(b.list)).toEqual(["P001", "P002"]);
    expect(b.list.people[1]).toBe(b.person);
  });

  it("goes on past P999 (at least three digits, never fewer)", () => {
    const big: ParticipantList = { ...emptyList(), next: 1000 };
    expect(add(big, "Late Joiner").person.code).toBe("P1000");
    expect(add({ ...emptyList(), next: 999 }, "Almost").person.code).toBe("P999");
  });

  it("gives each person a random id that is not the code, and keeps what the caller passed", () => {
    const a = add(emptyList(), "Priya Sharma", { spellings: ["Priya"], contact: "p@example.org", roll: "17", about: { age: "21" }, consentHow: "written" });
    expect(a.person.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.person.id).not.toBe(a.person.code);
    expect(a.person).toMatchObject({ name: "Priya Sharma", spellings: ["Priya"], joined: TODAY, contact: "p@example.org", roll: "17", about: { age: "21" }, consentHow: "written" });
    expect(add(a.list, "Imran Khan").person.id).not.toBe(a.person.id);
  });

  it("does not change the list it was given", () => {
    const l = emptyList();
    const before = JSON.stringify(l);
    add(l, "Priya Sharma");
    expect(JSON.stringify(l)).toBe(before);
  });

  it("pre-marks as everyday each spelling, and each single word of the name, on the built-in everyday list (R6)", () => {
    expect(add(emptyList(), "Asha Kumari", { spellings: ["Asha"] }).person.everyday).toEqual(["Asha"]);
    expect(add(emptyList(), "Pooja Verma", { spellings: ["Pooja", "P. Verma"] }).person.everyday).toEqual(["Pooja"]);
    expect(add(emptyList(), "Priya Sharma", { spellings: ["Priya"] }).person.everyday).toEqual([]);
    // The name itself when it is one everyday word, and a word of the name that is not (yet) a spelling.
    expect(add(emptyList(), "Rose").person.everyday).toEqual(["Rose"]);
    expect(add(emptyList(), "Kiran Patel").person.everyday).toEqual(["Kiran"]);
    // Any case in the list, as typed in the person.
    expect(add(emptyList(), "Imran Khan", { spellings: ["WILL"] }).person.everyday).toEqual(["WILL"]);
  });

  it("keeps an explicit everyday as it is, even an empty one", () => {
    expect(add(emptyList(), "Asha Kumari", { spellings: ["Asha"], everyday: [] }).person.everyday).toEqual([]);
    expect(add(emptyList(), "Priya Sharma", { spellings: ["Priya"], everyday: ["Priya"] }).person.everyday).toEqual(["Priya"]);
  });

  it("trims the name and the spellings, and drops blank and repeated spellings, as Paste a list does", () => {
    const p = add(emptyList(), "  Priya Sharma ", { spellings: [" Priya ", "", "priya", "प्रिया", "  "] }).person;
    expect(p.name).toBe("Priya Sharma");
    expect(p.spellings).toEqual(["Priya", "प्रिया"]);
    // R6 reads the trimmed values.
    expect(add(emptyList(), " Asha Kumari ", { spellings: [" Asha ", "asha"] }).person).toMatchObject({ name: "Asha Kumari", spellings: ["Asha"], everyday: ["Asha"] });
    // An explicit everyday is the caller's.
    expect(add(emptyList(), "Asha Kumari", { spellings: [" Asha "], everyday: ["Asha "] }).person.everyday).toEqual(["Asha "]);
  });

  it("an about of nothing becomes an empty object", () => {
    expect(add(emptyList(), "Priya Sharma").person.about).toEqual({});
  });
});

describe("addPeople (Paste a list)", () => {
  it("adds one person per name with the next codes, joined today, consent left for the student", () => {
    const r = addPeople(emptyList(), [{ name: "Priya Sharma", spellings: ["Priya"] }, { name: "Imran Khan", spellings: [] }, { name: "Asha Rao", spellings: ["Asha", "आशा"] }], TODAY);
    expect(r.skipped).toEqual([]);
    expect(r.added.map((p) => [p.code, p.name, p.joined])).toEqual([["P001", "Priya Sharma", TODAY], ["P002", "Imran Khan", TODAY], ["P003", "Asha Rao", TODAY]]);
    expect(r.list.next).toBe(4);
    expect(r.list.people).toEqual(r.added);
    for (const p of r.added) {
      expect(p.consentHow).toBeUndefined();
      expect(p.minor).toBeUndefined();
      expect(p.guardian).toBeUndefined();
      expect(p.assent).toBeUndefined();
      expect(p.about).toEqual({});
    }
    // R6: Asha is on the everyday list; the Devanagari spelling is not.
    expect(r.added[2]!.everyday).toEqual(["Asha"]);
    expect(r.added[2]!.spellings).toEqual(["Asha", "आशा"]);
  });

  it("keeps a key file's codes: `P007,Asha Kumari` keeps P007 and next becomes 8; a line without a code then takes P008", () => {
    const r = addPeople(emptyList(), [{ name: "Asha Kumari", spellings: [], code: "P007" }, { name: "Imran Khan", spellings: [] }], TODAY);
    expect(r.skipped).toEqual([]);
    expect(r.added.map((p) => [p.code, p.name])).toEqual([["P007", "Asha Kumari"], ["P008", "Imran Khan"]]);
    expect(r.list.next).toBe(9);
    const only = addPeople(emptyList(), [{ name: "Asha Kumari", spellings: [], code: "P007" }], TODAY);
    expect(only.list.next).toBe(8);
  });

  it("a kept code below next leaves next where it is; one above moves it", () => {
    const l = { ...emptyList(), next: 8 };
    expect(addPeople(l, [{ name: "Old Friend", spellings: [], code: "P002" }], TODAY).list.next).toBe(8);
    expect(addPeople(l, [{ name: "Far Ahead", spellings: [], code: "P020" }], TODAY).list.next).toBe(21);
    expect(addPeople(l, [{ name: "Big", spellings: [], code: "P1500" }], TODAY).added[0]!.code).toBe("P1500");
  });

  it("skips a name already on the list (any case, spacing or dots) as `already`, and the one pasted twice", () => {
    const l = add(emptyList(), "Asha Kumari").list;
    const r = addPeople(l, [{ name: "asha  kumari", spellings: [] }, { name: "Imran Khan", spellings: [] }, { name: "IMRAN KHAN", spellings: [] }, { name: "R.K. Sharma", spellings: [] }, { name: "R. K. Sharma", spellings: [] }], TODAY);
    expect(r.skipped).toEqual([{ name: "asha  kumari", why: "already" }, { name: "IMRAN KHAN", why: "already" }, { name: "R. K. Sharma", why: "already" }]);
    expect(names(r.list)).toEqual(["Asha Kumari", "Imran Khan", "R.K. Sharma"]);
    expect(codes(r.list)).toEqual(["P001", "P002", "P003"]);
  });

  it("a key file pasted again adds nobody: every name is already there, whatever its code", () => {
    const first = addPeople(emptyList(), [{ name: "Asha Kumari", spellings: [], code: "P007" }, { name: "Imran Khan", spellings: [], code: "P003" }], TODAY);
    const again = addPeople(first.list, [{ name: "Asha Kumari", spellings: [], code: "P007" }, { name: "Imran Khan", spellings: [], code: "P003" }], TODAY);
    expect(again.added).toEqual([]);
    expect(again.skipped.map((s) => s.why)).toEqual(["already", "already"]);
    expect(again.list).toBe(first.list);
  });

  it("a withdrawn person's name is still on the list", () => {
    const a = add(emptyList(), "Asha Kumari").list;
    const w = withdraw(a, a.people[0]!.id, "2026-10-20", "keep");
    expect(addPeople(w, [{ name: "Asha Kumari", spellings: [] }], TODAY).skipped).toEqual([{ name: "Asha Kumari", why: "already" }]);
  });

  it("skips a code held by another name as `code-taken`, and a code given twice in one paste", () => {
    const l = addPeople(emptyList(), [{ name: "Asha Kumari", spellings: [], code: "P007" }], TODAY).list;
    const r = addPeople(l, [{ name: "Imran Khan", spellings: [], code: "P007" }, { name: "Sunita Devi", spellings: [], code: "P009" }, { name: "Rahul Jain", spellings: [], code: "P009" }], TODAY);
    expect(r.skipped).toEqual([{ name: "Imran Khan", why: "code-taken" }, { name: "Rahul Jain", why: "code-taken" }]);
    expect(r.added.map((p) => [p.code, p.name])).toEqual([["P009", "Sunita Devi"]]);
    expect(r.list.next).toBe(10);
  });

  it("a code that is not a participant code (no P and digits) is not kept: the person takes the next code", () => {
    const r = addPeople(emptyList(), [{ name: "Asha Kumari", spellings: [], code: "ID-5" }], TODAY);
    expect(r.added[0]!.code).toBe("P001");
    expect(r.list.next).toBe(2);
  });

  it("P000 and a code of more than six digits are not codes either: no code, no skip, the next code is taken", () => {
    const r = addPeople(emptyList(), [{ name: "Zero Zero", spellings: [], code: "P000" }, { name: "Very Long", spellings: [], code: "P1234567" }, { name: "Also Long", spellings: [], code: "p0000000" }], TODAY);
    expect(r.skipped).toEqual([]);
    expect(r.added.map((p) => [p.code, p.name])).toEqual([["P001", "Zero Zero"], ["P002", "Very Long"], ["P003", "Also Long"]]);
    expect(r.list.next).toBe(4);
    // Six digits is the most that is kept, and it moves next on.
    const six = addPeople(emptyList(), [{ name: "Six Digits", spellings: [], code: "P999999" }], TODAY);
    expect(six.added[0]!.code).toBe("P999999");
    expect(six.list.next).toBe(1000000);
    expect(addPeople(emptyList(), [{ name: "One", spellings: [], code: "P1" }], TODAY).added[0]!.code).toBe("P001");
  });

  it("trims names and spellings, drops blank and repeated spellings, and ignores a blank name", () => {
    const r = addPeople(emptyList(), [{ name: "  Priya Sharma ", spellings: [" Priya ", "", "priya", "प्रिया"] }, { name: "   ", spellings: ["x"] }], TODAY);
    expect(r.added).toHaveLength(1);
    expect(r.added[0]!.name).toBe("Priya Sharma");
    expect(r.added[0]!.spellings).toEqual(["Priya", "प्रिया"]);
    expect(r.skipped).toEqual([]);
  });

  it("returns the list it was given when nobody is added", () => {
    const l = add(emptyList(), "Asha Kumari").list;
    expect(addPeople(l, [], TODAY).list).toBe(l);
    expect(addPeople(l, [{ name: "Asha Kumari", spellings: [] }], TODAY).list).toBe(l);
  });
});

describe("editPerson, withdraw, addNotName", () => {
  const base = addPeople(emptyList(), [{ name: "Priya Sharma", spellings: ["Priya"] }, { name: "Imran Khan", spellings: [] }], TODAY).list;
  const priya = base.people[0]!;

  it("changes what the patch names and never the code or id", () => {
    const l = editPerson(base, priya.id, { name: "Priya Sharma-Rao", contact: "98", code: "P999", id: "other" } as Partial<Participant>);
    expect(l.people[0]).toMatchObject({ id: priya.id, code: "P001", name: "Priya Sharma-Rao", contact: "98", spellings: ["Priya"] });
    expect(l.people[1]).toBe(base.people[1]);
    expect(l.next).toBe(base.next);
  });

  it("an id that is not on the list changes nothing", () => {
    expect(editPerson(base, "nobody", { name: "X" })).toBe(base);
  });

  it("withdraw records the date and the choice, keeps the code, and leaves the person on the list", () => {
    const l = withdraw(base, priya.id, "2026-10-20", "remove");
    expect(l.people[0]).toMatchObject({ code: "P001", name: "Priya Sharma", withdrawn: { on: "2026-10-20", data: "remove" } });
    expect(l.people).toHaveLength(2);
    expect(l.people[1]!.withdrawn).toBeUndefined();
    expect(withdraw(l, priya.id, "2026-10-22", "keep").people[0]!.withdrawn).toEqual({ on: "2026-10-22", data: "keep" });
    expect(withdraw(base, "nobody", "2026-10-20", "keep")).toBe(base);
  });

  it("addNotName stores the normalised word once and ignores a blank", () => {
    const l = addNotName(base, "  Hope  ");
    expect(l.notNames).toEqual([normName("Hope")]);
    expect(addNotName(l, "HOPE")).toBe(l);
    expect(addNotName(l, "   ")).toBe(l);
    expect(addNotName(l, "Mark").notNames).toEqual(["hope", "mark"]);
  });
});

describe("destroyList (C7)", () => {
  it("keeps only next and the date; nothing else, and next never goes down", () => {
    const l = addNotName({ ...addPeople(emptyList(), [{ name: "Priya Sharma", spellings: [] }, { name: "Imran Khan", spellings: [] }], TODAY).list, highlight: false }, "Hope");
    const d = destroyList(l, "2026-11-02");
    expect(d).toEqual({ v: 1, next: 3, people: [], notNames: [], destroyedAt: "2026-11-02" });
    expect(Object.keys(d).sort()).toEqual(["destroyedAt", "next", "notNames", "people", "v"]);
  });

  it("new people continue from the next code, and the list matches again", () => {
    const d = destroyList(add(emptyList(), "Priya Sharma").list, "2026-11-02");
    expect(toMatchPeople(d, false)).toEqual([]);
    const a = add(d, "Imran Khan");
    expect(a.person.code).toBe("P002");
    expect(a.list.next).toBe(3);
    // A list with people on it is no longer a destroyed one, so matching is on.
    expect(a.list.destroyedAt).toBeUndefined();
    expect(toMatchPeople(a.list, false).map((p) => p.code)).toEqual(["P002"]);
    const p = addPeople(d, [{ name: "Sunita Devi", spellings: [] }], TODAY);
    expect(p.added[0]!.code).toBe("P002");
    expect(p.list.destroyedAt).toBeUndefined();
  });
});

describe("suggestedShortName (C2)", () => {
  it("is the name's first word, skipping a leading title or Mohd.", () => {
    expect(suggestedShortName("Mohd. Imran")).toBe("Imran");
    expect(suggestedShortName("Priya Sharma")).toBe("Priya");
    expect(suggestedShortName("Md. Salim Ansari")).toBe("Salim");
    expect(suggestedShortName("Md Salim")).toBe("Salim");
    expect(suggestedShortName("Mr Rahul Jain")).toBe("Rahul");
    expect(suggestedShortName("Mrs. Geeta Rao")).toBe("Geeta");
    expect(suggestedShortName("Ms Anita Roy")).toBe("Anita");
    expect(suggestedShortName("Dr. Asha Rao")).toBe("Asha");
    expect(suggestedShortName("Shri Ram Prasad")).toBe("Ram");
    expect(suggestedShortName("Smt. Sunita Devi")).toBe("Sunita");
    expect(suggestedShortName("Kumari Asha")).toBe("Asha");
    expect(suggestedShortName("mohd. imran")).toBe("imran");
    expect(suggestedShortName("  Priya   Sharma ")).toBe("Priya");
  });

  it("falls back to the first word when nothing else is left, and to nothing for a blank", () => {
    expect(suggestedShortName("Kumari")).toBe("Kumari");
    expect(suggestedShortName("Dr.")).toBe("Dr.");
    expect(suggestedShortName("")).toBe("");
    expect(suggestedShortName("   ")).toBe("");
  });

  it("does not skip a title-like word that is not a leading one", () => {
    expect(suggestedShortName("Asha Kumari")).toBe("Asha");
  });
});

describe("isMinor and consentComplete (under 18)", () => {
  const person = (extra: Partial<Participant>): Participant => ({ id: "i", code: "P001", name: "X", spellings: [], everyday: [], joined: TODAY, about: {}, ...extra });

  it("with age recorded, a person is a minor when their age is a number below 18; the tick is not read", () => {
    expect(isMinor(person({ about: { age: "16" } }), true)).toBe(true);
    expect(isMinor(person({ about: { age: "17" } }), true)).toBe(true);
    expect(isMinor(person({ about: { age: "18" } }), true)).toBe(false);
    expect(isMinor(person({ about: { age: " 15 " } }), true)).toBe(true);
    expect(isMinor(person({ about: { age: "15 years" } }), true)).toBe(true);
    expect(isMinor(person({ about: { age: "twenty" } }), true)).toBe(false);
    // Digits of other scripts: Devanagari and Arabic-Indic.
    expect(isMinor(person({ about: { age: "१६" } }), true)).toBe(true);
    expect(isMinor(person({ about: { age: "१७ वर्ष" } }), true)).toBe(true);
    expect(isMinor(person({ about: { age: "१८" } }), true)).toBe(false);
    expect(isMinor(person({ about: { age: "२१" } }), true)).toBe(false);
    expect(isMinor(person({ about: { age: "١٦" } }), true)).toBe(true);
    expect(consentComplete(person({ about: { age: "१५" } }), true)).toBe(false);
    expect(isMinor(person({ about: { age: "" } }), true)).toBe(false);
    expect(isMinor(person({}), true)).toBe(false);
    expect(isMinor(person({ minor: true, about: { age: "30" } }), true)).toBe(false);
    expect(isMinor(person({ minor: true }), true)).toBe(false);
  });

  it("with age not recorded, a person is a minor when ticked; the age is not read", () => {
    expect(isMinor(person({ minor: true }), false)).toBe(true);
    expect(isMinor(person({ minor: false }), false)).toBe(false);
    expect(isMinor(person({}), false)).toBe(false);
    expect(isMinor(person({ about: { age: "12" } }), false)).toBe(false);
  });

  it("consent is complete for an adult, and for a minor only with the parent's permission and the child's own agreement", () => {
    expect(consentComplete(person({}), false)).toBe(true);
    expect(consentComplete(person({ minor: true }), false)).toBe(false);
    expect(consentComplete(person({ minor: true, guardian: true }), false)).toBe(false);
    expect(consentComplete(person({ minor: true, assent: true }), false)).toBe(false);
    expect(consentComplete(person({ minor: true, guardian: true, assent: true }), false)).toBe(true);
    expect(consentComplete(person({ about: { age: "14" } }), true)).toBe(false);
    expect(consentComplete(person({ about: { age: "14" }, guardian: true, assent: true }), true)).toBe(true);
    expect(consentComplete(person({ about: { age: "30" } }), true)).toBe(true);
  });
});

describe("toMatchPeople", () => {
  const list = (): ParticipantList => {
    let l = add(emptyList(), "Priya Sharma", { spellings: ["Priya"], contact: "98765", roll: "17", pseudonym: "Meera" }).list;
    l = add(l, "Imran Khan", { spellings: ["Imran"] }).list;
    return withdraw(l, l.people[1]!.id, "2026-10-20", "remove");
  };

  it("hands the matcher id, code, name, spellings, everyday and withdrawn; no contact, roll or about", () => {
    const m = toMatchPeople(list(), false);
    expect(m.map((p) => p.code)).toEqual(["P001", "P002"]);
    expect(Object.keys(m[0]!).sort()).toEqual(["code", "everyday", "id", "name", "spellings"]);
    expect(m[1]!.withdrawn).toEqual({ on: "2026-10-20", data: "remove" });
    expect(JSON.stringify(m)).not.toContain("98765");
  });

  it("carries the made-up name only in made-up names mode, and only for a person who has one", () => {
    expect(toMatchPeople(list(), true).map((p) => p.pseudonym)).toEqual(["Meera", undefined]);
    expect("pseudonym" in toMatchPeople(list(), true)[1]!).toBe(false);
    expect(toMatchPeople(list(), false).some((p) => "pseudonym" in p)).toBe(false);
  });

  it("is empty for a destroyed list, even one that has people on it", () => {
    expect(toMatchPeople(destroyList(list(), "2026-11-01"), false)).toEqual([]);
    expect(toMatchPeople({ ...list(), destroyedAt: "2026-11-01" }, true)).toEqual([]);
    expect(toMatchPeople(emptyList(), false)).toEqual([]);
  });
});

describe("listCsv (Download the list)", () => {
  const list = (): ParticipantList => {
    let l = add(emptyList(), "Priya Sharma", { spellings: ["Priya", "प्रिया"], joined: "2026-10-01", consentHow: "written", contact: "priya@example.org", roll: "17", pseudonym: "Meera", about: { age: "21", "Hostel block": "B, wing 2" } }).list;
    l = add(l, "Imran \"Imu\" Khan", { spellings: ["Imran"], minor: true, guardian: true, assent: false, about: { age: "15" } }).list;
    return withdraw(l, l.people[1]!.id, "2026-10-20", "remove");
  };
  const rows = (csv: string) => csv.split("\n");

  it("has a heading row and a row per person, with the names, spellings, contact and roll in it", () => {
    const csv = listCsv(list(), ["age"]);
    const r = rows(csv);
    expect(r).toHaveLength(3);
    expect(r[0]!.split(",").slice(0, 3)).toEqual(["ParticipantCode", "Name", "Other spellings"]);
    expect(csv).toContain("Priya Sharma");
    expect(csv).toContain("priya@example.org");
    expect(csv).toContain("प्रिया");
    expect(r[1]!.startsWith("P001,Priya Sharma,")).toBe(true);
    expect(r[2]!.startsWith("P002,")).toBe(true);
  });

  it("quotes a value with a comma or a quote, as v1's CSV does", () => {
    const csv = listCsv(list(), ["age"]);
    expect(csv).toContain('"Imran ""Imu"" Khan"');
    // Other spellings share one cell.
    expect(csv).toContain("Priya; प्रिया");
  });

  it("has a column for each field given, and for any other value still stored (nothing on the list is left out)", () => {
    const csv = listCsv(list(), ["age"]);
    const head = rows(csv)[0]!.split(",");
    expect(head).toContain("Age");
    expect(head).toContain("Hostel block");
    expect(csv).toContain('"B, wing 2"');
    // A field with no value for anyone is still a column when it is asked for.
    expect(rows(listCsv(list(), ["age", "course"]))[0]!.split(",")).toContain("Course");
  });

  it("says who is under 18, who gave permission and agreed, and who withdrew and what they chose", () => {
    const csv = listCsv(list(), ["age"]);
    const head = rows(csv)[0]!;
    for (const h of ["Under 18", "Parent's permission", "Own agreement", "Withdrew on", "Their data"]) expect(head).toContain(h);
    expect(rows(csv)[2]!).toContain("2026-10-20");
    expect(rows(csv)[2]!).toContain("remove");
  });

  it("is just the heading for a list with nobody on it", () => {
    expect(rows(listCsv(emptyList(), ["age"]))).toHaveLength(1);
  });

  it("drops the who-they-are field ids from the fields, so the plan's whole list never doubles Name, Contact or Roll", () => {
    const head = (fields: string[]) => rows(listCsv(list(), fields))[0]!.split(",");
    const whole = head(RECORD_FIELDS.map((f) => f.id));
    for (const h of ["Name", "Contact", "Roll"]) expect(whole.filter((x) => x === h), h).toHaveLength(1);
    expect(whole.filter((x) => /^(name|spellings|contact|roll)$/i.test(x))).toEqual(["Name", "Contact", "Roll"]);
    // The about-them fields are all there once.
    for (const f of RECORD_FIELDS.filter((x) => x.group === "about")) expect(whole, f.id).toContain(f.id.charAt(0).toUpperCase() + f.id.slice(1));
    expect(head(["name", "contact", "age"])).toEqual(head(["age"]));
  });

  it("uses the labels it is given for the fields' headings, and the English default where it is given none", () => {
    const head = rows(listCsv(list(), ["age", "Hostel block", "course"], { age: "आयु", course: "Course of study" }))[0]!.split(",");
    expect(head).toContain("आयु");
    expect(head).toContain("Course of study");
    expect(head).toContain("Hostel block");
    expect(head).not.toContain("Age");
    expect(head).not.toContain("Course");
  });
});

describe("characteristicsTable (Copy as table: codes, no names)", () => {
  const list = (): ParticipantList => {
    let l = add(emptyList(), "Priya Sharma", { spellings: ["Priya"], contact: "priya@example.org", roll: "ROLL-17", pseudonym: "Meera", about: { age: "21", gender: "female", "Hostel block": "B" } }).list;
    l = add(l, "Imran Khan", { spellings: ["Imran"], about: { age: "19" } }).list;
    return l;
  };
  const cells = (t: string) => t.split("\n").map((r) => r.split("\t"));

  it("is tab-separated: Code and the about-them fields asked for, a row per person", () => {
    const t = characteristicsTable(list(), ["age", "gender", "Hostel block"], false);
    expect(cells(t)).toEqual([["Code", "Age", "Gender", "Hostel block"], ["P001", "21", "female", "B"], ["P002", "19", "", ""]]);
  });

  it("has no name, spelling, contact or roll anywhere in it", () => {
    for (const pseudonyms of [false, true]) {
      const t = characteristicsTable(list(), ["age", "gender"], pseudonyms);
      for (const secret of ["Priya", "Sharma", "Imran", "Khan", "priya@example.org", "ROLL-17"]) expect(t, secret).not.toContain(secret);
      expect(cells(t)[0]).not.toContain("Name");
    }
  });

  it("adds the made-up name after the code in made-up names mode only", () => {
    const t = characteristicsTable(list(), ["age"], true);
    expect(cells(t)).toEqual([["Code", "Made-up name", "Age"], ["P001", "Meera", "21"], ["P002", "", "19"]]);
    expect(cells(characteristicsTable(list(), ["age"], false))[0]).toEqual(["Code", "Age"]);
  });

  it("keeps a tab or line break typed in a value from breaking the table", () => {
    const l = add(emptyList(), "Priya Sharma", { about: { area: "North\tWest\nzone" } }).list;
    const t = characteristicsTable(l, ["area"], false);
    expect(cells(t)).toEqual([["Code", "Area"], ["P001", "North West zone"]]);
  });

  it("is only the heading for a list with nobody on it", () => {
    expect(characteristicsTable(emptyList(), ["age"], false)).toBe("Code\tAge");
  });

  it("drops the who-they-are field ids by construction: the plan's whole record list never yields a Name, Spellings, Contact or Roll column", () => {
    const whole = RECORD_FIELDS.map((f) => f.id);
    for (const pseudonyms of [false, true]) {
      const t = characteristicsTable(list(), whole, pseudonyms);
      const head = cells(t)[0]!;
      for (const who of ["name", "spellings", "contact", "roll"]) {
        expect(head.map((h) => h.toLowerCase()), who).not.toContain(who);
      }
      expect(head).toEqual(["Code", ...(pseudonyms ? ["Made-up name"] : []), ...RECORD_FIELDS.filter((f) => f.group === "about").map((f) => f.id.charAt(0).toUpperCase() + f.id.slice(1))]);
      for (const secret of ["Priya", "Sharma", "Imran", "Khan", "priya@example.org", "ROLL-17"]) expect(t, secret).not.toContain(secret);
      // Every row has a cell for every heading.
      for (const row of cells(t)) expect(row).toHaveLength(head.length);
    }
    expect(characteristicsTable(list(), ["name", "age", "contact"], false)).toBe(characteristicsTable(list(), ["age"], false));
  });

  it("uses the labels it is given for the fields' headings, and the English default where it is given none", () => {
    const t = characteristicsTable(list(), ["age", "gender", "Hostel block"], false, { age: "आयु", "Hostel block": "Hostel" });
    expect(cells(t)[0]).toEqual(["Code", "आयु", "Gender", "Hostel"]);
    expect(cells(t)[1]).toEqual(["P001", "21", "female", "B"]);
    expect(cells(characteristicsTable(list(), ["age"], true, { age: "Years" }))[0]).toEqual(["Code", "Made-up name", "Years"]);
  });
});

describe("the module's codes use core's codeOf", () => {
  it("P + three digits", () => {
    expect(codeOf(1)).toBe("P001");
    expect(add(emptyList(), "A B").person.code).toBe(codeOf(1));
  });
});
