# Stage 3 Screens: Design & Ethics and Collection & Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student can use Design & Ethics (six paperwork tools and the AI-use statement), the Statistics Lab (26 tests, personal-data scan, which-test guide, practice gate, power, numbers check, results linking, scale library), both chart tools and Qualitative Coding on the live site exactly as in v1, on the engines Wave 2 proved, with every stored item in the vault.

**Architecture:** Panels and dialogs read fields and render results; every number, sentence, table, chart picture and template comes from `packages/core` (Wave 2 engines, plus four small ports in Task 4 captured from v1 running). Stage data lives in the per-project encrypted blob store built in stage 2 (`useProjectBlob`, server `BLOB_KINDS`). Participant rows stay in the browser's memory, as v1 (Ruling R1). Inserted results carry a hidden `stat-tag` span and coded passages a `qual-tag` span, both kept by the editor schema and the sanitizer.

**Tech Stack:** TypeScript, Next.js 16 / React 19, TipTap 3, Hono, WebCrypto vault, `chart.js` (new, pinned, lazy-loaded) for v1's result and quick charts, vitest, Playwright, the golden harness in `packages/core/test/harness`.

**Spec:** `../appuscholar-blueprint/PROGRAMME.md` line 3; `../appuscholar-blueprint/BLUEPRINT.md` §2 (the fourteen rules, notably 1, 2, 3, 9, 10, 14), §4 stages 3–4, §5; the v1 chapter `../appuscholar-blueprint/v1-tools/03-design-ethics-and-data.md` (every tool's steps, copy, storage and line refs; read the section a task names); the parity-port spec `docs/superpowers/specs/2026-10-17-parity-port-design.md` §5; the Wave 2 plan `docs/superpowers/plans/2026-10-19-parity-port-wave2.md` (engine contracts); the register `docs/superpowers/specs/parity-deviations.md`; the stage 2 plan `docs/superpowers/plans/2026-10-19-stage2-idea-literature-screens.md` (blob store, copy extractor, AI pane conventions); the design system `../appuscholar-blueprint/design/DESIGN-SYSTEM.md` §7–8.

**Start condition:** PR #8 (Wave 2 engines) and the stage 2 screens PR are merged into `phase-3a-vault`. Cut the execution branch from `phase-3a-vault` and merge branch `stage3-design-collection` (this plan, one file) into it before Task 1.

## Global Constraints

- v1 fidelity: every control, step, threshold, message and order comes from the chapter and the v1 lines a task cites; nothing is redesigned. Every knowing difference gets a register row; numbers never deviate without OJ, copy never without Dr. Sharma.
- Copy: every student-facing string through `t()`. Strings core already exports (`DESIGN_TOASTS`, `REG_WARN`, `TG_*`, `GEN_TEXT`, `PD_LABEL`, `POWER_FOOTER_NOTE`, `PW_INFO`, `SL_PENDING`, chart keys via `VzTr`) are rendered from core, translated by key where v1 had a key. Dialog interiors that v1 shipped in English only get V2 keys from the extractor (Task 1) with Hindi = English and a register row per dialog, as stage 2 did.
- Engines: panels compute nothing. Result HTML comes from core (`blocksHtml`, `VzChart.svg`, `vennSvg`, `simulatorHtml`) and is passed through `sanitizeHtml` before it reaches the DOM, because it carries the student's column names and group labels.
- Storage: participant rows are never stored (R1); stored, encrypted: the design records, dataset records (`name → {hash, ts, n}`), run records (≤ 300, test, label, dataset, hash, field names, extras, sentence, time), lab preferences, qualitative codes. Coded passages and stat tags live inside the documents' HTML, which the vault already encrypts.
- AI: one call only, "Explain in plain language" (temp 0.3), through `useCallAI` with the personal-data scan; the prompt carries the result tables' text and the APA sentence, never rows. The AI-use log is read from `GET /ai/log`; "Keep the log" is the existing `settings.aiLogOff`.
- Charts: v1's result charts and quick bar/line charts are drawn with Chart.js from specs core returns (Task 4); bars start at zero (BLUEPRINT §2 rule 14, Ruling R2). Chart Studio and Venn pictures are core's SVG. Pictures inserted into the document are PNG at 2× (Ruling R3).
- Downloads use `downloadBlob` with v1's file names; nothing is sent anywhere by a download.
- Tests: TDD per task; vitest for web, api and core; core goldens captured from v1 running for any new engine code; Playwright journeys on the pglite recipe (api and web on one `DATABASE_URL`).
- Conventional commits; never commit `.env*`; never print secrets.

## Rulings made in this plan (each also a register row; OJ can overturn)

- **R1, rows stay in memory.** v1 never stores participant rows ("No participant rows persisted", chapter, cross-cutting). The lab keeps the paste box in memory; "Re-run on current data" uses whatever data is loaded under the same name, as v1. The Statistics Lab's v1 sentence "your data is never sent anywhere unless you tap Explain…" stays true. Storing encrypted datasets waits for the copilot door (Phase 6), where it is needed and where that sentence would change with Dr. Sharma. Cost if wrong: one blob kind and a copy change later.
- **R2, result-chart bars from zero.** Register F27 left the result-chart approach to this wave. v1's `statsChart*` bars start above zero, which breaks BLUEPRINT §2 rule 14 and is listed by the chapter as a fix for the rebuild. Result bar charts here start at zero; F27 becomes "ruled". Cost if wrong: one Chart.js option.
- **R3, inserted pictures are PNG.** Chart Studio already inserts PNG at 2×; the Venn diagram, inserted by v1 as resizable SVG, is inserted as PNG at 2× too, because the editor's image node takes raster data and an SVG data URL is a sanitizer risk. Register row "proposed" for Dr. Sharma. Cost if wrong: one insert path.
- **R4, code colours not in the document.** v1 writes the code colour into each tagged span's style; v2 stores only `class="qual-tag"` and `data-qcode`, and the editor paints colours from the code list. A recolour or rename never rewrites documents, and the sanitizer allows no inline style. Exports show the text without highlight colour. Cost if wrong: an export colour option.
- **R5, scope is the project.** v1 searched "every document you have"; v2 documents belong to projects, so passages, tag stripping and stat-tag scans cover every document of the active project (scratch included when working there). The copy stays verbatim; a register row proposes "every document in this project" for Dr. Sharma. Cost if wrong: a wider loop.

## Review Focus

1. A dataset whose group label is `<img src=x onerror=alert(1)>`: the result table shows the label as text, no script runs, and the inserted sentence carries it as text. Test in Task 8.
2. Every value the same (no spread): v1's undefined-result message shows, nothing can be inserted, no chart is drawn, no run record is saved. Test in Task 8.
3. The vault locks between parsing and inserting (a reload in another tab): the sentence is inserted into the editor, the run record save is held and sent after one unlock prompt, never dropped. Test in Task 8.
4. Deleting a code whose passages sit in three documents of the project, one of them not open: every span is stripped, the text is unchanged, exactly one new revision per affected document, none for the others, and a locked vault prompts once. Test in Task 14.
5. A paste of 10,000 rows by 20 columns: parse, personal-data scan and a `desc` run each finish in under 3 s in the test, and ragged rows are dropped silently as v1. Test in Task 7.

---

## File structure

- `apps/web/scripts/extract-v1-panels.mjs` (extend, Task 1); `apps/web/messages/*.json`, `v1-panels.manifest.json`.
- `apps/api/src/routes/blobWrite.ts`, `apps/web/lib/blobs/kinds.ts` (Task 2).
- `packages/core/src/sanitize.ts`, `apps/web/lib/editor/marks/{statTag,qualTag}.ts`, `apps/web/lib/editorExtensions.ts` (Task 3).
- `packages/core/src/{prompts-stats,statschart,quickchart-spec}.ts` + goldens (Task 4); `packages/core/src/index.ts`.
- `apps/web/components/tools/design/` (Tasks 5–6): `DesignPanel.tsx`, `RegDialog.tsx`, `ProtoDialog.tsx`, `CtriDialog.tsx`, `PiDialog.tsx`, `BudgetDialog.tsx`, `EcDialog.tsx`, `AiuDialog.tsx`, `apps/web/lib/design/useDesign.ts`.
- `apps/web/components/tools/stats/` (Tasks 7–13): `StatsPanel.tsx`, `StatsLab.tsx`, `DataIntake.tsx`, `PdBox.tsx`, `TestForm.tsx`, `PracticeGate.tsx`, `Results.tsx`, `ResultChart.tsx`, `Guide.tsx`, `PowerDialog.tsx`, `ChartStudio.tsx`, `QuickChart.tsx`, `NumbersDialog.tsx`, `RtDialog.tsx`, `ScaleDialog.tsx`, `ScoreDialog.tsx`; `apps/web/lib/stats/{useLab.ts,chartjs.ts,png.ts}`.
- `apps/web/components/tools/qual/` (Task 14): `QualPanel.tsx`, `CodeTree.tsx`, `PassagesDialog.tsx`, `apps/web/lib/qual/{useCodes.ts,tagging.ts,strip.ts}`.
- `apps/web/lib/tools.ts`, `apps/web/components/workspace/Dock.tsx` (Task 15).
- `apps/web/e2e/stage3-design-collection.spec.ts`, `docs/walkthroughs/stage-3.md` (Task 16).

---

### Task 1: Extract the stage-3 dialog copy

**Files:**
- Modify: `apps/web/scripts/extract-v1-panels.mjs` (stage 2's extractor: add ranges), `apps/web/messages/en.json`, `hi.json`, `v1-panels.manifest.json`, `docs/superpowers/specs/parity-deviations.md`
- Test: `apps/web/test/i18n.test.ts`

**Interfaces:**
- Ranges and key prefixes: panels 756–792 (`ds3_`, `st3_`, `ql3_` for literals without a v1 key); `statsDlg` 1529–1612 (`st3_`), `ncDlg` 1624–1632 (`nc3_`), `rtDlg` 1642–1649 (`rt3_`), `vzDlg` 1651–1699 (`vz3_`), `powerDlg` 1701–1752 (`pw3_`), `chartDlg` 1754–1799 (`ch3_`), `qualPassagesDlg` 1804–1812 (`ql3_`), `regDlg` 1813–1843, `protoDlg` 1845–1860, `ecDlg` 1862–1887, `aiuDlg` 1888–1910, `ctriDlg` 1912–1921, `piDlg` 1923–1934, `budgetDlg` 1936–1948 (`ds3_`), `scaleDlg` 1255–1262 and `slScoreDlg` 1263–1271 (`sl3_`). JS literals the panels show that core does not export (for example "Data parsed ✓", "Paste some data first — one header row, then your rows", the Explain prefix "💡 In plain language: ") are extracted from their cited lines (9348–9410, 12006–12036, 12260–12350, 6180–6330, 11390–11512, 3636–3924, 4854–4947, 13458–13530) into the same prefixes.
- A literal equal to an existing v1 `en.json` value reuses that key and is not duplicated. Hindi for new keys is the English text; one register row per dialog (D-S3-1…).

- [ ] **Step 1: Write the failing test**

```ts
it("stage-3 dialog copy comes from v1 with a manifest", () => {
  expect(en.st3_paste_desc).toMatch(/^🔒 Paste data from Excel, SPSS, Google Sheets or a CSV file/);
  expect(en.ds3_reg_desc).toBe("Answer four questions and get a starting list of which approvals usually apply in India. This is a checklist to walk in with, not a ruling — your institution's Ethics Committee has the final word.");
  expect(en.st3_parsed_ok).toBe("Data parsed ✓");
  expect(hi.ds3_reg_desc).toBe(en.ds3_reg_desc);
  const m = JSON.parse(readFileSync("messages/v1-panels.manifest.json", "utf8"));
  expect(m.ds3_reg_desc.sha256).toMatch(/^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Run** `pnpm --filter @appuscholar/web test` → FAIL (keys undefined).
- [ ] **Step 3: Implement** the ranges in the extractor (same tokenizer, same manifest); run the extract script twice, no diff; register rows.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): stage-3 dialog copy extracted from v1 with its manifest`

---

### Task 2: Blob kinds for stage 3

**Files:**
- Modify: `apps/api/src/routes/blobWrite.ts` (`BLOB_KINDS`), `apps/web/lib/blobs/kinds.ts` (kinds and schemas)
- Test: `apps/api/test/blobs.routes.test.ts`, `apps/web/test/useProjectBlob.test.tsx`

**Interfaces:**
- New kinds and shapes (loose objects, as stage 2):
  - `design_reg`: `RegState & { done: boolean; savedAt?: string }`
  - `design_proto`: `ProtoFields & { done: boolean }`
  - `design_ec`: `EcState` (checklist, record and consent fields, `done`)
  - `design_ctri`: `{ checklist: Record<string, boolean>; done: boolean }`
  - `design_pi`: `{ checklist: Record<string, boolean>; cv: string; done: boolean }`
  - `design_budget`: `{ rows: BudgetRow[]; done: boolean }`
  - `stat_sets`: `Record<string, RtSet>` (v1 `appu_statsets`)
  - `stat_runs`: `Record<string, RtSavedRun>` (v1 `appu_statruns`, capped at 300 by the writer, oldest dropped)
  - `collect_prefs`: `{ statsName?: string; genFirst?: boolean; qualShowColors?: boolean; figNo?: number }`
  - `qual_codes`: `QualCode[]`
- No kind holds participant rows (R1); a test asserts `BLOB_KINDS` has no `dataset` kind.

- [ ] **Step 1: Tests**: each new kind round-trips through the api (memory store) and through `useProjectBlob` encrypted; an unknown kind still 400s; the `stat_runs` writer keeps the newest 300.
- [ ] **Step 2–4:** RED, implement, GREEN (`pnpm --filter @appuscholar/api test && pnpm --filter @appuscholar/web test`).
- [ ] **Step 5: Commit** `feat(api,web): blob kinds for the design records, dataset and run records, lab preferences and qualitative codes`

---

### Task 3: Editor marks and sanitizer for stat tags and qualitative tags

**Files:**
- Modify: `packages/core/src/sanitize.ts` (allow-list), `apps/web/lib/editorExtensions.ts`; Create: `apps/web/lib/editor/marks/statTag.ts`, `qualTag.ts`; Modify: `apps/web/lib/export/{word,latex}.ts` (tags dropped, text kept)
- Test: `packages/core/test/sanitize.test.ts`, `apps/web/test/editorSchema.test.ts`, `apps/web/test/word.test.ts`, `latex.test.ts`

**Interfaces:**
- `statTag` mark → `<span class="stat-tag" data-run="ID">…</span>` (v1 12010; hidden marker, the sentence text visible).
- `qualTag` mark → `<span class="qual-tag" data-qcode="ID">…</span>` (R4); the editor applies `background: <colour>55; outline: 1px solid <colour>` through a decoration driven by the code list and the show-colours preference (v1 6180–6330).
- `sanitizeHtml` keeps exactly those two classes with `data-run` matching `^[A-Za-z0-9_-]{1,64}$` and `data-qcode` matching the same, strips any `style` on them, and keeps everything it kept before (tests pin the old allow-list too). The api uses `sanitizeHtml` on plaintext saves, so the api is redeployed with this task's code (deploy notes).

- [ ] **Step 1: Tests**: round trip through `sanitizeHtml` and the TipTap schema keeps both spans and their ids; a `data-run="x\" onclick=…"` attribute is dropped; Word and LaTeX exports contain the text without the spans.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(core,web): the editor and the sanitizer keep stat tags and qualitative tags`

---

### Task 4: Four small ports with goldens

**Files:**
- Create: `packages/core/src/prompts-stats.ts`, `packages/core/src/statschart.ts`, `packages/core/src/quickchart-spec.ts`; goldens under `packages/core/test/golden/{statsexplain,statschart,quickchart}/`; Modify: `packages/core/src/index.ts` (also export `blocksHtml` from `stats-core`), `docs/superpowers/specs/parity-deviations.md` (F27 → ruled per R2)
- Test: `packages/core/test/golden/*.test.ts`

**Interfaces:**
- `statsExplainText(blocks: StatsBlock[]): string` — v1's tag-stripped text of the result tables (12027–12036).
- `buildStatsExplainPrompt(field: string, tablesText: string, apa: string): Built` — v1's system text verbatim (chapter "statsExplain"), temp 0.3, the language rule as v1's `callAI` applies it.
- `statsChartSpec(key: StatsTestKey, data: ParsedData, form: StatsForm, res: StatsOk): ChartSpec | null` — the Chart.js `config` v1's `statsChart*` (11884–11984) passes to `new Chart(ctx, config)` for the ten chart kinds the chapter lists, as a plain object (`type`, `data`, `options`); `null` where v1 draws nothing. R2: `options.scales.y.beginAtZero = true` on bar types, the only difference from the captured config (the golden asserts equality after that one field).
- `quickChartSpec(rows: ChartRow[], type: "bar" | "line", title: string): ChartSpec` — v1 4854–4947.
- `type ChartSpec = { type: string; data: { labels: string[]; datasets: Array<Record<string, unknown>> }; options: Record<string, unknown> }` — exported; plain data only (no functions), so goldens compare with `JSON.stringify`; a v1 callback option is replaced by its string effect and the replacement gets a register row.
- Goldens: the harness stubs `window.Chart` with a recorder and captures each config for the 13 demos and the quick-chart corpus; the Explain prompt is captured by stubbing `callAI` (Wave 1 method).

- [ ] **Step 1: Tests** from the captures (exact on the capture platform, the harness's tolerance rule elsewhere).
- [ ] **Step 2–4:** RED, port verbatim, GREEN (`pnpm --filter @appuscholar/core test`).
- [ ] **Step 5: Commit** `feat(core): stats explain prompt, result-chart and quick-chart specs ported from v1 with goldens`

---

### Task 5: Design & Ethics panel, dashboard and four tools

**Files:**
- Create: `apps/web/components/tools/design/{DesignPanel,RegDialog,ProtoDialog,CtriDialog,PiDialog,BudgetDialog}.tsx`, `apps/web/lib/design/useDesign.ts`
- Test: `apps/web/test/designPanel.test.tsx`

**Interfaces:**
- Panel (v1 756–766): description `design_panel_desc`, dashboard from `designDashboard(done)` ("N of 6 ready", six rows ✅/⬜, a click opens the tool), seven buttons with `design_btn_*`.
- `useDesign(key)`: the `design_<key>` blob; `done` flags per the chapter's "Done" rules via core (`regDone`, `protoDone`, `checklistDone`, `piDone`, `budgetDone`).
- Regulatory wizard (5898–5940): four inputs, "Check pathway" → `regPathway(state)` list + `REG_WARN`; saved.
- Every insert in this task and Task 6 is v1's `insertIntoEditor(text, false)` (4195): at the end of the document, plain text, newlines as `<br>`, a leading line break when the document is not empty — `insertPlainHtml(editor, escHTML(text).replace(/\n/g, "<br>"), { atEnd: true })`. The protocol's markdown stays literal text, as v1.
- Protocol builder (5942–5977): eight boxes, Save, "Generate protocol document" → `protocolMarkdown(fields)` inserted as above and the dialog closes; null → toast `protoEmpty`; success toast from `DESIGN_TOASTS`.
- CTRI readiness (6072–6096): `CTRI_FIELDS` checklist, "⬇ Export readiness report" → `ctriMarkdown(checks)` as `ctri-readiness-YYYY-MM-DD.md`.
- PI eligibility (6098–6128): `PI_ITEMS`, CV textarea, "⬇ Export CV text" → `piCvText(cv)` as `pi-cv-YYYY-MM-DD.txt` (error string → toast).
- Budget (6130–6178): `budgetRows(saved)`, editable labels and amounts, add/remove, "Total: ₹…" from `budgetTotalText`, export `budgetMarkdown` as `trial-budget-YYYY-MM-DD.md`.

- [ ] **Step 1: Tests**: dashboard counts follow the done rules; each tool persists and reloads; each export's file name and content equal core's output; the protocol insert lands at the end.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Design & Ethics panel with the dashboard, pathway wizard, protocol, CTRI, PI and budget tools`

---

### Task 6: Ethics Committee package and the AI-use statement

**Files:**
- Create: `apps/web/components/tools/design/{EcDialog,AiuDialog}.tsx`
- Test: `apps/web/test/ecDialog.test.tsx`, `apps/web/test/aiuDialog.test.tsx`

**Interfaces:**
- EC package (5979–6070): `EC_DOCS` checklist; record fields (status, committee, reference, date, consent mode, minors); minors yes/unsure shows `ecMinorsNote(m)` in amber; "Insert an ethics statement into my document" → `"Ethical considerations\n" + ethicsStatement(state)` inserted as in Task 5, toast "Ethics statement inserted. Check every sentence is true."; consent fields → "Generate consent form" → `consentMarkdown(...)` inserted as in Task 5 (an error string → toast); done flags via `ecDoneAfterToggle` / `ecDoneAfterSave`. Rule 9: no path produces "exempt" (test greps every output for "exempt").
- AI-use statement (5411–5568): reads `GET /ai/log?from&to` (entries `{d,p,m,k,g}`), "Keep the log" bound to `settings.aiLogOff` (inverted), dates, kind ticks, other tools, the five truth ticks, style; "Build the statement" → `aiuBuild(input)`; `{ refuse }` shows the refusal; `{ text }` fills an editable box with Copy / Insert / Download (`ai-use-statement.txt` as v1). `style.on` is false until My Writing Style ships (register row). Rule 3: with log entries in range and nothing unticked, a "no AI" claim is refused (test).

- [ ] **Step 1: Tests** as above, with a fake log.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Ethics Committee package, consent form and the AI-use statement from the log`

---

### Task 7: Statistics Lab shell, data intake and the personal-data scan

**Files:**
- Create: `apps/web/components/tools/stats/{StatsPanel,StatsLab,DataIntake,PdBox}.tsx`, `apps/web/lib/stats/useLab.ts`
- Test: `apps/web/test/statsIntake.test.tsx`

**Interfaces:**
- Panel (769–779): the Statistics Lab description and "Open Statistics Lab", "🎯 Sample size and power", the Charts description with "📊 Quick chart" and "📈 Research figures", "🔢 Check the numbers in my document", "🔗 Check results against my data", "📋 Scale library".
- `useLab()` (context for the lab and the dialogs that read its data): `{ text, setText, name, setName, data: ParsedData | null, parse(): void, sets, runs }`; data in memory only (R1).
- Intake (9348–9410): dataset name (≤ 60, remembered in `collect_prefs.statsName`), paste box, "📂 Upload .csv" (.csv/.tsv/.txt via `FileReader`; file name seeds the name), "Parse data" → `statsParseText(text)`; empty → toast "Paste some data first — one header row, then your rows"; column chips (`numeric`/`categorical` with n); toast "Data parsed ✓"; `rtSetRecord(data, name, sets, Date.now())` saved to `stat_sets`.
- Personal-data box (9411–9522): `pdScan(data)` → nothing-found line, or the amber "Possible personal details found" with per-column Remove / Replace with a code / Keep (defaults `PD_DEFAULT`), long-text warning; "Apply" → `pdTransform(data, choices)` rewrites the paste box with `csv`, re-parses, shows the result sentence, and downloads `appuscholar_key_keep_separate.csv` (`keyCsv`, BOM UTF-8) when anything was coded.
- Review Focus 5: 10,000 × 20 parse + scan + a `desc` run under 3 s each in the test; ragged rows dropped.

- [ ] **Step 1: Tests** for each step and message; the key file only when a column is coded; nothing written to any blob except `stat_sets` and `collect_prefs`.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Statistics Lab data intake with the personal-data scan, rows kept in memory`

---

### Task 8: Running a test: form, practice gate, results, insert, explain, chart

**Files:**
- Create: `apps/web/components/tools/stats/{TestForm,PracticeGate,Results,ResultChart}.tsx`, `apps/web/lib/stats/chartjs.ts` (lazy `import("chart.js/auto")`, pinned version); Modify: `apps/web/lib/ai/actions.ts` (`explainStats`)
- Test: `apps/web/test/statsRun.test.tsx`

**Interfaces:**
- Test chooser from `STATS_TEST_OPTIONS` in v1's order (1529–1590); fields from `STAT_TESTS[key].fields` (type filters columns: numeric / categorical / binary via `stkIsBinaryCol`; `multi` → tick list; `extra` inputs with placeholders); builds `StatsForm { values, ticked }`.
- Practice gate (12558–12608): the "Practice mode" checkbox (`collect_prefs.genFirst`); when on, "Run test" shows "Before it runs: what is your design?" with `GEN_DESIGNS`; "Check my choice" → `genVerdict(design, key, label)`; "Switch to {first}" and "Run {test}" as v1; toast "Pick the design first".
- Run → `runStats(data, key, form)`:
  - `ok:false, reason:"toast"` → toast; `reason:"undefined"` → v1's undefined-result message, nothing insertable (Review Focus 2).
  - `ok:true` → `sanitizeHtml(blocksHtml(blocks))` in the results area, the skipped-count note when `skipped > 0`, the APA sentence box with "Insert into document", "Copy", "💡 Explain in plain language", the dialog footer note, and `ResultChart` from `statsChartSpec(...)` when not null.
- Insert (12010–12025): no sentence → toast "Run a test first"; the dialog closes; when the data was registered under a name, `rtRunRecord(data, key, form, name, rtHash(data))` + sentence + time is saved to `stat_runs` under id `"r" + Date.now().toString(36) + 4 random base-36 characters` (oldest dropped past 300); the sentence goes at the end of the document as plain text inside a `statTag` with that id (untagged when no record was saved, as demo runs), toast "Inserted ✓ — Ctrl+Z to undo" (Review Focus 3: a locked vault holds the record save until one unlock prompt).
- Explain (12027–12036): `buildStatsExplainPrompt(field, statsExplainText(blocks), apa)` through `useCallAI` (temp 0.3); the reply appended as "💡 In plain language: …"; the prompt contains no cell of the data (test with a sentinel string in an unused column).
- Review Focus 1: a group label `<img src=x onerror=alert(1)>` renders as text in the table, no `onerror` attribute in the DOM.

- [ ] **Step 1: Tests**: one test per branch above, the 26 keys mounted from `STAT_TESTS` (a smoke test that each renders its fields), the chart spec drawn for `pearson` and absent for `alpha`.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Statistics Lab runs the 26 tests with v1's results, practice gate, tagged insert, explain and result charts`

---

### Task 9: Which-test guide, demo and "Check my numbers"

**Files:**
- Create: `apps/web/components/tools/stats/Guide.tsx`
- Test: `apps/web/test/statsGuide.test.tsx`

**Interfaces:**
- "🧭 Which test fits my data?" (12385–12573): questions from `TG_Q` driven by `tgNext(answers)` until `{ res }`; result card "Best fit" with `tgWhyItems`, `tgExtra` ("What it assumes", "When it stops fitting"), "Other options", unbuilt results show v1's hand-over text (routing and `built` flags exactly as v1, register F20 and Wave 2's guide rows); "Use this test" selects it in the lab.
- Demo (`TG_DEMO`): "Predict first." choice, then the demo data runs through `runStats` without touching `stat_sets` or the AI-use log, the prediction compared, "The numbers are invented for practice.", "Back to my own data" restores the paste box.
- "Check my numbers": `tgCheck(ctx, sel)` / `tgCheckNumbers` / `tgCheckCounts` + `tgCountsText`; `TG_CHECK_FALLBACK` when columns are missing.

- [ ] **Step 1: Tests**: three routes through the questions (compare/scale/two independent → Welch t; counts/2×2 → χ²; relate/ordinal → Spearman); the demo leaves `stat_sets` unchanged; the check outputs equal core's.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): which-test guide with the predict-first demo and the data check`

---

### Task 10: Sample size and power

**Files:**
- Create: `apps/web/components/tools/stats/PowerDialog.tsx`
- Test: `apps/web/test/powerDialog.test.tsx`

**Interfaces:**
- `powerDlg` (13458–13530, 1701–1752): planned test, "I want to find" mode, effect (default from `PW_INFO`), alpha, tails, k/p/df/dropout as relevant (labels and hints from `PW_INFO`); "Calculate" → `powerCompute(input)` → blocks (sanitized) + sentence with "Copy sentence"; `{ ok:false, error }` → message; `POWER_FOOTER_NOTE` under every result.
- "Learn: watch power happen" (9007–9043): `simulatorParse` / `simulatorCompute(d, n, k, seed)` / `simulatorHtml(r)` with v1's fixed seed and the SIMULATED banner.

- [ ] **Step 1: Tests**: the three modes for independent t against core's outputs; the simulator output equals `simulatorHtml` for v1's seed.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): sample size, power and the power simulator`

---

### Task 11: Chart Studio and the Quick chart / Venn maker

**Files:**
- Create: `apps/web/components/tools/stats/{ChartStudio,QuickChart}.tsx`, `apps/web/lib/stats/png.ts` (`svgToPng(svg, scale = 2): Promise<string>` via an off-screen canvas; `chartToPng(spec): Promise<string>`)
- Test: `apps/web/test/chartStudio.test.tsx`, `apps/web/test/quickChart.test.tsx`

**Interfaces:**
- Chart Studio (3636–3924, 1651–1699): own paste box or "Use the Statistics Lab data"; chart type, score column, groups; options (`VzOptions`); preview from `vzChart(options, vzGroups(data, y, g), tr)` (`svg` sanitized, `table` via `blocksHtml`, `warn` in amber); empty → "No numbers to draw yet…"; "Insert into my document": "**Figure N**", italic title, PNG at 2×, "*Note.* …" (`vzCaption`), N from `collect_prefs.figNo` then incremented; "⬇ PNG" / "⬇ SVG" download as `figure-<N>.png` / `figure-<N>.svg` (v1 3903).
- Quick chart (4854–4947, 1754–1799): bar/line from `chartParseLines` + `quickChartSpec` drawn with Chart.js (bars from zero), Venn 2 and 3 from `vennSvg(input)`; "Insert into document" as PNG at 2× (R3); v1's three toasts.

- [ ] **Step 1: Tests**: each chart type renders core's SVG; insert produces the four APA parts in order and bumps the figure number; quick chart refusals.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Chart Studio figures with APA captions and the quick chart and Venn maker`

---

### Task 12: Numbers check and results-to-data linking

**Files:**
- Create: `apps/web/components/tools/stats/{NumbersDialog,RtDialog}.tsx`, `apps/web/lib/stats/rerun.ts`
- Test: `apps/web/test/numbersDialog.test.tsx`, `apps/web/test/rtDialog.test.tsx`

**Interfaces:**
- Numbers check (12183–12257, 12351–12384): `numbersCheckHtml(editorHtml)` → summary line (`numbersSummary`), cards ✓/⚠/✗ with raw text, "You wrote / Recomputed", the note key's copy, "Go to this text" selecting the range in the editor; none-found sentence; "A consistent result does not show that the right test was used."
- Results linking (12260–12350, 9372–9388): tags = every `statTag` id in the open document (R5: the dialog covers the open document as v1); `rtScanTags(tags, runs, sets)` → Current / Out of date / Cannot check with the why-key copy; "Re-run on current data" (confirm "Re-running replaces your edited text with the new sentence. Continue?") restores the run's fields into the lab, runs on the data loaded under that name, replaces the tagged sentence, updates the run record, and shows "The conclusion at .05 has changed…" when `rtFlip(old, new)`.

- [ ] **Step 1: Tests**: an edited dataset under the same name marks a tag Out of date; re-run replaces only that sentence and flags a flip; numbers dialog statuses match core on a fixture document.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): numbers check for the document and results linked to their data`

---

### Task 13: Scale library and scoring

**Files:**
- Create: `apps/web/components/tools/stats/{ScaleDialog,ScoreDialog}.tsx`
- Test: `apps/web/test/scales.test.tsx`

**Interfaces:**
- Library (11390–11512, 1255–1262): `SCALES` list (RSES, SWLS), the view (stem, options, numbered items with reverse marks, scoring note, licence record), "Copy the questionnaire text" → `slText(scale, true)`, "Download the item list (CSV)" → `slCodebookCsv` as `{ID}_items.csv`, the `SL_PENDING` paragraph. Rule 10: no AI path touches item text (test: no `useCallAI` import in these files).
- Scoring (1263–1271): needs parsed data in the lab; columns guessed by `slGuessColumns`; coding choice; "Score" → `slScoreData(scale, data, idx, coding)` → `ok` writes `csv` back into the paste box and re-parses (the personal-data scan runs again), reports `message`; `ok:false` → message.

- [ ] **Step 1: Tests**: RSES scoring on a fixture equals core's totals and α; the paste box gains `RSES_total`; the scan re-runs.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): scale library with fixed wording, codebooks and scoring in the lab`

---

### Task 14: Qualitative coding

**Files:**
- Create: `apps/web/components/tools/qual/{QualPanel,CodeTree,PassagesDialog}.tsx`, `apps/web/lib/qual/{useCodes,tagging,strip}.ts`; Modify: `apps/web/components/workspace/dialogs/` (a small text-input dialog for the code name, replacing v1's `prompt()` with the same question)
- Test: `apps/web/test/qual.test.tsx`

**Interfaces:**
- Panel (782–792, 6180–6330): description, "Show code colors in the document" (`collect_prefs.qualShowColors`), "+ New top-level code", the tree with "+" for sub-codes, ✎ rename, 🗑 delete, 👁 passages; empty text as v1.
- Tagging: with a selection inside one paragraph, a tap on a code name or swatch applies `qualTag` with the code id; a selection across blocks → "Select a passage within a single paragraph (not across headings or list items)".
- Colours: `qualNextColor(count)` on create; the editor paints from the list (R4).
- Passages (`qualPassagesDlg`): every `qual-tag` span with the code id across the project's documents (R5), each decrypted in the browser, `qualPassageText`, listed with the document title.
- Delete: confirm with v1's sentence (count of sub-codes from `qualDescendantIds`); `qualDeleteCascade`; `strip.ts` fetches each project document, decrypts, removes the spans of the deleted ids, re-encrypts and saves only documents that changed (Review Focus 4).
- Export: `qualBuildMarkdown(codes, passagesOf)` as `appuscholar-coded-passages-YYYY-MM-DD.md`.

- [ ] **Step 1: Tests** per interface, including Review Focus 4 with three documents and a locked vault.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): qualitative coding with a code tree, passages across the project and export`

---

### Task 15: Registry, mounts and Hindi fallback review

**Files:**
- Modify: `apps/web/lib/tools.ts` (`BUILT_IN` gains `design`, `stats`, `qual`), `apps/web/components/workspace/Dock.tsx`, `apps/web/components/tools/StubPanel.tsx` (left for `style`, `words`, `close`, `slides`), `apps/web/test/i18n-coverage.test.ts`
- Test: `apps/web/test/tools.test.ts`, coverage test

- [ ] **Step 1–5:** tests that the three tools mount their panels and the remaining four still stub; no new English literal outside `t()`; commit `feat(web): stage-3 tools mounted; stubs remain for stages 5 and 6`

---

### Task 16: Journey e2e, walk-through script, deploy notes

**Files:**
- Create: `apps/web/e2e/stage3-design-collection.spec.ts`, `docs/walkthroughs/stage-3.md`

**Interfaces:**
- The e2e follows the chapter's "Student journey through Design and Collection" (12 steps) with the AI stubbed at the gateway: wizard, protocol insert, PI, power sentence, EC package with consent form and ethics statement, CTRI and budget exports, data paste with a name column coded and the key file downloaded, scale scoring, guide with demo and practice mode, a run with insert and explain and the figure inserted, qualitative tagging across two documents and export, a changed dataset flagged by results linking and a re-run, numbers check, and the AI-use statement. After the journey a blindness assertion through the api: no blob or revision holds a participant value from the dataset.
- `docs/walkthroughs/stage-3.md`: the same steps as human rows (Do / Expect / Result and date), the "Not yet in this stage" section (My Writing Style sentence in the AI-use statement, lectures → stage 5), the version-pill line, sign-off.

- [ ] **Step 1–5:** e2e green on the pglite recipe; commit `test(web): stage-3 journey e2e and walk-through script`

---

## Not in this line

- Storing datasets in the vault (R1) and the copilot grant on them: Phase 6.
- My Writing Style's sentence in the AI-use statement: stage 5.
- Lectures and the power simulator's character voice beyond v1's canned line: stage 5.

## Deploy and sign-off

1. No migration (blob kinds are validated in code).
2. Deploy the api (Task 3 changed `sanitizeHtml`, which the api uses), check `/health`; deploy the web; read the version pill.
3. OJ walks `docs/walkthroughs/stage-3.md` on the live URL on a throwaway account, with his key for the Explain step; sign-off; merge.
4. Dr. Sharma's rows Design and ethics, Measures, Data and statistics, Charts and Qualitative move to "Built" in VISION-VS-BUILD.md §2 only after the sign-off.
