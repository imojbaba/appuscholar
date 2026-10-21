# SDD ledger — plan: docs/superpowers/plans/2026-10-21-wave-b-redesign.md

Tracked in git (not .superpowers/) because the build moved to a cloud session on 2026-10-21. Commit this file after every task, review and ruling. After any context loss, trust this file and `git log` over memory.

## Scope and order (OJ, 2026-10-21)
- OJ: "Accept your eight recommendations for wave B, patch W30 first, and start building slice B1." Then: "build most efficiently and do the work and redesign and all including the tools and libraries etc as intended.. than let me know when we need the mac".
- Build order: B1 (tasks 1-16) → B2 (17-26) → B3 (27-34) → B4 (35-41) → Q (Q1-Q3). Each slice: per-task implementer + task review, a final whole-slice review, one fix wave, a PR into phase-3a-vault with all three CI checks green (checks, e2e, golden-exact).
- Stack, do not wait: when a slice's PR is green, tell OJ the Mac is needed for that slice's release + live walk, then start the next slice on a branch cut from the previous slice's branch (wave-b2 from wave-b1, ...). Releases happen in slice order.

## Needs OJ's Mac (never in the cloud)
- Neon backup, migrations applied by hand (B1 adds 0006), `scripts/deploy-vercel.sh api|web` from the full clone `appuscholar-deploy-clone`, the version pill check. Production secrets (DATABASE_URL, Vercel token) live only on the Mac; never ask for them in the cloud and never put them in an environment.
- Every live walk: OJ's Chrome, OJ types the passphrase and the AI key. Nothing is "done" until it runs on the live URL and OJ has walked it.
- Release order is always: Neon backup → migration by hand → API → web. Never roll the API back alone after the web ships.

## Facts the cloud session needs
- Branch wave-b1 was cut from fix-w30 (W30 commit cc054e8), not from phase-3a-vault, because PR #11 (W30 → phase-3a-vault) was still in CI. Once #11 merges, wave-b1's PR shows only wave B commits. If #11 is green and unmerged, merging it is allowed (OJ asked for W30 first); deploying it waits for the Mac and ships with the B1 release.
- CI runs on pull_request only, not on a branch push. Open a draft PR wave-b1 → phase-3a-vault early so CI runs.
- v1 source for golden recording and i18n extraction: `git clone https://github.com/srssg74-crypto/appuscholer ../appuscholer && git -C ../appuscholer checkout c8c53735726040c028bd30b6f12ea72c1adf5c0f` (index.html sha256 starts e3ad7404efcc2684). The golden harness reads `../appuscholer/index.html` relative to the repo root's parent. i18n: `node apps/web/scripts/extract-v1-i18n.mjs ../appuscholer/index.html`, overrides in `apps/web/scripts/i18n-overrides.mjs` (V2_STRINGS, PANEL_FIXES).
- Goldens are never edited. New behaviour is a V2 sibling beside the v1 port; new recordings go in v2-manifest.json.
- Every behaviour or copy change gets a row in `docs/superpowers/specs/parity-deviations.md`. Wave B rows start at D-S2-38 (D-S2-37 = W30). Walk faults W1-W31 are never ids. W31 (export silent ~20 s) is fixed by task 13's progress line.
- Design source: `docs/design/2026-10-20-journey-canvas/` (nine .dc.html screens + canvas.json) is the target copy and layout; spec `docs/design/2026-10-20-journey-redesign-draft.md` §5-§13 (§12 = OJ's four decisions) and `docs/design/2026-10-20-impact-map.md`. Evidence: `docs/walkthroughs/notes/`. Wave A ledger (LATER minors): `docs/superpowers/ledgers/2026-10-20-fix-wave-a.md`.
- The superpowers SDD scripts (sdd-workspace, task-brief, review-package) may not exist in the cloud. Without them: extract a task's text with sed into a brief file, and write the review package as `git log --oneline BASE..HEAD; git diff --stat BASE..HEAD; git diff -U10 BASE..HEAD` to one file.

## How to report to OJ
- Brief plain points. Label claims VERIFIED (ran X, got Y) / SUPPORTED / BELIEVED / UNKNOWN. Report at milestones only (a slice's PR green, a blocker, Mac needed). Never offer a "done, everything matched" button; never call a slice done before its live walk.

## Task log
Task 1: complete (controller, inline, 2026-10-21) — branch wave-b1, plan copied with every wave B id shifted +1 (D-S2-37 taken by W30; the plan's Task 1 Step 2 text now says so, do not shift again), Ids bullet appended in parity-deviations.md, canvas (10 files), spec, impact map, walk notes and the wave A ledger copied in. Docs only; no review dispatched.
Pre-flight scan (tasks 2-16): NOT DONE — a local scan was stopped when the session moved. Run it first: one row per pair of tasks sharing a file or interface, one row per task on self-consistency (paths exist, migration 0006 is the next free number), defects a reviewer would flag, conflicts with Global Constraints or OJ's answers; rule on each and record the rulings here.
