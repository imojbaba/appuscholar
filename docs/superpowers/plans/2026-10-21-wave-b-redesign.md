# Wave B (the redesigned stage 1-2 journey in the new frame) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student moves from a rough idea to kept, read and compared papers in the approved frame: stages are places with their own states, the project has a home, Literature is one place with four tabs and one "Keep", the reader has tabs, helpers act on the student's own text, the document opens beside any stage, everything leaves through one export place, titles are locked in the vault, and the copy is honest, plain and emoji-free, with v1's engines, prompts and checks unchanged.

**Architecture:** Four release slices, each ending with a live walk. B1 builds the frame and carries the wave's only storage change (one migration: stage marks, a project key and sealed-title columns), deployed migration, then API, then web. B2 (Literature and Keep) and B3 (reader and helpers) are web only; their data changes are loose fields in existing blob kinds, written by a client-side, resumable, idempotent migration. B4 rewrites copy once, after the layouts have settled. The app moves from one workspace page to routes (`/start`, `/projects`, `/p/<id>`, `/p/<id>/<stage>/<tab>`); a project layout keeps the project, its documents and the editor mounted while the student moves between places. The AI-quality harness is its own track (Q1 to Q3) with no deploy of its own.

**Tech Stack:** TypeScript, pnpm/turbo, Next.js 16 App Router / React 19, Hono on Vercel, Drizzle on Neon Postgres, the WebCrypto vault, vitest, Playwright, `@phosphor-icons/react` (already a dependency), the golden harness in `packages/core/test/harness`.

**Spec:** `docs/design/2026-10-20-journey-redesign-draft.md` §5 to §13 (binding; §12 is OJ's four decisions), `docs/design/2026-10-20-impact-map.md` (file:line evidence, §5 order constraints, §6 omissions), the approved canvas (nine `*.dc.html` screens, copied into the repo by Task 1 as `docs/design/2026-10-20-journey-canvas/`; their copy and layout are the target), `docs/walkthroughs/notes/2026-10-20-stage2-live-walk.md` (W1 to W29 and OJ's comments), `docs/superpowers/plans/2026-10-20-fix-wave-a.md` and its ledger `docs/superpowers/ledgers/2026-10-20-fix-wave-a.md` (what changed; the LATER minors), the register `docs/superpowers/specs/parity-deviations.md`, the vault design `docs/superpowers/specs/2026-10-16-vault-design.md`. House style: `docs/superpowers/plans/2026-10-19-stage2-idea-literature-screens.md`.

## Release slices, and why

| Slice | What ships | Storage and deploy | Ends with |
|---|---|---|---|
| **B1 Frame, stage states, locked titles** (Tasks 1-16) | Routes and shell, project home, project list, first run, the six places (Literature hosting today's panels in four tabs for now), the document beside any stage, one export place, pop-out for any place, phone layout, titles sealed | Migration `0006_frame.sql` by hand, then the API, then the web | `docs/walkthroughs/wave-b1.md`, live |
| **B2 Literature and Keep** (Tasks 17-26) | Stable paper id and its migration, Find with one Keep, the paste box, the bookmark as an extra with its "Adding this paper" screen, Reading list, Compare, Citations, "Needs your attention" | Web only (loose fields in existing kinds; `connect-src` unchanged) | `wave-b2.md`, live |
| **B3 Reader and helpers** (Tasks 27-34) | Reader with tabs, "Your take first", held-selection highlights, stored number checks, helpers in the document's selection actions | Web only (plus Q3's API change if OJ approves it) | `wave-b3.md`, live |
| **B4 Copy and finish** (Tasks 35-41) | Honest storage wording, no emoji (one switch), toasts only for Saved and Inserted, RIS and BibTeX, the Hindi re-map sheet, Dr. Sharma's packet | Web only | `wave-b4.md`, live |
| **Q AI quality** (Tasks Q1-Q3) | Test sets, graders, runner, baseline reports; AI-use labels knowingly changed | None for Q1, Q2; Q3 is an API-only deploy, shipped with B3 | Reports in `packages/quality/reports/` |

Why slices: B1 is the only slice that changes the database and the API, so the rollback risk sits in one release and is walked on its own. B2 and B3 are web-only, so a bad build is undone by redeploying the previous web. B4 touches every v1 key once, after the screens that use them are final (impact map constraint 11: the 205 emoji keys and their Hindi are touched once). Each slice leaves the live site whole: B1's Literature place hosts today's working panels until B2 and B3 replace them, so nothing a student can do today disappears in between. One rollback limit holds across the wave: once the title pass of Task 5 has sealed an account's titles, a web older than B1 shows ciphertext in that account's lists; after B1 ships, fix forward, never roll the web back past B1, and never roll the API back alone.

## Global Constraints

