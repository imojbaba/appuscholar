# Parity Port, Waves 0 and 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A golden-master harness that captures what Dr. Sharma's v1 prints, the Chrome document-text contract, the deviation register, golden snapshots for the nine modules already in `core`, and then the Phase 3 engines (citation formatting in eight styles, library operations, citation cross-check, the p-value core, Numbers check, the Research and Analyse-a-paper pure helpers, and the Idea, Research-helper, Research and Analyse prompts) ported verbatim into `packages/core` with every output proven equal to v1's.

**Architecture:** A TypeScript harness under `packages/core/test/golden/harness/` loads `appuscholer/index.html` (build 2026.10.13a, 13,699 lines) into jsdom 26.1.0 with the CDN scripts stripped and no network, calls v1's own functions or drives its forms, and writes JSON fixtures (input beside output) into `packages/core/test/golden/<engine>/`. Vitest golden tests read those fixtures and fail on a one-character difference. Browser-only truths (`innerText`, `toLocaleString('en-IN')`) are captured once in Chromium by a Playwright script in `apps/web/scripts/` and pinned the same way. Each engine becomes pure functions in `packages/core/src/` (compute, no DOM, no storage, no toast); the page reads v1 did inside a function become parameters. Content tables are emitted by the harness into `packages/core/src/data/`, never retyped. Panels (Wave 5) and network fetchers (Wave 4) are out of scope.

