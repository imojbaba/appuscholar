# Stage 2 Screens: Idea & Feasibility and Literature Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student can use Idea & Feasibility, Research, Research helpers, Analyse a paper, the Reading shelf and the Citation Manager on the live site exactly as in v1, on the engines Wave 0–1 proved, with every stored item inside the vault.

**Architecture:** Panels read fields and render results; every computation lives in `packages/core` (Wave 1 engines, plus the network fetchers and the shelf search ranking ported here with recorded-response and golden tests). Stage data (idea intake, citation library, caches, shelf text, paper notes) lives in a new per-project encrypted blob store that reuses the vault's key hierarchy (one DEK per blob, `key_version`, server blind). AI calls go through the existing gateway (`useCallAI`) with Wave 1's prompt builders. Network calls to OpenAlex, PubMed and Crossref go from the browser as in v1.

**Tech Stack:** TypeScript, Next.js 16 / React 19, Hono, Drizzle/Postgres, WebCrypto (vault), `pdfjs-dist` (new) and `mammoth` (present) for text extraction, vitest, Playwright, the golden harness of `packages/core/test/harness`.

**Spec:** PROGRAMME.md line 2 (`../appuscholar-blueprint/PROGRAMME.md`), the blueprint (`../appuscholar-blueprint/BLUEPRINT.md` §3, §4 stages 1–2, §5, §8 Phase 3), the v1 chapter `../appuscholar-blueprint/v1-tools/02-idea-and-literature.md` (every panel's steps, copy and line refs) and §1 of `04-citations-review-guide-and-rules.md` (Citation Manager), the parity-port spec `docs/superpowers/specs/2026-10-17-parity-port-design.md` (§5 rules), the vault spec `docs/superpowers/specs/2026-10-16-vault-design.md`, the design system `../appuscholar-blueprint/design/DESIGN-SYSTEM.md` (§7 Tool panel, Inputs, Buttons, Badge; §8 States) and mockup `design/mockups/04-tool-panel-idea.html`.

## Global Constraints

- v1 fidelity: every control, step, threshold, message and order comes from the v1 chapter and the cited v1 lines; nothing is redesigned. Improvements go to `docs/superpowers/specs/parity-deviations.md` with a row and wait for Dr. Sharma.
- Copy: every student-facing string through `t()`. v1's `data-i18n` keys are already in the dictionaries (idea_* 12, psych_* 7, devil_* 6, cite_* 62, rc_* 14, cc_* 15, retr_* 8). The Research panel, Analyse a paper, the Reading shelf and the AP stages are English literals in v1 with no Hindi: Task 1 extracts them by script into V2 keys with `sha256` of the source ranges; their Hindi is the English text (register row, one per tool) until Dr. Sharma provides Hindi.
- Engines: `packages/core` only. Panels never compute a number, a format or a match. New engine code ported here (fetcher parsing, shelf ranking, bookmarklet decode) is verbatim from the cited v1 lines with recorded-response or golden tests captured from v1 running (harness rules of the parity spec §5).
- Vault: all stage data is encrypted in the browser under the vault's hierarchy (one DEK per blob, `key_version` 0 only while the vault is off, 409 `vault-required` once a vault exists, migration covers blobs). The server never decrypts. Network requests carry only search words, DOIs, PMIDs, titles and surnames, as v1 (guide: "Your search words go to OpenAlex and PubMed. No document text does.").
- AI: every call through `useCallAI` with the personal-data scan, v1's temperatures and token limits from the prompt builders, the AI-use log classification, and `PLAIN_OUT` where v1 appends it. Results land in the AI pane via the existing suggestion flow (`setSug` equivalent) so Tab/Accept insert as `ai-ins`.
- Size limits: a blob body ≤ 2.8 MB (same route limit as documents); the shelf stores extracted text per paper (first 200 pages), never the PDF.
- Tests: TDD per task; vitest for web and api; store contract for both stores; core golden/replay tests; Playwright journeys on the pglite recipe (`apps/web/e2e/support/pglite-postgres.mjs`, api and web on one `DATABASE_URL`).
- Conventional commits; never commit `.env*`; never print secrets.

## Review Focus

1. A search while the vault is locked after a reload: results must still show (nothing stored), and "+ Library" must prompt for the passphrase once and then save, never silently drop the entry. Test in Task 9.
2. OpenAlex returns 429 or PubMed is unreachable: the status line names the failing source with v1's sentence, the other source's results still render, nothing hangs. Test in Task 4 (fetchers) and Task 9 (status line).
3. A quick read whose summary contains a number absent from the abstract: the summary is dropped with v1's sentence and the design/sample quotes still show their own confirmation state. Test in Task 10.
4. A library of 2,000 entries imported, then "Insert reference list" in a numbered style: order is library order, the toast is the numbered variant, and the editor stays responsive (one insertion, not 2,000). Test in Task 8.
5. A scanned PDF (no text layer) on the shelf or in Analyse a paper: v1's refusal messages, nothing added, no console error. Test in Task 11 and Task 12.

---

## File structure

- `apps/web/scripts/extract-v1-panels.mjs` (Task 1): literal copy of the Research, Analyse and shelf panels into V2 keys.
- `packages/db/src/schema.ts` + `packages/db/migrations/0004_project_blobs.sql` (Task 2); `apps/api/src/routes/blobs.ts`; store methods.
- `apps/web/lib/blobs/useProjectBlob.ts` (Task 3): typed, encrypted, debounced per-project blobs.
- `packages/core/src/fetch/{openalex,pubmed,crossref}.ts` + `packages/core/test/fetch/` recorded responses (Task 4).
- `apps/web/components/tools/IdeaPanel.tsx` (Task 5, rewritten), `HelpersPanel.tsx` (Task 6), `cite/CitePanel.tsx` + `cite/{CiteForm,CiteLibrary,CiteChecks}.tsx` (Tasks 7–8), `research/ResearchPanel.tsx` + `research/{SearchForm,ResultCard,Filters,Generators,ManualAdd,Connected}.tsx` (Tasks 9–10), `shelf/ShelfDialog.tsx` + `shelf/{Papers,Reader,Search,Passages,Matrix}.tsx` (Task 11), `analyse/AnalysePanel.tsx` + `analyse/{Intake,Ask,Numbers,RefCheck,Walk,Card,Across}.tsx` (Tasks 12–13), `apps/web/app/(app)/popout/page.tsx` (Task 14).
- `packages/core/src/shelf.ts` (Task 11): tokeniser, TF-IDF-like ranking, passage finder, ported with goldens.
- `apps/web/lib/tools.ts` (Task 15): `BUILT_IN` list; `apps/web/components/workspace/Dock.tsx` mounts.
- `apps/web/e2e/stage2-idea-literature.spec.ts`, `docs/walkthroughs/stage-2.md` (Task 16).

---

### Task 1: Extract the English-only panel copy into V2 keys

**Files:**
- Create: `apps/web/scripts/extract-v1-panels.mjs`
- Modify: `apps/web/scripts/extract-v1-i18n.mjs` (call it after the overrides), `apps/web/messages/en.json`, `hi.json` (regenerated), `docs/superpowers/specs/parity-deviations.md` (three rows: Research, Analyse, Shelf have no Hindi in v1)
- Test: `apps/web/test/i18n.test.ts`

**Interfaces:**
- Produces: keys `rs2_*` (Research panel, v1 lines 941–1034), `ap2_*` (Analyse panel 741–760 and the stage/UI strings the chapter lists under 9832–10136, 10821–10870, 11183–11270), `sh2_*` (Reading shelf dialog 1247–1254 and 11513–11725 copy), `ap2_stage_<k>_ask` for the twelve `AP_STAGES` questions. Each key's English is the v1 literal (entities decoded, tags stripped except `<b>` which `tHtml` renders). A manifest `apps/web/messages/v1-panels.manifest.json` lists key → v1 line range → sha256 of the source lines; `hi.json` gets the English text for these keys.

- [ ] **Step 1: Write the failing test**

```ts
it("stage-2 panel copy is extracted from v1 with a manifest", () => {
  expect(en.rs2_panel_desc).toBe("Search OpenAlex and PubMed live, free, no install — pick what's relevant, then draft a literature review or find a research gap, grounded only in the abstracts you found.");
  expect(en.ap2_consent).toMatch(/^I am allowed to read this paper/);
  expect(en.sh2_intro).toMatch(/^Add PDFs you have the right to read/);
  expect(en.ap2_stage_gap_ask).toBe("In your own words: what was missing in earlier work, and what did this study set out to answer?");
  expect(hi.rs2_panel_desc).toBe(en.rs2_panel_desc);
  const m = JSON.parse(readFileSync("messages/v1-panels.manifest.json", "utf8"));
  expect(m.rs2_panel_desc.sha256).toMatch(/^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Run** `pnpm --filter @appuscholar/web test` → FAIL (keys undefined).
- [ ] **Step 3: Implement** the script: read `../../appuscholer/index.html`, slice the ranges, extract text nodes and `placeholder`/`title` attributes with a small tokenizer (no DOM library), name keys from the element's id or a slug of the first four words, write the manifest, merge into both dictionaries; idempotent (run twice, no diff). Register rows D-S2-1..3.
- [ ] **Step 4: Run** → PASS; `node apps/web/scripts/extract-v1-i18n.mjs` twice gives no diff.
- [ ] **Step 5: Commit** `feat(web): stage-2 panel copy extracted from v1 into rs2_/ap2_/sh2_ keys with a sha256 manifest`

---

### Task 2: Per-project encrypted blobs (db, store, routes)

**Files:**
- Modify: `packages/db/src/schema.ts`; Create: `packages/db/migrations/0004_project_blobs.sql` (+ meta via `db:generate`)
- Modify: `apps/api/src/store/{types,memory,drizzle}.ts`, `apps/api/src/routes/docWrite.ts` (reuse the ciphertext rule), Create: `apps/api/src/routes/blobs.ts`, mount in `app.ts`; `apps/api/src/store/*.countPlaintextRevisions` extended to blobs
- Test: `apps/api/test/store.contract.ts`, `apps/api/test/blobs.routes.test.ts`, `apps/api/test/drizzle.test.ts` (blindness scan covers the new table)

**Interfaces:**
- Schema: `project_blobs` (`id` text PK, `project_id` text → projects cascade, `kind` text, `body` text, `key_version` integer default 0, `deks` jsonb default `[]`, `updated_at`), unique (`project_id`, `kind`).
- Store: `getBlob(userId, projectId, kind): Promise<Blob | null>`, `putBlob(userId, projectId, kind, { body, keyVersion, dek? }): Promise<Blob | null>` (owner-scoped; `dek` added when `keyVersion` unknown, `DekExistsError` on a conflicting wrap), `listBlobs(userId, projectId): Promise<Array<{kind, keyVersion, updatedAt}>>`, `rewriteBlob(userId, projectId, kind, { body, keyVersion })` (migration), `countPlaintextRevisions` now counts plaintext blobs too.
- Routes: `GET /projects/:id/blobs/:kind` → 200 `{ kind, body, keyVersion, deks, updatedAt }` | 404; `PUT /projects/:id/blobs/:kind` body `{ body, keyVersion, dek? }` with the documents rules (vault exists → keyVersion 0 is 409 `vault-required`; keyVersion ≥ 1 body must match the ciphertext shape; 2.8 MB limit); `PUT /projects/:id/blobs/:kind/rewrite` (409 `migration-closed` after completion); `GET /projects/:id/blobs` list. Kinds allowed: `idea_intake | citations | retraction_cache | refcheck_cache | shelf_index | shelf_paper:<id> | ap_notes | ap_cols | rs_prefs`.
- The scratch project is a project: blobs work there too.

- [ ] **Step 1: Contract and route tests** (both stores): put/get round trip; owner scoping (other user 404/null); unique kind per project (second put updates); vault-required after `putVault`; `countPlaintextRevisions` counts a plaintext blob; rewrite before/after completion; blindness scan finds the sentence in no column after an encrypted blob put.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (migration generated, renamed `0004_project_blobs.sql`). **Step 4: Run** `pnpm --filter @appuscholar/db test && pnpm --filter @appuscholar/api test` → PASS.
- [ ] **Step 5: Commit** `feat(db,api): per-project encrypted blobs with the documents' vault rules`

---

### Task 3: Blob client in the browser

**Files:**
- Create: `apps/web/lib/blobs/useProjectBlob.ts`, `apps/web/lib/blobs/kinds.ts`
- Modify: `apps/web/lib/vault/migrate.ts` (blobs join the migration: list, rewrite plaintext, dek per blob), `apps/web/lib/vault/useVault.tsx` (`encryptBody`/`decryptBody` accept a blob-shaped `{ id: "blob:<projectId>:<kind>", deks }`)
- Test: `apps/web/test/useProjectBlob.test.tsx`, `apps/web/test/vaultMigrate.test.ts` (extend)

**Interfaces:**
- `kinds.ts`: `type BlobKind = ...` (Task 2's list) with a `zod` or hand schema per kind: `IdeaIntake { topic, resources, timeframe, constraints }`, `CitationLibrary = CitationEntry[]`, `RetractionCache = Record<doi, { r: boolean; at: number }>`, `RefCheckCache = Record<key, RcResult>`, `ShelfIndex = Array<{ id, title, file, size, added, total, kept }>`, `ShelfPaper = { pages: string[]; notes: Highlight[]; cells: Record<string,string> }`, `ApNotes = Record<docId, { stages: Record<k, { mine; res }>; card: {...}; title; chars }>`, `ApCols = string[]`, `RsPrefs = { rank: boolean }`.
- `useProjectBlob<K extends BlobKind>(kind: K, projectId: string | null): { value: Shape<K> | null; loading: boolean; locked: boolean; set(next: Shape<K>): void /* debounced 800 ms save, encrypt when the vault is on */; flush(): Promise<void> }`. A locked vault: reads prompt once via `ensureUnlocked()`; a cancelled prompt leaves `locked: true` and `value: null`, never a plaintext default. Saves while locked are held like autosave and sent after unlock.

- [ ] **Step 1: Tests**: round trip encrypted (fake api, real vault); vault off → keyVersion 0; locked read prompts once and cancel leaves locked; debounce coalesces three sets into one PUT; 409 vault-required → reload deks, re-encrypt, retry once; migration test: a plaintext blob is rewritten and counted.
- [ ] **Step 2–4:** RED, implement, GREEN (`pnpm --filter @appuscholar/web test`).
- [ ] **Step 5: Commit** `feat(web): encrypted per-project blobs in the browser, joined to the vault migration`

---

### Task 4: Network fetchers ported with recorded responses

**Files:**
- Create: `packages/core/src/fetch/openalex.ts`, `pubmed.ts`, `crossref.ts`, `packages/core/src/fetch/types.ts`; `packages/core/test/fetch/*.test.ts`; `packages/core/test/fetch/recorded/*.json`
- Modify: `packages/core/src/index.ts`
- Test: as above

**Interfaces (every function takes `fetch` and returns parsed v1 shapes; no DOM):**
- `oaUrl(path: string, key?: string): string` (appends `api_key` only when given; v1 8030).
- `oaSearch(f, { q, terms, design, perPage, key }): Promise<{ papers: RsPaper[]; error?: "429" | string }>` (v1 8025–8120: `select=` list, abstract rebuild via `rsReconstructAbstract`, oa status via `rsOaStatus`, `is_retracted`).
- `pmSearch(f, { q, terms, design, retmax }): Promise<{ papers: RsPaper[]; error?: string }>` (esearch → esummary → efetch; abstracts from XML; failure of efetch means no abstract).
- `oaConnected(f, { referencedWorks: string[]; citedByApiUrl: string; key }): Promise<{ cites: RsPaper[]; citedBy: RsPaper[] }>` (8 each).
- `oaRetractions(f, dois: string[], key?): Promise<Record<string, boolean>>` (batches of 40, `filter=doi:` joined by `|`).
- `crLookupDoi(f, doi): Promise<CitationEntry | null>`, `crLookupTitle(f, title, surname): Promise<{ entry; score } | null>` (3 rows, Jaccard ≥ 0.6 as v1 7723–7797), `pmidToDoi(f, pmid)` (esummary).
- `pace(ms = 200)`: the 200 ms pause helper used between calls.
- Recorded responses: captured once from the live APIs for a fixed corpus (ten queries, ten DOIs, two PMIDs, one 429 body) and committed under `test/fetch/recorded/` with the request URL; tests replay them and assert the parsed `RsPaper[]`/`CitationEntry` equal v1's parse (captured with the harness by calling v1's parsing functions on the same recorded bodies).

- [ ] **Step 1: Tests** per function on the recorded bodies; the 429 case yields `error: "429"`; a network throw yields `error: <message>` and the other source unaffected (merge test in Task 9).
- [ ] **Step 2–4:** RED, implement verbatim from v1 8025–8130, 8140–8160 (connected), 7556–7600 (retractions), 7723–7797 and 7909–7961 (Crossref), GREEN (`pnpm --filter @appuscholar/core test`).
- [ ] **Step 5: Commit** `feat(core): OpenAlex, PubMed and Crossref fetchers ported from v1 with recorded-response tests`

---

### Task 5: Idea & Feasibility panel

**Files:**
- Modify: `apps/web/components/tools/IdeaPanel.tsx`; `apps/web/lib/ai/actions.ts` (an `assessIdea` action using `buildIdeaPrompt`, temp 0.3, max 1200, AI-use kind "checking whether my project idea is realistic")
- Test: `apps/web/test/ideaPanel.test.tsx`, e2e in Task 16

**Interfaces:**
- Intake persisted via `useProjectBlob("idea_intake", activeProjectId)` (scratch project when none); fields autosave on input.
- "🔎 Assess feasibility": empty topic → toast `t("idea_need_topic")` ("Describe your working idea first"); otherwise the AI pane shows "💜 Thinking this through…", result into the suggestion flow, toast "Ready — press Tab in the editor to insert".
- "💾 Save this idea as a project": opens Save-as-project with stage idea and the first 80 characters (exists).

- [ ] **Step 1: Tests**: empty topic toast; assess builds the prompt with the four fields (2,000/1,000/1,000 char slices as v1) and sends temp 0.3; the pane text sequence; the intake blob is saved debounced and reloaded.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5: Commit** `feat(web): Idea & Feasibility assesses through the gateway and keeps its intake in the vault`

---

### Task 6: Research helpers panel

**Files:**
- Create: `apps/web/components/tools/HelpersPanel.tsx`; Modify: `apps/web/lib/ai/actions.ts` (`runHelper(kind)`, `runDevil()`), `apps/web/components/workspace/Dock.tsx` mount
- Test: `apps/web/test/helpersPanel.test.tsx`

**Interfaces:**
- Six buttons as v1 729–738 with `psych_*`/`devil_*` keys. Text = selection, else whole document (`docInnerText` of the editor HTML); `< HELPER_MIN_CHARS` → toast `psych_need_text`; whole document > 12,000 chars → toast `psych_long_doc` and slice; `case` asks the APA 4.07 `confirm` once per session (session storage key `appu_case_ack`); devil: `< DEVIL_MIN_WORDS` → toast; result printed in the AI pane as feedback with `window._sug = null` semantics (nothing to accept), title/toasts as the chapter.

- [ ] **Step 1: Tests**: thresholds; slice at 12,000; the five prompts use `HELPER_TEMPS[kind]` and max 2,500; devil uses `buildDevilPrompt`, max 1800, is un-insertable (Accept toasts "No suggestion to accept yet"); the case acknowledgement is asked once.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Research helpers panel wired to the six v1 prompts with v1 thresholds`

---

### Task 7: Citation Manager, part 1: form, lookup, insert, library

**Files:**
- Create: `apps/web/components/tools/cite/CitePanel.tsx`, `CiteForm.tsx`, `CiteLibrary.tsx`, `apps/web/lib/cite/useLibrary.ts` (blob `citations` + style/type prefs)
- Modify: `apps/web/lib/editor/insert.ts` (insert in-text citation at the cursor; `<sup>` for AMA)
- Test: `apps/web/test/citePanel.test.tsx`, `apps/web/test/citeInsert.test.ts`

**Interfaces:**
- Form fields and type-specific `cit-only` groups exactly as v1 874–947 (`cite_*` keys); style select with `citStyleNote` (`cite_note_numbered` for numbered styles, `cite_note_check` otherwise); source language.
- Lookup: paste into `citURL` auto-fires (v1 7970); `citLookup()` routes DOI → `crLookupDoi`, PMID → `pmidToDoi` then DOI, URL with DOI inside → DOI, else title → `crLookupTitle`; fills the form, toast `cite_lookup_ok` / `cite_lookup_nf`.
- Insert citation: `citFmt(entry, citNumFor(lib, entry).n, style).intext` at the cursor; unsaved numbered entry toasts `cite_num_unsaved`.
- `+ Library`: needs author and title (`cite_need_author_title`); duplicate by `citKey` → "Already in your library"; saves to the blob.
- Library cards: formatted `refHTML`, "Insert (Smith, 2020)" button, delete; count badge; "No sources yet."

- [ ] **Step 1: Tests**: type switch shows the right groups; lookup routing with fake fetchers; insert text per style (goldens from Wave 1 give the strings); duplicates; the library persists as a blob.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Citation Manager form, lookup, in-text insert and the library in the vault`

---

### Task 8: Citation Manager, part 2: usage, checks, bibliography, import/export, quote, capture

**Files:**
- Create: `apps/web/components/tools/cite/CiteChecks.tsx`, `CrossCheckDialog.tsx`, `apps/web/lib/cite/usage.ts`, `apps/web/lib/cite/capture.ts`, `apps/web/components/document/CaretChip.tsx`
- Modify: `CitePanel.tsx`, `apps/web/components/workspace/Workspace.tsx` (`#capture=` hash on load), `apps/web/lib/ai/actions.ts` (`translateQuote`)
- Test: `apps/web/test/citeUsage.test.ts`, `citeChecks.test.tsx`, `capture.test.ts`, `caretChip.test.tsx`

**Interfaces:**
- Usage/backlinks: `citUsage(entry, docs, idx, style)` over every document of the project, decrypted in the browser (`docPlainForCitations` on each body; the open document from the live editor), summary `cite_usage_summary_fmt`, `num_missing_fmt`, links switch document.
- Caret chip: `cit_caret_chip` when the caret touches a matching citation; click opens the manager and highlights the card.
- Retraction check: `oaRetractions` over library DOIs, cache blob with 7-day TTL, summary `retr_summary_fmt`, card warning `retr_lib_warn`; quiet refresh when the tab opens.
- Reference check (`rc_*`): per entry via Crossref with `pace(200)`, cache blob, summary and per-line copy as the chapter.
- Cross-check: `crossCheckHtml(editorHtml, lib, style)` → dialog with v1's sections (`cc_*`).
- Insert reference list: `bibliographyHtml(lib, style)` inserted at the end (centred heading, hanging indent), toasts per numbered/author-date; Review Focus 4 test: 2,000 entries → one `insertContent` call, under 2 s in the test.
- Import/export: `exportLibrary` → `psychology-class-library.json`; import ≤ 3 MB via `mergeLibrary`, toasts `cite_import_ok_fmt` / `cite_import_err`.
- Quote insert: as-is in curly quotes, or one AI call (temp 0.2, `noLang`) when English source + Hindi content language, inserted with `(अनुवादित)` and the original in `title`.
- "📖 Load classic psychology sources": v1's starter list (extract the array from v1 by script into `packages/core/src/data/classic-sources.ts` with a sha256 test).
- Bookmarklet: the draggable link whose `javascript:` reads `citation_*` meta tags and opens `<origin>/#capture=<base64>`; on load `capture.ts` decodes, strips the hash, asks `confirm`, saves; copy from `cite_bookmarklet_*`.

- [ ] **Step 1: Tests** per interface (fake fetchers, fake clock for TTL, editor stub); the 2,000-entry performance test.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): citation usage, retraction and reference checks, cross-check, reference list, import/export, quotes and one-click capture`

---

### Task 9: Research panel, part 1: search and results

**Files:**
- Create: `apps/web/components/tools/research/ResearchPanel.tsx`, `SearchForm.tsx`, `ResultCard.tsx`, `apps/web/lib/research/useSearch.ts`
- Modify: `apps/web/lib/ai/actions.ts` (`suggestTerms`, `rankPapers`), settings for the OpenAlex key (`credentials` provider id `openalex`, locked under the vault like AI keys; Settings dialog field with v1's copy, keys `rs2_oa_key_*`)
- Test: `apps/web/test/research.test.tsx`

**Interfaces:**
- Form: topic (≤ 600 chars, symbols-only refused), "💡 Suggest related terms" (AI, up to 8 ticked boxes with the chapter's note), kind of study select, rank checkbox (pref blob `rs_prefs`), OpenAlex/PubMed checkboxes, Reading shelf button (Task 11), "🔎 Find relevant papers".
- `useSearch`: builds queries with `rsBuildQuery`, calls both fetchers in parallel, merges and `rsDedupe`s, status line as v1 (count, terms, kind, rank disclosure, failing source sentence, retry without terms when a term query fails), sort row, results in memory only.
- Cards: title, Fit chip, Quick-read box (Task 10), source tag, Retracted badge, OA badge, authors (4 + et al.), year, venue, citations, abstract show more/less, buttons Insert citation / + Citation library / Open source / Free full text / Connected papers / Quick read / Analyse this paper, tick box.
- Review Focus 1: "+ Library" with the vault locked prompts once then saves.
- Review Focus 2: one source failing leaves the other's results.

- [ ] **Step 1: Tests**: query building per kind; merge/dedupe with recorded bodies; status sentences; 429 sentence; sort orders; add-to-library conversion (`rsEntryFromResult`) and duplicate toast; locked-vault save.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Research search over OpenAlex and PubMed with v1's status, sorting and cards`

---

### Task 10: Research panel, part 2: quick read, generators, filters, CSV, extras

**Files:**
- Create: `apps/web/components/tools/research/{Filters,Generators,ManualAdd,Connected,External}.tsx`
- Modify: `ResearchPanel.tsx`, `apps/web/lib/ai/actions.ts` (`quickRead`, `litReview`, `gapFinder`), `apps/web/components/document/SelectionBubble.tsx` ("🔎 Find papers" → topic = first 200 chars, open Research, search), Analyse handoff (`rsAnalyse` → Task 12's abstract-only load)
- Test: `apps/web/test/researchExtras.test.tsx`

**Interfaces:**
- Quick read: ≥ 150 non-space chars, prompt via `buildQuickReadPrompt`, verified by `rsQuickCheck`, label and dropped-summary sentence as the chapter (Review Focus 3).
- Ticks reveal the action block; generators need ≥ 2 ticked ("Check at least 2 papers above first"); lit review / gap finder prompts with temp 0.35, max 1200, corpus via `rsCorpusText`; pane texts "💜 Reading N abstracts and drafting…" / "💜 Looking for what these papers leave unanswered…".
- Rank: batches of 12, `rsRankParse`, disclosure line, fold of 0/1 papers.
- Filters: year, OA, hide retracted, confirmed kind, confirmed sample, note and "Showing x of y papers. n hidden by your filters, not deleted."
- CSV: `rsCsvText` → `search-results.csv`. External buttons open new tabs with `noopener`. Manual add → library. Connected papers via `oaConnected`.

- [ ] **Step 1: Tests** for each; the dropped-summary case; filters hide not delete; rank folding.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): quick read, literature review and gap finder, filters, CSV, manual add and connected papers`

---

### Task 11: Reading shelf

**Files:**
- Create: `packages/core/src/shelf.ts` (+ goldens), `apps/web/lib/shelf/extract.ts` (pdf.js, first 200 pages; `pdfjs-dist` added as a web dependency, worker from the package), `apps/web/components/tools/shelf/ShelfDialog.tsx`, `Papers.tsx`, `Reader.tsx`, `Search.tsx`, `Passages.tsx`, `Matrix.tsx`
- Modify: `apps/web/lib/ai/actions.ts` (`shelfSummarise` with the email strip and the two-line gate), Research panel button, Analyse intake dropdown (Task 12)
- Test: `packages/core/test/shelf.test.ts` (goldens captured from v1's `sh*` ranking functions, 11513–11725), `apps/web/test/shelf.test.tsx`

**Interfaces:**
- `shelf.ts`: `shTitleGuess(firstPageText)`, `shTokens(s)`, `shRankPages(papers, query): Hit[]` (AND then OR with v1's note), `shFindPassages(papers, sentence): Hit[]` (OR, top 5, ≥ 2 shared terms, closest sentence), `shMineOk(text): boolean` (2 lines, 12 words), `shStripEmails(text)`.
- Storage: `shelf_index` blob + one `shelf_paper:<id>` blob per paper (pages, highlights, cells); the PDF binary never stored; per-file status messages as the chapter; remove needs a second press.
- Dialog tabs Papers / Search / Find passages / Matrix; reader with highlights; Matrix CSV `reading_matrix.csv`; backup/restore JSON `app:'appuscholar-shelf'`.
- Summary gate: button disabled until `shMineOk`, reason sentence visible (design §8); the two lines saved as a note first; AI summary temp 0.2, max 1000, `noLang`, email-stripped, 12,000 chars, appended comparison line.
- Review Focus 5: scanned PDF → "no readable text (it looks scanned). Not added."

- [ ] **Step 1: Tests**: goldens for ranking/passages/gate against v1 captures; extraction with a tiny text PDF fixture and a scanned one; blob persistence; backup/restore validation.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web,core): Reading shelf with v1's ranking ported, PDFs read in the browser, text kept in the vault`

---

### Task 12: Analyse a paper, part 1: intake, Ask, Numbers check, reference check

**Files:**
- Create: `apps/web/components/tools/analyse/AnalysePanel.tsx`, `Intake.tsx`, `Ask.tsx`, `Numbers.tsx`, `RefCheck.tsx`, `apps/web/lib/analyse/useApDoc.ts`
- Modify: Dock mount; `apps/web/lib/ai/actions.ts` (`apAsk`)
- Test: `apps/web/test/analyse.test.tsx`

**Interfaces:**
- Intake: upload (pdf via Task 11's extractor, docx via `mammoth.extractRawText`, txt; `.doc` refused), paste, shelf pick, "Try a practice paper" (`AP_SAMPLE`), consent checkbox (`ap2_consent`) required except sample and abstract-only; ≥ 500 non-space chars; `apBuild(title, pages, src)`; preview "Check what Appuscholer read", sections list, two-column warning; abstract-only mode banner, Walk disabled.
- Ask: chips, ≥ 4 chars, `buildAskPrompt` (temp 0.2, max 2000, `noLang`), `apJson`, `apCheckQuote` per quote, banner for unmatched, non-JSON fallback sentence; log in memory only.
- Numbers check: `apNumbers(doc)` with ✓/⚠ and the two caveat sentences; none-found sentence.
- Reference check: `apRefDois` → `oaRetractions` (≤ 40), report lines and the caveat; hidden in abstract-only mode.
- "📚 All lectures": toast "Lectures arrive in a later phase." (register row: Phase 5).

- [ ] **Step 1: Tests**: intake rules and messages; ask flow with a fake AI reply (quotes matched/unmatched, non-JSON); numbers and reference check on the sample paper; abstract-only mode.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Analyse a paper intake, Ask with quote checks, numbers check and reference check`

---

### Task 13: Analyse a paper, part 2: Walk, Paper card, Across papers

**Files:**
- Create: `apps/web/components/tools/analyse/Walk.tsx`, `Card.tsx`, `Across.tsx`; Modify: `AnalysePanel.tsx`, `apps/web/lib/ai/actions.ts` (`apWalk`)
- Test: `apps/web/test/analyseWalk.test.tsx`

**Interfaces:**
- Walk: 12 `AP_STAGES`, "Try first." textarea (autosaved to `ap_notes` blob), "Show what the paper says" → `buildWalkPrompt`, sections "What the paper says", quotes checked, "The paper does not report:", "Judge this yourself:", "Check yourself." with a hidden suggested answer.
- Paper card: My words per stage first, AI reading muted; Strengths/Weaknesses/Verdict/Notes saved on keystroke; "⬇ Download the card (.txt)" `paper-card.txt` with v1's closing line.
- Across papers: `<details>` table, columns `AP_COLS` with defaults stored in `ap_cols`, AI columns toggle, CSV `paper_cards.csv`, delete with confirm, empty state sentence.

- [ ] **Step 1: Tests**: stage flow with a fake reply; notes persistence per `docId`; card download content; across table columns and CSV.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(web): Analyse a paper walk-through, paper card and cards side by side`

---

### Task 14: Pop-out windows for Citation Manager and Research

**Files:**
- Create: `apps/web/app/(app)/popout/page.tsx`, `apps/web/lib/popout/sync.ts`
- Modify: `apps/web/components/workspace/Dock.tsx` ("⧉ Pop out" opens `/popout?tool=cite|research` 540×820; others toast `popout_only_cite_research`), `insert.ts` (inserts arriving over `BroadcastChannel('appu_sync')`)
- Test: `apps/web/test/popout.test.tsx`

**Interfaces:**
- The pop-out renders the tool alone with the same panels; inserts send `{ type: "insert", html }` over the channel: "Sent to your writing window ✓" / "The writing window is not open."; the pop-out writes only the `citations` and `retraction_cache` blobs (guard in `useProjectBlob`: other kinds are read-only there).

- [ ] **Step 1–5** as above; commit `feat(web): pop-out windows for the Citation Manager and Research over a broadcast channel`

---

### Task 15: Registry, dock, sidebar and Hindi fallback review

**Files:**
- Modify: `apps/web/lib/tools.ts` (`BUILT_IN` = chat, idea, psych, research, analyse, cite; `canPopOut` unchanged), `Dock.tsx` (mount map), `StubPanel.tsx` (remaining tools), `apps/web/test/i18n-coverage.test.ts` (no new English literals in the stage-2 components; the `rs2_/ap2_/sh2_` keys count as translated)
- Test: `apps/web/test/tools.test.ts`, coverage test

- [ ] **Step 1–5**: tests that every stage-2 tool mounts its panel and the others still stub; commit `feat(web): stage-2 tools mounted; stubs remain for stages 3 to 6`

---

### Task 16: Journey e2e, walk-through script, deploy notes

**Files:**
- Create: `apps/web/e2e/stage2-idea-literature.spec.ts`, `docs/walkthroughs/stage-2.md`
- Modify: `.github/workflows/ci.yml` only if `pdfjs-dist` needs a step

**Interfaces:**
- The e2e follows the chapter's "Student journey through Idea and Literature" (12 steps) with the AI stubbed at the gateway (recorded replies) and the fetchers stubbed with the recorded bodies via route interception; every step asserts student-visible copy and the vault state (blobs ciphertext on the server: a blindness assertion through the api after the journey).
- The walk-through doc: the same 12 steps as human rows with Do / Expect / Result, the "Not yet in this stage" section (lectures, lesson, theatre, quiz, TTS → Phase 5; Closeness check → Review stage), the version pill line and sign-off.

- [ ] **Step 1–5**: e2e green on the pglite recipe (`pnpm --filter @appuscholar/web e2e`), commit `test(web): stage-2 journey e2e and walk-through script`

---

## Not in this line (recorded)

- Lectures, the lesson on the practice paper, theatre, quiz, TTS: Phase 5 (blueprint §8), register row.
- Closeness check reading the shelf: Review stage.
- Dark mode, offline, operator key: after parity.

## Deploy and sign-off

1. Migration 0004 on Neon after a backup (the blob table only).
2. Deploy api, check `/health`; deploy web; read the version pill.
3. OJ walks `docs/walkthroughs/stage-2.md` on the live URL with his Groq/OpenAI key (the AI steps) and real OpenAlex/PubMed/Crossref calls, on a throwaway account; sign-off; then merge the stack.
4. Dr. Sharma's rows Idea, Literature, Citation move to "Built" in VISION-VS-BUILD.md §2 only after the sign-off.
