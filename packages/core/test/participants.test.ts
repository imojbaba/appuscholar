import { describe, it, expect } from "vitest";
import {
  buildMatcher, codeOf, EVERYDAY_NAMES, FIRST_NAMES, findNames, isEverydayName, normName, replaceFinds, suggestNames,
  type MatchPerson,
} from "../src/participants";

/**
 * The participant name matcher (spec §7): which spellings are looked for, what counts as a whole word, which finds are sure and which are asked about, the suggestions
 * for names that are not on the list, and replacing with the surroundings kept. It is v2's own engine, so there is no golden: these tests are its specification.
 */
const person = (id: string, name: string, spellings: string[] = [], over: Partial<MatchPerson> = {}): MatchPerson =>
  ({ id, code: codeOf(Number(id.slice(1))), name, spellings, everyday: [], ...over });
const PRIYA = person("p1", "Priya Sharma", ["Priya"]);
const NONE = { speakerLabels: false, firstNames: false };

describe("codeOf", () => {
  it("pads to three digits and grows past 999", () => {
    expect(codeOf(1)).toBe("P001");
    expect(codeOf(42)).toBe("P042");
    expect(codeOf(1000)).toBe("P1000");
  });
});

describe("normName", () => {
  it("normalisesCaseSpacesApostrophesAndNfc", () => {
    expect(normName("  PRIYA   Sharma ")).toBe("priya sharma");
    expect(normName("R.K. Sharma")).toBe(normName("R. K. Sharma"));
    expect(normName("R.K. Sharma")).toBe("r k sharma");
    expect(normName("RK Sharma")).not.toBe(normName("R.K. Sharma"));
    expect(normName("D’Souza")).toBe("d'souza");
    expect(normName("प्रिया".normalize("NFD"))).toBe(normName("प्रिया"));
    expect(normName("Zoe\u0301")).toBe(normName("Zo\u00e9"));
  });
  it("does not depend on the machine's locale (a Turkish dotless i is not made)", () => {
    expect(normName("PRIYA")).toBe("priya");
  });
});

