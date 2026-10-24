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
- Evidence: run of 2026-10-24 on c0769fc, the failed checks "the second tab, locked, with its sentence kept: no serious or critical accessibility finding (axe)" and "the locked document: no serious or critical accessibility finding (axe)" in `qa-report/screens/S10-01/`, replay `qa-report/traces/S10-01.zip`. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S10-01"`. The notes of the QA layer list two label-content-name-mismatch findings as candidates; this is the language button, seen on two screens of S10-01; the other candidate has not turned up in S10.
- Status: known

### Q2: After the right passphrase, the project's home says "This project is locked" and shows nothing opening

- Case: S10-05
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: Slow (no sign of progress), and the page contradicts itself
- Expected: pressing OK on the unlock window while every answer from the server takes 3 s shows a sign within 1 s that the project is opening ("Opening your saved work…", or the project itself) (source: spec section 8, a sign of progress within 1 s of any press that takes longer; the page also reads "Vault unlocked" in the header at that moment)
- Happened: sampled every 100 ms after OK: at 146 ms the pill reads "Vault unlocked", and for the next 3.3 s the home still shows the card "This project is locked. Enter your passphrase to open it." with its Unlock button, and no loading line (`home-loading` never appears); at 3,430 ms the six stages show. The card comes from `ProjectHome.tsx` (`locked = blobs.some((b) => b.locked)`), which stays true until each blob has been read again after the unlock.
- Evidence: run of 2026-10-24 on c0769fc, S10-05 (`took 3,4xx ms; the budget is 1,000 ms`), `qa-report/traces/S10-05.zip`; the 100 ms timeline above is from a throwaway probe of the same steps. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S10-05"`.
- Status: known

### Q3: On a phone, the "Remember on this computer" tick row is 20 px tall

- Case: S10-06 (the set-up window, the unlock window, and the unlock window with the wrong-passphrase verdict)
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: UI
- Expected: on a phone, every control at least 44 px each way; a tick box is pressed through its label, so the larger of the two is its target (source: spec section 8, layout rules, O17)
- Happened: `input [vault-setup-remember]: 325 × 20 px` and `input [pass-remember]: 325 × 20 px` (the box itself is the browser's 13 px one). Files: `components/workspace/dialogs/VaultSetup.tsx`, `Passphrase.tsx`.
- Evidence: run of 2026-10-24 on c0769fc, the failed checks "the set-up window", "the unlock window" and "the unlock window with the verdict": "every control at least 44 px each way", in `qa-report/screens/S10-06/`, replay `qa-report/traces/S10-06.zip`. Re-run: `pnpm --filter @appuscholar/web qa:local --project=phone -g "S10-06"`.
- Status: known

### Q4: On a phone, the recovery sheet's "I have saved it" tick row is 20 px tall

- Case: S10-06 (the recovery sheet after the set-up, and the new recovery sheet after the recovery)
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: UI
- Expected: as Q3 (source: spec section 8, layout rules, O17)
- Happened: `input [vault-sheet-saved]: 325 × 20 px`. The sheet cannot be closed until this box is ticked, so a student with a thumb must hit it. File: `components/workspace/dialogs/RecoverySheet.tsx`.
- Evidence: run of 2026-10-24 on c0769fc, the failed checks "the recovery sheet" and "the new recovery sheet": "every control at least 44 px each way", in `qa-report/screens/S10-06/`. Re-run as Q3.
- Status: known

### Q5: The show-passphrase eye lies over the right end of every passphrase field

- Case: S10-01 (the unlock windows, the change-passphrase window, the recovery window) and S10-06 (the same windows on a phone, in Hindi)
- Date: 2026-10-24
- Commit: c0769fcff141aefb4937328b9b77acf06f3e5edd
- Kind: UI
- Expected: no two controls on top of each other (source: spec section 8, layout rules). `SecretInput.tsx` means to keep 44 px free at the field's right edge for the eye (`pr-11`).
- Happened: `input "Passphrase" [pass-input] over button "Show passphrase" [pass-input-toggle]: they cross by 44 × 36 px` (on a phone, 44 × 44 px), and the same for `vault-change-old`, `vault-change-new`, `vault-change-again`, `recover-pass` and `recover-pass2`. The field's right padding computes to 10 px, not 44 px: the `.input` rule in `app/globals.css` (line 133) is outside any `@layer`, so it wins over Tailwind's `pr-11` utility. A passphrase of about 70 characters or more runs under the eye (measured: field 462 px wide, eye 44 px at its right end, `padding-right: 10px`; a screenshot with a long passphrase shows the dots up to and under the icon).
- Evidence: run of 2026-10-24 on c0769fc, the failed checks "... no two controls on top of each other" of the second tab, the unlock window with the verdict, the change passphrase window and the two recovery windows in `qa-report/screens/S10-01/`, and the same on a phone in `qa-report/screens/S10-06/`. Re-run: `pnpm --filter @appuscholar/web qa:local -g "S10-01"`.
- Status: known
