# Participant list with name matching: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a sealed participant list (first tab of Collection and analysis), planned in Design and ethics, whose names are found and swapped for codes in Statistics tables, documents and AI requests, replacing v1's guessing of names.

**Architecture:** a pure matcher and table engine in `packages/core` (unit-tested; v1's engines untouched, new behaviour in new functions); one new blob kind `participants` sealed by the vault and refused in plaintext by the API; a new tool module `participants` whose Panel is the tab and whose DocumentLayer paints the open document and publishes the open list to a store that Statistics and the AI path read.

**Tech Stack:** TypeScript, React 19 / Next.js (apps/web), Hono (apps/api), Vitest, Playwright, zod, pnpm + turbo.

**Spec:** `docs/superpowers/specs/2026-10-24-participants-design.md` (sections cited as §n; calls as Cn). Read it before any task.

## Global Constraints

- Work only in `/Users/poojadudani/Documents/Claude cowork/Scholarly/appuscholar-participants`, branch `participants-register`. Never edit `appuscholar-b1fix` or `appuscholar-qa`.
- Tests first for every change: the failing test is committed with or before its code.
- v1's ported functions are never edited: `pdScan`, `pdTransform`, `pdTestVal`, `consentMarkdown`, `ethicsStatement`, `protocolMarkdown`, `ecMinorsNote`, `scanText`, `maskText`. New behaviour goes in new functions (the `aiuBuildV2` pattern); with no plan given, a V2 function returns v1's output byte for byte. `pnpm --filter @appuscholar/core test:golden` stays green with no fixture change.
- The list never leaves the browser unsealed except by "Download the list" and "Export all my work" (C10): no plaintext blob (the API refuses it), no name in the project export, home facts, toasts, console, errors or URLs.
- Codes are `P` + at least three digits, from the list's `next`, never reused (§5).
- Copy in plain words. New tool keys only in `apps/web/messages/tools/participants.{en,hi}.json`; edits to Design's and Statistics' screens use their own files (`design.*.json`, `stats.*.json`); the two frame strings `tab_name_participants` and `collect_next_participants` go in `apps/web/messages/{en,hi}.json`. Every Hindi file keeps its `$draft` line; Hindi is a draft for Dr. Sharma.
- Import `TOOL_TABS` from `@/lib/tools/tabs`; the registry by `import type` only (`test/toolLoadOrder.test.ts`).
- Do not edit the QA session's files (new suites it adds under `apps/web/e2e/`, a QA folder, its CI job). Existing tests change only where this plan changes what they assert; each such edit is named in its task.
- No `window.confirm`/`alert`/`prompt` in new code: in-page dialogs (`components/ui/dialog`). The existing R16 guard confirm in `useDesign` is reused as it is.
- Register rows in `docs/superpowers/specs/parity-deviations.md`, ids from D-S2-113 upward, one per departure the task makes, written by that task (Task 12 checks the set).
- Before any Playwright run: `lsof -iTCP:8788 -iTCP:3000 -iTCP:5433` must show nothing left over (Playwright reuses a stale server silently).
- Verification commands: `pnpm --filter @appuscholar/core test`, `pnpm --filter @appuscholar/web test`, `pnpm --filter @appuscholar/api test`, `pnpm typecheck`, `pnpm lint`; e2e per `apps/web/e2e/support/pglite-postgres.mjs`'s header.

## Review Focus

1. Names typed differently from the list (`priya  sharma`, `PRIYA SHARMA`, `Priya’s`, NFD-composed Devanagari) are still the listed person: Task 1 test `normalisesCaseSpacesApostrophesAndNfc`, Task 2 test `listedInAnyCaseAndSpacing`.
2. A name split by formatting inside one paragraph (`<b>Pri</b>ya`) is one find and is replaced whole; a name across two paragraphs is not a find: Task 9 test `findsANameSplitByInlineMarks`.
3. Two windows adding people at once (a Statistics pop-out's Apply and the tab) never hand out the same code: allocation happens inside the blob's `set(prev => …)` updater from `prev.next`, and a 409 re-read retries: Task 5 test `allocatesFromTheLatestValue`.
4. The vault locks while the tab is open: the names disappear, nothing is written, the tab shows "Unlock to see your participants": Task 6 test `locksMidSession`.
5. A 50,000-word document and a list of 200 people: one `findNames` pass under 300 ms in Node, highlights recomputed at most every 500 ms: Task 1 test `fastOnLongText`, Task 9 test `debouncesRepaint`.

---

### Task 1: The matcher (core)

**Files:**
- Create: `packages/core/src/participants.ts`, `packages/core/src/data/names-everyday.ts`, `packages/core/src/data/names-first.ts`
- Modify: `packages/core/src/index.ts` (append exports)
- Test: `packages/core/test/participants.test.ts`

**Interfaces:**
- Produces:
  - `type MatchPerson = { id: string; code: string; name: string; spellings: string[]; everyday: string[]; pseudonym?: string; withdrawn?: { on: string; data: "remove" | "keep" } }`
  - `type NameFind = { start: number; end: number; text: string; personIds: string[]; kind: "sure" | "ask" | "suggest"; why?: "everyday" | "shared" | "speaker" | "first-name" }`
  - `type Matcher = { people: MatchPerson[]; /* opaque compiled state */ }`
  - `codeOf(n: number): string` — `P` + `String(n).padStart(3, "0")`.
  - `normName(s: string): string` — NFC, lower case, dots as spaces, runs of spaces as one, curly apostrophes straight, trimmed.
  - `isEverydayName(word: string): boolean` — against `EVERYDAY_NAMES` (normalised).
  - `buildMatcher(people: MatchPerson[]): Matcher`
  - `findNames(text: string, m: Matcher): NameFind[]` — sure and ask finds, in text order, non-overlapping, longest spelling first at each position.
  - `suggestNames(text: string, m: Matcher, notNames: string[], opts: { speakerLabels: boolean; firstNames: boolean }): NameFind[]` — `kind: "suggest"`, skipping any span already found by `findNames`, any word in `notNames` (normalised), and the speaker words Interviewer, Researcher, Moderator, Participant, Respondent, Q, A and codes (`/^P\d{3,}$/`).
  - `replaceFinds(text: string, finds: NameFind[], to: (f: NameFind) => string | null): string` — null keeps the find's text.
  - `EVERYDAY_NAMES: readonly string[]`, `FIRST_NAMES: ReadonlySet<string>` (normalised).

- [ ] **Step 1: Write the failing tests** in `packages/core/test/participants.test.ts`:
  - `codeOf`: `codeOf(1) === "P001"`, `codeOf(42) === "P042"`, `codeOf(1000) === "P1000"`.
  - `normalisesCaseSpacesApostrophesAndNfc`: `normName("  PRIYA   Sharma ") === "priya sharma"`, `normName("R.K. Sharma") === normName("R. K. Sharma")`, `normName("D’Souza") === "d'souza"`, `normName("प्रिया".normalize("NFD")) === normName("प्रिया")`.
  - `wholeWordsOnly`: with Priya Sharma (spellings `["Priya"]`): `findNames("Priya's book", m)` one sure find "Priya"; `"Priya-ji came"` one find; `"Priyanka came"` none; `"PRIYA said"` one.
  - `longestFirst`: `"Priya Sharma and Priya"` → two finds, texts `"Priya Sharma"` and `"Priya"`, both `personIds: [id]`.
  - `devanagariMarks`: spelling `"प्रिया"`: `"प्रिया की माँ"` one find; `"प्रियांका"` none.
  - `everydayNeedsCapital`: person Will Thomas with `everyday: ["Will"]`, spellings `["Will"]`: `"I will go"` none; `"Will said"` one find `kind: "ask", why: "everyday"`. Devanagari everyday spelling `"आशा"` in `"आशा है"` → one `ask` find.
  - `sharedShortNameIsAsk`: two people both with spelling "Priya" → `"Priya came"` one find `kind: "ask", why: "shared"`, `personIds` both ids.
  - `surnameAloneNotLooked`: Priya Sharma with spellings `["Priya"]`: `"Sharma (2019) found"` → none.
  - `suggestions`: list empty; `suggestNames("Meena: I came.\nInterviewer: Why?", m, [], { speakerLabels: true, firstNames: false })` → one find text "Meena" `why: "speaker"`; `suggestNames("Then Rahul left.", m, [], { speakerLabels: false, firstNames: true })` → "Rahul" `why: "first-name"`; `"then rahul left"` → none (lower case); `notNames: ["rahul"]` → none; a word in `findNames`' result is never also suggested.
  - `replaceKeepsSurroundings`: `replaceFinds("Priya's book", findNames(...), () => "P001") === "P001's book"`.
  - `fastOnLongText`: 200 people, a 50,000-word text; one `findNames` call under 300 ms (`performance.now()`).
  - `dataLists`: `EVERYDAY_NAMES` includes asha, kiran, pooja, raja, rani, dev, joy, rose, will, hope, sunny, bill, mark; `FIRST_NAMES.size >= 1000`; every entry of both is already `normName`-ed; no `FIRST_NAMES` entry is in `EVERYDAY_NAMES`.
- [ ] **Step 2: Run** `pnpm --filter @appuscholar/core test participants` → FAIL (module not found).
- [ ] **Step 3: Implement** `participants.ts`. Approach: one compiled regex per matcher built from every normalised spelling (and name), escaped, sorted longest first, with lookbehind/lookahead `(?<![\p{L}\p{N}\p{M}])` / `(?![\p{L}\p{N}\p{M}])` and flag `giu`, run over a normalised copy of the text with an index map back to the original (normalising only changes case, dot-runs and spaces, so keep a position map). Everyday spellings: require the original text's first character to be upper case (Latin) or the script to have no case. Data files: plain arrays of normalised words; the first-names list compiled from common Indian (Hindi-belt, South Indian, Bengali, Marathi, Punjabi, Muslim, Christian) and English given names, at least 1,000, none of them everyday words.
- [ ] **Step 4: Run** the tests → PASS; `pnpm --filter @appuscholar/core typecheck && pnpm --filter @appuscholar/core lint` clean.
- [ ] **Step 5: Commit** `feat(core): participant name matcher, codes and suggestion lists`.

### Task 2: Tables against the list, and F1 (core)

**Files:**
- Create: `packages/core/src/participantsTable.ts`
- Modify: `packages/core/src/index.ts` (append)
- Test: `packages/core/test/participantsTable.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Matcher`, `findNames`, `suggestNames`, `codeOf`, `normName`); `ParsedData`, `pdScan`, `PdFound` from core.
- Produces:
  - `pdScanV2(data: ParsedData): { found: PdFound[]; freeText: string[] }` — `pdScan`'s result, except a `name` found `why: "values"` is dropped when any of the column's non-empty values has more than four words; the dropped column then goes through v1's long-text rule (mean length > 40 or a value > 120 → `freeText`).
  - `type ColumnNames = { index: number; listed: Array<{ row: number; personId: string }>; unlisted: string[]; withdrawnRows: number[]; inText: Array<{ row: number; finds: NameFind[] }>; roll: Array<{ row: number; personId: string }> }`
  - `listTableScan(data: ParsedData, m: Matcher, opts: { rolls: Map<string, string>; nameColumns: number[]; suggest: boolean; notNames: string[] }): ColumnNames[]` — a column's cell equal (by `normName`) to a listed name or spelling is `listed`; in a column in `nameColumns` (heading rule or listed values) a non-empty value not on the list is `unlisted` (distinct, first-seen order); a row of a withdrawn person with `data: "remove"` (matched by name, spelling, or a cell equal to their code) is in `withdrawnRows`; a cell that is not wholly a name gets `inText` from `findNames` plus `suggestNames(…, { speakerLabels: false, firstNames: opts.suggest })`; `rolls` maps normalised roll value → personId.
  - `type ColumnPlan = { index: number; action: "codes" | "remove" | "keep"; inText: "codes" | "keep"; dropRows: boolean; picks: Array<{ text: string; to: string }> }` — `picks` are the student's answers for the column's ask and suggest finds inside answers, by the find's `normName`-ed text: `to` is the chosen person's code or `"[name]"`; every occurrence of that text in the column's cells is replaced; a find with no pick is left as it is.
  - `listTransform(data: ParsedData, scan: ColumnNames[], plans: ColumnPlan[], m: Matcher, add: (name: string) => string): { headers: string[]; rows: string[][]; csv: string; coded: number; removed: number; removedRows: number; added: string[] }` — `codes` replaces each listed or roll cell with the person's code and each unlisted value with `add(value)` (the caller allocates the code; `added` lists those names in order); `remove` drops the column; `dropRows` drops `withdrawnRows`; `inText: "codes"` replaces sure finds inside cells with codes, then `picks` apply; `csv` via `pdCsv`. Header of a coded column becomes `ParticipantCode`.
- [ ] **Step 1: Write the failing tests:**
  - `picksApply`: a notes cell "Asha helped and Asha left" with an ask find Asha and `picks: [{ text: "asha", to: "P003" }]` → "P003 helped and P003 left"; with no pick → unchanged.
  - `f1OpenAnswersAreNotNames`: three-row table `notes` with "Priya said she liked it in the second week of the course honestly" etc. (no commas): `pdScan` flags `notes` as name (v1, unchanged); `pdScanV2` does not, and `freeText` is `["notes"]`.
  - `pdScanV2KeepsV1Elsewhere`: on every table in `packages/core/test/golden/pdscan/corpus.json` whose name-by-values columns have no value over four words, `pdScanV2` deep-equals `pdScan`.
  - `listedInAnyCaseAndSpacing`: list Priya Sharma P001, Rahul Verma P002; column `student name` with `"priya  sharma"`, `"RAHUL VERMA"`, `"Sunita Devi"` → `listed` rows 0 and 1, `unlisted: ["Sunita Devi"]`.
  - `withdrawnRowsByNameOrCode`: Imran P004 withdrawn `remove`; rows with `"Mohd. Imran"` in one table and `"P004"` in another → `withdrawnRows` holds each.
  - `namesInsideAnswers`: `"Rahul and I studied together"` in `notes` → `inText` one sure find for Rahul.
  - `rollMatches`: `rolls` `{ "21cs014" → P003's id }`, a `roll` column `"21CS014"` → `roll` row 0.
  - `transformUsesListCodes`: codes on `student name`, remove `village`, `dropRows` on the withdrawn column, `inText: "codes"` on notes → headers `["ParticipantCode", "notes", "score"]`, the Priya row starts `"P001"`, the Sunita row gets `add("Sunita Devi")`'s return (test passes `() => "P006"`), `added: ["Sunita Devi"]`, Imran's row gone (`removedRows: 1`), "Rahul and I…" becomes "P002 and I…".
- [ ] **Step 2: Run** `pnpm --filter @appuscholar/core test participantsTable` → FAIL.
- [ ] **Step 3: Implement** `participantsTable.ts`.
- [ ] **Step 4: Run** → PASS; `pnpm --filter @appuscholar/core test:golden` → PASS, no fixture written.
- [ ] **Step 5: Commit** `feat(core): tables against the participant list; open answers are not names (F1)`.

### Task 3: The plan in the paperwork (core)

**Files:**
- Create: `packages/core/src/designPlan.ts`
- Modify: `packages/core/src/index.ts` (append)
- Test: `packages/core/test/designPlan.test.ts`

**Interfaces:**
- Produces:
  - `type IdMode = "codes" | "pseudonyms" | "anonymous"`
  - `type RecordField = { id: string; group: "who" | "about"; ticked: boolean; sensitive?: boolean }`; `RECORD_FIELDS: readonly RecordField[]` with ids, groups and starting ticks exactly as §4's table: who `name` (ticked), `spellings` (ticked), `contact`, `roll`; about `age`, `gender`, `year`, `course`, `area`, `language`, `caste`, `religion`, `health`, `income` (the last four `sensitive: true`). Labels and lines are message keys `design_rec_<id>` and `design_rec_<id>_why` (Task 7 writes the copy).
  - `type Plan = { idMode?: IdMode; record?: string[]; recordOther?: string[] }`
  - `needsCombinationWarning(record: string[]): boolean` — true when three or more of age, gender, year, course, area, language, caste, religion, health, income are ticked.
  - `consentMarkdownV2(s: Parameters<typeof consentMarkdown>[0] & { minors?: string }, plan: Plan): ReturnType<typeof consentMarkdown>` — with `plan.idMode` unset, exactly `consentMarkdown(s)`; else v1's text with a `## What we record about you` section before `## Voluntary participation`, and, when `s.minors` is `yes` or `unsure`, `## Parent or guardian permission` and `## Young person's agreement` sections before `## Consent`, each with a signature and date line.
  - `ethicsStatementV2(s: Parameters<typeof ethicsStatement>[0], plan: Plan): ReturnType<typeof ethicsStatement>` — unset mode: exactly v1; else v1's text plus one sentence per mode (§4's two examples, a third for pseudonyms: "Participants are referred to by made-up names; the list linking them to real names was kept separately, sealed under the researcher's passphrase.").
  - `protocolMarkdownV2(o: ProtoFields, plan: Plan): string | null` — unset mode: exactly v1; else v1's text with `**How participants are identified:** <sentence>` after the data management plan's text.
  - `ecMinorsNoteV2(m: string): string` — v1's text with its last sentence replaced by "If you list people under 18, only you can open the list. You still need a parent's permission and their own agreement before you record anything about them." (C18); `""` where v1 gives `""`.
