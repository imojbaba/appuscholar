# Impact map for the journey redesign

Written 2026-10-20 as a read-only analysis of `appuscholar-stage2` at `origin/phase-3a-vault`, commit 6c38396. That is the live build walked today. No file in the repo was changed.

It covers the approved decisions in `design/2026-10-20-journey-redesign-draft.md` §11: D1 (the frame), D2 (no emoji), D3 (locked titles) and D4 (the order of work). It also covers the 14 bug fixes of draft §10. Fault numbers are the walk's (`notes/2026-10-20-stage2-live-walk.md`).

**How to read the evidence.** Paths are relative to the repo root `appuscholar-stage2/`. `file:line` refers to that commit. **V** means VERIFIED: the code was read. **I** means INFERRED: reasoned from the code, not checked by running it.

**A naming trap, found during this analysis.** The deviation register already uses the ids F1, F2, F3, F7, F12, F18, F26, F27 and F28, for v1 port-audit flags (mostly statistics; e.g. `parity-deviations.md:85,89,94-96`). The walk's fault numbers must never be written into the register as ids. New rows take the next free id, which is D-S2-22 (the last today is D-S2-21) (V). The draft's "F1 to F29" labels will be confused with register ids in commits and reviews unless they are renamed, for example to W1 to W29.

---

## 0. Facts that cut across every item

These recur in almost every section below. They are stated once here.

1. **The blob model.**
   - Stage data is one body per (project, kind) in `project_blobs` (`packages/db/src/schema.ts:86-94`, unique index on project_id and kind) (V).
   - A PUT replaces the whole body. It has no version or If-Match check, so the last write wins (`apps/api/src/routes/blobs.ts:39-58`) (V).
   - Within one browser, the pop-out's BroadcastChannel announces saves (`apps/web/lib/popout/channel.ts`). Nothing protects two devices or two windows that are not the pop-out (I).
   - Each body is capped at 2.8 MB (`apps/api/src/app.ts:19`, 413 too-large) (V).
2. **Server allowlists are strict, so the API must deploy before the web.**
   - `BLOB_KINDS` refuses any unknown kind with 400 (`blobWrite.ts:6-10`, `blobs.ts:42`) (V).
   - `SettingsSchema` is `.strict()` (`apps/api/src/routes/me.ts:6-22`) (V).
   - The project `Patch` accepts only title, stage, status and contentLang (`apps/api/src/routes/projects.ts:10-15`) (V).
   - So every new kind, setting or project field ships in the API first. A web build that sends it earlier gets 400s.
3. **Database migrations are manual.** `db:migrate` is `drizzle-kit migrate` (`packages/db/package.json`) and nothing in the deploy runs it (V). There are 5 migrations so far (`0000`-`0004`) (V). A schema change means running the migration on Neon before the API that needs it is deployed.
4. **The vault and its migration.**
   - The vault is optional; with no passphrase the "Vault off" pill shows (vault design `docs/superpowers/specs/2026-10-16-vault-design.md:48`) (V).
   - The one-off migration runs only while `vault_keys.complete` is false (`apps/web/lib/vault/useVault.tsx` `startMigration`) (V).
   - Every `/rewrite` route answers 409 `migration-closed` once the vault is complete (`apps/api/src/routes/documents.ts:72`, `blobs.ts:88`) (V).
   - So any later change to stored data on accounts with a complete vault, which includes the live walk account, needs a new client-side migration path. It must decrypt, transform and re-PUT with the existing dek.
5. **The account export zip does not contain any stage data.** `exportAll` (`apps/web/lib/vault/export.ts:57-88`) writes documents (.html and .doc), the writing record and `index.json`. It never reads a blob (V). The idea intake, citation library, shelf text and highlights, matrix cells, paper cards and walk-through notes are all left out of the export DPDP needs.
6. **Account erasure is safe for anything new.** `DELETE /me` leads to `eraseUser` (`apps/api/src/routes/me.ts:75`, `store/drizzle.ts:~371-386`). It deletes projects, and blobs and documents cascade with them (`schema.ts:46,58,88`) (V). Any new blob kind or project column is covered automatically. Audit rows survive by design (`schema.ts:129`) (V).
7. **The v1 backup import brings in documents only.**
   - `lib/import/v1.ts` and `ImportV1.tsx:45-70` create one project and its documents (V).
   - v1's project `stage` is parsed (`packages/core/src/v1import.ts:26,59`) but never sent, because `createProject` posts `{title}` only (`ImportV1.tsx:59`). The v1 stage is therefore already lost on import (V).
   - The v1 citation library and shelf come in through separate JSON imports. `mergeLibrary` (`packages/core/src/citlib.ts:110-120`, which drops entries with no author at :116) and the shelf backup restore (`lib/shelf/actions.ts`) (V).
8. **The AI-use log classifies a request by the first 400 characters of its prompt.**
   - `classifyAiUse` (`packages/core/src/aiuse.ts:34-40`) runs regexes such as `judge whether a project idea is realistic`, `find a research gap` and `helping a … read a paper` (`aiuse.ts:4-31`). It is called from `apps/api/src/routes/ai.ts:80` (V).
   - The log stores `{day, provider, model, kind, group}` only: no text, no size (`ai.ts:79-84`, `store/types.ts:10`) (V).
   - A prompt rewrite that drops the anchor phrase silently relabels the student's log as "other help". That log feeds the AI-use statement a student hands in (I).
9. **AI limits.**
   - A prompt is at most 60,000 characters (`ai.ts:16`) and maxTokens at most 16,000 (`ai.ts:19`) (V).
   - The API has no rate limiting. A provider's 429 maps to "rate-limit" and the client fails over to another provider (`apps/api/src/ai/http.ts:33`, `apps/web/lib/ai/callAI.ts`) (V).
   - The personal-data scan runs over the whole prompt (`ai.ts:74`) (V).
10. **CSP.** `connect-src` is 'self', the API, api.openalex.org, eutils.ncbi.nlm.nih.gov and api.crossref.org (`apps/web/proxy.ts:5-14`), pinned by `apps/web/test/proxy.test.ts:11` (V). Its comment says "the api is never a proxy for them" (`proxy.ts:6`) (V).
11. **i18n is generated from v1.**
    - `en.json` and `hi.json` each have 1,131 keys, with identical key sets (V).
    - They are produced by `apps/web/scripts/extract-v1-i18n.mjs` plus `scripts/i18n-overrides.mjs` (OVERRIDES, HINDI_DRAFTS) (V).
    - `apps/web/test/i18n.test.ts:111-122` re-extracts and requires byte equality whenever v1's `index.html` is present (V). Any copy change must go through the overrides layer, not a hand edit of the JSON.
    - 366 Hindi values are English copies, all the rs2_, ap2_ and sh2_ keys (V).
12. **Register rules.** "Numbers never deviate without OJ; copy never deviates without Dr. Sharma" (`parity-deviations.md:3`) (V). OJ's decision to drop parity for layout, flow and wording conflicts with that copy rule unless a register row records it.
13. **The e2e job does not block merges** (`.github/workflows/ci.yml`, `e2e: continue-on-error: true`) (V).
    - The stage 2 journey spec can break without CI failing.
    - Recordings are matched by exact URL, with file names `<name>-<sha256(url)[:8]>` (`apps/web/e2e/fixtures/recorded/capture.mjs:35`) (V). Any change to a query URL makes recordings stale.

---

## 1. D1: the frame

### D1a. Stages become places with derived states; `project.stage` stops being the source of truth

**Where it lives.**
- The column `projects.stage text not null default 'idea'` (`packages/db/src/schema.ts:49`) (V).
- `PROJECT_STAGES` (`apps/api/src/store/types.ts:15`). Create and Patch accept `stage` (`apps/api/src/routes/projects.ts:9-13`) (V).
- Store writes: `drizzle.ts:90-91,115` and `memory.ts:76,84` (V).
- Web: `STAGE_ORDER`, `TOOL_TO_STAGE`, `STAGE_FIRST_TOOL`, `TOOLS_BY_STAGE`, `nextStageTool` and `prevStageTool` (`apps/web/lib/tools.ts:5-38`). There is a parallel `STAGES` list with English labels in `lib/stages.ts:1-19`, used by the sign-in page (`app/signin/page.tsx:4,23`) (V).

