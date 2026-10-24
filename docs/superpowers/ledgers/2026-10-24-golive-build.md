# Ledger: go-live build (AI quota, /health/db, client error route), branch golive-build, base 1ec773b

Plan: `docs/superpowers/plans/2026-10-24-golive-build.md`. One line per task; rulings marked `Ruling:`.

- Ruling: the web's quota message is read through `tFormat` with `document.documentElement.lang` because `apiMsg` has no React context; the Hindi is a DRAFT for the Hindi reader — if wrong: pass the language in from `CallCtx`.
- Ruling: `detail` of a quota 429 is the string `<hour|day>:<seconds>` because `ApiError` carries only a string detail — if wrong: widen `ApiError`.
- Ruling: the vault's passphrase stretching (310,000 against 600,000), firewall rules, provider retry count and `maxDuration` are not touched here; the first is waiting for the security review.
