import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * Task 2's data intake (v1 9348-9371: statsSplitLine and statsParseText) on the hand-written corpus in corpus.json, `[{ id, text }]`. The corpus is the one input a person writes; every
 * `out` below is v1's own.
 * - `cases`: `{ id, text, out }`, `out` being v1's `statsParseText(text)` (null for a text with no line that holds more than white space).
 * - `split`: `{ line, delim, out }`, v1's `statsSplitLine(line, delim)` for every line of the entries in SPLIT_IDS (the text split as statsParseText splits it, on CRLF, CR or LF), each with
 *   a comma and a tab as the delimiter.
 */
export const SPLIT_IDS = ["quoted-comma", "doubled-quote", "unterminated-quote"];
const DELIMS = [",", "\t"];

type Entry = { id: string; text: string };

export const intake: Engine = {
  name: "intake",
  async capture(v1, { check }) {
    const corpus = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8")) as Entry[];
    const ids = new Set<string>();
    for (const e of corpus) {
      if (ids.has(e.id)) throw new Error(`intake: corpus.json has the id ${e.id} twice`);
      if (typeof e.text !== "string") throw new Error(`intake: ${e.id} has no text`);
      ids.add(e.id);
    }
    const cases = corpus.map(({ id, text }) => ({ id, text, out: v1.call<unknown>("statsParseText", text) }));
    const split = SPLIT_IDS.flatMap((id) => {
      const e = corpus.find((c) => c.id === id);
      if (!e) throw new Error(`intake: corpus.json has no ${id}`);
      return e.text.split(/\r\n|\r|\n/).flatMap((line) => DELIMS.map((delim) => ({ line, delim, out: v1.call<string[]>("statsSplitLine", line, delim) })));
    });
    return [writeFixture("intake", "cases", { cases, split }, v1, check)];
  },
};
