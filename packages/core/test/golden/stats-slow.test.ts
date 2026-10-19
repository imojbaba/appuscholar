import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import type { StatsResult } from "../../src/stats-core";
import type { CapturedRun } from "./stats/drive";
import { readCorpus } from "./stats/capture";
import { goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";
import { SLOW_CASES, SLOW_CASE_MS, expectSameAsScipy, expectSameAsV1, runCase } from "./stats/check";
import type { RefCase } from "./stats/check";

/**
 * The Statistics Lab cases too slow for the generic loops (stats/check.ts, SLOW_CASES), each run once in this file's own worker and held both to v1's fixture (as stats.test.ts holds
 * every other case) and to scipy-reference.json (as stats-scipy.test.ts does). The loops skip exactly these ids and test that they did; this file tests that each id is still in its
 * corpus, its fixture and the reference, so a slow case cannot vanish from all three.
 */
const ref = JSON.parse(readFileSync(new URL("./stats/scipy-reference.json", import.meta.url), "utf8")) as { cases: RefCase[] };

for (const id of SLOW_CASES) {
  describe(`stats (slow): ${id}`, () => {
    const file = id.split("-")[0]!;
    const fx = readFixture<{ cases: CapturedRun[] }>("stats", file);
    const c = fx.cases.find((x) => x.id === id);
    const rc = ref.cases.find((x) => x.id === id);
    let r: StatsResult;
    beforeAll(() => { if (c) r = runCase(c); }, SLOW_CASE_MS);
    it("is in its corpus, its fixture and the scipy reference", () => {
      expect(readCorpus(`${file}.json`).some((x) => x.id === id)).toBe(true);
      expect(c, id).toBeDefined();
      expect(rc, id).toBeDefined();
      expect(rc!.ref, `${id}: the slow cases are ones v1 and scipy both compute`).not.toBeNull();
    });
    it("matches v1", () => expectSameAsV1(c!, r, goldenMode(fx)));
    it("vs scipy", () => expectSameAsScipy(rc!, r, true));
  });
}
