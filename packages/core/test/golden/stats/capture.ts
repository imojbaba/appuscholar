import { readdirSync, readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { FixtureStatus } from "../harness/fixture";
import { driveV1Stats } from "./drive";
import type { StatsCase } from "./drive";

/**
 * The Statistics Lab engine (v1 statsRunNow 12609-13457 and the frame around it), one engine for all 26 tests: for every `corpus/<test>.json` on disk, in sorted order, each case (an array of
 * StatsCase, hand-written inputs only) runs through v1's own form by driveV1Stats, and `stats/<test>.json` is written as `{ cases: CapturedRun[] }`. A later task adds a corpus file and
 * re-captures; nothing here changes.
 * - `tables.json` (and, under --emit, src/data/stats-tables.ts): STAT_TESTS (11750-11777) as v1 holds it.
 */
export function readCorpus(file: string): StatsCase[] {
  return JSON.parse(readFileSync(new URL(`./corpus/${file}`, import.meta.url), "utf8")) as StatsCase[];
}

export const corpusFiles = (): string[] => readdirSync(new URL("./corpus/", import.meta.url)).filter((f) => f.endsWith(".json")).sort();

export const stats: Engine = {
  name: "stats",
  async capture(v1, opts) {
    const out: FixtureStatus[] = [emitTables(v1, "stats", "stats-tables", { STAT_TESTS: v1.eval<unknown>("STAT_TESTS") }, opts)];
    const ids = new Set<string>();
    for (const file of corpusFiles()) {
      const corpus = readCorpus(file);
      for (const c of corpus) {
        if (ids.has(c.id)) throw new Error(`stats: the id ${c.id} is used twice`);
        if (typeof c.csv !== "string" || typeof c.test !== "string") throw new Error(`stats: ${c.id} needs a csv and a test`);
        ids.add(c.id);
      }
      const cases = corpus.map((c) => driveV1Stats(v1, c));
      out.push(writeFixture("stats", file.replace(/\.json$/, ""), { cases }, v1, opts.check));
    }
    return out;
  },
};