**Why fault 29 happens.**
- `StageGuide` derives its stage from the open tool: `TOOL_TO_STAGE[activeTool]` (`components/workspace/StageGuide.tsx:11`). "Next" calls only `showTool` (:23) (V).
- The web never PATCHes `stage`. The only project PATCHes send `status` (`dialogs/Projects.tsx:49`) and `contentLang` (`dialogs/ProviderKey.tsx:140`) (V).
- So the stage is set once at creation, from the Save-as dialog's select (`dialogs/SaveAsProject.tsx:33,63,105`), and never moves.
- Fault 10 has the same cause: the guide follows whatever tool is open, and `cite` maps to Writing (`tools.ts:10`) (V).

**What reads `project.stage` today (V):**
- `Workspace.tsx:168`: the first tool shown on load, unless `settings.toolTab` remembers one.
- `Workspace.tsx:259`: jumps to the stage's first tool when switching project, unless the project is complete.
- `Workspace.tsx:314`: `currentStage`, which `Sidebar.tsx:43` uses for the `current` class and `Popout.tsx:85` also computes.
- The badges at `ProjectBar.tsx:21` and `Projects.tsx:76`.
- `lib/vault/export.ts:6,84`: `stage` in the export's `index.json`.
- Settings `toolTab` (max 20 chars) and `stageGroupsCollapsed` (max 6 entries) (`me.ts:14,16`).

**What depends on this.**
- **Tests that will break (V):**
  - e2e `phase2-walkthrough.spec.ts:165-175` (stage-intro, `stage-idea` with class current, "Stage 1 of 6").
  - `stage2-idea-literature.spec.ts:343-352` (`sap-stage`, stage-intro, stage-counter), `:390` (stage 2 counter) and `:800-806` (step 12 "Next: Design & Ethics").
  - `phase2-responsive.spec.ts:24,65-72` (stage-counter in the sheet).
  - Unit: `apps/web/test/tools.test.ts`, `dock.test.tsx`, `popout.test.tsx`, `i18n.test.ts`. API: `apps/api/test/app.test.ts:77-80` (POST with stage).
- **Walkthroughs:** `docs/walkthroughs/stage-2.md` row 1 ("Stage 1 of 6 · Idea & Feasibility") and row 12 ("Move on"), and `phase-2.md` stage-intro steps (V).
- **i18n:** `stage_*`, `stage_guide_fmt`, `stage_guide_back`, `stage_guide_next`, `stage_guide_final`, `stageintro_*` and `tab_*` keys in en and hi (V). The redesign's copy rule "no numbered stage labels" removes `stage_guide_fmt` outright.
- **Register:** new rows for the stage guide, stage intro and sidebar layout. The register has no existing row about the guide; D-S2-1 to D-S2-21 are tool rows (V).
- **Old data:** every live project has a `stage` value. Keeping the column (it is non-null with a default) and simply not reading it is the non-destructive path. Dropping it would break the export `index.json` shape and the API contract test (I).

**Second-order effects.**
- **Where state can come from.**
  - `GET /projects/:id/blobs` returns `{kind, keyVersion, updatedAt}` without bodies or decryption (`blobs.ts:25-28`, `BlobSummary` in `store/types.ts:34`) (V). So "Not started", "In progress" and "Started early" can be derived from which kinds exist, before unlock.
  - But caches are not student work: `retraction_cache`, `refcheck_cache`, `rs_prefs`, `shelf_cols` and `ap_cols` must be excluded (I).
  - An `idea_intake` blob can exist with empty fields, because every keystroke saves after 800 ms (`useProjectBlob.ts:12`). "Started" may need the decrypted body, and so an unlock (I).
- **Stages 3 to 6 have no blob kinds yet** (`BLOB_KINDS` holds stage 1 and 2 kinds only). Writing is evidenced by documents (`documentCount` and `lastEditedAt` in `ProjectSummary`, `types.ts:19`). Until stage 3 and later are built, their states will always read "Not started" (I).
- **"Ready" and "Reopened" need storage that does not exist.** Options:
  - A new plaintext column, for example `stage_marks jsonb`, which is consistent with today's metadata ruling but needs a migration.
  - A new encrypted blob kind, which is readable only after unlock.
  - Either way, "Reopened" compares the time of the ready mark with the newest `updatedAt` of that stage's work kinds. Caches would trigger false "Reopened" states if counted (I).
- **The project list's six states.** `GET /projects` returns no blob summary (`drizzle.ts:101-110`), so showing six states for N projects needs N extra `GET /blobs` calls or a new aggregate endpoint (I).
- **The "where to land" rule is lost.** `Workspace.tsx:168,259` lands the student on the stage's first tool. The draft does not say what opens instead: the project home or the last place. `settings.toolTab` would need a new value space (stage plus tab), which means a SettingsSchema change in the API first (I).
- **v1 import.** The v1 stage is already dropped (§0.7). With derived states this no longer matters for imported projects (I).
- **MCP:** the planned `list_projects` tool (`docs/superpowers/specs/2026-10-13-appuscholar-v2-design.md:104`) would have to derive states server-side, which works only from kind existence and not from content (I).

**Risks.** A partial switch, where the guide is derived but the badge still reads `project.stage`, keeps fault 29 alive. All six readers listed above must change in one release (I).

### D1b. The document opens beside any stage

**Where it lives.**
- The workspace grid is Sidebar, then DocumentCard, then Dock (`components/workspace/Workspace.tsx:359-364`) (V).
- The editor is always mounted once `ready`, whatever tool is open. There are no per-stage routes: `app/(app)/page.tsx` renders `<Workspace/>` and `/projects` redirects to `/` (V).
- The Dock is 320 to 760 px (`settings.dockW`, `me.ts:18`). At 700 px or less the phone layout uses a bottom sheet (`sheetPct` 40 to 85) (V).

**What depends on the editor being mounted.**
- Every insert assumes an editor:
  - Cite insert, reference list and quote (`lib/cite/*`).
  - AI Tab-accept (`lib/ai/suggestion.tsx`) and `insertAiText` with the gold `ai-ins` span (`lib/editor/insert.ts:27-33`).
  - The pop-out's BroadcastChannel `insert` messages to the writing window (`lib/popout/channel.ts`) (V).
- The selection bubble lives inside DocumentCard (`components/document/SelectionBubble.tsx`) (V).
- Autosave flushing works through `registerFlush` and `flushOpen` (`Workspace.tsx:318`) (V).

**Second-order effects.**
- If a stage can show without the document, every "Insert" needs a defined behaviour when no document is open: open it beside, queue the insert, or disable the button. The draft does not specify this (I).
- Unmounting the editor must flush autosave first, or text is lost (I).
- Tests that assume the three-column grid: `phase2-responsive.spec.ts`, `workspaceDocSwitch.test.tsx`, `dock.test.tsx` (V).

### D1c. One export place

**What exists today:** 11 separate downloads (V).

| Export | File | Where |
|---|---|---|
| Search list | `search-results.csv` | `lib/research/extras.ts:53-58`; button `rs-csv`, `ResearchPanel.tsx:153` |
| Reading matrix | `reading_matrix.csv` | `lib/shelf/actions.ts:131-133`; `ShelfDialog.tsx:105` |
| Shelf backup | `appuscholar-shelf-YYYY-MM-DD.json` | `actions.ts:144-147`; core `shelf.ts:212` |
| Paper cards | `paper_cards.csv` | `lib/analyse/cards.ts:38`; `Across.tsx:61` |
| One card | `paper-card.txt` | `cards.ts:33`; `Card.tsx:49` |
| Citation library | `psychology-class-library.json` | `lib/cite/share.ts:29-31`; `CiteShare.tsx:30` |
| Word, LaTeX | `<title>.doc`, `<title>.tex` | `lib/export/word.ts:8`, `latex.ts:112`; `DocumentCard.tsx:55-81` |
| Writing record | `writing-process-record.txt` | `MyWriting.tsx:46` |
| Recovery sheet | `appuscholar-recovery.txt` | `RecoverySheet.tsx:9,31` |
| Account zip | `appuscholar-export-YYYY-MM-DD.zip` | `lib/vault/export.ts:25-88`; `Help.tsx:73-85` |

