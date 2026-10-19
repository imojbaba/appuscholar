import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expectGolden } from "./harness/compare";
import { emitTables, encodeSpecial, readFixture, writeFixture } from "./harness/fixture";
import type { V1 } from "./harness/v1";

type SmokeCase = { fn: string; args: unknown[]; out: unknown };
type Demo = { id: string; test: string; csv: string; sel: Record<string, string>; rev?: string; rrange?: string; apa: string; resultsText: string; resultsHtml: string; toasts: string[] };

describe("golden harness fixtures", () => {
  it("smoke: 20 pure v1 functions captured by direct call, header names the v1 build", () => {
    const fx = readFixture<{ cases: SmokeCase[] }>("smoke", "cases");
    expect(fx.v1.build).toBe("2026.10.13a");
    expect(fx.v1.lines).toBe(13699);
    expect(new Set(fx.cases.map(c => c.fn)).size).toBe(20);
    for (const fn of ["pFromT", "pFromF", "pFromChi", "pFromZ", "normalCDF", "gammaln", "betai", "gammaq", "erf", "stkShapiro", "stkPtukey", "stkQtukey", "stkExactMW", "pwPower", "pwSolveN", "accItems", "pdScanText", "provHash", "aiuClassify", "ccNorm"])
      expect(fx.cases.filter(c => c.fn === fn).length).toBeGreaterThanOrEqual(3);
    expectGolden(fx.cases.find(c => c.fn === "pFromT" && c.args[0] === 2.15 && c.args[1] === 21)?.out, 0.043360276354708106); // v1's computed p: within a relative 1e-12 (D-W1-16)
  });
  it("stats-demos: the 13 TG_DEMO datasets ran through statsRunNow and agree with the audit's capture", () => {
    const fx = readFixture<{ demos: Demo[] }>("stats-demos", "demos");
    const ids = fx.demos.map(d => d.id);
    expect(ids).toEqual(["ttest1", "ttestInd", "mannwhitney", "ttestPaired", "wilcoxon", "anova1", "kruskal", "pearson", "spearman", "regression", "chisq", "gof", "alpha"]);
    const audit = JSON.parse(readFileSync(new URL("./stats-demos/audit-capture-2026-10-17.json", import.meta.url), "utf8")) as Record<string, { apa: string; res: string }>;
    for (const d of fx.demos) { expect(d.apa.length).toBeGreaterThan(40); expect(d.apa).toBe(audit[d.id]?.apa); expect(d.toasts).toEqual([]); }
    // The audit kept the first 900 characters of the same collapsed text.
    for (const d of fx.demos) expect(d.resultsText.slice(0, 900)).toBe(audit[d.id]?.res);
    // Input beside output: only alpha reverses an item (TG_DEMO, v1 12431), so its record must carry both inputs to be replayable.
    expect(fx.demos.filter(d => d.rev !== undefined || d.rrange !== undefined).map(d => [d.id, d.rev, d.rrange])).toEqual([["alpha", "q6", "1-5"]]);
  });
  it("special numbers survive the fixture encoding", async () => {
    const { encodeSpecial, decodeSpecial } = await import("./harness/fixture");
    const v = { a: NaN, b: -0, c: Infinity, d: -Infinity, e: [1, NaN], f: "x" };
    const back = decodeSpecial(JSON.parse(JSON.stringify(encodeSpecial(v)))) as typeof v;
    expect(back).toEqual(v); expect(Object.is(back.b, -0)).toBe(true);
  });
  it("only JSON data is encoded: a plain object from another realm passes, a Promise or a Date is refused with its path", () => {
    expect(encodeSpecial(runInNewContext("({ out: [1, NaN, { k: null }] })"))).toEqual({ out: [1, { $n: "NaN" }, { k: null }] });
    expect(() => encodeSpecial({ cases: [{ out: 1 }, { out: Promise.resolve(1) }] })).toThrow("$.cases[1].out is not JSON data (Promise)");
    expect(() => encodeSpecial({ when: new Date(0) })).toThrow("$.when is not JSON data (Date)");
  });
});

