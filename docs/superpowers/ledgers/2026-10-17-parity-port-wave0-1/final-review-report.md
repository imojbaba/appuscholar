# Whole-branch review: parity-wave-0-1 (067bd2e..80e65b6), Waves 0 and 1

Reviewer: Fable 5.1, 2026-10-19. Read-only; nothing in the tree, index or HEAD was touched. v1 sha256 re-checked at start: e3ad7404efcc2684144cc86a8d9bc8cd607e98b3580283c769fe00e18b5fcb47 (13,699 lines). Read: the spec, the plan (Global Constraints, Review Focus, every task's Interfaces, the self-review), the register (26 rows), the ledger in full, the review package in passes (every `src` module, every test, every capture script, the harness, CI, configs, the lockfile diff), and the v1 lines cited by every Wave 1 module header (`sed -n` only). One focused vitest run for a named doubt (below).

## Strengths

- **Fidelity is real, not asserted.** Every function I compared against v1's lines is token-identical apart from the declared edits: the p-value core (8633–8690), the formatters (11980–11982), the Numbers check (12195–12257, including v1's `(f.op==='='?f.p:f.p)` quirk), the whole cross-check (12100–12157), the library operations (7488–7493, 7515–7555, 7871–7881, 7991–8023, 12 import fields), the citation helpers and the MLA branch, the Analyse helpers, every Research helper, `pdCsv`, and all thirteen prompt builders with their options. Each page read became a parameter at exactly v1's read point (`#citStyle` 7325/7550/8466, `AP.doc`, `rsResults`, `fieldName()`, the trims at 10035/10051/11164/8603/8620/3609/8174/8252/8284) and nowhere else.
- **The harness is sound.** `encodeSpecial` refuses non-JSON values with the path; `--check` never writes and keeps the capture date; a fresh page per engine, closed in `finally`; every one of the 31 captured fixtures carries v1's sha256, build and line count (the hand-written inputs, the audit copy, the scipy file and the two Chromium files legitimately carry other headers). Captures throw on their own preconditions (one callAI call per entry, no toast, `citFmt(d)` = `citFmt(d,0,style)` = `citFmt(d,undefined,style)`, `apOk()`, the 12-result batch), so a fixture cannot silently record the wrong state.
- **Thresholds and cuts are found, not typed.** D-W1-2 (3,145,728 bytes by halving), D-W1-4 (40/25/25/150 by trying every size), D-W1-6 (400 and the box's maxlength), the 6,500 cut (D-W1-8, by an eval swap v1's own `apLesAsk` cannot tell apart). The plan's two wrong premises (the `numbersSummary` literal, the "question cut at 400") were caught by capture and recorded, not papered over.
- **Two real port bugs found by goldens in Wave 0** (origin.ts's tag walker leaking attribute text; v1import's project `name`), fixed minimally, with the Phase 1 fixtures corrected.
- **Review Focus 1–5 are each pinned by a named test**: `citlib.test.ts` mergeLibrary (2,001→2,000, exact-duplicate skip, defaults, not-a-library, missing title); `doctext.test.ts` `refs-hindi-heading` + `crosscheck.test.ts` "the Hindi heading and the nbsp citation are found through the HTML path"; `numbers.test.ts` F5 (`pcalc: 0`) and the glued split; `citation.test.ts` `org-no-year` (`[?]`, `sup`, `n.d.`) with `initials-hyphen`/`initials-caps` through the `citInitials` helper records; `doctext.test.ts` requires `empty-paragraphs`, `trailing-br`, `list-tiptap`, `nested-list`, `table-in-li` and compares every id to Chromium 156.
- **Gates**: Wave 0 (13 demos through `statsRunNow` with the audit's independent capture as a cross-check, 20 pure functions, `test:golden` in CI's `checks` job before `pnpm -r test`) and Wave 1's C1 (1,376 citation snapshots against the 200 asked) are met. Spec §5.7 holds: `grep` finds `document`/`window`/`localStorage` in `src` only inside comments. §5.4 holds: the only Devanagari in `src` is citation.ts:42–47 and the crosscheck heading regex, both checked both ways against v1's runs.
- The module headers are unusually good: each states the v1 lines, every edit, and what was not ported and why. Wave 5 can be built from them.

## Issues

### Critical (Must Fix)

None. No number or string a student could see differs from v1; no fixture is other than v1's; CI will not be red (see the Node 22 note under Minor).

