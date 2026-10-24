# Wave B side tasks ledger (Task 38, Task 39, Q1, Q2), branch wave-b-side, base 1ec773b
Plan: Scholarly/appuscholar-blueprint/plans/2026-10-21-wave-b-redesign.md sections Task 38, Task 39, Task Q1, Task Q2 (private repo folder; the plan text is not copied here). Owner: this session. wave-b2 owns the rest of that plan.

## Preflight
| Pair | Found |
|---|---|
| T38 (core index.ts, projectExport.ts, export dialog) vs others | disjoint from T39/Q1/Q2 |
| T39 (apps/web/scripts, docs/i18n, test) vs T38 | disjoint; T39 reads en.json/hi.json only |
| Q1 (new packages/quality, pnpm-lock) vs Q2 | Q2 consumes Q1's sets/graders; sequential |
| Plan's D-S2-60 for T38 | taken by tools-b (statsParseText); ruling below |
| Plan's Hindi base counts (1,141 keys, 366 English copies) | verified at af11810 (2026-10-20): 1141 / 366; now 1425 / 369 in en.json+hi.json; tool files add 766 strings (14 English copies) |

## Rulings
Ruling: Task 38's register row takes D-S2-120 (D-S2-60 is tools-b's; base max is 112 and tools-b reserved 105-114); this session claims D-S2-120 to 124 — if wrong: renumber at merge.
Ruling: Task 39's base commit is af11810 (the last commit with exactly 1,141 keys and 366 English copies, 2026-10-20); the sheet also lists the tool message files (766 strings, all new) in a separate section so Dr. Sharma's costing is not understated — if wrong: delete a section.
Ruling: hindi-strings.csv in the private blueprint is not used (the sheet is built from the repo's own dictionaries; nothing private is copied) — if wrong: nothing lost.
Ruling: Q2's baseline is not run: it needs OJ's capped test key (timeline decision 7); the runner is built and tested against a fake provider — as instructed.

## Tasks