- [ ] **Step 1: Write the failing tests:** each V2 with `{}` plan equals its v1 function on the same inputs (three inputs each, including minors `yes`); consent with `idMode: "codes"`, `record: ["name","spellings","age","gender"]`, minors `yes` contains, in order, `## What we record about you`, `## Voluntary participation`, `## Parent or guardian permission`, `## Young person's agreement`, `## Consent`, and the record section names "your name", "age" and "gender" and says answers are kept under a code; `anonymous` consent says no name is recorded and has no guardian section unless minors is yes; ethics statement per mode ends with its sentence; protocol line present only with a mode; `ecMinorsNoteV2("yes")` ends with the new sentence and does not contain "Appuscholar is for adults"; `needsCombinationWarning(["age","gender"]) === false`, `(["age","gender","area"]) === true`.
- [ ] **Step 2: Run** `pnpm --filter @appuscholar/core test designPlan` → FAIL.
- [ ] **Step 3: Implement** `designPlan.ts` by calling the v1 functions and inserting sections (no v1 text edited).
- [ ] **Step 4: Run** → PASS; `test:golden` PASS unchanged.
- [ ] **Step 5: Commit** `feat(core): the identification plan in the consent form, ethics statement and protocol (O1)`; register rows for O1's sections, the statement and protocol lines, and the minors note (`proposed`, Dr. Sharma).

