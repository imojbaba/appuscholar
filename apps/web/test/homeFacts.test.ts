import { describe, expect, it } from "vitest";
import type { ApNotes, IdeaIntake, ShelfIndex } from "@/lib/blobs/kinds";
import { homeFacts } from "@/lib/frame/homeFacts";

const READ = "Topic: High. A.\nAccess: Medium. B.\nTime: Low. C.\nVerdict: Proceed with these modifications.";
const idea: IdeaIntake = { topic: "Peer tutoring and maths anxiety", resources: "Year 9 at two schools", timeframe: "One term", constraints: "School approval", read: { text: READ, at: "2026-10-21T10:00:00.000Z" } };
const shelf = (id: string, title: string): ShelfIndex[number] => ({ id, title, file: id + ".pdf", size: 1, added: "2026-10-01", total: 10, kept: 10 });
const note = (n: Partial<ApNotes[string]> = {}): ApNotes[string] => ({ stages: {}, card: {}, ...n });
const none = { idea: null, citations: null, shelfIndex: null, apNotes: null };

describe("homeFacts", () => {
  it("nothing stored gives empty facts, the field and the draft words", () => {
    expect(homeFacts(none, 0, "Education")).toEqual({ question: "", people: "", time: "", limits: "", field: "Education", verdict: null, kept: 0, read: 0, highlights: 0, cards: 0, draftWords: 0 });
    expect(homeFacts(none, 120, "").draftWords).toBe(120);
  });

  it("the question card's facts are the intake's four fields, and the verdict comes from its read", () => {
    const f = homeFacts({ ...none, idea }, 0, "Education");
    expect(f).toMatchObject({ question: idea.topic, people: idea.resources, time: idea.timeframe, limits: idea.constraints, field: "Education", verdict: "Proceed with these modifications." });
  });

  it("no read, or a read that does not parse, is no verdict", () => {
    const { read: _r, ...noRead } = idea;
    expect(homeFacts({ ...none, idea: noRead }, 0, "").verdict).toBeNull();
    expect(homeFacts({ ...none, idea: { ...idea, read: { text: "Looks fine.", at: "x" } } }, 0, "").verdict).toBeNull();
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