- **Base.** Branch `wave-b1` off `origin/phase-3a-vault` after the fix-wave-a merge (PR 10) and the Idea-panel residual fix; each later slice branches off the previous slice's merged `phase-3a-vault`; each PR goes into `phase-3a-vault`.
- **Names.** Walk faults are W1 to W29, never register ids. New register rows continue from **D-S2-38** (the last id at 641e8a8 is D-S2-36; Task 1 re-checks and shifts every id in this plan by the same offset if the residual fix took one). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Parity.** v1 parity holds for what tools do: engines, prompts, checks, budgets, thresholds. Layout, flow and wording are redesigned. Every behaviour or copy change gets a register row, status `proposed`, "awaits Dr. Sharma (review)"; a changed number the student can feel adds "and OJ". Row D-S2-22 (OJ, 2026-10-20) makes copy rows reviewed, not blocked.
- **Ports and goldens.** A port function and its golden test are never edited. A fix is a named sibling (`…V2`, `…V3`) whose test states its exact difference, or an in-place change to v2 code (wave A's V2 functions are v2 code). Never hand-edit a golden fixture or a recording; new recordings go through `capture.mjs --only` and `v2-manifest.json`.
- **Copy.** Every student-facing string goes through `t()`. New keys go in `V2_STRINGS` with English and a DRAFT Hindi. Until Task 35, no v1 key's value is changed: a redesigned screen uses new keys and stops using the old one. Task 35 (`COPY_V2`) and Task 36 (`D2_NO_EMOJI`) change v1 keys, through `apps/web/scripts/i18n-overrides.mjs` only; regenerate with `node apps/web/scripts/extract-v1-i18n.mjs ../appuscholer/index.html` (twice gives no diff). New copy: plain words from the student's side ("Keep", "Reading list", "Compare", "Check numbers"; never "Matrix", "Shelf", "Quick read", "Pop out"), no emoji, no em-dashes, no numbered stage labels, sentence case for labels. The storage line is exactly "Saved to your account, locked with your passphrase. Only you can read it." (vault off: "Saved to your account. Set a passphrase to lock it."). Unbuilt things say "Not built yet" in words.
- **AI output.** Always a gold edge (`--gold`) and a label that says what it is and what to check. Every prompt keeps its AI-use label (`packages/core/test/aiuse-labels.test.ts`) unless Task Q3 changes it on purpose. No prompt over 60,000 characters (`apps/api/src/routes/ai.ts:16`).
- **Network.** `connect-src` stays `'self'`, the API, `https://api.openalex.org`, `https://eutils.ncbi.nlm.nih.gov`, `https://api.crossref.org`. The paste box needs no new host (DOI, PubMed, PMC, arXiv and OpenAlex ids resolve through those three). The only possible new host in wave B is `https://www.ebi.ac.uk` (Europe PMC full text), and only if OJ chooses automatic PDF text (decision 2). Requests carry only search words, ids, DOIs, titles and surnames.
- **Storage and deploy.** One migration, `0006_frame.sql`, in B1: Neon backup, migration by hand, then the API, then the web. The API keeps accepting every request shape of the fix-wave-a web (plain titles, `stage` on create, no `include`). Client data changes run in the browser, are resumable and idempotent, work with the vault off and wait while it is locked, and never use the `/rewrite` routes (closed for complete vaults). Never roll back the API alone after the web ships.
- **Vault.** Titles of projects and documents are sealed when the vault is on; plaintext only with the vault off. Lists and the project home open after unlock; the project list shows stage states before unlock (they come from metadata) with "Locked title" in place of each name.
- **Design.** Colours are the existing tokens in `apps/web/app/globals.css` (they match the canvas). Fonts stay IBM Plex Sans and Plex Sans Devanagari with Fraunces for display (the canvas's Instrument Sans has no Devanagari). Icons come only from `@phosphor-icons/react`. Every new screen works at 375 px wide: 16 px side gutter, no horizontal page scroll, touch targets at least 44 px; each slice's e2e includes a 375x812 pass of its screens.
- **Out of scope.** Stage 3 to 6 screens (built into the frame after wave B), the MCP door, a "find sources" search across the web, AI-use token counts and an API rate limit, a one-tab-per-project lock (blob versions already keep both tabs' edits).
- **Tests.** TDD per task. Commands: `pnpm --filter @appuscholar/core test`, `pnpm --filter @appuscholar/core test:golden`, `pnpm --filter @appuscholar/api test`, `pnpm --filter @appuscholar/db test`, `pnpm --filter @appuscholar/web test`, `pnpm --filter @appuscholar/web e2e`, `pnpm --filter @appuscholar/quality test`. Before any Playwright run: `lsof -iTCP:8788 -iTCP:3000 -iTCP:5433` is empty (a leftover server is reused silently). A task that breaks an existing e2e assertion updates it in the same task; each slice's journey additions land in its e2e task. A green e2e run is required before asking OJ to merge (OJ, wave A decision 4; GitHub does not block).

## Review Focus

1. **A student whose vault is locked opens the app after B1 ships** (the passphrase prompt cancelled or not yet typed): every list and the header must show "Locked title", never ciphertext, "Untitled" or an empty row, and the project list still shows the six states. Test in Task 5 ("a locked vault shows Locked title, never ciphertext") and Task 8.
2. **A tab still on the fix-wave-a build renames a project or creates a document after its titles were sealed**: the plain title is accepted, shown correctly by both builds, and sealed again on the next pass. Test in Task 5 ("a plain title written later by an older tab is sealed on the next pass").
3. **The paper-id migration stops half way** (the tab closed after the citations got ids, before the shelf and the notes) and then runs on another device: it must finish with one id per paper and no lost note or card. Test in Task 17 ("it resumes after a run that stopped after the citations").
4. **"Put in my document" while the document is closed and the vault is locked** (from Compare or Citations): the document opens, the passphrase is asked once, the text goes in once; a cancelled unlock inserts nothing and says so. Test in Task 11.
5. **A device clock hours ahead or behind** when the student marks a stage Ready and edits it: "Ready" and "Reopened" must follow the server's clock only. Test in Task 3 ("Ready is stamped with the server's clock") and Task 4.

## Coverage of the impact map

**Order constraints (§5).** 1 W9 first: done in wave A. 2 Register housekeeping: wave A Task 1; ids continue in Task 1 here. 3, 4, 5 Faults 2, 3, 12, 27: done in wave A. 6 W15 with the `ap_notes` re-key: wave A limited W15 to new papers; Task 17 re-keys notes to the paper id before any retitle. 7 W20 before reader tabs: wave A Task 16, then Task 27. 8 Shared loading component before the frame: wave A's `PanelLoading`, reused by Tasks 7 to 31. 9 W18 under the cap: wave A. 10 AI-use anchors: pinned by `aiuse-labels.test.ts`; changed only in Task Q3, knowingly. 11 D2 with the copy rewrite, through the overrides layer: Tasks 35 and 36, once. 12 Stable paper id before Keep, Compare and reader tabs: Task 17 precedes Tasks 18 to 31. 13 Migration, API, web: Task 16. 14 D3 before the home and list: Task 5 precedes Tasks 7 and 8 in the same release. 15 Stage data in the zip before per-tool downloads go: wave A Task 6 (account zip), Task 12 (export place) before B2 removes the buttons. 16 All six `project.stage` readers in one release: Task 6. 17 Stage 3 only after the kind-to-stage map, stage storage and the Keep id model: Tasks 2, 4, 17; stage 3 is after wave B. 18 e2e: wave A removed `continue-on-error`; each release requires a green run.

**Omissions (§6).** 1 Export: wave A Task 6 and Task 12. 2 Concurrency: wave A's versions; no tab lock (out of scope). 3 Paper identity: Task 17. 4 Stage-state storage and the aggregate: Tasks 2 to 4. 5 What opens: Task 6 (`landingPath`, URLs). 6 Insert with no document open: Task 11. 7 Paste box and CSP: Task 19 (no new host); PDFs: Task 21 and decision 2. 8 AI-use log by wording: Task Q3; token counts and rate limit deferred. 9 Harness: Tasks Q1, Q2. 10 Register and i18n process: Global Constraints, Tasks 35 to 40. 11 Vault-off accounts: Tasks 4, 5 (plain titles, states from metadata). 12 Document titles: Task 5. 13 Closed vault migration: Tasks 5 and 17 run their own client passes. 14 Old library entries and capture duplicates: Task 24 (unchecked and duplicate items), Task 20 (DOI dedupe). 15 Selection limit: Task 32. 16 Pop-out write guard: Task 13. 17 v1 and library imports into the Keep model: Task 17 (`mergeLibrary` keeps v1's drop of authorless entries; parity). 18 Manual migrations: Task 16.

**Walk faults the redesign removes (draft §10).** W4 Task 19. W5, W6, W13 Task 20. W10, W29 Task 6. W11 Task 18. W14 Task 21 (new keys), Task 35 (sweep). W16 Task 10, Task 21. W17 Task 29. W19 Task 22. W22 Task 31, Task 35. W23 Task 10. W24 Task 22, Task 35. W25 Tasks 22, 32.

**Wave A LATER minors.**

| From | Minor | Where |
|---|---|---|
| T1 | commit trailer named the model used | no action (cosmetic) |
| T2 | local e2e pill with a reused server; deploy test order; offline fetch exit code | Task 16 step 1 |
| T3 | Ask, Walk, stats helper, lesson log as other labels | Task Q3 |
| T4 | no ETag on PUT; no version in lists; If-Match quote regex | Task 3 |
| T5 | shelf clients conflict silently; toast after unmount; locked re-read untested; sets queued before the first read land on a broken blob without R16 | Task 21 |
| T6 | `SyntaxError` catch too broad; scratch blobs not exercised in the export | Task 12 |
| T7 | `capture.mjs` comment; `--only` overwrite check after the fetch | Task 19 |
| T8 | URL and DOI both printed; "Smith JA" recapture duplicate | Tasks 18, 20 |
| T8 | Crossref fill writes "Family, Given"; "Xiao Ming LI" | not touched by the redesign; left for the references track (Deferred) |
| T10 | loose topic words; test doubles answer unrecorded URLs empty | test doubles: Task 18; search quality: Track Q sets |
| T11 | `fillEmpty` true on no match; author `m` lingers; weak schema test | Task 23 |
| T14 | 700-character hard cut can split "limitations" | Task 28 |
| T15 | 4 s per PDF in sequence; no DOI in the shelf backup | Task 21 |
| T16 | fragile toast test | Task 31 |
| T18 | Walk and Card boxes empty while notes load; Idea boxes before `/me`; one `role=status` per row | Tasks 31, 9, 21 |
| T19 | inserted-list assertion; stand-in route | Task 23 (assertion); stand-in removed in Task 25 |
| residual | project switch drops a held value without a toast; deleted-elsewhere drops edits without a toast; `notes.ts` caches the R16 answer per panel | Task 6 (switch), Task 21 (deleted elsewhere, R16 cache) |

---

## File structure

- Register, plan, canvas: `docs/superpowers/specs/parity-deviations.md`, `docs/superpowers/plans/2026-10-21-wave-b-redesign.md`, `docs/design/2026-10-20-journey-canvas/` (Task 1).
- Storage: `packages/db/src/schema.ts`, `packages/db/migrations/0006_frame.sql`, `apps/api/src/store/{types,memory,drizzle}.ts`, `apps/api/src/routes/{projects,documents,me,blobs}.ts` (Tasks 2, 3).
- Frame logic: `apps/web/lib/frame/{stages,places,landing,homeFacts,suggest}.ts` (Tasks 4, 6, 7).
- Titles: `apps/web/lib/vault/titles.ts` (Task 5).
- Routes: `apps/web/app/(app)/{page,start/page,projects/page,add/page}.tsx`, `apps/web/app/(app)/p/[projectId]/{layout,page}.tsx`, `apps/web/app/(app)/p/[projectId]/[stage]/[[...tab]]/page.tsx`.
- Frame components: `apps/web/components/frame/{ProjectShell,AppHeader,PlaceHeader,ProjectHome,QuestionCard,StageRows,SuggestedNext,ProjectList,FirstRun,StagePlace,DocumentBeside,AttentionCard}.tsx`; places `apps/web/components/places/{IdeaPlace,LitPlace,WritingPlace,NotBuilt}.tsx`.
- Export: `apps/web/lib/export/projectExport.ts`, `apps/web/components/export/ExportDialog.tsx` (Task 12); `packages/core/src/citexport.ts` (Task 38).
- Literature: `apps/web/lib/papers/{ids,migrate,keep,list,compare}.ts`, `apps/web/lib/attention.ts`, `apps/web/components/literature/*` (Tasks 17-24); `packages/core/src/paste.ts` (Task 19).
- Reader: `apps/web/lib/reader/{load,take,heldSelection}.ts`, `apps/web/components/reader/*` (Tasks 27-31).
- Document helpers: `apps/web/lib/editor/heldSelection.ts`, `apps/web/components/document/{HelpMenu,DocAside}.tsx` (Tasks 11, 32).
- Copy: `apps/web/scripts/{i18n-overrides,copy-audit,hindi-remap-sheet}.mjs`, `docs/copy/`, `docs/i18n/` (Tasks 35-39).
- Quality: `packages/quality/` and `apps/api/scripts/quality.ts` (Tasks Q1-Q3).
- Removed in B1: `components/workspace/{Sidebar,SidebarDrawer,StageGuide,ProjectBar,Dock}.tsx`, `dialogs/{StageIntro,Projects,SaveAsProject}.tsx`, `components/popout/Popout.tsx`. Removed in B2: `components/tools/shelf/ShelfDialog.tsx`, `research/ResearchPanel.tsx`, `cite/CitePanel.tsx`, `shelf/Matrix.tsx`, `analyse/Across.tsx` (their logic modules stay). Removed in B3: `analyse/AnalysePanel.tsx`, `HelpersPanel.tsx`.

---

# Slice B1: the frame, stage states, locked titles

### Task 1: Branch, register ids, the canvas in the repo

**Files:**
- Create: `docs/superpowers/plans/2026-10-21-wave-b-redesign.md` (this plan), `docs/design/2026-10-20-journey-canvas/` (the nine `*.dc.html` and `canvas.json` from `appuscholar-blueprint/design/canvas-2026-10-20/` (a durable copy made 2026-10-21); if that folder is gone, read the canvas artifact `https://claude.ai/artifact/RHiGvf9Vd5AhY8K5xKkfsE` and save its files)
- Modify: `docs/superpowers/specs/parity-deviations.md` (the Ids bullet)

**Interfaces:**
- Produces: the canvas path every later task cites for exact copy; the first free register id.

- [ ] **Step 1: Branch.** `git fetch -q origin && git switch -c wave-b1 origin/phase-3a-vault`; `git log --oneline -20` shows the fix-wave-a merge and the Idea-panel residual fix. If either is missing, stop and ask OJ.
- [ ] **Step 2: Ids.** `grep -o 'D-S2-[0-9]*' docs/superpowers/specs/parity-deviations.md | sort -t- -k3 -n | tail -1` → `D-S2-37` (the W30 patch took it). DONE 2026-10-21 by the controller: every wave B id in this copy is already shifted by one; do not shift again. Appended to the Ids bullet: "Wave B rows start at D-S2-38 (plan `2026-10-21-wave-b-redesign.md`)."
- [ ] **Step 3: Copy the canvas and the plan.** `ls docs/design/2026-10-20-journey-canvas` lists the ten files.
- [ ] **Step 4: Commit** `git commit -m "docs: wave B plan, the approved journey canvas, register ids from D-S2-38"`

---

### Task 2: Stage marks, a project key and sealed-title columns (db, store)

**Files:**
- Modify: `packages/db/src/schema.ts` (`projects`, `documents`); Create: `packages/db/migrations/0006_frame.sql` (+ `meta/` from `db:generate`, renamed as 0005 was)
- Modify: `apps/api/src/store/types.ts`, `memory.ts`, `drizzle.ts`
- Test: `apps/api/test/store.contract.ts`, `apps/api/test/drizzle.test.ts`

**Interfaces:**
- SQL, exactly:
  ```sql
  ALTER TABLE "projects" ADD COLUMN "stage_marks" jsonb DEFAULT '{}'::jsonb NOT NULL;
  ALTER TABLE "projects" ADD COLUMN "deks" jsonb DEFAULT '[]'::jsonb NOT NULL;
  ALTER TABLE "projects" ADD COLUMN "title_key_version" integer DEFAULT 0 NOT NULL;
  ALTER TABLE "documents" ADD COLUMN "title_key_version" integer DEFAULT 0 NOT NULL;
  ```
- Types: `export type StageMarks = Partial<Record<ProjectStage, { readyAt: string }>>`; `Project` gains `stageMarks: StageMarks; deks: WrappedDek[]; titleKeyVersion: number`; `DocumentSummary` gains `titleKeyVersion: number`; `export type TitleWrite = { title: string; titleKeyVersion: number; dek?: WrappedDek }` (0 is plaintext); `export type ProjectWork = ProjectSummary & { blobs: Array<{ kind: string; updatedAt: Date; version: number }>; draftWords: number; draftEditedAt: Date | null }`.
- Store: `createProject(userId, title: string | TitleWrite, stage?)`; `updateProject` patch gains `titleKeyVersion?: number; dek?: WrappedDek`; `createDocument`, `renameDocument` and the document PUT take `string | TitleWrite`; a `dek` is added to the entity's `deks` as blobs do (`DekExistsError` for another wrap of the same `v`); a plain title sets `titleKeyVersion` 0 and keeps `deks`.
- `markStage(userId: string, id: string, stage: ProjectStage, ready: boolean, now: Date): Promise<Project | null>`: ready sets `stageMarks[stage] = { readyAt: now.toISOString() }`; false deletes the key.
- `listProjectWork(userId: string): Promise<ProjectWork[]>`: the projects `listProjects` returns, in its order; `blobs` are every blob's kind, `updatedAt` and `version` (no bodies); `draftWords` sums the current word counts of the project's live documents whose kind is not `source`; `draftEditedAt` is the newest `updatedAt` of those. At most 3 SQL statements for any number of projects.

- [ ] **Step 1: Write the failing tests** (contract tests run on both stores)

```ts
it("a new project has no stage marks, no deks and titleKeyVersion 0", ...);
it("markStage stamps readyAt with the time given; false removes it", async () => {
  expect((await s.markStage(u, p.id, "lit", true, new Date("2026-10-21T10:00:00Z")))!.stageMarks).toEqual({ lit: { readyAt: "2026-10-21T10:00:00.000Z" } });
  expect((await s.markStage(u, p.id, "lit", false, new Date()))!.stageMarks).toEqual({});
});
it("a project created with a sealed title keeps its dek and key version", ...);
it("a plain title over a sealed one sets titleKeyVersion 0 and keeps the deks", ...);
it("a sealed document title keeps its key version through a rename", ...);
it("listProjectWork lists blob kinds, versions and dates and the draft words, in listProjects' order", async () => {
  // a draft of 423 words, a source of 9,000, a deleted draft of 50
  expect(w[0]!.draftWords).toBe(423);
  expect(w[0]!.blobs.map((b) => b.kind).sort()).toEqual(["citations", "idea_intake", "refcheck_cache"]);
});
it("the scratch project is not in listProjectWork", ...);
// drizzle.test.ts
it("listProjectWork runs at most 3 statements for 1 and for 20 projects", ...); // count with drizzle's logger
```

- [ ] **Step 2: Run** `pnpm --filter @appuscholar/api test` → FAIL.
- [ ] **Step 3: Implement**; `pnpm --filter @appuscholar/db db:generate`, rename to `0006_frame.sql` and its journal tag; the file holds the four statements above.
- [ ] **Step 4: Run** `pnpm --filter @appuscholar/db test && pnpm --filter @appuscholar/api test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(db,api): stage marks, a project key and sealed-title columns; the project list with its work in one read"`

---

### Task 3: Routes: the work list, Ready marks, sealed titles, settings

**Files:**
- Modify: `apps/api/src/routes/projects.ts`, `documents.ts`, `me.ts`, `blobs.ts`
- Test: `apps/api/test/projects.routes.test.ts` (new), `apps/api/test/app.test.ts`, `apps/api/test/blobs.routes.test.ts`

**Interfaces:**
- Consumes: Task 2's store.
- `GET /projects?include=work` answers `ProjectWork[]` (dates as ISO strings). Without `include`, `GET /projects` answers as today plus `stageMarks`, `deks`, `titleKeyVersion`.
- `POST /projects/:id/stages/:stage/ready` and `DELETE /projects/:id/stages/:stage/ready` answer 200 with the project; the time is the server's `new Date()`; the request has no body (any body is ignored); a stage outside `PROJECT_STAGES` is 400 `invalid`; another user's project 404.
- Title fields, for project create and patch and for document create, PUT and PATCH:
  `const PlainTitle = z.object({ title: z.string().trim().min(1).max(200), titleKeyVersion: z.literal(0).optional() })`;
  `const SealedTitle = z.object({ title: z.string().regex(CIPHERTEXT).max(4096), titleKeyVersion: z.number().int().min(1).max(1e6), dek: WrappedDekSchema.optional() })`.
  A sealed title's `titleKeyVersion` must be a `v` in the entity's deks after adding `dek`, else 400 `unknown-key-version`; a new project with a sealed title must send its `dek`. A plain title is accepted from every account (tabs older than wave B send no `titleKeyVersion`).
- `GET /projects/:id/writing-record`: each `docs[]` and `sources[]` item gains `id`, `titleKeyVersion`, `deks`.
- Settings: `docBeside: z.boolean()`, `docW: z.number().int().min(360).max(900)`.
- Wave A LATER (T4): PUT of a blob answers `ETag: "<version>"`; `GET /projects/:id/blobs` items carry `version`; If-Match must be `^(?:"(\d+)"|(\d+))$` (`"3` and `3"` are 400).

- [ ] **Step 1: Write the failing tests**

```ts
it("include=work answers each project's blobs and draft words", ...);
it("Ready is stamped with the server's clock (Review Focus 5)", async () => {
  vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
  const r = await post(`/projects/${id}/stages/lit/ready`, { readyAt: "2030-01-01T00:00:00Z" });
  expect((await r.json()).stageMarks.lit.readyAt).toBe("2026-10-21T10:00:00.000Z");
});
it("an unknown stage is 400 invalid", ...);
it("a sealed project title of 820 characters is accepted; a plain one of 201 is 400", ...);
it("a sealed title with an unknown key version is 400 unknown-key-version", ...);
it("a plain title from a tab that sends no titleKeyVersion is still accepted on a vault account", ...);
it("writing-record items carry id, titleKeyVersion and deks", ...);
it("settings accept docBeside and docW from 360 to 900; 359 is 400", ...);
it("a blob PUT answers the new version as the ETag; the blob list carries versions", ...);
it("If-Match with an unbalanced quote is 400", ...);
```

- [ ] **Step 2: Run** `pnpm --filter @appuscholar/api test` → FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(api): projects with their work, Ready marks on the server's clock, sealed titles, document-beside settings"`

---

### Task 4: Stage states and the kind-to-stage map

**Files:**
- Create: `apps/web/lib/frame/stages.ts`
- Test: `apps/web/test/frameStages.test.ts`

**Interfaces:**
- `export type StageState = "not-started" | "started-early" | "in-progress" | "ready" | "reopened"`.
- `export const KIND_STAGE: Record<FixedBlobKind, { stage: StageKey; work: boolean }>`: `idea_intake` idea work; `citations`, `shelf_index`, `ap_notes` lit work; `retraction_cache`, `refcheck_cache`, `rs_prefs`, `ap_cols`, `shelf_cols` lit, not work (caches and preferences).
- `stageOfKind(kind: string): { stage: StageKey; work: boolean } | null`: `shelf_paper:*` is lit work; a kind this build does not know is null (ignored).
- `export type StageWork = { blobs: Array<{ kind: string; updatedAt: string }>; draftWords: number; draftEditedAt: string | null; stageMarks: Partial<Record<StageKey, { readyAt: string }>> }`.
- `stageStates(w: StageWork): Record<StageKey, StageState>`, in this order:
  1. `lastWork(s)`: the newest `updatedAt` of the stage's work kinds; for writing, `draftEditedAt` when `draftWords > 0`.
  2. A mark exists: `lastWork(s) > readyAt` is "reopened", otherwise "ready".
  3. No work: "not-started".
  4. Writing with work: "in-progress" (never "started early": the document is open beside every stage from day one; decision 5).
  5. Some earlier stage in `STAGE_ORDER`, writing excluded, is "not-started": "started-early". Otherwise "in-progress".
- Stage 3 rule (for later): every blob kind a later stage adds must be in `KIND_STAGE`; the first test below fails until it is.

- [ ] **Step 1: Write the failing tests**

```ts
it("every blob kind the api allows has a stage", () => {
  for (const k of BLOB_KINDS) expect(KIND_STAGE[k]).toBeDefined();
  expect(stageOfKind("shelf_paper:p1")).toEqual({ stage: "lit", work: true });
});
it("caches are not work: a project with only refcheck_cache has Literature not started", ...);
it("Literature with work while Idea has none is started early", ...);
it("Writing with words is in progress even when Collection is empty", ...);
it("a change after Ready reopens; a change before it does not (Review Focus 5)", ...);
it("an unknown kind from a newer build is ignored", ...);
```

- [ ] **Step 2: Run** `pnpm --filter @appuscholar/web test -- frameStages` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): stage states from the project's work and its Ready marks"`

---

### Task 5: Titles locked in the vault (projects and documents)

**Files:**
- Create: `apps/web/lib/vault/titles.ts`
- Modify (writers): `apps/web/lib/import/run.ts:29-40`, `lib/import/v1.ts:53-70`, `components/import/ImportV1.tsx:45-70`, the first-document seed (`listOrSeed`, moved in Task 6), `components/document/DocBar.tsx` (rename); (readers that survive B1) `DocBar.tsx:113,117,140`, `DocumentCard.tsx:57,63` (Word and LaTeX file names), `lib/vault/export.ts:62-84`, `components/workspace/dialogs/{Help,MyWriting}.tsx`, `lib/writingRecord.ts:30,50`; the vault migration `lib/vault/migrate.ts` (a title step after the blobs); `apps/web/scripts/i18n-overrides.mjs` (`V2_STRINGS.vault_setup_intro` English and Hindi rewritten; `title_locked`, `title_unreadable`, `titles_unlock`)
- Modify: `docs/superpowers/specs/2026-10-16-vault-design.md` (:16 non-goal, :35 table row, :79 open question 1: "Titles are locked: OJ, 2026-10-20, decision D3")
- Test: `apps/web/test/titles.test.ts`, `vaultExport.test.ts`, `word.test.ts`, `latex.test.ts`, `importV1.test.ts`, `import.test.ts`, `vaultMigrate.test.ts`, `writingRecord.test.ts`

**Interfaces:**
- `export type Titled = { id: string; title: string; titleKeyVersion: number; deks: WrappedDek[] }`.
- `projectKeyId(projectId: string): string` → `"project:" + projectId`; a document's key id is its own id (its title shares the body's dek).
- `sealTitle(v: Pick<VaultValue, "known" | "encryptBody">, keyId: string, deks: WrappedDek[], title: string): Promise<{ title: string; titleKeyVersion: number; dek?: WrappedDek }>`: vault "off" → `{ title, titleKeyVersion: 0 }`; otherwise `encryptBody({ id: keyId, deks }, title)`. A new project seals under `"project:new:" + crypto.randomUUID()` and posts the `dek` it gets (the vault binds no id into the ciphertext).
- `openTitle(v, t: Titled, keyId: string): Promise<{ state: "open"; text: string } | { state: "locked" | "unreadable" }>`.
- `useTitle(t: Titled | null, kind: "project" | "document"): { state: "open" | "locked" | "unreadable"; text: string }`: locked → `t("title_locked")` "Locked title"; unreadable → `t("title_unreadable")` "This title cannot be opened"; cached by key id and ciphertext.
- `sealPlainTitles(d: { vault; listProjects(): Promise<Titled[]>; listDocuments(projectId: string): Promise<Titled[]> /* includeDeleted=1 */; patchProject(id: string, body: object): Promise<void>; patchDocument(id: string, body: object): Promise<void> }): Promise<{ sealed: number }>`: runs only while the vault is unlocked and complete; skips the scratch project (its title is the constant "Scratch space"); idempotent. The project shell calls it after each unlock; `migrateToVault` calls it after the blobs for accounts that set the vault up later.
- File names (Word, LaTeX, the zip's folders) come from opened titles; an unopenable title gives `"untitled"`.
- `vault_setup_intro` en: "Your documents, their titles and your project names are saved under your account, locked so that only this passphrase opens them. Nobody at Appuscholar can read them. If you lose the passphrase and the recovery sheet, they cannot be recovered."

- [ ] **Step 1: Write the failing tests**

```ts
it("with the vault off a title is sent and shown as typed", ...);
it("a sealed title opens to the typed text and the api only ever receives ciphertext", async () => {
  expect(api.bodies.join("\n")).not.toContain("Sleep and exam anxiety");
});
it("a 200-character Hindi title seals and opens", ...);
it("a locked vault shows Locked title, never ciphertext (Review Focus 1)", ...);
it("a title under an unknown key shows This title cannot be opened", ...);
it("sealPlainTitles seals every plain project and document title once; a second run patches nothing", ...);
it("a plain title written later by an older tab is sealed on the next pass (Review Focus 2)", ...);
it("the export's folder names and the Word and LaTeX file names come from the opened titles", ...);
it("a v1 backup import and an imported PDF send sealed titles", ...);
it("the writing record shows opened document titles", ...);
```

- [ ] **Step 2: Run** `pnpm --filter @appuscholar/web test -- titles vaultExport word latex importV1 import vaultMigrate writingRecord` → FAIL.
- [ ] **Step 3: Implement**; regenerate the dictionaries.
- [ ] **Step 4: Run** `pnpm --filter @appuscholar/web test` → PASS.
- [ ] **Step 5: Register row D-S2-40**, status `approved` (OJ, 2026-10-20, D3): v1 kept no server copy; the vault design (2026-10-16) kept titles readable; v2 seals project and document titles in the browser, lists open after unlock; pinned by `titles.test.ts`.
- [ ] **Step 6: Commit** `git commit -m "feat(web): project and document titles are locked in the vault; existing titles are sealed after unlock"`

---

### Task 6: Routes, the project shell, and the end of `project.stage`

**Files:**
- Create: `apps/web/app/(app)/start/page.tsx`, `apps/web/app/(app)/p/[projectId]/layout.tsx`, `apps/web/app/(app)/p/[projectId]/page.tsx`, `apps/web/app/(app)/p/[projectId]/[stage]/[[...tab]]/page.tsx`, `apps/web/components/frame/{ProjectShell,AppHeader,PlaceHeader,StagePlace}.tsx`, `apps/web/lib/frame/{places,landing}.ts`
- Modify: `apps/web/app/(app)/page.tsx` (Landing), `apps/web/app/(app)/projects/page.tsx` (the list, Task 8), `components/workspace/Workspace.tsx` (its project, documents, open document, flush, switch question, import, capture hash and sync receiver move into `ProjectShell`; the file is deleted), `WorkspaceContext.tsx` (becomes `ProjectContext`, value type `ProjectValue`: `activeTool`, `showTool`, `dock`, `dockShow`, `currentStage` removed; `place` and `go(href)` added), `lib/tools.ts` (`STAGE_EMOJI`, `nextStageTool`, `prevStageTool`, `STAGE_FIRST_TOOL` removed), `lib/vault/export.ts` (index.json)
- Delete: `components/workspace/{Sidebar,SidebarDrawer,StageGuide,ProjectBar,Dock}.tsx`, `dialogs/{StageIntro,Projects,SaveAsProject}.tsx`
- Test: `apps/web/test/{places,landing,noProjectStage,projectShell}.test.ts(x)`; `tools.test.ts`, `dock.test.tsx` removed with their code; `vaultExport.test.ts`, `workspaceDocSwitch.test.tsx` → `projectShell.test.tsx`

**Interfaces:**
- `export const PLACE_TABS: Record<StageKey, readonly string[]> = { idea: [], lit: ["find", "reading", "compare", "citations"], design: [], collect: [], writing: [], review: [] }`.
- `homeHref(id: string): string` → `/p/<id>`; `placeHref(id: string, stage: StageKey, tab?: string): string` → `/p/<id>/<stage>` or `/p/<id>/<stage>/<tab>`.
- `parsePlace(stage: string, rest: string[] | undefined): { stage: StageKey; tab: string | null; rest: string[] } | null`: a stage outside `STAGE_ORDER`, or a tab outside its `PLACE_TABS`, is null (the page calls `notFound()`); a stage with tabs and none given takes its first tab.
- `landingPath(i: { projectIds: string[]; activeProjectId: string | null }): string`: no projects → `/start`; an active project in the list → its home; otherwise `/projects`. `/?import=1` goes to `/projects?import=1` (the v1 import dialog opens there). `/#capture=` goes to `/add` with the hash (Task 20; until then, to `/projects` with the hash, where `ProjectShell`'s `CaptureHash` keeps working).
- Opening a project (list, switcher, first run): `PATCH /me/active-project`, then `router.push(homeHref(id))`. A reload keeps the URL. Settings `toolTab`, `stageGroupsCollapsed`, `sidebarCollapsed` and `dockW` are no longer read or written (the API keeps accepting them).
- Scratch space opens at `/p/<scratchProjectId>/writing` (decision 4).
- The six readers of `project.stage` switch in this task (impact map D1a): `Workspace.tsx:168` (first tool), `:259` (jump on switch), `:314` (`currentStage` for `Sidebar.tsx:43` and `Popout.tsx:85`), `ProjectBar.tsx:21`, `Projects.tsx:76`, `lib/vault/export.ts:6,84` (index.json now carries `format: 2` and `stages: Record<StageKey, StageState>` instead of `stage`). The Save-as stage select (the only writer) goes with its dialog.
- `AppHeader`: the wordmark (link to `/projects`); the project switcher (the opened title, a menu of projects and "All projects"); the vault pill: "Locked to you" (unlocked), "Vault locked" (opens the passphrase), "Vault off"; the AI pill with a gold border: "AI: {provider}, your key" or "AI: add your key" (opens the key dialog); Help; the account menu (Export all my work, AI provider and key, Change passphrase, Sign out, Delete my account). The version pill moves into Help.
- `PlaceHeader`: "{project title} / {stage name}" (the title links home), the place's tabs, "Open my document" (Task 11), "Open in a new window" (Task 13), and the question as a collapsible strip (draft §5): "Your question" closed by default, open it to see the topic and the feasibility verdict, with Edit (→ idea).
- Wave A residual (LATER): switching project while a blob holds an unsent value keeps it in the held-blobs registry and toasts `blob_switch_held` "Some changes are waiting for your passphrase. They are kept and saved once you unlock."

- [ ] **Step 1: Write the failing tests**

```ts
it("landingPath: a new student goes to first run, a returning one to the active project's home, otherwise the list", () => {
  expect(landingPath({ projectIds: [], activeProjectId: null })).toBe("/start");
  expect(landingPath({ projectIds: ["a", "b"], activeProjectId: "b" })).toBe("/p/b");
  expect(landingPath({ projectIds: ["a"], activeProjectId: "gone" })).toBe("/projects");
});
it("parsePlace accepts lit/find, gives Literature its first tab, refuses lit/matrix and an unknown stage", ...);
// noProjectStage.test.ts: scan apps/web/{app,components,lib}/**/*.{ts,tsx}
it("no web code reads a project's stage (W29)", () => { expect(hits(/\b(project|proj|p|r\.project)\??\.stage\b/)).toEqual([]); });
it("the export's index.json carries format 2 and derived stages, no stage", ...);
it("a reload on /p/<id>/lit/find opens that place", ...);
it("switching project with an unsaved document asks Switch anyway?", ...);   // ported from workspaceDocSwitch
it("switching project with a held blob value keeps it and says so", ...);
```

- [ ] **Step 2: Run** `pnpm --filter @appuscholar/web test` → FAIL.
- [ ] **Step 3: Implement**; delete the listed files and their tests' cases that only pinned them.
- [ ] **Step 4: Run** `pnpm --filter @appuscholar/web test && pnpm --filter @appuscholar/web typecheck` → PASS.
- [ ] **Step 5: Register row D-S2-38**: v1's stage guide, stage intro, sidebar tool list, stage counter and project-bar stage badge (W10, W29) → stages as places with their own states, a project home and a project list (OJ, 2026-10-20, D1); proposed, awaits Dr. Sharma (copy, layout). Tasks 7, 8 and 14 add to this row.
- [ ] **Step 6: Commit** `git commit -m "feat(web): routes for places, the project shell and header; nothing reads project.stage any more (W10, W29)"`

---

### Task 7: The project home

**Files:**
- Create: `apps/web/components/frame/{ProjectHome,QuestionCard,StageRows,SuggestedNext}.tsx`, `apps/web/lib/frame/{homeFacts,suggest,useProjectWork}.ts`; `V2_STRINGS` keys below
- Test: `apps/web/test/{suggest,homeFacts}.test.ts`, `apps/web/test/projectHome.test.tsx`

**Interfaces:**
- Consumes: `GET /projects?include=work` (Task 3), `stageStates` (Task 4), `useTitle` (Task 5), `useProjectBlob`.
- `useProjectWork(): { work: ProjectWork[] | null; reload(): Promise<void> }`: one request for all projects.
- `HomeFacts = { question: string; people: string; time: string; limits: string; field: string; verdict: string | null; kept: number; read: number; highlights: number; cards: number; draftWords: number }`; `homeFacts(b: { idea: IdeaIntake | null; citations: CitationEntry[] | null; shelfIndex: ShelfIndex | null; apNotes: ApNotes | null }, draftWords: number): HomeFacts`: question, people, time, limits are `idea.topic`, `idea.resources`, `idea.timeframe`, `idea.constraints`; verdict from `idea.read` (Task 9); kept = library length; read = papers with a highlight count above 0 or an `ap_notes` entry with any stage or card text (B2 and B3 count by paper id); cards = `ap_notes` entries with any card field.
- `suggestNext(f: HomeFacts): { key: string; vars?: Record<string, number>; to: { stage: StageKey; tab?: string } }`, first match wins:
  1. no question → `next_question` "Write down what you want to study." → idea
  2. no verdict → `next_feasibility` "Check whether your question is doable before you search." → idea
  3. kept 0 → `next_find` "Find papers for your question and keep the ones that fit." → lit/find
  4. read < min(3, kept) → `next_read` "Read {n} more of your kept papers, then look for the gap they leave open." (n = min(3, kept) − read) → lit/reading
  5. kept ≥ 2 and cards < 2 → `next_compare` "Compare your papers side by side." → lit/compare
  6. otherwise → `next_write` "Write from your papers in your document." → writing
  Under it, `next_sub` "You have kept {kept} papers and read {read}. You can work on any stage below at any time." Button labels: "Open your question", "Find papers", "Open reading list", "Open Compare", "Open my document".
- Stage rows (canvas Main): name (`stage_name_<key>`: "Idea", "Literature", "Design and ethics", "Collection and analysis", "Writing", "Review"), tools line (canvas text), detail (`detail_idea` "Question set. Feasibility read: {verdict}." or "No question yet."; `detail_lit` "{kept} papers kept, {read} read, {highlights} highlights, {cards} paper cards"; `detail_writing` "Draft of {words} words"; unbuilt stages `detail_not_built` "Not built yet. You can plan it in your document."), state chip (`state_not_started` "Not started", `state_started_early` "Started early", `state_in_progress` "In progress", `state_ready` "Ready", `state_reopened` "Reopened"; chip colours from the canvas tokens, the word always shown), action (Continue for in progress, started early and reopened; Open for not started; Reopen for ready) and a More menu with "Mark ready" or "Not ready yet" (POST or DELETE the mark; no confirm; reversible).
- Question card (canvas): "Your question", Edit (→ idea), the four facts as People, Time, Limits, Field; the verdict line.
- "Take your work out" card: canvas text, "Export project" (Task 12).
- Loading: `PanelLoading`; vault locked: `home_locked` "This project is locked. Enter your passphrase to open it." with an Unlock button.
- Not built here: the canvas's "Recent work" card (nothing records activity; Deferred). "Needs your attention" arrives in Task 24 and is absent until then.

- [ ] **Step 1: Write the failing tests**

```ts
it.each(SUGGEST_CASES)("suggestNext: %s", (_name, facts, key, to) => { expect(suggestNext(facts)).toMatchObject({ key, to }); });
it("the home reads every project's states from one request", async () => {
  expect(fetchSpy.mock.calls.filter(([u]) => /\/projects\?include=work$/.test(u))).toHaveLength(1);
  expect(fetchSpy.mock.calls.filter(([u]) => /\/projects\/[^/]+\/blobs$/.test(u))).toHaveLength(0);
});
it("Mark ready, then an edit in that stage, shows Reopened", ...);
it("stages not built yet say so in words", ...);
it("a locked vault shows the unlock sentence, never empty cards", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): the project home: the question, a suggested next step, six stages with their states"`

---

### Task 8: All projects, six states each

**Files:**
- Create: `apps/web/components/frame/ProjectList.tsx`, `apps/web/lib/frame/stateSummary.ts`
- Test: `apps/web/test/projectList.test.tsx`, `apps/web/test/stateSummary.test.ts`

**Interfaces:**
- One `GET /projects?include=work`. A row: the opened title (`useTitle`), "{field}. Edited {date}." (`list_meta`), six bars with the short names "Idea", "Literature", "Design", "Analysis", "Writing", "Review" (canvas Projects), and an `aria-label` from `stateSummary`.
- `stateSummary(s: Record<StageKey, StageState>, t): string`: groups in the order ready, in progress, started early, reopened, each "{stages joined with "and"} {state}", joined with "; "; not-started stages left out; all not started → "Nothing started yet". Example: "Idea ready; literature and writing in progress; design started early".
- Legend: Ready, In progress, Started early or reopened, Not started.
- Header line: vault unlocked "Unlocked. Titles are locked to you."; locked "Titles are locked. Enter your passphrase to see them." with Unlock (the rows and their states still show, each title "Locked title"); vault off "Vault off. Titles are readable on the server."
- "New project" → `/start`. Scratch space as the last row, "Documents not in a project" → `/p/<scratchId>/writing`. Finished projects (status complete) last, with "Finished".

- [ ] **Step 1: Write the failing tests**

```ts
it("twenty projects make one request", ...);
it("each row's bars and spoken summary follow stageStates", ...);
it("stateSummary groups stages by state in a fixed order", () => {
  expect(stateSummary({ idea: "ready", lit: "in-progress", design: "started-early", collect: "not-started", writing: "in-progress", review: "not-started" }, t))
    .toBe("Idea ready; literature and writing in progress; design started early");
});
it("a locked vault lists the projects with Locked title and their states (Review Focus 1)", ...);
it("New project opens first run", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): all projects with six stage states each, from one request"`

---

### Task 9: First run and the Idea place

**Files:**
- Create: `apps/web/components/frame/FirstRun.tsx`, `apps/web/components/places/IdeaPlace.tsx`, `apps/web/lib/frame/ideaRead.ts`
- Modify: `apps/web/lib/blobs/kinds.ts` (`IdeaIntakeSchema` gains `read: z.looseObject({ text: str, at: str }).optional()`), `components/tools/IdeaPanel.tsx` (its form and action move into `IdeaPlace`; the file is deleted)
- Test: `apps/web/test/{firstRun,ideaPlace}.test.tsx`, `apps/web/test/ideaRead.test.ts`; `ideaPanel.test.tsx`, `ideaPanelHeld.test.tsx` move to `ideaPlace.test.tsx`

**Interfaces:**
- Fields are v1's four, so the prompt is unchanged (decision 3): `topic` "Your idea" (canvas hint "Write it roughly, in your own words. We will sharpen it together into a question you can actually answer."), `resources` "Who would you study, and what can you use?", `timeframe` "How much time do you have?", `constraints` "What limits you: approvals, rules, anything else?". Heading "What do you want to study?". Button "Check if it is doable"; note "Uses your AI key. Takes about 10 seconds." With no AI key the button opens the key dialog.
- The read: `buildIdeaPromptV2` through `useCallAI` (label "checking whether my project idea is realistic"), stored as `idea_intake.read = { text, at }`.
- `parseIdeaRead(text: string): { lines: Array<{ area: string; rating: "Low" | "Medium" | "High"; why: string }>; verdict: string | null } | null`: a line matches `^([^:]{3,60}):\s*(Low|Medium|High)\.\s*(.*)$`, the verdict `^Verdict:\s*(.+)$`; fewer than 3 lines → null (the text is shown as it came). The rating word is shown as the engine wrote it (the canvas's "Strong" is not an engine value).
- Read panel: gold border; label `idea_read_label` "AI read of your idea. Check it against your own judgement."; in first run: "Save as my project" and "Edit the question"; in the Idea place: "Put in my document" (`requestInsert` as AI text, as v1's Tab did) and "Check again".
- "Save as my project": a title field prefilled with the topic's first 60 characters (cut at a word); creates the project with a sealed title (Task 5), PUTs `idea_intake` with the read, seeds the first document, sets it active, goes home. Under it: "After saving, every stage of your project is open. Most people find papers next."
- The Idea place `/p/<id>/idea`: the same form on the project's `idea_intake`; `PanelLoading` while it loads, including before `/me` answers (wave A LATER T18).

- [ ] **Step 1: Write the failing tests**

```ts
it("the four fields are v1's idea_intake keys and the prompt is buildIdeaPromptV2's", ...);
it("a five-line read shows each area with its rating, then the verdict", () => {
  expect(parseIdeaRead("Time: Medium. A semester is enough.\n...\nVerdict: Go ahead, with two changes.")!.lines[0]).toEqual({ area: "Time", rating: "Medium", why: "A semester is enough." });
});
it("an unparsable read is shown as it came", ...);
it("Save as my project creates the project, its intake with the read and a first document, then opens home", ...);
it("the Idea place shows the loading sign, not empty boxes, before /me answers", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-39**: v1's Idea & Feasibility panel (form, Assess button, reply in the suggestion pane) → first run and the Idea place, the read shown area by area and kept with the project; the canvas's "What would you change or compare?" is not built (no engine field); proposed, awaits Dr. Sharma (copy, layout).
- [ ] **Step 6: Commit** `git commit -m "feat(web): first run from a rough idea to a project, and the Idea place"`

---

### Task 10: The places: Literature for now, Writing, stages not built; hide what is not built

**Files:**
- Create: `apps/web/components/places/{LitPlace,WritingPlace,NotBuilt}.tsx`
- Modify: `components/frame/StagePlace.tsx`, `components/tools/shelf/ShelfDialog.tsx` (an `inline` mode: its body without the dialog), `components/tools/analyse/AnalysePanel.tsx` (no `ap-lectures`, no lesson mode button)
- Test: `apps/web/test/places.test.tsx`

**Interfaces:**
- `LitPlace` tabs (`role=tablist`, each a link): Find → `ResearchPanel`; Reading list ({n}) → the shelf inline, then `AnalysePanel` under "Read a paper"; Compare → the shelf's `Matrix` and `Across`; Citations ({n}) → `CitePanel`. B2 and B3 replace each tab's content.
- Each Literature tab ends with a "Suggested next" line, rendered by `LitPlace` under whichever content the tab holds (so B2's tabs keep it): Find "Next: open your reading list and read a paper you kept."; Reading list "Next: compare the papers you have read."; Compare "Next: find the gap your papers leave open, then write."; Citations "Next: put your reference list in your document."
- `WritingPlace`: the document at full width with an aside of Chat and Research helpers (until Task 32).
- `NotBuilt` for design, collect and review: "Not built yet. The tools for this stage come in a later release. You can plan it in your document now." and "Open my document".
- Hidden: "All lectures" and "Lesson on this paper" (W23), the project bar's Backup button (gone with the bar), every tool that renders `StubPanel` (style, words, design, stats, qual, close, slides).

- [ ] **Step 1: Write the failing tests**

```ts
it("Literature has four tabs in the order Find, Reading list, Compare, Citations", ...);
it("each Literature tab ends with its suggested next line", ...);
it("Design and ethics says Not built yet and offers the document", ...);
it("no lecture, lesson, backup or stub tool is rendered in any place (W23)", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-44**: buttons for features that are not built (v1's lectures and lessons, the backup, the stage 3 to 6 tool tabs) are hidden; a stage not built says so; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): the Literature, Writing and not-yet-built places; unbuilt features are hidden (W23)"`

---

### Task 11: The document beside any stage

**Files:**
- Create: `apps/web/components/frame/DocumentBeside.tsx`, `apps/web/components/document/DocAside.tsx`
- Modify: `components/frame/ProjectShell.tsx` (`docOpen`, `openDocument`, `closeDocument`, `requestInsert`), `components/document/DocumentCard.tsx` (Close; the AI pane in `DocAside`), `lib/ai/suggestion.tsx` and `lib/ai/actions.ts` (no `dockShow`), `lib/popout/sync.ts` (the receiver inserts through `requestInsert`), `lib/cite/{actions,quote}.ts`, `lib/research/library.ts` (`insertResult`)
- Test: `apps/web/test/documentBeside.test.tsx`; `suggestionProvider.test.ts`, `popoutSync.test.ts`, `citeInsert.test.ts`

**Interfaces:**
- `ProjectValue.docOpen: boolean`; `openDocument(): void`; `closeDocument(): Promise<boolean>`: `flushOpen()` first; a failed save asks "Close anyway?" (`doc_close_ask` "Your last changes to {title} are not saved yet.", Stay / Close anyway).
- `requestInsert(run: (editor: Editor) => void): Promise<boolean>`: editor mounted → run now; otherwise open the document, wait for its editor (at most 10,000 ms, plus the unlock if one is asked), run once. A cancelled unlock, an unreadable document or the timeout → false and the toast `insert_doc_closed` "Your document did not open, so nothing was inserted."
- `docBeside` and `docW` (Task 3) remember whether the document is open beside non-writing places and its width (360 to 900, default 520). The Writing place always shows it.
- The AI pane (Continue, Improve, Tab, Accept) lives in `DocAside`, beside the text it acts on, in every place.

- [ ] **Step 1: Write the failing tests**

```ts
it("Put in my document with the document closed opens it and inserts once", ...);
it("a cancelled unlock inserts nothing and says so (Review Focus 4)", ...);
it("closing the document saves first; a failed save asks Close anyway?", ...);
it("a pop-out's insert lands in the main window's document even when it is closed there", ...);
it("the place the student is in does not change when an AI suggestion arrives", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-41**: v1's three columns with the editor always mounted → the document beside any stage, opened on demand; an insert opens it; proposed, awaits Dr. Sharma (layout).
- [ ] **Step 6: Commit** `git commit -m "feat(web): the document opens beside any stage; inserts open it when it is closed"`

---

### Task 12: One export place

**Files:**
- Create: `apps/web/lib/export/projectExport.ts`, `apps/web/components/export/ExportDialog.tsx`
- Modify: the per-tool download buttons become "Export" links that open the dialog pre-selected: `research/ResearchPanel.tsx` (`rs-csv`), `shelf/ShelfDialog.tsx` (matrix CSV, shelf backup), `analyse/Across.tsx` (cards CSV), `analyse/Card.tsx` (one card), `cite/CiteShare.tsx` (library file); `lib/vault/export.ts` (wave A LATER T6: catch only `JSON.parse`'s `SyntaxError`, by wrapping the parse)
- Test: `apps/web/test/{projectExport,exportDialog}.test.ts(x)`, `vaultExport.test.ts`

**Interfaces:**
- `export type ExportPart = "documents" | "question" | "citations" | "search" | "notes" | "compare" | "record" | "aiuse" | "readingBackup"`; all ticked by default except `readingBackup`.
- `exportProject(d: ProjectExportDeps, parts: ExportPart[], o: { style: CitationStyle; now: Date; lastSearch: RsPaper[] | null }): Promise<Blob>`, zip paths:
  - `documents/<title>.doc` and `.html` (sources under `documents/sources/`)
  - `question.txt` (the four fields; the stored read after "AI read:")
  - `citations/library.json` (v1's `exportLibrary` file) and `citations/references.txt` (the reference list in `o.style`, plain text)
  - `search/kept-papers.csv` (`rsCsvText` over the kept papers) and `search/last-search.csv` when this session ran a search
  - `notes/<paper title>.txt` (highlights with their page, the student's own words, AI text prefixed "AI:")
  - `compare/table.csv` (the matrix cells) and `compare/paper-cards.csv` (v1's cards CSV)
  - `writing-record.txt`, `ai-use-statement.txt` (`aiuBuild`)
  - `reading-list-backup.json` (the shelf backup, the only way to move PDF text to another account)
- File name `appuscholar-<zipName(title)>-<localDay(now)>.zip`. One `POST /me/export-audit` per download.
- `openExport(preselect?: ExportPart)` on `ProjectValue`: the home card, the account menu and every "Export" link call it; a link ticks only its part.
- Copy from the Export canvas, verbatim, except the citations line: "Library file and reference list (text)" until Task 38 adds RIS and BibTeX. The account menu's "Export all my work" (wave A's zip of every project) stays.

- [ ] **Step 1: Write the failing tests**

```ts
it("the zip holds every ticked part at its path and nothing else", ...);
it("an unticked part is absent", ...);
it("the reference list follows the chosen style", ...);
it("reading notes mark AI text as AI", ...);
it("with no search this session the search list is the kept papers", ...);
it("a per-tool Export link opens the dialog with only its part ticked (W11)", ...);
it("one audit row per download", ...);
it("the account export lists a blob that is not JSON as unreadable, and rejects on other errors", ...); // T6
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-42**: v1's eleven downloads in eleven places (rows D-S2-9, D-S2-11, D-S2-13, D-S2-14 describe four) → one export place per project, with an Export link in each tool; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): one export place for every file of a project; tools link to it"`

---

### Task 13: Any place in its own window; the pop-out's write limits

**Files:**
- Modify: `apps/web/lib/popout/mode.ts`, `lib/popout/sync.ts`, `app/(app)/popout/page.tsx` (redirect only), `components/frame/PlaceHeader.tsx` ("Open in a new window")
- Delete: `components/popout/Popout.tsx`
- Test: `apps/web/test/{popout,shelfPopout}.test.tsx`, `popoutSync.test.ts`

**Interfaces:**
- A window is a pop-out when its URL carries `?window=1`: `isPopout(): boolean`; `popoutStage(): StageKey | null` from the path.
- `blobWritable(kind: BlobKind): boolean`: not a pop-out → true; a pop-out → `stageOfKind(kind)?.stage === popoutStage()`. A Literature window now writes `refcheck_cache` (it could not before) and every Literature kind; an Idea window writes `idea_intake` only. A pop-out never mounts the document; its inserts go over the channel to the main window's `requestInsert`.
- Old links: `/popout?tool=cite` → `/p/<active>/lit/citations?window=1`; `tool=research` → `/p/<active>/lit/find?window=1`; anything else → `/projects`.

- [ ] **Step 1: Write the failing tests**

```ts
it("a Literature window writes refcheck_cache", ...);
it("an Idea window cannot write citations", ...);
it("a pop-out never shows the document", ...);
it("old pop-out links land on the matching tab in a new-window place", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-43** (amends D-S2-17): any place opens in its own window; it writes only its own stage's kinds and never the document; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): any place in its own window, writing only its stage's data"`

---

### Task 14: The frame on a phone

**Files:**
- Modify: `apps/web/app/globals.css` (the frame's grid), `components/frame/{AppHeader,ProjectHome,PlaceHeader,DocumentBeside,ProjectList,FirstRun}.tsx`
- Create: `apps/web/e2e/frame-responsive.spec.ts` (replaces `phase2-responsive.spec.ts`)

**Interfaces:**
- At `PHONE_QUERY` (`(max-width: 700px)`): the header is the wordmark, the vault pill and a Menu button (project switcher, AI key, Help, account); the home follows the Phone canvas in order: project button, "Your question" (a collapsed `<details>`), Suggested next, "Where this project stands" (name, detail, chip per row), Needs your attention, Export project; place tabs scroll sideways; the document opens full screen with "Back to {place}".
- 16 px side gutter; no horizontal page scroll; touch targets at least 44 px.

- [ ] **Step 1: Write the failing e2e** (375x812): "the home has no horizontal scroll", "the place tabs are all reachable", "the document opens full screen and Back returns to the same tab", "first run and the project list fit the width".
- [ ] **Step 2: Run** `pnpm --filter @appuscholar/web e2e -- frame-responsive` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): the frame on a phone"`

---

### Task 15: B1 journey e2e and walk-through sheet

**Files:**
- Modify: `apps/web/e2e/stage2-idea-literature.spec.ts` (navigation through first run, home and places; the stage-intro, stage-counter and Next steps go; the final kinds list stays), `phase2-walkthrough.spec.ts` (sidebar and stage-intro steps replaced), `phase3a-vault.spec.ts` (titles)
- Create: `docs/walkthroughs/wave-b1.md`; Modify: `docs/walkthroughs/stage-2.md` (rows 1 and 12)

**Interfaces:**
- e2e additions: first run → home with six states; Mark ready on Idea, then an edit → Reopened; the list makes one `include=work` request; the server-blind check (`stage2-idea-literature.spec.ts` final step) also reads `projects.title` and `documents.title` and finds no plaintext title; "Put in my document" from Literature with the document closed; the export zip holds `question.txt` and `citations/library.json`; a Literature window runs the Crossref check and writes `refcheck_cache`.
- `wave-b1.md`: the fix-wave-a sheet's header (site, what you need, record line with the build), then these rows, each Do / Expect / Result:

| # | What | Do | Expect |
|---|---|---|---|
| 1 | build | Help, read the version | "Version <first 7 of the merge commit>" |
| 2 | first run | New account, after the terms: type the stage-2 idea in the four fields, Check if it is doable | Five rated lines, each starting with its area, then the verdict, in a gold-edged panel with its label |
| 3 | project | Save as my project | The home: your question card, a suggested next step, six stages, Idea in progress, the rest not started |
| 4 | stage states | More on the Idea row, Mark ready; then edit Timeframe in the Idea place; back home | Ready, then Reopened |
| 5 | parallel | On a second project with no idea written, add a paper to the library from Literature, Find (today's Research panel) | Literature reads "Started early"; on the first project it reads "In progress" |
| 6 | list | All projects | One line of six states per project; the spoken summary reads the states |
| 7 | titles (developer) | On Neon: `select title, title_key_version from projects where user_id = '<id>'` | Ciphertext and key version 1 or more; the app shows the name |
| 8 | locked titles | Reload, cancel the passphrase | "Locked title" everywhere, the six states still show, no ciphertext; after the passphrase the names return |
| 9 | old account | On the walk account from wave A, unlock | Its titles become ciphertext on the server (row 7 query) and read normally in the app |
| 10 | Literature | Open each tab | Find, Reading list, Compare, Citations reach today's tools; each ends with its next line |
| 11 | document | From Citations, Insert reference list with the document closed | The document opens beside and the list goes in once |
| 12 | export | Home, Export project, Download zip | The zip holds the parts listed in Task 12 |
| 13 | own window | Literature, Open in a new window, Check details against Crossref there | It works there; the main window's Citations shows the result |
| 14 | phone | 375 px wide: home, list, a place, the document | Canvas order, no sideways scroll, Back returns |
| 15 | not built | Open Design and ethics | "Not built yet…" and Open my document; no lecture, lesson or backup button anywhere |
| 16 | re-score | Score H1, H4, H5, H6, H8 (draft §9) on this build | Each score written in the walk notes beside the old one |

- [ ] **Step 1: Write the e2e additions** → `pnpm --filter @appuscholar/web e2e` → FAIL until Tasks 2 to 14 are in, then PASS.
- [ ] **Step 2: Write the sheet** and update `stage-2.md`.
- [ ] **Step 3: Commit** `git commit -m "test(web): the frame in the journey e2e; walk-through sheet wave-b1.md"`

---

### Task 16: B1 release: suites, migration, API, web, live walk

**Files:**
- Modify: `apps/web/playwright.config.ts`, `scripts/deploy-vercel.sh`, `apps/web/test/deployScript.test.ts` (wave A LATER T2)

- [ ] **Step 1: Tooling minors (T2), test first.** `reuseExistingServer: !process.env.CI && !process.env.GITHUB_SHA` (a pill check never runs against a reused server); `deploy-vercel.sh` exits 6 "cannot reach origin" when `git fetch` fails; each `deployScript.test.ts` case builds its own temp repo (order-free). Commit `fix(tooling): wave A's deploy and e2e minors`.
- [ ] **Step 2: Full local suites** (`lsof -iTCP:8788 -iTCP:3000 -iTCP:5433` empty): `pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r typecheck && pnpm --filter @appuscholar/core test:golden && pnpm -r test && pnpm --filter @appuscholar/web build && pnpm --filter @appuscholar/web e2e` → all pass.
- [ ] **Step 3: PR and CI.** Push `wave-b1`; PR into `phase-3a-vault` (body: the slice, rows D-S2-38 to D-S2-44, "migration 0006 by hand before the API; never roll the web back past B1 once titles are sealed"). `checks`, `e2e` and `golden-exact` green. Merging needs OJ.
- [ ] **Step 4: Neon backup, then the migration by hand** (OJ's shell, prod `DATABASE_URL` never printed): `pg_dump "$DATABASE_URL" -t projects -t documents -f backup-frame-$(date +%F).sql`, then `pnpm --filter @appuscholar/db db:migrate`. Check `\d projects` lists `stage_marks`, `deks`, `title_key_version`, and `\d documents` lists `title_key_version`.
- [ ] **Step 5: Deploy the API** from the full clone: `git fetch origin && git checkout --detach origin/phase-3a-vault && scripts/deploy-vercel.sh api`. Check `/health`, and that the live fix-wave-a web still lists projects and saves a title (old shapes accepted).
- [ ] **Step 6: Deploy the web**: `scripts/deploy-vercel.sh web`; the pill reads the merge commit.
- [ ] **Step 7: Live walk** of `wave-b1.md` with OJ (OJ types the passphrase and key). A FAILED row is fixed, redeployed and re-walked.
- [ ] **Step 8: Hand-off.** The walk result, the re-scores and the rows awaiting Dr. Sharma go into the walk notes.

---

# Slice B2: Literature and Keep

### Task 17: A stable paper id, and the client migration that gives every stored paper one

**Files:**
- Create: `apps/web/lib/papers/{ids,migrate}.ts`
- Modify: `apps/web/lib/blobs/kinds.ts` (`CitationEntrySchema` gains `pid`, `rl: z.boolean()`, `abstract`, `oa`, `ack: z.array(str)`, all optional; `ShelfIndexSchema` entries gain `pid`; `ApNoteSchema` gains `pid`, `take`, `summary`, `checks`, `cells: z.record(str, str)`, `movedTo`, all optional), `lib/cite/useLibrary.ts` (`update` returns `withPids(fn(prev))`), `lib/shelf/actions.ts` (`addFiles` and `restoreShelf` set `pid` through `linkShelf`), `components/places/LitPlace.tsx` (runs `ensurePaperIds` when Literature opens)
- Test: `apps/web/test/{papersIds,papersMigrate}.test.ts(x)`

**Interfaces:**
- `newPid(): string`: `"k" + Date.now().toString(36) + 4 characters of [a-z0-9]` (fits the shelf id pattern `[A-Za-z0-9_-]{1,64}`). A generated id, not the DOI, so filling a DOI later never changes it; the DOI is used to match.
- `withPids(lib: CitationEntry[]): CitationEntry[]`: the same array when no entry lacks a `pid`.
- `paperMatch(a, b): boolean`: same `retrNormDoi(doi)` when both have one; else `apSquash(title)` equal, at least 20 characters, and the same year when both have one.
- `linkShelf(index: ShelfIndex, lib: CitationEntry[]): ShelfIndex`: a shelf entry without `pid` takes the matching library entry's (`doi` from wave A, then title), else `newPid()`; existing pids stay.
- `noteKey(pid: string): string` → `"p:" + pid`.
- `rekeyNotes(notes: ApNotes, papers: Array<{ pid: string; title: string }>): ApNotes`: an `a…` note whose `title` matches a paper's title is merged into `p:<pid>` (per stage: one with `mine` text wins, else the first; per card field: the non-empty one wins, the first on a tie); the old key stays, with `movedTo`.
- `cellsToNotes(...)`: each shelf paper's matrix `cells` are copied into `notes[p:<pid>].cells` where that is absent (one `shelf_paper` read at a time). Compare (Task 22) reads and writes only there; the shelf copy stays as it was.
- `ensurePaperIds(projectId: string, d: PaperMigrateDeps): Promise<"done" | "locked" | "broken" | "busy">`: citations, then `shelf_index`, then cells, then `ap_notes`, each through the versioned blob client (a 409 re-reads and replays); a second run sends no PUT; never in a pop-out; waits for unlock; vault off runs at once; never the `/rewrite` route.
- Import paths: a library file import and the classic sources go through `useLibrary.update`, so they get pids; `mergeLibrary` keeps v1's drop of authorless entries (parity).

- [ ] **Step 1: Write the failing tests**

```ts
it("every library entry gets a pid once and keeps it across saves", ...);
it("a shelf paper with the library entry's DOI takes its pid; one matched by title too; an unmatched one gets its own", ...);
it("a note keyed by title and length moves to p:<pid>; the old key stays", ...);
it("the same paper read as an abstract and as a PDF ends on one note with both stages", ...);
it("matrix cells are copied to the paper's note once", ...);
it("a second run writes nothing", ...);
it("it resumes after a run that stopped after the citations (Review Focus 3)", ...);
it("vault off migrates the same; a locked vault runs nothing until unlock", ...);
it("a library file import and the classic sources get pids", ...);
it("an entry an older tab saves without a pid gets one on the next save", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter @appuscholar/web test` → PASS.
- [ ] **Step 5: Register row D-S2-45** (`noted`): v1 knew a source by its position and title, a shelf paper by a random id and notes by title plus length; v2 gives each kept paper one id that joins the library, reading list, notes, cards and Compare.
- [ ] **Step 6: Commit** `git commit -m "feat(web): one stable id per kept paper, given to stored papers by a resumable client migration"`

---

### Task 18: Find, and one Keep per paper

**Files:**
- Create: `apps/web/components/literature/{FindTab,FindResult,FindFilters}.tsx`, `apps/web/lib/papers/keep.ts`
- Modify: `apps/web/lib/research/library.ts` (`addResult` stores `pid`, `rl`, `abstract`, `oa`; no `url` when a DOI exists), `components/places/LitPlace.tsx` (Find tab); delete `research/ResearchPanel.tsx`, `research/ResultCard.tsx` (the hooks `useSearch`, `extras`, `status` stay)
- Test: `apps/web/test/{keep,findTab}.test.ts(x)`; `research*.test.tsx` moved onto `FindTab`, their fetch doubles reject any URL not recorded (wave A LATER T10)

**Interfaces:**
- `keepEntry(e: CitationEntry, d: KeepDeps): { state: "kept" | "already"; pid: string }`: "already" when a library entry `paperMatch`es (it returns that entry's pid); otherwise it adds `e` with a new `pid` and `rl: true`. The paste box (Task 19) and the bookmark (Task 20) keep through it.
- `keepResult(p: RsPaper, d: KeepDeps): { state: "kept" | "already"; pid: string }`: `keepEntry` of the v2 entry (`rsEntryFromResultV2`) with `abstract: p.abstract.slice(0, 4000)`, `oa` (OpenAlex's open-access URL) and `url: ""` when a DOI exists (wave A LATER T8), then wave A's Crossref fill.
- `FindResult` (canvas Find): title; "Authors. Year. Journal. Cited n times."; badges (Free PDF, the kind of study, the sample); "Why it fits (AI): …" when Rank by fit is on; one primary button, "Keep" or "Kept"; a More menu: Put a citation in my document, Open the paper, Get the free PDF, Papers connected to this one, Quick read, Read it now (keeps the paper if it is not kept, then opens the Reading list here and the reader in B3; this replaces Research's "Analyse this paper").
- Above the results: `find_count` "{total} papers. Showing {shown} that match your filters.", the Sort select and an "Export" link (part `search`) (W11).
- Search: label "Searching for papers on"; the AI terms as chips under "Also searching, suggested by AI from your question:" (today's generator, ticking unchanged); filters in an aside "Narrow the results" (Kind of study, Published from, Free full text only, Hide retracted papers, Rank by fit to my question (AI)); "Sources: OpenAlex and PubMed. Not finding it? Search Google Scholar".

- [ ] **Step 1: Write the failing tests**

```ts
it("Keep adds one entry with a pid, on the reading list", ...);
it("Keep on a paper already kept says Kept and adds nothing", ...);
it("a kept paper with a DOI stores no URL", ...);
it("each result has one primary action and the rest in More", ...);
it("there is no CSV button; Export opens the export place with the search list ticked (W11)", ...);
it("a request the test double has no recording for fails the test", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-46** (amends D-S2-12): v1's seven buttons per result ("+ Library", Insert, …) → one Keep (library and reading list) and a More menu; the count, sort and Export together; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): Find with one Keep per paper (W11)"`

---

### Task 19: Paste a link, DOI or PubMed number

**Files:**
- Create: `packages/core/src/paste.ts`, `packages/core/test/paste.test.ts`, `apps/web/components/literature/PasteBox.tsx`
- Modify: `packages/core/src/fetch/openalex.ts` (`oaWorkByRef`, `oaWorkToEntry`), `fetch/pubmed.ts` (`pmPaperById`), `src/index.ts`; both `capture.mjs` (wave A LATER T7: the comment at 9-11 made whole; `--only` refuses an overwrite before it fetches); new recordings by `--only`
- Test: `apps/web/test/pasteBox.test.tsx`, `apps/web/test/proxy.test.ts` (unchanged assertion, re-run)

**Interfaces:**
- `export type PastedRef = { k: "doi" | "pmid" | "pmcid" | "arxiv" | "openalex"; v: string } | { k: "link" } | { k: "text"; v: string } | { k: "empty" }`.
- `parsePasted(s: string): PastedRef`, first match wins: blank → empty; `citExtractDoi(s)` (also reads doi.org and publisher links that carry a `10.` DOI) → doi; `arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})`, `arXiv:\s*(\d{4}\.\d{4,5})` or a bare `^\d{4}\.\d{4,5}(v\d+)?$` (version dropped) → arxiv; `PMC\d{4,9}` (any case, upper-cased) → pmcid; `citExtractPmid(s)` → pmid; `openalex\.org/(W\d{4,12})` or a bare `^W\d{4,12}$` → openalex; any other `https?://` → link; else text.
- `pasteLookup(f: typeof fetch, r: PastedRef, key?: string): Promise<{ result: "ok"; entry: CitationEntry; abstract?: string; oa?: string } | { result: "nf" | "fail" | "link" | "text" | "empty" }>`: doi → `crLookupDoi`, then (not found) `oaWorkByRef("doi:" + v)`; pmid → `pmidToDoi` → `crLookupDoi`, else `pmPaperById` → `rsEntryFromResultV2`; pmcid → `oaWorkByRef("pmcid:" + v)`; arxiv → `oaWorkByRef("doi:10.48550/arxiv." + v)`; openalex → `oaWorkByRef(v)`.
- `oaWorkByRef(f, ref: string, key?: string): Promise<OaWork | null>`: `https://api.openalex.org/works/<ref>` with wave A's select (biblio, every authorship); `oaWorkToEntry(w): CitationEntry` keeps every author (wave A's name rule), volume, issue, pages, DOI.
- `pmPaperById(f, pmid: string): Promise<PmPaper | null>`: esummary for one id, parsed as `rsFetchPubmed` does.
- No new host: every request goes to OpenAlex, PubMed E-utilities or Crossref.
- `PasteBox` (canvas Find): `<details>` "Already have a paper? Paste a link, DOI or PubMed number"; button "Look it up and keep"; the paper is kept at once (Task 18's dedupe) and the line reads "Kept: {title}" with Undo, or "Already in your reading list: {title}". Messages: link "This link has no DOI or PubMed number in it. Open the paper's page, copy its DOI and paste that."; text "That looks like a title. Search for it above."; nf "No paper found for {ref}. Check it and try again."; fail "Could not reach Crossref, PubMed or OpenAlex. Try again in a minute."

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  ["10.1038/s41598-019-49466-6", { k: "doi", v: "10.1038/s41598-019-49466-6" }],
  ["https://doi.org/10.1038/s41598-019-49466-6", { k: "doi", v: "10.1038/s41598-019-49466-6" }],
  ["https://pubmed.ncbi.nlm.nih.gov/31527720/", { k: "pmid", v: "31527720" }],
  ["31527720", { k: "pmid", v: "31527720" }],
  ["pmc6746720", { k: "pmcid", v: "PMC6746720" }],
  ["https://arxiv.org/abs/2101.00001v2", { k: "arxiv", v: "2101.00001" }],
  ["https://openalex.org/W2487945683", { k: "openalex", v: "W2487945683" }],
  ["https://www.sciencedirect.com/science/article/pii/S0000", { k: "link" }],
  ["exam anxiety and sleep", { k: "text", v: "exam anxiety and sleep" }]
])("parsePasted(%s)", (s, want) => expect(parsePasted(s)).toEqual(want));
it("a DOI keeps every author, the volume and the pages", ...);              // recorded Crossref response
it("a PubMed number with no DOI still keeps the paper from PubMed", ...);
it("an arXiv id is found through OpenAlex", ...);
// web
it("a publisher link without a DOI asks for the DOI and fetches nothing (W4)", ...);
it("a paper already kept by DOI is not added again", ...);
it("connect-src is unchanged", ...);
```

- [ ] **Step 2: Run** `pnpm --filter @appuscholar/core test -- paste && pnpm --filter @appuscholar/web test -- pasteBox proxy` → FAIL.
- [ ] **Step 3: Record** with `--only` the Crossref DOI, the OpenAlex `pmcid:`, `doi:10.48550/arxiv.` and `W…` works, and one PubMed esummary; `git status --porcelain` shows only added files.
- [ ] **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Register row D-S2-47** (W4): v1's Citation Manager lookup (DOI, PubMed link, title) → a paste box in Find that keeps the paper; adds PMC, arXiv and OpenAlex ids through OpenAlex; a link without an id is refused with a sentence; proposed, awaits Dr. Sharma.
- [ ] **Step 7: Commit** `git commit -m "feat: paste a link, DOI or PubMed number in Find to keep a paper (W4)"`

---

### Task 20: The bookmark as an extra, and the "Adding this paper" screen

**Files:**
- Modify: `packages/core/src/citcapture.ts` (`bookmarkletSourceV3` beside V2); Create: `packages/core/test/citcapture-v3.test.ts`
- Create: `apps/web/app/(app)/add/page.tsx`, `apps/web/components/literature/AddingPaper.tsx`
- Modify: `apps/web/lib/cite/capture.ts` (`CaptureHash` leaves the shell; filing goes through `keepEntry`), `lib/frame/landing.ts` (`/#capture=` → `/add`), `components/literature/FindTab.tsx` ("Add from any journal page")
- Test: `apps/web/test/{addingPaper,capture}.test.tsx`

**Interfaces:**
- `bookmarkletSourceV3(origin: string): string`: V2 with the target `origin + "/add#capture="`; the test states this is the only difference.
- Consumes Task 18's `keepEntry` for the capture (its DOI-first match means "Smith JA" and "Smith, JA" captures of one paper are one; wave A LATER T8).
- `/add`, before any passphrase prompt: heading "Adding this paper"; the title, authors, year and journal from the payload (they are in the address already); "Keep it" asks for the passphrase, then "Choose a project" (opened titles, the active one first) and keeps it; then "Kept in {project}." with "Back to my project", and `window.close()` (it works when the bookmark opened the tab); if the tab stays open, "You can close this tab." The workspace never renders in this tab (W5, W13).
- Find, under the paste box: the heading "Add from any journal page", the line "Drag this button to your bookmarks bar. On a paper's page, click it to keep that paper here." and the button "Keep in Appuscholar" (W6).
- An old bookmark's `/#capture=…` lands on `/add` with the hash.

- [ ] **Step 1: Write the failing tests**

```ts
it("V3 differs from V2 only in the target path", ...);                 // core
it("the adding screen shows the paper before any passphrase (W5)", ...);
it("keeping a paper twice says it is already kept", ...);
it("an old bookmark link lands on the adding screen", ...);
it("the adding tab never shows the workspace and offers Back to my project (W13)", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-48** (W5, W6, W13; amends D-S2-11 and D-S2-23): the bookmark opens a focused adding screen and keeps the paper; the main way in is the paste box; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat: the bookmark keeps a paper from a focused adding screen (W5, W6, W13)"`

---

### Task 21: The Reading list

**Files:**
- Create: `apps/web/components/literature/{ReadingList,ReadingRow,AddPdf}.tsx`, `apps/web/lib/papers/list.ts`
- Modify: `apps/web/lib/shelf/actions.ts` (`addOwnPdf`; the backup carries `doi` and `pid`, wave A LATER T15), `lib/shelf/useShelf.ts` and `lib/blobs/useProjectBlob.ts` (wave A LATER T5 and residual: a shelf paper's conflict toasts once; no toast after unmount; a value deleted elsewhere says so (`blob_deleted_elsewhere` "This was deleted in another window, so your change to it was not saved."); a set queued before the first read of a broken blob asks R16's question before writing; `notes.ts` asks R16 per blob, not per panel); delete `shelf/ShelfDialog.tsx`
- Test: `apps/web/test/readingList.test.tsx`, `shelf.test.tsx`, `useProjectBlob.test.tsx`, `shelfPopout.test.tsx`

**Interfaces:**
- `type Paper = { pid: string; entry: CitationEntry | null; shelf: ShelfEntry | null; note: ApNote | null }`; `papersOf(lib, index, notes): Paper[]`: library order (entries with `rl !== false`), then shelf-only papers by date added.
- `paperShort(p: Paper): string`: "{Surname}, {year}: {first four title words, lower case}" with one author, "{A} and {B}, …" with two, "{A} et al., …" with three or more (canvas Read).
- `paperStatus(p: Paper): string`: parts joined with ". ": "Reading. {n} highlights" when it has highlights or the student's take, else "Not read yet"; "No PDF" when it has no shelf text and is not a book, "Book. Reference only" when its type is Book; "Authors missing" when the entry's author is empty. (Task 24 adds the attention items beside the row.)
- `addOwnPdf(files: File[], d): Promise<void>`: wave A's `resolveShelfTitle` per file, three at a time (wave A LATER T15); a DOI that matches a kept paper attaches to it; a DOI not kept keeps the paper (`crLookupDoi`) and attaches; no DOI makes a reading-list-only paper with "Add to my references" in More.
- "Get the free PDF" (when the entry has `oa`) opens it in a new tab with the line "Save it, then add it here with Add your own PDF." (decision 2 default; no new host).
- "Try a practice paper" is the last row, "Practice paper (fictional)".
- One `role="status"` for the list while it loads (wave A LATER T18).
- New copy replaces the shelf's false sentences (W14): `rl_intro` "Papers you keep, with or without their PDF. A PDF stays on your computer; its text is saved to your account, locked with your passphrase. Only you can read it."

- [ ] **Step 1: Write the failing tests**

```ts
it("kept papers show with and without a PDF, in library order", ...);
it.each(STATUS_CASES)("paperStatus: %s", ...);                       // the four canvas rows
it("a PDF whose DOI is kept attaches to that paper (W15 titles from metadata)", ...);
it("a PDF with a DOI not kept yet is kept and attached", ...);
it("three PDFs look their titles up at the same time", ...);        // fake timers: done before 8 s
it("the backup file carries doi and pid", ...);
it("a conflict on a paper's highlights shows the conflict toast once", ...);
it("an edit to a paper deleted in another window says so", ...);
it("one status region while the list loads", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-49** (W14, W15, W16; amends D-S2-14): v1's Reading shelf dialog → the Reading list tab, every kept paper with its status, titles from the paper's metadata; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): the Reading list of kept papers, with or without a PDF (W14, W15, W16)"`

---

### Task 22: Compare, and writing from the papers

**Files:**
- Create: `apps/web/components/literature/{CompareTab,CompareTable,WriteFromPapers}.tsx`, `apps/web/lib/papers/compare.ts`
- Modify: delete `shelf/Matrix.tsx`, `analyse/Across.tsx` (their CSV builders stay for the export)
- Test: `apps/web/test/compare.test.tsx`

**Interfaces:**
- Rows: kept papers with any cell or card field, by `papersOf` order; columns: "Paper", the matrix columns (`shelf_cols`, v1's defaults when empty), then the chosen card fields (`ap_cols`: Strengths, Weak points, My verdict, Notes). "Choose columns" edits both lists.
- Cells read and write `notes[p:<pid>].cells[col]`; card fields `notes[p:<pid>].card[field]`.
- Every cell's input has `aria-label` "{paperShort}, {column}" (W19).
- `rsPaperFromEntry(e: CitationEntry): RsPaper` (title, authors, year, venue, the stored abstract, DOI, retraction flag).
- "Write from these papers" (canvas Compare): ticked kept papers that have an abstract ("No abstract stored" ones are listed and cannot be ticked); "Draft a paragraph" (`buildLitReviewPrompt`) and "Find the gap" (`buildGapFinderPromptV2`), prompts and labels unchanged. The line reads "The AI uses only the papers you tick, and only their abstracts." (the prompt reads no notes, so the canvas's "and your notes" is not said).
- Results stay in this aside (W25), gold-edged, labelled "AI: gaps these papers leave open. Judge them yourself." or "AI draft from {n} abstracts. Check every claim against the papers.", with "Put in my document" (`requestInsert` as AI text) and "Dismiss".
- Under the table: "Empty cells are ones you have not written yet. The table goes out with the rest of your work from Export project." and an "Export" link (part `compare`).

- [ ] **Step 1: Write the failing tests**

```ts
it("one table joins matrix cells and card fields by paper id", ...);
it("every cell is labelled with its paper and column (W19)", ...);
it("Draft and Find the gap send v1's and wave A's prompts over the ticked papers' abstracts", ...);
it("the result stays beside the table after it arrives (W25)", ...);
it("Put in my document inserts once, as AI text", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-50** (W19, W25; amends D-S2-13): the reading matrix and the paper cards side by side become one table by paper; drafting and the gap finder sit beside it; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): Compare: one table of your papers, and writing from them beside it (W19, W25)"`

---

### Task 23: Citations

**Files:**
- Create: `apps/web/components/literature/{CitationsTab,SourceRow}.tsx`
- Modify: `apps/web/lib/cite/{fillEmpty,checks,useLibrary}.ts` (wave A LATER T11: `fillEmpty` returns false when no entry matches; the author line leaves the check's `m` once the entry has an author; a strict old-schema test); delete `cite/CitePanel.tsx` (`CiteForm`, `CiteChecks` logic, `CrossCheckDialog` stay)
- Test: `apps/web/test/citationsTab.test.tsx`, `citeChecks.test.tsx`

**Interfaces:**
- Heading `cit_head` "{n} sources, {c} cited in your document" (`lib/cite/usage.ts` across the project's documents); after a retraction check with none flagged: "Checked {date} against Crossref and OpenAlex. No retractions found; that does not prove a paper is sound."
- Each source: the reference in the chosen style (`citFmt`); a status ("Checked", "Needs a fix", "Year differs from Crossref", "Retracted", "Not checked yet"); its use ("Not cited yet", "Cited once in {document}", "Cited {n} times"); the problem sentence and its fix button from Task 24.
- Aside "In your document": "Insert reference list" (`requestInsert`) and "To cite while writing, select text in the document and choose Cite. Your library is the same everywhere."; "Check again": Check for retractions, Check details against Crossref, Cross-check citations in my document.
- "Add a source by hand" (`<details>`, today's form); More: Import a library file, Add the classic psychology sources. The library file export is in the export place.

- [ ] **Step 1: Write the failing tests**

```ts
it.each(SOURCE_STATUS_CASES)("source status: %s", ...);
it("Use Crossref details fills only empty fields and the source then reads Checked", ...);
it("Insert reference list with the document closed opens it and inserts every author and 13317", ...); // T19
it("fillEmpty with no matching entry returns false", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-51** (amends D-S2-10): the Citation Manager becomes Literature's Citations tab, each source with its status and fix; Cite stays in the document; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): Citations: every source with its status, its use and its fix"`

---

### Task 24: Needs your attention

**Files:**
- Create: `apps/web/lib/attention.ts`, `apps/web/components/frame/AttentionCard.tsx`
- Modify: `components/frame/ProjectHome.tsx` (the card), `components/literature/{SourceRow,ReadingRow}.tsx` (items beside each paper)
- Test: `apps/web/test/attention.test.ts`, `projectHome.test.tsx`

**Interfaces:**
- `export type AttentionItem = { id: string; kind: "retracted" | "no-authors" | "crossref-differs" | "not-found" | "missing-fields" | "duplicate" | "unchecked" | "numbers"; pids: string[]; key: string; vars: Record<string, string | number>; fix: "crossref" | "keep-mine" | "merge" | "check" | "open-numbers" | null }`.
- `attentionItems(i: { lib: CitationEntry[]; refcheck: RefCheckCache | null; retraction: RetractionCache | null; notes: ApNotes | null }): AttentionItem[]`, in this order:
  - retracted (`retraction[normDoi].r`): "{short} has been retracted. Check before you cite it."
  - no-authors (empty `author`), one per source: with Crossref data "{short} has no authors. Crossref lists {names}." (fix crossref), else "{short} has no authors. Check the paper and add them." (no fix)
  - crossref-differs (`s: "diff"`, kind not in `ack`): "{short}: the {field} differs from Crossref ({value})." (fixes crossref and keep-mine, "Keep {mine}")
  - not-found (`s: "nf"`): "Crossref has no record of {short}. Check its title and DOI."
  - missing-fields, one item for all journal articles missing volume, issue or pages: "Your reference list is missing {fields} for {n} journal articles." (fix crossref, one by one)
  - duplicate (two entries that `paperMatch`): "{short} is in your library twice." (fix merge: keep the older pid, fill its empty fields from the other, move the other's notes to it)
  - unchecked (no refcheck entry): "{n} sources have not been checked against Crossref." (fix check; the only way to repair entries saved before wave A)
  - numbers: Task 30.
- A fix that changes the cite key moves its `refcheck_cache` entry (wave A's move), so the item does not return as unchecked.
- Home: at most 5 items, then "See all in Citations"; no items, no card. Check results go to these items, not to toasts.

- [ ] **Step 1: Write the failing tests**

```ts
it.each(ATTENTION_CASES)("attentionItems: %s", ...);                    // one case per kind, sentences exact
it("a filled author clears its item and it does not come back as unchecked", ...);
it("Keep 1988 hides the year difference for good", ...);
it("merging keeps one pid and moves the other's notes", ...);
it("the home lists at most 5 items", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-52**: v1 reported check results in toasts and per-tool lines; v2 lists data problems with their fix on the home and beside the paper; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): Needs your attention: data problems with their fixes, on the home and beside each paper"`

---

### Task 25: B2 journey e2e and walk-through sheet

**Files:**
- Modify: `apps/web/e2e/stage2-idea-literature.spec.ts` (steps 3 to 7, 9 to 11 and 11b through Find, Keep, paste, the adding screen, Reading list, Compare, Citations; the in-spec stand-in route is removed, wave A LATER T19); the final kinds list is unchanged (no kind was added)
- Create: `docs/walkthroughs/wave-b2.md`

| # | What | Do | Expect |
|---|---|---|---|
| 1 | build | Help, version | The merge commit |
| 2 | migration | Open Literature on the wave A walk account | Every library source and shelf paper is on the Reading list once; earlier walk-through notes and cards are still there |
| 3 | Keep | Search `exam anxiety`, Keep two papers, Keep one again | Kept; the third says Kept and adds nothing; Citations (2) |
| 4 | Export link | Find, Export | The export place opens with Search lists ticked |
| 5 | paste | Paste `10.1038/s41598-019-49466-6` | Kept with every author, volume 9 and 13317 |
| 6 | paste | Paste a PubMed number of a paper with no DOI | Kept from PubMed |
| 7 | paste | Paste a publisher link without a DOI | The sentence asking for the DOI; nothing kept |
| 8 | bookmark | Drag the new bookmark; on a PubMed page, click it | "Adding this paper" before the passphrase; Keep it; "Kept in …"; the tab closes or says so |
| 9 | old bookmark | Open wave A's capture link | The adding screen |
| 10 | PDF | Add your own PDF of a kept paper | It attaches to that paper; its real title |
| 11 | Compare | Fill two cells; inspect a cell | Each cell named "{paper}, {column}"; Find the gap: the result stays beside the table |
| 12 | insert | Put in my document with the document closed | It opens and the text goes in once |
| 13 | Citations | Check details against Crossref; Use Crossref details on the authorless source | It reads Checked; the item leaves the home |
| 14 | attention | Home | The items with their fixes, at most 5 |
| 15 | phone | Literature at 375 px | Tabs scroll; each tab fits |

- [ ] **Step 1: Write the e2e changes** → run → PASS. **Step 2: Write the sheet.** **Step 3: Commit** `git commit -m "test(web): Literature and Keep in the journey e2e; walk-through sheet wave-b2.md"`

---

### Task 26: B2 release (web only)

- [ ] **Step 1: Suites** as Task 16 step 2 → all pass.
- [ ] **Step 2: Web only.** `git diff --stat origin/phase-3a-vault -- apps/api packages/db` is empty; `apps/web/proxy.ts`'s `connect-src` is unchanged.
- [ ] **Step 3: PR** `wave-b2` into `phase-3a-vault`; CI green; OJ merges.
- [ ] **Step 4: Deploy the web**; the pill reads the merge commit.
- [ ] **Step 5: Live walk** of `wave-b2.md` with OJ; FAILED rows fixed and re-walked. Rollback: redeploying B1's web is safe (loose schemas keep the new fields; B1 ignores them).

---

# Slice B3: the reader and the helpers

### Task 27: The reader

**Files:**
- Create: `apps/web/components/reader/{Reader,ReaderTabs,PaperText}.tsx`, `apps/web/lib/reader/load.ts`
- Modify: `apps/web/lib/analyse/useApDoc.ts` (`loadDoc(title, pages, src, isSample, idOverride?: string)`), `lib/analyse/intake.ts` (`fromKept`), `components/places/LitPlace.tsx` (`reading/<pid>` opens the reader; "Read it now" in Find opens it); delete `analyse/AnalysePanel.tsx`, `analyse/Intake.tsx`
- Test: `apps/web/test/reader.test.tsx` (takes over `analyse.test.tsx`'s intake cases)

**Interfaces:**
- Route `/p/<id>/lit/reading/<pid>` (the catch-all's `rest[0]`); an unknown pid: "This paper is not on your reading list." with a link to it.
- `fromKept(ticket: number, pid: string, d: KeptDeps): Promise<boolean>`: the shelf text when a PDF is attached (`readPaperOnce`), else the stored abstract (`src: "abstract"`); `loadDoc(…, "p:" + pid)`; a superseded ticket returns false (W20).
- Header (canvas Read): the title; "{paperShort authors}, {year}, {journal}. Page {n} of {N}." and "Open the paper's page" (`https://doi.org/<doi>`; no PDF is stored to open).
- Tabs in this order, `role=tablist`, the open one in `?tab=`: Your take first, Ask, Check numbers, Walk-through, Card, Highlights ({n}). Default: Your take first.
- Abstract only: "Only the abstract is here. Add your own PDF to read the whole paper."
- v1's paste intake stays: the Reading list's More has "Read pasted text", which opens the reader on the pasted text (`fromPaste`), its notes under v1's `a…` id as today, not on the list. A PDF goes in through Add your own PDF.
- Every answer names its paper (`ap_about`, wave A). The practice paper is pid `sample` (`fromSample`). Lectures and lessons stay hidden.

- [ ] **Step 1: Write the failing tests**

```ts
it("the reader opens a kept paper by its id and keys its notes p:<pid>", ...);
it("a paper without a PDF opens on its abstract and says so", ...);
it("choosing another paper while one loads keeps the later one (W20)", ...);
it("the tabs are in the pinned order and Your take first opens first", ...);
it("Read pasted text opens the reader on the text and keeps its notes under v1's id", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-53** (amends D-S2-15 and D-S2-16): Analyse a paper's intake and modes become a reader for one kept paper with tabs; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): the reader: one kept paper, named at the top, with its tabs"`

---

### Task 28: Your take first, then the AI summary

**Files:**
- Create: `apps/web/components/reader/YourTake.tsx`, `apps/web/lib/reader/take.ts`
- Modify: `packages/core/src/shelf.ts` (wave A's v2 `shSplitLong` path, LATER T14)
- Test: `apps/web/test/yourTake.test.tsx`, `packages/core/test/shelf-summary-v2.test.ts`

**Interfaces:**
- `notes[p:<pid>].take: string`; `notes[p:<pid>].summary: { text: string; at: string; partial: boolean }`.
- `takeReady(take: string): boolean`: at least 12 words.
- Label "In two lines, what does this paper say?"; once ready "Done. The AI summary is unlocked." and "Show the AI summary".
- Engine: `buildShelfSummaryPromptV2` (18,000-character budget, label "summarising a paper"), unchanged.
- The gold block's label: "AI summary of the passages that matter most. Compare it with your two lines." (the engine reads chosen passages; the canvas's "from the whole paper" is not said).
- Under it: "Next: add this paper to your comparison" → Compare.
- T14: a passage with no sentence end is cut at the last space before 700 characters, never inside a word.

- [ ] **Step 1: Write the failing tests**

```ts
it("the summary stays locked until the student's own lines have 12 words", ...);
it("the summary is kept with the paper and shown on return", ...);
it("the label never says whole paper", ...);
it("a 2,000-character run with no full stop is never cut inside a word", ...); // core, T14
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** core, web, `test:golden` → PASS.
- [ ] **Step 5: Register row D-S2-54**: v1's Summarise on the shelf showed the AI summary at once; v2 asks for the student's two lines first and keeps both with the paper; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): Your take first, then the AI summary, kept with the paper"`

---

### Task 29: Highlights that hold the selection

**Files:**
- Create: `apps/web/lib/reader/heldSelection.ts`, `apps/web/components/reader/{HighlightBar,HighlightsTab}.tsx`
- Test: `apps/web/test/heldSelection.test.tsx`

**Interfaces:**
- `useHeldSelection(root: RefObject<HTMLElement | null>): { held: { text: string; page: number } | null; clear(): void }`: set on `mouseup`, `keyup` and `touchend` inside `root` when the selection is not empty and lies inside `root`; focus moving to the note box does not clear it; Save, Escape or a new selection does.
- `HighlightBar` (`role="group"`, label "Save a highlight"): "Selected passage held", the first 120 characters, the note input ("Your note on this passage"), "Save highlight" → v1's `saveHighlight(shelfId, page, held.text, note)`.
- On an abstract-only paper: "Add your own PDF to keep highlights."

- [ ] **Step 1: Write the failing tests**

```ts
it("select, click the note box, type, save: the highlight is saved (W17)", ...);
it("a selection outside the paper is not held", ...);
it("Escape drops the held passage", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-55** (W17): v1 read the selection when Save was pressed, so typing a note first lost it; v2 holds it when it is made; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "fix(web): a highlight keeps its passage while the note is typed (W17)"`

---

### Task 30: Check numbers, with its results kept for attention

**Files:**
- Create: `apps/web/components/reader/NumbersTab.tsx` (v1's `Numbers` and `RefCheck` inside)
- Modify: `apps/web/lib/analyse/useApDoc.ts` (after `runNumbers` and the reference check, write `checks`), `apps/web/lib/attention.ts` (the numbers kind)
- Test: `apps/web/test/numbersTab.test.tsx`, `attention.test.ts`

**Interfaces:**
- `notes[p:<pid>].checks = { numbers?: { bad: number; total: number; at: string }; refs?: { flagged: number; total: number; at: string } }`, written after each run; engines unchanged.
- Attention item numbers: "{bad} of {total} numbers in {short} do not match what the paper prints. Open Check numbers." (fix `open-numbers`).

- [ ] **Step 1: Write the failing tests**: "a failed number check is kept and listed in Needs your attention"; "a later clean run clears it".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-56**: v1 kept the numbers check in the page only; v2 keeps its counts with the paper so a failure reaches Needs your attention; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): Check numbers in the reader; a failed check stays on the attention list"`

---

### Task 31: Ask, Walk-through and Card in the reader

**Files:**
- Create: `apps/web/components/reader/{AskTab,WalkTab,CardTab}.tsx` (today's `Ask`, `Walk`, `Card` inside)
- Modify: `apps/web/lib/analyse/notes.ts` (notes at `p:<pid>`), `V2_STRINGS.card_saved`
- Test: `apps/web/test/reader*.test.tsx` (from `analyse.test.tsx`, `analyseWalk.test.tsx`; the PDF-then-paste case clears toasts between its halves, wave A LATER T16)

**Interfaces:**
- Engines, prompts and the v1 copy inside the three tabs unchanged (B4 rewrites copy), except the card's false storage sentence (W22), replaced by the new key `card_saved` "Saved to your account, locked with your passphrase. Only you can read it."
- Walk and Card show `PanelLoading` while `ap_notes` opens (wave A LATER T18).

- [ ] **Step 1: Write the failing tests**: "Walk and Card show the loading sign, not empty boxes, while notes open"; "the card says where it is saved, truthfully (W22)"; the ported Ask, Walk and Card cases at `p:<pid>`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): Ask, Walk-through and Card as reader tabs (W22)"`

---

### Task 32: Research helpers in the document

**Files:**
- Create: `apps/web/lib/editor/heldSelection.ts`, `apps/web/components/document/HelpMenu.tsx`
- Modify: `components/document/SelectionBubble.tsx` ("More help"), `components/document/DocAside.tsx` (helper results), `lib/ai/actions.ts` (`HelperDeps.selectionText` reads the held selection; no `dockShow`), `components/places/WritingPlace.tsx`; delete `components/tools/HelpersPanel.tsx`
- Test: `apps/web/test/helpersInDocument.test.tsx`, `helpersActions.test.ts`; e2e step 10 rewritten in Task 33

**Interfaces:**
- `heldEditorSelection(editor: Editor): { text: string; from: number; to: number } | null`: kept in plugin state across a blur; cleared by a new selection or by an edit inside its range.
- `helperScope(held: { text: string } | null, docText: string): { text: string; whole: boolean; chars: number }`: the held text, any length (the builders cut at 12,000 and the devil at 6,000, as v1), else the whole document.
- The document toolbar's "Help with this text" opens `HelpMenu`: Paper helper, Explain a case, Literature review helper, Explain the statistics, Challenge my argument; its subtitle "On your selection ({chars} characters)" or "On the whole document". The bubble (8 to 800 characters, unchanged) adds "More help", which opens the same menu.
- Results show in `DocAside` beside the document: helpers with Tab and Insert; Challenge my argument never inserts. The menu stays one click away; the place does not change (W25).

- [ ] **Step 1: Write the failing tests**

```ts
it("a 3,000-character selection reaches the helper though the bubble does not show", ...);
it("with nothing selected the helper reads the whole document", ...);
it("after a helper runs the menu is one click away and the result is beside the document (W25)", ...);
it("Challenge my argument is never inserted", ...);
it("the prompts and their AI-use labels are unchanged", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Register row D-S2-57** (W25; amends D-S2-8): Research helpers move from a tool panel into the document, acting on the held selection or the whole document; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "feat(web): research helpers act on the student's own text from the document (W25)"`

---

### Task 33: B3 journey e2e and walk-through sheet

**Files:** `apps/web/e2e/stage2-idea-literature.spec.ts` (steps 7 to 10 through the reader and the document's helpers), `docs/walkthroughs/wave-b3.md`

| # | What | Do | Expect |
|---|---|---|---|
| 1 | build | Help, version | The merge commit |
| 2 | reader | Reading list, open the kept paper with a PDF | Its title and "Page 1 of N"; Your take first is open |
| 3 | take | Type 12 words, Show the AI summary | The gold summary with its label; it is there after a reload |
| 4 | highlight | Select a passage, click the note box, type, Save highlight | Saved; Highlights (1) (W17) |
| 5 | numbers | Check numbers on the practice paper | v1's results; a failure appears on the home's attention list |
| 6 | Ask | Ask a question | The answer names the paper; quotations checked with their page |
| 7 | race | Open one paper, then at once another | The second stays (W20) |
| 8 | helpers | In the document select 2,000 characters, Help with this text, Literature review helper | "On your selection (2,000 characters)"; the result beside the document; the menu still there (W25) |
| 9 | whole | Clear the selection, Challenge my argument | "On the whole document"; never inserted |
| 10 | phone | The reader at 375 px | Tabs scroll; the text fits |

- [ ] **Step 1: e2e** → PASS. **Step 2: Sheet.** **Step 3: Commit** `git commit -m "test(web): the reader and the helpers in the journey e2e; walk-through sheet wave-b3.md"`

---

### Task 34: B3 release (web only, with Q3's API change if approved)

- [ ] **Step 1: Suites** → pass. **Step 2: PR** `wave-b3`; CI green; OJ merges.
- [ ] **Step 3: If Task Q3 is in this release**, deploy the API first (the change is backward compatible) and check `/health`.
- [ ] **Step 4: Deploy the web**; pill.
- [ ] **Step 5: Live walk** of `wave-b3.md`; rollback of the web to B2 is safe.

---

# Slice B4: copy, emoji, formats, Hindi

### Task 35: The copy audit and honest storage wording

**Files:**
- Create: `apps/web/scripts/copy-audit.mjs`, `docs/copy/wave-b-copy-audit.md` (generated)
- Modify: `apps/web/scripts/i18n-overrides.mjs` (`COPY_V2` and `applyCopyV2(en, hi)`, run after `applyPanelFixes`), `apps/web/scripts/extract-v1-i18n.mjs`, regenerated `messages/{en,hi}.json`
- Test: `apps/web/test/copyAudit.test.ts`, `i18n.test.ts`

**Interfaces:**
- `copy-audit.mjs` lists every key the built app can show: static `t("…")` and `tHtml(t("…"))` keys under `apps/web/{app,components,lib}`, plus the dynamic prefixes it finds (`rc_`, `ap2_stage_`, `state_`, `stage_name_`); per key the flags: emoji; storage claim (`/this browser|this computer|this device|on your computer|nothing is uploaded|clearing your browser/i`); em-dash; numbered stage label (`/Stage \d+ of \d+/`); a label in title case (two or more capitalised words in a label of four words or fewer). At the base there are 1,141 keys, 205 with emoji and 48 with a storage claim.
- The rule for a storage claim: false in v2 (the data is under the account) → rewritten to the standard line or a sentence that contains it; true → kept, listed in `TRUE_CLAIMS` (the passphrase or AI key remembered in this browser: `vault_remember`, `vault_forget_btn`, `vault_forget_q`, `vault_forgotten`, `settings_keymode_plain`, and the first sentence of `faq_a_key`).
- `COPY_V2: Record<string, { en: string; hi: string }>` covers every in-use key the audit flags for a storage claim, an em-dash, a numbered stage label or a title-case label, with DRAFT Hindi. Keys of v1 screens not built (statistics, viva, backup, settings) are listed in the sheet as "not built, unchanged"; they are rewritten when those screens are built.
- `applyCopyV2` throws when a key is missing or the value does not change.

- [ ] **Step 1: Write the failing tests**

```ts
it("no in-use English value claims data stays in this browser or on this computer, outside TRUE_CLAIMS (W14, W22, W24)", ...);
it("every COPY_V2 key exists and changes its value", ...);
it("no in-use value has an em-dash or a numbered stage label", ...);
it("extracting twice gives no diff", ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; run the audit; write `COPY_V2`; regenerate. **Step 4: Run** web, `test:golden` → PASS.
- [ ] **Step 5: Register row D-S2-58** (W14, W22, W24; closes D-S2-19's request): the copy that v2 shows is rewritten where v1's words were false, used em-dashes, numbered the stages or used title case; proposed, awaits Dr. Sharma (copy).
- [ ] **Step 6: Commit** `git commit -m "fix(web): honest storage wording and the copy rules across the screens v2 shows (W14, W22, W24)"`

---

### Task 36: No emoji in the interface (D2, Dr. Sharma has the final word)

**Files:**
- Modify: `apps/web/scripts/i18n-overrides.mjs` (`D2_NO_EMOJI = true`, `stripEmoji`, `applyNoEmoji(en, hi)`, last in the chain), the component and lib literals the impact map lists (43 files, 82 lines; for example `DocBar.tsx:113,117,118`, `Numbers.tsx:18`, `CiteChecks.tsx:60,72`, `lib/ai/actions.ts`, `lib/ai/callAI.ts`, `lib/cite/share.ts`, `lib/docMessages.ts:2`), icons from `@phosphor-icons/react` where an emoji carried meaning (✓ → `Check`, ⚠ → `Warning`, ⬇ → `DownloadSimple`)
- Test: `apps/web/test/noEmoji.test.ts`; the unit tests the impact map lists (analyse, analyseWalk, caretChip, callAI, citeImportExport, citeChecks, citeQuote, citeInsert, ideaPlace, ideaAction, i18n, popout, suggestionProvider, research*, shelf); e2e literals in `phase2-walkthrough.spec.ts`, `phase3a-vault.spec.ts`, `stage2-idea-literature.spec.ts`, `e2e/support/toasts.ts`

**Interfaces:**
- `stripEmoji(s: string): string`: removes `\p{Extended_Pictographic}`, U+FE0F, U+2190–U+21FF, U+2300–U+23FF, U+2700–U+27BF and U+2B00–U+2BFF; then collapses runs of spaces and trims each line.
- With `D2_NO_EMOJI` true, every value in both dictionaries is stripped; setting it false and regenerating restores v1's emoji (Dr. Sharma's decision is one line).
- Golden fixtures and core engine strings are untouched; web tests that compare with golden text use `withV2Copy(s)` (`withPanelFixes`, `COPY_V2`, then `stripEmoji`). Stage 3 and 4 engine strings (`design.ts`, `chart-tables.ts`) are stripped in their panels when those stages are built.

- [ ] **Step 1: Write the failing tests**

```ts
it("no value in en.json or hi.json has an emoji or a dingbat", ...);
it("no component or lib file under apps/web renders an emoji literal", ...);  // scan; tests and scripts excluded
it("stripEmoji keeps the words and their spacing", () => expect(stripEmoji("✓ Found in the paper ✨")).toBe("Found in the paper"));
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; update the listed tests to the stripped text. **Step 4: Run** web, `test:golden`, e2e → PASS.
- [ ] **Step 5: Register row D-S2-59**, status `proposed`, "awaits Dr. Sharma (decision)": v1's emoji in labels and messages are removed; icons come from one set (OJ, 2026-10-20, D2, pending Dr. Sharma).
- [ ] **Step 6: Commit** `git commit -m "feat(web): no emoji in the interface, behind one switch (D2)"`

---

### Task 37: Toasts only for "Saved" and "Inserted"

**Files:**
- Create: `apps/web/lib/toastPolicy.ts`
- Modify: the `toast()` callers under `apps/web/lib` and `apps/web/components` that report a check result or a data problem (`lib/cite/{capture,checks,share,actions}.ts`, `lib/research/*`, `lib/shelf/actions.ts`, `lib/ai/actions.ts`)
- Test: `apps/web/test/toastPolicy.test.ts`

**Interfaces:**
- `ALLOWED_TOASTS`: "Saved" and "Inserted" messages, plus errors with no place on screen to show them (each listed with its reason: the vault's, the AI key's, `blob_conflict`, `blob_switch_held`, `blob_deleted_elsewhere`, `insert_doc_closed`).
- Every other message moves into the tool's own status line (beside the button that started it) or into Needs your attention.

- [ ] **Step 1: Write the failing test**: "every toast() call passes an allowed message" (a scan of call sites and the keys they pass).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** web, e2e → PASS.
- [ ] **Step 5: Register row D-S2-60**: v1 reported results in toasts; v2 keeps toasts for Saved and Inserted and shows results beside the tool; proposed, awaits Dr. Sharma.
- [ ] **Step 6: Commit** `git commit -m "fix(web): results show beside their tool; toasts only say Saved and Inserted"`

---

### Task 38: RIS and BibTeX in the export

**Files:**
- Create: `packages/core/src/citexport.ts`, `packages/core/test/citexport.test.ts`
- Modify: `packages/core/src/index.ts`, `apps/web/lib/export/projectExport.ts` (`citations/library.ris`, `citations/library.bib`), the export dialog's citations line ("RIS, BibTeX, text", as the canvas)
- Test: `apps/web/test/projectExport.test.ts`

**Interfaces:**
- `citToRis(lib: CitationEntry[]): string`: per entry, CRLF lines `TAG  - value`: `TY` (JOUR, BOOK, CHAP, CPAPER, RPRT, THES; GEN otherwise), one `AU` per author (split by `citNames`), `PY`, `TI`, `T2` (journal or container), `VL`, `IS`, `SP` and `EP` (from "a-b"), `DO`, `UR`, `ER`; empty fields left out.
- `citToBibtex(lib: CitationEntry[]): string`: `@article`, `@book`, `@incollection`, `@inproceedings`, `@techreport`, `@phdthesis`, `@misc`; key = first surname + year + first title word, lower-case ASCII, `a`, `b`… on a clash (`anon` without an author); fields `author` ("A and B"), `title` in braces, `journal` / `booktitle` / `publisher`, `year`, `volume`, `number`, `pages` with `--`, `doi`; `{ } % & $ # _` escaped.

- [ ] **Step 1: Write the failing tests**: Schaefer et al. (2019) gives exactly the RIS and the BibTeX written in the test (six authors, `VL  - 9`, `SP  - 13317`, key `schaefer2019openlabel`); a book; an authorless entry (no `AU` line; key `anon2011omega3`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** core, web → PASS.
- [ ] **Step 5: Register row D-S2-61**: v1 exported its own JSON only; v2 adds RIS and BibTeX for reference managers; proposed, awaits Dr. Sharma (and a librarian, as F23).
- [ ] **Step 6: Commit** `git commit -m "feat: RIS and BibTeX in the project export"`

---

### Task 39: The Hindi re-map sheet

**Files:**
- Create: `apps/web/scripts/hindi-remap-sheet.mjs`, `docs/i18n/wave-b-hindi-remap.md` (generated)
- Test: `apps/web/test/hindiRemap.test.ts`

**Interfaces:**
- The script compares the dictionaries at the wave B base (`git show <base>:apps/web/messages/en.json` and `hi.json`; the base commit is written in the script) with the current ones. A row per key whose English changed or that was added: key, old English, new English, old Hindi, new Hindi (DRAFT), and one status: "Hindi was an English copy", "Hindi re-drafted", "emoji only", "new key".
- The header gives the counts Dr. Sharma's work is costed from: keys at the base (1,141), Hindi values that were English copies at the base (366), keys changed in wave B, keys added in wave B, keys whose only change is the emoji.

- [ ] **Step 1: Write the failing tests**: "the sheet regenerates byte for byte"; "every key whose English changed in wave B is in the sheet".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; generate. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "docs(i18n): the Hindi re-map sheet for wave B, with its counts"`

---

### Task 40: B4 journey e2e, walk-through sheet and Dr. Sharma's packet

**Files:** e2e literals across the four specs; `docs/walkthroughs/wave-b4.md`; `docs/superpowers/specs/parity-deviations.md` (each wave B row's status checked); the walk notes (the list of rows awaiting Dr. Sharma, with the Hindi sheet and the emoji decision)

| # | What | Do | Expect |
|---|---|---|---|
| 1 | build | Help, version | The merge commit |
| 2 | emoji | Walk the nine canvas screens | No emoji; icons where they mean something |
| 3 | storage | Reading list, a paper card, Compare, Help | The standard storage line; no "this browser" or "this computer" except where the passphrase or key is remembered |
| 4 | toasts | Keep, check citations, insert a reference list | Results beside the tool; toasts say only Saved or Inserted |
| 5 | formats | Export project; open `library.ris` in Zotero | Every source with its authors, volume and pages |
| 6 | Hindi | Switch to Hindi | Every new string shows its DRAFT Hindi; nothing English-only on the frame's screens |
| 7 | phone | The nine screens at 375 px | No sideways scroll |

- [ ] **Step 1: e2e** → PASS. **Step 2: Sheet and packet.** **Step 3: Commit** `git commit -m "test(web): copy and formats in the journey e2e; walk-through sheet wave-b4.md; the register packet"`

---

### Task 41: B4 release (web only)

- [ ] **Step 1: Suites** → pass. **Step 2: PR** `wave-b4`; CI green; OJ merges. **Step 3: Deploy the web**; pill. **Step 4: Live walk** of `wave-b4.md`; rollback of the web to B3 is safe. **Step 5: Hand-off**: the packet to Dr. Sharma (OJ sends it).

---

# Track Q: AI quality

Q1 and Q2 can run beside any slice; they deploy nothing. Q3 ships with B3.

### Task Q1: Test sets and graders

**Files:**
- Create: `packages/quality/{package.json,tsconfig.json,vitest.config.ts}`, `packages/quality/src/{grade,sets}.ts`, `packages/quality/sets/{idea,summary,gap,litreview,ask,walk}.json`, `packages/quality/test/grade.test.ts`

**Interfaces:**
- A set item: `{ id: string; input: unknown; good: string; expect: Record<string, unknown> }`; `good` says in words what a good answer does (draft §8).
- Sets, 3 to 5 items each: idea (the walk's idea and four others), summary (four papers that state their limitations), gap (three groups of 3 to 5 abstracts), litreview (the same groups), ask (three papers, two questions each), walk (two papers, two stages each). Paper text is stored only for CC-BY or public-domain papers, with the licence and DOI in the item; any other paper is stored by DOI only.
- Graders (pure): `gradeQuotes(doc: ApDoc, reply: string): { quotes: number; found: number }` (`apCheckQuote`); `gradeNumbers(source: string, reply: string): { foreign: string[] }` (numbers in the reply that are not in the source, `accItems`); `gradeAreas(reply: string, areas: string[]): { named: string[]; missing: string[] }`; `gradeLimitations(reply: string, expected: string[]): { notReported: boolean; hits: string[] }`; `gradeGapNames(reply: string, papers: RsPaper[]): { numbered: boolean; named: string[] }`; `gradeLabel(prompt: string, expected: { k: string; g: AiUseGroup }): boolean`.

- [ ] **Step 1: Write the failing tests**: each grader on one hand-written good and one bad reply (for example `gradeGapNames("Paper 1 and Paper 2 both…", papers).numbered === true`).
- [ ] **Step 2: Run** `pnpm --filter @appuscholar/quality test` → FAIL. **Step 3: Implement**; write the sets. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "test(quality): AI-quality test sets and grounding graders"`

---

### Task Q2: The runner and the first baseline

**Files:**
- Create: `packages/quality/src/run.ts`, `packages/quality/test/run.test.ts`, `apps/api/scripts/quality.ts` (the CLI), `packages/quality/reports/` (committed markdown)

**Interfaces:**
- `runSet(set: QualitySet, complete: (prompt: string, o: { temperature?: number; maxTokens?: number }) => Promise<string>, o: { repeats: number }): Promise<QualityReport>`: each prompt is built by the builder the web uses (wave A's V2 where it exists); every reply is graded; the report is markdown: a summary table per item (grades over the repeats), then each reply.
- CLI: `pnpm --filter @appuscholar/api exec tsx scripts/quality.ts --set summary --provider groq --repeats 3` wires the gateway's `complete`; the key comes from `QUALITY_API_KEY` (never printed, never committed); not run in CI (it costs and needs a key).
- The same sets and runner are the bar the MCP route is held to later.

- [ ] **Step 1: Write the failing test**: "runSet grades each recorded reply and writes the summary table" (a fake `complete` returning recorded replies).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Baseline (OJ's action, his key):** OJ runs the CLI once per set; the reports are committed and linked from the walk notes, against the known weak spots of draft §8 (areas named, limitations found, gaps named by author, authors complete).
- [ ] **Step 6: Commit** `git commit -m "feat(quality): the runner, and the first baseline reports"`

---

### Task Q3: AI-use labels for Ask, Walk-through, the statistics helper and lessons, changed knowingly (wave A LATER T3)

Only with OJ's yes (decision 7): the label feeds the AI-use statement a student hands in.

**Files:**
- Create: `packages/core/src/aiuse-v2.ts` (`classifyAiUseV2`); Modify: `apps/api/src/routes/ai.ts:80` (uses V2), `packages/core/test/aiuse-labels.test.ts` (rows changed on purpose)

**Interfaces:**
- `classifyAiUseV2(prompt: string): { k: string; g: AiUseGroup } | null`: v1's rules, after four new ones matched on each builder's fixed opening words (quoted in the test): `buildAskPrompt` → "asking questions about a paper", explain; `buildWalkPrompt` → "working through a paper section by section", feedback; `buildHelperPrompt("stats")` → "explaining statistics", explain; `buildLessonAskPrompt` → "a guided lesson on a paper", explain. Every other label unchanged; stored log entries keep their labels.

- [ ] **Step 1: Write the failing tests**: the four new rows; "every other builder keeps v1's label".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** core, api → PASS.
- [ ] **Step 5: Register row D-S2-62**: four kinds of request that v1 logged as "other help" or the wrong help get their own labels in the AI-use statement; proposed, awaits Dr. Sharma and OJ.
- [ ] **Step 6: Commit** `git commit -m "feat: the AI-use log names questions about a paper, walk-throughs, statistics and lessons"`

---

## Deferred (not in wave B, and why)

- **Stage 3 to 6 screens.** Built into the frame after wave B (OJ, D4), once the kind-to-stage map (Task 4), stage storage (Tasks 2, 3) and the paper id (Task 17) exist. Each new blob kind must be added to `KIND_STAGE`.
- **The MCP door.** Locked titles mean a hosted `list_projects` cannot show names; hosted or local is decided before the door is designed.
- **"Recent work" on the home.** Nothing records the student's actions; building it needs an activity record, which is new storage. The home says nothing rather than something made up.
- **Opening a free PDF's text automatically.** Default: "Get the free PDF" opens it in a new tab and the student adds it (no new host). Automatic text needs Europe PMC (`https://www.ebi.ac.uk`) in `connect-src` after a live CORS check (decision 2).
- **A search across the web for sources** (OJ's NotebookLM idea, W4): the paste box covers the main need; a wider search needs a server fetch or new hosts.
- **References track:** Crossref fill writes authors as "Family, Given"; a three-word OpenAlex name ending in capitals ("Xiao Ming LI"). Neither is touched by the redesign.
- **AI-use token counts and an API rate limit** (impact map §6.8): the harness measures quality, not cost; both are API work for the AI track.
- **A required e2e check on GitHub:** needs GitHub Pro (OJ kept it non-blocking; the release checklists require green).
- **Copy of v1 screens not built** (statistics, viva, backup, settings): rewritten when those screens are built (Task 35 lists them).

## Decisions for OJ

1. **The key for project titles.** Recommendation: a project key (`projects.deks`, Task 2), so a later supervisor share (Phase 7) can carry a project's name the way it carries a document's key. The other choice, the vault key itself, needs no column but blocks sharing names.
2. **Free PDFs.** Recommendation: B2 opens the free PDF in a new tab for the student to add (no new host). The other choice adds Europe PMC (`https://www.ebi.ac.uk`) so open-access full text comes in by itself, after a CORS check.
3. **First run's fields.** Recommendation: v1's four fields under the canvas's layout, so the feasibility prompt is unchanged; the canvas's "What would you change or compare?" is not built (the engine has no field for it).
4. **Scratch space.** Recommendation: the last row of All projects, "Documents not in a project", opening straight into Writing.
5. **"Started early" and Writing.** The spec's rule makes Writing "started early" whenever Collection is empty; the canvas shows it "In progress". Recommendation: Writing is never "started early" (the document is beside every stage from day one).
6. **Emoji.** Task 36 removes them behind one switch. Ship B4 with them removed and tell Dr. Sharma, or hold Task 36 until he answers.
7. **AI-use labels (Task Q3).** Yes or no to four new labels in the student's AI-use statement.
8. **The slices.** Approve B1 to B4 as four releases with four live walks, or merge B2 and B3 into one release (fewer walks, a larger web change to undo).

## OJ's answers (2026-10-21)

"Accept your eight recommendations for wave B, patch W30 first, and start building slice B1."
1. **Title key:** a per-project key (`projects.deks`).
2. **Free PDFs:** add Europe PMC (`https://www.ebi.ac.uk`) so open-access full text comes in by itself, after a CORS check. This overrides the plan's default of opening the PDF in a new tab. B2 owns it: the new connect-src host, a fetch that sends only the PMCID or DOI, a register row, and a fallback to the new tab when Europe PMC has no full text or CORS fails.
3. **First run:** v1's four fields under the canvas's layout; the feasibility prompt is unchanged.
4. **Scratch space:** the last row of All projects, opening straight into Writing.
5. **Writing** is never "started early".
6. **Emoji:** ship B4 with them removed behind one switch; Dr. Sharma can flip it back.
7. **Q3:** yes to the four new AI-use labels.
8. **Slices:** B1 to B4 as four releases, each with its own live walk.

Also from the 2026-10-21 walk of fix wave A:
- **W31:** Export all my work is silent for about 20 s. Task 13 (one export place) adds a progress line and a disabled button while it runs.
- **W30:** patched before B1, on branch fix-w30.