### Task 4: The blob kind, sealed only

**Files:**
- Create: `apps/web/lib/blobs/kinds/participants.ts`
- Modify: `apps/web/lib/blobs/kinds.ts` (`BLOB_KINDS`, shapes, schemas), `apps/web/lib/blobs/kinds/design.ts` (`DesignEcSchema`: optional `idMode`, `record: string[]`, `recordOther: string[]`), `apps/web/lib/frame/stages.ts` (`KIND_STAGE.participants = { stage: "collect", work: true }`), `apps/api/src/routes/blobWrite.ts` (`BLOB_KINDS` mirror; plaintext refusal)
- Test: `apps/web/test/participantsKind.test.ts`, `apps/api/test/blobWrite.participants.test.ts` (or the API's existing blob test file, extended)

**Interfaces:**
- Produces: `ParticipantSchema`, `ParticipantListSchema` exactly §6's shapes (loose objects; `everyday` and `about` default to `[]`/`{}` when absent); `type Participant`, `type ParticipantList`; `BlobShape<"participants"> = ParticipantList`; `emptyList(): ParticipantList` = `{ v: 1, next: 1, people: [], notNames: [] }`.
- API: a PUT of kind `participants` with `keyVersion: 0` answers 409 `vault-required` whether or not the user has a vault record.
- [ ] **Step 1: Write the failing tests:** web: `parseBlob("participants", JSON.stringify(sample))` returns the sample (one person with every field, one withdrawn); a person missing `everyday` parses with `[]`; `isBlobKind("participants")`; `stageOfKind("participants")` is collect/work; a `design_ec` blob with `idMode`, `record`, `recordOther` parses and one without them still parses. API: kinds lists match the web's (`BLOB_KINDS` equal as sets, existing parity test extended if there is one); plaintext PUT of `participants` for a user with no vault → 409 `vault-required`; ciphertext PUT → 200; plaintext PUT of `stats_prefs` for a user with no vault → 200 (unchanged).
- [ ] **Step 2: Run** `pnpm --filter @appuscholar/web test participantsKind` and `pnpm --filter @appuscholar/api test` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both → PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat: participants blob kind, refused in plaintext by the api`; register row for the R1 exception (OJ's ruling, 2026-10-24, `approved`).

### Task 5: The module, the tab's place and the list's state

**Files:**
- Create: `apps/web/components/tools/participants/index.ts`, `apps/web/lib/tools/participants/list.ts`, `apps/web/lib/tools/participants/useParticipants.ts`, `apps/web/lib/tools/participants/store.ts`, `apps/web/messages/tools/participants.en.json`, `apps/web/messages/tools/participants.hi.json`
- Modify: `apps/web/lib/tools.ts` (`ToolId` + `"participants"`, `TOOL_TO_STAGE`, `TOOLS_BY_STAGE.collect` first), `apps/web/lib/tools/tabs.ts` (`tab("collect", "participants", "participants")` before `data`), `apps/web/lib/tools/registry.ts` (`MODULES`), `apps/web/messages/tools/index.ts`, `apps/web/messages/en.json` + `hi.json` (`tab_name_participants` "Participants", `collect_next_participants` "Next: paste your data in Statistics; names on your list are swapped for their codes."), and the tests that list Collection's tabs: `apps/web/test/places.test.ts:11`, `apps/web/test/toolRegistry.test.tsx:83`, `apps/web/test/toolLoadOrder.test.ts:61`, `apps/web/e2e/tools-g.spec.ts:38`; any other test that opens `/collect` without a tab and expects Statistics (find with `grep -rn "/collect\b\|collect\")" apps/web/test apps/web/e2e`), changed to `/collect/data`.
- Test: `apps/web/test/participantsList.test.ts`, `apps/web/test/participantsStore.test.tsx`

**Interfaces:**
- Consumes: Task 4 types; Task 1 `codeOf`, `normName`, `isEverydayName`, `MatchPerson`.
- Produces (`list.ts`, pure):
  - `addPerson(l: ParticipantList, p: Omit<Participant, "id" | "code">): { list: ParticipantList; person: Participant }` — code `codeOf(l.next)`, `next + 1`, id `crypto.randomUUID()`.
  - `addPeople(l, names: Array<{ name: string; spellings: string[]; code?: string }>, today: string): { list; added: Participant[]; skipped: Array<{ name: string; why: "already" | "code-taken" }> }` — a given code is kept and `next` becomes max(next, code+1); a name equal (normName) to a listed name is skipped `already`; a code held by another name is skipped `code-taken`.
  - `editPerson(l, id, patch: Partial<Participant>): ParticipantList` (never changes `code`); `withdraw(l, id, on: string, data: "remove" | "keep")`; `destroyList(l, now: string): ParticipantList` → `{ v: 1, next: l.next, people: [], notNames: [], destroyedAt: now }`; `addNotName(l, word)`.
  - `suggestedShortName(name: string): string` — the name's first word, skipping a leading `Mohd.`, `Md.`, `Mr`, `Mrs`, `Ms`, `Dr`, `Shri`, `Smt`, `Kumari`.
  - `isMinor(p: Participant, recordsAge: boolean): boolean`; `consentComplete(p, recordsAge): boolean` (not minor, or guardian and assent).
  - `toMatchPeople(l: ParticipantList, pseudonyms: boolean): MatchPerson[]` — empty when `destroyedAt`.
  - `listCsv(l: ParticipantList, fields: string[]): string`; `characteristicsTable(l, aboutFields: string[], pseudonyms: boolean): string` (tab-separated, no name, spellings, contact or roll).
- Produces (`useParticipants.ts`): `useParticipants(projectId: string): { list: ParticipantList | null; state: "loading" | "off" | "locked" | "broken" | "ready"; save(update: (prev: ParticipantList) => ParticipantList): boolean }` — reads the blob only when the vault is `unlocked` or `migrating` (never raises a passphrase prompt itself, as `components/tools/qual/DocumentLayer.tsx`); `off` when the vault is off (and `save` refuses); `save` applies the updater to the latest value inside the blob's `set(prev => …)` and publishes to the store.
- Produces (`store.ts`): `publishList(projectId: string, l: ParticipantList | null): void`, `listFor(projectId: string): ParticipantList | null`, `subscribeList(cb): () => void`, `useListFor(projectId)`.
- `index.ts`: `export const built = false` in this task (Task 6 turns it on).
- [ ] **Step 1: Write the failing tests:** `list.ts` per function (codes P001…, `next` never down after destroy, key-file paste `ParticipantCode,student name` / `P007,Asha Kumari` keeps P007 and sets next 8, `code-taken` and `already` skips, `suggestedShortName("Mohd. Imran") === "Imran"`, `characteristicsTable` has no name column); `allocatesFromTheLatestValue`: two `save` calls from two hook instances on one blob each adding a person end with P001 and P002, never two P001; `useParticipants` with a locked vault makes no GET and returns `locked`; with the vault off returns `off` and `save` returns false; the collect place's tabs are `["participants", "data", "power", "charts", "check", "scales", "coding"]`.
- [ ] **Step 2: Run** `pnpm --filter @appuscholar/web test participants places toolRegistry toolLoadOrder` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `pnpm --filter @appuscholar/web test` (all) PASS; typecheck, lint clean.
- [ ] **Step 5: Commit** `feat(web): participants module, its place in Collection and the list's state`.

### Task 6: The Participants tab: list, add, edit, paste

**Files:**
- Create: `apps/web/components/tools/participants/Panel.tsx`, `apps/web/components/tools/participants/PersonForm.tsx`, `apps/web/components/tools/participants/PasteList.tsx`
- Modify: `apps/web/components/tools/participants/index.ts` (`built = true`, `export { Panel }`), `participants.{en,hi}.json`
- Test: `apps/web/test/participantsPanel.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`useParticipants`, `list.ts`), `useDesign("ec", projectId)` for the plan (`idMode`, `record`, `recordOther`, `minors`), `placeHref` for the Ethics link.
- Produces: test ids `pp-panel`, `pp-plan`, `pp-count`, `pp-table`, `pp-row-<code>`, `pp-add`, `pp-form`, `pp-form-<field>`, `pp-form-save`, `pp-paste`, `pp-paste-box`, `pp-paste-go`, `pp-paste-result`, `pp-locked`, `pp-off`, `pp-anonymous`.
- [ ] **Step 1: Write the failing tests** (mock the blob client as the stats panel tests do):
  - The mockup's five people render with codes, spellings under names, the Consent group with Under 18 / Parent's permission / Own agreement only when minors is `yes` or `unsure`, About columns only for ticked fields, and Rahul's row showing "consent not complete" (amber) while still saved.
  - The plan line reads the mode and fields; unanswered → "Not answered yet in your plan" and a link to `/p/<id>/design/ethics`.
  - Add: the form shows only ticked fields, "the next code is P006", Other spellings pre-filled with `suggestedShortName`, an everyday spelling pre-marked; saving adds P006 with joined = today.
  - Edit never shows or changes the code.
  - Paste: three lines, one already listed → "Added 2 people (P006–P007). Skipped 1 already on your list: Priya Sharma."; a key file keeps its codes.
  - `locksMidSession`: vault goes locked while open → names gone, `pp-locked` shown, nothing saved.
  - Vault off → `pp-off` with the vault set-up button, no table; anonymous plan → only `pp-anonymous`; no `window.confirm`/`alert` called.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** to the mockup (`.superpowers/brainstorm/75799-1792814796/content/participants-tab.html`; the table scrolls inside itself on a phone). **Step 4: Run** → PASS; all web tests, typecheck, lint.
- [ ] **Step 5: Commit** `feat(web): the Participants tab (list, add, edit, paste)`; register row for the tab (new, beyond v1).

### Task 7: The plan in Design and ethics

**Files:**
- Modify: `apps/web/components/tools/design/Ethics.tsx`, `apps/web/components/tools/design/Protocol.tsx`, `apps/web/messages/tools/design.{en,hi}.json`
- Test: `apps/web/test/designEthicsPlan.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`RECORD_FIELDS`, `needsCombinationWarning`, the V2 functions, `ecMinorsNoteV2`), Task 4 (`design_ec` fields).
- Produces: test ids `ec-idmode`, `ec-rec-<id>`, `ec-rec-other`, `ec-rec-combo`.
- [ ] **Step 1: Write the failing tests:** the question with three answers saves `idMode` with Save; the menu hidden for anonymous; ticks start as §4 (name and spellings ticked); the four sensitive fields show "Sensitive: your committee will ask why you need it"; three about ticks show the combination line; "Add another detail" accepts up to five labels into `recordOther`; the consent generator inserts `consentMarkdownV2(f, plan)` (with minors `yes`, the two new sections are in the inserted text); the statement inserts `ethicsStatementV2`; Protocol inserts `protocolMarkdownV2` with the plan read from `design_ec`; the minors note shows `ecMinorsNoteV2`'s text; with no mode chosen every inserted text equals v1's (existing tests in `apps/web/test/` for Ethics and Protocol stay green unchanged).
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS (all web tests).
- [ ] **Step 5: Commit** `feat(web): how participants are identified, planned in Ethics and carried into the paperwork`; register row for the question and menu.

