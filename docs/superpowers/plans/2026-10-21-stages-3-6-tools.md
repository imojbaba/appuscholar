# Stages 3 to 6: Dr. Sharma's Seven Tools in the Frame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tool Dr. Sharma had in v1 works in v2, inside the B1 frame, doing what it did in v1. The seven tools still missing are Design and Ethics, Statistics and Charts, Qualitative Coding, My Writing Style, Words and grammar, Closeness check and Make PPT, plus the viva question.

**Why now (OJ, 2026-10-21):** wave B had put these screens after B2 to B4. The reason was to build them once, in the final frame. B1 shipped that frame today (825b2a3), so the reason no longer holds. Wave B's B2 to B4 follow this plan.

**Architecture:** one groundwork session (G) builds everything the seven tools share, then releases it:
- three new places and two new Writing tabs, each tab driven by a registry;
- every new blob kind, with the API allow-list;
- per-tool message files;
- document access hooks;
- the sanitizer attributes;
- the one new dependency.

Then five sessions (A to E) build the tools in parallel. Each touches only its own files. Engines are ported or written in `packages/core` and held to v1's output; screens follow the frame's patterns.

**Tech Stack:** Next.js (apps/web), Hono (apps/api), TypeScript engines (packages/core, vitest goldens), Postgres on Neon (no migration: `project_blobs.kind` is free text), Playwright e2e, pnpm and turbo. One new dependency: `pptxgenjs`, which v1 used at 3.12.0.

**Spec (read before any task):**
- The v1 behaviour, tool by tool, with v1 line numbers and exact copy and prompts: `docs/v1-tools/01-workspace-and-writing.md` (style, words, viva), `03-design-ethics-and-data.md` (design, stats, scales, charts, qual) and `04-citations-review-guide-and-rules.md` (closeness, PPT, AI-use statement). Task G1 copies these from appuscholar-blueprint.
- v1 itself: `../appuscholer/index.html` at c8c53735 (sha256 e3ad7404…).
- The frame: `docs/design/2026-10-20-journey-redesign-draft.md` §5 and §7.
- The port rules: `docs/superpowers/specs/2026-10-17-parity-port-design.md` §5.
- The register: `docs/superpowers/specs/parity-deviations.md`. The next free id is D-S2-45.
- Prior work to reuse: the stage 3 and 4 screen plan of 2026-10-19 (`git show origin/stage3-design-collection:docs/superpowers/plans/2026-10-19-stage3-design-collection-screens.md`). Its task breakdown, rulings R1-R5 (approved by OJ 2026-10-19) and Review Focus carry over. Its "nothing is redesigned" and its `Dock.tsx` mounts are superseded by the frame.

## Order of work and the session split

