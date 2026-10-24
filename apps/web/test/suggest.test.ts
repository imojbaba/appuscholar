import { describe, expect, it } from "vitest";
import type { HomeFacts } from "@/lib/frame/homeFacts";
import { suggestNext } from "@/lib/frame/suggest";

const facts = (f: Partial<HomeFacts> = {}): HomeFacts => ({
  question: "Does peer tutoring help?", people: "", time: "", limits: "", field: "", verdict: "Go ahead.", checked: true, readText: "",
  kept: 0, read: 0, highlights: 0, cards: 0, draftWords: 0, ...f
});

const SUGGEST_CASES: Array<[string, HomeFacts, string, { stage: string; tab?: string }]> = [
  ["no question asks for one", facts({ question: "" }), "next_question", { stage: "idea" }],
  ["a question of spaces is no question", facts({ question: "   ", verdict: null, checked: false }), "next_question", { stage: "idea" }],
  ["no question wins over everything else", facts({ question: "", kept: 5, read: 5, cards: 5 }), "next_question", { stage: "idea" }],
  ["a question with no read asks for the feasibility read", facts({ verdict: null, checked: false }), "next_feasibility", { stage: "idea" }],
  ["no read wins over kept papers", facts({ verdict: null, checked: false, kept: 4 }), "next_feasibility", { stage: "idea" }],
  ["a read that did not parse is checked: no second check, on to Find", facts({ verdict: null, checked: true, readText: "Looks fine." }), "next_find", { stage: "lit", tab: "find" }],
  ["a read with no verdict line is checked too", facts({ verdict: null, checked: true, kept: 1, read: 1 }), "next_write", { stage: "writing" }],
  ["nothing kept goes to Find", facts(), "next_find", { stage: "lit", tab: "find" }],
  ["one kept, none read: read it", facts({ kept: 1 }), "next_read", { stage: "lit", tab: "reading" }],
  ["one kept and read: not enough to compare, so write", facts({ kept: 1, read: 1 }), "next_write", { stage: "writing" }],
  ["five kept, two read: read one more", facts({ kept: 5, read: 2 }), "next_read", { stage: "lit", tab: "reading" }],
  ["five kept, three read, one card: compare", facts({ kept: 5, read: 3, cards: 1 }), "next_compare", { stage: "lit", tab: "compare" }],
  ["two kept, both read, no cards: compare", facts({ kept: 2, read: 2 }), "next_compare", { stage: "lit", tab: "compare" }],
  ["two cards is enough: write", facts({ kept: 5, read: 3, cards: 2 }), "next_write", { stage: "writing" }],
  ["more read than three is fine", facts({ kept: 8, read: 6, cards: 3 }), "next_write", { stage: "writing" }]
];

describe("suggestNext", () => {
  it.each(SUGGEST_CASES)("suggestNext: %s", (_name, f, key, to) => { expect(suggestNext(f)).toMatchObject({ key, to }); });

  it("next_read says how many more to read: min(3, kept) less read", () => {
    expect(suggestNext(facts({ kept: 5, read: 1 })).vars).toEqual({ n: 2 });
    expect(suggestNext(facts({ kept: 2, read: 0 })).vars).toEqual({ n: 2 });
    expect(suggestNext(facts({ kept: 1, read: 0 })).vars).toEqual({ n: 1 });
  });

  it("only next_read carries vars", () => {
    for (const f of [facts({ question: "" }), facts({ verdict: null, checked: false }), facts(), facts({ kept: 2, read: 2 }), facts({ kept: 2, read: 2, cards: 2 })]) expect(suggestNext(f).vars).toBeUndefined();
  });
});
