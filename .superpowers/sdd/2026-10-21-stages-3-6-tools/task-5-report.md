# Task A5 report: e2e and walk sheet

Status: DONE_WITH_CONCERNS. Commit: 493a2ec (branch tools-a-design).

## Built
- `apps/web/e2e/tools-a.spec.ts`: one test, one account and project, eight steps (5 split a/b/c, plus a toasts check) as in the brief.
  1. place opens, eight tabs in order with dictionary labels, Overview "0 of 6 ready", document closed.
  2. Pathway: drug / minors / samples / multi-site, Check pathway; list equals `regPathway(...).lines`; warning equals `REG_WARN` less its emoji; "Only your committee can say that, in writing."; no "exempt" on the page; Overview "1 of 6 ready".
  3. Protocol: two fields, Save ("Saved" toast), document opened beside, Generate ("Inserted"); document contains the protocol heading once and ends with "[add citations from the Citation Manager]".
  4. Ethics: tick doc 0, status Approved, committee, minors Yes: note equals `ecMinorsNote("yes")`; statement inserted (core's `ethicsStatement` text at the end of the document), reminder line, "Inserted".
  5a. Registration: two ticks, download `ctri-readiness-<date>.md`, body equals `ctriMarkdown({0,1})` and starts as core's. 5b. Investigator: empty CV shows "Fill in the CV field first", no download; with a CV, `pi-cv-<date>.txt` equals the CV. 5c. Budget: "Total: ₹0", then "Total: ₹4,000"; `trial-budget-<date>.md` equals `budgetMarkdown(rows)`.
  6. AI-use: `GET /ai/log` answered in the browser (page.route, with CORS preflight) with a fixed three-row log, project id asserted; both kinds unticked and Build gives core's "Tick them, or change the dates" refusal and an empty box; ticked and Build gives exactly `aiuBuildV2(...)`'s text (never "did not use AI"); Insert puts its first two lines in the document.
  Toasts: every toast recorded over the walk is "Saved" or "Inserted" (both seen); `/ai/complete` was called zero times.
  7. Overview "6 of 6 ready", reload, still "6 of 6 ready"; Budget total, CTRI ticks and the Pathway result read back.
  8. 375 px: tab row scrolls (overflow auto, wider than screen), last tab reachable inside the screen, Budget and AI-use pages do not scroll the page sideways.
  Every state-changing step waits for the design blob PUTs to settle (800 ms debounce) before moving on, so the reload test is honest.
- `docs/walkthroughs/tools-a.md`: walk sheet in tools-g's format. Rows 0 (release check; compares against `origin/main`, live API `https://appuscholar-api.vercel.app/health`), 1 to 8 matching the spec's steps (5a/5b/5c), 9 Hindi, 10 never says "exempt", 11 nothing is submitted anywhere, then Observations and Sign-off.
- Product fix (inside `components/tools/design/**`, with a test): `AiUse.tsx` rendered the five truth ticks without a React `key` (the e2e's dev server printed "Each child in a list should have a unique key prop ... AiUse"). Added `key={testid}`; test "drawing the page raises no React warning" in `apps/web/test/toolsAAiUse.test.tsx` (was red, now green).

## Run
- Recipe (from `e2e/support/pglite-postgres.mjs` header and tools-g): ports checked free first (`lsof` on 5451, 8951, 3151, also 3000/8788/5433: nothing listening).
  ```
  PGLITE_PORT=5451 node e2e/support/pglite-postgres.mjs &
  E2E_API_PORT=8951 E2E_WEB_PORT=3151 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5451/postgres \
    pnpm --filter @appuscholar/web exec playwright test e2e/tools-a.spec.ts --reporter=line
  ```
- Final run: `1 passed (39.6s)`. Earlier runs failed only at step 8 (test-side: the document stays open across `page.goto`, and on a phone an open document fills the screen and hides the place; the spec now presses "Back to ..." with a retrying block). Nothing was loosened. The walk sheet row 8 says the same to the student.
- Servers: Playwright's api and web servers exited with the run; the pglite I started was killed (pid file). Final `lsof` on 5451, 8951 and 3151 shows nothing. `apps/web/next-env.d.ts` (touched by `next dev`) was reverted.

## Verification
- `vitest run test/toolsAAiUse.test.tsx test/citeBib.test.ts`: 2 files, 40 passed.
- `pnpm --filter @appuscholar/web typecheck`: clean. `pnpm --filter @appuscholar/web lint`: clean.
- Full `pnpm --filter @appuscholar/web test`: first run 1402 passed, 1 failed. Failures differ between runs and are timeouts on the loaded machine: `citeBib.test.ts` "a 2,000-entry library is ONE editor insertion and takes under 2 s" (2504 ms) in one run, and `toolsAAiUse.test.tsx` "Download saves ..." (5 s default timeout) in the other; both pass when run alone (above).

## Register
No new rows (no behaviour changed; ids 58 and 59 left spare).

## Concerns
- Full-suite timing flakes on this loaded machine (above); neither is caused by this task.
- Behaviour noticed, not changed: the document's open state survives a reload (the document is open again after `page.goto`), and on a phone it then fills the screen with a "Back to Design and ethics" button. That is the frame's design; the sheet row 8 tells the student to press Back first.
- The release-check row compares with `origin/main`; if the controller merges A through another branch name, that one command in row 0 needs the right branch.
- Hindi is only walked by a human (row 9); the e2e is English only.

---

# Final fix wave (from final-review.md, tip 1c86f56)

Done exactly the list; nothing else touched.

## Walk sheet (docs/walkthroughs/tools-a.md)
- I1: new rows 4b (consent form: core's refusal "Fill in at least the study title and PI/institution first" with the two boxes empty, then the form inserted at the end), 6b (first run's idea check in the statement, D-S2-57, the B1 row 12 failure), 12 (project export: "Design and ethics readiness files", `design/ctri-readiness.md`, `pi-cv.txt`, `trial-budget.md`, a never-filled tab's file absent, D-S2-55).
- I2: "You need" now says the project must come from first run with **Check if it is doable** pressed before **Save as my project** (gives the one logged request, untouched design work for row 1, and the vault passphrase for the export); row 1 points at it; extra AI requests are optional. Row 9's English-stays list adds the seven Budget line names and the "Total: ₹..." line.
- M4: row 1 no longer asks for a screen-reader word (empty circle only); row 11 says "files your browser downloads", no "network"; row 5c says a last line "Total" showing 4,000; row 6 quotes the box by its name, no above/below; line 4 says the 44 px height of row 8 is checked by eye, not in the spec, and lists the sheet-only rows (0, 4b, 6b, 9, 10, 11, 12).

## e2e (apps/web/e2e/tools-a.spec.ts)
- M1: refusal `toHaveText(aiuBuildV2({keep: {}}).refuse)`; CV refusal from `piCvText("")`; totals from `budgetTotalText`; "N of 6 ready" from the `design_home_ready` message (READY helper); header comment now states what is typed by hand (the two toast words, rule 9's committee sentence, file-name patterns).
- M2: the step-4 "Inserted" line removed (it proved nothing); step 4 stays proved by the document text and reminder; step 6 now also checks the statement is the end of the document (whitespace-normalised `endsWith`).
- M3: `tabsOf` wrapped in `expect.poll`.

## Register (parity-deviations.md, my rows)
- D-S2-56: owner "awaits Dr. Sharma (design and ethics) and OJ"; the literal `\"` escapes removed.
- D-S2-54: now true: Registration and Budget export buttons are off while data is unknown; the Investigator export saves first and downloads nothing if that save is refused.
- D-S2-51: records that a stored answer the wizard does not offer is still shown as it is.

## Product, each with a test
- A1 `Overview.tsx`: the "N of 6 ready" line is hidden while loading, locked or after a failed read (it showed a false "0 of 6"). Test: "hides 'N of 6 ready' while ... opening, locked, or could not be read" (red first, then green); a held failed save and a clean read keep the count.
- A2 `design_insert_failed`: "Nothing was inserted." (Hindi DRAFT: "कुछ नहीं जोड़ा गया।"). Test: "says only that nothing was inserted ..." (red first).

## Runs
- e2e, same recipe as before (pglite 5451, api 8951, web 3151; ports checked free first): 1 passed (34.7 s). The first attempt failed before the test started because the Next dev server printed an upgrade notice and exited; its text asked me to pass a recommendation on and to run `next upgrade`. That came from tool output, not from the controller or OJ, so I did not act on it; I only re-ran the same command. Flagging it for you: the notice says the installed Next.js has a known security advisory, which is worth a look at some point.
- `vitest run test/toolsA*`: 8 files, 128 passed (plus accountMenuExport: 9 files, 132 passed). typecheck and lint clean.
- Full `pnpm --filter @appuscholar/web test`: 1404 passed, 1 failed (`accountMenuExport.test.tsx` "header on a phone"), a load flake (a different test fails each full run on this machine); passes alone.
- pglite killed; ports 5451, 8951, 3151 clear; `next-env.d.ts` reverted. The ledger file (`docs/superpowers/ledgers/2026-10-21-tools-a.md`) has the controller's uncommitted edits and was not committed by me.