describe("writeFixture and emitTables", () => {
  // Both read only the build stamp of the v1 handle. An absolute engine or target resolves to itself, so these files go to a temporary directory, never into the repo.
  const v1 = { build: "2026.10.13a", sha256: "e3ad7404efcc2684144cc86a8d9bc8cd607e98b3580283c769fe00e18b5fcb47", lines: 13699 } as unknown as V1;
  const inTempDir = (run: (dir: string, log: ReturnType<typeof vi.spyOn>) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "golden-harness-"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try { run(dir, log); } finally { log.mockRestore(); vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }); }
  };

  it("a re-capture on a later day with the same values is same and keeps its date; --check never writes and names the first differing path", () => inTempDir((dir, log) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 17, 12));
    expect(writeFixture(dir, "cases", { cases: [1, NaN] }, v1, false)).toBe("written");
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    expect(writeFixture(dir, "cases", { cases: [1, NaN] }, v1, true)).toBe("same");
    expect(writeFixture(dir, "cases", { cases: [1, NaN] }, v1, false)).toBe("same");
    const before = readFileSync(join(dir, "cases.json"), "utf8");
    expect(writeFixture(dir, "cases", { cases: [1, 2] }, v1, true)).toBe("differs");
    expect(log).toHaveBeenLastCalledWith(expect.stringMatching(/cases\.json differs at \$\.cases\[1\]: fixture \{"\$n":"NaN"\}, v1 now 2$/));
    expect(readFileSync(join(dir, "cases.json"), "utf8")).toBe(before);
    expect(readFixture<{ cases: number[] }>(dir, "cases")).toEqual({ engine: dir, captured: "2026-10-17", node: process.version, platform: process.platform, arch: process.arch, v1: { build: "2026.10.13a", sha256: v1.sha256, lines: 13699 }, cases: [1, NaN] });
    expect(Object.keys(JSON.parse(readFileSync(join(dir, "cases.json"), "utf8")) as object)).toEqual(["engine", "captured", "node", "platform", "arch", "v1", "cases"]); // the header first, in this order
    expect(writeFixture(dir, "cases", { cases: [1, 2] }, v1, false)).toBe("written");
    expect(readFixture(dir, "cases").captured).toBe("2026-10-18");
  }));

  it("emitTables records tables.json through writeFixture and generates the data module only under --emit, never under --check", () => inTempDir((dir) => {
    const target = join(dir, "demo-tables");
    const tables = { MONTHS: ["January", "मार्च"], STYLES: { apa: { label: "APA 7" } } };
    expect(emitTables(v1, dir, target, tables, { check: false, emit: false })).toBe("written");
    expect(existsSync(`${target}.ts`)).toBe(false);
    expect(readFixture<{ tables: typeof tables }>(dir, "tables").tables).toEqual(tables);
    expect(emitTables(v1, dir, target, tables, { check: false, emit: true })).toBe("same");
    const generated = [
      `// Generated from v1 index.html build 2026.10.13a (e3ad7404efcc) by test/golden/harness. Do not edit; re-run: pnpm --filter @appuscholar/core golden:capture ${dir} --emit`,
      'export const MONTHS = [\n  "January",\n  "मार्च"\n] as const;',
      'export const STYLES = {\n  "apa": {\n    "label": "APA 7"\n  }\n} as const;',
      "",
    ].join("\n");
    expect(readFileSync(`${target}.ts`, "utf8")).toBe(generated);
    expect(emitTables(v1, dir, target, { ...tables, MONTHS: ["January", "April"] }, { check: true, emit: true })).toBe("differs");
    expect(readFileSync(`${target}.ts`, "utf8")).toBe(generated);
    expect(readFixture<{ tables: typeof tables }>(dir, "tables").tables).toEqual(tables);
  }));
});