describe("findNames", () => {
  it("wholeWordsOnly", () => {
    const m = buildMatcher([PRIYA]);
    expect(findNames("Priya's book", m)).toEqual([{ start: 0, end: 5, text: "Priya", personIds: ["p1"], kind: "sure" }]);
    expect(findNames("Priya-ji came", m).map((f) => f.text)).toEqual(["Priya"]);
    expect(findNames("Priyanka came", m)).toEqual([]);
    expect(findNames("PRIYA said", m).map((f) => f.text)).toEqual(["PRIYA"]);
    expect(findNames("Mrs Priya.", m).map((f) => f.text)).toEqual(["Priya"]);
    expect(findNames("Anu-Priya", m)).toHaveLength(1);
    expect(findNames("Priya2 and 2Priya", m)).toEqual([]);
  });

  it("longestFirst", () => {
    const m = buildMatcher([PRIYA]);
    const f = findNames("Priya Sharma and Priya", m);
    expect(f.map((x) => x.text)).toEqual(["Priya Sharma", "Priya"]);
    expect(f.map((x) => x.personIds)).toEqual([["p1"], ["p1"]]);
    expect(f.map((x) => [x.start, x.end])).toEqual([[0, 12], [17, 22]]);
  });

  it("finds never overlap and scanning goes on after the end of a find", () => {
    const m = buildMatcher([person("p1", "Anu Priya"), person("p2", "Priya Rao")]);
    const f = findNames("Anu Priya Rao", m);
    expect(f.map((x) => x.text)).toEqual(["Anu Priya"]);
  });

  it("devanagariMarks", () => {
    const m = buildMatcher([person("p1", "प्रिया शर्मा", ["प्रिया"])]);
    expect(findNames("प्रिया की माँ", m).map((f) => f.text)).toEqual(["प्रिया"]);
    expect(findNames("प्रियांका", m)).toEqual([]);
    expect(findNames("प्रिया शर्मा ने कहा", m).map((f) => f.text)).toEqual(["प्रिया शर्मा"]);
  });

  it("everydayNeedsCapital", () => {
    const m = buildMatcher([person("p1", "Will Thomas", ["Will"], { everyday: ["Will"] })]);
    expect(findNames("I will go", m)).toEqual([]);
    expect(findNames("Will said", m)).toEqual([{ start: 0, end: 4, text: "Will", personIds: ["p1"], kind: "ask", why: "everyday" }]);
    expect(findNames("WILL said", m)).toHaveLength(1);
    expect(findNames("I met will thomas", m).map((f) => [f.text, f.kind])).toEqual([["will thomas", "sure"]]);
    const asha = buildMatcher([person("p1", "आशा", ["आशा"], { everyday: ["आशा"] })]);
    const f = findNames("आशा है", asha);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "ask", why: "everyday" });
  });

  it("a spelling the built-in everyday names know is asked about without being ticked", () => {
    const m = buildMatcher([person("p1", "Kiran Rao", ["Kiran"])]);
    expect(findNames("the kiran of light", m)).toEqual([]);
    expect(findNames("Kiran came", m)[0]).toMatchObject({ kind: "ask", why: "everyday" });
    expect(findNames("Kiran Rao came", m)[0]).toMatchObject({ kind: "sure" });
  });

  it("sharedShortNameIsAsk", () => {
    const m = buildMatcher([person("p1", "Priya Sharma", ["Priya"]), person("p2", "Priya Rao", ["Priya"])]);
    expect(findNames("Priya came", m)).toEqual([{ start: 0, end: 5, text: "Priya", personIds: ["p1", "p2"], kind: "ask", why: "shared" }]);
    expect(findNames("Priya Rao came", m)[0]).toMatchObject({ kind: "sure", personIds: ["p2"] });
  });

  it("shared wins over everyday when both apply, and the capital is still needed", () => {
    const m = buildMatcher([person("p1", "Will Thomas", ["Will"], { everyday: ["Will"] }), person("p2", "Will Rao", ["Will"])]);
    expect(findNames("Will came", m)[0]).toMatchObject({ kind: "ask", why: "shared", personIds: ["p1", "p2"] });
    expect(findNames("I will come", m)).toEqual([]);
  });

  it("surnameAloneNotLooked", () => {
    expect(findNames("Sharma (2019) found", buildMatcher([PRIYA]))).toEqual([]);
  });

  it("looks for the name itself as well as the spellings, for withdrawn people too", () => {
    const m = buildMatcher([person("p1", "Imran Khan", [], { withdrawn: { on: "2026-10-15", data: "remove" } })]);
    expect(findNames("Imran Khan withdrew", m).map((f) => f.text)).toEqual(["Imran Khan"]);
  });

  it("treats case, spaces, dots and curly apostrophes as the same, and reports the original text", () => {
    const m = buildMatcher([person("p1", "R K Sharma", ["D'Souza"])]);
    const text = "R.K.  Sharma, r. k. SHARMA and Mr D’Souza";
    expect(findNames(text, m).map((f) => text.slice(f.start, f.end))).toEqual(["R.K.  Sharma", "r. k. SHARMA", "D’Souza"]);
    expect(findNames("RK Sharma", m)).toEqual([]);
  });

  it("gives positions in the original text when it is not in NFC or changes length in lower case", () => {
    const m = buildMatcher([person("p1", "Zo\u00e9 Rao", ["Zo\u00e9"])]);
    const text = "Zoe\u0301 said hi to Zo\u00e9 and Zoe\u0301.";
    const f = findNames(text, m);
    expect(f.map((x) => text.slice(x.start, x.end))).toEqual(["Zoe\u0301", "Zo\u00e9", "Zoe\u0301"]);
    const istanbul = buildMatcher([person("p1", "Irfan")]);
    const t2 = "\u0130\u0130\u0130 then Irfan"; // each capital dotted I is two code units in lower case
    expect(findNames(t2, istanbul).map((x) => [x.start, x.text])).toEqual([[9, "Irfan"]]);
  });

  it("finds nothing for an empty list or a name that is only dots", () => {
    expect(findNames("Priya", buildMatcher([]))).toEqual([]);
    expect(findNames("Priya", buildMatcher([person("p1", "...", [" "])]))).toEqual([]);
  });

  it("finds a name written across a line break, and keeps hyphens and apostrophes inside a spelling", () => {
    const m = buildMatcher([person("p1", "Anne-Marie O'Brien")]);
    const text = "Anne-Marie\nO\u2019Brien said that Anne-Marie  O'Brien and Anne Marie O'Brien";
    expect(findNames(text, m).map((f) => text.slice(f.start, f.end))).toEqual(["Anne-Marie\nO\u2019Brien", "Anne-Marie  O'Brien"]);
  });

  it("treats a spelling with regex characters as plain text", () => {
    const m = buildMatcher([person("p1", "A+B (Jr)", ["C*D"])]);
    expect(findNames("see A+B (Jr) and C*D", m).map((f) => f.text)).toEqual(["A+B (Jr)", "C*D"]);
  });

  it("fastOnLongText", () => {
    const syl = ["ka", "ra", "mi", "su", "de", "vi", "na", "ho"];
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
    const people: MatchPerson[] = [];
    for (let i = 0; i < 200; i++) {
      const first = cap(`${syl[i % 8]}${syl[(i >> 3) % 8]}${syl[(i >> 6) % 8]}`);
      people.push(person(`p${i + 1}`, `${first} Rao`, [first]));
    }
    const m = buildMatcher(people);
    const words = ["the", "student", "said", "that", "she", "felt", "very", "tired", "after", "exams", "and", "her", "friend", "Kakaka", "Ramisu", "Devina", "Hohoho", "Rao", "Zed"];
    let seed = 7;
    const parts: string[] = [];
    for (let i = 0; i < 50_000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      parts.push(words[(seed >> 8) % words.length] ?? "x");
    }
    const text = parts.join(" ");
    expect(findNames(text, m).length).toBeGreaterThan(1000);
    // best of three, so a cold JIT does not fail it (controller ruling R2)
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      findNames(text, m);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(300);
  });
});