### Important (Should Fix)

1. **Register gap: the case tool's privacy confirm is documented only in a module header.** `packages/core/src/prompts-helpers.ts:13` ("Not ported (the page): ... the confirm that the case tool asks once a session (8605-8608)") describes v1's `confirm('This text will be sent to your AI provider. Remove names, dates of birth, addresses ... (APA Ethics 4.07). Continue?')` before `psychTool('case')` sends a case description. D-W1-4 lists the four size guards and the "Long document" toast as the panel's, but not this step, so nothing in the register tells Wave 5 to reproduce it, and the ledger is git-ignored. A reasonable student expects the warning before a case text with identifying details leaves the browser. Same class, lower stakes, also header-only: `researchLitReview`/`researchGapFinder` refuse fewer than 2 papers (8532, 8543; `prompts-research.ts:17`), `rsSuggestTerms` a topic under 3 characters (8253), `ideaAssess` an empty topic (8572; `prompts-idea.ts:9`). Fix: extend D-W1-4 (or add one `noted` row) naming all five with their v1 lines and messages, pinned "when the Wave 5 panel lands".

2. **D-W0-4's `why` cell is wrong, and the row OJ is asked to rule on does not name the concrete effect.** The cell says "v2 has no source documents yet"; v2 has `kind: "source"` (apps/api/src/routes/documents.ts:10, projects.ts:69 and :82 already keep sources out of the writing record; apps/web/lib/import/run.ts:28 marks PDFs as sources). The real effect is `apps/web/components/import/ImportV1.tsx:59`, which posts every imported v1 document as `kind: "draft"` because `v1import.ts` drops `origin`/`src`. So a v1 source paper lands as the student's own and its words count as typed in the writing record. Fix before merge (register only): rewrite the `why` cell to say this and name the two-line change OJ would be approving (`RawDoc` keeps `origin`/`src`; `ImportV1.tsx` posts `kind: d.origin === "source" ? "source" : "draft"`). The code change itself waits for OJ (numbers change, `proposed`).

3. **Six register rows exist only in the git-ignored ledger.** "Register rows queued for the final fix wave": T9 particle-inside-word (`The original Smith (2015)` reads "al Smith"), T11 page-boundary quote head (10014) and Devanagari tokens (`apToks` cannot score a Hindi question), T12 dedupe key (`\W+` without `u`: all-Devanagari titles collapse to one) and ASCII `\d` in the quick-read drop rule, T13 custom field of 36/40/42+ characters relabelling three helpers "other help". All `noted`, no output change, all v1 behaviour Dr. Sharma should see. If the branch merges without them they are lost with `.superpowers/`. Fix before merge: write the six rows (docs only, no capture needed).

### Minor (Nice to Have)

