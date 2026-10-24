import { describe, it, expect } from "vitest";
import { consentMarkdown, ecMinorsNote, ethicsStatement, protocolMarkdown } from "../src/design";
import type { EcState, ProtoFields } from "../src/design";
import {
  RECORD_FIELDS, consentMarkdownV2, ecMinorsNoteV2, ethicsStatementV2, needsCombinationWarning, protocolMarkdownV2,
  type IdMode, type Plan,
} from "../src/designPlan";

/**
 * The student's identification plan (spec 2026-10-24-participants §4) in the paperwork. These are v2's own functions: each calls v1's (design.ts, never edited) and adds text, so the
 * test that matters most is that with no `idMode` every output is v1's, byte for byte, and that taking the added sections out of a V2 output gives v1's text back. The wording is
 * the builder's, for Dr. Sharma to review (register rows D-S2-113 to D-S2-115).
 */
type Consent = Parameters<typeof consentMarkdown>[0] & { minors?: string };
const CONSENT: Consent = { title: "Sleep and mood", pi: "Dr A. Rao, Example College", what: "A short survey about sleep.", risks: "None beyond tiredness.", benefits: "A small thank-you.", contact: "rao@example.edu", minors: "no" };
const CONSENT_EMPTY: Consent = { title: "T", pi: "P", what: "", risks: "", benefits: "", contact: "", minors: "unsure" };
// Student text that looks like the form's own headings, and carries `$` patterns, must stay where the student put it.
const CONSENT_TRICKY: Consent = {
  title: "Study $& $1 $$", pi: "PI",
  what: "notes\n\n## Voluntary participation\nTaking part in this study is entirely voluntary. $&",
  risks: "notes\n\n## Consent\nI have read and understood the above",
  benefits: "b",
  contact: "## Voluntary participation\nTaking part in this study is entirely voluntary.\n\n## Consent\nI have read and understood the above, had the chance",
  minors: "yes",
};
const CONSENT_INPUTS: Array<[string, Consent]> = [["full, minors no", CONSENT], ["empty text, minors unsure", CONSENT_EMPTY], ["tricky text, minors yes", CONSENT_TRICKY], ["full, minors yes", { ...CONSENT, minors: "yes" }]];

const ETHICS = (over: Partial<EcState>): Parameters<typeof ethicsStatement>[0] => ({ status: "approved", committee: "Example IEC", apprNo: "IEC/12", apprDate: "2026-03-04", consentMode: "written", minors: "no", ...over });
const ETHICS_INPUTS: Array<[string, Parameters<typeof ethicsStatement>[0]]> = [
  ["approved", ETHICS({})], ["applied, minors yes", ETHICS({ status: "applied", minors: "yes", consentMode: "online" })], ["noreview, unsure", ETHICS({ status: "noreview", minors: "unsure", consentMode: "" })],
  ["not yet sent", ETHICS({ status: "notyet" })],
];
const PROTO: ProtoFields = { bg: "bg", obj: "obj", design: "design", part: "part", sample: "sample", proc: "proc", risk: "risk", dmp: "Data stay on one laptop." };
const PROTO_EMPTY_DMP: ProtoFields = { ...PROTO, dmp: "" };
const PROTO_TRICKY: ProtoFields = { ...PROTO, dmp: "x\n\n## References\ny $&" };
const PROTO_INPUTS: Array<[string, ProtoFields]> = [["full", PROTO], ["no dmp", PROTO_EMPTY_DMP], ["tricky dmp", PROTO_TRICKY]];

const MODES: IdMode[] = ["codes", "pseudonyms", "anonymous"];
const CODES_SENTENCE = "Your answers are stored under a code (such as P001), not your name. The list that links your name to your code is kept sealed, separately from your answers, and is destroyed after the study.";
const PSEUDO_SENTENCE = "Your answers are stored under a made-up name, not your name. The list that links your name to your made-up name is kept sealed, separately from your answers, and is destroyed after the study.";
const ANON_SENTENCE = "We will not write down your name. Your answers cannot be linked to you.";
const LINE = "______________________";
const DATE = "Date: __________";