describe("suggestNames", () => {
  const m = buildMatcher([]);

  it("suggestions: a speaker label that is not a role word", () => {
    const f = suggestNames("Meena: I came.\nInterviewer: Why?", m, [], { speakerLabels: true, firstNames: false });
    expect(f).toEqual([{ start: 0, end: 5, text: "Meena", personIds: [], kind: "suggest", why: "speaker" }]);
  });

  it("suggestions: a capitalised word on the first-names list", () => {
    const f = suggestNames("Then Rahul left.", m, [], { speakerLabels: false, firstNames: true });
    expect(f).toEqual([{ start: 5, end: 10, text: "Rahul", personIds: [], kind: "suggest", why: "first-name" }]);
    expect(suggestNames("then rahul left", m, [], { speakerLabels: false, firstNames: true })).toEqual([]);
    expect(suggestNames("Then Rahul's bag", m, [], { speakerLabels: false, firstNames: true })).toHaveLength(1);
    expect(suggestNames("Then Rahulji left", m, [], { speakerLabels: false, firstNames: true })).toEqual([]);
  });

  it("does nothing unless the option is on", () => {
    expect(suggestNames("Meena: Then Rahul left.", m, [], NONE)).toEqual([]);
  });

  it("skips words the student said are not names (any case)", () => {
    expect(suggestNames("Then Rahul left.", m, ["rahul"], { speakerLabels: false, firstNames: true })).toEqual([]);
    expect(suggestNames("Meena: Hi", m, ["Meena"], { speakerLabels: true, firstNames: false })).toEqual([]);
  });

  it("never suggests the role words or a code as a speaker", () => {
    const text = ["Interviewer: a", "Researcher: b", "Moderator: c", "Participant: d", "Respondent: e", "Q: f", "A: g", "P001: h", "P1234: i", "INTERVIEWER: j"].join("\n");
    expect(suggestNames(text, m, [], { speakerLabels: true, firstNames: false })).toEqual([]);
  });

  it("takes a speaker label of one to three capitalised words from the start of a line only", () => {
    const text = "Meena Rao: one\n  Dr Anil Kumar: two\nSo Meena Rao Iyer Pillai: three\nthen: four\nHe said: five";
    const f = suggestNames(text, m, [], { speakerLabels: true, firstNames: false });
    expect(f.map((x) => text.slice(x.start, x.end))).toEqual(["Meena Rao", "Dr Anil Kumar"]);
  });

  it("a word in findNames' result is never also suggested", () => {
    const withRahul = buildMatcher([person("p1", "Rahul Verma", ["Rahul"])]);
    const text = "Rahul: hello\nThen Rahul left, and Meena too.";
    expect(findNames(text, withRahul).map((f) => f.text)).toEqual(["Rahul", "Rahul"]);
    const f = suggestNames(text, withRahul, [], { speakerLabels: true, firstNames: true });
    expect(f.map((x) => x.text)).toEqual(["Meena"]);
  });

  it("a name that is both a speaker label and a first name is one suggestion, a speaker", () => {
    const f = suggestNames("Meena: hello", m, [], { speakerLabels: true, firstNames: true });
    expect(f).toHaveLength(1);
    expect(f[0]?.why).toBe("speaker");
  });

  it("reads an accented Latin name as the plain one, composed or not", () => {
    const f = suggestNames("Then Jos\u00e9 left and Jose\u0301 too.", m, [], { speakerLabels: false, firstNames: true });
    expect(f.map((x) => x.text)).toEqual(["Jos\u00e9", "Jose\u0301"]);
  });

  it("does not suggest Devanagari words, other capitalised words, everyday names or surnames", () => {
    const f = suggestNames("Then प्रिया left. London is far. Will you go? Sharma said.", m, [], { speakerLabels: false, firstNames: true });
    expect(f).toEqual([]);
  });
});

