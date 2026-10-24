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

- Case: S10-01 (the axe scan at "the second tab, locked, with its sentence kept" and at "the locked document"), and S6-01 to S6-05 (the axe scan at every checkpoint of the Coding tab and its document); it will show at every desktop screen with no window open
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

- Case: S3-01 (the project's export place, row 12 of the Design and ethics sheet); it shows wherever the export place opens (S9)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI (accessibility)
- Expected: a window that takes over the screen is named, so a screen-reader user hears what it is when it opens (source: spec section 8, the axe scan: any serious or critical finding; WCAG 4.1.2)
- Happened: `#radix-_r_…_`: aria-dialog-name (serious): ARIA dialog and alertdialog nodes should have an accessible name. Read from the open window (a throwaway probe of the same steps): `aria-labelledby="radix-_r_4d_"` points at no element on the page, because the window's title is `<h2 id="exp-h" data-slot="dialog-title">`: `ExportDialog.tsx` (`<DialogTitle id="exp-h" ...>`, line 142) gives the title an id of its own, which replaces the id the dialog primitive points the window's `aria-labelledby` at. The window's id changes from run to run (`_r_0_`, `_r_4c_`), so the known entry matches the rule, `aria-dialog-name`, and not the id.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839 (screenshots and replay are kept with that run, not in the repository): case S3-01, the failed check "the project's export place: no serious or critical accessibility finding (axe)". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S3-01"`.
- Status: known

### Q11: Text set in the pale chip colour: the empty circles on Overview and the counts on the AI-use statement tab

- Case: S3-01 (Overview with nothing ready; the AI-use statement tab, built), S3-03 and S3-05 (the AI-use statement tab, axe)
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

- Case: S3-08 (the Design place, Pathway, Budget and AI-use statement, on a phone, in Hindi), and S6-06 (the Coding tab, its passages view, its name field and its delete question); it shows at the top of every place
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

### Q17: On a phone, the document toolbar's five formatting buttons are 32 to 35.5 px wide

- Case: S3-08 (the document full screen, on a phone, in Hindi), and S6-06 (the interview full screen, before and after the tap that tags a passage)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI
- Expected: as Q15 (source: spec section 8, layout rules, O17)
- Happened: `button "Bold" [fmt-bold]: 32 × 44 px`, `[fmt-italic]` and `[fmt-underline]` 32 × 44 px, `[fmt-bullets]` 32.8 × 44 px, `[fmt-numbered]` 35.5 × 44 px; and, once there is something to undo (after a tag, in S6-06), `button "Undo" [fmt-undo]: 32 × 44 px` (on commit aa23121acb939df540ea10f828065bb49c396ef5). File: `components/document/FormatBar.tsx`. This is the "FormatBar buttons 32 px wide on a phone" candidate of the QA layer's notes, seen here for the first time in a case; the Writing story will meet it too.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-08, the failed check "the document full screen, on a phone, in Hindi: every control at least 44 px each way". Re-run as Q15.
- Status: known

### Q18: On a Hindi page, the document toolbar's more-formatting button shows Hindi but is named in English

- Case: S3-08 (the document full screen, on a phone, in Hindi), and S6-06 (the interview full screen, in Hindi)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI (accessibility)
- Expected: a control's accessible name contains the text it shows (source: spec section 8, the axe scan: any serious or critical finding; as Q1)
- Happened: `button[aria-label="More formatting"]`: label-content-name-mismatch (serious). The button shows `और ▾` (`fmt_more_btn` in Hindi) and is named `More formatting`, an English literal (`FormatBar.tsx`, line 154); in English the text "More ▾" is part of the name and axe does not report it. This is the second of the two label-content-name-mismatch candidates of the QA layer's notes (Q1 is the first).
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-08, the failed check "the document full screen, on a phone, in Hindi: no serious or critical accessibility finding (axe)". Re-run as Q15.
- Status: known

### Q19: On a Hindi page, the document bar and toolbar are in English

- Case: S3-08 (the document full screen, on a phone, in Hindi), and S6-06 (the interview full screen, in Hindi)
- Date: 2026-10-24
- Commit: 6ca58396356d330b554b081f170d5e8d5b69cb1d
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens, including text written into components rather than the dictionaries, except what the register lists (source: spec section 8, layout rules; the register's exceptions D-S2-1, -2, -3 and -18 do not name the toolbar; the walk's O9 notes it: "the document toolbar stays English in Hindi mode (Paragraph, Image, Table, Find, Dictate)")
- Happened: `select "My first document" [doc-select]` (the title the app gives a project's first document, an English literal in `lib/frame/firstDocument.ts`) and `select "Paragraph style" [fmt-paragraph]`: "Paragraph B I U ≡• ↶ ↷ 🖼 Image ⊞ Table 🔍 Find 🎤 Dictate English (India)" (the toolbar's labels, written into `components/document/FormatBar.tsx`). The rule reads the toolbar as one run of English; the Hindi wording of the Budget page that O9 also names is for Dr. Sharma and is not what this entry is about.
- Evidence: the qa-report artifact of the run of 2026-10-24 on 6ca5839: case S3-08, the failed check "the document full screen, on a phone, in Hindi: no English on a Hindi screen". Re-run as Q15.
- Status: known

### Q30: On a phone, the Coding tab's own controls are under 44 px

- Case: S6-06 (the Coding tab, its passages view, its name field and its delete question, on a phone, in Hindi: the case's own check "every control of a code row is at least 44 px each way", and the touch-target rule at each checkpoint)
- Date: 2026-10-24
- Commit: aa23121acb939df540ea10f828065bb49c396ef5
- Kind: UI
- Expected: on a phone, every control at least 44 px each way; the sheet's row 10 asks that on a code row "the colour dot, the name, +, the eye, the pencil and the bin are all on screen and can be pressed" (source: spec section 8, layout rules, O17; as Q3; `tools-c.md` row 10)
- Happened: all of them are on the screen and can be pressed, but they are narrow. On a code row: `button [qual-swatch-<id>]` (the colour dot, tags the selected passage) 14 × 44 px, and `[qual-add-sub-<id>]`, `[qual-passages-<id>]`, `[qual-rename-<id>]`, `[qual-delete-<id>]` 24 × 44 px each, with the name button between them wide enough. The 44 px height comes from the phone rule `.place-body button { min-height: 44px }` (`app/globals.css`, line 453); nothing sets a width: the dot is `size-3.5` (`components/tools/qual/CodeTree.tsx`, line 64) and the four icon buttons are `size="icon-xs"`, which is `size-6` (`CodeTree.tsx`, lines 86 to 89; `components/ui/button.tsx`, line 35). The tick row of "Show code colors in the document" is `input [qual-show-colors]` 317 × 20 px (`components/tools/qual/Panel.tsx`, lines 121 to 125: a `<label>` around a `size-[17px]` box, which the `button` rule does not reach), and the name field's box is `input [qual-name-input]` 204 × 30 px (`components/tools/qual/NameField.tsx`, line 26, `h-[30px]`). A student in Hindi with a long code name meets the same widths: the four icons sit side by side at the right end of the row, 24 px apart.
- Evidence: the run of 2026-10-24 on aa23121: case S6-06, the failed checks "every control of a code row is at least 44 px each way" and "... every control at least 44 px each way" at the Coding tab, the passages view, the name field and the delete question. Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S6-06"`.
- Status: known

### Q96: While the vault is locked, an amount typed into Budget is dropped

- Case: S3-05 (Budget, vault locked; the check "an amount typed into Budget while the vault is locked is kept (it stays in the box), or the box cannot be typed in")
- Date: 2026-10-24
- Commit: 07acf1e5fb403f7af4dd0996369a65d44cf96dc1
- Kind: Unexpected (data)
- Expected: with the vault locked, an amount typed into Budget is kept (it stays in the box and is saved once the vault is unlocked), or the box cannot be typed in; nothing a student types is lost without a sign (source: spec section 6, S3: "each tab says locked, nothing typed is lost"; the same rule as O7, "kept, or the boxes cannot be typed in yet")
- Happened: the seven amount boxes are open (not read-only, not disabled) under the locked note. Typing "800" into line 4 leaves the box empty (`Expected: "800"`, `Received: ""`) and the total at `Total: ₹0`: nothing is kept, nothing is saved after the unlock, and nothing at the box says the key was refused. Cause: `Budget.tsx` (the amount `<input type="number" value={r.amount} onChange=...>`, line 55) calls `budget.save(...)` on every key, and `useDesign.save` returns false without setting anything while the blob is unread or locked (`lib/tools/design/useDesign.ts` line 57: `if (id === null || waiting || readOnly) return false`; `waiting` is `unread(blob)`, line 53, true for `locked && value === null`, line 30); the controlled input then goes back to the stored (empty) value. The same line drops the keystrokes of O7 (typed while the tab opens, 1 to 2 s); this entry is the locked state, which does not pass by itself, and a fix for the opening window (holding the keys until the read is done) would not necessarily cover it, so it has its own id.
- Evidence: the run of 2026-10-24 on 07acf1e: case S3-05, the failed check "an amount typed into Budget while the vault is locked is kept (it stays in the box), or the box cannot be typed in". Re-run: `pnpm --filter @appuscholar/web qa:local -g "S3-05"`.
