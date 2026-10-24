# SDD ledger: plan docs/superpowers/plans/2026-10-21-wave-b-redesign.md (Task 38, Task 39, Task Q1, Task Q2)

Wave B side tasks, cloud session, branch `wave-b-side` from `origin/phase-3a-vault` 1ec773b. Sonnet implementers write tests first, one Opus review per task, minors logged as deferred. Started 2026-10-24 after the laptop crash: the earlier session's drafts of 38, 39 and Q1 sat unreviewed on `origin/wip/wave-b-side` (f068d61..63615e8) and were split here into one commit per task. Register ids D-S2-140 to D-S2-144.

## Pre-flight scan (2026-10-24)

| Pair or task | Produces / consumes | Finding |
|---|---|---|
| draft split | wip/wave-b-side: 4a7cc75, 4426010 (T39), 80e6065 and part of 63615e8 (T38), rest of 63615e8 (Q1) | df61722 (T38), a71655b (Q1), 9877b52 (T39). The draft's two ledger commits are not carried over; this file replaces them. |
| T38 vs T39 | T38 changes `exp_format_citations` in en/hi.json; T39 snapshots the dictionaries | T39 sits on T38 and regenerates its head snapshot after any later copy change. |
| T38 | the draft's register row D-S2-120 | Taken by `participants-register` (D-S2-113 to 121); `wave-b2` uses 121 to 127, `wave-d` claims 110 to 129. Ruling R1. |
| T39 | plan: the sheet (base af11810: 1,141 keys, 366 English copies) | Now 1,425 keys, 369 English copies (358 are panel keys ap2_/rs2_/sh2_ with "Hindi = English until Dr. Sharma provides Hindi"). Since v2's pinned v1 (build 2026.10.13a), v1 gained Hindi for those panels (v1 versions 96 to 106). Ruling R2. |
| T39 | v1 source for the re-map | v1 commit c8c5373 (build 2026.10.13a) regenerates en.json, hi.json and v1-panels.manifest.json byte for byte; the newest v1 is f5336be (Version 116, build 2026.10.24a). |
| Q1 → Q2 | Q2's runner consumes Q1's sets and graders | Sequential: Q2 starts after Q1's review settles the interfaces. |
| Q1 | draft lint | `textOf` unused in test/grade.test.ts:162; `pnpm -r lint` would fail in CI. |
| Q2 | baseline needs a live key | Not run here. Ruling R3. |
| Q2 | `apps/api/scripts/quality.ts` | `apps/api` lints `src test` and its tsconfig includes `src` and `test` only, so the CLI needs both widened to be checked in CI. |

## Rulings
- R1: Ruling: this branch's register rows take D-S2-140 to D-S2-144 (Task 38 is D-S2-140; the highest id held on any branch is D-S2-129). If wrong: renumber at merge.
- R2: Ruling: Task 39 builds the plan's sheet and also re-maps the English copies from v1's own Hindi (build 2026.10.24a) through the generator (extract-v1-i18n.mjs), matched by English text only; no Hindi is written by hand or assembled from pieces, and the sheet lists what was re-mapped and what is still English. If wrong: drop the re-map file and regenerate; the sheet still stands.
- R3: Ruling: Q2's runner is built and tested against a stubbed provider; the baseline reports wait on OJ's capped test key (plan Step 5 is OJ's action). If wrong: nothing lost, the CLI is ready.

## Progress
