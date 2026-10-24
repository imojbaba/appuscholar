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

- Case: S10-01 (the axe scan at "the second tab, locked, with its sentence kept" and at "the locked document"); it will show at every desktop screen with no window open
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
- Evidence: the qa-report artifact of the run of 2026-10-24 on c0769fc: cases S10-01 and S10-06, the failed checks "... no two controls on top of each other" of the second tab, the unlock window with the verdict, the change passphrase window and the two recovery windows. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S10-01"`.
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
- Happened: six controls under 44 px: `input [key-mode-pass]: 325 × 36 px`, `[key-mode-plain]` and `[key-mode-session]`: 325 × 18 px, `[ai-fallback]`: 325 × 36 px, `[ai-log]`: 325 × 18 px, and the link "Don't have one? Get a free ORCID iD →" (in Hindi: "नहीं है? मुफ़्त ORCID iD पाएं →"): 160.4 × 17 px. The first three are how a new student chooses to keep their key. File: `components/workspace/dialogs/ProviderKey.tsx`.
- Evidence: the qa-report artifact of the run of 2026-10-24 on cfada86: case S1-02, the failed check "the key window, on a phone, in Hindi: every control at least 44 px each way". Re-run as Q7.
- Status: known

### Q9: On a Hindi page the key window's choices and hints, and the toast that says the key is connected, are in English

- Case: S1-02 (the key window, and the toast that follows the vault's set-up, on a phone, in Hindi)
- Date: 2026-10-24
- Commit: cfada864b83bd9de526ec7bc672e9256f8bd60a2
- Kind: UI (Hindi)
- Expected: in Hindi, no English on the app's own screens, including text written into components rather than the dictionaries, except what the register lists (source: spec section 8, layout rules; the register's exceptions D-S2-1, -2, -3 and -18 do not name this window or this toast)
- Happened: on the key window, four pieces of English: the provider list (`select [prov-select]`: "Google Gemini — free, easiest", "Groq — free & very fast" ... and the steps under it: "Sign up free → API Keys → Create API Key → copy ..."), the key-mode hint (`[key-mode-hint]`: "You choose a passphrase now and type it once each time you open Appuscholar ..."), the label "My field of study" with its note, and the option "If my AI is busy or fails, try my other saved keys automatically" with its note. The toast after the key is saved reads "Groq connected ✓ and encrypted 🔒" in English (`PROVIDERS[p].name + " connected ✓" + ...` in the same file; the sheet quotes it in English). All are v1's English literals in `components/workspace/dialogs/ProviderKey.tsx` (OPTION, MODE_HINT, and the strings in Form). The dictionary has Hindi for the window's title, labels and buttons, which show in Hindi (the case's own check passes).
- Evidence: the qa-report artifact of the run of 2026-10-24 on cfada86: case S1-02, the failed check "the key window, on a phone, in Hindi: no English on a Hindi screen", and "every toast speaks Hindi (the provider's name apart)". Re-run as Q7.
- Status: known
