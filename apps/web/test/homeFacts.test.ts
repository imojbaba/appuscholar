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
    expect(homeFacts(none, 0, "Education")).toEqual({ question: "", people: "", time: "", limits: "", field: "Education", verdict: null, checked: false, readText: "", kept: 0, read: 0, highlights: 0, cards: 0, draftWords: 0 });
    expect(homeFacts(none, 120, "").draftWords).toBe(120);
  });

  it("the question card's facts are the intake's four fields, and the verdict comes from its read", () => {
    const f = homeFacts({ ...none, idea }, 0, "Education");
    expect(f).toMatchObject({ question: idea.topic, people: idea.resources, time: idea.timeframe, limits: idea.constraints, field: "Education", verdict: "Proceed with these modifications.", checked: true, readText: READ });
  });

  it("no read is not checked; a stored read that does not parse is checked, with no verdict and its text as it came", () => {
    const { read: _r, ...noRead } = idea;
    expect(homeFacts({ ...none, idea: noRead }, 0, "")).toMatchObject({ verdict: null, checked: false, readText: "" });
    expect(homeFacts({ ...none, idea: { ...idea, read: { text: "Looks fine.", at: "x" } } }, 0, "")).toMatchObject({ verdict: null, checked: true, readText: "Looks fine." });
  });

  it("kept is the Reading list's length: the library's entries on the reading list, and the PDFs no kept paper took (ruling B2-R23)", () => {
    expect(homeFacts({ ...none, citations: [{ title: "a" }, { title: "b" }, {}] }, 0, "").kept).toBe(3);
    const lib = [{ title: "a", pid: "ka" }, { title: "b", pid: "kb", rl: false }, { title: "c", pid: "kc", rl: true }];
    // b is in the library only; a has a PDF; one more PDF is no kept paper's; a second PDF of a is a row of its own.
    const index = [shelf("s1", "A pdf"), shelf("s2", "Loose pdf"), shelf("s3", "A again")].map((e, i) => ({ ...e, pid: ["ka", "kz", "ka"][i]! }));
    expect(homeFacts({ ...none, citations: lib, shelfIndex: index }, 0, "").kept).toBe(4);
    expect(homeFacts({ ...none, citations: lib }, 0, "").kept).toBe(2);
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

  it("a note kept under p:<pid> is the shelf paper with that pid, counted once; the old note that moved there is not counted again (Task 17)", () => {
    const f = homeFacts({
      ...none,
      shelfIndex: [{ ...shelf("s1", "One"), pid: "kone" }, shelf("s2", "Two")],
      apNotes: {
        aOne: note({ title: "One", card: { strengths: "clear sample" }, movedTo: "p:kone" }),
        "p:kone": note({ title: "One", pid: "kone", card: { strengths: "clear sample" } }),
        aThree: note({ title: "Three", stages: { design: { mine: "a cohort" } }, movedTo: "p:kthree" }),
        // A kept paper that is not on the reading list: its own note is one more paper read.
        "p:kthree": note({ title: "Three", pid: "kthree", stages: { design: { mine: "a cohort" } } })
      }
    }, 0, "", { s1: 2 });
    expect(f.read).toBe(2); // s1 once, and the note of the paper that is not on the list
    expect(f.cards).toBe(1); // p:kone only: aOne moved there and is skipped
    expect(f.highlights).toBe(2);
  });

  it("a note the migration made only to hold a paper's cells is neither read nor a card", () => {
    const f = homeFacts({
      ...none,
      shelfIndex: [{ ...shelf("s1", "One"), pid: "kone" }],
      apNotes: { "p:kone": note({ title: "One", pid: "kone", cells: { Sample: "40 students" } }) }
    }, 0, "", {});
    expect(f).toMatchObject({ read: 0, cards: 0 });
  });

  it("a note that carries a pid joins by pid and not by title: two papers with one title stay two", () => {
    const f = homeFacts({
      ...none,
      shelfIndex: [{ ...shelf("s1", "Same title here"), pid: "kone" }, { ...shelf("s2", "Same title here"), pid: "ktwo" }],
      apNotes: { "p:ktwo": note({ title: "Same title here", pid: "ktwo", stages: { design: { mine: "words" } } }) }
    }, 0, "", { s1: 1 });
    // Only s1 is highlighted; the note belongs to s2, so it is its own read.
    expect(f.read).toBe(2);
  });
});