**Tech Stack:** TypeScript 5.9 (strict, `noUncheckedIndexedAccess`), vitest 5, pnpm 10.32.1 workspace, Node 22 in CI (`engines: >=22 <25`; OJ's Mac runs 26.9), jsdom 26.1.0 (pinned by the root `pnpm.overrides`), `tsx` for the capture CLI, Playwright (`@playwright/test`, already in `apps/web`) for the Chrome capture, scipy 1.17.1 once, locally, for the p-value reference file.

**Spec:** `docs/superpowers/specs/2026-10-17-parity-port-design.md` (rules §5, waves and gates §6, decisions §8). Audit: `Scholarly/appuscholar-blueprint/PORT-AUDIT.md` (§2 fixture strategy, §3 rows G0, G1, S1, S10, S11, C1, C2, O7, O8, O9, §4 flags, §5 order). Evidence scripts: `Scholarly/appuscholar-blueprint/port-audit-evidence/` (01 and 04 are the jsdom recipe this harness generalises; 02 and 03 are the scipy comparison the p-value task reuses; 06 is the citation probe).

## Global Constraints

- **Branch and ledger.** Branch `parity-wave-0-1` off `phase-3a-vault` (head 7795db3), PR against `phase-3a-vault`. Maker ledger at `.superpowers/sdd/2026-10-17-parity-port-wave0-1/progress.md` (git-ignored, as every phase before). One conventional commit per task (`test(core):`, `feat(core):`, `docs(plan):`, `chore(core):`, `ci:`).
- **v1 is read-only.** Nothing under `Scholarly/appuscholer/` is modified, written to, or copied into this repo except the fixtures the harness captures. The harness opens `index.html` with `readFileSync` and never writes beside it. Default path: `V1_INDEX` env var, else `../../../appuscholer/index.html` relative to `packages/core` (the sibling checkout on OJ's Mac).
- **Verbatim arithmetic (spec §5.1).** Same operation order, same `toFixed` calls (never `Intl`), same regex sources and flags, same object-key iteration (no `Map` where v1 used an object), same seeds. TypeScript types are added; behaviour is not. A ported function keeps v1's name unless the name collides with an export that already exists.
- **Golden master from v1 running (spec §5.2, anti-goal §4).** No expected value in a golden test is typed by hand; each comes from the harness. Every fixture file starts with `{ "engine", "captured": "YYYY-MM-DD", "v1": { "build": "2026.10.13a", "sha256": "<of index.html>", "lines": 13699 } }`. Numbers that JSON cannot hold are encoded `{"$n":"NaN"}`, `{"$n":"Infinity"}`, `{"$n":"-Infinity"}`, `{"$n":"-0"}` and decoded by the fixture reader; comparisons use vitest `toEqual` (primitives by `Object.is`). Strings are stored raw: U+00A0, the U+0001/U+0002 italic markers of `citFmt`, Devanagari, all unescaped beyond JSON's own rules.
- **Capture is local, tests run in CI.** `pnpm --filter @appuscholar/core golden:capture <engine> [--check]` needs v1 and runs on OJ's Mac; `--check` re-captures and exits 1 when the committed fixture differs (v1 changed, or the fixture was edited). CI runs only the committed fixtures through vitest; a missing fixture is a failing test, never a skip.
- **Browser truths in a browser (spec §5.3).** `innerText` and `toLocaleString('en-IN')` fixtures come from Chromium through `node apps/web/scripts/capture-doctext-chrome.mjs`, with the Chromium version recorded in the file. jsdom has no `innerText` (v1 falls back to `textContent` there), so no innerText value is ever captured in jsdom.
- **Content copied, never retyped (spec §5.4).** Tables (`CIT_STYLES`, the month arrays, `CC_STOP`, `AP_STAGES`, `AP_STOP`, `AP_NAME`, `AP_SAMPLE`, `RS_DESIGNS`, `RS_DESIGN`) are emitted by the harness into `packages/core/src/data/*.ts` with a "generated, do not edit" header and checked by a JSON-equality golden. Every Devanagari string literal in `packages/core/src/**` must exist byte-for-byte in the v1 line ranges this plan ports, and the reverse (`test/golden/devanagari.test.ts`, Task 8).
- **Compute split from render (spec §5.5).** `core` functions return plain objects; i18n keys (`nc_c_round`, `cc_src_doc`, …) are returned as keys, never rendered; the panel calls `t()` in Wave 5. The only HTML `core` produces is what v1's engines themselves produced as data (`refHTML`, the bibliography block), escaped with the ported `escHTML`.
- **Deviation register (spec §5.6).** `docs/superpowers/specs/parity-deviations.md`. Every task adds its rows as `proposed` (or `noted` for an observation that changes nothing); no number changes without OJ, no copy without Dr. Sharma. A golden mismatch is either a bug in the port (fix it) or a row (write it); never a hand-edited fixture.
- **Where it runs (spec §5.7).** `core` stays isomorphic: no `node:*`, `react`, `next`, `hono` or `drizzle` imports in `src` (the eslint rule already enforces this); no `document`, `window` or `localStorage` in `src`. jsdom and Node APIs are allowed under `test/`.
- **Already ported stays (spec §5.8).** `accuracy.ts`, `pd.ts`, `aiuse.ts`, `origin.ts`, `prompts.ts`, `providers.ts`, `v1import.ts`, `v1locked.ts`, `sanitize.ts` are not re-ported; Wave 0 adds goldens that check them against v1 once. `prompts.ts` gains only an exported `Built` type and a `fieldLabel` helper (Task 13).
- **Reference runs (spec §5.9).** scipy agreement is checked where scipy has the statistic: the p-value core (Task 6) ships a committed `scipy-reference.json` produced once locally; the test compares in CI with a relative tolerance of `1e-6`, except the F5 points, where v1 returns exactly 0 and the test asserts that.
- **Three tracks (spec §5.10).** Maker: ledger line per task with the commit. Checker: a reviewer verdict per task on spec compliance and on fidelity to v1, with the golden diff as evidence. Student: no panel ships in Waves 0 and 1, so the student track for this plan is the gate itself (the golden suite green in CI); the first walk-through comes with the first Wave 5 panel.
- **Commands.** Tests `pnpm --filter @appuscholar/core test`; golden only `pnpm --filter @appuscholar/core test:golden`; lint `pnpm --filter @appuscholar/core lint` (covers `src` and `test`); types `pnpm --filter @appuscholar/core typecheck` (`tsconfig` includes `test`, so harness code must typecheck). Before every commit all three pass.
- **Decisions applied as defaults (spec §8).** Deviation policy: verbatim, display bugs stay until Dr. Sharma approves wording (ruling 1). Citation manuals: port verbatim, editorial pass later (recommendation 5). Wave 1 order: stage order (recommendation 7). Reference runs: scipy now, R or SPSS later (recommendation 3; nothing in this plan needs R).

## Review Focus

1. **A v1 library file** (`psychology-class-library.json` exported by v1's `citExport`) imported into v2 with more than 2,000 entries, exact duplicates, entries missing `year` or `source`, and a non-array file: the merge must keep the first 2,000, skip duplicates on exact `title` + `author`, fill v1's defaults, and report "not a library" for the non-array instead of throwing. Test in Task 10.
2. **A document whose reference heading is Hindi** (`संदर्भ सूची`) and whose body holds `&nbsp;` inside a citation (`(Smith,&nbsp;2020)`): the cross-check must find the heading and the citation; Chrome's `innerText` keeps U+00A0 and v1 then maps it to a space before analysing. Tests in Task 3 (corpus case `refs-hindi-heading`) and Task 9.
3. **Numbers check meeting the two v1 edges the audit flags:** a huge F (`F(3, 50) = 200, p < .001`) where `pFromF` returns exactly 0 (F5) must be judged `ok` with `pcalc` 0, not `error` or NaN; and a statistic split across two paragraphs is read glued together because v1 uses `textContent` (no line breaks). Tests in Task 7.
4. **A source with an organisation author and no year in a numbered style with no library number:** APA-family styles print `n.d.`, numbered styles print `[?]`, AMA marks `sup`; and a first name like `J.-P.` or `RK` must give v1's initials. Tests in Task 8 (corpus entries `org-no-year`, `initials-hyphen`, `initials-caps`).
5. **TipTap's own shapes in the document-text contract:** empty paragraphs (`<p></p>`), a trailing `<br>` inside a paragraph, list items that wrap their text in `<p>`, a nested list, and a table inside a list item. Chrome's line-break rules for these are not obvious and the converter must match them, not approximate them. Tests in Task 3 (corpus cases `empty-paragraphs`, `trailing-br`, `list-tiptap`, `nested-list`, `table-in-li`).

---

## File structure

Created in this plan (all paths relative to `Scholarly/appuscholar/`):

- `packages/core/test/golden/harness/v1.ts`: loads v1 into jsdom, exposes `call`, `eval`, editor and selection helpers, the `callAI` recorder, the toast recorder. Task 1.
- `packages/core/test/golden/harness/fixture.ts`: fixture header, special-number encoding, `writeFixture` (with `--check`), `readFixture`, `emitTables`. Task 1.
- `packages/core/test/golden/harness/capture.ts`: the CLI (`tsx capture.ts <engine>|all [--check] [--emit]`) and `engines.ts`, the registry each task extends. Task 1.
- `packages/core/test/golden/<engine>/capture.ts` + `*.json` per engine; `packages/core/test/golden/<engine>.test.ts` per engine. Engines: `smoke`, `stats-demos`, `accuracy`, `pd`, `aiuse`, `origin`, `providers`, `prompts`, `v1import`, `v1locked`, `doctext`, `pvalue`, `statfmt`, `numbers`, `html`, `citation`, `crosscheck`, `citlib`, `analyse`, `research`, `prompts-idea`, `prompts-helpers`, `prompts-research`, `prompts-analyse`, `content`.
- `apps/web/scripts/capture-doctext-chrome.mjs`: the Playwright capture. Task 3.
- `docs/superpowers/specs/parity-deviations.md`: the register. Task 2.
- `packages/core/src/doctext.ts` (Task 3), `pvalue.ts`, `statfmt.ts` (Task 6), `numbers.ts` (Task 7), `html.ts`, `citation.ts`, `data/citation-tables.ts` (Task 8), `crosscheck.ts`, `data/crosscheck-tables.ts` (Task 9), `citlib.ts` (Task 10), `analyse.ts`, `data/analyse-tables.ts` (Task 11), `csv.ts`, `research.ts`, `data/research-tables.ts` (Task 12), `prompts-idea.ts`, `prompts-helpers.ts`, `prompts-research.ts` (Task 13), `prompts-analyse.ts` (Task 14).
- Modified: `packages/core/package.json` (devDependencies `jsdom`, `@types/jsdom`, `tsx`; scripts `golden:capture`, `test:golden`), `packages/core/src/index.ts` (exports, every task), `packages/core/src/prompts.ts` (Task 13), `.github/workflows/ci.yml` (Task 1), `apps/web/package.json` (script `doctext:capture`, Task 3).

Wave 0 is Tasks 1 to 5; Wave 1 is Tasks 6 to 14 in dependency order (p-values → Numbers check; HTML escape → citation formatting → cross-check and library; Analyse helpers → Research helpers; prompts last, since they reuse `apPick`, `rsCorpusText` and the content tables); Task 15 closes the gates.

---

### Task 1: Golden-master harness (G0)

**Files:**
- Create: `packages/core/test/golden/harness/v1.ts`, `packages/core/test/golden/harness/fixture.ts`, `packages/core/test/golden/harness/capture.ts`, `packages/core/test/golden/harness/engines.ts`
- Create: `packages/core/test/golden/smoke/capture.ts`, `packages/core/test/golden/stats-demos/capture.ts`
- Create: `packages/core/test/golden/smoke/cases.json`, `packages/core/test/golden/stats-demos/demos.json` (captured, committed)
- Test: `packages/core/test/golden/harness.test.ts`, `packages/core/test/golden/live.test.ts`
- Modify: `packages/core/package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces (`harness/v1.ts`):
  - `type V1 = { window: DOMWindow; document: Document; build: string; sha256: string; lines: number; call<T = unknown>(name: string, ...args: unknown[]): T; eval<T = unknown>(expr: string): T; editor(): HTMLElement; setEditorHtml(html: string): void; selectEditor(): void; setValue(id: string, value: string): void; stubCallAI(reply?: string): Array<{ prompt: string; opts: Record<string, unknown> }>; toasts: string[] }`
  - `loadV1(indexPath?: string): Promise<V1>`: reads the file, strips `<script src="https:…"></script>`, builds the JSDOM exactly as `port-audit-evidence/01-drive-v1-in-jsdom.cjs` does (`runScripts: "dangerously"`, `pretendToBeVisual`, `url: "http://localhost/"`, a `VirtualConsole` that swallows jsdom errors, and in `beforeParse`: `HTMLElement.prototype.showModal = function () { this.open = true }`, `close = function () { this.open = false }`, `matchMedia` stub, `TextEncoder`/`TextDecoder`, `crypto = webcrypto`, `scrollTo`, `Element.prototype.scrollIntoView`), waits 1,500 ms for v1's start-up timers, then sets `window.actLog = () => {}` and `window.showToast = (m) => toasts.push(String(m))`. `call(name)` is `window[name]` (v1's top-level `function` declarations are window properties); `eval` is `window.eval` for `const`/`let` bindings (`TG_DEMO`, `APP_BUILD`, `AP`, `savedRange`). `editor()` returns `eval("editor")`. `selectEditor()` runs `eval("savedRange=document.createRange();savedRange.selectNodeContents(editor)")` so `hasSelection()` and `selText()` (v1 5553–5555) see the whole editor. `stubCallAI(reply = "OK")` replaces `window.callAI` with an async recorder that resolves `reply`. `build` is `eval("APP_BUILD")`, `sha256` is of the file bytes.
- Produces (`harness/fixture.ts`):
  - `type FixtureHeader = { engine: string; captured: string; v1: { build: string; sha256: string; lines: number } }`
  - `type Fixture<T> = FixtureHeader & T`
  - `encodeSpecial(v: unknown): unknown` / `decodeSpecial(v: unknown): unknown` (NaN, ±Infinity, −0 as `{"$n": …}`, recursively; `undefined` properties dropped)
  - `writeFixture(engine: string, file: string, body: object, v1: V1, check: boolean): "written" | "same" | "differs"` (`check` never writes; prints the first differing JSON path)
  - `readFixture<T>(engine: string, file: string): Fixture<T>` (throws when missing; decodes specials)
  - `emitTables(target: string, tables: Record<string, unknown>): void` (writes `packages/core/src/data/<target>.ts`: a header comment `// Generated from v1 index.html build <build> (<sha256 first 12>) by test/golden/harness. Do not edit; re-run: pnpm --filter @appuscholar/core golden:capture <engine> --emit` and one `export const NAME = <JSON> as const;` per table; also writes the same tables into the engine fixture `tables.json`)
- Produces (`harness/capture.ts`, `engines.ts`): `type Engine = { name: string; capture(v1: V1, opts: { check: boolean; emit: boolean }): Promise<Array<"written" | "same" | "differs">> }`; `engines.ts` exports `ENGINES: Engine[]`; the CLI runs one or all and exits 1 if any result is `"differs"` under `--check`.
- Produces (`package.json` scripts): `"golden:capture": "tsx test/golden/harness/capture.ts"`, `"test:golden": "vitest run test/golden"`.

- [ ] **Step 1: Add the dev dependencies and scripts**

In `packages/core/package.json` add `devDependencies` `"jsdom": "26.1.0"`, `"@types/jsdom": "^21.1.7"`, `"tsx": "^4.23.0"` and the two scripts above; run `pnpm install` at the repo root (the lockfile already holds jsdom 26.1.0 and tsx 4.23.15 for other packages).

- [ ] **Step 2: Write the failing fixture-shape tests**

`packages/core/test/golden/harness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readFixture } from "./harness/fixture";

type SmokeCase = { fn: string; args: unknown[]; out: unknown };
type Demo = { id: string; test: string; csv: string; sel: Record<string, string>; apa: string; resultsText: string; resultsHtml: string; toasts: string[] };

describe("golden harness fixtures", () => {
  it("smoke: 20 pure v1 functions captured by direct call, header names the v1 build", () => {
    const fx = readFixture<{ cases: SmokeCase[] }>("smoke", "cases");
    expect(fx.v1.build).toBe("2026.10.13a");
    expect(fx.v1.lines).toBe(13699);
    expect(new Set(fx.cases.map(c => c.fn)).size).toBe(20);
    for (const fn of ["pFromT", "pFromF", "pFromChi", "pFromZ", "normalCDF", "gammaln", "betai", "gammaq", "erf", "stkShapiro", "stkPtukey", "stkQtukey", "stkExactMW", "pwPower", "pwSolveN", "accItems", "pdScanText", "provHash", "aiuClassify", "ccNorm"])
      expect(fx.cases.filter(c => c.fn === fn).length).toBeGreaterThanOrEqual(3);
    expect(fx.cases.find(c => c.fn === "pFromT" && c.args[0] === 2.15 && c.args[1] === 21)?.out).toBe(0.043360276354708106);
  });
  it("stats-demos: the 13 TG_DEMO datasets ran through statsRunNow and agree with the audit's capture", () => {
    const fx = readFixture<{ demos: Demo[] }>("stats-demos", "demos");
    const ids = fx.demos.map(d => d.id);
    expect(ids).toEqual(["ttest1", "ttestInd", "mannwhitney", "ttestPaired", "wilcoxon", "anova1", "kruskal", "pearson", "spearman", "regression", "chisq", "gof", "alpha"]);
    const audit = JSON.parse(readFileSync(new URL("./stats-demos/audit-capture-2026-10-17.json", import.meta.url), "utf8")) as Record<string, { apa: string }>;
    for (const d of fx.demos) { expect(d.apa.length).toBeGreaterThan(40); expect(d.apa).toBe(audit[d.id]?.apa); expect(d.toasts).toEqual([]); }
  });
  it("special numbers survive the fixture encoding", async () => {
    const { encodeSpecial, decodeSpecial } = await import("./harness/fixture");
    const v = { a: NaN, b: -0, c: Infinity, d: -Infinity, e: [1, NaN], f: "x" };
    const back = decodeSpecial(JSON.parse(JSON.stringify(encodeSpecial(v)))) as typeof v;
    expect(back).toEqual(v); expect(Object.is(back.b, -0)).toBe(true);
  });
});
```

Copy `port-audit-evidence/captured-v1-demo-output.json` to `packages/core/test/golden/stats-demos/audit-capture-2026-10-17.json` unchanged (it is the audit's independent capture; the test proves the new harness reproduces it).

`packages/core/test/golden/live.test.ts` (runs only on a machine with v1; CI skips it):

```ts
import { describe, it, expect } from "vitest";
import { loadV1 } from "./harness/v1";
describe.skipIf(!process.env.V1_INDEX)("live v1 (V1_INDEX set)", () => {
  it("loads v1, calls a pure function and reads a constant", async () => {
    const v1 = await loadV1(process.env.V1_INDEX);
    expect(v1.build).toBe("2026.10.13a");
    expect(v1.call<number>("pFromT", 2.15, 21)).toBe(0.043360276354708106);
    expect(Object.keys(v1.eval<Record<string, unknown>>("TG_DEMO"))).toHaveLength(13);
  }, 20_000);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @appuscholar/core test:golden`
Expected: FAIL (fixture files missing, `readFixture` throws).

- [ ] **Step 4: Implement `harness/v1.ts`, `harness/fixture.ts`, `harness/capture.ts`, `harness/engines.ts`**

`loadV1` follows evidence script 01 line for line (it is VERIFIED to work on this machine); add the helpers listed in Interfaces. `writeFixture` serialises with `JSON.stringify(encodeSpecial(...), null, 1)` so diffs are line-based. The CLI parses `process.argv`: engine name or `all`, flags `--check`, `--emit`.

- [ ] **Step 5: Implement the two first engines and capture**

`smoke/capture.ts`: for each of the 20 functions, at least three argument tuples by direct call (`pFromT` over `[0.5,3],[2.15,21],[5,10],[10,30],[20,100],[40,200]`; `pFromF` over the audit's five; `pFromChi` four; `normalCDF` six; `stkShapiro`, `stkPtukey`, `stkQtukey`, `stkExactMW`, `pwPower`, `pwSolveN` with the argument lists of evidence script 02; `accItems` on three sentences with numbers, citations and quotes; `pdScanText` on the three strings of `core/test/pd.test.ts`; `provHash` on `"a b c"`, `"abc"`, `""`; `aiuClassify` on `"Continue this writing"`, `"You are Appu, the help assistant"`, `"Something new"`; `ccNorm` on `"Müller"`, `"O’Brien"`, `"van der Berg"`). Record `{ fn, args, out }`.

`stats-demos/capture.ts`: evidence script 04 verbatim in TypeScript: for each `TG_DEMO` key, paste `csv` into `#statsPaste`, `_rtSkip = true; statsParse(); _rtSkip = false`, set `#statsTest`, `statsFieldsRender()`, map `sel` names to column indexes through `_statsData.cols`, set `extra`, tick `.sfm_items` for `tick`, set `sf_rev`/`sf_rrange` for `rev`, clear `toasts`, call `statsRunNow()`, record `{ id, test, csv, sel, extra, tick, apa: #statsSentence.textContent, resultsText: #statsResults.textContent with whitespace collapsed, resultsHtml: #statsResults.innerHTML, toasts }`. (Wave 2 consumes `resultsHtml`; Wave 0 only proves the capture.)

Run: `pnpm --filter @appuscholar/core golden:capture all`
Expected: `smoke/cases.json` and `stats-demos/demos.json` written; both headers say build `2026.10.13a`.

- [ ] **Step 6: Run the tests, lint and typecheck**

Run: `pnpm --filter @appuscholar/core test:golden && pnpm --filter @appuscholar/core lint && pnpm --filter @appuscholar/core typecheck`
Expected: PASS; `live.test.ts` reports skipped unless `V1_INDEX` is exported, then passes too (`V1_INDEX=../appuscholer/index.html pnpm --filter @appuscholar/core test:golden` from the repo root).

- [ ] **Step 7: Add the CI step and verify `--check`**

In `.github/workflows/ci.yml`, job `checks`, insert `- run: pnpm --filter @appuscholar/core test:golden` directly before `- run: pnpm -r test` (the golden suite then fails by name). Run `pnpm --filter @appuscholar/core golden:capture all --check`; expected output: every file `same`, exit code 0. Edit one digit in `smoke/cases.json`, run again: `differs` with the JSON path, exit code 1; restore the file (`git checkout -- packages/core/test/golden/smoke/cases.json`).

- [ ] **Step 8: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml packages/core/test/golden .github/workflows/ci.yml
git commit -m "test(core): golden-master harness drives v1 in jsdom; 20 pure functions and the 13 demo datasets captured as fixtures"
```

---

### Task 2: Deviation register

**Files:**
- Create: `docs/superpowers/specs/parity-deviations.md`

**Interfaces:**
- Produces: the register's row format, used by every later task: `| id | where (v1 line → core module) | v1 behaviour | v2 behaviour or proposal | why | status | approver and date | pinned by |`. Ids: audit flags keep their `F` number (`F5`, `F23a`); new rows are `D-W<wave>-<n>`. Statuses: `proposed` (awaits OJ for numbers, Dr. Sharma for copy), `approved`, `rejected`, `noted` (an observation that changes no output; recorded so it is not rediscovered).

- [ ] **Step 1: Write the file**

Header: purpose (spec §5.6), the two rules ("numbers never deviate without OJ; copy never deviates without Dr. Sharma"), the row format, and these first rows:

| id | where | v1 | v2 proposal | status |
|---|---|---|---|---|
| F5 | `pFromF` 8688, `1 − betai` | right tail below about 1e-16 is exactly 0 (F = 200 on (3, 50) df prints 0; scipy 7.8e-28) | port verbatim; visible only in Numbers check where `p = 0` can appear | `noted`, pinned by Task 6 `pvalue.scipy.test.ts` F5 cases |
| F23 | `citFmt` 7053–7465 | every style rule marked CHECK by its author | port verbatim (Decision 5); editorial pass against the manuals is a separate task with its own rows | `proposed` |
| F25 | `ideaAssess` 8568–8580 | the five Low/Medium/High ratings and the verdict are written by the AI; no scoring code | port the prompt only; the register notes the exception to "every number from code" | `noted` |
| F26 | `getEditorText` 3151, `ccOpen` 12159, `clHtmlToText` 6852, `textOf` 4959 | reads the browser's `innerText` | one converter in `core/doctext.ts`, pinned to Chromium output (spec §5.3) | `approved` by spec ruling, pinned by Task 3 |
| D-W0-1 | `PROVIDERS.claude.model` 2563 → `providers.ts` | `claude-haiku-4-5-20251001` | `claude-haiku-5-5` with `claude-haiku-4-5` fallback ("the controller ruled", Phase 2) | `approved` earlier; OJ to initial |
| D-W0-2 | `PROVIDERS.deepseek/openai.steps` 2559, 2562 → `providers.ts` | browser-call warnings in the steps HTML | removed: v2 calls go through the api | `approved` by the v2 design |
| D-W0-3 | `sanitize.ts` | no v1 counterpart (v1 stores editor HTML as typed) | DOMPurify allow-list on import and save | `noted`; no golden possible |
| D-W0-4 | `computeOriginality` 3346 → `originShare` | a document with `origin === "source"` returns `studentPct: null, source: true` | v2 has no source documents yet; `originShare` has no source branch | `proposed`: add when documents gain `origin` |
| D-W0-5 | `bodyToHTML` 3143, `imgHydrate` → `v1import.ts` | plain bodies wrapped with `<br>`, `appuimg:` placeholders rehydrated, escaped image markup repaired | wrap rule ported; bodies sanitised; no image rehydration or repair | `noted`; Task 5 golden shows the exact difference |

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/parity-deviations.md
git commit -m "docs(spec): deviation register for the parity port with the first nine rows"
```

---

### Task 3: Document-text contract pinned to Chrome (G1, F26, F28)

**Files:**
- Create: `packages/core/src/doctext.ts`
- Create: `packages/core/test/golden/doctext/corpus.json` (hand-written inputs: this is the one fixture whose *inputs* a person writes; its outputs come from Chromium), `packages/core/test/golden/doctext/innertext-chrome.json`, `packages/core/test/golden/doctext/en-in-numbers.json` (captured), `packages/core/test/golden/doctext/textcontent.json` (captured in jsdom), `packages/core/test/golden/doctext/capture.ts`
- Create: `apps/web/scripts/capture-doctext-chrome.mjs`
- Test: `packages/core/test/golden/doctext.test.ts`
- Modify: `apps/web/package.json` (script `"doctext:capture": "node scripts/capture-doctext-chrome.mjs"`), `packages/core/src/index.ts`, `docs/superpowers/specs/parity-deviations.md`

**Interfaces:**
- Produces (`doctext.ts`):
  - `docInnerText(html: string): string`: what Chromium's `innerText` returns for `html` placed in a `<div style="white-space:pre-wrap">` with default user-agent styles (the rendering of v2's editor: ProseMirror sets `white-space: pre-wrap` on its root). Entities decoded, `&nbsp;` kept as U+00A0.
  - `docTextContent(html: string): string`: DOM `textContent` semantics (text nodes concatenated, entities decoded, no separators), as v1's `ncOpen` 12353 reads the editor.
  - Both throw on nothing and return `""` for `""`.
- Consumed later by: `crossCheckHtml` (Task 9), `numbersCheckHtml` (Task 7), `docPlainForCitations` (Task 10), Closeness and Make PPT (Wave 3).

- [ ] **Step 1: Write the corpus**

`corpus.json` is `[{ "id", "html" }]`. The html strings are shaped like `editor.getHTML()` output of `apps/web/lib/editorExtensions.ts` (StarterKit, Table, Image, Sub/Superscript, Highlight, TextStyle, TextAlign, the `classSpan` mark, the `pageBreak` node) plus the v1-import shapes `sanitizeHtml` lets through. Required ids and content (add more; never remove one):

| id | html |
|---|---|
| `two-paragraphs` | `<p>First.</p><p>Second.</p>` |
| `headings` | `<h1>Title</h1><p>Body</p><h2>Method</h2><p>Text</p><h3>Sub</h3><p>More</p>` |
| `empty-paragraphs` | `<p>a</p><p></p><p></p><p>b</p>` |
| `trailing-br` | `<p>line<br></p><p>next</p>` |
| `hard-breaks` | `<p>one<br>two<br><br>three</p>` |
| `list-tiptap` | `<ul><li><p>alpha</p></li><li><p>beta</p></li></ul><ol><li><p>one</p></li><li><p>two</p></li></ol>` |
| `list-v1` | `<ul><li>alpha</li><li>beta</li></ul>` |
| `nested-list` | `<ul><li><p>outer</p><ul><li><p>inner</p></li></ul></li><li><p>last</p></li></ul>` |
| `blockquote-code` | `<blockquote><p>quoted</p></blockquote><pre><code>x = 1\ny = 2</code></pre><p>after</p>` |
| `inline-marks` | `<p>a <strong>b</strong> <em>c</em> <s>d</s> <u>e</u> <code>f</code> <mark>g</mark> H<sub>2</sub>O x<sup>2</sup> <a href="https://x.org">link</a></p>` |
| `ai-ins-span` | `<p>mine <span class="ai-ins" data-h="1xmanvp">theirs<br>more</span> tail</p>` |
| `styled-span` | `<p>a<span style="vertical-align: super">1</span> b <span style="color: red">red</span></p>` |
| `table` | `<table><tbody><tr><th><p>H1</p></th><th><p>H2</p></th></tr><tr><td><p>c1</p></td><td><p>c2</p></td></tr></tbody></table><p>after</p>` |
| `table-in-li` | `<ul><li><p>item</p><table><tbody><tr><td><p>c</p></td></tr></tbody></table></li></ul>` |
| `image-in-p` | `<p>before <img src="https://abc.public.blob.vercel-storage.com/x.png" alt="chart"> after</p><p><img src="https://abc.public.blob.vercel-storage.com/y.png"></p>` |
| `hr-and-pagebreak` | `<p>a</p><hr><p>b</p>` followed by the `pageBreak` node's `renderHTML` output from `editorExtensions.ts` (copy it from the file) and `<p>c</p>` |
| `nbsp-citation` | `<p>Sleep loss predicted delay (Smith,&nbsp;2020) and (Rao et&nbsp;al., 2019).</p>` |
| `double-spaces` | `<p>two  spaces   and three</p>` |
| `leading-trailing-space` | `<p> lead</p><p>trail </p>` |
| `refs-english` | `<p>Body (Smith, 2020).</p><h2>References</h2><p>Smith, J. (2020). Title. <em>Journal</em>, 1(2), 3-4.</p>` |
| `refs-hindi-heading` | `<p>अध्ययन (Sharma,&nbsp;2021) ने दिखाया।</p><p>संदर्भ सूची</p><p>Sharma, R. (2021). शोध-प्रबंध. University of Delhi.</p>` |
| `refs-last-heading-wins` | `<p>References are listed below.</p><p>References</p><p>A, B. (2001). X.</p><p>Bibliography</p><p>C, D. (2002). Y.</p>` |
| `v1-divs` | `<div>line one</div><div>line two<br></div><div><br></div><div>line four</div>` |
| `v1-plain-br` | `<p>line one<br>line two<br>line three</p>` |
| `v1-font-span` | `<p><span style="font-size: 18px">big</span> <span>plain</span></p>` (v1's `<font>` is stripped by `sanitizeHtml`, so the corpus holds what reaches v2) |
| `align-and-highlight` | `<p style="text-align: center">centred</p><p><mark data-color="#fde68a" style="background-color: #fde68a">hi</mark></p>` |
| `devanagari-body` | `<p>यह एक वाक्य है।</p><p>दूसरा वाक्य, with English.</p>` |
| `empty` | `` |
| `text-only` | `plain text with no tags` |
| `entities` | `<p>a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;</p>` |

- [ ] **Step 2: Write the Playwright capture**

`apps/web/scripts/capture-doctext-chrome.mjs` (ESM, like `extract-v1-i18n.mjs`): `import { chromium } from "@playwright/test"`; read the corpus from `packages/core/test/golden/doctext/corpus.json` (path resolved from `import.meta.url`); launch headless Chromium; `page.setContent('<!doctype html><meta charset="utf-8"><div id="normal"></div><div id="prewrap" style="white-space:pre-wrap"></div>')`; for every case set `innerHTML` on both divs and read `innerText`; write `innertext-chrome.json` as `{ engine: "doctext", captured, chromium: browser.version(), playwright: <package version>, css: { normal: "default UA", preWrap: "white-space:pre-wrap" }, cases: [{ id, normal, preWrap }] }`. Then evaluate in the page `[0, 1, 12, 123, 1234, 12345, 123456, 1234567, 12345678, 1234567.5, 0.5, -1234567].map(n => [n, n.toLocaleString("en-IN")])` and write `en-in-numbers.json` with the same header. Flag `--check`: compare with the committed files and exit 1 on difference. Add the `doctext:capture` script to `apps/web/package.json`.

Run: `pnpm --filter @appuscholar/web doctext:capture`
Expected: both files written; `list-tiptap`'s `preWrap` value shows how Chromium separates `<li><p>` items (record what it is; do not guess it).

- [ ] **Step 3: Capture `textContent` in jsdom**

`doctext/capture.ts` (registered in `engines.ts` as `doctext`): for every corpus case, `div.innerHTML = html; div.textContent` in the v1 jsdom window → `textcontent.json` `{ cases: [{ id, text }] }`. (textContent is defined by the DOM standard, so jsdom and Chromium agree; it is captured rather than reasoned about all the same.)

Run: `pnpm --filter @appuscholar/core golden:capture doctext`

- [ ] **Step 4: Write the failing tests**

`packages/core/test/golden/doctext.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { docInnerText, docTextContent } from "../../src/doctext";
import { readFixture } from "./harness/fixture";

const corpus = JSON.parse(readFileSync(new URL("./doctext/corpus.json", import.meta.url), "utf8")) as Array<{ id: string; html: string }>;
const chrome = JSON.parse(readFileSync(new URL("./doctext/innertext-chrome.json", import.meta.url), "utf8")) as { chromium: string; cases: Array<{ id: string; normal: string; preWrap: string }> };
const tc = readFixture<{ cases: Array<{ id: string; text: string }> }>("doctext", "textcontent");

describe("docInnerText equals Chromium innerText under white-space: pre-wrap", () => {
  it("the corpus and the capture cover the same ids, and the required ids are present", () => {
    expect(chrome.cases.map(c => c.id)).toEqual(corpus.map(c => c.id));
    for (const id of ["two-paragraphs", "empty-paragraphs", "trailing-br", "list-tiptap", "nested-list", "table-in-li", "nbsp-citation", "refs-hindi-heading", "refs-last-heading-wins", "v1-divs"]) expect(corpus.some(c => c.id === id)).toBe(true);
    expect(chrome.chromium).toMatch(/^\d+\./);
  });
  for (const c of corpus) it(c.id, () => {
    const want = chrome.cases.find(x => x.id === c.id)!.preWrap;
    expect(docInnerText(c.html)).toBe(want);
  });
  it("keeps U+00A0 so the caller can map it as v1 does", () => {
    const t = docInnerText('<p>(Smith,&nbsp;2020)</p>');
    expect(t).toContain("\u00a0");
    expect(t.replace(/\u00a0/g, " ")).toBe("(Smith, 2020)");
  });
});

describe("docTextContent equals DOM textContent", () => {
  for (const c of corpus) it(c.id, () => {
    expect(docTextContent(c.html)).toBe(tc.cases.find(x => x.id === c.id)!.text);
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `pnpm --filter @appuscholar/core test:golden -- doctext`
Expected: FAIL, `doctext` module not found.

- [ ] **Step 6: Implement `docInnerText` and `docTextContent` in `packages/core/src/doctext.ts`**

Tokenise with the same regex walker `origin.ts` uses (tags, text, comments stripped, `VOID` set), decoding the five named entities plus numeric references. `docTextContent` concatenates text. `docInnerText` follows the HTML standard's *rendered text collection steps* for the allowed tags under default UA display values: `br` → `"\n"`; text under `pre-wrap` keeps its spaces and newlines; a `td`/`th` adds `"\t"` after it unless it is the row's last cell; a `tr` adds `"\n"` after it unless it is the table's last row; `p` has required line-break count 2 before and after; every other block-level element (`div`, `h1`–`h6`, `ul`, `ol`, `li`, `blockquote`, `pre`, `table`, `figure`, `figcaption`, `hr`, the page-break element) has count 1; `img`, `script`-like and hidden content contribute nothing; then drop empty strings, drop runs of required breaks at the start and end, and replace every remaining run by as many `"\n"` as the run's maximum. Where the Chromium capture disagrees with this reading, the capture wins: adjust the rule, never a case id.

- [ ] **Step 7: Run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- doctext`
Expected: PASS for every corpus id in both describes.

- [ ] **Step 8: Export, register rows, commit**

Export both functions from `packages/core/src/index.ts`. Register rows: `D-W0-6` (`noted`): v2 list items are `<li><p>…</p></li>`, so their innerText separation is whatever `list-tiptap` captured, not v1's `<li>` text (`list-v1`); affects line-based rules in Closeness later. `D-W0-7` (`noted`): the contract is captured under `white-space: pre-wrap` (v2's editor); runs of spaces are preserved where v1's editor collapsed them; no Wave 0–1 consumer distinguishes runs of spaces (`ccNorm`, `apSquash`, `trim()`), both columns are kept in the fixture.

```bash
git add packages/core/src/doctext.ts packages/core/src/index.ts packages/core/test/golden/doctext packages/core/test/golden/doctext.test.ts packages/core/test/golden/harness/engines.ts apps/web/scripts/capture-doctext-chrome.mjs apps/web/package.json docs/superpowers/specs/parity-deviations.md
git commit -m "feat(core): document text contract: docInnerText pinned to Chromium innerText, docTextContent to DOM textContent (G1, F26)"
```

---

### Task 4: Golden snapshots for accuracy, pd, aiuse, origin and providers

**Files:**
- Create: `packages/core/test/golden/{accuracy,pd,aiuse,origin,providers}/capture.ts` and `cases.json`
- Test: `packages/core/test/golden/ported.test.ts`
- Modify: `packages/core/test/golden/harness/engines.ts`, `docs/superpowers/specs/parity-deviations.md`

**Interfaces:**
- Consumes: `loadV1`, `writeFixture`, `readFixture` (Task 1); the nine modules' existing exports (`accItems`, `accCheck`, `scanText`, `maskText`, `classifyAiUse`, `provHash`, `originCount`, `originShare`, `PROVIDERS`, `PROV_ORDER`).
- Produces: nothing new in `src`; a fixture per module with v1's own outputs.

- [ ] **Step 1: Write the captures**

- `accuracy`: `accItems(s)` on 12 strings (numbers with thousands separators and percent, `.32`, Unicode minus, `(Steel, 2007)`, `Steel and Lee (2007a)`, `Rao et al., 2019`, curly and straight quotes of 3, 4 and 201 characters, a Hindi sentence) and `accCheck(orig, res, kind)` on the five pairs of `core/test/accuracy.test.ts` for each `kind` in `continue`, `improve`, `expand`, plus a pair with nine added items.
- `pd`: `pdScanText` and `pdMask` on the four strings of `core/test/pd.test.ts`, an empty string, a string with two emails, and a 12-digit number inside a longer digit run.
- `aiuse`: `aiuClassify` on the first 400 characters of every prompt the `prompts` capture of Task 5 records, plus the three literals of `core/test/aiuse.test.ts`.
- `origin`: `provHash` on 8 strings; `provCountDoc(html)` on the five HTML strings of `core/test/origin.test.ts`; `computeOriginality()` after `setEditorHtml(html)` for the same five and for an empty editor (v1 reads the live editor).
- `providers`: `eval("PROVIDERS")` and `eval("PROV_ORDER")` as JSON.

Run: `pnpm --filter @appuscholar/core golden:capture accuracy pd aiuse origin providers`

- [ ] **Step 2: Write the failing tests**

`ported.test.ts`, one `describe` per module; the shape for `accuracy` (others follow it):

```ts
const acc = readFixture<{ items: Array<{ s: string; out: AccItems }>; checks: Array<{ orig: string; res: string; kind: AccKind; out: unknown }> }>("accuracy", "cases");
for (const c of acc.items) it(`accItems ${JSON.stringify(c.s).slice(0, 40)}`, () => expect(accItems(c.s)).toEqual(c.out));
for (const c of acc.checks) it(`accCheck ${c.kind}`, () => expect(accCheck(c.orig, c.res, c.kind)).toEqual(c.out));
```

`origin`: `originCount(html)` equals v1's `provCountDoc` result `{typed, ai, kept, edited, unknown}` with `passages` added (v1 returns the five counts; assert each field); `originShare(html)` equals `computeOriginality()`'s `{total, ai, studentPct}` for non-source documents. `providers`: for every id in v1's `PROV_ORDER`, `PROVIDERS[id].name`, `.short`, `.fallbacks` equal v1's, and `.model` equals v1's except `claude` (D-W0-1); `PROV_ORDER` equal; v1's `steps` with the `<br><span …>⚠ …</span>` warning removed equals `stepsHtml` (D-W0-2). `aiuse`: `classifyAiUse(p)` equals `aiuClassify(p)` for every recorded prompt.

- [ ] **Step 3: Run to verify they fail, then pass**

Run: `pnpm --filter @appuscholar/core test:golden -- ported`
Expected: first FAIL (no fixture), then after capture PASS. If any assertion fails against v1's output, the port has a bug or an unrecorded deviation: fix the module (verbatim) or add a register row; never edit the fixture.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/golden docs/superpowers/specs/parity-deviations.md
git commit -m "test(core): golden snapshots from v1 for accuracy, pd, aiuse, origin and providers"
```

---

### Task 5: Golden snapshots for prompts, v1import and v1locked

**Files:**
- Create: `packages/core/test/golden/{prompts,v1import,v1locked}/capture.ts` and fixtures (`prompts/cases.json`, `v1import/bundle.json`, `v1import/bodies.json`, `v1locked/locked-gzip.json`, `v1locked/locked-plain.json`)
- Test: `packages/core/test/golden/ported2.test.ts`
- Modify: `packages/core/test/golden/harness/engines.ts`, `docs/superpowers/specs/parity-deviations.md`

**Interfaces:**
- Consumes: `V1.stubCallAI`, `setEditorHtml`, `selectEditor`, `setValue` (Task 1); `buildWritingPrompt`, `buildDraftFirstPrompt`, `buildChatPrompt`, `contentLangInstruction`, `PLAIN_OUT` (`prompts.ts`); `parseV1Backup`, `v1BodyToHtml` (`v1import.ts`); `unlockV1Backup`, `isLockedV1Backup` (`v1locked.ts`).

- [ ] **Step 1: Write the captures**

- `prompts`: `stubCallAI()`; `setEditorHtml("<p>" + 60 words + "</p>")`; `localStorage.removeItem("appu_draft_first")`; call `continueWriting()`, then `selectEditor()` and `improveText()`, `makeLonger()`, `draftFeedback("tail")`, `draftFeedback("improve")`, `draftFeedback("expand")`; `setValue("chatIn", question of 2,500 characters)` and `askAI()`; record `{ entry, prompt, opts }` for each; then `localStorage.setItem("appu_content_lang", "hi")` and record `eval("contentLangInstruction()")` and `eval("PLAIN_OUT")`; also `localStorage.setItem("appu_field", "education")` and repeat `askAI()`.
- `v1import`: seed `localStorage` with `appu_docs` (four documents: HTML body, plain body with newlines, a body with `<img src="appuimg:…">`, a body with escaped `&lt;span class="img-wrap"` markup), `appu_projects`, `appu_theme`, `appu_key_gemini` (must be excluded by `backupOk`); record `eval("backupCollect()")` as the bundle's `data`, wrapped as `{ app: "appuscholar", v: 1, exported, data }` (the shape `backupExport` 3996 writes; copy its exact wrapper by reading lines 3996–4013). Also `bodies.json`: `bodyToHTML(body)` for 12 bodies (plain, plain with `\n`, each tag of `looksLikeStoredHTML`'s list, text containing `<` that is not a tag, the escaped `img-wrap` case).
- `v1locked`: `bkEncrypt(plainBundleText, "correct horse battery")` once with `CompressionStream` present (z = 1) and once with `window.CompressionStream = undefined` (z = 0); record the locked bundle objects (iter 600,000, as v1 ships).

- [ ] **Step 2: Write the failing tests**

```ts
describe("prompts.ts equals v1's prompts", () => {
  const fx = readFixture<{ cases: Array<{ entry: string; prompt: string; opts: { temp: number; max: number } }>; plainOut: string; hiInstruction: string; editorText: string; question: string }>("prompts", "cases");
  it("PLAIN_OUT and the Hindi instruction", () => { expect(PLAIN_OUT).toBe(fx.plainOut); expect(contentLangInstruction("hi")).toBe(fx.hiInstruction); });
  for (const [entry, kind] of [["continueWriting", "continue"], ["improveText", "improve"], ["makeLonger", "expand"]] as const) it(entry, () => {
    const c = fx.cases.find(x => x.entry === entry)!;
    const b = buildWritingPrompt(kind, kind === "continue" ? fx.editorText.slice(-2000) : fx.editorText);
    expect(b.prompt).toBe(c.prompt); expect(b.temp).toBe(c.opts.temp); expect(b.max).toBe(c.opts.max);
  });
  // draftFeedback ×3 against buildDraftFirstPrompt, askAI against buildChatPrompt("psychology", q) and ("education", q): same pattern.
});
describe("v1import.ts reads what v1 exports", () => {
  it("parses v1's own bundle: titles, order, projects; bodies pass through bodyToHTML then sanitizeHtml", () => {
    const fx = readFixture<{ bundle: unknown; docs: Array<{ title: string; body: string; v1Html: string }> }>("v1import", "bundle");
    const r = parseV1Backup(JSON.stringify(fx.bundle)); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.backup.documents.map(d => d.title)).toEqual(fx.docs.map(d => d.title));
    for (const [i, d] of fx.docs.entries()) expect(r.backup.documents[i]!.bodyHtml).toBe(sanitizeHtml(d.v1Html));
  });
  it("v1BodyToHtml agrees with v1 bodyToHTML on the wrap decision", () => {
    const fx = readFixture<{ cases: Array<{ body: string; out: string }> }>("v1import", "bodies");
    for (const c of fx.cases) expect(v1BodyToHtml(c.body)).toBe(sanitizeHtml(c.out));
  });
});
describe("v1locked.ts opens what v1 locks", () => {
  for (const file of ["locked-gzip", "locked-plain"]) it(file, async () => {
    const fx = readFixture<{ locked: unknown; plain: string; pass: string }>("v1locked", file);
    const text = JSON.stringify(fx.locked);
    expect(isLockedV1Backup(text)).toBe(true);
    expect(await unlockV1Backup(text, fx.pass)).toEqual({ ok: true, text: fx.plain });
    expect(await unlockV1Backup(text, fx.pass + "x")).toEqual({ ok: false, reason: "wrong-passphrase" });
  }, 30_000);
});
```

The `img-wrap` repair and `appuimg:` cases are expected to differ (D-W0-5): the test lists them as `expect(...).not.toBe(...)` with the register id in the test name, so the difference is pinned, not hidden.

- [ ] **Step 3: Run, fix, run**

Run: `pnpm --filter @appuscholar/core test:golden -- ported2`
Expected: PASS after capture. A mismatch in `prompts` is a bug in `prompts.ts` (its tests were hand-written: this is the first time they meet v1) and is fixed in the module, not in the fixture.

- [ ] **Step 4: Register and commit**

Update D-W0-5 with the exact differences the test pins. Add `D-W0-8` (`noted`): `buildChatPrompt` takes `field` as given while v1's `fieldName()` trims and cuts to 60 characters with default `psychology`; Task 13 adds `fieldLabel`.

```bash
git add packages/core/test/golden docs/superpowers/specs/parity-deviations.md
git commit -m "test(core): golden snapshots from v1 for the writing prompts, the v1 backup format and locked backups"
```

Wave 0 gate (spec §6): `stats-demos/demos.json` holds all 13 demos through `statsRunNow`; `smoke/cases.json` holds 20 pure functions by direct call; CI's `checks` job runs `test:golden`. All three are true after Task 5; record them in the ledger with the CI run id.

---

### Task 6: The p-value core and the p formatters (S1 core, F5)

**Files:**
- Create: `packages/core/src/pvalue.ts`, `packages/core/src/statfmt.ts`
- Create: `packages/core/test/golden/pvalue/capture.ts`, `pvalue/cases.json`, `pvalue/scipy-reference.py`, `pvalue/scipy-reference.json`; `packages/core/test/golden/statfmt/capture.ts`, `statfmt/cases.json`
- Test: `packages/core/test/golden/pvalue.test.ts`, `packages/core/test/golden/statfmt.test.ts`
- Modify: `packages/core/src/index.ts`, `engines.ts`

**v1 source (read only these lines):** `index.html` 8633–8690: `gammaln` 8633, `_betacf` 8640, `betai` 8657, `_gser` 8662, `_gcf` 8668, `gammaq` 8678, `erf` 8679, `normalCDF` 8686, `pFromT` 8687, `pFromF` 8688, `pFromChi` 8689, `pFromZ` 8690. Formatters 11980–11982: `noLead`, `pCell`, `fmtP`.

**Interfaces:**
- Produces (`pvalue.ts`): `gammaln(x: number): number`, `betai(a: number, b: number, x: number): number`, `gammaq(a: number, x: number): number`, `erf(x: number): number`, `normalCDF(z: number): number`, `pFromT(t: number, df: number): number` (two-tailed), `pFromF(f: number, df1: number, df2: number): number` (one-tailed; `f <= 0` → 1), `pFromChi(chi2: number, df: number): number`, `pFromZ(z: number): number` (two-tailed; `z === 0` → 1). `_betacf`, `_gser`, `_gcf` stay module-private with v1's constants (`MAXIT 200`, `EPS 3e-9`, `FPMIN 1e-30`).
- Produces (`statfmt.ts`): `noLead(s: string | number): string` (`String(s).replace(/^(-?)0\./, "$1.")`), `pCell(p: number): string` (`"&lt; .001"` below .001, else `noLead(p.toFixed(3))`; the entity is v1's, kept), `fmtP(p: number): string` (`"p < .001"` or `"p = " + noLead(p.toFixed(3))`).
- Consumed by: Task 7 (`ncPOf`, `ncFmtP`), Task 11 (`apNumbers`), Wave 2 (everything).

- [ ] **Step 1: Capture the grids from v1 and the scipy reference**

`pvalue/capture.ts`: direct calls over these grids, every point recorded as `{ fn, args, out }`:
`pFromT`: t ∈ {0, 0.5, 1, 2.15, 5, 10, 20, 40} × df ∈ {1, 2, 3, 10, 21, 30, 100, 200, 1000, 2.5}; `pFromF`: f ∈ {0, 1, 4, 30, 200, 900} × (df1, df2) ∈ {(1,10), (2,10), (3,20), (2,40), (3,50), (4,100), (1.5,7.3)}; `pFromChi`: χ² ∈ {0, 3.84, 20, 80, 200} × df ∈ {1, 3, 5, 10}; `pFromZ`: {0, 0.5, 1.96, 3, 6, −2}; `normalCDF`: {−3, −1, 0, 0.5, 1, 2, 3, 4, 5}; `erf`: {−2, −0.5, 0, 0.3, 1, 3}; `gammaln`: {0.5, 1, 2.5, 10, 100, 1e-3}; `betai`: (a,b,x) ∈ {(0.5,0.5,0.5), (2,3,0.1), (10,0.5,0.999), (5,5,0), (5,5,1), (1.5,21,0.02)}; `gammaq`: (a,x) ∈ {(0.5,0), (0.5,1.92), (2.5,10), (5,0.5), (50,80)}.
`statfmt/capture.ts`: `noLead`, `pCell`, `fmtP` over p ∈ {0, 0.0004, 0.0005, 0.001, 0.0015, 0.0499, 0.05, 0.5, 0.9996, 1, 1.0004, −0.2, NaN}.

`pvalue/scipy-reference.py` (adapted from evidence script 03; run once on OJ's Mac with scipy 1.17.1, path given on the command line): reads `cases.json`, writes `scipy-reference.json` with `{ scipy: "<version>", cases: [{ fn, args, ref }] }` where `ref` is `2*t.sf`, `f.sf`, `chi2.sf`, `2*norm.sf(|z|)`, `norm.cdf`, `special.erf`, `special.gammaln`, `special.betainc`, `special.gammaincc`.

Run: `pnpm --filter @appuscholar/core golden:capture pvalue statfmt && python3 -I packages/core/test/golden/pvalue/scipy-reference.py packages/core/test/golden/pvalue`

- [ ] **Step 2: Write the failing tests**

```ts
describe("pvalue.ts is v1's distribution code", () => {
  const fx = readFixture<{ cases: Array<{ fn: string; args: number[]; out: number }> }>("pvalue", "cases");
  const fns: Record<string, (...a: number[]) => number> = { gammaln, betai, gammaq, erf, normalCDF, pFromT, pFromF, pFromChi, pFromZ };
  for (const c of fx.cases) it(`${c.fn}(${c.args.join(", ")})`, () => expect(fns[c.fn]!(...c.args)).toBe(c.out));
});
describe("pvalue.ts agrees with scipy where scipy has the statistic (spec §5.9)", () => {
  const ref = JSON.parse(readFileSync(new URL("./pvalue/scipy-reference.json", import.meta.url), "utf8")) as { scipy: string; cases: Array<{ fn: string; args: number[]; ref: number }> };
  it("reference file names its scipy", () => expect(ref.scipy).toBe("1.17.1"));
  for (const c of ref.cases) it(`${c.fn}(${c.args.join(", ")}) vs scipy`, () => {
    const got = fns[c.fn]!(...c.args);
    if (c.fn === "pFromF" && c.ref < 1e-16) { expect(got).toBe(0); return; }           // F5: 1 − I underflows to exactly 0
    if (c.fn === "normalCDF" || c.fn === "erf") { expect(Math.abs(got - c.ref)).toBeLessThan(1e-7); return; }   // F6: Abramowitz–Stegun 7.1.26
    expect(Math.abs(got - c.ref) / Math.max(Math.abs(c.ref), 1e-300)).toBeLessThan(1e-6);
  });
});
describe("statfmt.ts", () => { /* every fixture case: toBe */ });
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @appuscholar/core test:golden -- pvalue statfmt`
Expected: FAIL, modules not found.

- [ ] **Step 4: Port lines 8633–8690 and 11980–11982 verbatim with types**

Keep `var` arithmetic order (`tmp -= (x + 0.5) * Math.log(tmp)` before `ser`), the literal coefficients, the loop bounds and the early returns exactly; add parameter and return types only.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- pvalue statfmt`
Expected: PASS; every grid point `toBe`-equal (same V8 arithmetic in the same order gives bit-identical doubles).

- [ ] **Step 6: Export and commit**

Export all twelve functions from `index.ts`.

```bash
git add packages/core/src/pvalue.ts packages/core/src/statfmt.ts packages/core/src/index.ts packages/core/test/golden
git commit -m "feat(core): v1 p-value core (gammaln, betai, gammaq, pFromT/F/Chi/Z) and p formatters, golden-equal to v1 and within 1e-6 of scipy"
```

---

### Task 7: Numbers check (S10)

**Files:**
- Create: `packages/core/src/numbers.ts`
- Create: `packages/core/test/golden/numbers/capture.ts`, `numbers/sentences.json` (hand-written inputs), `numbers/cases.json` (captured)
- Test: `packages/core/test/golden/numbers.test.ts`
- Modify: `packages/core/src/index.ts`, `engines.ts`, `docs/superpowers/specs/parity-deviations.md`

**v1 source:** `index.html` 12195–12257: `NC_NUM`, `NC_P` 12195, `NC_RES` 12196–12203, `ncFind` 12204, `ncPOf` 12218, `ncJudge` 12227, `ncFmtP` 12257. Page code for reference only (do not port): `ncOpen` 12351–12367 (reads `editor.textContent`, computes the `ok`/`err`/`warn` counts), `ncJump` 12368.

**Interfaces:**
- Consumes: `pFromT`, `pFromF`, `pFromChi`, `pFromZ` (Task 6), `noLead` (Task 6), `docTextContent` (Task 3).
- Produces:
  - `type NcKind = "t" | "F" | "chi" | "H" | "r" | "z"`
  - `type NcFind = { kind: NcKind; df1: number | null; df2: number | null; stat: number; dec: number; op: string; p: number; pStr: string; pdec: number; start: number; end: number; raw: string }`
  - `type NcNote = "" | "nc_c_form" | "nc_c_df" | "nc_c_zero" | "nc_c_onetail" | "nc_c_round" | "nc_c_typo"`
  - `type NcJudge = { status: "ok" | "warn" | "error"; note: NcNote; pcalc?: number; pLo?: number; pHi?: number }`
  - `ncFind(text: string): NcFind[]`; `ncPOf(f: Pick<NcFind, "kind" | "df1" | "df2">, x: number): number | undefined`; `ncJudge(f: NcFind): NcJudge`; `ncFmtP(p: number): string`
  - `numbersCheck(text: string): Array<NcFind & { j: NcJudge }>` (`ncOpen`'s `ncFind(text).map(f => ({ ...f, j: ncJudge(f) }))`)
  - `numbersSummary(items): { n: number; ok: number; warn: number; err: number }` (`ncOpen`'s counts: `warn` is every non-ok item, errors included, as v1 counts them)
  - `numbersCheckHtml(html: string)`: `numbersCheck(docTextContent(html))`
- `NC_RES` stays a module-level array of `/g` regexes with `lastIndex = 0` before each scan, as v1 does.

- [ ] **Step 1: Write the sentence corpus**

`sentences.json`: `[{ "id", "text" }]`, at least 80 entries, at least 6 per kind (`t`, `F`, `chi`, `H`, `r`, `z`), at least one that reaches each note id, and these exact anchors:

| id | text |
|---|---|
| `t-ok` | `t(58) = 2.36, p = .022` |
| `t-round-edge` | `t(21) = 2.15, p = .043` |
| `t-onetail` | `t(30) = 1.70, p = .05` |
| `t-typo` | `t(30) = 2.04, p = .250` |
| `t-unicode-minus` | `t(11) = −1.31, p = .218` |
| `t-fractional-df` | `t(21.18) = 6.42, p < .001` |
| `t-zero-df` | `t(0) = 2.00, p = .05` |
| `F-ok` | `F(1, 22) = 0.30, p = .588` |
| `F-huge-F5` | `F(3, 50) = 200, p < .001` |
| `F-p-zero` | `F(2, 40) = 30.00, p = .000` |
| `F-p-over-one` | `F(2, 40) = 3.00, p = 1.2` |
| `chi-spellings` | `χ²(1, N = 120) = 3.84, p = .050; chi-square(2) = 20.0, p < .001; chi2(3) = 80, p < .001` |
| `H-ok` | `H(2) = 9.57, p = .008` |
| `r-ok` | `r(58) = .31, p = .016` |
| `r-leq` | `r(10) = .60, p ≤ .05` |
| `z-ok` | `z = -3.17, p = .002` |
| `z-geq` | `z = 1.00, p ≥ .30` |
| `two-in-one` | `A t-test, t(11) = 1.31, p = .218, and a correlation, r(58) = .31, p = .016, were reported.` |
| `none` | `No statistics here, only n = 120 and M = 3.45.` |
| `split-paragraphs-html` | (HTML, for `numbersCheckHtml`) `<p>The effect was significant, t(58) = 2.36, p = .022.</p><p>Next paragraph starts with F(1, 22) = 0.30, p = .588.</p>` |

- [ ] **Step 2: Capture**

`numbers/capture.ts`: for each text entry record `{ id, find: ncFind(text), judged: ncFind(text).map(f => ncJudge(f)) }`; for the HTML entry, `setEditorHtml(html)` then `ncFind(editor.textContent)` and judgments (v1's `ncOpen` path); plus `ncFmtP` over {NaN, Infinity, 0, 0.0004, 0.001, 0.05, 0.5, 1}. The judged objects carry `pcalc` NaN in the `form`/`df` branches, which the special-number encoding preserves.

Run: `pnpm --filter @appuscholar/core golden:capture numbers`

- [ ] **Step 3: Write the failing tests**

```ts
describe("numbers.ts is v1's Numbers check", () => {
  const fx = readFixture<{ cases: Array<{ id: string; text?: string; html?: string; find: NcFind[]; judged: NcJudge[] }>; fmt: Array<{ p: number; out: string }> }>("numbers", "cases");
  for (const c of fx.cases) it(c.id, () => {
    const items = c.html !== undefined ? numbersCheckHtml(c.html) : numbersCheck(c.text!);
    expect(items.map(({ j, ...f }) => f)).toEqual(c.find);
    expect(items.map(i => i.j)).toEqual(c.judged);
  });
  it("the corpus reaches every note id and every kind", () => {
    const notes = new Set(fx.cases.flatMap(c => c.judged.map(j => j.note)));
    for (const n of ["nc_c_form", "nc_c_df", "nc_c_zero", "nc_c_onetail", "nc_c_round", "nc_c_typo"]) expect(notes.has(n as NcNote)).toBe(true);
    const kinds = new Set(fx.cases.flatMap(c => c.find.map(f => f.kind)));
    expect([...kinds].sort()).toEqual(["F", "H", "chi", "r", "t", "z"]);
  });
  it("F(3, 50) = 200, p < .001 is ok with pcalc exactly 0 (F5)", () => {
    const [i] = numbersCheck("F(3, 50) = 200, p < .001");
    expect(i!.j).toEqual({ status: "ok", note: "", pcalc: 0, pLo: 0, pHi: 0 });
  });
  it("a statistic split across paragraphs is read from textContent, glued (v1 ncOpen)", () => {
    const items = numbersCheckHtml("<p>t(58) = 2.36, p</p><p>= .022</p>");
    expect(items).toHaveLength(1); expect(items[0]!.raw).toBe("t(58) = 2.36, p= .022");
  });
  it("numbersSummary counts as ncOpen does: warn includes errors", () => {
    const items = numbersCheck("t(30) = 2.04, p = .250 and t(58) = 2.36, p = .022");
    expect(numbersSummary(items)).toEqual({ n: 2, ok: 1, warn: 1, err: 1 });
  });
  for (const c of fx.fmt) it(`ncFmtP(${c.p})`, () => expect(ncFmtP(c.p)).toBe(c.out));
});
```

(The `F5` and `split` expectations are derived from v1's code path; the capture must contain both cases so the fixture, not this text, is the authority: keep `F-huge-F5` and `split-paragraphs-html` in the corpus.)

- [ ] **Step 4: Run to verify they fail, port 12195–12257 verbatim, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- numbers`
Expected: FAIL (module missing), then PASS. Keep the `'gi'` flag on the chi rule and the `'g'` on the others; keep `ncPOf`'s `switch` returning `undefined` for an unknown kind.

- [ ] **Step 5: Register, export, commit**

Register `D-W1-1` (`noted`): Numbers check reads `textContent`, so block boundaries vanish (v1 12353); ported as is; pinned by the split-paragraph test. Export `ncFind`, `ncJudge`, `ncPOf`, `ncFmtP`, `numbersCheck`, `numbersCheckHtml`, `numbersSummary` and the types.

```bash
git add packages/core/src/numbers.ts packages/core/src/index.ts packages/core/test/golden docs/superpowers/specs/parity-deviations.md
git commit -m "feat(core): Numbers check (ncFind, ncJudge, ncFmtP) ported verbatim with an 80-sentence golden corpus from v1"
```

---

### Task 8: HTML escape and citation formatting in eight styles (C1, F23)

**Files:**
- Create: `packages/core/src/html.ts`, `packages/core/src/citation.ts`, `packages/core/src/data/citation-tables.ts` (generated)
- Create: `packages/core/test/golden/html/capture.ts`, `html/cases.json`; `packages/core/test/golden/citation/capture.ts`, `citation/entries.json` (hand-written inputs), `citation/cases.json`, `citation/tables.json`, `citation/devanagari.json` (captured)
- Test: `packages/core/test/golden/html.test.ts`, `packages/core/test/golden/citation.test.ts`, `packages/core/test/golden/devanagari.test.ts`
- Modify: `packages/core/src/index.ts`, `engines.ts`, `docs/superpowers/specs/parity-deviations.md`

**v1 source:** `escHTML` 2606, `escAttr` 8033. Citation engine 7053–7465: `citLastName` 7056, `CIT_MONTHS`/`CIT_MON_MLA`/`CIT_MON_ABB`/`CIT_MON_IEEE` 7064–7067, `CIT_STYLES` 7068, `citIsNumbered`, `citKind` 7076–7084 (six Hindi type names), `I`/`citBare`/`citHTMLof`/`dot`/`citTrimDot`/`doiUrl`/`citDoiBare` 7085–7096, `citNames` 7097, `citInitials` 7103, `citIn`, `citListJoin`, `apaName`, `apaAuthors` 7126, `apaHead`, `apa6Authors` 7135, `mlaAuthors` 7142, `chicagoAuthors` 7150, `harvardAuthors` 7160, `vancAuthors` 7165, `ieeeAuthors` 7171, `citNum`, `citAccParts`, `citPg`, `citPP`, `citLink`, `citWho` 7186, `citEdList` 7206, `citFmtExtra` 7219, `citFmt` 7324–7465. Skip `citGetLib`/`citSaveLib` 7054–7055 (storage).

**Interfaces:**
- Produces (`html.ts`): `escHTML(s: unknown): string` (`& < > " '` → `&amp; &lt; &gt; &quot; &#39;`), `escAttr(s: unknown): string` (only `"`).
- Produces (`citation.ts`):
  - `type CitationStyle = "apa" | "apa6" | "mla" | "chicago" | "harvard" | "vancouver" | "ieee" | "ama"`
  - `type CitationEntry = { author?: string; year?: string; title?: string; source?: string; volume?: string; issue?: string; pages?: string; doi?: string; url?: string; month?: string; day?: string; accessed?: string; container?: string; editors?: string; number?: string; degree?: string; type?: string; style?: string; lang?: string }` (the object `citReadForm` 7466 builds and `citImport` 7999 stores)
  - `type CitationKind = "journal" | "book" | "web" | "chapter" | "report" | "thesis" | "conf"`
  - `type Formatted = { ref: string; refHTML: string; intext: string; sup: boolean; num: number }`
  - `CIT_STYLES`, `citIsNumbered(st: string): boolean`, `citKind(t: string | undefined): CitationKind`, `citLastName(a: string | undefined): string`, `citNames(raw: string | undefined): Array<{ last: string; first: string; org: boolean }>`, `citInitials(first: string): string[]`, `apaAuthors`, `apa6Authors`, `mlaAuthors`, `chicagoAuthors`, `harvardAuthors` `(raw: string | undefined): string`, `vancAuthors(raw, max: number, keep: number)`, `ieeeAuthors(raw)`, `citWho(ns: ReturnType<typeof citNames>, st: CitationStyle): string`, `citEdList(raw, mode: "apa" | "first-last" | "harvard" | "vanc" | "ieee"): { txt: string; n: number }`
  - `citFmt(d: CitationEntry, n: number, style: CitationStyle): Formatted` (v1 read `#citStyle` when `styleOverride` was absent; `style` is required here)
- Produces (`data/citation-tables.ts`, generated): `CIT_MONTHS`, `CIT_MON_MLA`, `CIT_MON_ABB`, `CIT_MON_IEEE`, `CIT_STYLES`.
- Consumed by: Task 9 (`citLastName`, `citFmt`), Task 10 (`citKey` uses `citLastName`; `bibliography` uses `citFmt`, `CIT_STYLES`), Task 12 (`CitationEntry`).

- [ ] **Step 1: Write the entry corpus**

`citation/entries.json`: `[{ "id", "entry" }]`, at least 25 entries, including the six of evidence script 06 verbatim (`miller-3-authors`, `bandura-book`, `who-website`, `roy-chapter`, `sharma-thesis`, `untitled-no-author-no-year`) and entries with these properties (one id each): 1, 2, 6, 7, 8, 20, 21 and 22 authors; `org-no-year` (`author: "World Health Organization"`, no year, journal); `initials-hyphen` (`author: "Sartre, J.-P."`); `initials-caps` (`author: "Narayan, RK"`); `first-two-names` (`author: "Shelley, Mary Ann"`); `comma-less-name` (`author: "Ramanujan"`); the six Hindi type names (`type: "पुस्तक"`, `"वेबसाइट"`, `"पुस्तक अध्याय"`, `"रिपोर्ट"`, `"शोध-प्रबंध"`, `"सम्मेलन शोध-पत्र"`, each with fitting fields); `web-month-day-accessed`; `thesis-masters` (`degree: "Master's thesis"`), `thesis-undergrad` (`degree: "Undergraduate thesis"`); `conf-with-month`; `report-with-number`; `missing-title`; `pages-dash-variants` (`"81-97"`, a second entry `"81–97"`, a third `"e12345"`); `doi-with-https-prefix`; `url-only`; `apa6-accessed`; `trailing-dot-title` (`title: "Why sleep matters."`).

- [ ] **Step 2: Capture**

`citation/capture.ts`: for every entry × every style × `n` ∈ {0, 3}: `citFmt(entry, n, style)` → `{ id, style, n, out }` (≥ 400 cases); also `citKind` over the 7 English names and 6 Hindi names, `citNames`/`citInitials`/each `*Authors`/`citWho`/`citEdList` over the author strings of the corpus; `emitTables("citation-tables", { CIT_MONTHS, CIT_MON_MLA, CIT_MON_ABB, CIT_MON_IEEE, CIT_STYLES })` under `--emit`; and `devanagari.json`: every single- or double-quoted string literal containing a Devanagari code point in v1 lines 7053–7563, 7871–7887, 7991–8028, 8041–8632, 8633–8690, 9855–9881, 9987–10105, 11162–11254, 11980–11982, 12100–12257 (regex over the source text; Task 9 and later tasks extend the range list in this one capture), as `{ ranges, strings }`.

`html/capture.ts`: `escHTML` and `escAttr` over `` `<a href="x">&'"` ``, `null`, `undefined`, `0`, a Devanagari string.

Run: `pnpm --filter @appuscholar/core golden:capture html citation --emit`

- [ ] **Step 3: Write the failing tests**

```ts
describe("citation.ts is v1's citFmt", () => {
  const fx = readFixture<{ cases: Array<{ id: string; style: CitationStyle; n: number; out: Formatted }>; kinds: Array<{ t: string; out: string }>; helpers: Array<{ fn: string; args: unknown[]; out: unknown }> }>("citation", "cases");
  const entries = JSON.parse(readFileSync(new URL("./citation/entries.json", import.meta.url), "utf8")) as Array<{ id: string; entry: CitationEntry }>;
  it("at least 25 entries, eight styles, two numberings, every kind in every style", () => {
    expect(entries.length).toBeGreaterThanOrEqual(25);
    expect(fx.cases.length).toBeGreaterThanOrEqual(400);
    for (const st of Object.keys(CIT_STYLES)) for (const k of ["journal", "book", "web", "chapter", "report", "thesis", "conf"])
      expect(fx.cases.some(c => c.style === st && citKind(entries.find(e => e.id === c.id)!.entry.type) === k)).toBe(true);
  });
  for (const c of fx.cases) it(`${c.id} ${c.style} n=${c.n}`, () => expect(citFmt(entries.find(e => e.id === c.id)!.entry, c.n, c.style)).toEqual(c.out));
  for (const k of fx.kinds) it(`citKind(${k.t})`, () => expect(citKind(k.t)).toBe(k.out));
  // helpers: dispatch by fn name, toEqual.
  it("numbered styles print [?] when the source has no library number (n = 0); AMA marks sup", () => {
    const e = entries.find(x => x.id === "org-no-year")!.entry;
    expect(citFmt(e, 0, "vancouver").intext).toBe("[?]"); expect(citFmt(e, 0, "ama").sup).toBe(true); expect(citFmt(e, 0, "apa").intext).toContain("n.d.");
  });
});
describe("generated citation tables equal v1's", () => {
  const t = readFixture<{ tables: Record<string, unknown> }>("citation", "tables");
  for (const [name, value] of Object.entries({ CIT_MONTHS, CIT_MON_MLA, CIT_MON_ABB, CIT_MON_IEEE, CIT_STYLES })) it(name, () => expect(JSON.stringify(value)).toBe(JSON.stringify(t.tables[name])));
});
```

`devanagari.test.ts` (grows with every task; written once here):

```ts
const DEV = /["'`]([^"'`\n]*[\u0900-\u097F][^"'`\n]*)["'`]/g;
const fx = readFixture<{ strings: string[] }>("citation", "devanagari");
const root = new URL("../../src/", import.meta.url);
const srcFiles = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(f => f.endsWith(".ts")).map(f => readFileSync(new URL(f, root), "utf8"));
it("every Devanagari literal in v1's ported ranges is in core byte-for-byte", () => { for (const s of fx.strings) expect(srcFiles.some(f => f.includes(s)), s).toBe(true); });
it("core has no Devanagari literal that v1's ported ranges do not have (nothing retyped)", () => {
  for (const f of srcFiles) for (const m of f.matchAll(DEV)) expect(fx.strings.some(s => s === m[1] || s.includes(m[1]!)), m[1]).toBe(true);
});
```

(`readdirSync` with `recursive: true` covers `src/data/**`; `node:fs` imports are allowed under `test/`.)

- [ ] **Step 4: Run to verify they fail, port 7053–7465 verbatim, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- html citation devanagari`
Expected: FAIL, then PASS. Port rules: keep the control-character italics (`IA = "\u0001"`, `IB = "\u0002"`), the exact spaces inside the template concatenations, `citListJoin`'s Oxford flag, and `citInitials`'s all-caps rule as written (one line, no reformulation). `citFmt`'s final `ref.replace(/[ \t]{2,}/g, " ").trim()` stays.

- [ ] **Step 5: Register rows and commit**

`F23a` (`proposed`): MLA journal in-text cites the first page of the article (`(Miller et al. 81)`). `F23b` (`proposed`): Chicago, Harvard and IEEE with no author and no year print `n.d..` or lead with `(n.d.)`. `F23c` (`proposed`): APA has no narrative form (`Smith and Lee (2020)`), only the parenthetical. All three: pinned by the `untitled-no-author-no-year` and `miller-3-authors` goldens; await Dr. Sharma or a librarian (Decision 5).

Export `escHTML`, `escAttr`, `citFmt`, `citKind`, `citLastName`, `citNames`, `citInitials`, `citIsNumbered`, `CIT_STYLES`, the author helpers, and the types.

```bash
git add packages/core/src/html.ts packages/core/src/citation.ts packages/core/src/data/citation-tables.ts packages/core/src/index.ts packages/core/test/golden docs/superpowers/specs/parity-deviations.md
git commit -m "feat(core): citation formatting in eight styles ported verbatim from v1 (citFmt and helpers), 400 golden snapshots, Devanagari byte-equality test"
```

---

### Task 9: Citation cross-check (S11)

**Files:**
- Create: `packages/core/src/crosscheck.ts`, `packages/core/src/data/crosscheck-tables.ts` (generated: `CC_STOP` as an array)
- Create: `packages/core/test/golden/crosscheck/capture.ts`, `crosscheck/documents.json` (hand-written inputs), `crosscheck/cases.json`, `crosscheck/tables.json`
- Test: `packages/core/test/golden/crosscheck.test.ts`
- Modify: `packages/core/src/index.ts`, `engines.ts`, `citation/capture.ts` (Devanagari range list already covers 12100–12257)

**v1 source:** `index.html` 12100–12157: `CC_SN` 12101, `CC_YR` 12102, `CC_STOP` 12103, `ccNorm` 12104, `ccKey` 12105, `ccYrMatch` 12106, `ccSplit` 12107 (Hindi heading `संदर्भ(?:\s*सूची)?` on 12109; the nbsp replace on 12111), `ccParseRef` 12114, `ccCites` 12120, `ccLev` 12134, `ccAnalyse` 12135. Page code, not ported: `ccOpen` 12158–12177 (line 12159: `(editor.innerText||'').replace(/\u00a0/g,' ')`), `ccJump` 12178.

**Interfaces:**
- Consumes: `citLastName`, `citFmt`, `CitationEntry`, `CitationStyle` (Task 8); `docInnerText` (Task 3).
- Produces:
  - `type CcCite = { sn: string; yr: string; raw: string }`; `type CcRef = { sn: string; yr: string; text: string }`; `type CcUniq = CcCite & { n: number }`; `type CcMissing = { c: CcUniq; near: Array<{ kind: "year" | "name"; e: CcRef }> }`
  - `type CcResult = { srcKind: "none" | "doc" | "lib"; heading: string; listN: number; cited: number; missing: CcMissing[]; unused: CcRef[]; unread: number; body: string }`
  - `CC_SN: string`, `CC_YR: string`, `CC_STOP: Set<string>`
  - `ccNorm(s: string): string`, `ccKey(sn: string, yr: string): string`, `ccYrMatch(a: string, b: string): boolean`, `ccSplit(plain: string): { body: string; refs: string[] | null; heading: string }`, `ccParseRef(line: string): CcRef | null`, `ccCites(body: string): CcCite[]`, `ccLev(a: string, b: string): number`
  - `ccAnalyse(plain: string, lib: CitationEntry[], style: CitationStyle): CcResult` (v1's library branch formats each entry with the page's current style; here `style` is a parameter)
  - `crossCheckHtml(html: string, lib: CitationEntry[], style: CitationStyle): CcResult` = `ccAnalyse(docInnerText(html).replace(/\u00a0/g, " "), lib, style)`

- [ ] **Step 1: Write the document corpus**

`crosscheck/documents.json`: `[{ "id", "plain" | "html", "lib": CitationEntry[], "style" }]`, at least 20 documents. Required ids: `doc-refs-english` (body with `(Smith, 2020)`, `Smith and Lee (2019a)`, `(Rao et al., 2018; Smith, 2020)`, a `References` heading, three parsable lines and one unparsable line); `doc-refs-hindi-heading` (the `refs-hindi-heading` HTML of Task 3, as `html`); `doc-refs-last-heading-wins` (two headings; the later one is used); `doc-nbsp-citation` (`html` with `(Smith,&nbsp;2020)`); `lib-branch` (no heading, `lib` of six entries incl. one with no year and one with an organisation author, `style: "apa"`); `lib-branch-numbered` (same lib, `style: "vancouver"`); `none` (no heading, empty lib, two citations); `stop-words` (`(Table 2020)`, `(Figure 1999)`, `(Study 2001)` must not count); `year-suffixes` (`2019a` cited, `2019b` listed → near `year`; `2019` cited, `2019a` listed → match); `near-name` (`Smiht, 2020` cited, `Smith 2020` listed → near `name`); `particles` (`van der Berg (2017)`, `de Souza, 2015`); `narrative-three` (`Smith, Lee, and Rao (2020)`); `nd` (`(WHO, n.d.)` cited, listed with `(n.d.)`); `group-semicolons` (`(A, 2001; B, 2002; C, 2003)`); `curly-apostrophe` (`O’Brien (2010)`); `diacritics` (`Müller (2012)` vs `Muller, H. (2012)` listed).

- [ ] **Step 2: Capture**

`crosscheck/capture.ts`: set `#citStyle` to the case's `style`. For `plain` entries call v1's `ccAnalyse(plain, lib)`. For `html` entries jsdom has no `innerText`, so the harness computes the plain text with the pinned converter, `plain = docInnerText(html).replace(/\u00a0/g, " ")` (import `../../../src/doctext` in the capture; it runs under `tsx`), and calls v1's `ccAnalyse(plain, lib)`: the result is still v1's, on the text the contract of Task 3 says Chrome would have given it. Record `{ id, out }`; for `html` entries also record `plain`. Also record `ccSplit`, `ccCites`, `ccParseRef` on the same inputs and `ccLev` over 10 pairs; `emitTables("crosscheck-tables", { CC_STOP: [...CC_STOP] })`.

Run: `pnpm --filter @appuscholar/core golden:capture crosscheck --emit`

- [ ] **Step 3: Write the failing tests**

```ts
describe("crosscheck.ts is v1's ccAnalyse", () => {
  const docs = /* documents.json */; const fx = readFixture<{ cases: Array<{ id: string; out: CcResult; split: unknown; cites: CcCite[] }> }>("crosscheck", "cases");
  for (const c of fx.cases) it(c.id, () => {
    const d = docs.find(x => x.id === c.id)!;
    const r = d.html !== undefined ? crossCheckHtml(d.html, d.lib, d.style) : ccAnalyse(d.plain!, d.lib, d.style);
    expect(r).toEqual(c.out);
  });
  it("the Hindi heading and the nbsp citation are found through the HTML path", () => {
    const d = docs.find(x => x.id === "doc-refs-hindi-heading")!;
    const r = crossCheckHtml(d.html!, [], "apa");
    expect(r.srcKind).toBe("doc"); expect(r.heading).toBe("संदर्भ सूची"); expect(r.cited).toBe(1); expect(r.missing).toEqual([]);
  });
  it("stop words are not citations", () => expect(ccCites("(Table 2020) and (Figure 1999)")).toEqual([]));
  it("CC_STOP equals v1's", () => expect(JSON.stringify([...CC_STOP])).toBe(JSON.stringify(readFixture<{ tables: { CC_STOP: string[] } }>("crosscheck", "tables").tables.CC_STOP)));
});
```

Add one more assertion for the `html` cases: `expect(docInnerText(d.html).replace(/\u00a0/g, " ")).toBe(c.plain)`, so a later change to the converter is caught here as well as in Task 3's test.

- [ ] **Step 4: Run to verify they fail, port 12100–12157 verbatim, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- crosscheck devanagari`
Expected: FAIL, then PASS (the Devanagari test now also sees `संदर्भ` and `सूची` in `crosscheck.ts`). Keep the regexes built from strings with the `u` and `gu` flags exactly; keep `ccLev`'s early `9` return; keep object-key de-duplication (`seen` object) rather than a `Map`.

- [ ] **Step 5: Export and commit**

```bash
git add packages/core/src/crosscheck.ts packages/core/src/data/crosscheck-tables.ts packages/core/src/index.ts packages/core/test/golden
git commit -m "feat(core): citation cross-check (ccAnalyse and helpers) ported verbatim from v1, golden-equal on a 20-document corpus"
```

---

### Task 10: Library operations (C2)

**Files:**
- Create: `packages/core/src/citlib.ts`
- Create: `packages/core/test/golden/citlib/capture.ts`, `citlib/inputs.json` (hand-written: a library of 14 entries, six document HTMLs, four import files), `citlib/cases.json`
- Test: `packages/core/test/golden/citlib.test.ts`
- Modify: `packages/core/src/index.ts`, `engines.ts`, `docs/superpowers/specs/parity-deviations.md`

**v1 source:** `citKey` 7488, `citNumFor` 7489–7493, `citPlainDocs` 7515–7523, `citRegex` 7524, `citNumsIn` 7530, `citUsageNumbered` 7539, `citUsage` 7549 (reads `#citStyle`), `citInsertBib` 7871–7881 (ordering, heading, item markup), `citExport` 7991–7998 (`JSON.stringify(l, null, 2)`, file name `psychology-class-library.json`), `citImport` 7999–8028 (3 MB file cap, array check, `slice(0, 2000)`, duplicate rule, field normalisation, the two toasts). Page code not ported: `citReadForm`, `citClearForm`, `citInsertAtCursor`, `citPutIntext`, `citInsert`, `citAdd`, `citDel` 7466–7514.

**Interfaces:**
- Consumes: `CitationEntry`, `CitationStyle`, `citLastName`, `citFmt`, `citIsNumbered`, `CIT_STYLES` (Task 8); `escHTML` (Task 8); `docTextContent` (Task 3).
- Produces:
  - `type PlainDoc = { id: string; title: string; text: string; sups: string[] }`; `type Usage = { id: string; title: string; n: number }`
  - `citKey(d: CitationEntry): string`
  - `citNumFor(lib: CitationEntry[], d: CitationEntry): { n: number; saved: boolean }`
  - `docPlainForCitations(id: string, title: string, html: string): PlainDoc` (v1 `citPlainDocs` per document: `text` is textContent with `\s+` collapsed to one space; `sups` are the text of every `sup` and of every `span` whose `style` attribute contains `vertical-align: super` or `vertical-align:super`; v2 bodies are HTML already, so `bodyToHTML` is not applied)
  - `citRegex(entry: CitationEntry): RegExp | null`; `citNumsIn(str: string): Set<number>`
  - `citUsageNumbered(n: number, docs: PlainDoc[]): Usage[]`; `citUsage(entry: CitationEntry, docs: PlainDoc[], idx: number, style: CitationStyle): Usage[]`
  - `bibliography(lib: CitationEntry[], style: CitationStyle): { head: string; numbered: boolean; items: Array<{ entry: CitationEntry; index: number; number: number; fmt: Formatted }> }` (v1's order: numbered styles keep library order; others sort by `citLastName(...).localeCompare(..., "en", { sensitivity: "base" })`; `number` is `index + 1` for numbered styles, 0 otherwise)
  - `bibliographyHtml(lib: CitationEntry[], style: CitationStyle): string` (exactly v1's `'<p><br></p>' + head + body` markup from 7877–7879)
  - `mergeLibrary(existing: CitationEntry[], incoming: unknown): { ok: true; lib: CitationEntry[]; added: number } | { ok: false; reason: "not-a-library" }` (`citImport`'s inner logic: `Array.isArray`, `slice(0, 2000)`, skip when `!d || !d.author || !d.title` or an existing entry has the same `title` and `author` by `===` on `String(...)`, push the normalised 13-field object with v1's defaults `type "Journal article"`, `style "apa"`, `lang "en"`; a thrown error becomes `not-a-library`)
  - `exportLibrary(lib: CitationEntry[]): string`; `LIBRARY_FILE_NAME = "psychology-class-library.json"`; `LIBRARY_IMPORT_MAX_BYTES = 3 * 1024 * 1024` (the panel enforces the file-size cap; it is a constant here so the number is not retyped)
- Storage note for Wave 5: the library is a per-user record encrypted under a DEK like documents (vault spec §Doors: "Citation library … ciphertext from their first version"); these functions receive the decrypted array and the decrypted documents' HTML. `docPlainForCitations` is per document so the panel can cache a `PlainDoc` per revision instead of decrypting everything on every keystroke.

- [ ] **Step 1: Write the inputs and capture**

`citlib/inputs.json`: `lib` (14 entries: two with the same surname and year, one organisation, one with no year, one with `Author` surname fallback, Hindi `type`), `docs` (six HTML bodies: author-year citations in all four v1 shapes `(Smith, 2020)`, `(Smith & Lee, 2020)`, `(Smith et al., 2020)`, `Smith (2020)`; numbered `[1]`, `[2,5-7]`, `[300-1]`; a `<sup>3</sup>` and a `<span style="vertical-align: super">4</span>`; a document with none), `imports` (four files: a valid v1 export of 5 entries two of which duplicate `lib`, a 2,001-entry file, a file whose root is an object, a file with entries missing `title`).

`citlib/capture.ts`: seed `localStorage` `appu_citations` with `lib` and `appu_docs` with the six documents (bodies as HTML, `appu_doc_current` unset so the editor is not read); record `citPlainDocs()`; for every `style`: set `#citStyle`, record `citUsage(entry, docs, idx)` for every entry, `citNumFor(entry)` for every entry plus two unknown entries, and the bibliography by stubbing `window.insertHTMLBlockIntoEditor = (h) => captured.push(h)` then `citInsertBib()`; `citNumsIn` over 12 strings; `citRegex(entry).source` and `.flags` per entry; `citImport` through a fake input `{ files: [new window.File([text], "x.json")], value: "" }` for each import file (await the `FileReader` by polling `citGetLib()` and the toasts), recording `{ libAfter, toast }`.

Run: `pnpm --filter @appuscholar/core golden:capture citlib`

- [ ] **Step 2: Write the failing tests**

```ts
describe("citlib.ts is v1's library code", () => {
  it("docPlainForCitations equals citPlainDocs per document", ...toEqual on { text, sups }...);
  it("citUsage and citUsageNumbered equal v1 for every entry and style", ...);
  it("citNumFor equals v1 for saved and unsaved entries", ...);
  it("bibliographyHtml equals the block citInsertBib inserted, per style", () => { for (const c of fx.bib) expect(bibliographyHtml(inputs.lib, c.style)).toBe(c.html); });
  it("citRegex source and flags equal v1's; null where v1 returns null", ...);
  it("citNumsIn equals v1 (ranges, reversed ranges, wide ranges capped at 200)", ...);
  it("mergeLibrary: v1 export merges with v1's toast count; 2,001 entries keep the first 2,000; duplicates on exact title+author are skipped; an object root is not-a-library; entries without a title are skipped", () => {
    for (const c of fx.imports) {
      const r = mergeLibrary(inputs.lib, JSON.parse(c.text));
      if (r.ok) { expect(r.lib).toEqual(c.libAfter); expect(c.toast).toBe(`${r.added} sources merged into your library ✓`); }
      else expect(c.toast).toBe("Could not read that file — it must be a library JSON exported from Appuscholar");
    }
  });
  it("exportLibrary is v1's pretty JSON and the file name is v1's", () => { expect(exportLibrary(inputs.lib)).toBe(JSON.stringify(inputs.lib, null, 2)); expect(LIBRARY_FILE_NAME).toBe("psychology-class-library.json"); });
});
```

- [ ] **Step 3: Run to verify they fail, port, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- citlib`
Expected: FAIL, then PASS. `citPlainDocs`'s querySelector list becomes a token walk over `sup` and `span[style]` in `citlib.ts` (no DOM in `src`): match the three selectors literally on the `style` attribute text.

- [ ] **Step 4: Register and commit**

`D-W1-2` (`noted`): the 3 MB cap is checked by the panel on the `File`, not in `core` (`LIBRARY_IMPORT_MAX_BYTES` carries the number). `D-W1-3` (`noted`): v1's duplicate rule compares `title` and `author` exactly, case- and whitespace-sensitive; ported as is.

```bash
git add packages/core/src/citlib.ts packages/core/src/index.ts packages/core/test/golden docs/superpowers/specs/parity-deviations.md
git commit -m "feat(core): citation library operations (usage, backlinks, bibliography order, import merge, export) ported verbatim from v1"
```

---

### Task 11: Analyse-a-paper pure helpers (O9 pure)

**Files:**
- Create: `packages/core/src/analyse.ts`, `packages/core/src/data/analyse-tables.ts` (generated: `AP_STAGES`, `AP_STOP` as an array, `AP_NAME`, `AP_SAMPLE`)
- Create: `packages/core/test/golden/analyse/capture.ts`, `analyse/papers.json` (hand-written inputs), `analyse/cases.json`, `analyse/tables.json`
- Test: `packages/core/test/golden/analyse.test.ts`
- Modify: `packages/core/src/index.ts`, `engines.ts`

**v1 source:** `AP_STAGES` 9839–9852, `AP_HEADS` 9853, `AP_STOP` 9854, `apSquash` 9855, `apToks` 9856, `apHeadName` 9857, `apBuild` 9862–9881, `AP_SAMPLE` 9837 (one line, three pages), `apPick` 9987–10002 (reads `AP.doc`), `apJson` 10003, `apCheckQuote` 10009 (reads `AP.doc`), `apNumbers` 10066–10105 (reads `AP.doc`), `apRefDois` 11225–11235 (reads `AP.doc`), `retrNormDoi` 7564, `retrValidDoi` 7565, `AP_NAME` 10435. Not ported: `apLoad` 9882 (storage and render), `apRefCheck` 11236 (fetch, Wave 4), everything from 9892 to 9986 and 10106 onward (page state, lessons, voice).

**Interfaces:**
- Consumes: `pFromT`, `pFromF`, `pFromChi` (Task 6).
- Produces:
  - `type ApChunk = { page: number; sec: string; text: string; sq: string; ref: boolean }`
  - `type ApDoc = { title: string; src: string; pages: string[]; paged: boolean; chunks: ApChunk[]; sections: Array<{ name: string; page: number }>; chars: number; fullSq: string; id: string; sample: boolean; refsCut: boolean }`
  - `type ApStage = { k: string; name: string; ask: string; brief: string; terms: string }`; `AP_STAGES: readonly ApStage[]`; `AP_HEADS: RegExp`; `AP_STOP: Set<string>`; `AP_NAME: Record<string, string>`; `AP_SAMPLE: readonly string[]`
  - `apSquash(s: string): string`; `apToks(s: string): string[]`; `apHeadName(line: string): string | null`
  - `apBuild(title: string, pages: string[], src: string): ApDoc`
  - `apPick(doc: ApDoc, question: string, terms: string, budget: number): { text: string; partial: boolean; n: number; of: number }`
  - `apJson(s: string): unknown` (`null` when no object)
  - `apCheckQuote(doc: ApDoc, q: string): { q: string; ok: boolean; why?: string; page?: number; sec?: string; label?: string }`
  - `apNumbers(doc: ApDoc): Array<{ label: string; lo: number; hi: number; rep: { op: string; v: number; h: number }; ok: boolean }>`
  - `apRefDois(doc: ApDoc): string[]`; `retrNormDoi(d: string): string`; `retrValidDoi(d: string): boolean`
- Consumed by: Task 12 (`apJson`, `apSquash`), Task 14 (`apPick`, `AP_STAGES`, `AP_NAME`, `ApDoc`).

- [ ] **Step 1: Write the paper corpus and capture**

`analyse/papers.json`: `[{ "id", "title", "pages": string[], "src" }]`: `sample` (the three pages of `AP_SAMPLE`, read from v1 at capture time, not pasted), `pasted-headings` (one page, plain headings `Abstract`, `Method`, `Results`, `References`), `numbered-headings` (`1. Introduction`, `2.1 Participants`, `III. Results`), `pdf-three-pages` (three short pages, `src: "pdf"`), `no-headings` (one long paragraph of 2,000 characters), `refs-with-dois` (a `References` section with `https://doi.org/10.1037/h0043158.`, `doi:10.1000/XYZ)`, a malformed `10.1/abc`, a duplicate), `hindi-paper` (Devanagari text with an English `References` heading).

`analyse/capture.ts`: for each paper `apLoad(title, pages, src, false)` then `eval("AP.doc")` → `doc`; `apPick(q, terms, budget)` for `(q, terms, budget)` ∈ {`("what was the sample size", "", 9000)`, `("Statistics " + brief, terms, 10000)` for each of the 12 stages on `sample`, `("gap", "", 500)` on `no-headings`}; `apCheckQuote` on eight quotes (exact, exact across a chunk boundary, 14-character, absent, with changed punctuation); `apNumbers()`; `apRefDois()`; `apHeadName` over 20 lines; `apToks`/`apSquash` over 6 strings; `apJson` over `{"a":1}`, ` ```json {"a":1} ``` `, `no json`, `{bad`, `text {"x":[1,2]} tail`; `emitTables("analyse-tables", { AP_STAGES, AP_STOP: [...AP_STOP], AP_NAME, AP_SAMPLE })`; record `AP_HEADS.source` and `.flags`.

Run: `pnpm --filter @appuscholar/core golden:capture analyse --emit`

- [ ] **Step 2: Write the failing tests**

```ts
describe("analyse.ts is v1's Analyse-a-paper engine", () => {
  for (const p of fx.papers) it(`apBuild ${p.id}`, () => expect(apBuild(p.title, p.pages, p.src)).toEqual(p.doc));
  for (const c of fx.picks) it(`apPick ${c.id} ${c.q.slice(0, 20)}`, () => expect(apPick(docOf(c.id), c.q, c.terms, c.budget)).toEqual(c.out));
  for (const c of fx.quotes) it(`apCheckQuote ${c.q.slice(0, 20)}`, () => expect(apCheckQuote(docOf(c.id), c.q)).toEqual(c.out));
  for (const p of fx.papers) it(`apNumbers ${p.id}`, () => expect(apNumbers(docOf(p.id))).toEqual(p.numbers));
  for (const p of fx.papers) it(`apRefDois ${p.id}`, () => expect(apRefDois(docOf(p.id))).toEqual(p.dois));
  it("the sample paper's two statistics are judged ok (t(58) = 2.36, p = .022; r(58) = .31, p = .016)", () => expect(apNumbers(apBuild(AP_SAMPLE[0]!.split("\n")[0]!, [...AP_SAMPLE], "pdf")).map(x => x.ok)).toEqual([true, true]));
  it("AP_HEADS source and flags equal v1's", () => { expect(AP_HEADS.source).toBe(fx.heads.source); expect(AP_HEADS.flags).toBe(fx.heads.flags); });
  // tables: JSON equality for AP_STAGES, AP_STOP, AP_NAME, AP_SAMPLE as in Task 8.
});
```

- [ ] **Step 3: Run to verify they fail, port, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- analyse`
Expected: FAIL, then PASS. `apBuild`'s `id` (`'a' + apSquash(title).slice(0, 24) + chars`) and the `paged` rule stay; `apPick`'s sort comparator `b.s - a.s || a.i - b.i` stays; `apNumbers`'s `χ²`-to-`chi2` replace and the `out.some(o => o.label === label)` de-duplication stay.

- [ ] **Step 4: Export and commit**

```bash
git add packages/core/src/analyse.ts packages/core/src/data/analyse-tables.ts packages/core/src/index.ts packages/core/test/golden
git commit -m "feat(core): Analyse-a-paper pure helpers (chunker, chunk picker, quotation guard, numbers check, reference DOIs) ported verbatim from v1"
```

---

### Task 12: Research pure helpers and the CSV writer (O8 pure, S2 `pdCsv`)

**Files:**
- Create: `packages/core/src/csv.ts`, `packages/core/src/research.ts`, `packages/core/src/data/research-tables.ts` (generated: `RS_DESIGNS`, `RS_DESIGN`)
- Create: `packages/core/test/golden/research/capture.ts`, `research/inputs.json` (hand-written: 10 paper results, 6 AI replies, 8 author strings, 6 inverted-index abstracts), `research/cases.json`, `research/tables.json`
- Test: `packages/core/test/golden/research.test.ts`
- Modify: `packages/core/src/index.ts`, `engines.ts`

**v1 source:** `pdCsvCell` 9461, `pdCsv` 9462. Research: `rsReconstructAbstract` 8041, `rsOaStatus` 8055, `RS_DESIGNS` 8127, `rsQuickCheck` 8131–8160, `rsCsvText` 8191 (reads `rsResults`), `rsRankParse` 8209, `RS_DESIGN` 8237, `rsCleanTerm` 8245, `rsBuildQuery` 8273–8283, the de-duplication inside `researchSearch` 8311–8313, `rsFilterPass` 8336–8346, `rsAuthorsToCit` 8455, `rsEntryFromResult` 8465 (reads `#citStyle`), `rsCorpusText` 8525. Not ported here: `rsFetchOpenAlex` 8061, `rsPubmedAbstracts` 8088, `rsFetchPubmed` 8103, `rsRank` 8220, `rsSuggestTerms` 8251 (network and page; the prompt parts move in Task 13), everything that renders (8161–8190, 8201, 8264–8272, 8331–8454, 8471–8524).

**Interfaces:**
- Consumes: `apJson`, `apSquash` (Task 11); `CitationEntry` (Task 8).
- Produces (`csv.ts`): `pdCsvCell(v: unknown): string`, `pdCsv(headers: string[], rows: unknown[][]): string`.
- Produces (`research.ts`):
  - `type RsQuick = { summary?: string; summaryDropped?: true; design?: { type: string; quote?: string; ok: boolean }; sample?: { n: number; quote?: string; ok: boolean } }`
  - `type RsPaper = { title: string; authors: string; year: string | number; venue: string; doi: string; url?: string; source: string; abstract?: string; retracted?: boolean; oaStatus?: string; oaUrl?: string; citationCount?: number; rel?: { score: number; reason: string; titleOnly?: boolean }; quick?: RsQuick }`
  - `type RsFilter = { year: number; oa: boolean; ret: boolean; des: string; n: number }`
  - `RS_DESIGNS: readonly string[]`; `RS_DESIGN: Record<string, { oa?: string; pm?: string; oaFilter?: string }>`
  - `rsReconstructAbstract(inv: Record<string, number[]> | null | undefined): string`
  - `rsOaStatus(oa: { is_oa?: boolean; oa_status?: string } | null | undefined): "" | "gold" | "green" | "hybrid" | "bronze"`
  - `rsQuickCheck(raw: string, ab: string): RsQuick | null`
  - `rsRankParse(out: string, n: number): Record<number, { score: number; reason: string }>`
  - `rsCleanTerm(t: string, q: string): string`
  - `rsBuildQuery(q: string, kind: "oa" | "pm", terms: string[], design: string): string`
  - `rsDedupe(merged: RsPaper[]): RsPaper[]` (the title-key filter of 8311–8313)
  - `rsFilterPass(p: RsPaper, f: RsFilter): { ok: boolean; needsQuick?: true }`
  - `rsCsvText(results: RsPaper[]): string`
  - `rsAuthorsToCit(str: string): string`
  - `rsEntryFromResult(p: RsPaper, style: string): CitationEntry`
  - `rsCorpusText(papers: RsPaper[]): string`
- Consumed by: Task 13 (`rsCorpusText`, `RS_DESIGNS`).

- [ ] **Step 1: Write the inputs and capture**

`research/inputs.json`: `papers` (10 results across OpenAlex and PubMed shapes: with and without abstract, retracted, `oaStatus` gold, `quick` present with `design.ok` true and false, `rel` with `titleOnly`, `authors: "Unknown authors"`, initials-only authors `"Smith JA"`, `et al.`), `replies` (six AI texts for `rsQuickCheck`: valid JSON with a summary number that is in the abstract, one with a number that is not, a design quote not in the abstract, a sample `n` whose quote lacks the digits, ```` ```json ```` fences, garbage), `rankReplies` (three: valid, ids out of range and duplicates, a non-array `scores`), `authorStrings` (eight), `invertedIndexes` (six, including empty and positions out of order), `queries` (q × kind × terms × design: 12 combinations incl. every `RS_DESIGN` key), `filters` (six `RsFilter`s), `csvRows` (the 10 papers).

`research/capture.ts`: direct calls for every pure function; `rsCsvText` by `eval("rsResults=" + JSON.stringify(papers))` then `rsCsvText()`; `rsEntryFromResult` with `#citStyle` set to `"apa"` and `"ieee"`; the de-duplication by stubbing `window.rsFetchOpenAlex = async () => papersA`, `window.rsFetchPubmed = async () => papersB`, setting `#rsTopic`, ticking `#rsSrcOA` and `#rsSrcPubmed`, calling `await researchSearch()` and reading `eval("rsResultsOriginal")`; `emitTables("research-tables", { RS_DESIGNS, RS_DESIGN })`.

Run: `pnpm --filter @appuscholar/core golden:capture research --emit`

- [ ] **Step 2: Write the failing tests**

One `it` per fixture case per function (`toEqual`), plus:

```ts
it("rsQuickCheck drops a summary whose number is not in the abstract and keeps one whose number is", ...);
it("rsRankParse ignores ids it did not send, scores outside 0–3, and a second entry for the same id", ...);
it("rsDedupe keeps the first paper per 60-character title key, as researchSearch does", () => expect(rsDedupe(fx.dedupe.in)).toEqual(fx.dedupe.out));
it("rsCsvText equals v1 for the 10 results (quoting of commas, quotes and newlines by pdCsvCell)", ...);
it("RS_DESIGNS and RS_DESIGN equal v1's", ...JSON equality...);
```

- [ ] **Step 3: Run to verify they fail, port, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- research`
Expected: FAIL, then PASS. `rsQuickCheck`'s `new RegExp('(^|\\D)' + n + '(\\D|$)')` and the `inAb` closure stay; `rsBuildQuery`'s parentheses and `"[tiab]"` suffixes stay.

- [ ] **Step 4: Export and commit**

```bash
git add packages/core/src/csv.ts packages/core/src/research.ts packages/core/src/data/research-tables.ts packages/core/src/index.ts packages/core/test/golden
git commit -m "feat(core): Research pure helpers (abstract rebuild, quick-read and rank parsers, query builder, filters, CSV, result-to-citation) ported verbatim from v1"
```

---

### Task 13: Prompts for Idea, the Research helpers, and Research (O7 part 1, F25)

**Files:**
- Create: `packages/core/src/prompts-idea.ts`, `packages/core/src/prompts-helpers.ts`, `packages/core/src/prompts-research.ts`
- Create: `packages/core/test/golden/prompts-idea/capture.ts` + `cases.json`, `prompts-helpers/capture.ts` + `cases.json`, `prompts-research/capture.ts` + `cases.json`
- Test: `packages/core/test/golden/prompts-wave1.test.ts`
- Modify: `packages/core/src/prompts.ts` (export `Built`, add `fieldLabel`), `packages/core/src/index.ts`, `engines.ts`, `docs/superpowers/specs/parity-deviations.md`

**v1 source:** `fieldName` 2500. Idea: `ideaAssess` 8568–8582 (prompt 8576, `{temp: 0.3, max: 1200}`). Helpers: `PSYCH_PROMPTS` 8590–8596 (`paper` 0.25, `case` 0.3, `litrev` 0.4, `explain` 0.5, `stats` 0.1; each `p` is a getter that reads `fieldName()`), `psychTool` 8598–8614 (prompt `cfg.p + '\n\nText:\n' + txt.slice(0, 12000)`, `max: 2500`), `devilTool` 8618–8630 (`{temp: 0.5, max: 1800}`, text `slice(0, 6000)`), `vivaAsk` 3607–3624 (`who` by audience `conf` / examiner, `{temp: 0.6, max: 700}`, text `slice(0, 6000)`). Research: `rsQuickPrompt` 8128 (`{temp: 0.1, max: 700, noLang: true}` at 8177), `rsRankPrompt` 8206 (`{temp: 0.1, max: 1500, noLang: true}` at 8227), the suggest-terms prompt inside `rsSuggestTerms` 8256 (`{temp: 0.3, max: 500, noLang: true}`, topic `slice(0, 300)`), `researchLitReview` 8531–8541 (`{temp: 0.35, max: 1200}`), `researchGapFinder` 8542–8553 (`{temp: 0.35, max: 1200}`).

**Interfaces:**
- Consumes: `PLAIN_OUT`, `Built` (`prompts.ts`); `rsCorpusText`, `RsPaper`, `RS_DESIGNS` (Task 12).
- Produces (`prompts.ts` additions): `export type Built = { prompt: string; temp: number; max: number; noLang?: true }`; `fieldLabel(raw: string | null | undefined): string` (`String(raw ?? "").trim().slice(0, 60) || "psychology"`, v1 `fieldName`). `buildChatPrompt` is unchanged; its callers are asked to pass `fieldLabel(...)` (D-W0-8).
- Produces (`prompts-idea.ts`): `buildIdeaPrompt(field: string, idea: { topic: string; resources?: string; timeframe?: string; constraints?: string }): Built` (empty fields become `(not described)`, `(not given)`, `(none given)` as 8573; slices 2000/1000/1000).
- Produces (`prompts-helpers.ts`): `type HelperKind = "paper" | "case" | "litrev" | "explain" | "stats"`; `HELPER_TEMPS: Record<HelperKind, number>`; `buildHelperPrompt(kind: HelperKind, field: string, text: string): Built` (`max: 2500`, text `slice(0, 12000)`); `buildDevilPrompt(text: string): Built`; `buildVivaPrompt(audience: "conf" | "viva", text: string): Built`; `HELPER_MIN_CHARS = 40`, `VIVA_MIN_WORDS = 25`, `DEVIL_MIN_WORDS = 25` (the guards the panel applies; constants so the numbers are not retyped).
- Produces (`prompts-research.ts`): `buildQuickReadPrompt(field: string, abstract: string): Built`; `buildRankPrompt(field: string, question: string, items: Array<Pick<RsPaper, "title" | "abstract">>): Built`; `buildSuggestTermsPrompt(field: string, topic: string): Built`; `buildLitReviewPrompt(field: string, papers: RsPaper[]): Built`; `buildGapFinderPrompt(field: string, papers: RsPaper[]): Built`; `QUICK_READ_MIN_CHARS = 150`.

- [ ] **Step 1: Capture**

Each capture: `stubCallAI()`, `localStorage.setItem("appu_field", field)` for `field` ∈ {unset (→ `psychology`), `"education"`, a 70-character string}, then drive v1:
- Idea: `setValue("ideaTopic", …)`, `ideaResources`, `ideaTimeframe`, `ideaConstraints` (one case with all four, one with topic only, one with a 2,500-character topic), `await ideaAssess()`.
- Helpers: `setEditorHtml(<p>text</p>)`, `selectEditor()`, `window.confirm = () => true`, `await psychTool(kind)` for the five kinds with a 300-character text and with a 13,000-character text; `await devilTool()` and `await vivaAsk()` with `#vivaAud` set to `conf` and to `viva`, on a 30-word and a 7,000-character text.
- Research: `rsQuickPrompt(ab)` and `rsRankPrompt(q, items)` by direct call (abstract of 4,000 characters; items with and without abstract; a 500-character question); `setValue("rsTopic", topic)` then `await rsSuggestTerms()`; `window.rsCheckedPapers = () => papers` then `await researchLitReview()` and `await researchGapFinder()` with 2 and with 5 papers from `research/inputs.json`.
Record `{ entry, field, inputs, prompt, opts }`.

Run: `pnpm --filter @appuscholar/core golden:capture prompts-idea prompts-helpers prompts-research`

- [ ] **Step 2: Write the failing tests**

```ts
describe("Wave 1 prompts equal v1's, character for character", () => {
  for (const c of idea.cases) it(`idea ${c.field} ${c.inputs.topic.slice(0, 12)}`, () => expect(buildIdeaPrompt(fieldLabel(c.field), c.inputs)).toEqual({ prompt: c.prompt, ...c.opts }));
  for (const c of helpers.cases) it(`${c.entry} ${c.field}`, () => {
    const b = c.entry === "devilTool" ? buildDevilPrompt(c.inputs.text) : c.entry === "vivaAsk" ? buildVivaPrompt(c.inputs.aud, c.inputs.text) : buildHelperPrompt(c.inputs.kind, fieldLabel(c.field), c.inputs.text);
    expect(b).toEqual({ prompt: c.prompt, ...c.opts });
  });
  for (const c of research.cases) it(`${c.entry} ${c.field}`, () => { /* dispatch to the five builders; noLang: true where v1 passed it */ });
  it("fieldLabel is v1's fieldName: trimmed, 60 characters, default psychology", () => { expect(fieldLabel("  education ")).toBe("education"); expect(fieldLabel("x".repeat(70))).toBe("x".repeat(60)); expect(fieldLabel("")).toBe("psychology"); expect(fieldLabel(undefined)).toBe("psychology"); });
  it("classifyAiUse labels every Wave 1 prompt as v1 does", () => { for (const c of [...idea.cases, ...helpers.cases, ...research.cases]) expect(classifyAiUse(c.prompt)).toEqual(c.aiu); });
});
```

(`c.aiu` is `aiuClassify(prompt)` recorded at capture time: the AI-use log must label the ported prompts exactly as v1 labels its own.)

- [ ] **Step 3: Run to verify they fail, port, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- prompts-wave1`
Expected: FAIL, then PASS. The prompt strings are copied from the v1 lines above by selection, not retyped (`\u00B2`, `\u03B7`, `\u03B2` escapes in `stats` stay as escapes).

- [ ] **Step 4: Register, export, commit**

Update `F25` with the pinned test name. Add `D-W1-4` (`noted`): `psychTool`'s "Long document" toast and the 40-character guard, the viva and devil 25-word guards and the quick-read 150-character guard are panel behaviour; their numbers are exported constants.

```bash
git add packages/core/src/prompts.ts packages/core/src/prompts-idea.ts packages/core/src/prompts-helpers.ts packages/core/src/prompts-research.ts packages/core/src/index.ts packages/core/test/golden docs/superpowers/specs/parity-deviations.md
git commit -m "feat(core): v1 prompts for Idea & Feasibility, the five research helpers, viva, devil's advocate, quick read, ranking, related terms, literature review and gap finder"
```

---

### Task 14: Prompts for Analyse a paper (O7 part 2)

**Files:**
- Create: `packages/core/src/prompts-analyse.ts`
- Create: `packages/core/test/golden/prompts-analyse/capture.ts` + `cases.json`
- Test: `packages/core/test/golden/prompts-analyse.test.ts`
- Modify: `packages/core/src/index.ts`, `engines.ts`

**v1 source:** `AP_RULES` 10031, `apCall` 10027 (`{max: 2000, temp: 0.2, noLang: true}`), `apAsk` 10032–10047 (prompt 10039; `apPick(q, "", 9000)`; question `slice(0, 600)`), `apWalkShow` 10048–10065 (prompt 10055; `apPick(st.name + " " + st.brief, st.terms, 10000)`; attempt `slice(0, 700)`), `apLesAsk` 11162–11182 (prompt 11171; `{temp: 0.4, max: 350, noLang: true}`; paper `slice(0, 6500)`; teacher name from `AP_NAME[apLesTeacher(s.k)]`, subject `research ethics` for `procedure` else `research methods`; Hindi clause when `apLectLang() === "hi"`). `AP_LESSON` 10142 supplies `steps[i].{k,title,said,flaw}` for the lesson prompt (the lesson content itself is O6, Wave 3; only the three fields the prompt reads are inputs here).

**Interfaces:**
- Consumes: `apPick`, `ApDoc`, `AP_STAGES`, `ApStage`, `AP_NAME` (Task 11); `Built` (Task 13).
- Produces:
  - `AP_RULES: string`
  - `buildAskPrompt(field: string, doc: ApDoc, question: string): Built & { pick: { partial: boolean; n: number; of: number } }`
  - `buildWalkPrompt(field: string, doc: ApDoc, stage: ApStage, attempt: string): Built & { pick: { partial: boolean; n: number; of: number } }`
  - `buildLessonAskPrompt(opts: { teacher: keyof typeof AP_NAME; field: string; lang: "en" | "hi"; step: { k: string; title: string; said: string; flaw: string }; doc: ApDoc; question: string }): Built`
  - `LESSON_QUESTION_MAX_CHARS = 400`

- [ ] **Step 1: Capture**

`stubCallAI()`; `apSample()` (loads the built-in paper as `AP.doc`); `localStorage.setItem("appu_field", "education")`; `eval('AP.qDraft="What was the sample size?"')` then `await apAsk()`; for each of the 12 stages: `eval("AP.stage=" + i)`, `eval('AP.tryDraft[AP_STAGES[' + i + '].k]=' + JSON.stringify(attempt))` with an empty attempt and a 900-character attempt, `await apWalkShow()`; for the lesson: `eval("AP.les.i=0")`, `setValue("apLesQ", q)`, `await apLesAsk()` for steps 0 and the `procedure` step, in `en` and with `localStorage.setItem("appu_lectlang", "hi")`; also a pasted paper (`apLoad("Pasted", [text], "paste", false)`) for one ask and one walk. Record `{ entry, field, lang, stage, attempt, question, doc: eval("AP.doc"), step: {k,title,said,flaw}, teacher: eval("apLesTeacher(AP_LESSON.steps[AP.les.i].k)"), pick: { partial, n, of } (from the `apPick` call v1 made, re-run with the same arguments), prompt, opts }`.

Run: `pnpm --filter @appuscholar/core golden:capture prompts-analyse`

- [ ] **Step 2: Write the failing tests**

```ts
for (const c of fx.asks) it(`apAsk ${c.question.slice(0, 20)}`, () => expect(buildAskPrompt(c.field, c.doc, c.question)).toMatchObject({ prompt: c.prompt, temp: 0.2, max: 2000, noLang: true }));
for (const c of fx.walks) it(`apWalkShow ${c.stage.k} ${c.attempt ? "with attempt" : "no attempt"}`, () => expect(buildWalkPrompt(c.field, c.doc, c.stage, c.attempt)).toMatchObject({ prompt: c.prompt, temp: 0.2, max: 2000, noLang: true }));
for (const c of fx.lessons) it(`apLesAsk ${c.step.k} ${c.lang}`, () => expect(buildLessonAskPrompt({ teacher: c.teacher, field: c.field, lang: c.lang, step: c.step, doc: c.doc, question: c.question })).toEqual({ prompt: c.prompt, temp: 0.4, max: 350, noLang: true }));
it("the Hindi lesson prompt carries v1's Devanagari-script clause verbatim", () => expect(fx.lessons.find(c => c.lang === "hi")!.prompt).toContain("(write in Hindi in Devanagari script, keeping technical terms such as p-value, t-test, sample and consent in English letters)"));
it("the walk prompt is built over apPick(stage.name + ' ' + stage.brief, stage.terms, 10000)", () => {
  const c = fx.walks[0]!;
  const b = buildWalkPrompt(c.field, c.doc, c.stage, c.attempt);
  const pk = apPick(c.doc, c.stage.name + " " + c.stage.brief, c.stage.terms, 10000);
  expect(b.pick).toEqual({ partial: pk.partial, n: pk.n, of: pk.of });
  expect(b.pick).toEqual(c.pick);
  expect(b.prompt).toContain("PAPER START\n" + pk.text + "\nPAPER END");
});
```

- [ ] **Step 3: Run to verify they fail, port, run to verify they pass**

Run: `pnpm --filter @appuscholar/core test:golden -- prompts-analyse`
Expected: FAIL, then PASS.

- [ ] **Step 4: Export and commit**

```bash
git add packages/core/src/prompts-analyse.ts packages/core/src/index.ts packages/core/test/golden
git commit -m "feat(core): v1 prompts for Analyse a paper (ask, walk-through stage, lesson question) built over the ported chunk picker"
```

---

### Task 15: Wave 0–1 gate, whole-branch checks and the PR

**Files:**
- Modify: `.superpowers/sdd/2026-10-17-parity-port-wave0-1/progress.md` (ledger), `docs/superpowers/specs/parity-deviations.md` (final count)

- [ ] **Step 1: Run everything**

Run: `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm --filter @appuscholar/core golden:capture all --check && pnpm --filter @appuscholar/web doctext:capture --check`
Expected: all green; every `--check` prints `same`.

- [ ] **Step 2: Count the gate**

Run: `pnpm --filter @appuscholar/core test:golden 2>&1 | tail -5` and `node -e 'const f=require("./packages/core/test/golden/citation/cases.json");console.log(f.cases.length)'`
Expected: golden suite passed with no skips except `live.test.ts`; citation cases ≥ 400 (the gate says 200). Record in the ledger: engines with fixtures (list), total golden tests, the deviation register's row count by status, the CI run id.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin parity-wave-0-1
gh pr create --base phase-3a-vault --title "Parity port, Waves 0 and 1: golden harness, Chrome text contract, Phase 3 engines" --body "$(cat <<'EOF'
Waves 0 and 1 of docs/superpowers/specs/2026-10-17-parity-port-design.md, from docs/superpowers/plans/2026-10-17-parity-port-wave0-1.md.

Wave 0: jsdom harness over v1 build 2026.10.13a, 13 demo datasets and 20 pure functions captured; docInnerText pinned to Chromium; deviation register; goldens for the nine already-ported modules.
Wave 1: p-value core (scipy-checked), Numbers check, citation formatting in eight styles (400 snapshots), library operations, cross-check, Analyse and Research pure helpers, the Idea, helper, Research and Analyse prompts.

Every expected value comes from v1 running. Register rows added: see docs/superpowers/specs/parity-deviations.md. No panel, no network fetcher, no change under appuscholer/.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then the whole-branch review per superpowers:subagent-driven-development (spec compliance and v1 fidelity, with the golden diffs as evidence), its fix wave if any, and the ledger's closing line.

---

## Self-review (done while writing; recorded for the reviewer)

1. **Spec coverage.** §5.1 verbatim: every port task's step says what must stay (operation order, flags, object keys). §5.2 golden master: Tasks 1, 4–14 capture from v1 running; inputs a person writes (corpora) are inputs only. §5.3 browser truths: Task 3 (innerText and `en-IN`). §5.4 content by script: `emitTables` in Tasks 8, 9, 11, 12; Devanagari test in Task 8, growing. §5.5 split: every engine returns objects; `bibliographyHtml` and `refHTML` are v1 data outputs. §5.6 register: Task 2 and rows in Tasks 3, 4, 5, 7, 8, 10, 13. §5.7 browser: no DOM in `src` (Task 3's converter exists for this). §5.8 already ported: Tasks 4, 5. §5.9 reference runs: Task 6's scipy file. §5.10 tracks: ledger per task, reviewer per task, student track stated as the gate. §6 Wave 0 gate: Task 1 (13 demos, 20 functions, CI step); Wave 1 gate: Task 15 (all rows green, ≥ 400 citation snapshots). §8 decisions 1, 3, 5, 7 applied as defaults; 2, 4, 6 do not touch these rows. Audit rows: G0 (T1), G1 (T3), S1 core (T6), S10 (T7), S11 (T9), C1 (T8), C2 (T10), O9 pure (T11), O8 pure (T12), O7 part (T13, T14). Flags: F5 (T2, T6, T7), F6 (T6 tolerance), F23 (T2, T8), F25 (T2, T13), F26 (T2, T3), F28 (T3 `en-IN` fixture; consumer in Wave 3). Not covered on purpose: C3, O8 fetchers, O9 extraction (Wave 4); panels (Wave 5); reference heading for Closeness (Wave 3, but its corpus case `refs-last-heading-wins` is already captured in Task 3).
2. **Step scan.** Each capture step names the v1 entry point and the arguments; each test step gives names and assertions; each port step gives the line range and what must not change. Lines that decided nothing were removed.
3. **Type consistency.** `Built` is defined once (Task 13 exports it from `prompts.ts`; Task 14 consumes it). `CitationEntry`, `CitationStyle`, `Formatted` come from Task 8 and are used unchanged in Tasks 9, 10, 12. `ApDoc`, `ApStage` from Task 11 are used in Task 14. `readFixture<T>` returns `Fixture<T>` (header plus `T`) everywhere. `docInnerText`/`docTextContent` names are the same in Tasks 3, 7, 9, 10.
4. **Review Focus.** Five items, each pinned: 1 → Task 10 `mergeLibrary` test; 2 → Task 3 corpus `refs-hindi-heading` and Task 9 Hindi test; 3 → Task 7 F5 and split-paragraph tests; 4 → Task 8 `org-no-year` test; 5 → Task 3 corpus ids and the converter rule.
5. **Proportion.** The plan is about one and a half times the spec plus the audit rows it implements; its code blocks are tests and signatures, not bodies. The only bodies written out are one-line v1 helpers whose exact text is the decision (`noLead`, `escHTML`, `fieldLabel`).

## Open points for OJ (not blocking execution of Tasks 1–12)

- D-W0-1 (`claude-haiku-5-5`): initial it or overturn it; the test in Task 4 pins whichever stands.
- F23a–c: who does the editorial pass against the manuals, and when; until then the eight styles ship as v1 prints them.
- Decision 6 (copilot grant) is not touched by this plan; `crossCheckHtml`, `numbersCheckHtml` and `citUsage` are the first functions an MCP tool would wrap, and they take plaintext, so the grant design decides where they run.
