# Parity port: deviation register

One row per deliberate difference from v1: the flag id, what differs, why, who approved it and the test that pins the new behaviour. Nothing deviates without a row (parity-port design, §5.6). The two rules: "numbers never deviate without OJ; copy never deviates without Dr. Sharma".

- **Ids.** An audit flag keeps its `F` number from `appuscholar-blueprint/PORT-AUDIT.md` §4 (`F5`, `F23a`). A new row is `D-W<wave>-<n>`, with `n` counting up within the wave.
- **Statuses.**
    - `proposed`: awaits OJ for numbers, Dr. Sharma for copy.
    - `approved`: accepted; the approver and date are in the row.
    - `rejected`: declined; no change is made.
    - `noted`: an observation that changes no output; recorded so it is not rediscovered.
- **Adding a row.** Every task that deviates appends a row at the bottom as `proposed` or `noted`, with all eight cells filled (`—` where there is nothing yet) and no `|` inside a cell (write "or", or a comma). A golden mismatch is a port bug or a row, never a hand-edited fixture.
- **Lines and dates.** v1 line numbers are those of `index.html` build 2026.10.13a (13,699 lines). The date in "approver and date" is the day the approval was recorded here (YYYY-MM-DD).

| id | where (v1 line → core module) | v1 behaviour | v2 behaviour or proposal | why | status | approver and date | pinned by |
|---|---|---|---|---|---|---|---|
| F5 | `pFromF` 8688, `1 − betai` | right tail below about 1e-16 is exactly 0 (F = 200 on (3, 50) df prints 0; scipy 7.8e-28) | port verbatim; visible only in Numbers check where `p = 0` can appear | Everything is shown as `< .001`, so students see no difference. | noted | — | Task 6 `pvalue.scipy.test.ts` F5 cases |
| F23 | `citFmt` 7053–7465 | every style rule marked CHECK by its author | port verbatim (Decision 5); editorial pass against the manuals is a separate task with its own rows | None of the rules was verified against a manual, so their correctness is UNKNOWN. | proposed | awaits OJ (numbers) / Dr. Sharma (copy) | — |
| F25 | `ideaAssess` 8568–8580 | the five Low/Medium/High ratings and the verdict are written by the AI; no scoring code | port the prompt only; the register notes the exception to "every number from code" | There is no scoring engine to port, only the prompt. | noted | — | — |
| F26 | `getEditorText` 3151, `ccOpen` 12159, `clHtmlToText` 6852, `textOf` 4959 | reads the browser's `innerText` | one converter in `core/doctext.ts`, pinned to Chromium output (spec §5.3) | Block elements, `<br>` and list items turn into line breaks differently in browsers and jsdom, and Closeness depends on those line breaks. | approved | approved by spec ruling, 2026-10-17 | Task 3 `doctext.test.ts` |
| D-W0-1 | `PROVIDERS.claude.model` 2563 → `providers.ts` | `claude-haiku-4-5-20251001` | `claude-haiku-5-5` with `claude-haiku-4-5` fallback | The controller ruled this in Phase 2. | approved | approved earlier; OJ to initial, 2026-10-17 | — |
| D-W0-2 | `PROVIDERS.deepseek/openai.steps` 2559, 2562 → `providers.ts` | browser-call warnings in the steps HTML | removed | v2 calls go through the api. | approved | approved by the v2 design, 2026-10-17 | — |
| D-W0-3 | `sanitize.ts` | no v1 counterpart (v1 stores editor HTML as typed) | DOMPurify allow-list on import and save | The v2 design (§9) sends imported HTML through DOMPurify with an allow-list. | noted | — | no golden possible |
| D-W0-4 | `computeOriginality` 3346 → `originShare` | a document with `origin === "source"` returns `studentPct: null, source: true` | `originShare` has no source branch; add one when documents gain `origin` | v2 has no source documents yet. | proposed | awaits OJ (numbers) / Dr. Sharma (copy) | — |
| D-W0-5 | `bodyToHTML` 3143, `imgHydrate` → `v1import.ts` | plain bodies wrapped with `<br>`, `appuimg:` placeholders rehydrated, escaped image markup repaired | wrap rule ported; bodies sanitised; no image rehydration or repair | Bodies are sanitised on import (v2 design §9). | noted | — | Task 5 golden shows the exact difference |