**What depends on it.**
- **Tests (V):**
  - e2e `stage2-idea-literature.spec.ts:541,601,694` (the three CSVs).
  - e2e `phase2-walkthrough.spec.ts:254,277-279` (record, .doc and .tex).
  - e2e `phase3a-vault.spec.ts:280-290` (the zip).
  - Unit: `shelf.test.tsx:217,228,554,578`, `researchExtras*.test`, `citeImportExport`, `analyse`, `analyseWalk`, `word`, `latex`, `vaultExport.test.ts:40-105` and `eraseAccount.test.tsx:146`.
- **Audit:** only the account zip writes an audit row (`POST /me/export-audit`, `me.ts:69-72`) (V). One export place should decide whether every export is audited (I).
- **Register:** D-S2-9, D-S2-11 (library export), D-S2-13 (CSV) and D-S2-14 (shelf backup) describe the per-tool buttons (V).

**Second-order effects.**
- The account zip omits all stage data (§0.5). The "one export place" is the natural fix, but it means the zip must read and decrypt every blob kind, including the shelf text. Shelf papers are up to 200 pages each (`shelf.ts:128`), so zip size and memory grow (I).
- The shelf backup JSON is today the only way to move shelf PDFs' text between accounts. Keep it reachable (I).
- Copy: fault 24 points to a "Settings, Backup" that does not exist (walk notes). The export place must be the target that copy names (I).

### D1d. "Needs your attention" list

**What exists today.** There is no stored aggregate anywhere (V).
- The retraction cache is keyed by normalised DOI, `{r, t}` (`apps/web/lib/blobs/kinds.ts:35`).
- The Crossref cache is keyed by citKey `surname|year|lowercase title`, `{s, m, f, viaTitle, t}` (`kinds.ts:37-47`).
- Summaries are computed when shown (`lib/cite/checks.ts:35,90`, `CiteChecks.tsx:21-31,57-60`).
- The Analyse numbers check and the paper's reference check live in module memory only (`lib/analyse/useApDoc.ts:54,79`) and are never stored (V).

**Second-order effects.**
- A home-screen list needs either a new blob kind (the API lists first, §0.2), or decrypting `citations` plus both caches on home, after unlock (I).
- Numbers-check failures cannot appear in it unless Analyse results start being stored (a new kind) (I).
- **Cache-key fragility.** A fix applied through the list (for example, filling a missing author) changes the citKey. The old `refcheck_cache` entry is orphaned and the item would reappear as unchecked (`citlib.ts:41`) (I).
- The pop-out can write `citations` but not `refcheck_cache` (`lib/popout/mode.ts:19-30`) (V). A fix made from a popped-out window cannot clear its own attention item.

### D1e. Literature split into tabs: Find, Reading list, Compare, Citations

**Where it lives.**
- `TOOL_TO_STAGE` places research, psych and analyse in `lit`, but `cite` in `writing` (`tools.ts:8-11`) (V).
- `STAGE_FIRST_TOOL.writing = "cite"` (`tools.ts:12`) (V).
- `BUILT_IN` and `PANELS` are pinned equal by `dock.test.tsx` (`tools.ts:25`, `Dock.tsx:19-20`) (V).
- `canPopOut` covers cite and research only (`tools.ts:42`) (V).
- `ToolId` values are stored in `settings.toolTab` (V).

**What depends on it.**
- Moving Citations into Literature changes Writing's first tool and the `cite` mapping. Remembered `toolTab` values in users' settings must still resolve; `isToolId` silently falls back today (`Workspace.tsx:168`) (V).
- i18n `tab_*` and `tab_*_title` keys (V).
- e2e test ids `tool-research`, `tool-psych`, `tool-analyse` and `tool-cite` are used throughout `stage2-idea-literature.spec.ts` (V).
- Register: D-S2-1 and D-S2-12 (Research panel layout) (V).

### D1f. One "Keep": adds to both the citation library and the reading list

**Shapes stored today (V, `apps/web/lib/blobs/kinds.ts`).**
- `citations` is an array of `CitationEntry`, every field an optional string (:28-33). There is **no id**: an entry is identified by its array position and its title.
- `shelf_index` is `[{id, title, file, size, added, total, kept}]` (:49), with id `'p'+base36(ms)+4 random` (`packages/core/src/shelf.ts:149`). It has no DOI and no link to a citation.
- `shelf_paper:<id>` is `{pages[], notes[], cells{}}` (:52). The matrix cells live inside each paper and are keyed by shelf id.
- `ap_notes` is keyed by `'a'+apSquash(title).slice(0,24)+chars` (`packages/core/src/analyse.ts:72`). The same paper read as an abstract and as a PDF gets two keys.

**How duplicates are judged today (V).**
- Search to library: by title only (`lib/research/library.ts:33`).
- Manual add: by title and author (:69).
- Capture: by exact title and author (`packages/core/src/citcapture.ts:58`).
- Shelf: by file name and size (`lib/shelf/actions.ts:52`).

**Migration of data already stored (I).**
- It must run client-side, because the blobs are ciphertext. It reads `citations`, `shelf_index` and every `shelf_paper:*` through the vault, matches papers by normalised title (the only shared field), and writes back with a normal PUT under the existing dek.
- The `/rewrite` route cannot be used: it is closed after vault completion (§0.4).
- It must also handle keyVersion 0 accounts (vault off) and a locked vault, whose writes are held in `lib/blobs/held.ts`.
- If a new kind is added (for example `reading_list`), it must go into all of these: the API `BLOB_KINDS`, the web `BLOB_KINDS`, the `SCHEMAS` map, `POPOUT_WRITABLE` (`lib/popout/mode.ts:19,28`), the vault migration filter (`lib/vault/migrate.ts:97`, via `isBlobKind`), `apps/api/test/blobs.routes.test.ts:36` and `apps/web/test/useProjectBlob.test.tsx:132`.
- A renamed or merged kind gets a new dek id `blob:<projectId>:<kind>` (`kinds.ts:19`).

**Second-order effects.**
- A reading-list item without a PDF is new: `shelf_index` requires `file`, `size` and `total`, and the shelf takes PDFs only. Either loosen the schema (it is a loose object, so extra fields survive) or add a kind (I).
- Without a stable paper id, Compare (matrix cells keyed by shelf id) and cards (keyed by title and character count) cannot be joined into the "one table" the draft promises (draft §6) (I).
- The e2e's final check requires exactly the kinds `idea_intake, citations, retraction_cache, refcheck_cache, shelf_index, ap_notes, ap_cols` and one `shelf_paper:` (`stage2-idea-literature.spec.ts:816-817`) (V). A new or renamed kind changes that list.
- Test ids `rs-add` (`ResultCard.tsx:66`) and the shelf dialog run through steps 6 and 7 of the spec and the walkthrough (V).
- Register: D-S2-3, D-S2-9, D-S2-12 and D-S2-14 (V).

### D1g. Research helpers move into the document's selection actions

**Where it lives.**
- `components/tools/HelpersPanel.tsx` has five helpers (paper, case, litrev, explain, stats) and "Challenge my argument" (`helper-devil`) (V).
- **Input:** the selection if there is one, otherwise the whole document (`helperText`, `lib/ai/actions.ts:142`). Helpers are cut to 12,000 characters; the devil check needs a minimum word count and is cut to 6,000 (V).
- **Output:** the suggestion pane, accepted with Tab. The devil reply is never inserted (`actions.ts:179`) (V).
- **The cause of fault 25:** the Dock has one tabpanel that shows either the AI pane or the tool (`Dock.tsx:118-126`). `dockShow("ai")` fires at `actions.ts:157,163,175,180` and in `suggestion.tsx:62,69`. That unmounts the helper panel (V).
- **Existing selection bubble:** `SelectionBubble.tsx`, with TipTap BubbleMenu buttons Find papers, Cite and Improve. It shows only for 8 to 800 selected characters (`lib/editor/selectionBubble.ts`) (V).

**Second-order effects.**
- The 800-character bubble limit does not fit helpers that accept up to 12,000 characters, or the whole document when nothing is selected. Moving them into the bubble alone drops the "whole draft" use, for example the literature review helper on a full chapter (I).
- If the prompts are unchanged, the AI-use classification is unchanged (§0.8) (I).
- **Tests:** `helpersPanel.test.tsx`, `helpersActions.test.ts`, `suggestionProvider.test.ts`, `dock.test.tsx`, `chat.test.ts`. e2e step 10 (`stage2-idea-literature.spec.ts:699-745`) clicks `tool-psych`, `helper-litrev` and `helper-devil` (V).
- Register: D-S2-8 (V).

