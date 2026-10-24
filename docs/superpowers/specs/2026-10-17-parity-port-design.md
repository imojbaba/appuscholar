# The parity port: design (supersedes the build method of BLUEPRINT §8, keeps its stage order)

Written 2026-10-17 from OJ's direction after seeing that twelve of the fourteen tool tabs render a placeholder and the MCP door exists only on paper: "I don't mean reinvent it all, I mean make it wired and fit in our workflow with all doors, and make it truly an MVP that can really run end to end and is usable." Input: `appuscholar-blueprint/PORT-AUDIT.md` (2026-10-17; 29 engine rows, 29 flags, evidence scripts in `port-audit-evidence/`). Lines marked **Ruling** are this document's calls and OJ can overturn them; lines marked **Decision** wait for OJ.

## 1. Intent

v1 is one HTML file in which every engine already works: 26 statistical tests with APA sentences, the numbers check, the closeness scorer, eight citation styles, the ethics generators, the quizzes and lectures. v2 so far re-implemented the platform, the writing stage and the vault from descriptions of v1, and left the engines unbuilt. The port lifts v1's engines into `packages/core` as they are, proves each one against v1's own output, wires every panel to them in the workspace that exists, and then opens the MCP door onto the same functions. The result is Dr. Sharma's product running end to end on the v2 platform, not an interpretation of it.

## 2. Goals

- Every one of his fourteen tool tabs does what v1's does, with v1's words in English and Hindi, on the live address.
- Every number v2 prints comes from code that was shown to print the same number as v1 on the same input (and, where a reference exists, the same as R or scipy).
- Participant data stays under the vault: unreadable to the server, computed on in the browser.
- A student's own Claude or ChatGPT can act on their project through the MCP door, calling the same functions, with every call logged and every pedagogical rule enforced.
- Dr. Sharma can walk his fifteen "Live" rows on the live address and mark each one.

## 3. Non-goals

- Redesigning any flow, wording or threshold of his. Improvements go in the deviation register (§5) and wait for his word.
- Beyond-v1 scope (Phase 7 items: PRISMA, lecture levels, roles, video maker, paid similarity vendor).
- Dark mode, offline, the operator-metered key: after parity, as before.

## 4. Anti-goals (failure even if it "works")

- An engine that "matches v1" only because someone typed the expected value by hand after reading v1's code. Expected values are captured from v1 running.
- A silent change of a number: a refactor that reorders floating-point arithmetic, swaps `toFixed` for `Intl`, or sorts groups differently (PORT-AUDIT F4).
- A panel that holds logic. Panels read fields and render results; `core` computes.
- The MCP door receiving raw participant rows, or a server-side process holding the vault key (vault spec, 2026-10-16).

## 5. Rules of the port (every wave, every task)

