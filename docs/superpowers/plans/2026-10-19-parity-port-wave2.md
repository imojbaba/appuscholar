# Parity Port, Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dr. Sharma's Phase 4 engines ported verbatim into `packages/core` and proven equal to v1's own output: the statistics maths library, data intake and the personal-data scan, the 26 test runners with their APA sentences, the assumption checks, the which-test guide and practice gate, power and the simulator, Chart Studio and the Venn maker, results-to-data linking, the Design & Ethics generators, the AI-use statement builder, the scale library and the qualitative-coding model.

**Architecture:** Every engine becomes pure functions in `packages/core/src/` (no DOM, no storage, no toast): what v1 read from the page becomes a parameter, what v1 wrote to the page becomes a plain result object. The 26 test runners share one frame (`stats-core.ts`, `stats.ts`): `runStats(data, test, form)` returns `{ ok, apa, blocks, skipped, values }` or the toast v1 would have shown, where `blocks` are v1's own tables, notes, headings and lists as data (cell strings and note HTML exactly as v1 built them) and `values` are the raw numbers the scipy comparison reads. The golden harness of Wave 0 drives v1's forms in jsdom (`statsRunNow`, `pwRun`, `plRun`, `vzDraw`, `tgCheck`, `genReveal`, `regCompute`, `ecStatement`, `aiuBuild`, `slScoreRun`) and parses what v1 rendered into the same block shapes; pure functions are captured by direct call. A test-only renderer (`test/golden/stats/render.ts`) turns a result back into v1's collapsed results text, so every case is compared three ways: the APA sentence exactly, every table cell and note exactly, and the whole results text exactly. Content (tables of tests, guide questions, scales, palettes, chart captions in English and Hindi) is emitted by the harness into `src/data/`, never retyped.

**Tech Stack:** TypeScript 5.9 strict, vitest 5, pnpm 10 workspace, jsdom 26.1.0 harness (`packages/core/test/golden/harness/`), tsx capture CLI, scipy 1.17.1 through `uv run --no-project --with scipy==1.17.1 --python 3.13` for the reference files (no Rscript on this Mac; no statsmodels).

**Spec:** `docs/superpowers/specs/2026-10-17-parity-port-design.md` (§5 rules, §6 Wave 2 row and its gate, §8 decisions 1, 2, 3, 4). Audit: `../appuscholar-blueprint/PORT-AUDIT.md` rows S1 (rest), S2–S9, D1, D2, O1, O2, flags F1–F22, F27, F29; evidence scripts `port-audit-evidence/03-compare-with-scipy.py` (the scipy seed), `04-run-13-demo-datasets.cjs`, `05-rmanova-logistic-grouporder-probes.cjs`. Programme: `../appuscholar-blueprint/PROGRAMME.md` line 3. Wave 0–1 plan (style, harness): `docs/superpowers/plans/2026-10-17-parity-port-wave0-1.md`. Register: `docs/superpowers/specs/parity-deviations.md` (D-W1-16 is the tolerance rule).

## Global Constraints

- **Branch and PR.** Work on `claude/parity-wave-2-f16585`, cut from `parity-wave-0-1` at b67b575 (PR #5, green, not merged). PR against `parity-wave-0-1`; if PR #5 has merged by then, rebase onto `phase-3a-vault` and open against it. Never switch branches, never touch another worktree. Ledger at `.superpowers/sdd/2026-10-19-parity-port-wave2/progress.md` (git-ignored). One conventional commit per task.
- **v1 is read-only.** `../appuscholer/index.html` build 2026.10.13a, 13,699 lines, sha256 in every fixture header. Read only the line ranges each task names.
- **Verbatim arithmetic (spec §5.1).** Same operation order, same `toFixed` calls (never `Intl`), same regex sources and flags, same seeds (`Math.imul` mixers, mediation's `n*2654435761+12345`, omega's `12345`), same group order (plain objects iterated with `Object.keys`, never a `Map`: F4, Decision 2), same numeric-code limit (a column of 1s and 2s is numeric and is not a grouping variable: F3, Decision 2). `var` becomes `const`/`let` in the same order; `!` for `noUncheckedIndexedAccess`; types added; nothing else changes. A ported function keeps v1's name.
- **Golden master from v1 running (spec §5.2).** No expected value typed by hand. Inputs a person writes (corpus CSVs, answer paths, option grids) are inputs only; every output comes from `golden:capture`. Fixtures under `packages/core/test/golden/<engine>/`, header with Node, platform, arch, v1 build and sha256 (`harness/fixture.ts`). Comparison through `expectGolden` with `goldenMode(fixture)`: exact on the capturing platform (Node 26 darwin arm64), relative 1e-12 elsewhere, strings and integers exact everywhere (D-W1-16). A golden mismatch is a port bug or a register row, never a hand-edited fixture.
- **Capture is local, tests run in CI.** `pnpm --filter @appuscholar/core golden:capture <engine>... [--check] [--emit]`; `--check` re-captures and exits 1 on any difference. CI runs only committed fixtures; a missing fixture is a failing test.
- **Content copied, never retyped (spec §5.4).** `STAT_TESTS`, `TG_Q`, `TG_RES`, `TG_IMP`, `TG_EXTRA`, `TG_DEMO`, `GEN_DESIGNS`, `PW_INFO`, `VZ_COL`, `VZ_GRAY`, the `vz_*` strings of `I18N.en` and `I18N.hi`, `PD_HDR` (as source), `PD_LABEL`, `PD_DEFAULT`, `EC_DOCS`, `CTRI_FIELDS`, `PI_ITEMS`, `BUDGET_DEFAULTS`, the `DESIGN_ITEMS` keys and labels, `AIU_MONTHS`, `SCALES`, `SL_PENDING`, `QUAL_PALETTE` are emitted by `emitTables` into `packages/core/src/data/*.ts`. `test/golden/devanagari.test.ts` (Wave 1) keeps checking that every Devanagari string under `src/**` exists byte-for-byte in v1; the new modules add their line ranges to its list.
- **Compute split from render (spec §5.5).** `core` returns plain objects. The only HTML in a result is what v1's engine built as data: table cell strings (`escHTML(label)`, `pCell(p)`, which holds `&lt; .001`), note paragraphs with v1's inline `<b>`, `<code>`, `<sub>`, `<i>`, the chart SVG strings, the simulator's SVG. Panels (Wave 5) render blocks; they never hold logic. The `StatsBlock` shape is the contract: `{ kind: "table", rows: string[][] } | { kind: "note", html: string } | { kind: "heading", text: string } | { kind: "list", items: string[] }`.
- **Toasts become results.** A v1 branch that calls `showToast(msg)` and returns becomes `{ ok: false, reason: "toast", toast: msg }` with the same string. The outer `catch` of `statsRunNow` (13456) becomes the same toast in `runStats`. The page helpers' refusals (`pwRun`'s `err(...)`, `plRun`'s warnings, `ecStatement`'s "Choose where things stand first", `aiuBuild`'s "tick them" toast) become `{ ok: false, error }` with v1's text.
- **Deviation register (spec §5.6).** Every knowing difference appends a row to `docs/superpowers/specs/parity-deviations.md` as `proposed` or `noted`, ids `D-W2-<n>` or the audit's `F<n>`; every row names the test that pins it. Numbers never deviate without OJ; copy never without Dr. Sharma (Decision 1: F1, F2, F13's note, F18 port as they are and sit as `proposed`).
- **Reference runs (spec §5.9, Decision 3).** Where scipy 1.17.1 has the statistic, a committed `scipy-reference.json` (written once locally by a `scipy-reference.py` beside the fixture, run as `uv run --no-project --with scipy==1.17.1 --python 3.13 python -I <script> <dir>`) is compared with the port's `values` at a relative 1e-6 (absolute 1e-9 for a value whose reference is 0). The script reads inputs only, never v1's outputs. Where scipy has no statistic and numpy linear algebra gives an independent answer (OLS coefficients and standard errors, logistic likelihood by Newton, repeated-measures sums of squares and ε), the script computes it from the formula and the ledger says "independent numpy computation"; where nothing independent exists the ledger says **"matches v1"**: two-way ANOVA Type III and its simple effects and pairwise tables, mixed ANOVA, McDonald's ω and its bootstrap interval, Games-Howell, Dunn with Holm, moderation's Johnson-Neyman region, mediation's bootstrap interval, Fisher-Freeman-Halton, Cochran's Q, McNemar's χ² form, Welch ANOVA's ω², the Spearman interval, power's `pwPower` (its noncentral distributions are scipy-checked), the simulator.
- **Where it runs (spec §5.7, Decision 4).** `core` stays isomorphic: no `node:*`, `document`, `window`, `localStorage` in `src` (eslint enforces). Engines run in the browser on decrypted data; no api change in this wave.
- **No panel, no new infrastructure.** No UI, no api routes, no new packages. The harness gains per-engine `capture.ts` files and one shared driver for the Statistics Lab form (`test/golden/stats/drive.ts`); nothing else.
- **Do not touch:** Wave 1's modules (`pvalue.ts`, `statfmt.ts`, `numbers.ts`, `html.ts`, `citation.ts`, `crosscheck.ts`, `citlib.ts`, `analyse.ts`, `csv.ts`, `research.ts`, `prompts-*.ts`, `doctext.ts`) except to import from them; `src/fetch/*` and `shelf.ts` (another session's, on another branch). Exports go at the **end** of `packages/core/src/index.ts`, one block per task.
- **Commands.** `pnpm --filter @appuscholar/core test`, `test:golden`, `lint`, `typecheck`; all four green before every commit. Captures: `pnpm --filter @appuscholar/core golden:capture <engine>`.
- **Test file naming.** One golden test per engine at `test/golden/<engine>.test.ts`; the Statistics Lab runners share `test/golden/stats.test.ts` (generic over every `test/golden/stats/<test>.json` on disk) and `test/golden/stats-scipy.test.ts`.

## Review Focus

1. **The "left out" count is doubled for five tests.** `statsResultsShow` (11993) calls `stkAssumpFor` (8797) before it reads `window._statsSkipped` (11995), and for `ttest1`, `ttestInd`, `anova1`, `tukey` and `welchAnova` the assumption pass calls `statsColVals`/`statsGroupBy` again (8800–8803), which add the same non-numeric entries a second time: two text cells print "4 entries that are not a number were left out". The port must count the same way (the `StatsCtx.skipped` counter is incremented by the assumption pass before the note is composed) and the register gets a row. Pinned in Task 3 (`ttest1-text-in-numeric`) and Task 4 (`ttestInd-text-in-numeric`, `anova1-text-in-numeric`).
2. **Group order decides signs and sentences (F4).** Labels `3, 2, 10, NA` come out `2, 3, 10, NA` from `statsGroupBy` (object-key order), which sets which group is "first", the sign of the mean difference, "positive: X tends to score higher" and every pairwise table; `chisq` (`Set`, 12823) and `mixed` (`gl.indexOf`, 13341) keep data order instead, and `stkAnova2Cells` keeps data order (8786). Pinned in Task 4 (`ttestInd-integer-labels`, `tukey-integer-labels`), Task 5 (`mannwhitney-integer-labels`), Task 6 (`chisq-integer-labels`), Task 7 (`anova2-integer-labels`), Task 9 (`mixed-integer-labels`).
3. **A group or column literally named `undefined` or `NaN` suppresses the result (F22).** The safety net (11987) tests the whole HTML and sentence. Pinned in Task 3 (`desc-column-named-undefined`) and Task 4 (`ttestInd-group-named-NaN`).
4. **Decimal ties are not ties (F15).** `1.1−1.0` and `2.2−2.1` differ in floating point, so Wilcoxon and Mann-Whitney take the exact branch on data that a person reads as tied, and R does the same. Pinned in Task 5 (`wilcoxon-decimal-ties`, `mannwhitney-decimal-ties`).
5. **The parser's shapes (F17).** `.5`, `1e3`, `+2`, `1,5`, a Unicode minus and a space inside a number make a column categorical; a semicolon file is one column; rows with the wrong field count vanish silently; a quoted comma stays inside its cell; CRLF and lone CR split lines; a blank header becomes `Col3`. Pinned in Task 2's corpus.

---

## File structure

Created (paths under `packages/core/`):

- `src/statsmath.ts` (Task 1): the S1 maths that Wave 1 left out.
- `src/intake.ts`, `src/pdscan.ts` (Task 2).
- `src/stats-core.ts`, `src/stats.ts`, `src/stats-means.ts`, `src/data/stats-tables.ts` (Task 3); `src/stats-means.ts` grows in Task 4; `src/stats-ranks.ts` (Task 5); `src/stats-counts.ts` (Task 6); `src/stats-factorial.ts` (Task 7); `src/stats-models.ts` (Task 8); `src/stats-advanced.ts` (Task 9).
- `src/guide.ts`, `src/data/guide-tables.ts` (Task 10); `src/power.ts`, `src/data/power-tables.ts` (Task 11); `src/charts.ts`, `src/quickchart.ts`, `src/data/chart-tables.ts` (Task 12); `src/rtlink.ts` (Task 13); `src/design.ts`, `src/aiustatement.ts`, `src/data/design-tables.ts` (Task 14); `src/scales.ts`, `src/qual.ts`, `src/data/scale-tables.ts`, `src/data/qual-tables.ts` (Task 15).
- Goldens: `test/golden/<engine>/capture.ts` plus fixtures for engines `statsmath`, `intake`, `pdscan`, `stats` (one fixture per test key, a shared driver `stats/drive.ts`, a test-only renderer `stats/render.ts`, hand-written corpora under `stats/corpus/`), `guide`, `power`, `charts`, `quickchart`, `rtlink`, `design`, `aiustatement`, `scales`, `qual`; tests `test/golden/<engine>.test.ts`, `test/golden/stats.test.ts`, `test/golden/stats-scipy.test.ts`.
- Modified: `src/index.ts` (appended exports per task), `test/golden/harness/engines.ts` (registry), `test/golden/devanagari.test.ts` (line ranges), `docs/superpowers/specs/parity-deviations.md` (rows), `packages/core/package.json` only if a script is needed (none expected).

Order: Task 1 (maths) → Task 2 (intake) → Task 3 (frame + desc, ttest1) → Tasks 4, 5, 6 (the other 16 simple tests) → Tasks 7, 8 (the 5 medium) → Task 9 (mixed, moderation, mediation) → Task 10 (guide) → Task 11 (power) → Task 12 (charts) → Task 13 (linking) → Task 14 (Design & Ethics, AI-use statement) → Task 15 (scales, qualitative) → Task 16 (gate and PR). Tasks 10–15 depend only on Tasks 1–3 and can run in any order after Task 3.

---

### Task 1: Statistics maths library, the rest of S1

**Files:**
- Create: `packages/core/src/statsmath.ts`
- Create: `packages/core/test/golden/statsmath/capture.ts`, `statsmath/cases.json` (captured), `statsmath/scipy-reference.py`, `statsmath/scipy-reference.json`
- Test: `packages/core/test/golden/statsmath.test.ts`
- Modify: `packages/core/src/index.ts`, `test/golden/harness/engines.ts`