### D1h. Reader tabs replace Analyse a paper's layout; pop-out kept for any stage

**Where it lives.**
- `components/tools/analyse/`: AnalysePanel, Intake, Ask, Numbers, RefCheck, Walk, Card, Across (V).
- Modes ask, walk, card and lesson (`AnalysePanel.tsx:41-51,86-101`). RefCheck sits above the tabs and Across below them (V).
- Page state `AP` is module memory (`lib/analyse/useApDoc.ts:54`) (V).
- Blobs: `ap_notes` and `ap_cols` (`lib/analyse/notes.ts:63-64`), plus a read-only shelf (V).
- Pop-out:
  - `?tool=cite|research` only (`lib/popout/sync.ts:116-127`). Anything else shows `pop_unsupported` (V).
  - It opens its own vault session and reads blobs from the API (V).
  - Its writes are limited to `citations`, `retraction_cache` and the shelf (`mode.ts:19-30`) (V).

**Second-order effects.**
- Reader tabs on a "kept" paper need one paper id. `ap_notes` keyed by title plus character count orphans notes whenever the title or the text length changes, for example after fault 15's retitle or fault 2's longer author list in the abstract head (`extras.ts:23`) (I).
- "Open any stage in its own window" multiplies writers to the same blobs, and there is no concurrency control (§0.1). The pop-out's write guard would have to grow per stage (I).
- **Tests:** `analyse.test.tsx`, `analyseActions.test.ts`, `analyseWalk.test.tsx`, `popout.test.tsx`, `popoutSync.test.ts`, `shelfPopout.test.tsx`. e2e steps 8, 9 and 11 use `ap-tab-*` and `/popout?tool=cite` (V).
- Register: D-S2-2, D-S2-15, D-S2-16 and D-S2-17 (V).

---

## 2. D2: remove emoji from the interface

**Where emoji live.**
- **Dictionaries:** 205 of 1,131 keys in each of en and hi carry emoji or symbols (V, counted by script):
  - 123 have pictographs.
  - 72 have dingbats: ✓ 25, ⬇ 15, ✨ 6, ⚠ 4, ⚙ 3, ✎ 3.
  - 10 have arrows.
- **Code:** 43 component and lib files, 82 lines. Examples (V):
  - `STAGE_EMOJI` (`lib/tools.ts:6`), shown at `Sidebar.tsx:45` and `StageIntro.tsx:23`.
  - `DocBar.tsx:113` (📄 for sources), `:117` (✎) and `:118` (🗑).
  - `Sidebar.tsx:35` (☰).
  - `Numbers.tsx:18`, `CiteChecks.tsx:60,72` and `ResultCard.tsx:52` (✓ and ⚠).
  - `lib/ai/actions.ts` (9 lines), `callAI.ts` (5), `cite/share.ts` (6) and `docMessages.ts:2`.
- **Core engines:** `design.ts:45-55` ("Saved ✓", `REG_WARN` "📐…", ✅ and ⬜ on the dashboard) and `data/chart-tables.ts:24-104` (📈, ⬇, ✓, in en and hi). These are stage 3 and 4 engines (V).

**What depends on them.**
- **The icon rail.** The sidebar's icon-only rail is built from each label's leading emoji (`lib/i18n.tsx:31-36` `splitEmoji` and `plainText`; `Sidebar.tsx:8`). Stripping emoji leaves the collapsed rail with no icons (V).
  - `@phosphor-icons/react` is already a dependency (`apps/web/package.json`) (V), so the "one icon set" exists. It must be wired per tool.
- **Labels.** Accessible names are built with `plainText(t(...))` (`Sidebar.tsx:37-52`). e2e lookups by role name through `T(key)` follow the dictionary automatically (I).
- **Unit tests asserting emoji literals (V):** analyse, analyseWalk, caretChip, callAI, citeImportExport, citeChecks, citeQuote, citeInsert, citePanel, ideaPanel, ideaAction, i18n, popout, suggestionProvider, researchExtras, researchExtrasActions, research, researchSearch, shelf. For example `shelf.test.tsx:396,404` and `analyse.test.tsx:126-147,400`.
  - analyse and analyseWalk also compare against the golden `appanel` text.
- **e2e literals (V):**
  - `phase2-walkthrough.spec.ts:147,160,219,304,306,316-317,370`
  - `phase3a-vault.spec.ts:115,221,242,285`
  - `stage2-idea-literature.spec.ts:334,409,763-764`
- **Golden fixtures with emoji (V):**
  - `design/cases.json` (333 ✓)
  - `appanel/cases.json` (122 ✓, 43 ⚠, plus 🧭🗂💬🧯)
  - `citshare`, `citlib`, `scales`, `fetch`, `charts`, `providers`
- **i18n mechanics.** Edits go through `scripts/i18n-overrides.mjs`, or the byte-equality test fails (§0.11) (V).
  - Hindi is stored by key, so removing an emoji is a per-key override in both languages.
  - The draft's "701 Hindi strings" does not match the code: 1,131 keys, of which 366 Hindi values are English copies. That leaves about 765 distinct Hindi values. Reconcile the figure before costing the Hindi remap (V, counts; the meaning of "701" is unknown).
- **Register:** one copy row for Dr. Sharma, per the copy rule (§0.12).

**Second-order effects.**
- **Leave core engines and golden fixtures alone.** "✓ found in the paper" is the i18n key `ap2_found_in_the_paper` (`en.json:42`), not engine output. The ⚠ on "Year differs" is added in `CiteChecks.tsx`, not in `rc_year` (V). The emoji can come off at the rendering layer without touching any golden test.
  - Engine strings (`design.ts`, `chart-tables.ts`) feed stage 3 and 4 goldens. Strip them in the panel or keep them until stage 3 is built into the frame (I).
- **Do not do this twice.** If D2 runs before the frame's copy rewrite, every one of those 205 keys gets overridden twice, along with its Hindi. Do emoji removal as part of the copy rewrite, not as a separate pass (I).
- **Toast texts change.** The e2e helper `e2e/support/toasts.ts` and step expectations that quote "✓" break (V for the files, I for the extent).
- **Stored or exported text.** Emoji in exported text (`cite/share.ts`) and in AI insertions would change downloaded files that tests pin (I).

---

## 3. D3: lock project titles (and document titles) in the vault; lists after unlock

**Where titles live.**
- `projects.title text not null` (`schema.ts:47`) and `documents.title text not null` (`schema.ts:59`) (V).
- Projects have **no `deks` column**. Only documents (`schema.ts:63`) and blobs (`:92`) do (V).
- API validation is `z.string().trim().min(1).max(200)` for project create and patch, document create, PUT and PATCH (`projects.ts:9,11,16`; `documents.ts:8,10`) (V).
- The server writes one plaintext title itself: "Scratch space" (`drizzle.ts:98`, `memory.ts:84`) (V).

**Who reads titles on the server.** No server path sorts, searches, emails or logs by title, so locking the titles leaks nothing from the server that is not already there. The breakage is all in the client (V).
- `GET /projects` returns them. Sorting is by status, then last edit (`drizzle.ts:108`), never by title (V).
- `GET /projects/:id/writing-record` returns `docs[].title` and `sources[].title` (`projects.ts:70-82`), pinned by `apps/api/test/app.test.ts:113-116` (V).
- **Audit log:** no title is ever written. `appendAudit` is called only with actions and no targets (`me.ts:70`, `vault.ts:45,67,81`). The `project-deleted` and `document-deleted` actions are declared but never appended (`types.ts:46`) (V).
- **AI prompts:** no project or document title is sent. grep of `lib/ai/*` and the prompt builders found none (V).
- **Emails:** none found in this code. Auth is NextAuth (`apps/web/auth.ts`) and was not checked in depth (I).

**Who reads titles in the web (V). Each would show ciphertext unless it decrypts:**
- `ProjectBar.tsx:20,35`
- `dialogs/Projects.tsx:52,75,85,96`
- `dialogs/SaveAsProject.tsx:67,71,81,116`
- `DocBar.tsx:113,117,140`
- `Workspace.tsx:209,351`
- `DocumentCard.tsx:57,63` (Word and LaTeX file names and `<title>`)
- `lib/vault/export.ts:62,67,79-84` (zip folder and file names, `index.json`)
- `Help.tsx:80` and `lib/writingRecord.ts:30,50` (record headings)
- `MyWriting.tsx:68`
- `ImportV1.tsx:47,59,69` and `lib/import/v1.ts:53-54,70`
- `lib/import/run.ts:29-40`: a source document's title is the PDF's file name, so document titles leak paper names
- `Popout.tsx:60`

