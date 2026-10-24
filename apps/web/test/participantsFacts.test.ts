// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import en from "../messages/tools/participants.en.json";
import hi from "../messages/tools/participants.hi.json";
import { facts } from "../components/tools/participants";
import { emptyList, type ParticipantList } from "../lib/blobs/kinds/participants";
import { addPerson, destroyList, withdraw } from "../lib/tools/participants/list";

/*
 * Task 11: the home's line for Collection and analysis (spec 2026-10-24-participants-design.md §5 "The home's facts for Collection may show counts only", register D-S2-121):
 * how many people are on the list, and never a name. The count is the people on the list, withdrawn included: the same number the Participants tab's count line starts with.
 */

const NAMES = ["Priya Sharma", "Rahul Verma", "Sunita Devi", "Imran Khan", "Meena Kumari"];
const list = (n = NAMES.length): ParticipantList => NAMES.slice(0, n).reduce((l, name) => addPerson(l, { name, spellings: [name.split(" ")[0]!], joined: "2026-10-01", about: { age: "16" }, contact: "9876543210", roll: "12", pseudonym: "Tara" }).list, emptyList());
const blobs = (value: unknown) => ({ participants: { value, updatedAt: "2026-10-24T00:00:00.000Z" } });

describe("the participants module's home facts", () => {
  it("counts the people on the list", () => {
    expect(facts(blobs(list()))).toEqual({ detail: "pp_facts", vars: { n: 5 }, started: true });
    expect(facts(blobs(list(2)))).toEqual({ detail: "pp_facts", vars: { n: 2 }, started: true });
  });

  it("one person has a singular line", () => {
    expect(facts(blobs(list(1)))).toEqual({ detail: "pp_facts_one", vars: { n: 1 }, started: true });
    expect(en.pp_facts_one).toBe("1 participant");
    expect(en.pp_facts).toBe("{n} participants");
  });

  it("a person who withdrew is still on the list and still counted", () => {
    const l = list(3);
    expect(facts(blobs(withdraw(l, l.people[0]!.id, "2026-10-15", "remove"))).vars).toEqual({ n: 3 });
  });

  it("nobody, a destroyed list, no list and something that is not a list have not started", () => {
    expect(facts(blobs(emptyList()))).toEqual({ started: false });
    expect(facts(blobs(destroyList(list(), "2026-10-20")))).toEqual({ started: false });
    expect(facts({})).toEqual({ started: false });
    expect(facts(blobs(null))).toEqual({ started: false });
    expect(facts(blobs("junk"))).toEqual({ started: false });
    expect(facts(blobs({ people: "junk" }))).toEqual({ started: false });
    expect(facts(blobs([]))).toEqual({ started: false });
  });

  it("never carries a name, a spelling, a code, a contact, a roll number or a made-up name: only the key and the count", () => {
    const f = facts(blobs(list()));
    const text = JSON.stringify(f);
    for (const w of [...NAMES.flatMap((n) => n.split(" ")), "P001", "9876543210", "Tara", "16"]) expect(text).not.toContain(w);
    expect(Object.keys(f).sort()).toEqual(["detail", "started", "vars"]);
    expect(Object.keys(f.vars ?? {})).toEqual(["n"]);
  });

  it("the words are in both languages, and the Hindi is a draft for review", () => {
    for (const k of ["pp_facts", "pp_facts_one"] as const) {
      expect(en[k]).toBeTruthy();
      expect(hi[k]).toBeTruthy();
    }
    expect(hi.$draft).toMatch(/DRAFT/);
  });
});