| Order | Session | Branch | What ships | Deploy | Ends with |
|---|---|---|---|---|---|
| 1 | **G Groundwork** (alone, first) | `tools-3-6` | Design and ethics, Collection and analysis and Review places with their tabs; Writing gains My style and Words tabs; each tab reads "Not built yet" until its session turns it on. Blob kinds, API allow-list, message files, document hooks, sanitizer, `pptxgenjs`. | API, then web (no migration) | `docs/walkthroughs/tools-g.md`, live |
| 2, in parallel | **A Design and ethics** | `tools-a-design` | Overview (N of 6 ready), Pathway, Protocol, Ethics and consent, Registration, Investigator, Budget, AI-use statement | web | `tools-a.md` |
| 2, in parallel | **B Statistics and charts** | `tools-b-stats` | Statistics Lab (data in, 26 tests, which-test guide, practice mode, explain), Power, Charts (Chart Studio, quick chart, Venn), Check numbers (numbers check, results linking), Scales | web | `tools-b.md` |
| 2, in parallel | **C Qualitative coding** | `tools-c-qual` | Code tree, tagging, code colours, passages, Markdown export | web | `tools-c.md` |
| 2, in parallel | **D Writing tools** | `tools-d-writing` | My Writing Style (samples, profile, three checks, style in Continue, Improve and Extend), Words and grammar (dictionary, word bank, rule and AI grammar) | web (and CSP host) | `tools-d.md` |
| 2, in parallel | **E Review** | `tools-e-review` | Closeness check, Viva practice (and the toolbar's Viva button), Make PPT | web | `tools-e.md` |
| 3 | Releases | — | **R2:** A, C, E (smaller, merged as they turn green). **R3:** B, D. | web | the group sheets, live |
| 4 | Wave B continues | `wave-b2` | B2, B3, B4 as planned | | |

**Why this split:**
- G owns every file two sessions would otherwise both edit, so A to E never touch the same file.
- No session waits on another after G.
- Sizes from v1: stats about 3,500 lines; design 630; style 330; words 270; qual 180; closeness 165; PPT 95; viva 30. B is the long pole, so its tasks are split finest.
- R2 releases the smaller tools while B finishes.

**Merging:** each session opens one PR into `phase-3a-vault` and needs three green checks. PRs merge one at a time, and each later PR is rebased and re-checked after the merge before it. If two PRs both touch `packages/core/test/aiuse-labels.test.ts` (only B and D add rows), the later one rebases.

**Files a tool session may touch:**
- its own `components/tools/<tool>/**`, `lib/tools/<tool>/**` and `packages/core/src/<engine>*.ts`, with their tests;
- its own `apps/web/messages/tools/<tool>.{en,hi}.json` and `lib/blobs/kinds/<tool>.ts`;
- its own e2e spec and walk sheet.

Plus these exceptions:
- D: `apps/web/proxy.ts` and `test/proxy.test.ts`, for one host.
- B and D: rows in `aiuse-labels.test.ts` and rules in `packages/core/src/aiuse.ts`.
- E: the toolbar's Viva button in `components/document/ActionRow.tsx`.
- Append-only, each session adding its own (a later PR rebases, as `aiuse-labels.test.ts` is handled):
  - `packages/core/src/index.ts`: each session's own exports.
  - `packages/core/test/golden/harness/engines.ts`: the `ENGINES` list; B, D and E append their capturers.
  - `apps/web/lib/ai/actions.ts`: D only, as Task D2 says.
  - `docs/superpowers/specs/parity-deviations.md`: rows in the session's own id block; B may also update rows D-W2-8 and F27, as Task B5 says.

Anything else is a groundwork change: stop and report it.

A tool draws over the open document only through its module's `DocumentLayer`.

## Global Constraints

- **Base:** `phase-3a-vault` at 825b2a3 or later. Sessions A to E branch from it only after G has merged.
- **Parity (2026-10-20):**
  - What a tool does is v1's: engines, prompts, checks, budgets, thresholds, file names, the steps.
  - Layout, flow and wording are redesigned into the frame.
  - Every behaviour or copy change gets a register row (D-S2-45 onwards, status `proposed`, "awaits Dr. Sharma (review)"; a number the student can feel adds "and OJ").
  - Each session takes its ids from its own block: G D-S2-45 to 49, A 50 to 59, B 60 to 79, C 80 to 84, D 85 to 94, E 95 to 104.
- **Ports and goldens:**
  - A ported function and its golden are never edited. A fix is a named sibling (`…V2`) whose test states the difference.
  - New engines (closeness, PPT model, style features, grammar rules, the viva prompt) get goldens captured from v1 running in jsdom (`packages/core/test/golden/<x>/capture.ts`, as the other dirs do). Never hand-write a fixture.
- **The fourteen rules** (BLUEPRINT §2) apply. These bind here:
  - 1: numbers in code, never AI.
  - 2: the personal-data scan before any AI.
  - 3: AI-use log, never "no AI" against the log.
  - 4: viva never insertable.
  - 7: AI text tracked.
  - 8: flags are prompts, "no flag" never shown as safe; closeness says "close", never "copied".
  - 9: ethics never says "exempt"; "Only your committee can say that, in writing."
  - 10: the AI never edits scale wording.
  - 12: the app never submits.
  - 14: chart bars start at zero; captions APA 7.
- **Rulings carried from 2026-10-19:**
  - R1: participant data rows stay in memory, never stored.
  - R2: result-chart bars start at zero.
  - R3: inserted pictures are PNG at 2x.
  - R4: no code colours in exported documents.
  - R5: scope is the project.
- **Copy:**
  - Every string goes through `t()`. New keys go in the tool's own `messages/tools/<tool>.{en,hi}.json`, Hindi marked DRAFT.
  - v1 keys keep their values (B4's Tasks 35 and 36 change them).
  - Draft §7 rules: plain words; no emoji (icons from `@phosphor-icons/react`); sentence case; no em-dashes; toasts only "Saved" and "Inserted".
- **AI output** has a gold edge and a label saying what to check. Every new prompt opening is pinned in `aiuse-labels.test.ts` and gets a rule in `aiuse.ts`. "Other help" is never acceptable for a v1 kind.
- **Data:**
  - Tool state lives in sealed project blobs (`useProjectBlob`), one kind per v1 `appu_*` key group. Each kind is mapped in `KIND_STAGE`; a pop-out writes only its own stage's kinds.
  - Data rows (R1) and the dictionary cache are memory only.
- **Network:** one new `connect-src` host, `https://api.dictionaryapi.dev` (session D). No CDN scripts (CSP `strict-dynamic`). `pptxgenjs` and `jszip` come from npm.
- **Not built stays honest:** a tab whose session has not shipped reads "Not built yet" in words. Nothing is hidden behind a button that does nothing.
- **Tests:** TDD; three green checks (`checks`, `e2e`, `golden-exact`) before a merge; each session adds its own `apps/web/e2e/tools-<x>.spec.ts`. AI and external hosts are answered from recordings, as in `stage2-idea-literature.spec.ts`.
- **Done means live:** a group is done only when its sheet passes OJ's live walk.

## Review Focus

1. **A large or messy data file in the Statistics Lab** (20,000 rows, a semicolon delimiter, a header row of names, a column of text). It parses as v1 does, says which rows it skipped, and never freezes the page. Test in Task B1 ("parses a 20,000-row semicolon file within 2 s and lists skipped rows").
2. **A participant's name in pasted data, then Explain in plain language.** The personal-data scan offers mask, send as is, or cancel before any AI request. No data row is ever written to a blob. Test in Task B2 ("explain scans first and the blob holds no row").
3. **A tagged passage after reload, lock, unlock and export.** `qual-tag` and `stat-tag` spans survive the sanitizer, sealing and reload. Deleting a code strips its spans from every document of the project, sealed ones included. Export carries no code colours (R4). Tests in Task G4 ("sanitizer keeps data-run and data-qcode") and Task C2 ("deleting a code strips it from all three documents, sealed").
4. **Closeness on a long document against 20 shelf papers.** It completes without blocking typing, by running off the main thread or in chunks. Quoted text and everything after "References" are not counted. Cyrillic look-alike letters do not hide a match. Test in Task E1 ("50,000 words against 20 papers in under 5 s, quotes and references excluded").
5. **Make PPT on a document with no headings, an image and a table.** v1's rules apply (one slide per H1, H2 or H3; at most 10 bullets; the first image per slide). With no heading, one slide is titled with the document's name. The download opens as a valid `.pptx`. Test in Task E3 ("no-heading document makes one titled slide; zip has ppt/presentation.xml").

---

## Session G: Groundwork

### Task G1: Specs into the repo, register rows, the walk sheet skeleton

**Files:**
- Create: `docs/v1-tools/01-workspace-and-writing.md`, `03-design-ethics-and-data.md` and `04-citations-review-guide-and-rules.md`, copied verbatim from `appuscholar-blueprint/v1-tools/`, with a note at the top giving the source and date.
- Create: `docs/walkthroughs/tools-g.md`.
- Modify: `docs/superpowers/specs/parity-deviations.md`, adding D-S2-45 (the stage places and their tabs) and D-S2-46 (the toolbar Viva opens Review's Viva tab).

- [ ] **Step 1:** Copy the three notes byte for byte. Check with `shasum -a 256` against the source and record the hashes in the note at the top.
- [ ] **Step 2:** Write the register rows, status `proposed`, "awaits Dr. Sharma (review)".
- [ ] **Step 3:** Commit: `docs(tools): v1 tool specs into the repo; register D-S2-45, D-S2-46`.

### Task G2: Tool registry and places

**Files:**
- Create:
  - `apps/web/lib/tools/registry.ts`
  - `apps/web/components/tools/<tool>/index.ts` for design, stats, qual, style, words, close, slides, viva (each exports `built: false`)
  - `apps/web/components/places/StagedPlace.tsx`
- Modify:
  - `apps/web/lib/frame/places.ts` (`PLACE_TABS`)
  - `apps/web/components/frame/StagePlace.tsx`
  - `apps/web/components/places/WritingPlace.tsx`
  - `apps/web/components/frame/StageRows.tsx` (`BUILT` reads the registry)
  - `apps/web/lib/tools.ts` (`BUILT_IN` derived from the registry)
- Test: `apps/web/test/toolRegistry.test.tsx` and `apps/web/test/places.test.tsx`.

**Interfaces (produced, used by A to E):**
```ts
// lib/tools/registry.ts
export type ToolTab = { stage: StageKey; tab: string; tool: ToolId | "viva"; labelKey: string; nextKey: string };
export const TOOL_TABS: ToolTab[];
// The order and ids are fixed here:
// design: overview, pathway, protocol, ethics, registration, investigator, budget, aiuse
// collect: data, power, charts, check, scales, coding
// writing: document (existing), style, words
// review: closeness, viva, slides
export type ToolModule = { built: boolean; Panel?: (p: { tab: string; projectId: string }) => JSX.Element; facts?: (b: StageBlobs) => ToolFacts; exportParts?: ExportPartDef[] };
export function toolModule(tool: ToolTab["tool"]): ToolModule; // reads components/tools/<tool>/index.ts
export type ToolFacts = { detail?: string; started: boolean };
export type StageBlobs = Partial<Record<BlobKind, { value: unknown; updatedAt: string }>>; // the stage's decrypted blobs, as ProjectHome reads them
```
`StagedPlace` renders `PlaceHeader` with the stage's tabs, then the tab's `Panel` when `built`, else `<NotBuilt />`. Each tab ends with its `nextKey` line.

- [ ] **Step 1: Write the failing tests**
  - `it("every stage 3 to 6 tab appears in order with its label")`
  - `it("a tab whose module is not built shows Not built yet with Open my document")`
  - `it("turning one module's built on shows its Panel and leaves the others Not built")`
  - `it("BUILT_IN and the home's built stages follow the registry")`
  - `it("Writing keeps the document as its first tab and adds My style and Words")`
- [ ] **Step 2:** Run `pnpm --filter @appuscholar/web exec vitest run test/toolRegistry.test.tsx test/places.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement the registry, the eight module stubs, `StagedPlace`, and the `PLACE_TABS` and `StagePlace` wiring. Phone: tabs scroll sideways (as Literature does).
- [ ] **Step 4:** Run the tests and the whole web suite. Expect PASS. `wave-b1` e2e row 15 is updated: Design and ethics now shows tabs, each reading "Not built yet".
- [ ] **Step 5:** Commit: `feat(frame): stage 3 to 6 places and Writing tabs driven by a tool registry`.

### Task G3: Blob kinds, API allow-list, stage states, export slots

**Files:**
- Create: `apps/web/lib/blobs/kinds/<tool>.ts` for design, stats, qual, style, words, close and viva. Each holds that tool's zod schemas, taken from the v1 key shapes in the v1 notes.
- Modify:
  - `apps/web/lib/blobs/kinds.ts` (aggregates)
  - `apps/api/src/routes/blobWrite.ts` (allow-list)
  - `apps/web/lib/frame/stages.ts` (`KIND_STAGE`)
  - `apps/web/lib/frame/homeFacts.ts` and `components/frame/ProjectHome.tsx` (stage facts from `ToolModule.facts`)
  - `apps/web/lib/export/projectExport.ts` and `components/export/ExportDialog.tsx` (parts from `ToolModule.exportParts`)
- Test: `apps/web/test/frameStages.test.ts`, `apps/api/test/blobs.routes.test.ts`, `apps/web/test/useProjectBlob.test.tsx` and `apps/web/test/projectExport.test.ts`.

**Interfaces:**
New kinds, one per v1 key group:

| v1 keys | v2 kinds | stage |
|---|---|---|
| `appu_design_{reg,proto,ec,ctri,pi,budget}` | `design_reg`, `design_proto`, `design_ec`, `design_ctri`, `design_pi`, `design_budget` | design |
| `appu_statsets`, `appu_statruns`, `appu_statsname`, `appu_gen_first` | `stats_sets`, `stats_runs`, `stats_prefs` | collect |
| `appu_qual_codes`, `appu_qual_showcolors` | `qual_codes`, `qual_prefs` | collect |
| `appu_style_*` | `style_profile`, `style_samples`, `style_meta` | writing |
| `appu_wordbank`, `appu_gram_stats`, `appu_spell` | `words_bank`, `words_prefs` | writing |
| `appu_close_k`, `appu_close_min` | `close_prefs` | review |
| `appu_viva` | `viva_log` | review |

```ts
export type ExportPartDef = { part: string; labelKey: string; detailKey: string; formatKey: string; ticked: boolean; build(d: ExportDeps): Promise<Array<{ path: string; data: string | Blob }>> };
```

Stage state:
- A stage is started when any of its kinds has work.
- Writing also counts the document, as today.
- `*_prefs` kinds are not work (`work: false`).

- [ ] **Step 1: Write the failing tests**
  - `it("every new kind maps to its stage in KIND_STAGE")` (extends the existing `for (const k of BLOB_KINDS)` test)
  - `it("the api accepts each new kind and refuses an unknown one")`
  - `it("saving design_reg turns Design and ethics In progress; a prefs kind does not")`
  - `it("a pop-out of Review cannot write a collect kind")`
  - `it("the export dialog lists a part a module declares, and the zip holds its files")`
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement. The schemas follow v1 shapes exactly (field names as v1's). There is no migration.
- [ ] **Step 4:** Run the web and api suites. Expect PASS.
- [ ] **Step 5:** Commit: `feat(tools): blob kinds, api allow-list, stage states and export slots for stages 3 to 6`.

### Task G4: Document hooks, the sanitizer, per-tool messages, the dependency

**Files:**
- Create:
  - `apps/web/lib/editor/docAccess.ts`
  - `apps/web/messages/tools/<tool>.{en,hi}.json` for each tool (empty objects)
- Modify:
  - `packages/core/src/sanitize.ts` (`ALLOWED_ATTR` gains `data-run` and `data-qcode`)
  - `apps/web/lib/i18n.tsx` (merges `messages/tools/*.json` into the dictionaries; a key collision throws)
  - `apps/web/package.json` and `pnpm-lock.yaml` (`pptxgenjs` 3.12.0)
- Test: `apps/web/test/docAccess.test.tsx`, `packages/core/test/sanitize.test.ts` and `apps/web/test/i18n.test.ts`.

**Interfaces:**
```ts
// lib/editor/docAccess.ts
export function useDocAccess(): {
  text(): string;                                    // whole document, as v1's getEditorText (docTextContent)
  selection(): string;                               // v1's selText(): the selection, else ""
  insertText(s: string): Promise<boolean>;           // at the cursor, plain
  insertBlock(html: string): Promise<boolean>;       // v1's insertHTMLBlockIntoEditor, at the end
  wrapSelection(tag: "stat-tag" | "qual-tag", attrs: Record<string, string>): Promise<"done" | "no-selection" | "crosses-paragraph">;
  replaceInDocument(original: string, replacement: string): Promise<boolean>; // undoable, as v1's execCommand('insertText')
  allDocuments(): Promise<Array<{ id: string; title: string; text: string; html: string }>>; // decrypted, this project, not deleted
  rewriteDocument(id: string, html: string): Promise<boolean>;                // sealed write through the revision path
};
```
Each call opens the document beside when it is closed, as Insert reference list does today (row 11). The calls work from a pop-out through `lib/popout/sync.ts`.

- [ ] **Step 1: Write the failing tests**
  - `it("insertBlock opens the document when closed and inserts once at the end")`
  - `it("wrapSelection refuses a selection across two paragraphs")`
  - `it("allDocuments returns decrypted text of every live document in the project")`
  - `it("sanitizer keeps data-run and data-qcode and still strips onclick")`
  - `it("a tool message file merges into t(); a duplicate key throws")`
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement on top of `requestInsert`, `insertHtmlBlock`, `docTextContent` and the existing document API. Add the dependency with `pnpm --filter @appuscholar/web add pptxgenjs@3.12.0`.
- [ ] **Step 4:** Run all suites, typecheck and build. Expect PASS.
- [ ] **Step 5:** Commit: `feat(tools): document access hooks, sanitizer attributes, per-tool messages, pptxgenjs`.

### Task G5: e2e, walk sheet, PR, release G

- [ ] **Step 1:** Write `apps/web/e2e/tools-g.spec.ts`:
  - each stage 3 to 6 place opens with its tabs in order;
  - each tab reads "Not built yet" with Open my document;
  - the phone width shows the tabs scrolling;
  - the home rows still read "Not built yet. You can plan it in your document.".
- [ ] **Step 2:** Write `docs/walkthroughs/tools-g.md`. Five rows, mirroring the spec.
- [ ] **Step 3:** Open a PR into `phase-3a-vault` and get three green checks.
- [ ] **Step 4:** OJ merges and deploys: API (the allow-list), then web. No Neon backup is needed (no schema change), but one is cheap and recommended.
- [ ] **Step 5:** Start sessions A to E from the merged `phase-3a-vault` as soon as the PR merges. Release G and walk `tools-g.md` live at the same time (OJ, 2026-10-21).

---

## Sessions A to E: the tools

Each session's first task is the same:
- read this plan, its spec note, and (for A, B and C) the 2026-10-19 plan's matching tasks;
- write its group's detailed task list, in this plan's format, as `docs/superpowers/plans/2026-10-2x-tools-<x>.md`;
- have a reviewer check it against the v1 note for coverage;
- then build.

The tasks below fix the order, the files, the shared names and the tests that prove each tool. Each session also adds its e2e spec and walk sheet, and ends with its PR.

### Session A: Design and ethics

Engines exist in `packages/core/src/design.ts`, with golden `design/`. The AI-use statement uses `aiustatement.ts`.

- **Task A1, Overview and Pathway.**
  - Overview: v1's dashboard, "N of 6 ready", from `designDashboard`.
  - Pathway: the regulatory-pathway wizard, `regPathway`, kind `design_reg`.
  - Tests:
    - "four answers give v1's pathway for each of the 66 golden cases";
    - "the result never says exempt".
- **Task A2, Protocol and Ethics and consent.**
  - Protocol builder: eight fields, Save, "Generate protocol document" with `protocolMarkdown` → `insertBlock`.
  - Ethics committee package: 8-item checklist, approval record, ethics statement insert, consent form (`ecStatement`, `consentMarkdown`).
  - Tests:
    - "Generate inserts v1's protocol once at the end";
    - "the minors note appears when v1's does".
- **Task A3, Registration, Investigator and Budget.**
  - CTRI readiness (13 ticks, export `ctri-readiness-DATE.md`).
  - PI eligibility (6 ticks, CV box, `pi-cv-DATE.txt`).
  - Budget (₹ rows, total, `trial-budget-DATE.md`).
  - Each download is also an export part.
  - Test: "downloads carry v1's file names and bodies".
- **Task A4, AI-use statement tab.**
  - v1's dialog: date range, kinds ticked, other tools, five ticks, course or journal format.
  - It reads `/ai/log?projectId=<id>` (after PR #13 it includes first run's claimed check) and the style declaration (`style_meta`, written by session D; shown as absent until D ships).
  - Tests:
    - "it refuses 'no AI' while the log has rows";
    - "it names first run's idea check".
- **Task A5:** e2e `tools-a.spec.ts`, `docs/walkthroughs/tools-a.md`, PR.

### Session B: Statistics and charts (the long pole)

Engines exist: `stats*.ts`, `statsmath.ts`, `pvalue.ts`, `statfmt.ts`, `intake.ts`, `guide.ts`, `power.ts`, `charts.ts`, `quickchart.ts`, `numbers.ts`, `rtlink.ts` and `scales.ts`, with their goldens (26 tests against scipy).

- **Task B1, Data in.**
  - Paste box, "Parse data", "Upload .csv" (.csv, .tsv, .txt), dataset name.
  - The personal-data scan with mask, and the de-identification key file `appuscholar_key_keep_separate.csv`.
  - Rows stay in memory (R1). `stats_sets` stores name, hash, ts and n only.
  - Tests:
    - Review Focus 1;
    - "no data row is in any blob".
- **Task B2, Run a test.**
  - The 26-test dropdown with v1's fields per test, "Run test", the APA sentence, assumptions, and the result chart (bars from zero, R2).
  - "Insert into document" is `insertBlock('<p><span class="stat-tag" data-run="<runId>">' + sentence + '</span></p>')`, as v1's `statsInsert` (12024).
  - "Explain in plain language" uses v1's prompt (temperature 0.3), after the scan.
  - `stats_runs` keeps 300 at most.
  - Tests:
    - Review Focus 2;
    - "each of the 26 tests prints v1's sentence for its golden corpus file";
    - "the inserted sentence survives reload".
- **Task B3, Which test fits and Practice mode.**
  - The guide (`tgNext`, `tgRes`, `tgCheck`) and the demos (`TG_DEMO`, "Run the demo in the Stats Lab").
  - The practice gate (`appu_gen_first` → `stats_prefs`).
  - Test: "the 34 guide paths end where v1's do".
- **Task B4, Power.**
  - Sample size and power (`powerCompute`), "Run the pretend studies" (`simulatorCompute`).
  - Test: "105 power cases and 18 simulations match v1".
- **Task B5, Charts.**
  - Chart Studio (`vzChart`: box plot, error bars, histogram, Q-Q), using the Lab's data, PNG at 2x (R3) and SVG downloads.
  - Quick chart: bars, lines and Venn. Bars and lines become an SVG renderer in `quickchart.ts`, replacing Chart.js (register row; settles D-W2-8 and F27).
  - Tests:
    - "84 chart cases render v1's tables";
    - "quick bar chart starts at zero".
- **Task B6, Check numbers.**
  - Numbers check (`numbersCheck` over `text()`).
  - Results linking (`rtScanTags`, "Re-run every out-of-date result").
  - Flags are prompts (rule 8).
  - Test: "148 numbers cases flag as v1".
- **Task B7, Scales.**
  - The scale library: copy the questionnaire text; `{ID}_items.csv`; "Score this scale in my data" via `slScoreData`.
  - The AI never edits wording (rule 10).
  - Test: "24 scoring cases match v1".
- **Task B8:** e2e `tools-b.spec.ts`, `docs/walkthroughs/tools-b.md`, PR.

### Session C: Qualitative coding

The engine exists: `qual.ts`, with golden `qual/`.

- **Task C1, Code tree.**
  - Codes with sub-codes, colours (`qualNextColor`), rename and delete.
  - "New code" uses an inline field, not v1's native `prompt()` (register row).
  - Kind `qual_codes`.
  - Test: "13 next-colour cases match v1".
- **Task C2, Tagging and passages.**
  - Tap a code to tag the selection (`wrapSelection("qual-tag", { "data-qcode": id })`; a selection within one paragraph only, as v1).
  - "Show code colours in the document" (`qual_prefs`).
  - The passages view across `allDocuments()`.
  - Delete cascades through `rewriteDocument`.
  - Tests:
    - Review Focus 3;
    - "passages list v1's text per code".
- **Task C3, Export.** "Export all coded passages (Markdown)" as `appuscholar-coded-passages-DATE.md` via `qualBuildMarkdown`, also an export part with no colours (R4).
- **Task C4:** e2e `tools-c.spec.ts`, `docs/walkthroughs/tools-c.md`, PR.

### Session D: Writing tools (My style, Words and grammar)

No engine exists. Port first, with goldens, then build the screens.

- **Task D1, Style engine port.**
  - `packages/core/src/style.ts`: `styleFeatures`, `styleOutliers`, `styleCompose`, the vocabulary list, the paraphrase compare, and `stylePrompt` (v1 6362-6575, 6975-7047).
  - Goldens captured from v1.
  - The three prompt openings get `aiuse.ts` rules (they exist at lines 28-29; add the multi-file one if its opening differs) and `aiuse-labels` rows.
  - Test: "features of 12 golden samples match v1".
- **Task D2, My style tab.**
  - Declaration, samples (features only, never text: `style_samples`), profile (`style_profile`, 1,500 characters), "Use my style in suggestions".
  - "Learn from my writing" and "Learn from my files (up to 100)", using mammoth and pdf.js already in the app (80 pages, 25 MB).
  - The three checks: paraphrase with pasting blocked, ten words, "Does it sound like me?".
  - "Erase all style data".
  - `stylePrompt()` is appended to Continue, Improve and Extend when on (`lib/ai/actions.ts`; this file is D's).
  - Tests:
    - "samples blob holds no text";
    - "Continue's prompt carries the profile only when the toggle is on".
- **Task D3, Words engine port.**
  - `packages/core/src/words.ts`: v1's ~25 regex rules (`gramLocal`), the chunking (9,000 characters in chunks of up to 1,800, temperature 0.1), and `gramVerifyAI` (keep only edits whose original appears verbatim).
  - The dictionary-AI prompt.
  - Goldens.
  - Test: "rule check of the golden corpus gives v1's suggestions".
- **Task D4, Words and grammar tab.**
  - Dictionary: Look up, Use my selected word. `dictionaryapi.dev` is added to `connect-src` with its test. The cache is in memory, 200 words.
  - Hindi meaning (AI); word bank (`words_bank`, 500 at most, `word-bank.csv`).
  - Grammar: spelling standard; "Check with rules"; "Check with AI" after the scan. Apply uses `replaceInDocument` (undoable); Ignore.
  - Tests:
    - "Apply changes only the verified original and Ctrl+Z undoes it";
    - "AI edits whose original is not in the text are dropped".
- **Task D5:** e2e `tools-d.spec.ts`, `docs/walkthroughs/tools-d.md`, PR.

### Session E: Review (Closeness, Viva, Make PPT)

No engine exists for closeness or PPT. Port with goldens first.

- **Task E1, Closeness engine port.**
  - `packages/core/src/closeness.ts`: `clTok`, `clExcludeRanges`, `clCompare`, `clReportText` (v1 6822-6974).
  - The k-word index (up to 3 hits per key); runs of at least `minRun` words with at least 4 non-stopwords; quotes and References excluded; Cyrillic and Greek look-alikes normalised; `pct = round(1000*covered/counted)/10`.
  - Goldens from v1 on 20 cases.
  - Tests:
    - Review Focus 4;
    - "20 golden cases give v1's percentage and runs".
- **Task E2, Closeness tab.**
  - Sources: Reading list papers (`useShelf`, page text) and "Your other documents" (`allDocuments()`); a paste box.
  - Word group (5, 6 or 8) and minimum passage length (8, 10 or 15), stored in `close_prefs`.
  - "Check my document"; the marked text; totals by source; passages; `closeness-check.txt`.
  - Copy says "close to", never "copied"; "No flag" is never "safe" (rule 8).
  - Test: "the report text matches v1's for a golden case".
- **Task E3, Make PPT.**
  - `packages/core/src/pptModel.ts`: `docToSlideModel` (v1 4954; H1, H2 and H3 start slides; paragraphs and list items become bullets; a table is one bullet; the first image per slide; at most 10 bullets). Goldens from v1.
  - The tab: "Generate slide preview", the "Slide n" cards, "Download as PowerPoint (.pptx)" via `pptxgenjs` with v1's master (purple Georgia titles). The file is named after the document title.
  - v1's copy says "any picture becomes its own slide" but its code attaches the picture to the current slide. Keep the code's behaviour and correct the copy (register row).
  - Tests:
    - Review Focus 5;
    - "slide models of 10 golden documents match v1".
- **Task E4, Viva.**
  - The Review tab and the toolbar's Viva button (`components/document/ActionRow.tsx` stops toasting "arrives in a later phase" and opens Review › Viva).
  - "Who is asking?"; "Get a question" / "Another question" (v1 prompt at 3612, temperature 0.6, 700 tokens; at least 25 words selected); answer; "Save my answer" (`viva_log`, last 60).
  - Never insertable (rule 4). An AI-use rule and label row are added.
  - Test: "a viva question cannot be inserted into the document".
- **Task E5:** e2e `tools-e.spec.ts`, `docs/walkthroughs/tools-e.md`, PR.

---

## Releases

- **R1 (G):** API, then web. Walk `tools-g.md`.
- **R2 (A, C, E):** web only. These merge one at a time as each turns green, and are released together. Walk `tools-a.md`, `tools-c.md` and `tools-e.md`.
- **R3 (B, D):** web only (D's CSP host is in the web proxy). Walk `tools-b.md` and `tools-d.md`.
- After every release: Help shows the new version, the home rows of the released stages leave "Not built yet", and the Dr. Sharma deck's status table is updated with the counts in words.

## Decisions for OJ

1. **Session count.** Five at once (OJ, 2026-10-21), after G. Usage runs about five times faster than one stream.
2. **Quick chart without Chart.js** (Task B5): an SVG renderer, with no new dependency or CDN. The alternative is adding `chart.js` from npm. Recommended: SVG, since Chart Studio is already SVG.
3. **"New code" inline instead of a native prompt** (Task C1). Recommended, because a native dialog freezes automated walks (17 October finding).
4. **Release grouping** R2 (A, C, E) and R3 (B, D). Alternative: release each group as it turns green, which means five walks.

**OJ's answers (2026-10-21):** "Approved: the order, the session split and your four recommendations (SVG quick chart, inline New code, releases R2 = A, C, E and R3 = B, D). Start the groundwork session now."

**OJ's change to the order (2026-10-21, relayed by the parent session):** "Yes: start sessions A to E as soon as the groundwork PR is merged; release and walk G alongside." G's interfaces (`lib/tools/registry.ts`, `ToolModule`, `TOOL_TABS` ids and order, the blob kind names, `ExportPartDef`, `useDocAccess`) are therefore final when G's PR merges.

## Deferred (unchanged from wave B)

- The MCP door, PRISMA and levels (Phase 7), and lectures.
- Wave B's B2 (Literature and Keep), B3 (reader), B4 (copy), and Q (AI quality). These follow this plan, from `phase-3a-vault` after R3.
