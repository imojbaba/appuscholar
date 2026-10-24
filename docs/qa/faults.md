# Faults found by the QA layer

The faults a QA run found in the product, each with a Q id (Q1, Q2, ...). The F and O ids of the 2026-10-23 walk are in `apps/web/qa/known.json` and `docs/walkthroughs/notes/2026-10-23-tools-walk.md`; this file is for what the runs add.

A fault is recorded here when OJ has seen it in the report, not before. Record it in three places: an entry below, an entry in `apps/web/qa/known.json` with the same id and status `known`, and the failing check's `known: "Q<n>"` in the case. The case then shows KNOWN FAULT and CI stays green until the fix lands. When a fix is merged and the case passes, the report says FIXED?: set the status to `fixed` here and in `known.json`.

Nothing here is handed to a developer session until OJ says so.

## Entry format

Copy this for each fault. Keep the entries in order of id, newest last.

```
### Q<n>: <a short name, in words a student would use>

- Case: <case id, e.g. S6-02 [F3]>
- Date: <date the run found it>
- Commit: <sha of the build that was tested>
- Kind: <UI | Error | Unexpected | Slow>
- Expected: <what should have happened> (source: <sheet row, register row or rule>)
- Happened: <what happened instead, copied from the report>
- Evidence: <screenshot, trace and run report, as paths or links>
- Status: <known | awaiting | fixed>  (fixed in <PR or commit>, when it is)
```

## Entries

### Q1: The language button is announced differently from what it shows

