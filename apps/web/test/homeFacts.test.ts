import { describe, expect, it } from "vitest";
import type { ApNotes, IdeaIntake, ShelfIndex } from "@/lib/blobs/kinds";
import { homeFacts } from "@/lib/frame/homeFacts";

const READ = "Topic: High. A.\nAccess: Medium. B.\nTime: Low. C.\nVerdict: Proceed with these modifications.";
const idea: IdeaIntake = {
  topic: "Peer tutoring and maths anxiety", who: "Year 9 at two schools", how: "A questionnaire before and after", resources: "The schools' consent", timeframe: "One term",
  constraints: "School approval", read: { text: READ, at: "2026-10-21T10:00:00.000Z" }
};
const shelf = (id: string, title: string): ShelfIndex[number] => ({ id, title, file: id + ".pdf", size: 1, added: "2026-10-01", total: 10, kept: 10 });
const note = (n: Partial<ApNotes[string]> = {}): ApNotes[string] => ({ stages: {}, card: {}, ...n });
const none = { idea: null, citations: null, shelfIndex: null, apNotes: null };

describe("homeFacts", () => {
  it("nothing stored gives empty facts, the field and the draft words", () => {
    expect(homeFacts(none, 0, "Education")).toEqual({
      question: "", who: "", how: "", time: "", have: "", ethics: "", answered: 0, field: "Education", verdict: null, checked: false, readText: "", kept: 0, read: 0, highlights: 0, cards: 0, draftWords: 0
    });
    expect(homeFacts(none, 120, "").draftWords).toBe(120);
  });

  it("the study card's facts are Shape your study's six parts (v1's four boxes keep their keys), with how many are answered, and the verdict comes from its read", () => {
    const f = homeFacts({ ...none, idea }, 0, "Education");
    expect(f).toMatchObject({
      question: idea.topic, who: "Year 9 at two schools", how: "A questionnaire before and after", time: idea.timeframe, have: idea.resources, ethics: idea.constraints, answered: 6,
      field: "Education", verdict: "Proceed with these modifications.", checked: true, readText: READ
    });
  });

  it("a part marked Not sure yet counts as answered; an empty one does not", () => {
    const f = homeFacts({ ...none, idea: { topic: "Q", resources: "", timeframe: "", constraints: "", unsure: ["how", "ethics"] } }, 0, "");
    expect(f.answered).toBe(3);
  });

  it("no read is not checked; a stored read that does not parse is checked, with no verdict and its text as it came", () => {
    const { read: _r, ...noRead } = idea;
    expect(homeFacts({ ...none, idea: noRead }, 0, "")).toMatchObject({ verdict: null, checked: false, readText: "" });
    expect(homeFacts({ ...none, idea: { ...idea, read: { text: "Looks fine.", at: "x" } } }, 0, "")).toMatchObject({ verdict: null, checked: true, readText: "Looks fine." });
  });

  it("kept is the library's length", () => {
    expect(homeFacts({ ...none, citations: [{ title: "a" }, { title: "b" }, {}] }, 0, "").kept).toBe(3);
  });

  it("read counts shelf papers with highlights and notes with stage or card text; highlights sums the counts; cards counts notes with a card field", () => {
    const f = homeFacts({
      ...none,
      shelfIndex: [shelf("s1", "One"), shelf("s2", "Two"), shelf("s3", "Three")],
      apNotes: {
        aOne: note({ title: "One", card: { strengths: "clear sample" } }), // the same paper as shelf s1: counted once
        aFour: note({ stages: { design: { mine: "a cohort" } } }),
        aFive: note({ stages: { design: { res: { reading: "x" } } } }),
        aSix: note({ stages: { design: { mine: "  " } }, card: { weak: "" } }), // only blanks: not read, no card
        aSeven: note({ card: { verdict: "useful" } })
      }
    }, 0, "", { s1: 2, s2: 0, s3: 4 });
    expect(f.highlights).toBe(6);
    expect(f.read).toBe(5); // s1 (with aOne), s3, aFour, aFive, aSeven
    expect(f.cards).toBe(2); // aOne, aSeven
  });

  it("without highlight counts, highlights are 0 and only notes count as read", () => {
    const f = homeFacts({ ...none, shelfIndex: [shelf("s1", "One")], apNotes: { aX: note({ card: { notes: "n" } }) } }, 0, "");
    expect(f).toMatchObject({ highlights: 0, read: 1, cards: 1 });
  });
});
