import { MARK, seeded } from "./common";

/**
 * Data too big to commit, made by the test at run time (spec section 11).
 *
 * hugeRows is tools-b.md row 2's `messy.csv`: a first line `group,score`, then `n` lines such as `<group>,12.5`, two of which hold a third value, so the app leaves them out
 * and names their line numbers (5002 and 15002, counting the header as line 1). The two groups are the MARK and a letter, so that every row of it can be found in anything
 * that was stored or sent. There is no line break after the last line, so a table of 20,000 rows has 20,001 lines.
 *
 * hugeWords is tools-e.md row 5's long text: `n` words of nonsense, in one run of text, each built from a few syllables. The MARK is its first and its last word, and
 * `inside`, when given, stands whole in the middle (its words are part of the `n`). The Closeness check on it, against the papers of the shelf, finds `inside` and little else.
 */

/** The lines, counting the header as line 1, that hold a third value (tools-b.md row 2: "two lines inside that have a third value"). */
export const RAGGED_LINES: readonly number[] = [5_002, 15_002];

export function hugeRows(n = 20_000): string {
  const rand = seeded(5_002);
  const lines = ["group,score"];
  for (let i = 0; i < n; i++) {
    const a = i % 2 === 0;
    const group = `${MARK}-${a ? "A" : "B"}`;
    const score = ((a ? 12.5 : 9.1) + (rand() + rand() + rand() - 1.5) * 4).toFixed(1);
    lines.push(RAGGED_LINES.includes(i + 2) ? `${group},12,7` : `${group},${score}`);
  }
  return lines.join("\n");
}

const SYLLABLES = "ba be bi bo bu ka ke ki ko ku la le li lo lu ma me mi mo mu na ne ni no nu ra re ri ro ru sa se si so su ta te ti to tu va ve vi vo vu za ze zi zo zu dra gle pri stu".split(" ");
const wordCountOf = (s: string): number => s.split(/\s+/).filter(Boolean).length;

export function hugeWords(n = 50_000, inside?: string): string {
  const rand = seeded(50_000);
  const middle = inside?.trim() ?? "";
  const filler = n - 2 - wordCountOf(middle);
  if (filler < 0) throw new Error(`QA hugeWords: ${n} words cannot hold the MARK twice and a text of ${wordCountOf(middle)} words.`);
  const word = (): string => {
    let w = "";
    for (let k = 2 + Math.floor(rand() * 3); k > 0; k--) w += SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
    return w;
  };
  const run = (count: number): string[] => Array.from({ length: count }, word);
  const before = Math.floor(filler / 2);
  return [MARK, ...run(before), ...(middle ? [middle] : []), ...run(filler - before), MARK].join(" ");
}