- Case: S10-01 (the axe scan at "the second tab, locked, with its sentence kept" and at "the locked document"), and S6-01 to S6-05 (the axe scan at every checkpoint of the Coding tab and its document); it will show at every desktop screen with no window open, and it does in S5-01, S5-02, S5-04, S5-05, S5-06 and S5-08 (the axe scan of each of their checkpoints), and in S7-01 (six screens of the Writing place and the AI-use statement), S7-02, S7-03 and S7-07, and in S8-01, S8-02, S8-05 and S8-07 (the same scan on Review's Closeness, Viva and Make PPT), and in the checkpoints of S2-01, S2-02, S2-03, S2-05 and S2-07 (Find, the Reading list, Compare, Citations, Writing)
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: UI (accessibility)
- Expected: a control's accessible name contains the text it shows, so that a person who says what they see ("EN") can reach it (source: spec section 8, the axe scan: any serious or critical finding)
- Happened: `button[aria-label="Switch interface language"]`: label-content-name-mismatch (serious): Elements must have their visible text as part of their accessible name. The button shows "EN" (or "हि") and is named "Switch interface language" (`apps/web/components/frame/AppHeader.tsx`, `data-testid="lang-toggle"`).
- Evidence: the qa-report artifact of the run of 2026-10-24 on c0769fc (screenshots and replay are kept with that run, not in the repository): case S10-01, failed checks "the second tab, locked, with its sentence kept: no serious or critical accessibility finding (axe)" and "the locked document: ... (axe)". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S10-01"`. The notes of the QA layer list two label-content-name-mismatch findings as candidates; this is the language button, seen on two screens of S10-01; the other candidate has not turned up in S10.
- Status: known

### Q2: After the right passphrase, the project's home says "This project is locked" and shows nothing opening

- Case: S10-05
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: Slow (no sign of progress), and the page contradicts itself
- Expected: pressing OK on the unlock window while every answer from the server takes 3 s shows a sign within 1 s that the project is opening ("Opening your saved work…", or the project itself), and the home stops saying the project is locked once the header says "Vault unlocked" (source: spec section 8, a sign of progress within 1 s of any press that takes longer)
- Happened: sampled every 100 ms after OK: at 146 ms the pill reads "Vault unlocked", and for the next 3.3 s the home still shows the card "This project is locked. Enter your passphrase to open it." with its Unlock button, and no loading line (`home-loading` never appears); at 3,430 ms the six stages show. The card comes from `apps/web/components/frame/ProjectHome.tsx` (`locked = blobs.some((b) => b.locked)`), which stays true until each blob has been read again after the unlock. The case measures it twice: the `timed` check ("took 3,3xx ms; the budget is 1,000 ms") and the check that the locked card is gone within 1 s.
- Evidence: the qa-report artifact of the run of 2026-10-24 on c0769fc: case S10-05, the time check and the conceptual check, both naming Q2. The 100 ms timeline above is from a throwaway probe of the same steps. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S10-05"`.
- Status: known

### Q3: On a phone, the "Remember on this computer" tick row is 20 px tall

- Case: S10-06 (the set-up window, the unlock window, and the unlock window with the wrong-passphrase verdict)
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: UI
- Expected: on a phone, every control at least 44 px each way; a tick box is pressed through its label, so the larger of the two is its target (source: spec section 8, layout rules, O17)
- Happened: `input [vault-setup-remember]: 325 × 20 px` and `input [pass-remember]: 325 × 20 px` (the box itself is the browser's 13 px one). Files: `components/workspace/dialogs/VaultSetup.tsx`, `Passphrase.tsx`.
- Evidence: the qa-report artifact of the run of 2026-10-24 on c0769fc: case S10-06, failed checks "the set-up window", "the unlock window" and "the unlock window with the verdict": "every control at least 44 px each way". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S10-06"`.
- Status: known

### Q4: On a phone, the recovery sheet's "I have saved it" tick row is 20 px tall

- Case: S10-06 (the recovery sheet after the set-up, and the new recovery sheet after the recovery)
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: UI
- Expected: as Q3 (source: spec section 8, layout rules, O17)
- Happened: `input [vault-sheet-saved]: 325 × 20 px`. The sheet cannot be closed until this box is ticked, so a student with a thumb must hit it. File: `components/workspace/dialogs/RecoverySheet.tsx`.
- Evidence: the qa-report artifact of the run of 2026-10-24 on c0769fc: case S10-06, failed checks "the recovery sheet" and "the new recovery sheet": "every control at least 44 px each way". Re-run as Q3.
- Status: known

### Q5: The show-passphrase eye lies over the right end of every passphrase and key field

- Case: S10-01 (the unlock windows, the change-passphrase window, the recovery window), S10-06 (the passphrase, unlock and recovery windows on a phone, in Hindi), and S1-01 and S1-02 (the key window's two key fields: the AI key and the OpenAlex key)
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: UI
- Expected: a passphrase field keeps room at its right edge for its eye, so that nothing typed goes under it (source: `components/ui/secret-input.tsx` keeps 44 px with `pr-11`; spec section 8, layout rules, no two controls on top of each other)
- Happened: the field's right padding computes to 10 px, not 44 px, and the eye is 44 px wide: the `.input` rule in `app/globals.css` (line 133) is outside any `@layer`, so it wins over Tailwind's `pr-11` utility. A passphrase of about 70 characters or more runs under the eye (measured: field 462 px wide, eye 44 px at its right end, `padding-right: 10px`; a screenshot with a long passphrase shows the dots up to and under the icon). It shows as the overlap rule's finding `input ... over button ... [pass-input-toggle]: they cross by 44 × 36 px` (on a phone 44 × 44 px) for `pass-input`, `vault-change-old`, `vault-change-new`, `vault-change-again`, `recover-pass` and `recover-pass2`. The key window (`components/workspace/dialogs/ProviderKey.tsx`) has two more: `key-input` (eye `key-input-toggle`) and `oa-key-input` (its eye has no test id: `input "Paste a free OpenAlex key" [oa-key-input] over button "Show key"`), each measured at padding-right 10 px against an eye 44 px wide, crossing by 44 × 36 px (44 × 44 px on a phone).
- Detected by: the check "the passphrase field(s) keep room for their eye" of S10-01 and S10-06, and "the key fields keep room for their eyes" of S1-01 and S1-02 (the field's computed padding-right against the eye's width), which carries Q5 and passes once the padding is 44 px; the overlap rule (`qa/support/layout.ts`) does not flag an absolutely placed control held in a field's padding as wide as itself, so it stops flagging the eyes at the same time.
- Evidence: the qa-report artifact of the run of 2026-10-24 on c0769fc: cases S10-01 and S10-06, the failed checks "... no two controls on top of each other" of the second tab, the unlock window with the verdict, the change passphrase window and the two recovery windows. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S10-01"`. And the run of 2026-10-24 on cfada86: cases S1-01 and S1-02, the failed checks "the key fields keep room for their eyes" and "the key window: no two controls on top of each other" (`key-input` over `key-input-toggle`, and `oa-key-input` over its eye). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S1-0"`.
- Status: known

### Q6: The terms window's text scrolls, but the keyboard cannot reach it

- Case: S1-01 (the terms) and S1-02 (the terms, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: cfada864b83bd9de526ec7bc672e9256f8bd60a2
- Kind: UI (accessibility)
- Expected: a box that scrolls can be scrolled from the keyboard: it takes focus, or holds something that does (source: spec section 8, the axe scan: any serious or critical finding; WCAG 2.1.1, keyboard)
- Happened: `.max-h-[56vh]`: scrollable-region-focusable (serious): Scrollable region must have keyboard access. It is the text of the terms (`data-testid="terms-body"` in `apps/web/components/workspace/dialogs/Terms.tsx`: `max-h-[56vh] overflow-auto`, no tabindex, nothing focusable inside). A student who does not use a mouse or a touch screen cannot scroll to the end of what they are asked to accept. The window cannot be dismissed (the gate), so it is the first screen of every new account.
- Evidence: the qa-report artifact of the run of 2026-10-24 on cfada86 (kept with that run, not in the repository): cases S1-01 and S1-02, the failed check "the terms: no serious or critical accessibility finding (axe)". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S1-01"`.
- Status: known

### Q7: On a phone, the terms window's two tick rows are 40 px and 20 px tall

- Case: S1-02 (the terms, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: cfada864b83bd9de526ec7bc672e9256f8bd60a2
- Kind: UI
- Expected: on a phone, every control at least 44 px each way; a tick box is pressed through its label, so the larger of the two is its target (source: spec section 8, layout rules, O17; as Q3)
- Happened: `input [terms-age]: 325 × 40 px` and `input [terms-agree]: 325 × 20 px` (the box itself is the browser's 13 px one). These are the two ticks a new student must press to go on. File: `components/workspace/dialogs/Terms.tsx`.
- Evidence: the qa-report artifact of the run of 2026-10-24 on cfada86: case S1-02, the failed check "the terms, on a phone, in Hindi: every control at least 44 px each way". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S1-02"`.
- Status: known

### Q8: On a phone, the key window's key-mode choices and option ticks are 18 to 36 px tall, and its ORCID link 17 px

- Case: S1-02 (the key window, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: cfada864b83bd9de526ec7bc672e9256f8bd60a2
- Kind: UI
- Expected: as Q7 (source: spec section 8, layout rules, O17)
- Happened: six controls under 44 px: `input [key-mode-pass]: 325 × 36 px`, `[key-mode-plain]` and `[key-mode-session]`: 325 × 18 px, `[ai-fallback]`: 325 × 36 px, `[ai-log]`: 325 × 18 px, and the link "Don't have one? Get a free ORCID iD →" (in Hindi: "नहीं है? मुफ़्त ORCID iD पाएं →", `settings_orcid_link`): 160.4 × 17 px. The known match names that link in both languages, inside `[provider-dialog]`. The first three are how a new student chooses to keep their key. File: `components/workspace/dialogs/ProviderKey.tsx`.
- Evidence: the qa-report artifact of the run of 2026-10-24 on cfada86: case S1-02, the failed check "the key window, on a phone, in Hindi: every control at least 44 px each way". Re-run as Q7.
- Status: known

### Q9: On a Hindi page the key window's choices and hints, and the toast that says the key is connected, are in English

- Case: S1-02 (the key window, and the toast that follows the vault's set-up, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: cfada864b83bd9de526ec7bc672e9256f8bd60a2
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens, including text written into components rather than the dictionaries, except what the register lists (source: spec section 8, layout rules; the register's exceptions D-S2-1, -2, -3 and -18 do not name this window or this toast)
- Happened: on the key window, a run of English in each of four places: the provider list (`select [prov-select]`: "Google Gemini — free, easiest", "Groq — free & very fast" ... from `OPTION` in `ProviderKey.tsx`) with the steps under it ("Sign up free → API Keys → Create API Key → copy (starts with gsk_). Open →", the `stepsHtml` of each provider in `packages/core/src/providers.ts:18`); the key-mode hint (`[key-mode-hint]`: "You choose a passphrase now and type it once each time you open Appuscholar ...", `MODE_HINT`); the label "My field of study" with its note ("The AI uses this to pitch explanations and examples at your field ..."); and, in one run, the option "If my AI is busy or fails, try my other saved keys automatically" with its note, followed by "Keep the log" with its note ("A private log of the date, the AI provider, the model and the kind of help ...", `ProviderKey.tsx:248-252`). The rule reports that last run under its first element, so the known match names the fallback option, and it covers "Keep the log" and its note too. The toast after the key is saved reads "Groq connected ✓ and encrypted 🔒" in English (`PROVIDERS[p].name + " connected ✓" + ...` in the same file; the sheet quotes it in English). Apart from the provider steps (in core) all are v1's English literals in `components/workspace/dialogs/ProviderKey.tsx`. The dictionary has Hindi for the window's title, labels and buttons, which show in Hindi (the case's own check passes).
- Evidence: the qa-report artifact of the run of 2026-10-24 on cfada86: case S1-02, the failed check "the key window, on a phone, in Hindi: no English on a Hindi screen", and "every toast speaks Hindi (the provider's name apart)". Re-run as Q7.
- Status: known

### Q10: The project export window has no accessible name

- Case: S3-01 (the project's export place, row 12 of the Design and ethics sheet); it shows wherever the export place opens: in S9-01 (the project's export window), S9-02 (locked, after Cancel), S9-03 (after it failed offline) and S9-05 (on a phone, in Hindi)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI (accessibility)
- Expected: a window that takes over the screen is named, so a screen-reader user hears what it is when it opens (source: spec section 8, the axe scan: any serious or critical finding; WCAG 4.1.2)
- Happened: `#radix-_r_…_`: aria-dialog-name (serious): ARIA dialog and alertdialog nodes should have an accessible name. Read from the open window (a throwaway probe of the same steps): `aria-labelledby="radix-_r_4d_"` points at no element on the page, because the window's title is `<h2 id="exp-h" data-slot="dialog-title">`: `ExportDialog.tsx` (`<DialogTitle id="exp-h" ...>`, line 142) gives the title an id of its own, which replaces the id the dialog primitive points the window's `aria-labelledby` at. The window's id changes from run to run (`_r_0_`, `_r_4c_`), so the known entry matches the rule, `aria-dialog-name`, and not the id.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839 (screenshots and replay are kept with that run, not in the repository): case S3-01, the failed check "the project's export place: no serious or critical accessibility finding (axe)". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S3-01"`.
- Status: known

### Q11: Text set in the pale chip colour: the empty circles on Overview and the counts on the AI-use statement tab

- Case: S3-01 (Overview with nothing ready; the AI-use statement tab, built), S3-03 and S3-05 (the AI-use statement tab, axe), and S7-01 (the AI-use statement tab with four kinds of help)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI (accessibility)
- Expected: the six empty circles beside Overview's pieces (the sheet: "each with an empty circle") and the count in brackets beside each kind of help can be seen: 3:1 for the circles (WCAG 1.4.11), 4.5:1 for the 13.5 px count (WCAG 1.4.3; spec section 8, the axe scan: color-contrast)
- Happened: `.text-muted: color-contrast (serious)` on the AI-use statement tab, and measured by the cases: the circles' colour against the page behind them is 1.11, 1.11, 1.03 (the third), 1.11, 1.11 and 1.11 to 1, and the count "(1)" 1.11 to 1. Cause: Tailwind's `text-muted` is `--color-muted`, which `app/globals.css` (line 51) sets to `var(--chip)`, the pale chip background (#f4f3f6); the muted text colour is `text-muted-foreground`. Used in `components/tools/design/Overview.tsx:33` (the circle) and `AiUse.tsx:184` (the count). The circle is drawn as an icon, so the axe scan does not see it; the case measures it. The page says the same in words for a screen reader ("Not ready yet", the count in the label), so the loss is for sighted people.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-01, the failed checks "the empty circles beside the six pieces can be seen ...", "the count beside the kind of help can be read ..." and "AI-use statement, built: no serious or critical accessibility finding (axe)"; S3-03 and S3-05 for the axe finding. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S3-01"`.
- Status: known

### Q12: While the vault is locked, Overview marks all six pieces "Not ready yet"

- Case: S3-05 (Overview, vault locked)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: Unexpected (conceptual)
- Expected: with the vault locked, Overview says that the saved work is locked and does not tell the student that nothing is ready (source: `tools-walk.md` O2, the same lines while the work opens; the page's own rule that a count over unread work would be a false "0 of 6": `Overview.tsx` hides the count for loading, locked and unreadable)
- Happened: the locked note shows above, the count is hidden, and the six lines each still carry an empty circle and the spoken words "Not ready yet" ("Not ready yetRegulatory-pathway wizardNot ready yetProtocol / synopsis builder ..."), for work that is all done: the marks come from `designDashboard(s.done)`, where a blob that cannot be read counts as not done (`Overview.tsx`, `useDesignStatus`). O2 is the same lines while the work is opening (S3-07); the fix is probably the same.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-05, the failed check "Overview while locked does not mark the six pieces \"Not ready yet\" or give a count, as if nothing were done". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S3-05"`.
- Status: known

### Q13: While the vault is locked, Budget shows "Total: ₹0" and empty amount boxes

- Case: S3-05 (Budget, vault locked)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: Unexpected (conceptual)
- Expected: with the vault locked, Budget says that the saved work is locked and does not show a zero total over seven empty amount boxes as if nothing had been entered (source: `tools-walk.md` O7 and tools-a row 7; the sheet's "Total: ₹4,000" is what the saved work holds)
- Happened: under the locked note ("Your saved Design and ethics work is locked. Unlock your vault to read it and save your changes.") the page shows the seven default line names, empty amount boxes and `Total: ₹0` (`Budget.tsx`: `budgetRows(budget.value?.rows)` is the defaults while the value is null). O7 is the same page while the work is opening.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-05, the failed check "Budget while locked does not show \"Total: ₹0\" as if I had put in nothing". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S3-05"`.
- Status: known

### Q14: Amounts typed while the network was off are not sent when it returns

- Case: S3-06
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: Unexpected (data)
- Expected: budget amounts typed with the network off are saved once it is back, with no further action, and are still there after a reload (source: task brief S3-06, "go online, wait for the save, reload"; `tools-a.md` row 7, Budget keeps its amounts)
- Happened: offline, the total follows what is typed and the page says "Your last save did not go through. What you entered is kept here and is sent with your next change." After the network returns, nothing is sent for 10 s (no PUT of the budget blob), the line stays, and the server has no budget (GET answers 404). A reload then asks "Leave site?" (the page holds the amounts); leaving loses them (the amounts read empty after the reload). Cause: the browser's `online` event drains only what a panel that went away left behind (`lib/blobs/held.ts`); a panel that is still open keeps its unsent value and sends it with its next change (`useProjectBlob.ts`). Budget shows no "Saved" word; the case waits for the save the word stands for.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-06, the failed checks "once the network is back the amounts are saved ...", "once they are saved, the line that says the last save did not go through is gone", "the server holds the amounts" and "after a reload the amounts are kept ...". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S3-06"`.
- Status: known

### Q15: On a phone, the project name in a place's top line is 20 px tall and the "Your question" strip's summary 32 px

- Case: S3-08 (the Design place, Pathway, Budget and AI-use statement, on a phone, in Hindi), S6-06 (the Coding tab, its passages view, its name field and its delete question), S5-07 (the Data and Charts tabs), S7-06 (the Writing place's four screens), S8-06 (Review's Closeness, Viva and Make PPT) and S2-08 (every Literature checkpoint); it shows at the top of every place
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI
- Expected: on a phone, every control at least 44 px each way (source: spec section 8, layout rules, O17; as Q3)
- Happened: `a "Bedtime routine and exam anxiety" [place-home]: 230.2 × 20 px` (the link home in "<project> / Design and ethics") and `summary "आपका प्रश्न" in [question-strip]: 64.7 × 32 px`. File: `components/frame/PlaceHeader.tsx`.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-08, the failed checks "... every control at least 44 px each way" of the Design place, Pathway, Budget and AI-use statement. Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S3-08"`.
- Status: known

### Q16: On a phone, the Design and ethics tabs' own controls are under 44 px

- Case: S3-08 (Overview, Pathway, Budget and AI-use statement, on a phone, in Hindi); Ethics and consent, Registration and Investigator measured the same by a throwaway probe of the same screens
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI
- Expected: as Q15 (source: spec section 8, layout rules, O17); the sheet itself asks for tabs "at least 44 px tall" and they are (row 8)
- Happened: Overview's seven lines `[design-row-reg]` to `[design-row-aiuse]`: 317 × 32 px; the tick rows: `[reg-bio]`, `[reg-multi]`, `[aiu-keep]`, `[aiu-own]`, `[aiu-reword]`, `[aiu-cite]` 317 × 20 px and `[aiu-facts]`, `[aiu-nodata]` 317 × 40 px (the box is the browser's 17 px one, pressed through its label); in the probe `[ec-doc-0]` to `[ec-doc-7]`, `[ctri-field-0]` to `[ctri-field-12]` and `[pi-item-0]` to `[pi-item-5]` are 317 × 20 or 317 × 40 px; Budget's seven remove buttons `[budget-remove-0]` to `[budget-remove-6]`: 32 × 44 px. Files: `components/tools/design/Overview.tsx`, `Pathway.tsx`, `Ethics.tsx`, `Registration.tsx`, `Investigator.tsx`, `Budget.tsx`, `AiUse.tsx`.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-08, the failed checks "... every control at least 44 px each way". Re-run as Q15.
- Status: known

### Q17: On a phone, the document toolbar's Undo, Bold, Italic, Underline, bulleted list and numbered list buttons are 32 to 35.5 px wide

- Case: S3-08 (the document full screen, on a phone, in Hindi), S6-06 (the interview full screen, before and after the tap that tags a passage), S5-07 (the document after a figure is inserted, the same screen, where Undo shows too), S2-08 (the same screen; it also measured Undo) and S7-06 (the Writing place's document tab, My style and Words: all four of its screens carry the toolbar)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI
- Expected: as Q15 (source: spec section 8, layout rules, O17)
- Happened: `button "Bold" [fmt-bold]: 32 × 44 px`, `[fmt-italic]` and `[fmt-underline]` 32 × 44 px, `[fmt-bullets]` 32.8 × 44 px, `[fmt-numbered]` 35.5 × 44 px; and, once there is something to undo (after a tag in S6-06, after a figure in S5-07, in S7-06 and S2-08), `button "Undo" [fmt-undo]: 32 × 44 px` (on commit aa23121acb939df540ea10f828065bb49c396ef5). File: `components/document/FormatBar.tsx` (the `Fmt` buttons, line 24); the Redo button beside it is disabled until there is something to redo, and the layout rule does not measure a disabled control, so it is not listed. This is the "FormatBar buttons 32 px wide on a phone" candidate of the QA layer's notes, seen here for the first time in a case; the Writing story will meet it too.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-08, the failed check "the document full screen, on a phone, in Hindi: every control at least 44 px each way". Re-run as Q15.
- Status: known

### Q18: On a Hindi page, the document toolbar's more-formatting button shows Hindi but is named in English

- Case: S3-08 (the document full screen, on a phone, in Hindi), S6-06 (the interview full screen, in Hindi), S5-07 (the same screen after a figure is inserted), S7-06 (the Writing place) and S2-08 (the same screen)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI (accessibility)
- Expected: a control's accessible name contains the text it shows (source: spec section 8, the axe scan: any serious or critical finding; as Q1)
- Happened: `button[aria-label="More formatting"]`: label-content-name-mismatch (serious). The button shows `और ▾` (`fmt_more_btn` in Hindi) and is named `More formatting`, an English literal (`FormatBar.tsx`, line 154); in English the text "More ▾" is part of the name and axe does not report it. This is the second of the two label-content-name-mismatch candidates of the QA layer's notes (Q1 is the first).
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-08, the failed check "the document full screen, on a phone, in Hindi: no serious or critical accessibility finding (axe)". Re-run as Q15.
- Status: known

### Q19: On a Hindi page, the document bar and toolbar are in English

- Case: S3-08 (the document full screen, on a phone, in Hindi), S6-06 (the interview full screen, in Hindi), S5-07 (the same screen after a figure is inserted) and S7-06 (the Writing place: the document tab, My style and Words each carry the toolbar and the document bar; its own check of the toolbar's words names Q19), and S2-08 (the same screen)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens, including text written into components rather than the dictionaries, except what the register lists (source: spec section 8, layout rules; the register's exceptions D-S2-1, -2, -3 and -18 do not name the toolbar; the walk's O9 notes it: "the document toolbar stays English in Hindi mode (Paragraph, Image, Table, Find, Dictate)")
- Happened: `select "My first document" [doc-select]` (the title the app gives a project's first document, an English literal in `lib/frame/firstDocument.ts`) and `select "Paragraph style" [fmt-paragraph]`: "Paragraph B I U ≡• ↶ ↷ 🖼 Image ⊞ Table 🔍 Find 🎤 Dictate English (India)" (the toolbar's labels, written into `components/document/FormatBar.tsx`). The rule reads the toolbar as one run of English; the Hindi wording of the Budget page that O9 also names is for Dr. Sharma and is not what this entry is about.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-08, the failed check "the document full screen, on a phone, in Hindi: no English on a Hindi screen". Re-run as Q15.
- Status: known

### Q20: While the vault is locked, the Data tab never says so

- Case: S5-04 (the Data tab with the vault locked)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: Unexpected (conceptual)
- Expected: with the vault locked the Data tab says that the vault is locked, in words, so that an empty dataset-name box, where the project has a saved name, is not taken for nothing saved (source: the Collection and analysis row of spec section 6, "the data tab ... while locked"; spec section 4, a locked vault is called locked)
- Happened: the locked project's Data tab holds the introduction, an empty "Name of this dataset" box (the saved name does not show), the paste box, Parse data, Upload .csv, the guide button and "Parse your data first. The tests appear here once there is a table.": nothing on it says locked or unlock (only the header pill does). Typing in the name box raised the passphrase window with no word of why. After the unlock nothing was lost: the saved name came back, the pasted table stayed and the document held the sentence once. Causes: `apps/web/lib/tools/stats/useLabActions.ts:27` (the effect that fills the remembered name returns without a word while `stats_prefs` is locked) and `:42-45` (`rename` writes `stats_prefs` at every change, which raises the unlock window). Not part of this fault: after the student cancels the passphrase window, Insert into document answers "Your document did not open, so nothing was inserted." (`apps/web/components/frame/ProjectShell.tsx:469`, shared by every tool); that is true and gives no false reason.
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S5-04, the failed check "the Data tab says the vault is locked ...". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S5-04"`.
- Status: known

### Q21: Check numbers' numbers check says "No statistics found" about a locked document, and keeps saying it after the unlock

- Case: S5-04 (Check numbers with the vault locked, then unlocked)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: Unexpected (conceptual)
- Expected: the numbers check, pressed while the document is locked, says that the document is locked and was not read (as Results and data, the other half of the same tab, says "Your vault is locked. Unlock it to compare results with your data."), and a verdict made from a locked document is not left standing once the document can be read (source: spec section 4, a locked vault is called locked, not empty; `tools-walk.md` F5 (Closeness said "Write at least about 30 words first" of a locked document); `parity-deviations.md` D-S2-79, "a locked vault ... said in a line instead of an empty list")
- Happened: with the vault locked and the document holding "t(3.45) = 3.48, p = .032", pressing "Check the numbers in my document" shows "No statistics found. This check reads the APA pattern, for example "t(21) = 2.15, p = .043"."; after the unlock the same verdict stays on the page (the button now reads "Scan again") until it is pressed again, when it finds the statistic. Cause: `apps/web/components/tools/stats/NumbersCheck.tsx:29` runs `numbersView(access.text())`; `access.text()` is "" while the document's editor is not usable (`apps/web/lib/editor/docAccess.ts:218`), and no text has no statistics (`nc_none`); the verdict is the component's `view` state (`:26`), which nothing clears when the document opens.
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S5-04, the failed checks "the numbers check does not say "No statistics found" about a document it cannot read ..." and "the numbers check's verdict from the locked document is not left on the page once the document can be read ...". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S5-04"`.
- Status: known

### Q22: On a phone, the tick rows of the Data tab's practice mode and of Chart Studio's options are under 44 px

- Case: S5-07 (the Data tab with a result, and the Charts tab with a figure, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI
- Expected: on a phone, every control at least 44 px each way; a tick box is pressed through its label, so the larger of the two is its target (source: spec section 8, layout rules, O17; as Q3)
- Happened: `input [stats-gen]: 317 × 40 px` (the line "Practice mode: commit to my design before the test runs", `apps/web/components/tools/stats/RunTest.tsx:108-111`), and Chart Studio's `input [chart-pts]: 117.8 × 20 px`, `input [chart-n]: 146.7 × 20 px` and `input [chart-titlein]: 149 × 20 px` (its three option ticks, the `check()` of `apps/web/components/tools/stats/ChartStudio.tsx:96-101`, used at `:168-170`; `[chart-pts]` shows for the box and bar charts only). The buttons of both tabs are 44 px or more.
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S5-07, the failed checks "the Data tab with a result, on a phone, in Hindi: every control at least 44 px each way" and the same for "the Charts tab with a figure". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S5-07"`.
- Status: known

### Q23: On a Hindi page the quick chart's title box shows an English example

- Case: S5-07 (the Charts tab, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens, including the example text in a box (source: spec section 8, layout rules; the register's exceptions D-S2-1, -2, -3 and -18 do not name this box)
- Happened: `input "Attachment style distribution" [quick-title]`: the placeholder of "Chart title" is the English example "Attachment style distribution". The Hindi dictionary holds the English text for it (`apps/web/messages/tools/stats.hi.json:244`, `stats_ch_q_title_ph`, drawn by `apps/web/components/tools/stats/QuickChart.tsx:76`); every other label of the tab is Hindi (the case's own check passes).
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S5-07, the failed check "the Charts tab with a figure, on a phone, in Hindi: no English on a Hindi screen". Re-run as Q22.
- Status: known

### Q24: On a phone, a result table wider than the screen scrolls inside its box, but the keyboard cannot reach the box

- Case: S5-07 (Chart Studio's nine-column summary table, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI (accessibility)
- Expected: a box that scrolls can be scrolled from the keyboard: it takes focus, or holds something that does (source: spec section 8, the axe scan: any serious or critical finding; WCAG 2.1.1, keyboard; as Q6)
- Happened: `table`: scrollable-region-focusable (serious): Scrollable region must have keyboard access. The summary table under Chart Studio's picture (Group, n, M, SD, Mdn, Q1, Q3, Min, Max) is drawn as a scroll box (`display: block; overflow-x: auto`, `apps/web/components/tools/stats/ChartStudio.tsx:19`; the markup is core's block set in at `:195`, with no tabindex), so a student without a mouse or a touch screen cannot scroll to Min and Max. The same style is in `Results.tsx:12`, `Guide.tsx:13` and `PowerTab.tsx:15`: a result table wider than the screen has the same fault (the case saw it on the Charts tab only; the Welch tables fit in 317 px). Known match: the entry matches `axe` findings whose text contains `table scrollable-region-focusable`; axe reports a bare `table` as the target, so the match covers any scrolling table anywhere in the app (the same fault wherever it shows), not only Chart Studio's.
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S5-07, the failed check "the Charts tab with a figure, on a phone, in Hindi: no serious or critical accessibility finding (axe)". Re-run as Q22.
- Status: known

### Q30: On a phone, the Coding tab's own controls are under 44 px

- Case: S6-06 (the Coding tab, its passages view, its name field and its delete question, on a phone, in Hindi: the case's own check "every control of a code row is at least 44 px each way", and the touch-target rule at each checkpoint)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI
- Expected: on a phone, every control at least 44 px each way; the sheet's row 10 asks that on a code row "the colour dot, the name, +, the eye, the pencil and the bin are all on screen and can be pressed" (source: spec section 8, layout rules, O17; as Q3; `tools-c.md` row 10)
- Happened: all of them are on the screen and can be pressed, but they are narrow. On a code row: `button [qual-swatch-<id>]` (the colour dot, tags the selected passage) 14 × 44 px (the dot is a 14 px circle; its `after:-inset-1.5` widens the touch area to 26 px, still under 44, and the page's `min-height` of 44 px draws it as a 14 × 44 capsule), and `[qual-add-sub-<id>]`, `[qual-passages-<id>]`, `[qual-rename-<id>]`, `[qual-delete-<id>]` 24 × 44 px each, with the name button between them wide enough. The 44 px height comes from the phone rule `.place-body button { min-height: 44px }` (`app/globals.css`, line 453); nothing sets a width: the dot is `size-3.5` (`components/tools/qual/CodeTree.tsx`, line 64) and the four icon buttons are `size="icon-xs"`, which is `size-6` (`CodeTree.tsx`, lines 86 to 89; `components/ui/button.tsx`, line 35). The tick row of "Show code colors in the document" is `input [qual-show-colors]` 317 × 20 px (`components/tools/qual/Panel.tsx`, lines 121 to 125: a `<label>` around a `size-[17px]` box, which the `button` rule does not reach), and the name field's box is `input [qual-name-input]` 204 × 30 px (`components/tools/qual/NameField.tsx`, line 26, `h-[30px]`). A student in Hindi with a long code name meets the same widths: the four icons sit side by side at the right end of the row, each 24 px wide and 6 px apart (`gap-1.5`).
- Evidence: the run of 2026-10-24 on aa23121: case S6-06, the failed checks "every control of a code row is at least 44 px each way" and "... every control at least 44 px each way" at the Coding tab, the passages view, the name field and the delete question. Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S6-06"`.
- Status: known

### Q31: Going to the home straight after adding a code leaves its row empty and the stage "Not started"

- Case: S6-01 (step "three codes": the last code's save is held for 2 s, a slow network, and the project's name is pressed at once)
- Date: 2026-10-24
- Commit: 66d8ec3 (the product as built at aa23121acb939df540ea10f828065bb49c396ef5)
- Kind: Unexpected (data)
- Expected: after codes are added in Collection and analysis, the project's home says "3 codes" on that row and does not call the stage "Not started", whenever the student goes there (source: `tools-c.md` row 2, "Then press the project's name at the top to go to the home and read the Collection and analysis row ... The home's row ends with \"3 codes\""; spec section 4, cross-tool outcomes: the home's stage states follow the work done)
- Happened: the row `home-detail-collect` stays empty and the stage chip `home-state-collect` reads "Not started" for as long as the case looks (10 s), until the home is opened again or the page is reloaded. Probed before the case was written: a click on the project's name 0.2 s after the last code was added left the row empty for at least 6 s, in four of four runs, vault on and off. Without a held save the same walk passes, once the codes have been saved (the sheet's walk, S6-01's later "3 codes" check). The developers' own journey meets it too: `apps/web/e2e/tools-c.spec.ts` line 273 (`home-detail-collect` should contain "3 codes", step 2) fails in their CI, because the home is opened right after the third code.
- Cause (read, and reproduced by the case): the codes are saved 0.8 s after the last change (`lib/blobs/useProjectBlob.ts` line 21). Leaving the place disposes the blob client, which sends the pending value and records what could not go in `heldBlobs` (`useProjectBlob.ts` lines 429 to 437). The home mounts in the same step and asks `GET /projects?include=work` once (`lib/frame/useProjectWork.ts` lines 22 to 26) without waiting for `heldBlobs` (the project export does: `components/export/ExportDialog.tsx` lines 100 to 101, `heldBlobs.saveAll()`), and asks again only after a stage is marked ready (`components/frame/ProjectHome.tsx` lines 153 to 156). `StageFactsReader` reads only the kinds that list names (`ProjectHome.tsx` lines 89 to 92), so a first `qual_codes` blob whose PUT has not landed has no reader, and the stage's state is worked out from the same list (`ProjectHome.tsx` line 178, `lib/frame/stages.ts` lines 68 to 85), which has no work for the stage: "Not started".
- Likely wider (read, not run): the same for the first blob of every stage 3 to 6 tool (Design, Collection, Review), since they all save through `useProjectBlob`, and for the project list, which reads the same list once (`components/frame/ProjectList.tsx` line 47).
- Fix, either way: the home waits for `heldBlobs` to settle before its `GET /projects?include=work` (as the export does), or it asks again once the held saves have settled.
- Evidence: the run of 2026-10-24 on 66d8ec3: case S6-01, the failed check "going home straight after the last code, the home's Collection and analysis row says \"3 codes\" and the stage is not Not started, without a reload". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S6-01"`. The check is NOT CHECKED when the press came after the save was let go (a stalled runner), so a later FIXED? means the page was fixed, not that the timing changed.
- Status: known

### Q32: On a phone the passage to be tagged is not on the screen when the code is tapped

- Case: S6-06 (tag by touch, `tools-c.md` row 10)
- Date: 2026-10-24
- Commit: 66d8ec3 (the product as built at aa23121acb939df540ea10f828065bb49c396ef5)
- Kind: Unexpected (conceptual); a decision, not yet a fault
- Expected: OJ's and Dr. Sharma's call. The sheet's Observations ask: "on a phone an open document takes the whole screen and hides the place (the frame's rule in `DocumentBeside`), so a student may not be able to select text and tap a code in one go ... decide whether that is accepted or the frame needs a change". The case asserts the plain reading, that the passage is on the screen when the code is tapped (source: `tools-c.md` row 10 and Observations; spec section 4, conceptual)
- Happened: it is not. With the phrase selected in the open document, pressing Back shows the place and hides the document (`components/frame/DocumentBeside.tsx` line 37, `full = useMedia(PHONE_QUERY) && side`; lines 24 to 26). The selection is still held by the editor, so tapping the code does tag the phrase, but the tap then opens the document full screen over the place again (the tag goes through `requestInsert`, which opens a closed document first: `components/frame/ProjectShell.tsx` line 448, reached by `wrapSelection` in `lib/editor/docAccess.ts`), so the student ends on the document with the phrase shaded, and the code list and the line "Tagged as ..." are out of sight. Tagging works only for a student who selects, goes back, taps and comes back to look.
- Evidence: the run of 2026-10-24 on 66d8ec3: case S6-06, the check "the passage to be tagged is on the screen when the code is tapped" (its message holds what was seen) and the check that follows it, which passes. Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S6-06"`.
- Status: awaiting (OJ)

### Q40: Dragging, or copying and pasting, the words of a viva question puts them in the document

- Case: S8-01 (the step "a viva question from a selection": the checks "dragging the question's words onto the document puts nothing in it" and "copying the question's words and pasting them into the document puts nothing in it")
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: Unexpected
- Expected: the viva question is never added to the document: its label says "It is never added to your document", and the sheet says of the drag "Dragging the question does nothing. The document is word for word what it was; no gold AI text appears in it" (source: tools-e.md row 14; register D-S2-101; the plan's rule 4)
- Happened: the question's words, selected and dragged onto the editor, are dropped into the draft where the pointer lets go (in the run, into the middle of the abstract: "... and six teWhy did you balance the two groups by age, course and gender, and what would an unbalanced sample have done to your result?achers were interviewed ..."), in bold with the panel's own inline styles, with no AI mark (`span.ai-ins`), so the draft counts them as typed; the autosave keeps them. Selecting the question's words, pressing Ctrl+C and then Ctrl+V in the draft does the same (the second check; the case records that a paste carrying the words reached the editor, so a try that never got there is NOT CHECKED, not a pass): a fix has to cover both. A throwaway probe dropped the selected words of any plain paragraph and got the same. The live walk recorded "a mouse drag of its selected text onto the document changed nothing (a scripted drag may not start a real one)" and marked the drag SUPPORTED, not VERIFIED: a drag Playwright makes does start a real one. The cause of the drag is in two places: the editor's drop handler (`components/editor/Editor.tsx`, line 54) takes only dropped files and returns false for any other drop, so ProseMirror's own drop inserts the dragged text; and the question's paragraph (`components/tools/viva/VivaBody.tsx`, line 92, `data-testid="viva-q-text"`) can be selected and dragged. The paste has no handler of its own to blame: the editor's `handlePaste` (`Editor.tsx`, line 61) takes only pasted files, so any text a student copies from the page goes in; whether the question's words should be held back from that is OJ's view.
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S8-01, the failed check naming Q40 (its message holds the draft's html where the words fell). The case puts the draft back with Ctrl+Z after the drag so that its later checks are not about this one. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S8-01"`.
- Status: known

### Q41: On a phone, Closeness's source ticks and its "Your text with matches marked" fold are 20 px tall

- Case: S8-06 (Closeness on a phone, in Hindi, with one other document listed and a result shown)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI
- Expected: on a phone, every control at least 44 px each way (source: spec section 8, layout rules, O17; as Q15)
- Happened: `input [close-source]: 317 × 20 px` (the tick of each paper on the Reading shelf and each of "your other documents": the browser's own box inside a 12.5 px label row) and `summary "मेल चिह्नित किया हुआ आपका पाठ" in [close-result]: 317 × 20 px` (the summary of the fold that holds the marked text). Files: `components/tools/close/Sources.tsx` (the `box` rows, lines 14 to 18) and `components/tools/close/Result.tsx` (the `<summary>`, line 31). With a shelf of papers there is one such row for each paper.
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S8-06, the failed check "Closeness, on a phone, in Hindi: every control at least 44 px each way". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S8-06"`.
- Status: known

### Q42: On a Hindi page, Closeness names a pasted passage "Pasted passage" in English

- Case: S8-06 (Closeness on a phone, in Hindi, with a passage pasted and a result shown)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens except what the register lists and the student's own text and paper titles (source: spec section 8, layout rules; the walk notes, docs/walkthroughs/notes/2026-10-23-tools-walk.md, tools-e row 18: "English only in the student's own text and paper titles"; the sheet's row 18: "Every sentence of the three tabs is in Hindi")
- Happened: `div "[1] Pasted passage (चिपकाया गया): 1 अंश…" in [close-by-source]` and `div "[1.1] 28 शब्द, Pasted passage के निकट…" [close-passage]`. The name of a pasted source is core's constant (`packages/core/src/closeness.ts`, line 122, `name:'Pasted passage'` in `clGather`) and the result shows it as it is (`components/tools/close/Result.tsx`, lines 43, 50 and 51 print `p.name` and `r.sources[x.src]!.name`); the kind beside it, "चिपकाया गया", is translated. The names of shelf papers and of documents are the student's own, so only this one shows. The report file keeps it too (`clReportText`, which the register keeps in English: D-S2-95).
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S8-06, the failed check "Closeness, on a phone, in Hindi: no English on a Hindi screen". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S8-06"`.
- Status: known

### Q50: When the AI grammar check could not read the text, the panel says "Nothing found by the rules or the AI"

- Case: S7-05
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: Unexpected (conceptual)
- Expected: an AI check that failed to read the text does not report that the AI found nothing; the line under the cards says how many parts the AI read, and the empty box is consistent with it (source: `tools-d.md` row 5, "AI check: 1 of 1 part read"; the wording `wd2_nothing_ai`, "Nothing found by the rules or the AI", claims the AI read the text)
- Happened: with an AI key the provider rejects (the key mode `fail401`), Check with AI shows the message "Your API key was rejected. Open ⚙ and paste it again.", the line "AI check: 0 of 1 part read. The AI misses errors and sometimes flags correct text, so each item is a suggestion.", and, in the box where the cards would be, "Nothing found by the rules or the AI. That does not mean the text is perfect." Cause: `components/tools/words/Grammar.tsx` line 101 picks `wd2_nothing_ai` when `counts.parts` is not 0, and `gramAiMerge` (`packages/core/src/words.ts` line 244) returns `parts: chunks.length` (the parts the text was cut into) whether or not any was read, with `checked: done` (0 here) beside it; `checkWithAi` (`lib/tools/words/gram.ts`) calls it after the first request failed, with no reply to merge. The test that tells whether the AI read anything is `counts.checked`. A student who sees the box and not the line above it is told the AI looked and found no slip, when it did not look.
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S7-05, the failed check "the panel does not say \"Nothing found by the rules or the AI\" when the AI could not read the text" (its data check just before, "the AI line says no part was read", passes). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S7-05"`.
- Status: known

### Q51: On a phone, My style's tick rows, folded checks and ten-word answers are under 44 px

- Case: S7-06 (My style, and My style with the ten-word check open, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI
- Expected: on a phone, every control at least 44 px each way; a tick or an option is pressed through its label, so the larger of the two is its target (source: spec section 8, layout rules, O17; `tools-d.md` row 6, "Every button is at least 44 px tall"; as Q3)
- Happened: `input [style-decl]: 295 × 36 px` (the declaration the student must tick before anything is learned), `input [style-on]: 317 × 20 px` (Use my style in suggestions), the summaries of the three folded checks, `summary ... in [style-live]: 317 × 40 px`, `in [style-vocab]: 317 × 20 px` and `in [style-try]: 317 × 20 px`, and, once the ten-word check is open, its fifty answer rows `input [style-vocab-<i>-<j>]` (four options and "I do not know" for each of ten words): 317 × 20 px each. Files: `components/tools/style/Panel.tsx` (lines 144 and 170, the two tick rows), `components/tools/style/StyleChecks.tsx` (the three `<summary className="cursor-pointer font-semibold">` at lines 60, 109 and 173, and the radio rows at lines 116 and 121).
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S7-06, the failed checks "My style, on a phone, in Hindi: every control at least 44 px each way" and "My style with the ten words open, on a phone, in Hindi: every control at least 44 px each way". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S7-06"`.
- Status: known

### Q52: On a phone, Words' similar-word links, word-bank summary and Ignore buttons are under 44 px

- Case: S7-06 (Words, with an entry and cards, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI
- Expected: as Q51 (source: spec section 8, layout rules, O17; `tools-d.md` row 6)
- Happened: `button "survey" [dict-similar]: 37 × 44 px` (each similar word of an entry is a link as wide as its word), `summary "मेरा शब्द-भंडार" in [words-dictionary]: 295 × 18 px` (My word bank, folded) and `button "छोड़ें" [gram-ignore]: 38 × 44 px` on each grammar card (Apply is wide enough). Files: `components/tools/words/Dictionary.tsx` (line 154, the similar-word button with `p-0`), `components/tools/words/WordBank.tsx` (line 24, the summary), `components/tools/words/Grammar.tsx` (line 114, an `xs` button).
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S7-06, the failed check "Words, with an entry and cards, on a phone, in Hindi: every control at least 44 px each way". Re-run as Q51.
- Status: known

### Q53: On a Hindi page the personal-details window is in English

- Case: S7-06 (the personal-details window, on a phone, in Hindi); it opens from every AI request that carries an email address, phone number or ID number
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens, including text written into components rather than the dictionaries, except what the register lists (source: spec section 8, layout rules; the register's exceptions D-S2-1, -2, -3 and -18 do not name this window)
- Happened: with the page in Hindi, Check with AI on a text with an email address opens a window whose title "Personal details in this text", its line "Found: 1 email address.", its explanation "This text goes straight to your AI provider. The check finds email addresses, phone numbers and ID numbers. It cannot find a name written inside a sentence, so read the text once yourself." and its buttons "Mask them and send" and "Send as it is" are English; only Cancel is Hindi (`रद्द करें`, the dictionary's `sap_cancel_btn`). They are literals in `apps/web/lib/ai/pdDialog.tsx` (lines 13, 51, 55, 57 and 58). It is the window a student reads before deciding what leaves the browser. (The English wording is the sheets', `tools-d.md` row 5 and `phase-2.md` row 28; the question is the Hindi page.)
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S7-06, the failed check "the personal-details window, on a phone, in Hindi: no English on a Hindi screen" (the rule's first finding is listed under the share badge, because the badge's English word "yours" stands just before the window's title in the page's text: the run it reports is the window's own words, and it is matched by Q54's `[origin-badge]`; the second finding, `[pd-found]`, is Q53's). Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S7-06"`.
- Status: known

### Q54: On a Hindi page the share badge under the document reads "NN% yours" in English

- Case: S7-06 (the Writing place's document tab, on a phone, in Hindi); the badge shows under every document with 20 characters or more
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI (Hindi)
- Expected: the badge is in the page's language; the Hindi dictionary writes the same words as "% आपका" (`org_badge_title` in `messages/hi.json`: "यह आपके \"% आपका\", मेरा लेखन या लेखन नमूनों में नहीं गिना जाता।") (source: spec section 8, layout rules, no English on a Hindi screen; `phase-2.md` row 17, "NN% yours")
- Happened: the badge reads "100% yours" on a Hindi page, and its hover text is English too. `apps/web/components/document/OriginBadge.tsx` line 32 builds it as `${share.studentPct}% yours` (no dictionary key) and line 12 holds the hover text as an English constant (`TITLE`); only the source-paper badge (`org_badge_src`) goes through the dictionary. The layout rule alone does not report it (one English word beside a number), so the case checks the badge's own text for Devanagari.
- Evidence: the qa-report artifact of the run of 2026-10-24 on aa23121: case S7-06, the failed check "the share badge under the document is in Hindi (the Hindi dictionary writes \"% yours\" as \"% आपका\")". Re-run as Q53.
- Status: known

### Q55: The date beside my style declaration and my ten-word level is the UTC day, the date of my AI request is my own day

- Case: S7-08 (a student whose clock says 01:30 in Kolkata, with 20:00 UTC of the day before)
- Date: 2026-10-24
- Commit: 93d275d1a68b6c38ccf5ebdc4f8b351bfe4d3905
- Kind: Unexpected (data)
- Expected: the day written beside "declared as my own writing on <date>" and "Your level: <band> (7 of 10, <date>)" is the student's today, the same day the AI log files the student's request under and the same day the AI-use statement names (source: `tools-d.md` rows 2 and 3, "<today>"; `apps/web/lib/ai/callAI.ts` line 61, `localDay`, "Local calendar day, YYYY-MM-DD: the date the AI-use log records"). This is a decision for OJ, because the UTC day is what the port carries over from v1 (the comment at `lib/tools/style/learn.ts` line 25 names v1's lines 6429 and 6422).
- Happened: with the browser in `Asia/Kolkata` and its clock at 20:00 UTC on 2026-10-24 (01:30 on 25 October in India), the declaration reads "declared as my own writing on 2026-10-24" and the ten-word level "(7 of 10, 2026-10-24)" (`todayIso` in `lib/tools/style/learn.ts` line 26: `new Date().toISOString().slice(0, 10)`, UTC), while the one AI request (describing my writing style) is logged under 2026-10-25 (`localDay` in `lib/ai/callAI.ts` line 61, the browser's own day). The AI-use statement built from them names both days: "25 October 2026" for the request and "24 October 2026" for the declaration. The writing-process record's own date is the local day as well (`components/workspace/dialogs/MyWriting.tsx` line 18). By reading, the word bank's "date saved" is the UTC day too (`components/tools/words/Dictionary.tsx` line 18); the case does not measure it. A student in India meets this between 00:00 and 05:30 every day.
- Evidence: the qa-report artifact of the run of 2026-10-24: case S7-08, the failed check "the day beside my declaration, the day beside my ten-word level, the day my request is logged under and the days my AI-use statement names are all my day" (declaration 2026-10-24, ten words 2026-10-24, request 2026-10-25, statement "25 October 2026" and "24 October 2026"). The case sets the browser's time zone and clock (`timezoneId`, `page.clock.setSystemTime`), which work with the app. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S7-08"`.
- Status: awaiting (OJ)

### Q62: The Reading list and the paper card say they are kept in this browser, on this computer

- Case: S2-02 (the check "the pages do not tell me the reading list or my cards are kept only in this browser or on this computer, when the server holds them")
- Date: 2026-10-24
- Commit: 70e65ef
- Kind: Unexpected (conceptual)
- Expected: what the page says about where the student's work is kept is true (source: spec section 4, Conceptual: honest; register D-S2-19, which records the four sentences as untrue and proposes that Dr. Sharma rewords them)
- Happened: with the shelf, the notes and the card columns on the server (the case reads them from the database, sealed: `shelf_index`, `shelf_paper:<id>`, `ap_notes`, `ap_cols`), the Reading list says "Appuscholar reads each one in your browser and keeps only the extracted text, on this computer." (`sh2_intro`) and "Clearing your browser data erases the shelf." (`sh2_the_shelf_is_kept`), the paper card says "it saves as you type, in this browser." (`ap2_paper_card_your_own`), and Compare says "Cards live in this browser; back them up in Settings, Backup." (`ap2_cells_are_your_words`). The words are v1's, kept byte-equal (`apps/web/messages/en.json`, lines 1076, 1120, 89 and 30). The register already lists three of them (D-S2-19, status proposed, awaits Dr. Sharma, who rewords them; it keeps v1's words on purpose), so the entry is awaiting, as O4 and O14 are, and the case records what the page says. The fourth sentence, `sh2_the_shelf_is_kept` ("Clearing your browser data erases the shelf."), is not in D-S2-19: it should be added to that row for her.
- Evidence: the run of 2026-10-24 on 70e65ef: S2-02, the failed check named above, which lists each sentence. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S2-02"`.
- Status: awaiting (Dr. Sharma)

### Q63: While the vault is locked, Insert reference list says "Library is empty — add a source first"

- Case: S2-04
- Date: 2026-10-24
- Commit: 70e65ef
- Kind: Unexpected (conceptual)
- Expected: with the unlock cancelled, Insert reference list puts nothing into the document and says why: that the library is locked (source: spec section 6, S2: "Insert reference list with the unlock cancelled inserts nothing and says so"; the Citations page's own note, `vault_cite_locked`)
- Happened: the library holds two sources (a Cohen book kept before the lock, a paper kept while locked and saved after the passphrase). After a reload (locked) and Cancel on the passphrase windows the page, below its locked note ("Your saved library is locked. Unlock your vault to read it and save your sources."), answers the press with the toast "Library is empty — add a source first". Nothing is inserted and nothing is saved (both checked), but the sentence is false: the library is not empty, it is locked. Cause: `citeInsertBib` tests `d.lib.length` (`apps/web/lib/cite/share.ts:26`) and `lib` is `[]` while the blob is locked (`apps/web/lib/cite/useLibrary.ts:114`, `value ?? []`).
- Evidence: the run of 2026-10-24 on 70e65ef: S2-04, the failed check "what the page says after the press is that the library is locked, not that the library is empty (it holds two sources)" (`Received array: ["Library is empty — add a source first"]`). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S2-04"`.
- Status: known

### Q64: After a PDF is added to the Reading list, the tab shows no count until the student leaves it and comes back

- Case: S2-02 (right after the add; the count appears after Compare and back), S2-08 (the count is there on the last screen)
- Date: 2026-10-24
- Commit: 70e65ef
- Kind: Unexpected (data)
- Expected: "Reading list" shows its count once it holds a paper, as "Citations (n)" follows the library as soon as a source is kept (source: `wave-b1.md` row 10, "Citations shows its count (\"Citations (n)\"), and Reading list its count once it holds a paper")
- Happened: the shelf lists "shelf-paper.pdf · 2 pages · 0 highlights" and the tab above it reads "Reading list" for the 5 s the check waited; the count "(1)" shows after the student has been to Compare and back. Cause: `LitPlace.tsx:38` reads the index with `useShelf()`, which opens a read-only client of its own on `shelf_index` (`apps/web/lib/shelf/useShelf.ts:102`), while the add is written through the shelf's own client (`useShelf.ts:137`); the read-only one is not told. The e2e journey asserts the count only after leaving and re-entering the tab (`stage2-idea-literature.spec.ts` step 7).
- Evidence: the run of 2026-10-24 on 70e65ef: S2-02, the failed check "the Reading list tab counts the paper at once, as the Citations tab counts a source" (`Expected: "Reading list (1)"`, `Received: "Reading list"`). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S2-02"`.
- Status: known

### Q65: On a phone, the Literature tabs' own controls are under 44 px

- Case: S2-08 (Find with and without results, the Reading list, the reader, Analyse a paper with its walk-through, Compare, Citations; on a phone, in Hindi)
- Date: 2026-10-24
- Commit: 70e65ef
- Kind: UI
- Expected: on a phone, every control at least 44 px each way; a tick is pressed through its label, so the larger of the two is its target (source: spec section 8, layout rules, O17; as Q3)
- Happened: Find: `input in [rs-src-oa]` and `[rs-src-pm]` 317 × 20 px, `input in [rs-term]` 317 × 20 px, the filters' `summary "Filter these results" in [rs-filters]` 317 × 20 px with its two ticks 317 × 20 px and its year and sample boxes 80 × 30 px, the three "more" boxes' summaries `[rs-external]` (317 × 40 px), `[rs-manual]` and `[rs-connected-box]` (317 × 20 px), each result's `input in [rs-card]` (15 × 15 px) and `a "Show more / less" [rs-more]` (88.5 × 15 px). Reading list: `button "‹" [sh-prev]` and `"›" [sh-next]` 26 × 44 px, `button "Remove column" [sh-col-del]` 25.2 × 44 px, `summary "Check what Appuscholar read" in [ap-head]` 295 × 18 px, the twelve stage buttons `button "1" in [ap-stages]` to `"12"` 25.2 to 38.6 × 44 px, `summary "📊 My paper cards side by side" in [ap-across]` 317 × 20 px (343 × 20 px with its column ticks, 55 to 87 × 20 px, on Compare). Citations: `summary ... in [cite-bookmarklet-details]` 317 × 20 px, `a ... [cite-bookmarklet]` 207.5 × 36 px, `button "Remove" [cite-del]` 24 × 44 px. Files: `components/tools/research/SearchForm.tsx`, `Filters.tsx`, `ResultCard.tsx`, `External.tsx`, `ManualAdd.tsx`, `Connected.tsx`, `components/tools/shelf/Reader.tsx`, `Matrix.tsx`, `components/tools/analyse/AnalysePanel.tsx`, `Walk.tsx`, `Across.tsx`, `components/tools/cite/CiteLibrary.tsx`, `CiteQuote.tsx`. The result card's buttons (Insert citation, + Citation library, Quick read, ...) are tall enough and are not in this entry.
- Evidence: the run of 2026-10-24 on 70e65ef: S2-08, the failed checks "... every control at least 44 px each way" of Find, the Reading list, the reader, Analyse a paper, Compare and Citations. Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S2-08"`.
- Status: known

### Q66: On a Hindi page the Citation Manager's form shows English placeholders

- Case: S2-08 (Citations, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: 70e65ef
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens, including text written into components rather than the dictionaries, except what the register lists (source: spec section 8, layout rules; the register's D-S2-18 names the Citation Manager's action modules, `lib/cite/{actions,share,quote,capture}.ts`, not the form's placeholders)
- Happened: the author, title, journal and link boxes show `Miller, George A.; Smith, Jane B.`, `Title of work`, `e.g. Psychological Review` and `https://… or 10.xxxx/… or a full reference`, while their labels above are Hindi (`cite_author_label`, `cite_title_label`, ... in `messages/hi.json`). The placeholders are JSX literals in `apps/web/components/tools/cite/CiteForm.tsx` (lines 67, 71, 103 and 117; the hidden container, editors and number boxes have English ones too, lines 85, 89 and 93). v1 has the same literals in its page, so this is v1's English as ported, not covered by a register row.
- Evidence: the run of 2026-10-24 on 70e65ef: S2-08, the failed check "Citations, one source, on a phone, in Hindi: no English on a Hindi screen". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S2-08"`.
- Status: known

### Q67: Insert reference list with 2,000 sources blocks the page for about a second, and for about two on a slower computer

- Case: S2-06 (the check "the longest blocking task of the page while the list went in again, with the CPU 4 times slower")
- Date: 2026-10-24
- Commit: 70e65ef
- Kind: Slow
- Expected: while a huge library's reference list goes into the document, no stretch of the main thread is blocked for more than 1 s, so that typing and the buttons keep answering (source: spec section 8, "no main-thread freeze over 1,000 ms during huge data"; plan Task 15, S2-06)
- Happened: with 2,000 sources, the list goes in with the longest blocking task (the browser's long-task entries, read by a probe in the page) of 590 to 1,062 ms on a computer with nothing else running (the reviewer's six runs; ours 748 to 1,016 ms), and above 1 s whenever the machine is busy (1.2 to 2.1 s with other work running); the whole insert, from the press to the list in the document, takes 2.2 to 3 s (budget 10 s, met). With the CPU slowed four times (Chromium's own throttle, a student's slower laptop) the longest task is 1.87 to 2.23 s in each of five runs, so the case judges that second insert and the plain one is only timed. The unthrottled figure is at the edge of the budget, so it cannot be the case's mark. Cause: the 2,000 references are put in as one block: `components/tools/cite/CiteShare.tsx:21` calls `target.block(bibliographyHtml(lib, style))`, one ProseMirror insertion of 2,000 paragraphs, followed by the Citation Manager's recomputation of which documents cite each source (`lib/cite/usage.ts:62`, one pass over the document text for each of the 2,000 sources, 400 ms after the change, `USAGE_DEBOUNCE_MS`), which shows as further long tasks of 0.05 to 0.5 s over the next 3 s; the split between the two was not profiled. Importing the 2,000 sources and drawing their cards is not a freeze: its longest task was 0.2 to 0.5 s.
- Evidence: the run of 2026-10-24 on 70e65ef: S2-06, the failed check named above ("took 1,963 ms; the budget is 1,000 ms" and four more of 1,872 to 2,227 ms). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S2-06"`.
- Status: known

### Q70: Reading notes in the project export list the student's own summary as a highlight on "p. 0" with an empty quotation

- Case: S9-01 (the project's zip: the check "a note is a highlight or a line of the student's own: no line of the notes says \"p. 0\" or shows an empty quotation")
- Date: 2026-10-24
- Commit: 74806ed224f5fdfff77861a624a3c8600bc9b7ec
- Kind: Unexpected (conceptual)
- Expected: `notes/<paper>.txt` lists the highlights under "Highlights", each as a page and the quoted passage, and the student's own lines as her own words; no line shows a page 0 or an empty quotation (source: `wave-b1.md` row 12, `notes/<paper>.txt`; the export window's own line for the part, "Highlights, your own summaries and AI summaries, marked as such", messages `exp_detail_notes`)
- Happened: after a shelf paper was read, one passage was kept with a note, and "Summarise with AI" was pressed after two lines of her own, the paper's file reads `Highlights`, `p. 1: "Many families depend on older children"`, `  Field work keeps some pupils at home.`, `p. 0: ""`, `  My own summary before the AI: The paper says evening reading groups raised attendance.` and her second line. Cause (read, and reproduced by the case): the shelf stores the student's own lines as a note with `page: 0` and `quote: ""` (`lib/ai/actions.ts` line 343, `shelfSummarise`, v1's shape); the notes writer prints every note as a page and a quotation (`lib/export/projectExport.ts` line 102: `t("exp_page", { page: h.page }) + ": \"" + h.quote + "\""`) and does not tell the two apart. Read, not run: the AI's own summary is only shown in the reader (`setOut`, `lib/ai/actions.ts` line 346 on) and never stored, so the file holds "AI summaries" only for a paper that went through Analyse a paper.
- Evidence: the run of 2026-10-24 on 74806ed: case S9-01, the failed check named above (its message holds the file and the line `p. 0: ""`). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S9-01"`.
- Status: known

### Q71: Export all my work, cancelled at the passphrase window, says nothing

- Case: S9-02 (step "export all my work, locked": the check "Export all my work says that the export needs the passphrase: a toast, or a line in Help")
- Date: 2026-10-24
- Commit: 74806ed224f5fdfff77861a624a3c8600bc9b7ec
- Kind: Unexpected (conceptual); small
- Expected: with the vault locked, a student who presses Export all my work and cancels the passphrase window is told that nothing was exported and why, as the project's export window tells her ("Unlock with your passphrase to export this project.") (source: the plan's S9-02, "Export while locked: it says locked"; `components/export/ExportDialog.tsx` line 95 and messages `exp_locked`)
- Happened: after Cancel, Help's text is as it was, no toast is shown (measured for 1.5 s), and the button is free again: no zip, no log, and no word. Cause: `exportWork` returns at once when the vault is not unlocked (`components/workspace/dialogs/Help.tsx` line 78: `if (... !(await vault.ensureUnlocked())) return;`), while its only message, `export_fail`, is in the `catch` (line 108). The account menu's "Export all my work" runs the same function (`components/frame/AppHeader.tsx` line 190).
- Evidence: the run of 2026-10-24 on 74806ed: case S9-02, the failed check named above (message: "after Cancel at the passphrase window, Help showed no new line and no toast was shown (toasts: [])"). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S9-02"`.
- Status: known

### Q72: Export all my work shows no sign of progress while it reads

- Case: S9-04 [O10] (step "export all my work on a slow network": the check "a sign of progress after Export all my work")
- Date: 2026-10-24
- Commit: 74806ed224f5fdfff77861a624a3c8600bc9b7ec
- Kind: Slow (no sign of progress)
- Expected: a sign within 1 s of any press that takes longer: words or a bar that say the work is going on, not only a dimmed button (source: spec section 8, time budgets; the walk's O3, "the button dimmed with no other sign of progress", and S1-03 which holds first run's Save to the same rule). The project's export window names its part while it builds ("Building your zip: <part>. Keep this page open.", `ExportDialog.tsx` line 174)
- Happened: with every answer from the server delayed 3 s, Export all my work took 27 s. Its button greyed at once (`components/workspace/dialogs/Help.tsx` line 76, `setExporting(true)`, and line 178, `disabled={exporting}`; the account menu's item the same, `components/frame/AppHeader.tsx` line 190), and for the 10 s the case watched nothing else changed: no text under or on the button, no progress bar, no `aria-busy`, no toast. The only word comes at the end (`export_done`).
- Evidence: the run of 2026-10-24 on 74806ed: case S9-04, the time check named above ("took 10,008 ms; the budget is 1,000 ms": the wait for a sign gave up at 10 s). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S9-04"`.
- Status: known

### Q73: On a Hindi page, Help's "Import a v1 backup" button and its "Signed in as" line are in English

- Case: S9-05 (Help, and the window that asks for DELETE, which opens over Help)
- Date: 2026-10-24
- Commit: 74806ed224f5fdfff77861a624a3c8600bc9b7ec
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens (source: spec section 8, layout rules; the other Help buttons are in Hindi)
- Happened: `button "Import a v1 backup" [help-import-v1]` (English run found: "backup Signed in as"), and the line `Signed in as <address>` beside it. Both are written into the component, not the dictionaries: `components/workspace/dialogs/Help.tsx` line 171 (`Import a v1 backup`) and line 174 (`Signed in as {email}`). The same window's other buttons, its title, introduction and the Export all my work and Delete my account buttons, are Hindi.
- Evidence: the run of 2026-10-24 on 74806ed: case S9-05, the failed checks "Help, on a phone, in Hindi: no English on a Hindi screen" and "the window that asks for DELETE, on a phone, in Hindi: no English on a Hindi screen". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S9-05"`.
- Status: known

### Q74: On a phone, the three questions of Help's list are 20 to 40 px tall

- Case: S9-05 (Help, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: 74806ed224f5fdfff77861a624a3c8600bc9b7ec
- Kind: UI
- Expected: on a phone, every control at least 44 px each way (source: spec section 8, layout rules, O17)
- Happened: `summary [faq-lost]` 299 x 40 px, `summary [faq-hindi]` 299 x 20 px, `summary [faq-key]` 299 x 20 px: the lines that open Help's answers. They are `<summary className="cursor-pointer font-medium">` (`components/workspace/dialogs/Help.tsx` line 155) with no minimum height, and the phone rule that gives buttons 44 px (`.place-body button { min-height: 44px }`, `app/globals.css`) does not reach a dialog or a `summary`.
- Evidence: the run of 2026-10-24 on 74806ed: case S9-05, the failed check "Help, on a phone, in Hindi: every control at least 44 px each way". Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S9-05"`.
- Status: known

### Q80: A second project opens with the first project's Research search on show

- Case: S11-01 (step "B's Literature": the checks "B's Find reads as a new project's, with none of A's work" and "B's Find tab shows none of A's search", and step "B's export": "B's zip holds no list of A's last search")
- Date: 2026-10-24
- Commit: 74806ed
- Kind: Unexpected (data and conceptual)
- Expected: a project made after another starts as a new project does in every tool, and its export holds only what was done in it (source: spec section 5, S11, "a second project: nothing of the first shows in it"; `wave-b1.md` row 5, "the second project" starts at "Not started" while the first keeps its work; `tools-a.md` row 12 and `tools-e.md` rows 6 and 16, "the work belongs to the project". Row 12 of `wave-b1.md` says `search/last-search.csv` is written "after a search in this session", which is ambiguous here: it literally describes today's behaviour, a search made in A in this session, but the zip it is in is B's, and B ran none)
- Happened: project A is searched for "exam anxiety" (the related terms "test anxiety" and "evaluation anxiety", ten papers) and one paper is kept. Project B is then made through All projects and New project (no reload of the page). B's Find tab reads: the topic box "exam anxiety", the two related terms ticked and the ten papers of A's search, each with its tick box and its "+ Citation library" and "Insert citation" buttons (`{ topic: "exam anxiety", papers: 10, relatedTerms: 2 }` against `{ topic: "", papers: 0, relatedTerms: 0 }` in a new project). B's export zip holds `search/last-search.csv` with A's ten papers, in a zip whose other parts (documents, ai-use-statement.txt, writing-record.txt) are B's own. B's Citations tab, Design tabs, Coding, Closeness and Viva, B's home and the server's blobs for B hold nothing of A's: only the Research search is shared.
- Cause (read, and reproduced by the case): the search's topic, related terms, status, results, ticks and filters are one variable of the page, `let state` in `lib/research/useSearch.ts` line 167, "held for the tab's life outside React" and never tied to a project. Nothing sets it back when the project changes: `resetResearch` (line 206) is called only by the unit tests. The Find tab reads it (`useResearchState`), and the project export asks it for the last search (`shownNow`, line 179; `components/export/ExportDialog.tsx` line 121, `lastSearch: shownNow()`), whichever project is open. Read, not run: "+ Citation library" on one of those leaked papers in B adds it to B's own library (the card's `add` calls `addResult` with the open project's library: `components/tools/research/ResearchPanel.tsx` line 102, `lib/cite/useLibrary.ts` lines 91 to 94), so A's search can end up in B's citations. Signing out does not reset it either: `signOut` in `components/workspace/dialogs/Help.tsx` lines 48 to 56 forgets the keys, locks the vault and resets the personal-details memo, not the Research state (read, not run).
- Evidence: the run of 2026-10-24 on 74806ed: case S11-01, the failed checks named above. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S11-01"`. The case's other checks (B's Citations, Design, Coding, Closeness, Viva, home and the rest of B's zip) pass, so this entry is about the Research search only.
- Status: known

### Q81: The tick box beside each search result has no label

- Case: S11-01 (the checkpoint "B's Find tab", which shows A's search while Q80 stands; the Find results are S2's too); S2-01, S2-03, S2-05, S2-07 (Find with results) and S2-08 (the same on a phone, in Hindi)
- Date: 2026-10-24
- Commit: 74806ed
- Kind: UI (accessibility)
- Expected: every form element has a label, so that a person using a screen reader knows what a tick box is for (source: spec section 8, the axe scan: any serious or critical finding)
- Happened: `#rsChk0` to `#rsChk9` (one per result): label (critical): Form elements must have labels. `<input type="checkbox" id="rsChk<i>">` sits in a `div` beside the paper's `h4` and has no `<label>`, `aria-label` or `aria-labelledby` (`components/tools/research/ResultCard.tsx` line 45). The match lists the ten targets of the recorded search's ten results; a longer result list has more.
- Evidence: the run of 2026-10-24 on 74806ed: case S11-01, the failed check "B's Find tab: no serious or critical accessibility finding (axe)" (10 found). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S11-01"`. Any case that shows a result list meets it: S2-01 ("Find, the results of the first search"), S2-03 ("Find, the drafted paragraph and the document beside it"), S2-05, S2-07, S2-08 (4, 7 and 10 results). Re-run: `pnpm --filter @appuscholar/web qa:local -g "S2-01"`.
- Status: known

### Q83: "Not used in any document" under a source on Citations is too pale to read

- Case: S11-01 (the checkpoint "project A's Citations, after B"; any source not used in a document, so S2's Citations too); S2-01, S2-03 (twice: Citations after the Crossref check, and the window of its own) and S2-08 (Citations on a phone, in Hindi)
- Date: 2026-10-24
- Commit: 74806ed
- Kind: UI (accessibility)
- Expected: text of 13 px has a contrast of at least 4.5 to 1 with what is behind it (source: spec section 8, the axe scan: any serious or critical finding)
- Happened: `.cite-used`: color-contrast (serious). The line is `<div class="desc cite-used cite-not-used">` (`components/tools/cite/CiteChecks.tsx` line 44): `.panel .desc` sets the muted grey `#6b6579` (`app/globals.css` line 128, 5.6 to 1 on the white card), and `.cit-item .cite-not-used { opacity: .75 }` (line 149) fades it to about `#908c9a`, which is about 3.3 to 1 on `#ffffff` (calculated from the colours, not measured in the page).
- Evidence: the run of 2026-10-24 on 74806ed: case S11-01, the failed check "project A's Citations, after B: no serious or critical accessibility finding (axe)". With several sources on the page axe names each line by its card (`div[data-cite-index="0"] > div[data-cite-slot="cite-used"] > .cite-not-used.cite-used.desc`), which the known match also lists (S2-01: 3 of 4 cards, S2-03: 3 of 4); the run of 2026-10-24 on 70e65ef, S2-01, S2-03 and S2-08. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S11-01"`.
- Status: known

### Q96: While the vault is locked, an amount typed into Budget is dropped

- Case: S3-05 (Budget, vault locked; the check "an amount typed into Budget while the vault is locked is kept (it stays in the box), or the box cannot be typed in")
- Date: 2026-10-24
- Commit: 07acf1e5fb403f7af4dd0996369a65d44cf96dc1
- Kind: Unexpected (data)
- Expected: with the vault locked, an amount typed into Budget is kept (it stays in the box and is saved once the vault is unlocked), or the box cannot be typed in; nothing a student types is lost without a sign (source: spec section 6, S3: "each tab says locked, nothing typed is lost"; the same rule as O7, "kept, or the boxes cannot be typed in yet")
- Happened: the seven amount boxes are open (not read-only, not disabled) under the locked note. Typing "800" into line 4 leaves the box empty (`Expected: "800"`, `Received: ""`) and the total at `Total: ₹0`: nothing is kept, nothing is saved after the unlock, and nothing at the box says the key was refused. Cause: `Budget.tsx` (the amount `<input type="number" value={r.amount} onChange=...>`, line 55) calls `budget.save(...)` on every key, and `useDesign.save` returns false without setting anything while the blob is unread or locked (`lib/tools/design/useDesign.ts` line 57: `if (id === null || waiting || readOnly) return false`; `waiting` is `unread(blob)`, line 53, true for `locked && value === null`, line 30); the controlled input then goes back to the stored (empty) value. The same line drops the keystrokes of O7 (typed while the tab opens, 1 to 2 s); this entry is the locked state, which does not pass by itself, and a fix for the opening window (holding the keys until the read is done) would not necessarily cover it, so it has its own id.
- Evidence: the run of 2026-10-24 on 07acf1e: case S3-05, the failed check "an amount typed into Budget while the vault is locked is kept (it stays in the box), or the box cannot be typed in". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S3-05"`.
- Status: known