/** The text of one `## ` section of a form, up to the next `## ` heading (or the end). */
const section = (md: string, heading: string): string | null => {
  const i = md.indexOf("## " + heading + "\n");
  if (i < 0) return null;
  const rest = md.slice(i + 4 + heading.length);
  const j = rest.indexOf("\n## ");
  return (j < 0 ? rest : rest.slice(0, j)).trim();
};
const str = (r: string | { error: string }): string => {
  if (typeof r !== "string") throw new Error("expected text, got " + JSON.stringify(r));
  return r;
};
/** A V2 consent form with every section the plan adds cut out: it must be v1's text. */
const withoutAdded = (md: string): string =>
  md
    .replace(/## What we record about you\n[\s\S]*?\n\n(?=## Voluntary participation\n)/, "")
    .replace(/## Parent or guardian permission\n[\s\S]*?\n\n(?=## Consent\n)/, "");

describe("RECORD_FIELDS and needsCombinationWarning", () => {
  it("holds the menu in the spec's order, with its groups, starting ticks and sensitive marks", () => {
    expect(RECORD_FIELDS.map((f) => f.id)).toEqual(["name", "spellings", "contact", "roll", "age", "gender", "year", "course", "area", "language", "caste", "religion", "health", "income"]);
    expect(RECORD_FIELDS.filter((f) => f.group === "who").map((f) => f.id)).toEqual(["name", "spellings", "contact", "roll"]);
    expect(RECORD_FIELDS.filter((f) => f.group === "about").map((f) => f.id)).toEqual(["age", "gender", "year", "course", "area", "language", "caste", "religion", "health", "income"]);
    expect(RECORD_FIELDS.filter((f) => f.ticked).map((f) => f.id)).toEqual(["name", "spellings"]);
    expect(RECORD_FIELDS.filter((f) => f.sensitive).map((f) => f.id)).toEqual(["caste", "religion", "health", "income"]);
    expect(RECORD_FIELDS.filter((f) => f.sensitive).every((f) => f.group === "about")).toBe(true);
  });

  it("warns at three or more about-fields, counting each once, and never counts the who-fields", () => {
    expect(needsCombinationWarning([])).toBe(false);
    expect(needsCombinationWarning(["age", "gender"])).toBe(false);
    expect(needsCombinationWarning(["age", "gender", "area"])).toBe(true);
    expect(needsCombinationWarning(["age", "age", "gender", "gender"])).toBe(false);
    expect(needsCombinationWarning(["name", "spellings", "contact", "roll", "age", "gender"])).toBe(false);
    expect(needsCombinationWarning(["caste", "religion", "income"])).toBe(true);
    expect(needsCombinationWarning(["age", "gender", "year", "something-stored-by-a-later-build"])).toBe(true);
    expect(needsCombinationWarning(["age", "gender", "unknown"])).toBe(false);
  });
});

describe("with no idMode every output is v1's", () => {
  it.each(CONSENT_INPUTS)("consentMarkdownV2, %s", (_n, s) => {
    expect(consentMarkdownV2(s, {})).toBe(consentMarkdown(s));
    expect(consentMarkdownV2(s, { record: ["name", "age"], recordOther: ["Hobbies"] })).toBe(consentMarkdown(s));
  });
  it("consentMarkdownV2 passes v1's refusal through unchanged, for every mode", () => {
    for (const plan of [{}, ...MODES.map((idMode) => ({ idMode }))] as Plan[]) {
      expect(consentMarkdownV2({ ...CONSENT, title: "" }, plan)).toEqual({ error: "Fill in at least the study title and PI/institution first" });
      expect(consentMarkdownV2({ ...CONSENT, pi: "" }, plan)).toEqual(consentMarkdown({ ...CONSENT, pi: "" }));
    }
  });
  it.each(ETHICS_INPUTS)("ethicsStatementV2, %s", (_n, s) => {
    expect(ethicsStatementV2(s, {})).toEqual(ethicsStatement(s));
    expect(ethicsStatementV2(s, { record: ["name"] })).toEqual(ethicsStatement(s));
  });
  it("ethicsStatementV2 passes v1's refusal through unchanged, for every mode", () => {
    for (const plan of [{}, ...MODES.map((idMode) => ({ idMode }))] as Plan[]) {
      expect(ethicsStatementV2(ETHICS({ status: "" }), plan)).toEqual({ error: "Choose where things stand first" });
    }
  });
  it.each(PROTO_INPUTS)("protocolMarkdownV2, %s", (_n, o) => {
    expect(protocolMarkdownV2(o, {})).toBe(protocolMarkdown(o));
  });
  it("protocolMarkdownV2 gives null for an empty protocol, for every mode", () => {
    const empty: ProtoFields = { bg: "", obj: "", design: "", part: "", sample: "", proc: "", risk: "", dmp: "" };
    for (const plan of [{}, ...MODES.map((idMode) => ({ idMode }))] as Plan[]) expect(protocolMarkdownV2(empty, plan)).toBeNull();
  });
  it("ecMinorsNoteV2 gives '' where v1 gives ''", () => {
    for (const m of ["", "no", "anything else"]) {
      expect(ecMinorsNote(m)).toBe("");
      expect(ecMinorsNoteV2(m)).toBe("");
    }
  });
});

describe("consentMarkdownV2", () => {
  const plan: Plan = { idMode: "codes", record: ["name", "spellings", "age", "gender"] };

  it("puts the record section before Voluntary participation and the two minors sections before Consent, in order", () => {
    const md = str(consentMarkdownV2({ ...CONSENT, minors: "yes" }, plan));
    const heads = ["## What we record about you", "## Voluntary participation", "## Parent or guardian permission", "## Young person's agreement", "## Consent"].map((h) => md.indexOf(h + "\n"));
    expect(heads.every((i) => i >= 0)).toBe(true);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
    const v1 = str(consentMarkdown(CONSENT));
    for (const h of ["## What this study involves", "## Risks and discomforts", "## Benefits", "## Confidentiality", "## Questions or complaints"]) {
      expect(md.indexOf(h + "\n"), h).toBeGreaterThan(-1);
      expect(md.indexOf(h + "\n") < md.indexOf("## What we record about you") === v1.indexOf(h + "\n") < v1.indexOf("## Voluntary participation"), h).toBe(true);
    }
  });

  it("names the ticked fields in plain words and says answers are kept under a code", () => {
    const rec = section(str(consentMarkdownV2(CONSENT, plan)), "What we record about you")!;
    expect(rec).toBe("We will write down your name, other names you use, your age and your gender. " + CODES_SENTENCE);
    expect(rec).toContain("your name");
    expect(rec).toContain("age");
    expect(rec).toContain("gender");
    expect(rec).toContain("stored under a code");
  });

  it("writes one sentence for the fields and one for the mode, for codes and for made-up names", () => {
    expect(section(str(consentMarkdownV2(CONSENT, { idMode: "pseudonyms", record: ["name", "contact"] })), "What we record about you")).toBe(
      "We will write down your name and a phone number or email address to contact you. " + PSEUDO_SENTENCE);
    expect(section(str(consentMarkdownV2(CONSENT, { idMode: "codes", record: ["roll"] })), "What we record about you")).toBe("We will write down your roll or enrolment number. " + CODES_SENTENCE);
  });

  it("uses the fixed plain name of every field, in the menu's order whatever order the plan stored them in", () => {
    const all = RECORD_FIELDS.map((f) => f.id);
    const rec = section(str(consentMarkdownV2(CONSENT, { idMode: "codes", record: [...all].reverse() })), "What we record about you")!;
    expect(rec.startsWith(
      "We will write down your name, other names you use, a phone number or email address to contact you, your roll or enrolment number, your age, your gender, your year or class, " +
      "your course, where you live (town or district, not your address), the language you speak at home, your caste or category, your religion, health information and your family's income. ")).toBe(true);
  });

  it("skips ids it does not know and says nothing about fields when none are ticked", () => {
    expect(section(str(consentMarkdownV2(CONSENT, { idMode: "codes", record: ["nothing"] })), "What we record about you")).toBe(CODES_SENTENCE);
    expect(section(str(consentMarkdownV2(CONSENT, { idMode: "pseudonyms" })), "What we record about you")).toBe(PSEUDO_SENTENCE);
  });

  it("adds the student's own labels after the menu fields: trimmed, blanks dropped, five at most, a leading capital lower-cased only before a lower-case letter", () => {
    const rec = (record: string[], recordOther: string[]) => section(str(consentMarkdownV2(CONSENT, { idMode: "codes", record, recordOther })), "What we record about you")!.split(". ")[0] + ".";
    expect(rec(["age"], ["Hobbies", "  IQ score ", "", "   ", "A level", "Father's occupation", "Sixth", "Seventh"])).toBe(
      "We will write down your age, hobbies, IQ score, A level, father's occupation and sixth.");
    expect(rec([], ["Hobbies and sports"])).toBe("We will write down hobbies and sports.");
    expect(rec([], ["Pocket money $&"])).toBe("We will write down pocket money $&.");
  });

  it("anonymous: no name is recorded, and only the about fields are listed", () => {
    const md = str(consentMarkdownV2(CONSENT, { idMode: "anonymous" }));
    expect(section(md, "What we record about you")).toBe(ANON_SENTENCE);
    expect(md).not.toContain("Parent or guardian permission");
    const withAbout = section(str(consentMarkdownV2(CONSENT, { idMode: "anonymous", record: ["name", "spellings", "contact", "roll", "age", "gender"], recordOther: ["Hobbies"] })), "What we record about you")!;
    expect(withAbout).toBe(ANON_SENTENCE + " We will write down your age, your gender and hobbies, but not your name.");
    expect(withAbout).not.toContain("other names you use");
    expect(withAbout).not.toContain("phone number");
    expect(withAbout).not.toContain("code");
    expect(withAbout).not.toContain("sealed");
  });

  it("the guardian and young person sections come with minors yes or unsure, in every mode, and not otherwise", () => {
    for (const idMode of MODES) {
      for (const minors of ["yes", "unsure"]) {
        const md = str(consentMarkdownV2({ ...CONSENT, minors }, { idMode }));
        expect(md, `${idMode} ${minors}`).toContain("## Parent or guardian permission\n");
        expect(md, `${idMode} ${minors}`).toContain("## Young person's agreement\n");
      }
      for (const minors of ["no", "", undefined]) {
        const md = str(consentMarkdownV2({ ...CONSENT, minors }, { idMode }));
        expect(md, `${idMode} ${String(minors)}`).not.toContain("Parent or guardian");
        expect(md, `${idMode} ${String(minors)}`).not.toContain("Young person");
      }
    }
  });

  it("the guardian and young person sections have the wording, signature and date lines the spec asks for", () => {
    const md = str(consentMarkdownV2({ ...CONSENT, minors: "yes" }, { idMode: "codes" }));
    expect(section(md, "Parent or guardian permission")).toBe(
      `I am the parent or guardian of ${LINE} and I give permission for them to take part in this study.\n\nParent or guardian signature: ${LINE}  ${DATE}`);
    expect(section(md, "Young person's agreement")).toBe(
      `I have been told about this study in words I understand. I agree to take part. I know I can stop at any time, and nobody will be cross with me.\n\nYoung person's signature: ${LINE}  ${DATE}`);
    // the same underscores as v1's own signature lines
    expect(str(consentMarkdown(CONSENT))).toContain(`Participant signature: ${LINE}  ${DATE}`);
  });

  it("with the added sections taken out the text is v1's, for every mode and every input", () => {
    for (const [name, s] of CONSENT_INPUTS) {
      for (const idMode of MODES) {
        for (const record of [undefined, ["name", "age"]]) {
          const md = str(consentMarkdownV2(s, { idMode, record }));
          expect(withoutAdded(md), `${name} ${idMode}`).toBe(str(consentMarkdown(s)));
        }
      }
    }
  });

  it("student text that looks like a heading stays where the student put it, and `$` patterns are not expanded", () => {
    const md = str(consentMarkdownV2(CONSENT_TRICKY, { idMode: "codes", record: ["name"] }));
    const whatAt = md.indexOf("## What this study involves\n");
    const recAt = md.indexOf("## What we record about you\n");
    const volAt = md.indexOf("## Voluntary participation\nTaking part in this study is entirely voluntary. You may refuse");
    expect(whatAt).toBeGreaterThan(-1);
    expect(recAt).toBeGreaterThan(md.indexOf("## Benefits\n"));
    expect(recAt).toBeLessThan(volAt);
    expect(md).toContain("**Study title:** Study $& $1 $$\n");
    expect(md.match(/## What we record about you/g)).toHaveLength(1);
    expect(md.match(/## Parent or guardian permission/g)).toHaveLength(1);
    const guardianAt = md.indexOf("## Parent or guardian permission\n");
    expect(guardianAt).toBeGreaterThan(md.lastIndexOf("## Questions or complaints\n"));
    expect(guardianAt).toBeLessThan(md.lastIndexOf("## Consent\nI have read and understood the above, had the chance to ask questions"));
  });

  it("a recordOther label that looks like a placeholder is written as typed", () => {
    const label = "" + "0" + "";
    const md = str(consentMarkdownV2(CONSENT, { idMode: "codes", recordOther: [label] }));
    expect(md).toContain("We will write down " + label + ".");
    expect(md).toContain("**Study title:** " + CONSENT.title + "\n");
  });
});

describe("ethicsStatementV2", () => {
  const SENTENCES: Record<IdMode, string> = {
    codes: "Each participant was given a code; the list linking codes to names was kept separately, sealed under the researcher's passphrase.",
    pseudonyms: "Participants are referred to by made-up names; the list linking them to real names was kept separately, sealed under the researcher's passphrase.",
    anonymous: "No names were recorded, so responses cannot be linked to participants.",
  };
  it.each(ETHICS_INPUTS)("per mode, v1's text ends with the mode's sentence, %s", (_n, s) => {
    const v1 = ethicsStatement(s) as { heading: string; text: string };
    for (const idMode of MODES) {
      const r = ethicsStatementV2(s, { idMode, record: ["name"] }) as { heading: string; text: string };
      expect(r.heading).toBe("Ethical considerations");
      expect(r.text).toBe(v1.text + " " + SENTENCES[idMode]);
      expect(r.text.endsWith(SENTENCES[idMode])).toBe(true);
    }
  });
  it("a study with no human participants gets no sentence about identifying participants", () => {
    for (const idMode of MODES) expect(ethicsStatementV2(ETHICS({ status: "nohuman" }), { idMode })).toEqual(ethicsStatement(ETHICS({ status: "nohuman" })));
  });
});

describe("protocolMarkdownV2", () => {
  const SENTENCES: Record<IdMode, string> = {
    codes: "Each participant will be given a code (such as P001). The list linking codes to names will be kept separately, sealed under the researcher's passphrase, and destroyed after the study.",
    pseudonyms: "Each participant will be given a made-up name. The list linking made-up names to real names will be kept separately, sealed under the researcher's passphrase, and destroyed after the study.",
    anonymous: "No names will be recorded, so responses cannot be linked to participants.",
  };
  it("the line is there only when a mode is set, and sits after the data management plan, before the references", () => {
    for (const [name, o] of PROTO_INPUTS) {
      const v1 = protocolMarkdown(o) as string;
      expect(v1, name).not.toContain("How participants are identified");
      for (const idMode of MODES) {
        const md = protocolMarkdownV2(o, { idMode })!;
        const line = "**How participants are identified:** " + SENTENCES[idMode];
        expect(md, `${name} ${idMode}`).toContain("\n\n" + line + "\n\n## References\n[add citations from the Citation Manager]\n");
        expect(md.indexOf("## Data management plan\n"), `${name} ${idMode}`).toBeLessThan(md.indexOf(line));
        expect(md.replace(line + "\n\n", ""), `${name} ${idMode}`).toBe(v1);
        expect(md.match(/How participants are identified/g), `${name} ${idMode}`).toHaveLength(1);
      }
    }
  });
});

describe("ecMinorsNoteV2", () => {
  const NEW = "If you list people under 18, only you can open the list. You still need a parent's permission and their own agreement before you record anything about them.";
  it("replaces v1's last sentence and keeps the rest", () => {
    for (const m of ["yes", "unsure"]) {
      const v1 = ecMinorsNote(m);
      const v2 = ecMinorsNoteV2(m);
      expect(v2.endsWith(NEW)).toBe(true);
      expect(v2).not.toContain("Appuscholar is for adults");
      expect(v2).not.toContain("does not collect children's data");
      const old = " Appuscholar is for adults and does not collect children's data itself.";
      expect(v1.endsWith(old)).toBe(true);
      expect(v2).toBe(v1.slice(0, -old.length) + " " + NEW);
    }
    expect(ecMinorsNoteV2("unsure").startsWith("Settle this before you collect data. ")).toBe(true);
    expect(ecMinorsNoteV2("yes").startsWith("Participants under 18 usually need")).toBe(true);
  });
});