**What depends on this.**
- **Key choice.**
  - A project title can be sealed under the vault key directly. That blocks Phase 7 sharing of a project's name with a supervisor, because grants wrap a document's DEK, not the vault key (vault design :43).
  - Or it can use a new project-level DEK, which needs a `projects.deks` column and migration 0005.
  - A document title can use the document's existing DEK, which a Phase 7 grant would carry automatically (I).
- **Validation.** A 200-character Hindi title is about 600 UTF-8 bytes. Sealed, that is a 16-character IV, a ".", and about 820 base64url characters, over the current `max(200)` (I). The schemas need a ciphertext branch: the `CIPHERTEXT` shape (`docWrite.ts:12`) plus a title key-version field, so the server can tell sealed from plain.
- **Vault-off accounts** keep plaintext titles, so the column holds both kinds of value and every reader must handle both (V for the vault being optional).
- **Migration of stored titles.**
  - The existing vault migration cannot be reused, because it is closed for completed vaults (§0.4).
  - `countPlaintextRevisions` does not count titles (`drizzle.ts:276-285`) (V).
  - A new path is needed: list, decrypt nothing, seal each title, then a PATCH that accepts ciphertext. A flag recording that it is done is also needed (I).
  - The live walk project "Sleep and exam anxiety" is readable today (walk notes).
- **Tests.**
  - Server blindness checks today cover blobs only (`stage2-idea-literature.spec.ts:810-830`), not titles (V). A title check should be added to that e2e and to the planned "grep every table" test (vault design :52).
  - API tests that post plain titles and assert them (`app.test.ts:35-116`) stay valid for vault-off accounts (I).
  - `vaultExport.test.ts:40-105` pins folder names from titles (V).
- **Spec and docs.** The vault design's non-goal and table (`2026-10-16-vault-design.md:16,35`) and its open question 1 (:79) must be amended. The phase-3a and stage-2 walkthrough notes mention readable titles (V).

**Second-order effects.**
- **Lists before unlock disappear.** Every screen that lists projects or documents (the Projects dialog, the Save-as project select, the project bar on load, the pop-out, the export) must wait for unlock. The project bar shows on load today, before any prompt (I).
- **Sorting by name** would have to happen client-side after decryption. Today nothing sorts by name (V).
- **File names** for Word, LaTeX and the zip must come from decrypted titles. `zipName` of ciphertext would produce garbage folder names, not a failure, so the bug would be silent (I).
- **v1 import** creates a project with a plaintext title (`ImportV1.tsx:59`), so it must seal the title before posting, as it already seals bodies (I).
- **MCP:** a hosted `list_projects` (v2 design :104) cannot show names without the student's browser. That is consistent with the vault's ruling that no server agent holds the vault key (vault design :56,86). Decide hosted versus local before building the MCP door (I).
- **D1a interaction.** If titles are locked, the project home (names plus six states) is post-unlock anyway, so deriving states from decrypted content costs nothing extra (I).
- **Undecryptable titles.** A title that cannot be decrypted (wrong key version, corrupt) needs a fallback label, as `index.json` already does with "unreadable" for documents (`export.ts:55`) (V for the pattern).

---

## 4. The 14 bug fixes

### Fault 1: capture loses PubMed authors, volume and issue

**Where it lives.**
- The bookmarklet reads only `meta[name="citation_author"]` (`packages/core/src/citcapture.ts:15`) (V).
- It reads no `citation_authors`, `citation_volume`, `citation_issue`, `citation_firstpage` or `citation_lastpage` (:16) (V).
- `CaptureData` has no volume, issue or pages (:28). `decodeCapture` keeps six keys (:44). `captureRecord` hard-codes `volume:"", issue:"", pages:""` (:54) (V).
- The landing route is `apps/web/lib/cite/capture.ts:23-35,54-67` (V).

**What depends on it.**
- **Golden:** `golden/citshare/cases.json` (the bookmarklet source and href, plus capture records), asserted by `golden/citcapture.test.ts:21-62` (V).
- **Unit:** `apps/web/test/capture.test.ts` and `citeImportExport.test.tsx:137-149` (the href) (V).
- **e2e:** the capture page fixture has `citation_author` only (`stage2-idea-literature.spec.ts:162`); the confirm text is at :453 (V). Add a `citation_authors` page.
- **Walkthrough:** `stage-2.md:22` (row 4) (V).
- **Register:** D-S2-11 covers capture (V). The new row is D-S2-22 or later.
- **Old data:** stored library entries with an empty author remain. They can be repaired only through fault 27's Crossref fill (I).

**Second-order effects.**
- **Name format.** PubMed's `citation_authors` is "Smith JA; Lee K", with no comma. `citNames` (`citation.ts:62-66`) would read each name as an organisation. The names must be converted to "Last, Initials" as `rsAuthorsToCit` does (I).
- **Every existing bookmarklet is stale.** The bookmarklet source changes, so students must drag the new one. Old bookmarklets keep posting the old shape, which still decodes, because `decodeCapture` ignores unknown keys (I).
- **Duplicates.** Capture dedupe is exact title plus author (`citcapture.ts:58`). After the fix, re-capturing a page captured before (author empty then, filled now) creates a second entry (I).
- **Shared fix.** The redesign's paste-a-link box (draft §6) replaces the bookmarklet as the main path. Fault 1's tag reading is still needed for the bookmark, which stays as an extra (draft §6).

### Fault 2: search keeps only 4 authors; no volume, issue or pages

**Where it lives.**
- The cut to 4 is at `fetch/openalex.ts:39` (search), `:62` (`rsOaBrief`, connected papers) and `fetch/pubmed.ts:52` (V).
- `rsEntryFromResult` sets `volume:'', issue:'', pages:''` (`research.ts:156-160`, verified at :158). Its caller is `lib/research/library.ts:32` (V).
- **Neither source is asked for those fields.** OpenAlex's `select` has no `biblio` (`openalex.ts:28`), and PubMed's esummary type leaves the fields out (`pubmed.ts:19`). The recorded PubMed bodies already contain volume and pages (V).
- **Old data.** Search results are not stored (no blob kind), so no truncated author strings exist in storage. Library entries saved before the fix hold 4 names with no "et al." marker, so they cannot be detected later (V or I). The only repair is fault 27's Crossref fill.

**What depends on it.**
- **Golden** (V):
  - `golden/fetch/cases.json`: 116 "et al." strings across searches, 3 in `connected`. Asserted by `test/fetch/openalex.test.ts:58-145` and `pubmed.test.ts:17-37`.
  - `golden/research/inputs.json` `authorStrings`: still valid as the reader for old strings.
- **Recordings** (I): adding `biblio` changes the OpenAlex URL, so all 61 files in `packages/core/test/fetch/recorded` and those in `apps/web/e2e/fixtures/recorded` must be re-recorded.
- **Unit** (V): `research.test.tsx:405,433`; `researchLocked.test.tsx:134`; `researchSearch.test.ts:268,283-338`; `researchExtras.test.tsx:346-357` and `researchExtrasActions.test.ts:296-308` (CSV).
- **e2e** (V): CSV at `:541`; library cards at `:546-550`; reference list at `:775-778`.
- **CSV:** `rsCsvText` has 12 fixed columns (`research.ts:94-98`). The Authors cell gets longer; no column changes (V).
- **Register:** a new row. These fixtures come from running v1, so a changed output is a row, never a hand-edited fixture (`parity-deviations.md` rules) (V).

**Second-order effects.**
- **Citation formatting** (`citation.ts:91-167`) (V):
  - Reference lists start receiving real author counts: APA up to 20 then ". . .", APA 6 up to 7, Chicago cut above 10, Vancouver max and keep, IEEE "et al." above 6.
  - In-text: APA 6 switches to "et al." at 6 or more, but prints every name today for 4 or 5 authors.