### Task 8: The Participants tab: withdraw, copy, download, destroy, plan changes

**Files:**
- Create: `apps/web/components/tools/participants/Actions.tsx`, `apps/web/components/tools/participants/DestroyDialog.tsx`
- Modify: `Panel.tsx`, `PersonForm.tsx`, `participants.{en,hi}.json`
- Test: `apps/web/test/participantsActions.test.tsx`

**Interfaces:**
- Consumes: Task 5 `withdraw`, `destroyList`, `listCsv`, `characteristicsTable`; `downloadBlob` (`lib/export/download`); the clipboard as other tabs use it.
- Produces: test ids `pp-withdraw`, `pp-copy`, `pp-download`, `pp-destroy`, `pp-destroy-1`, `pp-destroy-2`, `pp-destroyed`, `pp-plan-drift`.
- [ ] **Step 1: Write the failing tests:** withdraw sets the tag "Withdrew 15/10/2026 · remove their data" and greys the row, the code kept; Copy puts a tab-separated table with Code and the about columns and no name on the clipboard; Download saves `participant-list-<project title>.csv` with every field and shows "This file holds names. Keep it apart from your data." beside the button; Destroy needs two presses in the dialog, then the tab says the list was destroyed on <date> and the next person added gets the next code (not P001); an unticked field with stored values shows "Contact is still stored for 3 people, but your plan no longer records it." and "Remove these values" clears them; anonymous plan with people → the list still shows with "Your plan now says anonymous, but a list of 5 people is stored. Destroy the list, or change the plan back."; the highlight switch saves `highlight: false`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(web): withdraw, copy, download and destroy the participant list`.

### Task 9: Names in documents

**Files:**
- Create: `apps/web/components/tools/participants/DocumentLayer.tsx`, `apps/web/components/tools/participants/FindNames.tsx`, `apps/web/lib/tools/participants/docNames.ts`
- Modify: `apps/web/components/tools/participants/index.ts` (`export { DocumentLayer }`), `Panel.tsx`, `participants.{en,hi}.json`
- Test: `apps/web/test/participantsDocs.test.ts`, `apps/web/test/participantsLayer.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`buildMatcher`, `findNames`, `suggestNames`, `replaceFinds`), Task 5 (`useParticipants`, `toMatchPeople`, `publishList`), `useDocAccess().allDocuments()` and `rewriteDocument(id, html)` (`lib/editor/docAccess.ts`).
- Produces:
  - `docNames.ts`: `findInHtml(html: string, m: Matcher, suggest: { notNames: string[] }): Array<NameFind & { block: number; sentence: string }>` — walks the HTML's text per block element (inline marks joined, so `<b>Pri</b>ya` is one find; finds never cross blocks); `replaceInHtml(html: string, picks: Array<{ find: NameFind & { block: number }; to: string }>): string` — replaces inside text nodes only, splitting a find across nodes onto its first node.
  - `DocumentLayer`: renders nothing; when the vault is open and the list readable, publishes the list (`publishList`) and, unless `highlight === false`, paints the open editor's `.editor .ProseMirror` text with `CSS.highlights` named `pp-sure` and `pp-maybe` (purple `#ede9fe` with a `#7c3aed` underline; amber `#fef3c7` with a dashed `#d97706` underline, via a `<style>` of `::highlight(pp-sure)` / `::highlight(pp-maybe)`), recomputed by a MutationObserver at most every 500 ms; nothing when `CSS.highlights` is absent.
  - `FindNames`: test ids `pp-find`, `pp-find-doc-<id>`, `pp-find-person-<code>`, `pp-find-replace-all-<code>`, `pp-find-check-<code>`, `pp-find-skip`, `pp-find-replace`, `pp-find-add`, `pp-find-mask`, `pp-find-notname`, `pp-find-refused`.