1. **Verbatim arithmetic.** Same operation order, same `toFixed` calls, same regex flags, same seeds (`Math.imul`), same group ordering (object-key order, F4). TypeScript types are added; behaviour is not.
2. **Golden master from v1 running.** A harness loads v1's `index.html` into jsdom (CDN scripts stripped, `showModal` and `TextEncoder` stubbed, no network) and captures outputs: pure functions by direct call over an input corpus; page-bound runners by filling the form and reading `#statsSentence`, `#statsResults`, the toast and the SVG; prompt builders by stubbing `callAI`; parsers by replaying recorded responses; content tables by `JSON.stringify` from the live page. Snapshots live in `packages/core/test/golden/<engine>/` as JSON with the input beside the output, committed. A `core` test fails when our function's output differs from the snapshot by one character.
3. **Browser-only truths captured in a browser.** `innerText` and `toLocaleString('en-IN')` are captured in Chrome once (Playwright), pinned, and our converter is tested against them (G1, F26, F28).
4. **Content is copied, never retyped.** Hindi strings, English notes, legal wording, lectures, quizzes, scales, rules: extracted by script, checked by sha256 and by a byte-equality test on every Devanagari string.
5. **Split compute from render.** Each engine becomes `compute(inputs) → plain result object` ({tables, notes[], apa, warnings[], skipped} for tests). A small test-only renderer turns the object into v1's strings so the comparison stays exact while the panel's layout stays free.
6. **Deviation register.** `docs/superpowers/specs/parity-deviations.md`: one row per deliberate difference from v1 (flag id, what, why, who approved, the test that pins the new behaviour). Nothing deviates without a row. Numbers never deviate without OJ; copy never deviates without Dr. Sharma.
7. **Where engines run.** Statistics, closeness, citation usage and anything else that reads the student's text or data run in the browser on decrypted data. The api receives ciphertext, metadata and the AI gateway's passages, as today. **Ruling**, confirming vault spec §Doors.
8. **Already ported stays.** `accuracy.ts`, `pd.ts`, `aiuse.ts`, `origin.ts`, `prompts.ts`, `providers.ts`, `v1import.ts`, `v1locked.ts`, `sanitize.ts` are not re-ported; Wave 0 adds golden-master snapshots for them so their hand-written expectations are checked once against v1 (PORT-AUDIT §3, last paragraph).
9. **Reference runs.** Where scipy has the statistic, the harness also compares with scipy (the audit's `03-compare-with-scipy.py` is the seed). Where only R or SPSS has it (two-way ANOVA Type III, mixed ANOVA, ω, Games-Howell, Dunn, moderation, mediation, Fisher-Freeman-Halton), the engine is marked "matches v1" until a reference run exists; it ships, with that label in the ledger, and the reference run is a listed task (Decision 3).
10. **The three tracks stay.** Maker (ledger line per task with commits), checker (review against the plan and for fidelity to v1, with the golden-master diff as evidence), student (a walk-through per stage on the live address). Nothing is complete without all three.

## 6. Waves (from PORT-AUDIT §5), each with its gate

| Wave | What | Audit rows | Hours (BELIEVED) | Gate to close the wave |
|---|---|---|---|---|
| 0 | Golden-master harness, document-text contract pinned to Chrome, deviation register, golden fixtures for the nine already-ported modules | G0, G1 | 6–9 | Harness captures all 13 demo datasets through `statsRunNow` and 20 pure functions by direct call; one CI job runs the golden tests |
| 1 | Phase 3 engines: citation formatting (8 styles), library operations against the vault, cross-check; Research and Analyse-a-paper pure helpers; p-value core; Numbers check; prompts for Idea, Research helpers, Research, Analyse | C1, C2, S11, O8 pure, O9 pure, S1 core, S10, O7 part | 42–58 | Every row green against its golden snapshots; C1 200 style snapshots equal |
| 2 | Phase 4 engines: statistics maths, intake and scan, 26 runners, assumptions, which-test guide, power, charts, results-to-data linking, Design & Ethics, scales, qualitative model | S1 rest, S2–S9, D1, D2, O1, O2 | 78–112 | All 13 demos and the edge corpus equal; scipy agreement where scipy has it; the four reference-less tests labelled |
| 3 | Phase 5 engines: closeness, Make PPT, Words and grammar, My Writing Style, lessons and quiz data, remaining prompts | S12, O3–O6, O7 rest | 28–39 | Golden equal; content sha256 equal; Devanagari byte-equal |
| 4 | Network I/O: Crossref, PubMed, OpenAlex fetchers, retraction, bookmarklet, dictionary, PDF text, Reading shelf | C3, O8 fetch, O9 extract, O10 | 24–32 | Recorded-response replay equal; rate limits as v1 (200 ms pacing) |
| 5 | Panels, stage by stage in blueprint order, each on green engines; datasets and the citation library encrypted in the vault from their first version | – | UNKNOWN (planning guess 150–250, SPECULATED) | Per stage: tests, 25+ browser journeys, deploy, a numbered walk-through on the live address with VERIFIED per step |
| 6 | MCP door: OAuth 2.1 server at `/mcp`, the thirteen tools of the engineering spec §8 as wrappers over `core`, the copilot grant (Decision 6), connector page, copilot revisions | – | UNKNOWN (thin once engines are pure) | Dr. Sharma connects Claude, runs a test on a dataset, sees the revision appear, disconnects |

Order inside Wave 2's S3: the 18 simple tests, then the 5 medium, then mixed ANOVA, moderation, mediation (reference runs first where possible).

Panels may start as soon as their engines are green: Wave 5 overlaps Waves 2–4 stage by stage. Wave 6 starts only when `run_test` has engines to call.

## 7. Definition of done for the MVP

A new student signs in, names a project, and completes the six-stage journey of BLUEPRINT §4 on the live address using his tools, with the walk-through script following those paragraphs step by step. Dr. Sharma's fifteen "Live" rows (VISION-VS-BUILD §2) read "Built" except where he has struck a row. The MCP door passes the engineering spec's success line: he connects Claude, runs a test on an encrypted dataset, and sees the edit appear as a revision. Suites green; the deviation register has an approver on every row.

## 8. Decisions

1. **Deviation policy. Ruling:** verbatim for every number; display and wording bugs (F1 `.000` column, F2 "group groups", F18 missing drop count, F13's "400" note) are fixed only with Dr. Sharma's approval of the wording and a pinned test; until then they port as they are and sit in the register as "proposed".
2. **Group handling (F3, F4). Ruling:** port v1's group order and its numeric-code limitation exactly. A "treat this numeric column as groups" option is a register entry for Dr. Sharma, not part of the port.
3. **Reference runs. Decision:** who produces R or SPSS output for two-way ANOVA, mixed ANOVA, ω and its interval, Games-Howell, Dunn, moderation, mediation, Fisher-Freeman-Halton on about ten small datasets. Recommendation: a session on a machine with R (this Mac has no Rscript) early in Wave 2; until then the four tests ship labelled "matches v1".
4. **Where engines run. Ruling:** in the browser (§5.7). The api never receives participant rows.
5. **Citation manuals (F23). Decision:** v1 marks all eight styles "CHECK". Recommendation: port verbatim in Wave 1, then one editorial pass against the manuals by a librarian or Dr. Sharma as a separate task with register rows.
6. **The MCP door and the vault. Ruling, for OJ to confirm:** a copilot grant is a vault grant to a session, not a key hand-over. The student, in the browser, wraps the DEK of one dataset (or document) to a server-held session key for a limited time (8 hours, as the engineering spec §6 proposed) and can revoke it; the api decrypts that one dataset in memory for a tool call and logs the run with `run_where = copilot`. VK never leaves the browser; no raw rows are sent by the student; the exposure is one dataset, one session, audited. The alternative, no copilot access to data at all (documents and citations only), is the fallback if OJ or Dr. Sharma rejects any server-side decryption.
7. **Wave 1 order. Decision:** stage order (citations, research, numbers check first) as the audit proposes, or statistics first because a wrong number does the most harm. Recommendation: stage order. The Writing stage is live now and the Citation Manager is its missing half; Dr. Sharma's first full comparison was always Phase 3; nothing in Wave 1 waits on Wave 2 except the 60-line p-value core, which Wave 1 includes.

## 9. Method

Each wave gets its own implementation plan written with the writing-plans skill from this spec and the audit rows it covers, with the exact v1 line ranges, the fixture corpus and the golden tests per task; OJ approves the plan; subagent-driven development executes it with per-task review; the wave's gate closes it. Waves 0 and 1 are one plan (the harness is only proven by porting something with it). Branch per wave off the current head (`phase-3a-vault` after PR #4), PR against it, CI green, deploy, walk-through where a panel ships.

## 10. Estimate, honestly

Engines 178–250 build hours (BELIEVED, no measured velocity in this repo). Panels of the same order, SPECULATED. MCP door small, UNKNOWN. In sessions: weeks, as BLUEPRINT §8 already said. What moves it most: Decisions 2 and 3, and whether the Chrome `innerText` contract holds on the first try (G1).