4. `packages/core/eslint.config.js`: add `no-restricted-globals` (`document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `location`) for `src/**`. Spec §5.7 is review-enforced today (grep is clean); one line makes it mechanical before Wave 2's much larger ports. Fix before merge.
5. Two tests value-import capture scripts: `citlib.test.ts:8` (`generatedText`), `devanagari.test.ts:3` (`RANGES`, `DEVANAGARI_*`, `decodeEscapes`); three more import types only (erased). I ran `vitest run devanagari citlib doctext-elements live` with `V1_INDEX` unset: 3 files passed, `live` skipped, so no CI risk today (both capture modules import only `node:fs` and `harness/fixture` at module level). The coupling means a future top-level `loadV1()` in either capture would break CI; move those four helpers into `test/golden/harness/` (or state the rule in a comment).
6. `citation/capture.ts` RANGES omits the option and guard lines whose values are in core: 8175 (150), 8177, 8227 (options), 8252–8253, 8284, 8532, 8543, 8572, 12159 (`crossCheckHtml`), 12354–12356 (`numbersCheck`/`numbersSummary`). None holds Devanagari (checked), so nothing is missed today; completeness only.
7. Hand-typed expectations on ported-function output (spec §5.2, letter not spirit; each duplicates a fixture case that is also `toEqual`'d): `crosscheck.test.ts` `n.cited).toBe(2)` and `["Smith, 2020", "Rao et al., 2019"]`, the `"संदर्भ सूची"` literal (a Devanagari string retyped in a test file; the Devanagari test scans `src` only); `numbers.test.ts` F5 and split literals (plan-mandated). Read them from the fixture records instead.
8. D-W0-7's `why` says "no Wave 0–1 consumer distinguishes runs of spaces", but the row's other column (a newline inside a text node becomes a line break under pre-wrap) is distinguished by a Wave 1 consumer: `ccSplit` splits on `\n` to find the reference heading. Reachable only by imported v1 HTML with a raw newline in a text node, not yet re-saved by TipTap; pinned by `pre-wrap-newlines-in-text`. Name `ccSplit` in the cell.
9. `CC_STOP` and `AP_STOP` are exported as mutable `Set<string>`; `ReadonlySet<string>` stops a panel from mutating v1's tables.
10. `buildLessonAskPrompt`'s `teacher: keyof typeof AP_NAME` collapses to `string` (AP_NAME is `Record<string,string>` in analyse.ts); `keyof typeof AP_NAME_TABLE` would reject an unknown teacher at compile time instead of printing "You are undefined".
11. `apps/web/lib/ai/chat.ts:14` passes `d.field || "psychology"` to `buildChatPrompt`; D-W0-8 says callers pass `fieldLabel(...)` (trim, 60 characters). Out of this plan's files; a one-line Wave 5 (or earlier) change.
12. The branch's first CI run is its first Node 22 run; 232 `toBe` comparisons of doubles (pvalue, statfmt, the `pcalc` values in numbers) rest on V8's `Math.log/exp/pow` being bit-identical between Node 22 and 26. They have been for years; watch the first run.
13. Small hardening from the ledger worth a line each: `emitTables` would print `null` for a NaN in a table (throw instead); `OWN_TOLERANCE` has no guard that each key still fails the global rule; two `apCheckQuote` tests share a name; `prompts-analyse/cases.json` is 1.88 MB with two docs repeated 52 times.

## Deferred-minor triage (every `minor (deferred)` line and queued row in the ledger)

- T1 `no-restricted-globals` for `src/**` — **fix before merge** (one line; see Minor 4).
- T1 lockfile churn (eslint-config-next's optional parser peer dropped) — later; one line in the PR body as planned (workspace lint green).
- T1 `setEditorHtml` sets innerHTML without `bodyToHTML` — later wave (documented; Wave 2 captures that need plain bodies add it then).
- T1 `harness.test.ts` dynamic import shadows the top-level import; `live.test.ts` first test leaves the window open; `emitTables` NaN→null — later (none reachable today).
- T2 F5 narrower than audit F5 (`1 − ptukey` 9264, 12714, 12908) — Wave 2. Four unlisted innerText reads (3558, 6814, 12473, 13527) — Wave 3 audit gap. D-W0-1's `why` is provenance not reason — fix with the register pass if the row is touched, else later. Plan Task 2 table stale — history, none.
- T3 `section` not in BLOCK; thead/tfoot and cell whitespace unpinned; unbalanced `"` in a tag; colgroup/caption; `lastRow` guard — later (all outside sanitize.ts's domain or re-captured by Wave 3's Closeness).
- T4 `ported.test.ts` header omits two listed assertions — later (comment).
- T5 v1import `name: ""` → title `""` — later (unreachable: `saveAsProject` rejects an empty name, 2894; the web importer falls back). D-W0-4 test reads origin/src from derived records — later. **D-W0-4 `why` cell stale and `ImportV1.tsx:59` — fix the cell before merge (Important 2); the code waits for OJ.** D-W0-9 before D-W0-8 — reorder with the register pass. aiuse row 23 `.` vs `[^]` unpinned — later. `v1-backup-rich.json` stage "write" — later (unread).
- T6 iteration caps unpinned; `OWN_TOLERANCE` staleness; `ref === null` branch; no Node version in pvalue/cases.json; F5a wording; commit subject overstatement (PR body qualifies); pCell/fmtP quirks are v1's — later / none.
- T7 three killable mutants (`F(3, 50) = 200, p = .005`; `p > tiny`; `ncJudge` with `p < 0`) — later (needs a re-capture; fold into the first Wave 2 capture run). D-W1-1 "ASCII letter, digit or underscore" — fix with the register pass. Anchor guard checks ids not texts — later. "80-sentence" subject — none.
- T8 Devanagari extraction edge shapes — later (the capture throws on them, so they cannot pass silently). Raw U+0900/U+097F in the class — later. `(n&&n>0)?n:0` unpinned; `citEdList` over 7 strings; `citWho` bulk in cases.json; "400 snapshots" subject — later / none.
- T9 two hand-typed expectations at crosscheck.test.ts — later (Minor 7). IDS guard 9 of 13; four html docs not tied to Task 3's corpus; `CC_STOP` mutable Set (Minor 9); header wording — later. **Particle-inside-word `noted` row — fix before merge (Important 3).**
- T10 plan line 814 "13-field" — PR body, none. `exportLibrary([])` derived — none.
- T11 duplicate test name — later. **Page-boundary quote head and Devanagari tokens `noted` rows — fix before merge (Important 3).**
- T12 header line numbers 8028–8032 — later. **Dedupe key and ASCII digits `noted` rows — fix before merge (Important 3).**
- T13 **custom-field relabelling `noted` row — fix before merge (Important 3).** RANGES omissions (Minor 6) — fix when `citation` is next re-captured; `it` titles; plan wording — later / none.
- T14 1.88 MB fixture; `teacher` type (Minor 10); record key naming; D-W1-6 wording (the "cut at 400" premise, the silent returns at 11163/11168, the maxlength consequence), D-W1-8 pinned-by prefix, rule 5428 shadowing 5429 — the D-W1-6/8 wording with the register pass; the rest later.
- Task 5 observation (`ImportV1.tsx` posts imported v1 documents as `kind: "draft"`): see Important 2 — register before merge, code after OJ's ruling on D-W0-4.

## Declined to judge

- F23/F23a–c: whether the eight style rules match the manuals — Decision 5 names a librarian or Dr. Sharma; I checked that the port prints what v1 prints, not that v1 is right.
- D-W0-1 (`claude-haiku-5-5`): OJ's initial is still outstanding; the test pins whichever model stands.
- Decision 3 reference runs (R/SPSS for the two-way, mixed, ω, Games-Howell, Dunn, moderation, mediation, FFH) — Wave 2.
- The `appuimg:` and `repairEscapedImages` non-port (D-W0-5) — decided in Phase 1 and recorded; not re-opened.
- Whether `aiuClassify` rule 5429 should be widened so ask/walk-through stop reading "other help" (D-W1-7) — copy, Dr. Sharma's.
- The v1 behaviours the queued rows record (particle inside a word, Hindi titles collapsing, ASCII `\d`) — v1's own bugs; recording them is the port's job, fixing them is not.
- Whether the Wave 5 panels should normalise the duplicate rule (D-W1-3) or the 12-field import (D-W1-5) — numbers, OJ's.
- `apps/web/lib/ai/chat.ts` not using `fieldLabel` (Minor 11) — outside this plan's file list; noted for Wave 5, not graded against this branch.
- Node 22 bit-identity of V8's math (Minor 12) — cannot be settled from this Mac; the first CI run settles it.

## Recommendations

1. One docs-only fix wave before the PR is merged: Important 1–3 plus the register wording items (D-W1-1, D-W1-6, D-W1-8, D-W0-7, D-W0-1's why, D-W0-8/9 order). About ten cells and seven new rows, no capture, no code.
2. Add the `no-restricted-globals` line now (Minor 4); it costs nothing and Wave 2 ports 26 runners.
3. When `citation` is next re-captured (Wave 2's first task), extend RANGES with the option/guard lines (Minor 6) and move the four shared helpers out of the capture scripts (Minor 5).
4. In the PR body, beside the planned notes (13-field miscount, "within 1e-6 of scipy", lockfile churn, the plan's stale line numbers), add one line that the first green CI run is the Node 22 bit-identity check for the p-value doubles.
5. Carry Minor 9–11 into the first Wave 5 panel task's brief (ReadonlySet, the teacher key type, `fieldLabel` at chat.ts:14).

## Assessment

**Ready to merge?** With fixes

**Reasoning:** The code is merge-ready: every Wave 1 function is v1's to the token with its page reads turned into parameters at v1's own read points, every expected value comes from v1 running under the pinned build, the harness and CI are sound, and no number or string a student sees can differ from v1. What must land first is register-only: the privacy confirm and the four lesser panel guards (Important 1), D-W0-4's stale cell and its real effect at ImportV1.tsx:59 (Important 2), and the six `noted` rows that today exist only in the git-ignored ledger (Important 3), plus the one-line eslint rule.