- **Prompt size.** `rsCorpusText` puts authors into the gap and literature review prompts (`research.ts:161-165`). Up to 25 papers, each with up to hundreds of authors, can approach the 60,000-character cap (§0.9). Cap the authors in prompts only (I).
- **Analyse notes.** The abstract head includes authors (`extras.ts:23`), so the `ap_notes` id (title plus character count) changes for papers with more than 4 authors. Earlier notes won't load (I).
- **Connected-papers** fixtures change (V).

### Fault 3: "Papers that cite this one" always empty

**Where it lives.**
- `oaConnected` fetches citing papers only if `citedByApiUrl` is set (`fetch/openalex.ts:75`). That value comes from `w.cited_by_api_url` (:45), which OpenAlex no longer returns, so it is always "" (V).
- The citing request does not add the API key either (:76) (V).
- This is already recorded as an unfixed defect in register row D-S2-20 (`parity-deviations.md:70`) (V).
- The web caller `lib/research/extras.ts:84` has `o.oaId`, so it can build `filter=cites:<id>` (V).

**What depends on it.**
- `test/fetch/openalex.test.ts:135-162` (line 160 pins "key on the referenced-works URL only") (V).
- The golden fetch `connected` entries and `capture.ts:24-25,254-261` (V).
- A recording for `filter=cites:W2487945683` already exists (`recorded/oa-connected-citedby-1f5ab921.json`) (V).
- **e2e:** `:522-523` expects "(0)" and "None found". Only `oa-connected-dordinejad` is recorded, so a cites URL must be added to `capture.mjs:23-24` or the spec fails (V).
- Unit: `researchExtras.test.tsx:420`. Walkthrough: `stage-2.md:23` (V).
- **CSP:** no change; OpenAlex is already allowed (V).
- **Register:** update D-S2-20 or add a row (V).

### Fault 7: the idea check prints "Area:"

**Where it lives.**
- `buildIdeaPrompt` says `Write each area as "Area: Low/Medium/High. ..."` (`packages/core/src/prompts-idea.ts:18`) (V).
- No parser: the raw reply goes to the pane (`lib/ai/actions.ts:113-116`, `AiPane.tsx:20`) (V).

**What depends on it.**
- **Golden:** `golden/prompts-idea/cases.json` (9 cases), checked character for character in `prompts-wave1.test.ts:70,115-129` (V).
- **AI-use:** the classifier phrase `judge whether a project idea is realistic` (`aiuse.ts:15`) must survive the rewrite (V; §0.8).
- **e2e:** the prompt is matched by its opening words (`:126`). The recorded reply already names the areas (`:79`); assertions are at `:373` (V).
- **Walkthrough:** `stage-2.md:20` (V).
- **Register:** F25 (no scoring code), D-S2-7 and D-W1-9 exist. A new copy row is needed, and it goes to Dr. Sharma (walk notes) (V).

**Second-order effects.**
- **Old outputs.** Earlier assessments live in the student's document as AI text, so they don't change (I).
- **Quality track.** Rated lines are free text with no scoring code. The quality track has nothing to assert on unless the format becomes parseable (I).

### Fault 8: idea boxes look empty while the vault loads

**Where it lives.**
- `IdeaPanel.tsx:27-30`: `waiting = loading || projectId === null`. The fields are disabled and show `value ?? EMPTY`. There is no loading sign (V).
- `useProjectBlob.ts:96-102`: `loading: !attempted` stays true through GET, decrypt and the passphrase prompt (:113-115) (V).
- `:377-379`: a new key starts at `loading:true` (V).

**The same pattern elsewhere (V):**
- `CiteLibrary.tsx:47-50`: shows 0 sources (via `useLibrary.ts:97`, `value ?? []`).
- `shelf/Papers.tsx:50` and `Matrix.tsx:56`: "The shelf is empty".
- `Papers.tsx:43`: "pages only" while each paper loads.
- `analyse/Across.tsx:20`: draws nothing.
- `analyse/Intake.tsx:20`: an empty dropdown.
- `research/ResearchPanel.tsx:51,73`: the default rank box.

**Effects.** This is not one fix but one shared loading component used by seven panels. Their tests (`ideaPanel`, `citePanel`, `shelf`, `analyse`, `research`) assert the empty states and change (I). Do it before the frame so the frame's lists and skeletons reuse it.

### Fault 9: the version pill reads "dev"

**Where it lives.**
- The pill is at `Header.tsx:48` (`app-version`). The same value appears in `Help.tsx:123` and in the record text (`Help.tsx:81`, `MyWriting.tsx:46`) (V).
- Source: `lib/version.ts:2` reads `NEXT_PUBLIC_BUILD_SHA || "dev"`. `next.config.ts:7` maps `VERCEL_GIT_COMMIT_SHA ?? GITHUB_SHA` (V).
- `turbo.json` has no `env` or `passThroughEnv` (V). Turbo 2.11's strict env mode would hide `VERCEL_GIT_COMMIT_SHA` from `next build` when built through `turbo run build` (I; Vercel's build command for the web app was not seen in the repo).
- CI builds with `pnpm --filter … build`, which bypasses turbo, so CI cannot show the bug (V).

**Effects.**
- **Tests** check only `/^Version \S+$/` (`phase2-walkthrough.spec.ts:166`, `stage2-idea-literature.spec.ts:339`), so "dev" passes (V). Add an assertion that it is not "dev" in a production-like build (I).
- **Every walkthrough** asks the tester to record the build from this pill (`stage-2.md:15`), so this blocks honest walk records. Fix it first.

### Fault 12: search noise

**Where it lives.** `rsBuildQuery` (`packages/core/src/research.ts:118-127`) (V):
- OpenAlex: `(q) OR "t1" OR …`.
- PubMed: `(q) OR "t"[tiab] …`.
- The topic is neither quoted nor field-tagged, and no MeSH terms are used.
- The terms are the AI's suggestions (`prompts-research.ts:40-44`), filtered only by `rsCleanTerm` (`research.ts:112-117`).
- `withFallback` re-searches the topic alone on failure (`fetch/types.ts:26-32`).

**Likely cause** (I): PubMed reads the unquoted "exam anxiety" term by term, and the AI's terms are ORed in, so one broad term can pull in a stroke trial.

**What depends on it.**
- **Golden:** `golden/research/cases.json` `queries` (16 inputs), checked in `research.test.ts:71` (V).
- **Recordings** (V): `pm-esearch-terms-*`, `oa-search-terms-*` and their fallback files. `capture.ts:87` hard-codes a terms URL. The `pm-efetch-*` files go stale if the returned ids change (I).
- **Tests:** the rspanel golden, the e2e "both-terms" search (`:56-58`), `researchSearch.test.ts` and `research.test.tsx` (V).
- **i18n:** `rs2_also_search_for_untick` ("…adds them … with OR") at `en.json:654` and `hi.json:654`; walkthrough `stage-2.md:21` (V).
- **Register:** a new row. D-W1-13 covers deduplication only (V).

**Order.** Batch this with faults 2 and 3: all three change request URLs, so the fixtures are re-recorded once.

### Fault 15: shelf names a paper by its first line

**Where it lives.**
- `shTitleGuess` (`packages/core/src/shelf.ts:143-146`) takes the first line of page 1 longer than 8 and shorter than 180 characters, or else the file name (V).
- It is called at `lib/shelf/actions.ts:67` (add) and `lib/analyse/intake.ts:54` (direct PDF in Analyse) (V).
- Restore keeps the stored title (`actions.ts:177`); rename is at `:81-83` (V).
- `parseBlob` is zod only (`kinds.ts:139-146`), so there is no on-load migration (V).

**What depends on it.**
- **Golden:** `golden/shelf.test.ts:74-76,136` and `golden/appanel.test.ts:48` pin `shTitleGuess` (V). Fix it in the web layer (a DOI lookup or a match to the library) and keep the v1 guess as the fallback, so the goldens hold.
- **e2e:** `SHELF_TITLE` at `:66`, asserted at `:569,573,617,818` (V).
- **Where the title shows downstream** (V):
  - Matrix (`Matrix.tsx:43,46`).
  - `reading_matrix.csv` (`actions.ts:132`).
  - The shelf backup (`:138`).
  - Reader (`Reader.tsx:44`) and the passages ResultCard.
  - The Analyse picker (`analyse-page.ts:35`, cut to 90) and `intake.ts:93-96`.
- The summary prompt does not use the title (`ai/actions.ts:347-361`) (V).