describe("replaceFinds", () => {
  it("replaceKeepsSurroundings", () => {
    const m = buildMatcher([PRIYA]);
    expect(replaceFinds("Priya's book", findNames("Priya's book", m), () => "P001")).toBe("P001's book");
  });
  it("replaces each find, null keeps the text, and leaves the rest alone", () => {
    const m = buildMatcher([PRIYA, person("p2", "Rahul Verma")]);
    const text = "Priya met Rahul Verma. Priya left.";
    const finds = findNames(text, m);
    expect(replaceFinds(text, finds, (f) => (f.personIds[0] === "p1" ? "P001" : null))).toBe("P001 met Rahul Verma. P001 left.");
    expect(replaceFinds(text, [], () => "x")).toBe(text);
    expect(replaceFinds(text, finds, () => "")).toBe(" met .  left.");
  });
  it("replaces suggestions and finds together, in any order", () => {
    const m = buildMatcher([PRIYA]);
    const text = "Priya and Rahul";
    const all = [...suggestNames(text, m, [], { speakerLabels: false, firstNames: true }), ...findNames(text, m)];
    expect(replaceFinds(text, all, (f) => (f.kind === "suggest" ? "[name]" : "P001"))).toBe("P001 and [name]");
  });
});

describe("dataLists", () => {
  it("holds the everyday names, the first names, and keeps them apart", () => {
    for (const w of ["asha", "kiran", "pooja", "raja", "rani", "dev", "joy", "rose", "will", "hope", "sunny", "bill", "mark"]) expect(EVERYDAY_NAMES).toContain(w);
    expect(FIRST_NAMES.size).toBeGreaterThanOrEqual(1000);
    for (const w of EVERYDAY_NAMES) expect(normName(w)).toBe(w);
    for (const w of FIRST_NAMES) expect(normName(w)).toBe(w);
    expect(new Set(EVERYDAY_NAMES).size).toBe(EVERYDAY_NAMES.length);
    expect([...FIRST_NAMES].filter((w) => EVERYDAY_NAMES.includes(w))).toEqual([]);
    for (const w of ["priya", "rahul", "meena"]) expect(FIRST_NAMES.has(w)).toBe(true);
    expect(isEverydayName("Will")).toBe(true);
    expect(isEverydayName("priya")).toBe(false);
  });
});
