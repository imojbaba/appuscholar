import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/** `n` characters of quotable text with no space, so the quote's trim() and whitespace collapse leave its length alone. */
const text = (n: number) => "abcdefghij".repeat(Math.ceil(n / 10)).slice(0, n);

/**
 * Strings for accItems (v1 2520): the numbers (thousands separators, percent, a leading dot, the Unicode minus), three citation
 * shapes, curly and straight quotes at 3 (below the 4-character floor), 4, 200 and 201 characters (above the 200-character
 * ceiling), a Hindi sentence, and three more that reach the quote clean-up, the apostrophe fold and the empty input.
 */
const ITEMS: Array<[id: string, s: string]> = [
  ["numbers-thousands-percent", "Of 1,200 students, 45% slept under 6.5 hours; 12,345.67 and 1,000,000 were counted, 0.45 of them 7%, and 1,234.5% of nothing."],
  ["leading-dot", "The correlation was r = .32, p < .05, not 0.32 or 32."],
  ["unicode-minus", "Scores fell from 28.4 to −3.5 points, a change of −12%."],
  ["citation-parenthesised", "Sleep loss predicted delay (Steel, 2007)."],
  ["citation-and-suffix", "As Steel and Lee (2007a) argued, delay is costly."],
  ["citation-et-al", "Findings agree with Rao et al., 2019, on this point."],
  ...[3, 4, 200, 201].flatMap((n): Array<[string, string]> => [
    [`quote-curly-${n}`, `He wrote “${text(n)}” in the margin.`],
    [`quote-straight-${n}`, `He wrote "${text(n)}" in the margin.`],
  ]),
  ["hindi-sentence", "शोधकर्ता ने लिखा “नींद की कमी” एक बड़ी समस्या है, और 120 छात्रों में से 45% ने इसे माना (शर्मा, 2019)।"],
  ["quote-clean-up", "She said “  The  Quick\nBrown  Fox  ” and 'single' marks are not quotes."],
  ["apostrophe-and-ampersand", "See O’Brien, 2015 and Kumar & Rao, 2021, and Müller (2018)."],
  ["empty", ""],
];

const ORIG = "Sleep loss predicted delay (Steel, 2007), r = .32 in 120 students, and “a reduced capacity to begin”.";
/**
 * The five pairs of core/test/accuracy.test.ts, then a pair with nine added items (the " and 1 more" tail), then a pair that drops items and adds none
 * (v1 2543-2545: for `continue` that still reads "unchanged and none was added", with `missing` not empty; `improve` and `expand` report only "Dropped from your text").
 */
const PAIRS: Array<[id: string, orig: string, res: string]> = [
  ["unchanged", ORIG, "Loss of sleep predicted delay (Steel, 2007), r = .32 among 120 students, and “a reduced capacity to begin”."],
  ["dropped-and-added", ORIG, "Sleep loss predicted delay (Steel, 2010) in 95 students."],
  ["added-only", "", "About 25% of diarists drop out (Rao et al., 2019)."],
  ["nothing-added", "", "Plain prose without figures."],
  ["ten-added", "", "1 2 3 4 5 6 7 8 9 10"],
  ["nine-added", "", "1 2 3 4 5 6 7 8 9"],
  ["dropped-only", ORIG, "Plain prose without figures."],
];
const KINDS = ["continue", "improve", "expand"] as const;

/** accItems and accCheck called directly on v1: strings in, v1's own objects out (the messages are plain English; v1 2533 builds them without t()). */
export const accuracy: Engine = {
  name: "accuracy",
  async capture(v1, { check }) {
    const items = ITEMS.map(([id, s]) => ({ id, s, out: v1.call("accItems", s) }));
    const checks = PAIRS.flatMap(([pair, orig, res]) => KINDS.map((kind) => ({ id: `${pair}/${kind}`, orig, res, kind, out: v1.call("accCheck", orig, res, kind) })));
    return [writeFixture("accuracy", "cases", { items, checks }, v1, check)];
  },
};