- [ ] **Step 1: Write the failing tests:** `findsANameSplitByInlineMarks`; a name across two paragraphs is not found; replacing keeps marks and other text; Find lists "P001 Priya Sharma · 3 places (incl. प्रिया)" for the mockup's transcript, ask finds under Check each with their sentence, Meena as a suggestion; Replace all calls `rewriteDocument` once per affected document with every sure find of that person replaced; pseudonyms mode replaces with the made-up name; a refused rewrite is reported by document name; a withdrawn-remove person's finds carry "withdrew: remove their data"; the result says once "Earlier saved versions of a document still hold the old text, sealed in your vault." (C19); "Not a name" adds to `notNames` and the suggestion disappears; `debouncesRepaint`: ten mutations within 100 ms cause one repaint; with `CSS.highlights` undefined the layer renders and throws nothing.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(web): find and replace participant names in documents, highlighted in the editor`.

### Task 10: The Statistics box against the list

**Files:**
- Modify: `apps/web/lib/tools/stats/lab.ts` (scan with `pdScanV2` and `listTableScan`; new choice state per column), `apps/web/lib/tools/stats/useLabActions.ts` (apply: list codes, add people, no key file when the list is used), `apps/web/components/tools/stats/PdBox.tsx`, `apps/web/lib/tools/stats/explainGuard.ts` (list codes), `apps/web/messages/tools/stats.{en,hi}.json`; the existing assertions this changes in `apps/web/test/statsIntake.test.tsx` and `apps/web/e2e/tools-b.spec.ts` (only where a table now meets a list or an open-answer column; tables with no list and no long answers keep v1's box exactly)
- Test: `apps/web/test/statsPdList.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`pdScanV2`, `listTableScan`, `listTransform`), Task 5 (`useParticipants` for the list and `save` to add people; `listFor` when no hook is mounted), Task 3 `IdMode` from `design_ec`.
- Produces: test ids `pd-list-<index>`, `pd-unlisted-<index>`, `pd-withdrawn-<index>`, `pd-intext-<index>`, `pd-maybe-<index>`, `pd-will-add`.
- Rules (§8.1, C14): listed column starts `codes`; heading-says-name column with no listed values starts `codes` (adds them); name-by-values-only column starts at an empty "Choose…" option (no action); withdrawn-remove rows start `dropRows: true`; listed names inside answers start `inText: "codes"`; roll columns: list `roll` match → codes, else (list present) Remove; anonymous plan → name columns start Remove with "Your plan says this study is anonymous."; vault off, or codes plan with no list readable → v1's box and key file, with the line saying why. Apply says "Apply will add 1 person to your list: Sunita Devi (P006)" before it runs, adds them through `save`, then rewrites the paste box.
- [ ] **Step 1: Write the failing tests:** the mockup's table (student name, village, notes, score; Sunita unlisted, Imran withdrawn) gives each proposed row with its starting choice; Apply yields `ParticipantCode,notes,score` with list codes, Sunita P006 added to the list, Imran's row gone, "Rahul and I…" → "P002 and I…", and no download; F1's open-answer table shows no name flag and lists `notes` as long text; with no list and the walk's two v1 tables, the box is exactly as before (selects `code`/`remove`, key file downloaded); Explain with a listed group label masks it as its code and the AI dialog is not opened a second time for that name.
- [ ] **Step 2–4:** FAIL, implement, PASS (`statsIntake`, `statsGuard`, all web tests).
- [ ] **Step 5: Commit** `feat(web): Statistics swaps names on the list for their codes, and stops guessing open answers (F1)`; register rows for the box's list codes and F1's rule.