**Second-order effects.**
- **Retitling orphans notes.** Retitling an existing shelf paper changes its `ap_notes` id (title plus character count, `analyse.ts:72`), so its walk-through notes and card disappear (I). Fix titles for new papers only, or re-key `ap_notes` in the same change.
- **Paper identity.** A DOI found on the page is the natural stable paper id that D1f and D1h need. Store it in `shelf_index` (the loose schema keeps extra fields) (I).

### Fault 18: the summary misses limitations

**Where it lives.**
- `buildShelfSummaryPrompt` sends only the first 12,000 characters (`packages/core/src/shelf.ts:186-195`, `SHELF_SUMMARY_MAX_CHARS` at :188, verified) and tells the model to write "not reported" for anything missing (V).
- Output is capped at 1,000 tokens (V).
- Limitations sections usually sit after the first 12,000 characters (I).
- **Ask** retrieval (`apPick`, `analyse.ts:74-88`) works to a budget of 9,000 characters for Ask and 10,000 for Walk (`prompts-analyse.ts:36,44`), in passages of about 700 characters (`analyse.ts:63`). It says so on screen (`ap2_the_paper_is_long`) (V).

**What depends on it.**
- **Golden:** `golden/shelf/cases.json` via `shelf.test.ts:164-178` pins "(first 12,000 characters only)" (V). `prompts-analyse/cases.json` is unaffected unless Ask's budget changes too (V).
- **AI-use:** the classifier phrase `helping a … read a paper` (`aiuse.ts:18`) must stay (V).
- **Tests:** unit `shelf.test.tsx`; the e2e `SHELF_SUMMARY_REPLY` matched by prompt (`:108,134`) (V).
- **Walkthrough:** `stage-2.md:25-26` (V).
- **Register:** a new row; this is a numbers-adjacent change to a v1 constant (V).

**Second-order effects: token cost and limits.**
- A 6-page paper is 25,000 to 40,000 characters, roughly 6,000 to 10,000 input tokens, against about 3,000 today. That is 2 to 3 times the input cost of each summary on the student's own key (I).
- A paper over about 59,000 characters breaks the API's 60,000-character prompt cap (`ai.ts:16`) and gets a 400 "invalid". A 30-page paper is about 150,000 characters (I).
- Groq and OpenRouter free tiers have tokens-per-minute limits, so long prompts risk 429s. The client then fails over to another provider, which costs the student on another key (I).
- The personal-data scan over a whole paper hits more affiliations and phone numbers, so the confirm dialog appears more often (I).
- **Better design** (I): target the sections, not the whole paper. Send the abstract, Methods and Discussion or Limitations, found by heading, within a fixed budget, as `apPick` already does for Ask. Raise the API cap only if a full-paper mode is approved. That would be an API change, deployed first.
- Provider context windows were not verified. The configured models (`packages/core/src/providers.ts:11-37`: gemini-3.8-flash, gpt-oss-120b, deepseek-chat, llama-3.3-70b free, gpt-4o-mini, claude-haiku-5-5) are expected to hold 40,000 characters (I).

### Fault 20: Analyse load race

**Where it lives.**
- `fromShelf` (`lib/analyse/intake.ts:91-96`) awaits `readPaperOnce` (`useShelf.ts:60-71`: GET, decrypt and possibly a passphrase prompt), then calls `loadPaper`. It never checks whether that request is still the current one (V).
- `fromSample` (`:99-101`) is synchronous, so a slow shelf read finishing afterwards overwrites it. `fromFile` (`:47-58`) has the same problem (V).
- A `gen` counter already exists in `useApDoc.ts:26,71` but is not checked here (V).

**Tests.** `analyse.test.tsx:209-261` has no race case. The e2e awaits `ap-head` between the two choices (`:614-620`), so it cannot catch the race (V).

**Effects.** No data migration. Fix it before the reader tabs, which rely on "one paper at a time, named at the top" (draft §6) (I).

### Fault 21: the typo "Appuscholer"

**Where it lives.**
- Four keys in en and hi: `ap2_check_what_appuscholer_read` (`en.json:27`), `ap2_give_appuscholer_a_research` (:44), `ap2_made_with_appuscholer_parts` (:50) and `ap2_none_the_text_has` (:65) (V).
- Used at `AnalysePanel.tsx:33,81` and `lib/analyse/cards.ts:21` (V).

**What depends on it.**
- Tests: `analyse.test.tsx:127`, `analyseWalk.test.tsx:346`, and the golden `appanel.test.ts:83,125` with `appanel/cases.json` (24 occurrences, captured from v1) (V).
- The paper-card text also goes into the `paper-card.txt` export (`cards.ts:21`) (V).
- Other hits are v1 path names (`appuscholer/index.html`) in scripts and docs, and must stay (V).

**Effects.**
- This is v1 copy, so the fix goes through `scripts/i18n-overrides.mjs` (§0.11) with a copy row (V).
- The web tests that compare against the golden `appanel` text (`analyse.test.tsx:267`, `analyseWalk.test.tsx:340`) will then differ. Compare after the override, not raw (I).
- The keys themselves contain the typo. Leave the key names alone, because renaming touches every test.

### Fault 26: the gap finder names "Paper 1" and gives non-gaps

**Where it lives.**
- `buildGapFinderPrompt` asks "which numbered paper(s) it comes from" (`packages/core/src/prompts-research.ts:54-58`) (V).
- Its metadata comes from `rsCorpusText` (`research.ts:161-165`) (V):
  - `[n] authors (year). title. venue|source.`
  - The abstract, or "not available".
  - A retraction warning.
  - Authors cut to 4 (fault 2).
  - No design, sample, DOI or quick-read result.
- The literature review prompt shares `rsCorpusText` (`prompts-research.ts:49`), so changing it changes the review too (V).

**What depends on it.**
- **Golden:** `prompts-research/cases.json` (gap 6, review 6) and `research/cases.json` `corpus` (V).
- **AI-use:** the classifier phrase `find a research gap` (`aiuse.ts:14`) (V).
- **Tests:** the e2e `GAP_REPLY` is matched by prompt (`:133`); unit `researchExtrasActions.test.ts` (V).
- **Walkthrough:** `stage-2.md:28`. **Register:** D-W1-9 exists; a new row is needed (V).

**Order.** Do this after fault 2: naming authors needs the full author list. Cap the authors inside `rsCorpusText` for prompt size (I).

### Fault 27: the Crossref check passes a source with no author

**Where it lives.**
- `rcCompare` (`fetch/crossref.ts:33-45`, verified) (V):
  - An empty author gives `citLastName` of 'Author', and the author comparison at :43 is skipped.
  - An empty year is skipped (:41).
  - Volume, issue and pages are never compared.
  - The status is 'ok' whenever there are no messages (:73,78).
- The UI is `rcRun` (`lib/cite/checks.ts:103-125`) and `RcLine` (`CiteChecks.tsx:64-77`). The message is key `rc_ok` (`en.json:584`, `hi.json:584`) (V).
- **There is no fill today.** `RcCheck.f` stores only title, year, first family name and DOI (`crossref.ts:24`). `useLibrary` offers add, remove and a generic update, with no field edit (`lib/cite/useLibrary.ts:102-114`) (V).
- **Reusable:** `crToEntry` and `crLookupDoi` (`crossref.ts:94-113`) already build a full entry with every author, volume, issue and pages (V).

**What depends on it.**
- **Cache schema.** `RcCheckSchema` has a strict enum for `m.k`: title, year, author (`kinds.ts:42`). Adding a "missing" kind makes an older client read the whole `refcheck_cache` as broken. Ship the schema change before any write of the new kind (V for the enum, I for the effect).
- **i18n.** New `rc_*` keys in en and hi. `i18n-coverage.test.ts:124-128` enforces the rs2, ap2 and sh2 prefixes only, so a missing Hindi `rc_` key would not be caught (V).
- **Tests:** `citeChecks.test.tsx:336-360` and the e2e `:759-764` (summary "o:3", `rc_ok` lines) (V).
- **Walkthrough:** `stage-2.md:29` (V).
- **Register:** D-S2-10 exists; a new row is needed (V).

