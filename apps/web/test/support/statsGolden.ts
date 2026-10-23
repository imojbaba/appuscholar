import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StatsForm, StatsTestKey } from "@appuscholar/core";

/** Core's golden fixtures of the Statistics lab (packages/core/test/golden/stats): v1 driven in jsdom on hand-written inputs, one file per test. */
const GOLDEN = join(__dirname, "../../../../packages/core/test/golden/stats");
export type GoldenCase = { id: string; test: StatsTestKey; csv: string; values?: Record<string, string>; ticked?: Record<string, string[]>; form: StatsForm; apa: string | null; toasts: string[] };
/** The corpus files, one per test (26), sorted. */
export const fixtureFiles = (): string[] => readdirSync(join(GOLDEN, "corpus")).filter((f) => f.endsWith(".json")).sort();
export const casesOf = (file: string): GoldenCase[] => (JSON.parse(readFileSync(join(GOLDEN, file), "utf8")) as { cases: GoldenCase[] }).cases;