**v1 source (read only these lines):** 8691–8696 (`stkNormCdf`, `stkQnorm`, `stkPoly`); 8698–8752 (`stkShapiro`, `stkBrownForsythe`); 8834–8893 (`stkRSS`, `stkAnova2`, `stkOLS`); 8942–8990 (`stkLogit`, `stkAUC`); 8991–9005 (`plRng`, `plNorm`, `plSim`); 9044–9123 (`pwLogPois`, `pwNcChiSf`, `pwNcFSf`, `pwNctCdf`, `pwChiCrit`, `pwPowerT`, `pwPowerF`, `pwPower`, `pwSolveN`, `pwSolveEffect`, `stkSimpleEffects`); 9124–9347 (`smean`, `svar`, `ssd`, `smedian`, `ranks`, `stkTCrit`, `stkFQuant`, `stkTieTerm`, `stkHolm`, `stkKruskal`, `stkDunn`, `stkSpearman`, `stkCorrMat`, `stkOmega`, `stkAlpha`, `stkRng`, `stkOmegaBoot`, `STK_GL`, `stkGL`, `stkPhi`, `stkPtukey`, `stkQtukey`, `stkWelchAnova`, `stkGamesHowell`, `stkLogChoose`, `stkFisherRC`, `stkFisher2x2`, `stkExactMW`, `stkExactSR`, `stkBinomTwo`). Not here: 8753–8833 and 8894–8941 (page-bound, Task 3); 9006–9043 (`plPreset`, `plRun`, Task 11); 11858–11883 `TUKEY_Q05`/`qCrit` (F21: defined, never called, not ported).

**Interfaces:**
- Consumes: `gammaln`, `gammaq`, `pFromT`, `pFromF`, `pFromChi`, `pFromZ` from `pvalue.ts`.
- Produces (`statsmath.ts`), every function with v1's name and v1's return shape, typed:
  - `smean(a: number[]): number`, `svar`, `ssd`, `smedian`, `ranks(a: number[]): number[]`
  - `stkNormCdf(z)`, `stkQnorm(p)`, `stkPoly(c: number[], x)`, `stkPhi(z)`
  - `stkShapiro(x0: number[]): { W: number; p: number; n: number } | null`
  - `stkBrownForsythe(groups: number[][]): { F; df1; df2; p } | null`
  - `stkRSS(cols: number[][], y: number[]): number | null`; `stkAnova2(y, a: number[], b: number[], la, lb): Anova2 | null` where `Anova2 = { sse; dfe; mse; sst; rows: Array<{ id: "A"|"B"|"AB"; ss; df; ms; F; p; eta }> }`
  - `stkOLS(xs: number[][], y): { beta: number[]; inv: number[][]; resid: number[]; sse; sst; n; k } | null`
  - `stkLogit(xs, y: number[]): Logit | null` where `Logit = { singular: true } | { sep: true } | { beta; se; inv; ll; ll0; pr; iter; conv; sep; n1 }`; `stkAUC(pr, y): number`
  - `stkSimpleEffects(cellMap: Record<string, number[]>, la, lb, mse, dfe): { byA: Eff[]; byB: Eff[] }`, `Eff = { ss; df; F; p }`
  - `plRng(seed): () => number`, `plNorm(r)`, `plSim(d, n, k, seed): Array<{ d; p; sig }>`
  - `pwLogPois`, `pwNcChiSf(x, df, lam)`, `pwNcFSf(F, d1, d2, lam)`, `pwNctCdf(t, df, delta)`, `pwChiCrit(alpha, df)`, `pwPowerT`, `pwPowerF`, `pwPower(spec: PowerSpec, n): number`, `pwSolveN(spec, target): number | null`, `pwSolveEffect(spec, n, target): number | null`, with `PowerSpec = { test: "ind"|"paired"|"one"|"anova"|"regr"|"chisq"|"corr"; alpha; effect?; tails?; k?; p?; df? }`
  - `stkTCrit(df, alpha)`, `stkFQuant(q, d1, d2)`, `stkTieTerm(all)`, `stkHolm(ps)`, `stkKruskal(groups): { H; df; p; N; k; meanRanks; eps2; T }`, `stkDunn(groups, kw): Array<{ i; j; z; p; padj }>`, `stkSpearman(xs, ys): { rho; n; df; p; lo; hi }`, `stkCorrMat(X: number[][]): number[][] | null`, `stkOmega(R): { omega; loadings } | null`, `stkAlpha(X): { alpha; n; k }`, `stkRng(seed)`, `stkOmegaBoot(X, B): [number, number] | null`
  - `STK_GL`, `stkGL(f, a, b, segs)`, `stkPtukey(q, k, v)`, `stkQtukey(pr, k, v)`, `stkWelchAnova(groups): { F; df1; df2; p; omega2; N; k } | null`, `stkGamesHowell(groups): Array<{ i; j; diff; se; df; q; p; lo; hi }>`
  - `stkLogChoose`, `stkFisherRC(table: number[][], limit?: number): { p; tables; total } | null`, `stkFisher2x2(a, b, c, d): { p; or }`, `stkExactMW(n1, n2, U)`, `stkExactSR(n, W)`, `stkBinomTwo(x, n, pi)`
- Consumed by: Tasks 3–9, 10 (`smean`, `ssd`), 11 (`pw*`, `plSim`), 12 (`smean`, `ssd`), 15 (`stkAlpha`).

- [ ] **Step 1: Write the capture grids**

`statsmath/capture.ts`, every point recorded as `{ fn, args, out }` by direct call (`v1.call`), args cloned before the call. Grids (the implementer may add points, never remove these):

| fn | tuples |
|---|---|
| `smean`, `svar`, `ssd`, `smedian` | `[1,2,3,4]`, `[5]`, `[2,2,2]`, `[1.5,-2,7.25,0]`, `[3,1,2]` (odd and even n for the median) |
| `ranks` | `[3,1,2]`, `[1,1,2]`, `[2,2,2]`, `[1.1,1.0,2.2,2.1,1.1]`, `[5,3,5,1,3,5]` |
| `stkNormCdf` | −3, −1, 0, 0.5, 1.96, 4 |
| `stkQnorm` | .001, .025, .5, .975, .999 |
| `stkPoly` | `([1,2,3], 2)`, `([0.5,-0.39978,0.025054,-6.714e-4], 10)` |
| `stkShapiro` | the three smoke lists; n = 3 `[1,2,4]`; n = 4 `[1,2,2,9]`; n = 5 `[2,4,4,5,9]`; n = 6 `[1,2,3,4,5,20]`; n = 11 `[1..10, 30]`; n = 12 `[12,14,11,13,15,12,14,13,16,18,11,12]`; n = 50 (`i*i % 37` for i in 1..50); a constant list `[3,3,3,3]` (null); `[1,2]` (null); a list where y ≥ gamma for n ≤ 11 gives `p: 1e-99` (`[1,1,1,1,1,1,1,1,1,1,100]`) |
| `stkBrownForsythe` | the `anova1` demo's three arms; `[[1,2,3],[1,2,3]]`; `[[2,2],[3,3]]` (ssw 0 → null); four groups of unequal size |
| `stkRSS`, `stkOLS` | `(cols=[[1,1,1,1,1],[1,2,3,4,5]], y=[2.1,3.9,6.2,7.8,10.1])`; three predictors on 8 rows; a dependent column pair (`[1,2,3,4]` and `[2,4,6,8]`) → null; a column of zeros → null |
| `stkLogit`, `stkAUC` | the 20-row sample of evidence script 05 (copy its `xs`, `y` into the capture, cite the line); `y` all 1 → null; a separating predictor (`x = y`) → `sep` |
| `stkAnova2` | 2×2 balanced (3 per cell), 2×3 unbalanced, a 2×2 with one cell of 1 row (dfe check), `la=2, lb=2, n=4` (dfe 0 → null) |
| `stkSimpleEffects` | the cellMap of the 2×3 case with its `mse`, `dfe` |
| `plRng` | first 5 draws for seeds 1, 42, 0 (`(0>>>0)||1` → 1), −1, 2^32 |
| `plNorm` | first 3 values from `plRng(7)` |
| `plSim` | `(0.5, 10, 5, 1)`, `(0.2, 20, 3, 42)`, `(1, 5, 2, 99)` |
| `pwNcChiSf` | `(3.84, 1, 0)`, `(3.84, 1, 4)`, `(11.07, 5, 10)`, `(100, 10, 50)` |
| `pwNcFSf` | `(4.0, 1, 10, 0)`, `(4.0, 1, 10, 5)`, `(2.5, 3, 60, 8)` |
| `pwNctCdf` | `(2.0, 10, 0)`, `(2.0, 10, 1.5)`, `(-1, 30, 2)`, `(1.7, 100, 3)` |
| `pwChiCrit` | `(0.05, 1)`, `(0.01, 5)`, `(0.05, 100)` |
| `pwPowerT`, `pwPowerF` | `(2, 30, 0.05, 2)`, `(2, 30, 0.05, 1)`; `(0.0625, 3, 76, 0.05, 80)` |
| `pwPower` | each test type at two n and the `NaN` exits: `ind` n 1 and 64; `paired` n 1 and 30; `one` n 100; `anova` k 4 n 2 and 40; `regr` p 3 n 4 and 100; `chisq` df 1 n 100; `corr` n 3 and 85; effect sizes the `PW_INFO` defaults; a `test: "x"` → NaN |
| `pwSolveN` | the smoke three plus `anova` k 3 f .25 .8, `regr` p 2 f² .15 .8, `chisq` df 2 w .3 .8, `ind` d 0.01 .8 (null) |
| `pwSolveEffect` | `ind` n 64 .8; `corr` n 30 .8; `anova` k 3 n 20 .8; `ind` n 2 .999 (null) |
| `stkTCrit` | `(10, .05)`, `(1, .05)`, `(1000, .01)`, `(2.5, .05)` |
| `stkFQuant` | `(.975, 14, 70)`, `(.025, 14, 70)`, `(.5, 1, 1)` |
| `stkTieTerm`, `stkHolm` | `[1,1,2,3,3,3]`, `[1,2,3]`; `[.01,.04,.03]`, `[.5,.5]`, `[.001]` |
| `stkKruskal`, `stkDunn` | the `kruskal` demo's three groups (and `stkDunn(groups, stkKruskal(groups))`); three groups with every value equal (H NaN) |
| `stkSpearman` | the `spearman` demo pairs; `([1,2,3],[3,2,1])` (rho −1, p 0); `([1,2,3,4],[1,2,3,4])` |
| `stkCorrMat`, `stkAlpha`, `stkOmega`, `stkOmegaBoot` | the `alpha` demo matrix (q6 reversed with 1-5) as X: `stkCorrMat(X)`, `stkAlpha(X)`, `stkOmega(R)`, `stkOmegaBoot(X, 400)` and `(X, 200)`; a matrix with a constant column → `stkCorrMat` null |
| `stkPhi`, `stkGL` | `stkPhi(0)`, `(1.5)`, `(-2)`; `stkGL(z => z*z, 0, 1, 2)` |
| `stkPtukey`, `stkQtukey` | the smoke points plus `stkPtukey(0, 3, 10)` (0), `(8, 3, 4)` (v < 5), `stkQtukey(.95, 2, 1000)` |
| `stkWelchAnova`, `stkGamesHowell` | the `anova1` demo arms; three groups with a constant group → null |
| `stkFisherRC` | the `chisq` demo table `[[18,12],[15,15]]`, a 3×3 `[[3,1,0],[1,4,1],[0,2,5]]`, a 2×4 that is transposed inside, `(table, 10)` → null |
| `stkFisher2x2` | `(18,12,15,15)`, `(0,5,5,0)` (`or` Infinity), `(0,5,0,5)` (NaN), `(3,1,1,3)` |
| `stkExactMW`, `stkExactSR`, `stkBinomTwo` | the smoke three plus `(3,3,0)`, `(3,3,9)`; `(5, 0)`, `(5, 7.5)`, `(10, 20)`; `(18,60,1/3)`, `(0,10,.5)`, `(5,10,.5)` |

`statsmath/scipy-reference.py` (seed: `pvalue/scipy-reference.py`): for the cases of `cases.json` whose `fn` is `stkNormCdf` (`norm.cdf`), `stkQnorm` (`norm.ppf`), `stkShapiro` (`stats.shapiro`: W and p, null where v1 returns null), `stkBrownForsythe` (`stats.levene(*groups, center="median")`: F and p), `pwNcChiSf` (`ncx2.sf`), `pwNcFSf` (`ncf.sf`), `pwNctCdf` (`nct.cdf`), `pwChiCrit` (`chi2.isf`), `stkTCrit` (`t.isf(alpha/2, df)`), `stkFQuant` (`f.ppf`), `stkPtukey` (`studentized_range.cdf(q, k, v)`), `stkQtukey` (`studentized_range.ppf`), `stkFisher2x2` (`fisher_exact(two-sided)`: p and the sample odds ratio `a*d/(b*c)`), `stkBinomTwo` (`binomtest(x, n, pi).pvalue`), `stkKruskal` (`kruskal`: H, p), `stkSpearman` (`spearmanr`: rho, p). Output `{ scipy, cases: [{ fn, args, ref }] }` where `ref` is a number or an object of numbers mirroring v1's field names, null for NaN or an infinity.

Run: `pnpm --filter @appuscholar/core golden:capture statsmath && uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/statsmath/scipy-reference.py packages/core/test/golden/statsmath`

- [ ] **Step 2: Write the failing tests**

```ts
describe("statsmath.ts is v1's statistics maths (8691–9347)", () => {
  const fx = readFixture<{ cases: Array<{ fn: string; args: unknown[]; out: unknown }> }>("statsmath", "cases");
  const mode = goldenMode(fx);
  it("the fixture covers every exported function", () => expect(new Set(fx.cases.map(c => c.fn))).toEqual(new Set(Object.keys(fns))));
  for (const c of fx.cases) it(`${c.fn}(${JSON.stringify(c.args).slice(0, 80)})`, () => expectGolden(fns[c.fn]!(...structuredClone(c.args)), c.out, mode));
});
describe("statsmath.ts agrees with scipy where scipy has the statistic", () => {
  it("names scipy 1.17.1", () => expect(ref.scipy).toBe("1.17.1"));
  for (const c of ref.cases) it(`${c.fn} vs scipy`, () => { /* each numeric field of ref within 1e-6 relative (1e-9 absolute when ref is 0); Shapiro p: 1e-4 relative, since v1 is Royston's approximation and scipy's is the same algorithm but not bit-identical; v1's 1e-99 floor accepted when scipy < 1e-12 */ });
});
```

`fns` maps every exported name to its function; `plRng`'s record is the first five draws, so its case calls the returned function five times (the capture did the same).

