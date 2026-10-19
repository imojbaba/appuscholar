# Wave 0–1 parity port: the SDD ledger

Two files copied unchanged on 2026-10-19 from the SDD workspace `.superpowers/sdd/2026-10-17-parity-port-wave0-1/` on the machine that executed the Wave 0–1 plan (`docs/superpowers/plans/2026-10-17-parity-port-wave0-1.md`, branch `parity-wave-0-1`, PR imojbaba/appuscholar#5). That workspace is git-ignored (`.superpowers/` in `.gitignore`), so until this copy the maker-and-checker record of the wave existed only on that Mac.

- `progress.md` — the execution ledger: the toolchain and v1 build verified at the start, one line per task (brief, implementer report, review verdict, commit), every ruling made outside the plan's defaults with its cost if wrong, the CI fix that led to register row D-W1-16, and the closing line. sha256 `52ef37245e24e029ae8fdd6c23ed57ba098a99c9fb9ca90baf9a56e1b0ad3b9f`.
- `final-review-report.md` — the whole-branch review of 067bd2e..80e65b6 (2026-10-19), whose findings the fix wave 80e65b6..1fa71cc addressed. sha256 `c7c2f5909fe45276c02cc693688f1ed051b36bd77a15c8e726bc2f9ebba50205`.

Not copied: the task briefs and reports (`task-N-brief.md`, `task-N-report.md`), the fix reports and the review packages (`review-<from>..<to>.diff`, one per review). They stay in the git-ignored workspace. Each review diff is `git diff <from>..<to>` over commits the ledger names, so it can be regenerated from this repository.