### Task 11: AI requests, export-all and the home

**Files:**
- Modify (core's `pd.ts` stays as it is): `apps/web/lib/ai/callAI.ts` (scan names before `scanText`; `CallOpts.literature?: boolean`), `apps/web/lib/ai/useCallAI.ts` (pass the open list via `listFor(projectId)` and the plan's mode), `apps/web/lib/ai/pdDialog.tsx` (names line, Mask / Leave toggles, the locked line, the sentence about what is found), the literature callers (`grep -rln "useCallAI\|callAI(" apps/web/lib/analyse apps/web/lib/research apps/web/components/tools/research apps/web/lib/shelf apps/web/lib/cite*` → pass `{ literature: true }`), `apps/web/components/workspace/dialogs/Help.tsx` (export-all line, C10), `apps/web/components/tools/participants/index.ts` (`facts`)
- Test: `apps/web/test/aiNames.test.ts`, `apps/web/test/participantsFacts.test.ts`, extend `apps/web/test/` export-all dialog test

**Interfaces:**
- Consumes: Task 1 (`findNames`, `suggestNames`, `replaceFinds`), Task 5 (`listFor`, `toMatchPeople`).
- Produces: `ScanResult` gains `names?: { listed: number; maybe: string[]; locked: boolean }`; `askPd` resolves `{ answer: "mask" | "send" | "cancel"; leave: string[] }` (every caller updated, including `lib/tools/stats/useRunActions.ts`'s explain step from Task 10); `facts(b)` → `{ detail: "pp_facts", vars: { n }, started: n > 0 }` (counts only).
- Rules (§8.3, C11, C13): listed names are matched in every request; suggestions only when the mode is codes or pseudonyms or a list exists, and never with `literature: true`; Mask → codes (made-up names in pseudonyms mode), each "might be" at Mask → `[name]`; "Send as it is" remembered by a signature that includes the names; a project whose list blob exists but is locked → "Your participant list is locked, so names on it were not checked." with Unlock.
- [ ] **Step 1: Write the failing tests:** a prompt with "Priya Sharma said…" and an email: the dialog counts "1 name from your participant list, 1 email address", Mask sends "P001 said…" and `[email]`; a literature request with "Carl Rogers (1951)" opens no dialog; "Meena" suggested only in a codes-plan project; Leave on Meena sends her name; the locked line; export-all's dialog shows the line only when a project has a list; `facts` never contains a name.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(web): names on the participant list are caught before AI requests`; register row for the AI dialog.

### Task 12: End to end, register check, walk sheet, PR

**Files:**
- Create: `apps/web/e2e/participants.spec.ts`, `docs/walkthroughs/participants.md`
- Modify: `docs/superpowers/specs/parity-deviations.md` (check rows D-S2-113… are complete and consecutive)

- [ ] **Step 1: Write `participants.spec.ts`** (sign in and set up a vault as `apps/web/e2e/tools-c.spec.ts` does): plan codes with minors yes in Ethics → consent form inserted has the guardian and agreement sections; the Participants tab is Collection's first tab; add Priya Sharma and Rahul Verma, paste two more; Statistics: paste the mockup's table → codes from the list, Sunita added as the next code, no key file; a document with "Priya said … Meena didi …" → Find names lists P001 and Meena; Replace all → the document says P001; an AI request with Priya's name → the dialog counts a name from the list and Mask sends P001 (route intercepted, no provider called); reload → vault locked → the tab says unlock; destroy → next code continues.
- [ ] **Step 2: Run** the e2e (fresh servers, per the pglite recipe) → PASS; then the whole suite: `pnpm lint && pnpm typecheck && pnpm test` and the full Playwright run.
- [ ] **Step 3: Write `docs/walkthroughs/participants.md`**: numbered rows (plan, menu, consent form, tab, add, paste, key file, under-18 amber, withdraw, Statistics box, F1 table, Find names, highlights, AI dialog, locked vault, destroy, Hindi, phone width), each with the exact steps and what must be seen, and a blank result column for VERIFIED / SUPPORTED / BELIEVED / UNKNOWN.
- [ ] **Step 4: Push** `git push -u origin participants-register` and open a PR against `phase-3a-vault` titled "Participant list with name matching (replaces guessing names; F1, O1)"; body: what a student does, what happens underneath, the register rows, how to test, the release order (API then web).
- [ ] **Step 5: CI** green (changes, checks, e2e, golden-exact since `packages/core` changed), then merge.