**Second-order effects.**
- **Filling breaks two links.** Filling a missing author changes the citKey (surname|year|title, `citlib.ts:41`), which orphans the cache entry. "(Author, 2011)" citations already in the student's document then no longer match `citRegex` (`citlib.ts:59-60`), so usage counts and the reference list's in-text check drift (I).
- **Pop-out.** The pop-out may write `citations` but not `refcheck_cache` (`mode.ts:19`) (V).
- **Consent.** Consent needs a per-field preview. This is the only repair path for entries already damaged by faults 1 and 2 (I).

### Fault 28: incomplete APA references

**Where it lives.**
- The 'Author' fallback is at `citation.ts:93` (APA), `:102` (APA 6) and `:154` (`citWho`); `apaHead` adds the full stop at `:99` (V).
- The APA journal tail already uses volume, issue and pages correctly (`:306-309`). They are empty only because capture and search never fill them (V).
- The reference list sorts by `citLastName`, so an authorless source sorts as "Author" (`citlib.ts:91-105,96`) (V).

**Effects.**
- **Root cause is upstream.** Fault 28 is fixed by faults 1, 2 and 27, not by touching the formatter. `golden/citation/cases.json` (16 "Author. (" outputs) and `citlib/cases.json` (2) stay valid (V).
- **Register:** F23 ("every style rule marked CHECK", awaiting Dr. Sharma or a librarian) still covers the formatter's unverified rules (`parity-deviations.md:17`) (V).
- **Attention items.** The "Needs your attention" list should flag missing author, volume, issue or pages before insertion (draft §5) (I).

---

## 5. Order constraints

1. **Fault 9 first.** The walk record depends on the pill (`stage-2.md:15`). It is a turbo or env config fix with no data risk.
2. **Register housekeeping before any change.**
   - Stop using walk fault numbers as ids (they collide with F1, F2, F3, F7, F12, F18, F26, F27 and F28).
   - Start at D-S2-22.
   - Add one row recording OJ's 2026-10-20 decision ("parity for what tools do, not for layout, flow and wording"), so that copy rows are not each blocked on Dr. Sharma by the register's copy rule.
3. **Fault 2 before faults 26, 27 and 28.** Full authors, volume, issue and pages must exist before gaps can name authors, Crossref can compare and fill, and references can be complete. Fault 1 goes in the same change.
4. **Faults 2, 3 and 12 together.** All three change request URLs. Re-record core and e2e fixtures once.
5. **Fault 27's schema widening before its writes.** Change `RcCheckSchema` to accept the new kind and deploy that, then start writing it. `useLibrary` needs a field-level edit first.
6. **Fault 15 together with re-keying `ap_notes`,** or limit fault 15 to new papers. Otherwise retitling orphans walk-through notes and cards.
7. **Fault 20 before reader tabs (D1h).**
8. **Fault 8's shared loading component before the frame,** so the frame's lists and skeletons reuse it.
9. **Fault 18: fix the API cap before the web prompt.** Decide the budget under 60,000 characters, or raise the cap in the API and deploy it before the web change.
10. **Faults 7, 18 and 26:** keep the AI-use classifier anchor phrases (`aiuse.ts:14,15,18`), or update `AIU_RULES` and its golden test in the same change.
11. **Faults 21 and D2 go through the i18n overrides layer,** never hand-edited JSON. **D2 belongs with the frame's copy rewrite**, not as a separate pass, so the 205 keys and their Hindi are touched once.
12. **The stable paper id before Keep, Compare and reader tabs (D1f and D1h).** Use the DOI where known, otherwise a generated id. Then the client-side merge migration of `citations`, `shelf_index`, `shelf_paper:*` and `ap_notes`.
13. **API and DB before web for every D1 storage change** (§0.2, §0.3). In order:
    - Run the migration on Neon by hand (stage marks, project deks).
    - Deploy the API (new kinds, settings keys, ciphertext titles, aggregate list).
    - Deploy the web.
14. **D3 before the project home and list (D1a).** Whether titles are locked decides whether home is pre- or post-unlock, and where stage states are computed. D3 also needs:
    - A key choice (vault key or project DEK) before Phase 7 sharing.
    - A new migration path, because completed vaults close the old one.
    - A decision on whether the MCP door is hosted or local, before `list_projects` is designed.
15. **Add stage data to the account zip before removing per-tool downloads (D1c).** Otherwise data leaves the export.
16. **All six readers of `project.stage` switch in one release (D1a),** or faults 10 and 29 survive in some screen.
17. **Stage 3 into the frame only after** the kind-to-stage map, the stage-state storage and the Keep id model exist. Stage 3 adds blob kinds that must declare their stage and whether they count as work.
18. **Make the stage 2 e2e blocking** (remove `continue-on-error`), or re-walk live after each step. Today a redesign can break the journey spec without CI noticing.

## 6. Omissions in the draft

1. **The account export leaves out every stage's data:** idea, library, shelf text and highlights, matrix, cards, walk-through notes (`lib/vault/export.ts:57-88`). "One export place" must include them, and that is also a DPDP gap today.
2. **No concurrency control on blobs.** A PUT is last-write-wins with no version check (`blobs.ts:39-58`).
   - Fault 13's second tab, "open any stage in its own window", and the document beside every stage all increase lost-update risk.
   - The draft's "one tab per project" has no mechanism behind it.
3. **There is no stable paper identity.**
   - Citations are identified by array position and title, shelf papers by a random id, notes by title plus character count.
   - Keep, the reading list, Compare's one table, reader tabs and attention items all need one.
4. **Storage for stage states is not designed.** Needed:
   - Where "Mark ready" lives.
   - Which blob kinds count as work and which are caches.
   - An aggregate endpoint so the project list can show six states without N+1 calls.
   - Stages 3 to 6 have no data kinds yet, so their states mean nothing until built.
5. **What opens when a project is opened.** Today it is the stage's first tool (`Workspace.tsx:168,259`). The draft does not replace that rule or the remembered `toolTab`.
6. **Inserting with no document open.** Cite, reference list, AI Tab-accept and pop-out inserts all assume a mounted editor.
7. **The paste-a-link box conflicts with the CSP.** `connect-src` allows only OpenAlex, PubMed and Crossref, and the API is "never a proxy" (`proxy.ts:6-14`).
   - Arbitrary URLs need a server fetch or a narrower promise: DOI, PMID and arXiv ids only.
   - "Open-access PDFs come in automatically" (draft §3) needs new hosts (for example Unpaywall and publisher CDNs) plus CORS.
8. **The AI-use log is classified by prompt wording** (`aiuse.ts`). Prompt rewrites from the AI-quality track can silently relabel the student's AI-use statement. The log also has no token or size counts, and the API has no rate limit.
9. **The AI quality track has no harness.** Golden prompt tests pin prompt text only. Nothing runs a model or scores grounding. The 60,000-character cap and provider tokens-per-minute limits bound "read the whole paper".
10. **Process rules in the register and i18n.**
    - Every copy change is a register row for Dr. Sharma.
    - The i18n files must be changed through the overrides layer (byte-equality test).
    - Register ids collide with the walk's fault numbers.
    - The Hindi count in the draft (701) does not match the code (1,131 keys, 366 of them English copies in Hindi).
11. **Vault-off accounts.** The vault is optional. D3 must keep plaintext titles working, and D1's derived states must work without unlock.
12. **Document titles leak too,** and should be part of D3. A source document's title is the imported PDF's file name (`lib/import/run.ts:29`), and draft titles name chapters.
13. **The existing migration path is closed.** Any change to stored data (Keep merge, `ap_notes` re-key, title sealing) cannot use the vault migration, which is closed for completed vaults. Each needs its own client-side, resumable, idempotent migration.
14. **Repairing old library entries.** Entries already saved with 4 authors or no authors can be repaired only by Crossref fill (fault 27). The attention list should prompt for it. Capture dedupe will create duplicates after fault 1.
15. **The selection bubble's 800-character limit** does not fit the helpers (12,000 characters, or the whole document). D1g needs a "whole document" entry point.
16. **The pop-out's write guard** (`mode.ts:19-30`) must be redesigned if any stage can pop out, and the pop-out cannot write `refcheck_cache` today.
17. **v1 import** drops the v1 project's stage and imports documents only. The library and shelf JSON importers (`mergeLibrary`, shelf restore) must also feed the merged Keep model, and `mergeLibrary` drops authorless entries (`citlib.ts:116`).
18. **Database migrations are manual and the e2e job does not block.** A deploy checklist step is needed for each D1 and D3 schema change.
