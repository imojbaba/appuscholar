# Ledger: go-live build (AI quota, /health/db, client error route), branch golive-build, base 1ec773b

Plan: `docs/superpowers/plans/2026-10-24-golive-build.md`. One line per task; rulings marked `Ruling:`.

- Ruling: the web's quota message is read through `tFormat` with `document.documentElement.lang` because `apiMsg` has no React context; the Hindi is a DRAFT for the Hindi reader — if wrong: pass the language in from `CallCtx`.
- Ruling: `detail` of a quota 429 is the string `<hour|day>:<seconds>` because `ApiError` carries only a string detail — if wrong: widen `ApiError`.
- Ruling: the vault's passphrase stretching (310,000 against 600,000), firewall rules, provider retry count and `maxDuration` are not touched here; the first is waiting for the security review.
- Ruling: fence widened to `apps/web/scripts/i18n-overrides.mjs` (V2_STRINGS) for the three quota keys — en.json and hi.json are generated from it and a local byte-identical test fails otherwise — if wrong: revert one file.
- Task 1: fix round 1/5 (2 Important + 2 small addressed: quota answer survives failover, quota keys in the i18n generator, feminine Hindi, doc comments; commits 9ea755b..b7bd3ba)
- Task 1 minors (deferred): empty apiKey consumes a quota call before `no-key`; three Neon round trips per /complete (cleanup delete could run only when a new window starts); memory cleanup scans every user; fixture email uses `uni.example` not `example.test`.
- Ruling: no separate scoped re-review of Task 1's fix wave (RED/GREEN evidence in the report, ~20 changed lines); the final whole-branch review reads it — if wrong: found one task later.
- Task 1: complete (commits 27ec7ea..b7bd3ba)
- Task 2: fix round 1/5 (1 Important + hardening addressed: wrapped driver errors read through `cause`, name/code filtered, 5 s timeout, no-store; commits 6b9f0d4..4070eab)
- Task 2 minors (deferred): the unauthenticated route makes one database call per hit (no limit, per plan); only run on pglite, not on Neon.
- Ruling: no separate scoped re-review of Task 2's fix wave (new tests prove each point); the final whole-branch review reads it — if wrong: found one task later.
- Task 2: complete (commits a981a55..4070eab)
- Task 3: fix round 1/5 (1 Important + 1 small addressed: x-vercel-id validated before logging, error panel refreshes the route; commits 6bb2fd2..1f4fff8)
- Task 3 minors (deferred): behind a rewriting proxy the same-origin check could 403 real reports (check once on the preview); a flood can fill the 30-per-minute cap and hide real reports for that minute; no root `app/error.tsx` (errors outside (app) fall to global-error); a short alphabetic path slug is not masked.
- Ruling: no separate scoped re-review of Task 3's fix wave (header regex + one effect, RED/GREEN in report); the final whole-branch review reads it — if wrong: found one step later.
- Task 3: complete (commits bf8f9f4..1f4fff8)