- [ ] **Step 3: Run to verify they fail, port the lines verbatim, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- statsmath`
Expected: FAIL (module missing), then PASS. Keep `STK_GL` as a module-level constant computed once by the same IIFE; keep `stkOmega`'s 500/300 loops and `0.995` cap; keep `stkRng` and `plRng` as closures over `|0` arithmetic; `stkFisherRC`'s default `limit` 30,000,000; `stkLogit`'s 100 Newton steps with 30 halvings and the 30/500 separation cut-offs (F12).

- [ ] **Step 4: Register, export, commit**

Register rows (noted unless stated): F6 and F7 already exist (F7 moves nothing); add `F12` (logistic separation cut-offs, port verbatim), `F19` (correlation power by Fisher z, port verbatim), `F21` (`TUKEY_Q05`/`qCrit` not ported: no caller), `D-W2-1` (noted: `stkOmegaBoot` draws with `Math.floor(rnd()*n)` and seed 12345, so the interval is engine-exact only on the capture platform; off it the 1e-12 rule covers a resample order that cannot differ, but a different `Math.exp` ULP in the omega iteration can move the sorted quantiles by less than 1e-12, which the test accepts). Append the exports to `index.ts`.

```bash
git add packages/core/src/statsmath.ts packages/core/src/index.ts packages/core/test/golden docs/superpowers/specs/parity-deviations.md
git commit -m "feat(core): v1 statistics maths library (Shapiro, OLS, logit, Tukey, Welch, exact tests, power) golden-equal to v1 and within 1e-6 of scipy"
```

---

### Task 2: Data intake and the personal-data scan (S2)

**Files:**
- Create: `packages/core/src/intake.ts`, `packages/core/src/pdscan.ts`
- Create: `packages/core/test/golden/intake/capture.ts`, `intake/corpus.json` (hand-written inputs), `intake/cases.json`; `packages/core/test/golden/pdscan/capture.ts`, `pdscan/corpus.json`, `pdscan/cases.json`
- Test: `packages/core/test/golden/intake.test.ts`, `packages/core/test/golden/pdscan.test.ts`
- Modify: `index.ts`, `engines.ts`, `devanagari.test.ts` (add range 9411–9423), `parity-deviations.md`

**v1 source:** 9348–9371 (`statsSplitLine`, `statsParseText`); 9411–9433 (`PD_HDR`, `PD_LABEL`, `PD_DEFAULT`, `pdTestVal`); 9433–9460 (`pdScan`); 9464–9486 (`pdTransform`). Page code, for reference only: `statsParse` 9389, `statsUpload` 9403, `pdRender` 9487. `pdCsvCell`/`pdCsv` 9461–9462 are Wave 1's `csv.ts`.

**Interfaces:**
- Produces (`intake.ts`): `type ParsedCol = { name: string; index: number; type: "numeric" | "categorical"; n: number }`; `type ParsedData = { headers: string[]; rows: string[][]; cols: ParsedCol[] }`; `statsSplitLine(l: string, delim: string): string[]`; `statsParseText(text: string): ParsedData | null`.
- Produces (`pdscan.ts`): `PD_HDR: Array<[PdKind, RegExp]>` (the regex literals copied, Devanagari `नाम` included), `PD_LABEL`, `PD_DEFAULT`, `type PdKind = "name"|"phone"|"email"|"roll"|"dob"|"address"|"govid"`; `pdTestVal(kind: PdKind, v: string): boolean`; `pdScan(data: ParsedData): { found: Array<{ index; name; kind: PdKind; why: "values"|"heading" }>; freeText: string[] }`; `pdTransform(data, choices: Record<number, "keep"|"remove"|"code">): { headers; rows; key: { headers; rows }; removed; coded; csv; keyCsv }`.
- Consumed by: every later task (`ParsedData`), Task 15 (`pdTransform`'s shape is not reused).

- [ ] **Step 1: Write the corpora**

`intake/corpus.json`: `[{ id, text }]`, at least 30 entries, with these ids and inputs present: `tab-delimited`, `comma`, `semicolon-one-column` (`a;b\n1;2`), `crlf`, `lone-cr`, `blank-lines-skipped`, `quoted-comma` (`"x, y",1`), `doubled-quote` (`"say ""hi""",2`), `unterminated-quote`, `trailing-spaces-trimmed`, `wrong-field-count-rows-dropped` (3 columns, two rows of 2 fields), `blank-header-col3` (`a,,c`), `numeric-dot5` (`.5`), `numeric-exponent` (`1e3`), `numeric-plus` (`+2`), `decimal-comma` (`1,5` in a tab file), `unicode-minus` (`−3`), `space-in-number` (`1 000`), `negative-and-decimals` (`-1.25`), `empty-cells-not-counted` (n excludes `''`), `all-empty-column-categorical` (n 0 → categorical), `hindi-header-and-values`, `header-only` (one line → rows `[]`), `empty-text` (null), `whitespace-only` (null), `ones-and-twos-numeric` (F3: `grp\n1\n2\n1`), `tab-wins-over-comma` (first line has both).

`pdscan/corpus.json`: `[{ id, text, choices? }]` tables (parsed by v1's `statsParseText` in the capture), at least 20, with ids: `email-values`, `phone-values-91`, `phone-values-spaced`, `aadhaar-values`, `pan-values`, `dob-dmy`, `dob-ymd`, `dob-out-of-range-years` (1930 → no), `name-values-uniq` (≥ 3 rows, uniq ≥ .8, 70% two-word names), `name-values-low-uniq` (repeated names → not flagged by values; heading rule then applies), `heading-name`, `heading-naam-devanagari`, `heading-name-excluded-word` (`group name` → skipped), `heading-name-low-uniq-skipped` (`name` heading, 4 rows, 2 distinct), `heading-roll`, `heading-address`, `heading-govid`, `heading-dob`, `heading-email-spaced` (`e mail`), `free-text-long` (mean > 40), `free-text-one-long` (one cell > 120), `numeric-first-value-not-free-text`, `values-beat-heading` (a column headed `score` holding emails → kind email, why values), `mixed-table` (name, roll, phone, score, comment), `transform-code-first` (choices: code on two columns, remove one, keep rest; a repeated name → same code; a blank name → a new code each time; `pad` ≥ 3), `transform-remove-only`, `transform-keep-all`.

- [ ] **Step 2: Capture**

`intake/capture.ts`: for each entry `{ id, text, out: statsParseText(text) }` and, for `statsSplitLine`, the lines of `quoted-comma`, `doubled-quote`, `unterminated-quote` with `','` and `'\t'`. `pdscan/capture.ts`: for each entry `{ id, data: statsParseText(text), scan: pdScan(data), transform: choices ? pdTransform(data, choices) : undefined }` plus `pdTestVal` over every kind × 12 values (valid and invalid per kind, including `+91 98765-43210`, `ABCDE1234F`, `12/31/2001`, `2001-13-01`, `Asha Verma`, `asha`, `A. B. Sharma`).

Run: `pnpm --filter @appuscholar/core golden:capture intake pdscan`

- [ ] **Step 3: Write the failing tests, port, pass**

```ts
describe("intake.ts is v1's statsSplitLine and statsParseText", () => {
  for (const c of fx.cases) it(c.id, () => expectGolden(statsParseText(c.text), c.out, mode, c.id));
  for (const c of fx.split) it(`statsSplitLine(${JSON.stringify(c.line)}, ${JSON.stringify(c.delim)})`, () => expect(statsSplitLine(c.line, c.delim)).toEqual(c.out));
  it("the corpus holds the Review Focus 5 shapes", () => { for (const id of ["semicolon-one-column", "wrong-field-count-rows-dropped", "numeric-dot5", "numeric-exponent", "numeric-plus", "decimal-comma", "unicode-minus", "space-in-number", "quoted-comma", "crlf", "lone-cr", "blank-header-col3", "ones-and-twos-numeric"]) expect(fx.cases.some(c => c.id === id)).toBe(true); });
});
describe("pdscan.ts is v1's pdScan and pdTransform", () => { /* scan and transform per case with expectGolden; pdTestVal grid with toBe; PD_LABEL and PD_DEFAULT equal the fixture's copies */ });
```

Run: `pnpm --filter @appuscholar/core test:golden -- intake pdscan`
Expected: FAIL, then PASS. Keep the numeric rule `/^-?\d+(\.\d+)?$/`, the delimiter rule (`includes('\t')` on the first line), `r.length===headers.length`, `'Col'+(i+1)`; keep `pdScan`'s 0.6 / 0.5 / 0.8 / 0.7 / 40 / 120 thresholds and the `['email','phone','govid','dob']` order; keep `pdTransform`'s `Map` (v1 uses one here: 9468) and `'P'+String(n).padStart(pad,'0')`.

- [ ] **Step 4: Register, export, commit**

Rows: `F17` (parser shapes, port verbatim; pinned by the corpus ids above), `F3` (numeric-code groups, Decision 2 ruling, pinned by `ones-and-twos-numeric`: `type` numeric), `D-W2-2` (noted: wrong-field-count rows are dropped with no count; the panel may show one later only with a register row). Export `statsSplitLine`, `statsParseText`, `ParsedData`, `ParsedCol`, `PD_HDR`, `PD_LABEL`, `PD_DEFAULT`, `pdTestVal`, `pdScan`, `pdTransform`, `PdKind`.

```bash
git commit -m "feat(core): v1 data intake (statsParseText) and personal-data scan (pdScan, pdTransform) golden-equal to v1"
```

---

### Task 3: The runner frame, assumption checks, and the first two tests (S3 frame, S4, `desc`, `ttest1`)

**Files:**
- Create: `packages/core/src/stats-core.ts`, `packages/core/src/stats.ts`, `packages/core/src/stats-means.ts`, `packages/core/src/data/stats-tables.ts` (generated)
- Create: `packages/core/test/golden/stats/drive.ts`, `stats/render.ts`, `stats/capture.ts`, `stats/corpus/desc.json`, `stats/corpus/ttest1.json`, `stats/desc.json`, `stats/ttest1.json`, `stats/tables.json` (captured)
- Test: `packages/core/test/golden/stats.test.ts`
- Modify: `index.ts`, `engines.ts`, `parity-deviations.md`

**v1 source:** 11750–11777 (`STAT_TESTS`); 11783–11808 (`stkIsBinaryCol`, `stkBinData`, `stkBinom5`); 11834–11857 (`statsColVals`, `statsGroupBy`); 11983 (`sig`); 11985–12005 (`statsResultsShow`); 8753–8779 (`stkAssumpBlock`); 8780–8796 (`stkAnova2Cells`); 8797–8833 (`stkAssumpFor`); 8894–8941 (`stkMRData`); 12609–12640 (`statsRunNow` head, `desc`, `ttest1`); 13456–13457 (the `catch`). For reference only (not ported): `statsFieldsRender` 11809–11833 (the panel's field defaults), `statsChart*` 11884–11979 (Chart.js, F27), `statsCopy`/`statsInsert`/`statsExplain` 12006–12037, `statsRun` 12604.

**Interfaces:**
- Consumes: `ParsedData` (Task 2), `statsmath.ts` (Task 1), `pCell`, `fmtP`, `noLead` (`statfmt.ts`), `pFromT` etc. (`pvalue.ts`), `escHTML` (`html.ts`).
- Produces (`stats-core.ts`):
  - `type StatsTestKey = keyof typeof STAT_TESTS` (26 keys, in v1's order: desc, ttest1, ttestInd, ttestPaired, anova1, tukey, regression, mannwhitney, wilcoxon, pearson, mcnemar, cochran, chisq, moderate, mediate, logistic, mregress, friedman, rmanova, mixed, anova2, welchAnova, gof, kruskal, spearman, alpha)
  - `type StatsForm = { values: Record<string, string>; ticked: Record<string, number[]> }`: `values[id]` is what `#sf_<id>` held (a select's value is the column index as a string; an extra is its text); `ticked[id]` the column indexes of the checked `.sfm_<id>` boxes in column order. Missing ids read as `''` and `[]`, as v1's `gv` and `querySelectorAll` do.
  - `type StatsCtx = { data: ParsedData; form: StatsForm; skipped: number }` and `gv(ctx, id): string`
  - `statsColVals(ctx, idx, numeric: true): number[]` / `(ctx, idx, numeric: false): string[]` (adds to `ctx.skipped` as 11839 does), `statsGroupBy(ctx, dvIdx, ivIdx): Record<string, number[]>` (plain object, 11842–11856), `stkIsBinaryCol(data, i)`, `stkBinData(data, idxs, posTxt): BinData | { err: string }`, `stkBinom5(b, nd)`, `sig(p)`
  - `type StatsBlock = { kind: "table"; rows: string[][] } | { kind: "note"; html: string } | { kind: "heading"; text: string } | { kind: "list"; items: string[] }`
  - `stkAssumpBlock(items: Array<{ label: string; vals: number[] }>, groupsForSpread: number[][] | null, what: string): StatsBlock[]` (heading "Assumption checks", one table, zero or one Brown-Forsythe note, one message note: 8753–8778 as blocks, cell strings as v1's)
  - `stkAssumpFor(key: StatsTestKey, ctx): StatsBlock[]` (8797–8833; `''` becomes `[]`; the `try/catch` stays)
  - `stkAnova2Cells(ctx)`, `stkMRData(ctx, bin?: boolean)` (8780–8796, 8894–8941; the `document.querySelectorAll('.sfm_'+cls+':checked')` reads become `ctx.form.ticked[cls] ?? []`, the `sf_ref`/`sf_pos`/`sf_dv` reads become `gv`)
  - `type StatsOk = { ok: true; test: StatsTestKey; apa: string; blocks: StatsBlock[]; skipped: number; values: Record<string, number> }`; `type StatsFail = { ok: false; test; reason: "toast"; toast: string } | { ok: false; test; reason: "undefined"; blocks: StatsBlock[] }`; `type StatsResult = StatsOk | StatsFail`
  - `finishResult(ctx, key, blocks, apa, values): StatsResult`: `statsResultsShow` 11985–12005 as data: the safety net `/NaN|Infinity|undefined(?! \(an empty cell\))/` over `blocksHtml(blocks)+' '+apa` (`blocksHtml` joins cells, note html, heading text and list items with nothing between, since only the words matter) → `reason: "undefined"` with v1's note as one `note` block; else append `stkAssumpFor(key, ctx)` **before** reading `ctx.skipped`, then the "N entr(y|ies) … left out" note when `ctx.skipped` is truthy (11995, text as v1's).
  - `STAT_TESTS` from `data/stats-tables.ts` (emitted), typed `Record<StatsTestKey, { label; fields: Array<{ id; label; type; multi?; unchecked? }>; extra?: Array<{ id; label; placeholder }> }>`
