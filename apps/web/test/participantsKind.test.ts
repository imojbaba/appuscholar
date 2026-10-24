import { describe, expect, it } from "vitest";
import { BLOB_KINDS, isBlobKind, parseBlob } from "@/lib/blobs/kinds";
import { emptyList, type Participant, type ParticipantList } from "@/lib/blobs/kinds/participants";
import { KIND_STAGE, stageOfKind } from "@/lib/frame/stages";

/** One person with every field the spec's section 6 names, and one who withdrew. */
const FULL: Participant = {
  id: "k3f9a1", code: "P001", name: "Sunita Verma", spellings: ["Sunita", "Suneeta"], everyday: ["Sunita"], joined: "2026-10-24",
  consentHow: "written", minor: true, guardian: true, assent: false, contact: "sunita@example.org", roll: "21-0417", pseudonym: "Maple",
  about: { age: "16", gender: "Female", "Hostel block": "C" }
};
const WITHDRAWN: Participant = {
  id: "m8d2c7", code: "P002", name: "Rahul Mehta", spellings: [], everyday: [], joined: "2026-10-24", about: {}, withdrawn: { on: "2026-10-25", data: "remove" }
};
const SAMPLE: ParticipantList = { v: 1, next: 3, people: [FULL, WITHDRAWN], notNames: ["will", "rose"], highlight: false, destroyedAt: "2026-11-01" };

describe("the participants blob kind", () => {
  it("is a blob kind, belongs to Collection and analysis as work, and is listed with the others", () => {
    expect(isBlobKind("participants")).toBe(true);
    expect(BLOB_KINDS).toContain("participants");
    expect(stageOfKind("participants")).toEqual({ stage: "collect", work: true });
    expect(KIND_STAGE.participants).toEqual({ stage: "collect", work: true });
  });

  it("parseBlob returns a list with one person with every field and one withdrawn, as it was written", () => {
    expect(parseBlob("participants", JSON.stringify(SAMPLE))).toEqual(SAMPLE);
  });

  it("a person missing `everyday` or `about` parses with [] and {}", () => {
    const { everyday: _e, about: _a, ...bare } = FULL;
    const got = parseBlob("participants", JSON.stringify({ ...SAMPLE, people: [bare] }));
    expect(got).not.toBeNull();
    expect(got!.people[0]!.everyday).toEqual([]);
    expect(got!.people[0]!.about).toEqual({});
    expect(got!.people[0]!.name).toBe("Sunita Verma");
  });

  it("keeps a field a later build adds, on the list and on a person", () => {
    const got = parseBlob("participants", JSON.stringify({ ...SAMPLE, later: 1, people: [{ ...FULL, nick: "Sun" }] })) as unknown as Record<string, unknown> & { people: Array<Record<string, unknown>> };
    expect(got.later).toBe(1);
    expect(got.people[0]!.nick).toBe("Sun");
  });

  it("optional fields may be absent, and a body of another shape is refused", () => {
    expect(parseBlob("participants", JSON.stringify(emptyList()))).toEqual({ v: 1, next: 1, people: [], notNames: [] });
    expect(parseBlob("participants", JSON.stringify({ v: 1, next: 1, people: [] }))).toBeNull(); // notNames is required
    expect(parseBlob("participants", JSON.stringify({ v: 2, next: 1, people: [], notNames: [] }))).toBeNull();
    expect(parseBlob("participants", JSON.stringify({ ...SAMPLE, people: [{ ...FULL, consentHow: "telepathy" }] }))).toBeNull();
    expect(parseBlob("participants", JSON.stringify({ ...SAMPLE, people: [{ ...FULL, withdrawn: { on: "2026-10-25", data: "burn" } }] }))).toBeNull();
    expect(parseBlob("participants", JSON.stringify([]))).toBeNull();
    expect(parseBlob("participants", "{not json")).toBeNull();
  });

  it("`next` is a whole number of at least 1: a list with next 0, a fraction or a negative number does not parse (a code is never made from it)", () => {
    for (const next of [0, 1.5, -1, 2.0000001]) expect(parseBlob("participants", JSON.stringify({ ...SAMPLE, next })), `next ${next}`).toBeNull();
    expect(parseBlob("participants", JSON.stringify({ ...SAMPLE, next: "3" }))).toBeNull();
    for (const next of [1, 3, 1000, 123456]) expect(parseBlob("participants", JSON.stringify({ ...SAMPLE, next }))?.next, `next ${next}`).toBe(next);
  });

  it("emptyList is a fresh list at P001 with nobody on it each time", () => {
    expect(emptyList()).toEqual({ v: 1, next: 1, people: [], notNames: [] });
    expect(emptyList()).not.toBe(emptyList());
    emptyList().people.push(FULL);
    expect(emptyList().people).toEqual([]);
  });
});

describe("design_ec's identification plan", () => {
  it("parses with idMode, record and recordOther, and keeps them", () => {
    const ec = { title: "Sleep", minors: "yes", idMode: "codes", record: ["name", "spellings", "age"], recordOther: ["Hostel block"], done: true };
    expect(parseBlob("design_ec", JSON.stringify(ec))).toEqual(ec);
  });

  it("an old blob without them still parses", () => {
    const old = { checklist: { "0": true }, title: "Sleep", status: "approved", minors: "no", done: true };
    expect(parseBlob("design_ec", JSON.stringify(old))).toEqual(old);
    expect(parseBlob("design_ec", JSON.stringify({}))).toEqual({});
  });

  it("refuses a record that is not a list of strings", () => {
    expect(parseBlob("design_ec", JSON.stringify({ record: "name" }))).toBeNull();
    expect(parseBlob("design_ec", JSON.stringify({ recordOther: [1] }))).toBeNull();
    expect(parseBlob("design_ec", JSON.stringify({ idMode: 3 }))).toBeNull();
  });
});