- Produces (`stats.ts`): `runStats(data: ParsedData, test: StatsTestKey, form: StatsForm): StatsResult`: builds `ctx` (`skipped: 0`, 12612), dispatches on `test` to `run<Test>(ctx)` in v1's `if/else if` order, wraps in `try/catch` returning the toast of 13456; an unknown key returns that toast too (v1 falls through every branch and shows nothing: register as `D-W2-3`, noted).
- Produces (`stats-means.ts`): `runDesc(ctx): StatsResult`, `runTtest1(ctx): StatsResult` (12618–12640). `values`: desc `{ n, m, s, md, min, max }`; ttest1 `{ n, m, s, mu, t, df, p, dlo, dhi, dEff }`.
- Produces (`test/golden/stats/drive.ts`): `type StatsCase = { id: string; csv: string; test: StatsTestKey; values?: Record<string, string>; ticked?: Record<string, string[]>; why?: string }` (select fields and ticks by **column name**, extras by text); `driveV1Stats(v1, c): CapturedRun` where `CapturedRun = { id, test, csv, form: StatsForm, apa: string | null, blocks: StatsBlock[], resultsText: string, resultsHtml: string, toasts: string[] }`: pastes `csv` into `#statsPaste`, `_rtSkip=true; statsParse(); _rtSkip=false`, sets `#statsTest`, calls `statsFieldsRender()`, resolves names to `String(col.index)` for every `values` key whose `#sf_<id>` is a `<select>` (throws when the name is not among its options: the case is unreachable through v1's form), sets extras' text, ticks `.sfm_<id>` boxes by resolved index, **empties `#statsResults`**, clears `v1.toasts`, calls `statsRunNow()`, then reads `#statsSentence` (null when absent) and parses `#statsResults`'s children in order into blocks: `table.stats-table` → rows of `textContent` per `th`/`td` cell; `p.desc` (and any other `p`) → `{ kind: "note", html: innerHTML }`; `h4` → heading; `ul` → items; `div.stats-assump` → its children flattened the same way; `h3`, `#statsSentence` and the button row skipped. `form` records what the port receives (`values` with resolved indexes, `ticked` with indexes).
- Produces (`test/golden/stats/render.ts`, test-only): `decodeText(html: string): string` (strip tags, decode `&lt; &gt; &amp; &quot; &#39; &nbsp;`), `blockText(b: StatsBlock): string` (cells joined with nothing, as `textContent` joins them), `renderResultsText(r: StatsResult): string` (`"Results" + blocks + apa + "Insert into documentCopy💡 Explain in plain language"`, whitespace collapsed to single spaces: what `#statsResults.textContent.replace(/\s+/g,' ')` gave) and for `reason: "undefined"` `"Results" + note`.
- Produces (`test/golden/stats/capture.ts`): the engine `stats`: for every `stats/corpus/<test>.json` on disk (sorted), runs each case through `driveV1Stats` and writes `stats/<test>.json` as `{ cases: CapturedRun[] }`; also writes `stats/tables.json` and emits `STAT_TESTS` into `src/data/stats-tables.ts` under `--emit`. One engine, every test's fixture: later tasks add corpora only.
- Consumed by: Tasks 4–9 (every runner), 10, 13, 15.

- [ ] **Step 1: Write the corpora**

`stats/corpus/desc.json`: `desc-demo-score` (the `ttest1` demo CSV, `dv: score`), `desc-one-value` (toast "Need at least 2 values"), `desc-text-in-numeric` (a numeric column with two `abc` cells: v1 drops them; `desc` has no assumption pass, so the note says 2), `desc-hindi-column-name`, `desc-column-named-undefined` (header `undefined`: F22, result suppressed), `desc-negative-decimals`.
`stats/corpus/ttest1.json`: `ttest1-demo` (TG_DEMO, `mu: 50`), `ttest1-mu-empty` (`mu: ''` → 0), `ttest1-mu-text` (`abc` → 0), `ttest1-all-same` (toast), `ttest1-one-value` (toast), `ttest1-text-in-numeric` (two text cells → the note says **4**: Review Focus 1), `ttest1-n3` (small n: Shapiro n 3 path), `ttest1-n2-assumptions-skip` (n 2: the assumption table says "needs 3 or more values").

- [ ] **Step 2: Capture**

Run: `pnpm --filter @appuscholar/core golden:capture stats --emit`
Expected: `stats/desc.json`, `stats/ttest1.json`, `stats/tables.json` written, `src/data/stats-tables.ts` written; `ttest1-text-in-numeric` shows the doubled count in its last note.

- [ ] **Step 3: Write the failing tests**

```ts
// stats.test.ts: generic over every fixture under test/golden/stats/*.json except tables.json
for (const file of fixtures) describe(`stats: ${file}`, () => {
  const fx = readFixture<{ cases: CapturedRun[] }>("stats", file); const mode = goldenMode(fx);
  for (const c of fx.cases) it(c.id, () => {
    const data = statsParseText(c.csv)!; const r = runStats(data, c.test, c.form);
    if (c.apa === null && c.toasts.length) { expect(r).toMatchObject({ ok: false, reason: "toast", toast: c.toasts[0] }); return; }
    if (c.apa === "" ) { expect(r.ok).toBe(false); expect((r as StatsFail & { reason: "undefined" }).reason).toBe("undefined"); }
    else { expect(r.ok).toBe(true); expect((r as StatsOk).apa).toBe(c.apa); }
    const blocks = r.ok ? r.blocks : r.reason === "undefined" ? r.blocks : [];
    expect(blocks.map(b => b.kind)).toEqual(c.blocks.map(b => b.kind));
    blocks.forEach((b, i) => expectGolden(blockAsText(b), blockAsText(c.blocks[i]!), mode, `${c.id} block ${i}`));   // cells and notes as decoded text
    expect(renderResultsText(r)).toBe(c.resultsText);
    expect(c.toasts).toEqual([]);
  });
});
it("STAT_TESTS equals v1's table", () => expect(STAT_TESTS).toEqual(readFixture("stats", "tables").tables.STAT_TESTS));
it("ttest1-text-in-numeric: the note says 4 entries (Review Focus 1, register D-W2-4)", ...);
it("desc-column-named-undefined is suppressed by the safety net (F22)", ...);
```

Note the safety-net case: v1's `#statsSentence` is absent (apa `null`) and the toast list is empty; the fixture records `apa: null, toasts: []` with one note block. Make the branch explicit: `c.apa === null && c.toasts.length === 0` → `reason: "undefined"`.

- [ ] **Step 4: Run to verify they fail, port, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- stats`
Expected: FAIL (modules missing), then PASS for every case in both fixtures. Port `statsGroupBy` with `const groups: Record<string, number[]> = {}` and `Object.keys` (F4); keep `stkBinData`'s `['1','yes','true','y','present','agree']` list and its sort; keep `stkAssumpBlock`'s message order and texts; keep `desc`'s `Math.min(...vals)`.

- [ ] **Step 5: Register, export, commit**

Rows: `D-W2-4` (noted: the doubled "left out" count, lines 11993–11995 and 8800–8803, ported as is, pinned by `ttest1-text-in-numeric`); `F22` (noted, pinned by `desc-column-named-undefined`); `F27` (noted: `statsChart*` 11884–11979 draw with Chart.js from a non-zero axis and are not ported; Wave 5 chooses the chart approach; the data each chart needs is in `values` and `blocks`); `D-W2-3` (noted: unknown test key); `D-W2-5` (noted: `StatsForm` carries what the form held; `statsFieldsRender`'s defaults, "when two fields share a type, default each to a different column", 11809–11833, are the panel's and are pinned when the Wave 5 panel lands). Export `StatsTestKey`, `StatsForm`, `StatsCtx`, `StatsBlock`, `StatsResult`, `StatsOk`, `StatsFail`, `STAT_TESTS`, `runStats`, `statsColVals`, `statsGroupBy`, `stkIsBinaryCol`, `stkBinData`, `stkBinom5`, `sig`, `stkAssumpBlock`, `stkAssumpFor`, `stkAnova2Cells`, `stkMRData`, `finishResult`.

```bash
git commit -m "feat(core): Statistics Lab frame (runStats, blocks, assumption checks, safety net) with desc and the one-sample t-test golden-equal to v1"
```

---

### Task 4: Tests on means (ttestInd, ttestPaired, anova1, tukey, regression, pearson)

**Files:**
- Modify: `packages/core/src/stats-means.ts`, `stats.ts` (dispatch), `index.ts`
- Create: `test/golden/stats/corpus/{ttestInd,ttestPaired,anova1,tukey,regression,pearson}.json`, fixtures `stats/<test>.json`, `test/golden/stats/scipy-reference.py`, `stats/scipy-reference.json`
- Test: `test/golden/stats-scipy.test.ts` (new; grows per task)

**v1 source:** 12641–12664 (`ttestInd`), 12665–12683 (`ttestPaired`), 12684–12701 (`anova1`), 12702–12724 (`tukey`), 12725–12750 (`regression`), 12795–12819 (`pearson`).

**Interfaces:**
- Produces: `runTtestInd`, `runTtestPaired`, `runAnova1`, `runTukey`, `runRegression`, `runPearson`, each `(ctx: StatsCtx) => StatsResult`. `values`: ttestInd `{ n1, n2, m1, m2, v1, v2, t, df, p, tS, dfS, pS, dcohen, gH, ciLo, ciHi }`; ttestPaired `{ n, md, sdv, t, df, p, dz, plo, phi }`; anova1 `{ N, k, F, dfb, dfw, p, eta2 }`; tukey `{ kk, dfw, msw, qc }` plus `pair_<i>_<j>: { diff, q, pq }` flattened as `diff_i_j`, `q_i_j`, `p_i_j`; regression `{ n, b0, b1, seB1, t, df, p, F, pF, r2, lo1, hi1, seB0, beta }`; pearson `{ n, r, df, t, p, cl, ch }` (cl, ch present when n > 3).
- Produces (`stats/scipy-reference.py`): reads every `stats/<test>.json`, re-parses each case's `csv` with v1's rules (split on the first line's delimiter, tab else comma; quoted fields; numeric `^-?\d+(\.\d+)?$`; rows of the wrong length dropped) and reproduces `statsGroupBy`'s order (keys that are canonical non-negative integers first, ascending, then the rest in first-seen order; a row whose value is not numeric is dropped), then writes `{ scipy, cases: [{ test, id, ref: {...} | null, why?: string }] }` with, per test: ttestInd `ttest_ind(equal_var=False)` → `t, p, df` and `equal_var=True` → `tS, pS`; ttestPaired `ttest_rel` → `t, p`; anova1 `f_oneway` → `F, p`; tukey `tukey_hsd` → `p_i_j` per pair; regression `linregress` → `b1, b0, seB1, p, r2` (`r2 = rvalue**2`) and `F = t**2`; pearson `pearsonr` → `r, p` and `confidence_interval()` → `cl, ch`. `ref: null` with `why` when v1 refused the case (toast) or the test is unsupported.
- Produces (`stats-scipy.test.ts`): for every reference case with `ref`, the port's `values[key]` within a relative 1e-6 of `ref[key]` (absolute 1e-9 when `ref[key]` is 0; for `t` compare absolute values, since the group order sets the sign). Names scipy 1.17.1.

- [ ] **Step 1: Write the corpora**

Each file at least 6 cases; required ids: the TG_DEMO case (`<test>-demo`; `tukey-demo-arms` uses the `anova1` demo's data under `tukey`; `anova1` the demo too, though TG_DEMO sends it to `welchAnova`), `<test>-text-in-numeric` (for ttestInd and anova1: the doubled count), `ttestInd-integer-labels` (groups `3, 2, 10, NA`: toast, 4 groups), `ttestInd-two-integer-labels` (`10` and `2`: order 2, 10, sign of the difference), `ttestInd-group-named-NaN` (F22), `ttestInd-one-value-in-a-group` (toast), `ttestInd-no-spread-both` (toast), `ttestInd-no-spread-one` (runs), `ttestInd-unequal-n`, `ttestPaired-same-diffs` (toast), `ttestPaired-missing-cells`, `ttestPaired-n2`, `anova1-two-groups` (toast), `anova1-one-row-group` (SD prints `—`), `anova1-no-spread` (toast), `anova1-six-groups`, `anova1-hindi-labels`, `tukey-integer-labels` (`3, 2, 10`: pair order), `tukey-two-groups` (toast), `tukey-six-groups`, `regression-exact-line` (toast "fall exactly on a straight line"), `regression-no-spread-x` (toast), `regression-n2` (toast), `regression-negative-slope`, `pearson-n3` (no CI line), `pearson-perfect` (r 1: `t` infinite → safety net), `pearson-negative`, `pearson-no-spread` (toast).

- [ ] **Step 2: Capture and write the scipy reference**

Run: `pnpm --filter @appuscholar/core golden:capture stats && uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/stats/scipy-reference.py packages/core/test/golden/stats`

- [ ] **Step 3: Run to verify the new fixtures fail, port the six branches, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- stats`
Expected: FAIL (unknown keys return the catch toast), then PASS. Keep `apa.replace(/\.$/,'')+', '+ciTxt+'.'` (ttest1 style) and `apa.replace(/, d = /, …)` (ttestPaired) and `apa.replace(/, R² = /, …)` (regression) as string operations on the sentence; keep `1.959963984540054`; keep `Math.max(0,1-stkPtukey(...))`; keep `noLead(pq<0.001?'< .001':pq.toFixed(3))` in the Tukey cell (it is not `pCell`).

- [ ] **Step 4: Register, export, commit**

Rows: `F4` (approved by Decision 2 ruling, 2026-10-17; pinned by `ttestInd-two-integer-labels`, `tukey-integer-labels`); the Tukey p cell prints `< .001` without the entity (12713), a display difference from `pCell` that changes no text: noted as `D-W2-6`, pinned by a tukey case with p < .001. Export the six runners.

```bash
git commit -m "feat(core): independent, paired t, one-way ANOVA, Tukey, simple regression and Pearson golden-equal to v1 and within 1e-6 of scipy"
```

---

### Task 5: Rank tests and Welch ANOVA (mannwhitney, wilcoxon, kruskal, spearman, welchAnova)

**Files:**
- Create: `packages/core/src/stats-ranks.ts`; corpora and fixtures for the five tests
- Modify: `stats.ts`, `index.ts`, `stats/scipy-reference.py` and `.json`, `stats-scipy.test.ts`, `parity-deviations.md`

**v1 source:** 12751–12771 (`mannwhitney`), 12772–12794 (`wilcoxon`), 13116–13136 (`welchAnova` with Games-Howell), 13165–13187 (`kruskal` with Dunn), 13188–13202 (`spearman`).

**Interfaces:**
- Produces: `runMannwhitney`, `runWilcoxon`, `runKruskal`, `runSpearman`, `runWelchAnova`. `values`: mannwhitney `{ n1, n2, U, U1, U2, z, p, rrb, exact: 0|1 }`; wilcoxon `{ n, W, wPlus, wMinus, z, p, rbc, exact }`; kruskal `{ H, df, p, eps2 }` + `padj_i_j` when post-hoc ran; spearman `{ n, rho, df, p, lo, hi }`; welchAnova `{ F, df1, df2, p, omega2 }` + `gh_p_i_j`, `gh_diff_i_j`, `gh_lo_i_j`, `gh_hi_i_j` when significant.
- scipy: mannwhitney `mannwhitneyu(method="exact" if v1's exactOK else "asymptotic", use_continuity=True)` → `U` (scipy reports U1 of the first group: compare `min(U1, n1*n2-U1)` with v1's `U`) and `p`; wilcoxon `wilcoxon(x, y, method="exact"|"approx", correction=True, zero_method="wilcox")` → `p` and `W` (`min(W+, W−)`); kruskal `kruskal` → `H, p`; spearman `spearmanr` → `rho, p`; welchAnova: `f_oneway(*groups, equal_var=False)` if scipy 1.17.1's `f_oneway` has `equal_var`, else `ref: null, why: "no Welch ANOVA in scipy"`; Games-Howell, Dunn and the Spearman interval: `null`, "matches v1".

- [ ] **Step 1: Write the corpora**

Required ids: the demos (`mannwhitney-demo`, `wilcoxon-demo`, `kruskal-demo`, `spearman-demo`, `welchAnova-demo` on the `anova1` demo data), `mannwhitney-integer-labels` (`10` vs `2`: order and "tends to score higher"), `mannwhitney-decimal-ties` (`1.1, 1.0, 2.2, 2.1` across groups: exact branch, F15), `mannwhitney-ties` (normal approximation), `mannwhitney-n50` (one group of 50: approximation), `mannwhitney-all-same` (toast), `mannwhitney-three-groups` (toast), `wilcoxon-decimal-ties` (pairs `(1.1,1.0)` and `(2.2,2.1)`: exact), `wilcoxon-zero-diffs` (one pair equal: n excludes it, approximation), `wilcoxon-one-diff` (toast), `wilcoxon-n50`, `kruskal-group-column-named-group` (the demo: "across the group groups", F2), `kruskal-non-significant` (no Dunn table), `kruskal-small-group` ("fewer than 5 values" note), `kruskal-all-same` (toast), `kruskal-two-groups` (toast), `spearman-tiny-p` (13 pairs with rho near 1: the cell prints `.000` while the sentence prints `p < .001`, F1), `spearman-text-dropped-uncounted` (text cells: no "left out" line, F18), `spearman-n4` (toast), `spearman-n9` ("fewer than 10 pairs" note), `spearman-perfect-negative` (p 0), `welchAnova-non-significant` (no Games-Howell), `welchAnova-constant-group` (toast), `welchAnova-two-groups` (toast), `welchAnova-text-in-numeric` (doubled count), `welchAnova-hindi-labels`.

- [ ] **Step 2: Capture, reference, failing tests, port, pass**

Run: `pnpm --filter @appuscholar/core golden:capture stats && uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/stats/scipy-reference.py packages/core/test/golden/stats && pnpm --filter @appuscholar/core test:golden -- stats`
Expected: FAIL, then PASS. Keep `Math.min(0,U-meanU+0.5)/sdU`, `stkTieTerm(combined)>0` as the tie test (F15), `n1<50&&n2<50`, `Math.max(1e-12, …)` in `sdW`, `noLead(sp.p.toFixed(3))` in the Spearman cell (F1), the missing skipped count in Spearman (F18: its filter has no counter), the Kruskal sentence's `' groups'` suffix (F2).

- [ ] **Step 3: Register, export, commit**

Rows: `F1` (proposed: display only; pinned by `spearman-tiny-p`), `F2` (proposed: wording; pinned by `kruskal-group-column-named-group`), `F15` (noted; `mannwhitney-decimal-ties`, `wilcoxon-decimal-ties`), `F18` (proposed; `spearman-text-dropped-uncounted`), `F9` (noted: ω² beside Welch F from classic sums; `welchAnova-demo`), `F7` (update the existing row's "pinned by" with `spearman-demo` vs scipy). Ledger labels: Games-Howell, Dunn with Holm, the Spearman interval, ω² "matches v1".

```bash
git commit -m "feat(core): Mann-Whitney, Wilcoxon, Kruskal-Wallis with Dunn, Spearman and Welch ANOVA with Games-Howell golden-equal to v1; scipy agreement where it has the test"
```

---

### Task 6: Tests on counts (chisq, gof, mcnemar, cochran, friedman)

**Files:**
- Create: `packages/core/src/stats-counts.ts`; corpora and fixtures for the five tests
- Modify: `stats.ts`, `index.ts`, the scipy script and json, `stats-scipy.test.ts`, `parity-deviations.md`

**v1 source:** 12820–12860 (`chisq`, with Yates, Fisher 2×2, Fisher-Freeman-Halton), 13137–13164 (`gof`, with the exact binomial), 13203–13223 (`mcnemar`), 13224–13249 (`cochran`), 13250–13280 (`friedman`).

**Interfaces:**
- Produces: `runChisq`, `runGof`, `runMcnemar`, `runCochran`, `runFriedman`. `values`: chisq `{ N, df, chi2, p, v, chiY?, pY?, minE, lowC, fisherP?, fisherOr?, ffhP?, ffhTables? }`; gof `{ N, k, chi2, df, p, w, minE, binomP? }`; mcnemar `{ n, a, b, c, dd, nd, pEx, chi, pChi, useEx: 0|1, p1, p2 }`; cochran `{ n, k, Q, df, pQ }` + `pair_p_i_j`; friedman `{ n, k, chi, df, pF, W }` + `pair_p_i_j`.
- scipy: chisq `chi2_contingency(table, correction=False)` → `chi2, p`, `correction=True` → `chiY, pY` (2×2 only), `fisher_exact` → `fisherP` and the sample odds ratio (F8: compare `a*d/(b*c)`, not scipy's conditional MLE); gof `chisquare(obs, exp)` → `chi2, p`, `binomtest(obs[0], N, share[0])` → `binomP`; mcnemar `binomtest(b, nd, 0.5)` → `pEx`, `chi` from the formula with continuity (an independent arithmetic, labelled "formula"); friedman `friedmanchisquare` → `chi, pF` (scipy corrects for ties as v1 does); cochran and Fisher-Freeman-Halton: `null`, "matches v1". The table for chisq keeps v1's `Set` order (data order) in the script.

- [ ] **Step 1: Write the corpora**

Required ids: `chisq-demo`, `chisq-integer-labels` (values `10, 2, 3` in data order: F4's other branch), `chisq-2x2-small-expected` (Fisher reported in the sentence), `chisq-2x2-empty-cell` (odds ratio `undefined (an empty cell)`: the safety-net exception), `chisq-3x3-sparse` (Fisher-Freeman-Halton, N ≤ 200), `chisq-3x4-sparse-large-N` (N > 200: "too many possible tables"), `chisq-one-value-column` (toast), `chisq-hindi-categories`, `gof-demo`, `gof-expected-shares` (`Notes:30, Flashcards:50, Rereading:20`), `gof-expected-bad` (toast), `gof-expected-missing-category` (toast), `gof-two-categories-small` (exact binomial sentence), `gof-three-categories-small` (note only), `gof-one-category` (toast), `mcnemar-yes-no`, `mcnemar-pos-given` (`pos: no`), `mcnemar-pos-unknown` (toast with the curly quotes), `mcnemar-no-changers` (toast), `mcnemar-nd25` (χ² branch), `mcnemar-three-answers` (toast), `mcnemar-same-column` (toast), `cochran-four-conditions`, `cochran-non-significant`, `cochran-two-columns` (toast), `cochran-all-same` (toast), `cochran-nine-columns` (toast), `friedman-four-conditions`, `friedman-ties`, `friedman-all-same` (toast), `friedman-n2` (toast), `friedman-two-columns` (toast), `friedman-missing-row` (skipped count).

- [ ] **Step 2: Capture, reference, failing tests, port, pass**

Same commands as Task 5. Keep the `Set` spread order in chisq (12823), `fx.tables.toLocaleString('en-US')`, the Yates `Math.max(0,Math.abs(o-e)-0.5)`, `lowC/nCells>0.2`, `N<=200`, `nd<25` in McNemar, the curly quotes in `stkBinData`'s error, the `(Math.abs(b-c)-1)*(Math.abs(b-c)-1)/nd` form.

- [ ] **Step 3: Register, export, commit**

Rows: `F8` (noted: sample odds ratio; pinned by `chisq-2x2-small-expected` vs scipy's `a*d/(b*c)`), `D-W2-7` (noted: `toLocaleString('en-US')` in the FFH note, 12851 and 13106, is pinned in Node, whose en-US grouping is Chrome's). Labels: Cochran's Q, FFH, McNemar's χ² form "matches v1 (formula)".

```bash
git commit -m "feat(core): chi-square with Fisher and FFH, goodness of fit with the exact binomial, McNemar, Cochran's Q and Friedman golden-equal to v1"
```

---

### Task 7: Two-way ANOVA and multiple regression (anova2, mregress)

**Files:**
- Create: `packages/core/src/stats-factorial.ts`; corpora and fixtures `anova2`, `mregress`
- Modify: `stats.ts`, `index.ts`, the scipy script and json (numpy OLS), `stats-scipy.test.ts`, `parity-deviations.md`

**v1 source:** 12861–12931 (`anova2`: cells, Type III table, simple effects, Tukey on marginal means, Bonferroni within levels), 12932–12981 (`mregress`: OLS, VIF, hierarchical step 2).

**Interfaces:**
- Produces: `runAnova2`, `runMregress`. `values`: anova2 `{ la, lb, N, sse, dfe, mse, F_A, p_A, eta_A, F_B, p_B, eta_B, F_AB, p_AB, eta_AB, balanced: 0|1 }` plus `se_A_<i>_F`, `se_A_<i>_p`… when simple effects ran; mregress `{ n, k, dfe, r2, adj, F, pF, b_<j>, se_<j>, t_<j>, p_<j>, vif_<j>, beta_<j> }` and `{ k1, r21, adj1, F1, p1, dR, Fc, pc }` when step 2 ran.
- Reference: numpy `lstsq` on the design with intercept → `b_j`, `se_j` from `mse*(X'X)^-1`, `t`, `p` (`t.sf`), `F`, `pF`, `r2`, `adj`, VIF by regressing each predictor on the others, the step-2 F change: an "independent numpy computation" labelled so in the ledger. anova2: `null`, "matches v1 (Type III, no R here)".

- [ ] **Step 1: Write the corpora**

`anova2`: `anova2-2x2-balanced`, `anova2-2x3-unbalanced` (unequal cells note), `anova2-integer-labels` (`A` levels `10, 2`: data order kept, 8786), `anova2-interaction-significant` (simple effects and Bonferroni pairwise tables; construct with a crossing pattern), `anova2-main-effect-3-levels` (Tukey on marginal means), `anova2-same-factor-twice` (toast), `anova2-one-level` (toast), `anova2-seven-levels` (toast), `anova2-empty-cell` (toast with the count), `anova2-dfe-zero` (toast), `anova2-no-spread` (toast), `anova2-text-in-numeric` (skipped from `stkAnova2Cells`, counted once).
`mregress`: `mregress-two-numeric`, `mregress-categorical-3-levels` (reference level the largest group), `mregress-ref-given` (`ref: group=Control`), `mregress-step2` (hierarchical table and sentence), `mregress-step2-no-step1` (toast), `mregress-one-predictor` (toast), `mregress-thirteen-columns` (toast), `mregress-few-rows` (toast with the counts), `mregress-collinear` (toast), `mregress-exact-fit` (toast), `mregress-vif-high` (VIF note), `mregress-small-level` ("fewer than 5 rows" note), `mregress-missing-rows` (dropped note), `mregress-dv-ticked-as-predictor` (the dv index is filtered out of the ticks).

- [ ] **Step 2: Capture, reference, failing tests, port, pass**

Same commands. Keep `stkRSS`'s pivot and `1e-9*scale`, the `cellOf` closure, the `Lo*Lo` factor in the marginal-mean q, `Math.min(1,q.p*fam)`, the `<code>anova()</code>` in the note, `k>12`, `n<k+3`, `n<10*k`, the VIF thresholds 5 and 10.

- [ ] **Step 3: Register, export, commit**

Rows: `F11` (noted: Type III never compared with R or SPSS; labelled "matches v1"; Decision 3 names the reference run). Export both runners.

```bash
git commit -m "feat(core): two-way ANOVA (Type III, simple effects, pairwise) and multiple regression (VIF, hierarchical) golden-equal to v1; OLS within 1e-6 of numpy"
```

---

### Task 8: Logistic regression, repeated-measures ANOVA, alpha and omega (logistic, rmanova, alpha)

**Files:**
- Create: `packages/core/src/stats-models.ts`; corpora and fixtures `logistic`, `rmanova`, `alpha`
- Modify: `stats.ts`, `index.ts`, scipy script and json, `stats-scipy.test.ts`, `parity-deviations.md`

**v1 source:** 12982–13024 (`logistic`), 13281–13333 (`rmanova`: sphericity, Mauchly, GG/HF, pairwise), 13400–13455 (`alpha`: α with its F interval, ω with bootstrap, item table).

**Interfaces:**
- Produces: `runLogistic`, `runRmanova`, `runAlpha`. `values`: logistic `{ n, k, ev, ne, lr, pLR, cs, nag, mcf, auc, acc, sens, spec, tp, tn, fp, fn, b_<j>, se_<j>, z_<j>, p_<j>, or_<j>, lo_<j>, hi_<j>, vif_<j> }`; rmanova `{ n, k, ssc, sss, sst, sse, F, d1, d2, pU, gg, hf, W, chi, pM, dfM, eps, pC, pe2, ge2 }` + `pair_t_i_j`, `pair_p_i_j`; alpha `{ n, k, alpha, aciLo, aciHi, omega?, ociLo?, ociHi?, meanR, rit_<j>, ad_<j>, load_<j> }`.
- Reference (numpy/scipy, "independent computation"): logistic by `scipy.optimize.minimize` of the negative log-likelihood (BFGS, tol 1e-10) → `b_j`; SEs from the inverse Hessian at the optimum (computed analytically); `lr`, `pLR` (`chi2.sf`), `nag`, `auc` (`roc` by the Mann-Whitney form); tolerance 1e-5 relative for coefficients (optimiser tolerance), 1e-6 for the rest. rmanova: sums of squares, `F`, `pU`, GG ε from the covariance of the transformed scores, Mauchly `W` and its χ² as in evidence 05 → 1e-6. alpha: `alpha` from the variance formula, its interval from `f.ppf` → 1e-6; ω and its bootstrap: `null`, "matches v1".

- [ ] **Step 1: Write the corpora**

`logistic`: the 20-row sample of evidence 05 as `logistic-evidence-05`, `logistic-yes-no-outcome`, `logistic-pos-given`, `logistic-categorical-predictor`, `logistic-ref-given`, `logistic-separation` (toast), `logistic-collinear` (toast), `logistic-few-events` (toast), `logistic-no-predictor` (toast), `logistic-epv-note`, `logistic-three-answers` (toast from `stkMRData`), `logistic-missing-rows`.
`rmanova`: `rmanova-three-conditions`, `rmanova-four-conditions-gg` (ε < .75), `rmanova-hf` (ε ≥ .75), `rmanova-non-significant` (no pairwise), `rmanova-pair-no-spread` (`—` row), `rmanova-n-le-k` (toast), `rmanova-same-change` (toast), `rmanova-two-columns` (toast), `rmanova-missing-row` (skipped), `rmanova-nine-columns` (toast).
`alpha`: `alpha-demo` (q6 reversed, `rrange 1-5`), `alpha-no-reverse` (the demo without `rev`: lower alpha), `alpha-rev-not-found` (toast), `alpha-rev-no-range` (toast), `alpha-rev-bad-range` (toast), `alpha-two-items` (toast), `alpha-n4` (toast), `alpha-constant-item` (toast), `alpha-negative-item` (note), `alpha-weak-item` (note), `alpha-above-95` (note), `alpha-n-under-30` (note; the demo has 15), `alpha-large-boot-200` (n·k > 40,000: 200 resamples, F13; e.g. 7,000 rows × 6 items generated deterministically in the corpus builder and stored inline).

- [ ] **Step 2: Capture, reference, failing tests, port, pass**

Same commands. Keep the `.50` cut-off, `1.959963984540054`, `epv<10`, Mauchly's `fW`, the determinant loop with `1e-300`, `gg<0.75`, the α interval through `stkFQuant(0.975, n-1, (n-1)*(k-1))`, `n*k>40000?200:400`, the ω note's "400" text (F13), `Math.sign(r2.load)*Math.min(1,Math.abs(r2.load))`.

- [ ] **Step 3: Register, export, commit**

Rows: `F13` (proposed, copy: the note says 400 resamples always while 200 run above n·k 40,000; the number stays; pinned by `alpha-large-boot-200`), `F12` updated with the logistic cases. Labels: ω and its interval "matches v1"; logistic and rmanova "independent numpy computation".

```bash
git commit -m "feat(core): logistic regression, repeated-measures ANOVA and alpha/omega golden-equal to v1; coefficients, F and alpha within tolerance of an independent numpy computation"
```

---

### Task 9: Mixed ANOVA, moderation, mediation (mixed, moderate, mediate)

**Files:**
- Create: `packages/core/src/stats-advanced.ts`; corpora and fixtures `mixed`, `moderate`, `mediate`
- Modify: `stats.ts`, `index.ts`, scipy script and json, `stats-scipy.test.ts`, `parity-deviations.md`

**v1 source:** 13334–13399 (`mixed`), 13025–13072 (`moderate`, with simple slopes and Johnson-Neyman), 13073–13115 (`mediate`, with the seeded percentile bootstrap).

**Interfaces:**
- Produces: `runMixed`, `runModerate`, `runMediate`. `values`: mixed `{ n, G, k, SSg, SSs, SSt, SSi, E, Fg, pg, Ft, pt, Fi, pi, gg, hf, W, chi, pM, epsV, ptc, pic, peg, pet, pei }`; moderate `{ n, r2, F, pF, dr2, Fc, pFc, b_<j>, se_<j>, t_<j>, p_<j>, sl_lo_b, sl_mid_b, sl_hi_b, sl_lo_p, sl_mid_p, sl_hi_p, roots: count }`; mediate `{ n, a_b, a_p, b_b, b_p, cp_b, cp_p, c_b, c_p, ab, lo, hi, bse, abStd, r2m, r2y, okCount }`.
- Reference: moderate's OLS pieces (`b_j`, `se_j`, `r2`, `F`, `Fc`, simple slopes and their SEs) by numpy from the same centred design → 1e-6, "independent numpy computation"; the Johnson-Neyman region and the sentence: "matches v1". mediate's four paths by numpy OLS → 1e-6; `ab`, `lo`, `hi`, `bse`: "matches v1 (seeded bootstrap, F14)". mixed: `null`, "matches v1 (F10)".

- [ ] **Step 1: Write the corpora**

`mixed`: `mixed-two-groups-two-times` (k 2: no sphericity row), `mixed-two-groups-three-times` (GG), `mixed-three-groups-unequal` (unequal-sizes note), `mixed-integer-labels` (groups `10, 2`: data order, 13341), `mixed-interaction-significant`, `mixed-one-group` (toast), `mixed-group-of-one` (toast naming the group), `mixed-seven-groups` (toast), `mixed-one-column` (toast), `mixed-group-column-ticked` (the grouping column is filtered out of the ticks), `mixed-no-variation` (toast), `mixed-missing-row` (skipped).
`moderate`: `moderate-significant` (JN with two roots inside the range), `moderate-everywhere-significant`, `moderate-nowhere-significant`, `moderate-one-root`, `moderate-n9` (toast), `moderate-same-columns` (toast), `moderate-no-spread-w` (toast), `moderate-w-copy-of-x` (toast), `moderate-exact-fit` (toast), `moderate-n-under-50` (note), `moderate-missing-rows`.
`mediate`: `mediate-significant` (n 100, built from a seeded linear model written out in the corpus), `mediate-non-significant`, `mediate-n19` (toast), `mediate-no-spread` (toast), `mediate-m-copy-of-x` (toast), `mediate-exact-path` (toast), `mediate-n-under-100` (note), `mediate-same-n-different-data` (two cases of equal n: the bootstrap seed depends only on n, F14).

- [ ] **Step 2: Capture, reference, failing tests, port, pass**

Same commands. Keep the Helmert-like `H` rows normalised by `Math.sqrt(r*(r+1))`, `varf`, the `E>1e-9*(E+SSt+SSi)` guard, `dd`'s `1e-9` rounding of df text; the JN quadratic with `1e-12` guards; the mediation `rnd` closure (`sd0=(n*2654435761+12345)>>>0`, note `2654435761` is a plain number literal, not `Math.imul`), `REPS=5000`, `den>1e-12*Math.abs(smm*sxx)`, the quantile interpolation `qf`.

- [ ] **Step 3: Register, export, commit**

Rows: `F10` (noted: mixed with unequal groups never compared with SPSS; "matches v1"), `F14` (noted: bootstrap seed from n; pinned by `mediate-same-n-different-data`). Export the three runners; `runStats` now dispatches all 26 keys.

```bash
git commit -m "feat(core): mixed ANOVA, moderation with Johnson-Neyman and mediation with the seeded bootstrap golden-equal to v1 (labelled: matches v1)"
```

---

### Task 10: Which-test guide, "Check my numbers", practice gate and demos (S5)

**Files:**
- Create: `packages/core/src/guide.ts`, `packages/core/src/data/guide-tables.ts` (generated)
- Create: `packages/core/test/golden/guide/capture.ts`, `guide/cases.json`, `guide/tables.json`
- Test: `packages/core/test/golden/guide.test.ts`
- Modify: `index.ts`, `engines.ts`, `parity-deviations.md`

**v1 source:** 12038–12047 (`TG_Q`), 12048–12075 (`tgNext`), 12076–12099 (`TG_RES`), 12385–12394 (`TG_IMP`), 12395–12417 (`TG_EXTRA`), 12418–12432 (`TG_DEMO`), 12484 (`tgRes`), 12531–12533 (`tgSkew`, `tgQuant`, `tgOutliers`), 12534–12561 (`tgCheck`), 12562–12573 (`GEN_DESIGNS`), 12588–12601 (`genReveal`). Reference only: `tgWhyHTML` 12433, `tgDemoHTML` 12440, `tgDemo` 12459, `tgRender` 12497, `tgCheckHTML` 12520, `genGateShow` 12580.

**Interfaces:**
- Produces (`guide.ts`): `TG_Q`, `TG_RES`, `TG_IMP`, `TG_EXTRA`, `TG_DEMO`, `GEN_DESIGNS` re-exported from the generated tables; `type TgAnswers = Partial<Record<"goal"|"cmpOut"|"cmpDes"|"smp"|"relOut"|"prdOut"|"prdN"|"cntDes", string>>`; `tgRes(k, a)`; `tgNext(a: TgAnswers): { ask: string } | { res: TgResult }` with `TgResult = { id; built: boolean; name; keys; why; alt; note? }`; `tgWhyItems(a, r): Array<{ answer: string; why: string }>` (the data of `tgWhyHTML` 12434–12436: the option label and the `TG_IMP` text per answered question in `order`) plus `tgExtra(r.id)`; `tgSkew(a)`, `tgQuant(sorted, q)`, `tgOutliers(a)`; `tgCheckNumbers(ctx: StatsCtx, numIdx: number, grpIdx: number | null): { rows: Array<{ group; n; skew: string; outliers }>; rank: boolean; tiny: boolean }` (12537–12546: the table cells as strings, `skew` already `toFixed(2)` or `'–'`); `tgCheckCounts(data, i1, i2): { r; c; N; minE: string; low; cells; ok: boolean }` (12548–12554); `TG_CHECK_TEXT` constants for the three sentences (12543, 12545, 12554) so the panel does not retype them; `genVerdict(designKey, testKey, labelOf: (key) => string): { head; cls: "good"|"warn"; why; switchTo?: { key; label } }` (12588–12600; `labelOf` is `STAT_TESTS[key].label` in the test, what the `<option>` text is).
- Consumes: `statsColVals`, `statsGroupBy`, `StatsCtx` (Task 3), `smean`, `ssd` (Task 1), `STAT_TESTS`.

- [ ] **Step 1: Capture**

`guide/capture.ts`: (a) `tgNext` over every answer path: breadth-first from `{}`, following each `ask` with each option of `TG_Q[ask].o`, recording `{ answers, out }` for every node (expect under 60 leaves; the capture asserts every leaf has `res`); (b) `tgRes` for every key of `TG_RES`; (c) `tgSkew`/`tgQuant`/`tgOutliers` on 8 lists (n 2, 3, constant, skewed, with outliers, decimals); (d) `tgCheck` page-bound on the 13 demo CSVs and 6 edge sets: paste and parse, inject `tgCheckHTML()` into a holder `<div>`, set `#tgNum`, `#tgGrp`, `#tgC1`, `#tgC2`, call `tgCheck()`, read `#tgCheckOut` into blocks (the same parser as `stats/drive.ts`, exported from there); (e) `genReveal` for every `GEN_DESIGNS` key × every `STAT_TESTS` key (10 × 26): set `#statsTest`, inject `genGateShow()`'s HTML, set `#genDesign`, call `genReveal()`, read `#genReveal`'s `p` texts and whether a "Switch to" button exists; (f) emit `TG_Q`, `TG_RES`, `TG_IMP`, `TG_EXTRA`, `TG_DEMO` (with its evaluated `csv` strings), `GEN_DESIGNS` into `data/guide-tables.ts`.

Run: `pnpm --filter @appuscholar/core golden:capture guide --emit`

- [ ] **Step 2: Failing tests, port, pass**

```ts
it("tgNext: every answer path of the fixture gives v1's ask or result", ...);        // toEqual per node
it("the paths cover every TG_RES key except mixed, which tgNext never reaches (F20)", ...);
it("tgCheck: numbers and counts blocks equal v1's for each case", ...);               // blockAsText through expectGolden
it("genVerdict: 260 combinations equal v1's head, why and switch target", ...);
it("tables equal v1's", ...);                                                          // tables.json vs the generated module
```

Run: `pnpm --filter @appuscholar/core test:golden -- guide`
Expected: FAIL, then PASS. Keep `tgSkew`'s adjusted Fisher-Pearson form and `tgQuant`'s interpolation; keep the `g.length<20&&(Math.abs(sk)>1||ol>0)` rule and the `<5` rule; keep `genReveal`'s three heads verbatim.

- [ ] **Step 3: Register, export, commit**

Rows: `F20` (proposed: `tgNext` never routes to `mixed`; `rmanova`, `friedman`, `twoway` carry `keys: []` and read "not built" while the lab runs them; port as is; pinned by the path test), `F16` (noted: two skews, `tgSkew` adjusted and the histogram's `m3/n`, pinned here and in Task 12). Export everything above.

```bash
git commit -m "feat(core): which-test guide (tgNext over every path), check-my-numbers, practice gate and demo tables golden-equal to v1"
```

---

### Task 11: Power, sample size and the simulator (S6)

**Files:**
- Create: `packages/core/src/power.ts`, `packages/core/src/data/power-tables.ts` (generated)
- Create: `packages/core/test/golden/power/capture.ts`, `power/cases.json`, `power/tables.json`
- Test: `packages/core/test/golden/power.test.ts`
- Modify: `index.ts`, `engines.ts`

**v1 source:** 13458–13466 (`PW_INFO`), 13479 (`pwArt`), 13480 (`pwNum`), 13481–13531 (`pwRun`), 9007–9043 (`plRun`). Reference only: `pwTestChange` 13467, `pwOpen` 13478, `plPreset` 9006.

**Interfaces:**
- Produces: `PW_INFO` (re-exported); `pwArt(w)`; `pwNum(raw: string): number` (`parseFloat(String(raw).replace(',','.').trim())`); `type PowerInput = { test: keyof typeof PW_INFO; mode: "n"|"power"|"effect"; alpha: string; tails: string; drop: string; effect: string; n: string; power: string; k: string; p: string; df: string }` (the raw field strings, as `pwRun` reads them); `powerCompute(i: PowerInput): { ok: true; blocks: StatsBlock[]; sentence: string; values: Record<string, number> } | { ok: false; error: string }` where `blocks` are the `h4` (heading), `p.desc` (note) and table pieces of 13497–13525 in order, **without** the closing "For your methods section" note, the sentence box and the "Power is worked out for one planned test" note (static copy: exported as `POWER_FOOTER_NOTE`; the panel renders it); `values` holds `n`, `total`, `pw`, `rec`, or `e` as the branch computes them. `simulatorCompute(d: number, n: number, k: number, seed: number): { ok: true; res; sig; pos; rate; meanPos; pw; bins; svg: string; texts: string[]; last: { d; n; k; seed; sig; meanSig; pw } } | { ok: false; warn: string }` (9010–9041: `texts` are the paragraphs' inner HTML in order, `svg` the string).
- Consumes: `pwPower`, `pwSolveN`, `pwSolveEffect`, `plSim` (Task 1).

- [ ] **Step 1: Capture**

Page-bound: for each case set `#pwTest`, `#pwSolve`, `#pwAlpha`, `#pwTails`, `#pwDrop`, `#pwEffect`, `#pwN`, `#pwPow`, `#pwK`, `#pwP`, `#pwDf`, call `pwRun()`, parse `#pwOut` (h4 → heading, `p.desc` → note, table → rows, `#pwSentence` → sentence, a `p.desc` with `color:var(--danger` → error). Grid: 7 tests × 3 modes with the `PW_INFO` default effect, α .05, two-tailed, n 30 / power .8 / drop 0; plus one-tailed for `ind`, `paired`, `one`, `corr`; `drop 20`; `alpha 0,05` (comma decimal); and every error path (α 0.6, drop 95, k 2, k 21, p 0, df 101, effect 0, r .99, power .4, n 2, the "would exceed 200,000" effect `ind` d .001, the "No effect in the usual range" case). Simulator: `plRun` page-bound for `(0.5, 15, 200, 1)`, `(0.5, 120, 200, 1)`, `(0.2, 30, 50, 42)`, `(1.5, 5, 10, 7)`, `(2, 2000, 5, 3)`, the two warnings (`d 0.05`, `n 3`), seed `0` (falls to 1); read `#plOut`: `svg` substring from `<svg` to `</svg>`, every `p` innerHTML, the banner text, and `window._plLast`. Emit `PW_INFO`.

Run: `pnpm --filter @appuscholar/core golden:capture power --emit`

- [ ] **Step 2: Failing tests, port, pass**

Tests: every power case `blocks` by `blockAsText` with `expectGolden`, `sentence` by `toBe`, errors by `toBe`; every simulator case `svg` by `toBe`, `texts` by `toEqual`, `last` by `expectGolden`.

Run: `pnpm --filter @appuscholar/core test:golden -- power`
Expected: FAIL, then PASS. Keep `f2`'s `Math.abs(x)<10?x.toFixed(2):x.toFixed(1)`, `effTxt`'s per-test choice, `tailTxt`, `pwArt`'s regexes, the 0.8/0.9/0.95 rows, the dropout `Math.ceil(n/(1-drop/100))`, the `lab` thresholds; in the simulator the bin width `0.1`, `hi=Math.max(2.0,d+1.4)`, `0.82*H`, the `toFixed(1)` coordinates and `mean(pos)>d*1.1`.

- [ ] **Step 3: Export and commit**

Row: `F19` already added (Task 1); none new. Ledger label: `pwPower` "matches v1; noncentral distributions scipy-checked (Task 1)"; the simulator "matches v1 (seeded)".

```bash
git commit -m "feat(core): power calculator (n, power, smallest effect, dropout) and the seeded simulator golden-equal to v1"
```

---

### Task 12: Chart Studio and the Quick chart / Venn maker (S8, S9)

**Files:**
- Create: `packages/core/src/charts.ts`, `packages/core/src/quickchart.ts`, `packages/core/src/data/chart-tables.ts` (generated: `VZ_COL`, `VZ_GRAY`, `VZ_I18N: { en: Record<string,string>; hi: Record<string,string> }` for every `vz_*` key)
- Create: `packages/core/test/golden/charts/capture.ts`, `charts/cases.json`, `charts/tables.json`; `packages/core/test/golden/quickchart/capture.ts`, `quickchart/cases.json`
- Test: `packages/core/test/golden/charts.test.ts`, `quickchart.test.ts`
- Modify: `index.ts`, `engines.ts`, `devanagari.test.ts` (range 2330's `vz_*` entries are read from the generated table), `parity-deviations.md`

**v1 source:** 3642–3667 (`VZ_COL`, `VZ_GRAY`, `vzEsc`, `vzQuant`, `vzTCrit`, `vzQNorm`, `vzNice`, `vzFmt`, `vzSummary`), 3668–3675 (`vzGroups`), 3708–3721 (`vzDefaults`), 3738–3742 (`vzCaption`), 3743–3782 (`vzFrame`, `vzSvgOpen`, `vzYAxis`, `vzXLabel`, `vzScaleY`, `vzJit`, `vzTableHTML`, `vzCatLabel`), 3783–3878 (`vzBox`, `vzBar`, `vzHist`, `vzQQ`); 4868–4873 (`chartParseLines`), 4899–4939 (`_vennNum`, `vennGenerate`). `I18N.en`/`I18N.hi` `vz_*` keys (2101, 2330) read through `v1.eval("I18N")`. Reference only: `vzLoad`, `vzSync`, `vzDraw`, `vzImgHTML`, `vzInsert`, `vzDownload` (3676–3907), `chartGenerate` 4874 (Chart.js), `chartInsertToDoc` 4941.

**Interfaces:**
- Produces (`charts.ts`): `type VzType = "box"|"bar"|"hist"|"qq"`; `type VzOptions = { type: VzType; palette: "color"|"gray"; title: string; showPts: boolean; showN: boolean; err: "none"|"ci"|"sd"|"se"; bins: string; yMin: string; yMax: string; yLabel: string; xLabel: string }` (`title` is already `''` when "draw the title inside" is off: `vzDraw`'s reads become fields); `type VzGroup = { name: string; vals: number[] }`; `vzGroups(data: ParsedData, yIdx: number, gIdx: number | null): VzGroup[]` (3668–3675 with `vzEsc` untouched: data order, `map` object + `order` array); `vzSummary`, `vzQuant`, `vzNice`, `vzFmt`, `vzTCrit`, `vzQNorm`, `vzJit`, `vzEsc`, `vzFrame`; `vzScaleY(vals, zero, yMin: string, yMax: string)`; `vzDefaults(type, yName, gName, err, showPts): { title: string; note: string }` (3708–3721); `vzCaption(fig: string, title: string, note: string)`; `vzBox(gs, o, tr)`, `vzBar(gs, o, tr)`, `vzHist(gs, o, tr)`, `vzQQ(gs, o, tr)`, each returning `{ svg: string; table: StatsBlock[]; warn?: string }` where `table` is the key note (3804 etc.) and `vzTableHTML`'s rows as blocks; `tr: (key: string) => string` resolves `vz_*` keys (the test passes `k => VZ_I18N.en[k]` or `.hi[k]`); `vzChart(o, gs, tr)` dispatches by `o.type`.
- Produces (`quickchart.ts`): `chartParseLines(text: string): Array<{ label: string; val: number }>`; `vennNum(raw: string): number`; `vennSvg(i: { a: string; b: string; c: string; title: string; aSize; bSize; ab; cSize; ac; bc; abc: string }): string` (4900–4936: `is3` from `c.trim()!==''`).
- Consumes: `pFromT`, `normalCDF` (pvalue), `smean`, `ssd` (Task 1), `statsParseText` (Task 2), `escHTML` (html.ts, used by `vennGenerate`).

- [ ] **Step 1: Capture**

`charts/capture.ts` page-bound: for each case, `#vzPaste` ← csv, `vzLoad()`, set `#vzType`, `#vzY`, `#vzG`, `#vzPal`, `#vzErr`, `#vzBins`, `#vzPts`, `#vzN`, `#vzTitleIn`, `#vzFig`; for the `defaults` cases leave `#vzTitle`, `#vzNote`, `#vzXL`, `#vzYL` untouched and call `vzSync()` (which draws); for the `explicit` cases set them and mark each `dataset.touched='1'`, set `#vzYMin`/`#vzYMax`, call `vzDraw()`; record `{ id, csv, yIdx, gIdx, options, svg: VZ.svg, table: blocks of #vzTable, warn: #vzWarn text when shown, caption: VZ.caption, defaults: { title: #vzTitle.value, note: #vzNote.value, xl, yl } }`. Cases: 4 types × 2 palettes on the `anova1` demo with groups, × `showPts`/`showN` on and off for box and bar, × `err` none/ci/sd/se for bar, bins `''`, `3`, `12`, `abc` for hist, `yMin 5` on bar (warning), `yMax 100` on hist, a one-value group (SD 0), a single group with no `g` (`All`), Hindi group names, a 60-value column for the Q-Q, and the same `anova1` case under `localStorage.appu_lang = 'hi'` for each type (the table key notes in Hindi). Also direct calls: `vzNice` on 10 ranges (including `max<=min`), `vzFmt`, `vzQuant`, `vzSummary` on 5 lists, `vzJit(i,k)` grid, `vzTCrit` df 0 (NaN), 1, 10, 100, `vzQNorm` .01/.5/.99. `quickchart/capture.ts`: `chartParseLines` through `#chartData` on 8 texts (no comma, `a,b,1` last-comma rule, `x,abc`, blank lines, spaces); `vennGenerate` through its fields for 2-set and 3-set cases, negative and `abc` counts (→ 0), empty names (`A`, `B`, `C`), a title, a `<` in a name (escaped); record `_chartMakerPendingHTML`'s `<svg…</svg>`. Emit `VZ_COL`, `VZ_GRAY`, `VZ_I18N`.

Run: `pnpm --filter @appuscholar/core golden:capture charts quickchart --emit`

- [ ] **Step 2: Failing tests, port, pass**

Tests: `svg` by `toBe` (exact string: coordinates come from the same arithmetic), `table` blocks through `expectGolden`, `warn` and `caption` by `toEqual`, `defaults` by `toEqual` against `vzDefaults(...)`; direct-call cases through `expectGolden`; Venn `svg` by `toBe`, `chartParseLines` by `toEqual`.

Run: `pnpm --filter @appuscholar/core test:golden -- charts quickchart`
Expected: FAIL, then PASS. Keep the SVG attribute order and every literal (`font-size="12.5"`, `r="3.2"`, `fill-opacity=".55"`), `Math.min(90,bw*.5)`, `vzJit`'s `12.9898`/`78.233`/`43758.5453`, `vzNice`'s `1e-9` and `+v.toFixed(10)`, the histogram's `Math.ceil(Math.log2(n)+1)` and 80-point curve, `vzQNorm((i+0.5)/n)`, the `&& false` dead branch in `vzBox` (kept as is), the Venn circle coordinates.

- [ ] **Step 3: Register, export, commit**

Rows: `D-W2-8` (noted: `chartGenerate` 4874–4898 draws bar and line charts with Chart.js and exports a PNG; not ported; `chartParseLines` is; Wave 5 decides the chart approach with F27), `D-W2-9` (noted: `vzImgHTML`/`vzInsert`/`vzDownload` are page code that rasterises the SVG; the panel does it), `F16` updated (histogram skew `m3/n`, pinned by the hist cases). Export everything.

```bash
git commit -m "feat(core): Chart Studio (box, bar, histogram, Q-Q as SVG with en/hi captions) and the Venn maker golden-equal to v1"
```

---

### Task 13: Results-to-data linking (S7)

**Files:**
- Create: `packages/core/src/rtlink.ts`
- Create: `packages/core/test/golden/rtlink/capture.ts`, `rtlink/cases.json`
- Test: `packages/core/test/golden/rtlink.test.ts`
- Modify: `index.ts`, `engines.ts`, `parity-deviations.md`

**v1 source:** 9372–9377 (`rtHash`), 9382–9388 (`rtRegister`, the "sets" record), 12260–12269 (`rtCapture`), 12270–12271 (`rtFirstP`, `rtSig`), 12272–12286 (`rtScan`), 12314–12330 (`rtRerunOne`, for the flip rule only). Reference only: `rtDsName` 9378, `rtOpen` 12287, `rtJump` 12306, `rtRerun` 12331, `rtRerunAll` 12339.

**Interfaces:**
- Produces: `rtHash(data: ParsedData): string`; `type RtRun = { test: StatsTestKey; label: string; ds: string; hash: string | null; fields: Record<string, string>; multi: Record<string, string[]>; extra: Record<string, string> }`; `rtRunRecord(data, test, form: StatsForm, ds: string, hash: string | null): RtRun` (12262–12268 with names from `data.cols`); `rtSetRecord(data, ds: string, sets: Record<string, RtSet>, now: number): Record<string, RtSet>` (9385–9387: `{ hash, ts, n }` written when absent or changed) with `RtSet = { hash; ts; n }`; `rtFirstP(str): { op: "<"|"="; v: number } | null`; `rtSig(str): boolean | null`; `rtFlip(oldSentence, newSentence): boolean` (12325's rule); `type RtTag = { id: string }`; `rtScanTags(tags: RtTag[], runs: Record<string, RtRun & { sentence; ts }>, sets: Record<string, RtSet>): Array<{ id; status: "cur"|"stale"|"unk"; why: ""|"rt_why_norec"|"rt_why_noset"|"rt_why_stale"; when?: number }>` (12274–12284 without the DOM).
- Consumes: `ParsedData`, `StatsForm`, `STAT_TESTS`.

- [ ] **Step 1: Capture**

Direct calls: `rtHash` on the 13 demo datasets (parsed by v1) and on the Task 2 corpus tables; `rtFirstP`/`rtSig` on 20 sentences (`p < .001`, `p = .022`, `p = 0.05`, `p = .05`, `p = 1.000`, `p ≤ .05` (no match: `[<=]` only), no p, two p's (first wins), `P = .03` (no match: lower-case `p` only)). Page-bound: after a demo run through `driveV1Stats`, read `window._statsRun` (what `rtCapture` recorded; `_rtSkip` **off** for these so `rtRegister` runs and `localStorage.appu_statsets` holds the set record: record it with `ts` replaced by a sentinel in the comparison), for `ttest1`, `alpha` (multi + extras), `mregress` (two multi lists) and `mcnemar` (binary fields); `rtScan`: set `localStorage.appu_statruns`/`appu_statsets` to three records and the editor to four `<span class="stat-tag" data-run="…">` tags (current, stale, no record, no set), call `rtScan()`, record `status`, `why`, `when` per tag.

Run: `pnpm --filter @appuscholar/core golden:capture rtlink`

- [ ] **Step 2: Failing tests, port, pass**

Run: `pnpm --filter @appuscholar/core test:golden -- rtlink`
Expected: FAIL, then PASS. Keep `rtHash`'s separators `\u0001`–`\u0004`, FNV `0x811c9dc5`/`16777619` and djb2 `5381`/`33` with `Math.imul` and `>>>0`, and `.toString(16)`.

- [ ] **Step 3: Register, export, commit**

Row: `D-W2-10` (noted: `rtRerunOne` 12314–12330 re-runs through the form and the editor; in v2 the panel loads the dataset from the vault, calls `runStats` with the stored `RtRun` and compares with `rtFlip`; the "load that dataset first" and "column gone" refusals (`rt_load_first`, `rt_col_gone`) are the panel's).

```bash
git commit -m "feat(core): results-to-data linking (rtHash, run and set records, rtScan statuses, rtSig flip rule) golden-equal to v1"
```

---

### Task 14: Design & Ethics generators and the AI-use statement builder (D1, D2)

**Files:**
- Create: `packages/core/src/design.ts`, `packages/core/src/aiustatement.ts`, `packages/core/src/data/design-tables.ts` (generated: `DESIGN_ITEMS` keys and labels, `EC_DOCS`, `CTRI_FIELDS`, `PI_ITEMS`, `BUDGET_DEFAULTS`, `AIU_MONTHS`)
- Create: `packages/core/test/golden/design/capture.ts`, `design/cases.json`, `design/tables.json`; `packages/core/test/golden/aiustatement/capture.ts`, `aiustatement/cases.json`
- Test: `packages/core/test/golden/design.test.ts`, `aiustatement.test.ts`
- Modify: `index.ts`, `engines.ts`, `parity-deviations.md`

**v1 source:** 5875–5882 (`DESIGN_ITEMS`), 5884–5897 (`designRenderDash`: the count and the done rule), 5906–5941 (`regCompute`), 5948–5977 (`protoRead`, `protoSave`'s done rule, `protoGenerate`), 5978 (`EC_DOCS`), 5999–6005 (`ecMinorsNote`), 6006–6010 (`ecToggle`'s done rule), 6011–6028 (`ecSave`'s done rule), 6029–6046 (`ecStatement`), 6047–6070 (`ecGenerateConsent`), 6071 (`CTRI_FIELDS`), 6084–6096 (`ctriExport`), 6097 (`PI_ITEMS`), 6111–6128 (`piSave` done rule, `piExportCv`), 6129–6133 (`BUDGET_DEFAULTS`, `budgetRows`), 6145–6151 (`budgetEdit`'s done rule), 6162–6176 (`budgetTotal`, `budgetExport`); 5461–5467 (`AIU_MONTHS`, `aiuDate`, `aiuJoin`, `aiuInRange`), 5492–5537 (`aiuBuild`). Reference only: the `*Render` functions, `designOpen`, `aiuRecord` 5453 (Phase 2 ported the classifier), `aiuRender` 5479.

**Interfaces:**
- Produces (`design.ts`): `type RegState = { type: "drug"|"device"|"interventional"|"observational"|string; pop: "adults"|"minors"|"vulnerable"|"pregnant"|string; bio: boolean; multi: boolean }`; `regPathway(s: RegState): { lines: string[] }` (5910–5932) and `REG_WARN` (the text of 5935); `type ProtoFields = { bg; obj; design; part; sample; proc; risk; dmp }` (strings, trimmed by the caller as `protoRead` trims); `protoDone(o)`; `protocolMarkdown(o): string | null` (null when every field is empty, where v1 toasts "Fill in at least one section first"); `ecMinorsNote(m: string): string` (`''` when hidden); `type EcState = { title; pi; what; risks; benefits; contact; status; committee; apprNo; apprDate; consentMode; minors; checklist: Record<number, boolean>; done?: boolean }`; `ecDoneAfterSave(s)`, `ecDoneAfterToggle(s)`; `ethicsStatement(s): { heading: "Ethical considerations"; text: string } | { error: "Choose where things stand first" }` (6029–6045, through `aiuDate`); `consentMarkdown(s): string | { error: string }` (6047–6069); `ctriMarkdown(checks: Record<number, boolean>): string` (6085–6089); `checklistDone(checks)`; `piDone(s)`; `piCvText(cv)`; `budgetRows(saved: Array<{label; amount}> | undefined)`; `budgetTotal(rows): number`; `budgetTotalText(rows): string` (`'Total: ₹'+total.toLocaleString('en-IN')`); `budgetMarkdown(rows): string` (6166–6171); `budgetDone(rows)`; `designDashboard(done: Record<DesignKey, boolean>): { done: number; total: number; items: Array<{ key; label; done }> }`.
- Produces (`aiustatement.ts`): `aiuDate`, `aiuJoin`, `aiuInRange(log: AiuEntry[], from: string, to: string)` with `AiuEntry = { d; p; m; k; g }`; `type AiuInput = { list: AiuEntry[]; keep: Record<string, 1>; other: string; fmt: "plain"|"thesis"|"journal"|string; ticks: { own; reword; cite; facts; noData: boolean }; style: { on: boolean; decl: string; samples: number } ; providers: Record<string, { name: string }> }`; `aiuBuild(i: AiuInput): { text: string } | { refuse: string }` (5492–5536; `PROVIDERS[e.p]` read from `providers`, which the test fills from Wave 0's `PROVIDERS`).
- Consumes: `escHTML` not needed (the markdown is plain); `PROVIDERS` (providers.ts) in the test only.

- [ ] **Step 1: Capture**

`design/capture.ts` page-bound with two stubs on the page: `window.insertIntoEditor = (text) => inserted.push(text)` and `URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:x" }` (then `await blob.text()`), `HTMLAnchorElement.prototype.click = () => {}`. Cases: `regCompute` for all 4 × 4 × 2 × 2 = 64 states (set `#regType`, `#regPop`, `#regBio`, `#regMulti`, call, read `#regResult` `li` texts and the `p.warn` text, and `localStorage.appu_design_reg` minus `savedAt`); `protoGenerate` for 6 field patterns (all, none → toast, one, Hindi text); `ecMinorsNote` for `yes`, `unsure`, `no`, `''`; `ecStatement` for every `status` ∈ {approved, applied, noreview, nohuman, ''} × `minors` ∈ {yes, unsure, no} × `consentMode` ∈ {written, online, verbal, waived, ''} with committee/apprNo/apprDate filled and empty (the 150 combinations with fields; a 2-way subset is enough where the text does not depend on the field: record all 150 anyway, they are cheap); `ecGenerateConsent` for 4 patterns (missing title → toast); `ctriExport` for 3 tick patterns; `piExportCv` for 2; `budgetExport`/`budgetTotal` for 4 row sets (defaults, Indian-grouped totals 1234567, a blank label `—`, `abc` amounts → 0); the done rules by reading `appu_design_*` after each toggle/save; `designRenderDash` count. `aiustatement/capture.ts`: set `localStorage.appu_ailog` to a 12-entry log over three dates and three providers (built with `aiuClassify`'s own `k`/`g` values: read them from `AIU_RULES` via eval), open with `aiuOpen()`, then for each case set `#aiuFrom`, `#aiuTo`, the row ticks, `#aiuOther`, `#aiuFmt`, the five checkboxes, `appu_style_on`/`appu_style_meta`/`appu_style_samples`, call `aiuBuild()`, read `#aiuOut.value` or the toast. Grid: 3 formats × {no use, text only, feedback only, all four groups} × other `''`/`'Grammarly'` × ticks all/none/reword-off (with text) × style on/off = at most 3·4·2·3·2 = 144. Emit the tables.

Run: `pnpm --filter @appuscholar/core golden:capture design aiustatement --emit`

- [ ] **Step 2: Failing tests, port, pass**

Tests compare each output string by `toBe` (markdown, statement, lines, notes) and the done booleans by `toEqual`; `budgetTotalText` on 1234567 equals v1's and, from Wave 0's `doctext/en-in-numbers.json`, the Chrome string for the same number (`1,234,567` grouped as `12,34,567`).

Run: `pnpm --filter @appuscholar/core test:golden -- design aiustatement`
Expected: FAIL, then PASS. Keep every sentence as data in the module (copied by the implementer from the cited lines, then checked by the golden); keep `aiuBuild`'s `by.g` four groups, the `sort((a,b)=>g[b]-g[a])` order, `other.replace(/[.\s]+$/,'')`, the `[Say which passages…]` rule.

- [ ] **Step 3: Register, export, commit**

Rows: `D-W2-11` (noted: `regCompute`, `ecStatement`, `protoGenerate` write storage, insert into the editor and toast in one breath (5938–5940, 6044–6046, 5973–5976); `core` returns the text and the done flag, the panel stores and inserts), `D-W2-12` (noted: `budgetTotalText` and `budgetMarkdown` use `toLocaleString('en-IN')`; pinned in Node and against the Chrome fixture), `D-W2-13` (noted: `aiuBuild` reads the writing-style profile (5520) through `styleMeta`/`styleSamples`/`styleIsOn`, Wave 3's engine; `AiuInput.style` carries the three values).

```bash
git commit -m "feat(core): Design & Ethics generators (pathway, protocol, ethics statement, consent, CTRI, budget) and the AI-use statement builder golden-equal to v1"
```

---

### Task 15: Scale library and the qualitative-coding model (O1, O2)

**Files:**
- Create: `packages/core/src/scales.ts`, `packages/core/src/qual.ts`, `packages/core/src/data/scale-tables.ts`, `packages/core/src/data/qual-tables.ts` (generated)
- Create: `packages/core/test/golden/scales/capture.ts`, `scales/cases.json`, `scales/tables.json`; `packages/core/test/golden/qual/capture.ts`, `qual/cases.json`, `qual/tables.json`
- Test: `packages/core/test/golden/scales.test.ts`, `qual.test.ts`
- Modify: `index.ts`, `engines.ts`, `parity-deviations.md`

**v1 source:** 11394–11419 (`SCALES`, `SL_PENDING`), 11420 (`slById`), 11426–11432 (`slVarNames`, `slText`), 11450–11455 (`slCodebook`'s rows), 11456–11469 (`slScore`, `slBand`), 11470–11486 (`slScoreOpen`'s column guess, 11477–11479), 11487–11512 (`slScoreRun`); 6186–6189 (`QUAL_PALETTE`, `qualNextColor`), 6205–6209 (`qualDescendantIds`), 6235–6244 (`qualDeleteCode`'s cascade and confirm text), 6289–6300 (`qualFindPassages`'s trim rule), 6311–6325 (`qualBuildMarkdown`). Reference only: `slOpen`, `slPick`, `slCopy`, `qualAddCode`, `qualRenameCode`, `qualUnwrap*`, `qualTagSelection`, `qualRenderTree`, `qualOpenPassages`, `qualExportMarkdown`.

**Interfaces:**
- Produces (`scales.ts`): `SCALES`, `SL_PENDING` (re-exported), `type Scale = typeof SCALES[number]`; `slById(id)`; `slVarNames(x)`; `slText(x, withCredit?: boolean)`; `slCodebookRows(x): string[][]` and `slCodebookCsv(x): { name: string; csv: string }` (through `pdCsv`); `slScore(x, mat: Array<Array<number | null>>, coding: { min; max }): { totals: Array<number | null>; bad; miss }`; `slBand(x, t)`; `slGuessColumns(x, headers: string[]): number[]` (11477–11479); `slScoreData(x, data: ParsedData, idx: number[], coding): { ok: true; headers; rows; cT; cB; valid; mean; sd; alpha: number | null; message: string; csv: string } | { ok: false; message: string }` (11489–11510 as data: `message` is the `#slScoreOut` text or innerHTML v1 wrote; `csv` is what v1 put back into `#statsPaste`).
- Produces (`qual.ts`): `QUAL_PALETTE`; `type QualCode = { id; name; parentId: string | null; color }`; `qualNextColor(count: number)`; `qualDescendantIds(id, codes)`; `qualDeleteCascade(codes, id): { codes: QualCode[]; removed: string[]; confirm: string } | null` (6236–6241's ids and confirm text); `type QualPassage = { doc: string; text: string }`; `qualPassageText(raw: string): string | null` (6294–6295: trimmed, null when empty); `qualBuildMarkdown(codes, passagesOf: (codeId: string) => QualPassage[]): string` (6311–6325).
- Consumes: `pdCsv` (csv.ts), `stkAlpha` (Task 1), `statsParseText`.

- [ ] **Step 1: Capture**

`scales/capture.ts`: direct calls for `slVarNames`, `slText` (with and without credit), `slCodebook`'s rows (stub `pdDownload` to record name and text), `slScore` on 6 matrices per scale (clean, a missing cell, an out-of-range cell, a non-integer, both codings for RSES), `slBand` on every boundary of SWLS (9, 10, 14, 15, 19, 20, 24, 25, 29, 30, 35, 36, null) and RSES (`''`); page-bound `slScoreRun` for RSES and SWLS: parse a 12-row CSV with item columns named `RSES_01…` (guess by name), `rses1…` (guess by prefix) and unrelated names (no guess), set the selects, call, read `#slScoreOut.innerHTML` and `#statsPaste.value`; the two refusals ("Choose a column for every item.", "Each item needs its own column.") and the no-row case. Emit `SCALES`, `SL_PENDING`.
`qual/capture.ts`: set `localStorage.appu_qual_codes` to a 7-code tree (two roots, nested three deep, Hindi name, a `"` in a name), set the editor to a document with `<span class="qual-tag" data-qcode="…">` passages (one spanning inline tags, one empty, one with runs of whitespace), call `docSaveBody(getEditorHTML())` then `qualBuildMarkdown()`; record the markdown, `qualDescendantIds` for every code, `qualDeleteCode`'s confirm text by stubbing `window.confirm` to record and return false (nothing is deleted), `qualNextColor` for counts 0..12. Emit `QUAL_PALETTE`.

Run: `pnpm --filter @appuscholar/core golden:capture scales qual --emit`

- [ ] **Step 2: Failing tests, port, pass**

Tests: every item string of `SCALES` byte-equal to the fixture's (the devanagari test gains nothing: the scales are English; a separate `scales.test.ts` test compares `JSON.stringify(SCALES)` with `tables.json`); `slScore`/`slBand`/`slText`/`slVarNames` by `toEqual`; `slScoreData` `message`, `csv`, `headers`, `rows` by `toBe`/`toEqual` and `alpha` through `expectGolden`; `qualBuildMarkdown` by `toBe` with `passagesOf` built from the fixture's passages per code; `qualDescendantIds`, `qualDeleteCascade().confirm`, `qualNextColor` by `toEqual`.

Run: `pnpm --filter @appuscholar/core test:golden -- scales qual`
Expected: FAIL, then PASS. Keep `slScore`'s `Math.round(v)!==v` rule and `flip`, `nameFree`'s `_2` suffixing, the `A.length>=3&&x.items.length>=2` alpha guard, `qualBuildMarkdown`'s `'#'.repeat(Math.min(depth+2,6))` and `p.text.replace(/\s+/g,' ')`.

- [ ] **Step 3: Register, export, commit**

Rows: `F29` (noted: SWLS band labels from one published sheet; port verbatim; check with the owner's page once), `D-W2-14` (noted: v1 stores a tag as a `<span class="qual-tag" data-qcode>` inside the document HTML and finds passages by scanning every stored document (6289–6300); `core` ports the code tree, the cascade and the markdown over passages handed to it; where passages live in v2 (the same spans in the encrypted body, read by the panel) is Wave 5's, with a row then), `D-W2-15` (noted: `slScoreRun` writes the scored CSV back into the Statistics Lab box and re-parses (11507–11508); `slScoreData` returns the CSV and the panel decides).

```bash
git commit -m "feat(core): scale library (RSES, SWLS: text, codebook, scoring, bands) and the qualitative-coding model (tree, cascade, markdown export) golden-equal to v1"
```

---

### Task 16: Wave 2 gate, whole-branch review and the PR

**Files:**
- Modify: `.superpowers/sdd/2026-10-19-parity-port-wave2/progress.md` (ledger), `docs/superpowers/specs/parity-deviations.md` (final count), `test/golden/stats.test.ts` (the gate test)

- [ ] **Step 1: The gate test**

Add to `stats.test.ts`:

```ts
it("gate: every one of the 26 tests has a fixture, and the 13 TG_DEMO runs equal the Wave 0 stats-demos capture", () => {
  expect(fixtureFiles.sort()).toEqual([...Object.keys(STAT_TESTS)].sort());
  const w0 = readFixture<{ demos: Demo[] }>("stats-demos", "demos");
  for (const d of w0.demos) { const c = findCase(d.test, `${d.id}-demo` or the mapped id); expect(c.apa).toBe(d.apa); expect(c.resultsText).toBe(d.resultsText); }
});
it("gate: scipy reference covers every case of every test that scipy has", ...);   // no `why: "unsupported"` for a test in the supported list
```

- [ ] **Step 2: Run everything**

Run: `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm --filter @appuscholar/core golden:capture all --check`
Expected: all green; every `--check` line prints `same` (Wave 0–1 fixtures included: nothing of theirs changed).

- [ ] **Step 3: Count the gate and write the ledger's closing block**

Record: the number of stats cases per test (`node -e` over `test/golden/stats/*.json`), total golden tests, the scipy reference's case count and which tests it covers, the list labelled "matches v1" (anova2 Type III with its simple effects and pairwise tables, mixed, ω and its interval, Games-Howell, Dunn with Holm, Johnson-Neyman, the mediation bootstrap, Fisher-Freeman-Halton, Cochran's Q, McNemar's χ² form, Welch ANOVA's ω², the Spearman interval, pwPower, the simulator), the register rows added by status, every ruling made during execution with its cost-if-wrong.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin claude/parity-wave-2-f16585
gh pr create --base parity-wave-0-1 --title "Parity port, Wave 2: statistics, intake, guide, power, charts, linking, Design & Ethics, scales, qualitative" --body "$(cat <<'EOF'
Wave 2 of docs/superpowers/specs/2026-10-17-parity-port-design.md, from docs/superpowers/plans/2026-10-19-parity-port-wave2.md.

Gate (spec §6): all 13 TG_DEMO datasets and the edge corpus equal v1's output (sentence, every cell and note, the whole results text); scipy 1.17.1 agreement where scipy has the statistic; the reference-less statistics labelled "matches v1" in the ledger and here: <list>.

Engines: <list with case counts>. Register rows added: <n> (<by status>). No panel, no api change, no change under appuscholer/.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then the whole-branch review per superpowers:subagent-driven-development on the most capable model (spec compliance and v1 fidelity, the golden diffs as evidence), one fix wave, CI green, and the ledger's closing line.

---

## Self-review (done while writing; recorded for the reviewer)

1. **Spec coverage.** §5.1 verbatim: every port step names what must stay. §5.2 golden master: every task captures from v1 running; corpora are inputs only. §5.3 browser truths: the only browser-dependent calls in this wave are `toLocaleString('en-IN')` (budget) and `('en-US')` (FFH, mediation), pinned in Node and, for en-IN, against Wave 0's Chrome fixture (Task 14, D-W2-12). §5.4 content by script: `emitTables` in Tasks 3, 10, 11, 12, 14, 15. §5.5 split: `StatsBlock` and the result objects; the page helpers' HTML pieces become blocks; the test-only renderer in Task 3. §5.6 register: rows named in every task. §5.7 browser: no DOM in `src`. §5.9 reference runs: scipy in Tasks 1, 4, 5, 6; numpy where only linear algebra is independent (7, 8, 9); labels listed in Global Constraints and Task 16. §5.10 tracks: ledger per task, reviewer per task with the golden diff, student track = the gate. §6 Wave 2 gate: Task 16. §8 Decisions 1 (F1, F2, F13, F18 proposed), 2 (F3, F4 applied, Tasks 2, 4), 3 (labels), 4 (no api). Audit rows: S1 rest (T1), S2 (T2), S3 (T3–T9), S4 (T3), S5 (T10), S6 (T11), S7 (T13), S8 and S9 (T12), D1 and D2 (T14), O1 and O2 (T15). Flags: F1, F2, F3, F4, F7–F22, F27, F29 each have a task and a row; F5, F6, F23–F26, F28 are Wave 0–1's or Wave 3's.
2. **Step scan.** Each capture step names the v1 entry point, the fields set and the elements read; each test step gives assertions; each port step gives the line range and what must not change; corpora give ids and the condition each must trigger.
3. **Type consistency.** `ParsedData` (Task 2) is the data type everywhere; `StatsForm`, `StatsCtx`, `StatsBlock`, `StatsResult` (Task 3) are used unchanged in Tasks 4–11, 13, 15; `blockAsText` and `expectGolden` are the comparison everywhere blocks appear; `goldenMode(fixture)` from the harness.
4. **Review Focus.** Five items, each pinned: 1 → Tasks 3, 4; 2 → Tasks 4, 5, 6, 7, 9; 3 → Tasks 3, 4; 4 → Task 5; 5 → Task 2.
5. **Proportion.** The plan is longer than the spec's Wave 2 row because it carries the corpus ids and the interface of 26 runners; its code blocks are tests and signatures, not bodies.

## Open points for OJ (not blocking)

- Decision 3: a machine with R for the labelled statistics (two-way ANOVA Type III, mixed ANOVA, ω, Games-Howell, Dunn, moderation, mediation, FFH): the corpora of Tasks 5–9 are the datasets to run.
- F1, F2, F13's note, F18, F20: copy and display proposals wait for Dr. Sharma.
- The two `toLocaleString` calls (D-W2-7, D-W2-12) are pinned in Node; if a Chrome build ever groups differently, the Chrome fixture of Wave 0 is the authority.
