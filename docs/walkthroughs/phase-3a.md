# Phase 3A walk-through: the researcher's vault

Definition of done for Phase 3A: a researcher completes this journey on the live site. Tests passing is necessary, not sufficient.
The same steps run automatically in `apps/web/e2e/phase3a-vault.spec.ts` (its steps carry the same numbers as the rows below); keep the two in step. That the server never holds the text is checked separately, on the database itself, by the "server blindness" test in `apps/api/test/drizzle.test.ts`.

**Site:** https://appuscholar-web.vercel.app
**You need:** a new email address you can sign in with (a new account: step 1 shows the terms, and **step 9 deletes this account and everything in it**, so never walk step 9 with an account whose work you want to keep), a desktop browser at about 1440 px wide that can open a private window (or a second browser), and a pen. The passphrases below are for this throwaway account only: `correct horse`, then `battery staple`, then `third pass`. To see the migration of your own existing documents, sign in with your own account and do step 3 there only (and keep its recovery sheet).
**Record:** fill the last column for each step with `VERIFIED` or `FAILED` and the date (`YYYY-MM-DD`). Anything FAILED is fixed and re-run before the phase is called done. Build under test: read the "Version ..." pill in the header (top left) and write it here: `a425068` then `5b54f06` after the input-style hotfix (walk of 2026-10-16)

| # | Do this | Expect to see | Result and date |
|---|---------|---------------|-----------------|
| 1 | Open the site and sign in with the new email. Tick the 18+ box and the agree box, press **Continue**, then **Later** on the welcome window. | The workspace with an empty document. In the header the pill reads "Vault off". | VERIFIED 2026-10-16 (throwaway account; the welcome window's "Later" was not seen, the provider window opened after Continue: O11) |
| 2a | Click in the document and type: `Procrastination delays important work. Students often start essays late.` Wait a moment. | The badge above the document says "Auto-save on". The word count under the document says "9 words". | VERIFIED 2026-10-16 |
| 2b | Open the site in a second tab of the same browser (copy the address into a new tab). Leave that tab as it is and go back to the first tab. | The second tab shows the same two sentences and its pill reads "Vault off". | VERIFIED 2026-10-16 |
| 3 | In the first tab press the **Vault off** pill. Leave **Remember on this computer** unticked and press **Set passphrase**. Type `correct horse`, OK; it asks "Type it again": type `correct horse`, OK. | "Your recovery sheet" shows a code like `XXXXX-XXXXX-XXXXX-XXXXX`. Write the code down (or press **⬇ Download recovery sheet**). **Done** stays greyed out until you tick **I have saved it**; tick it and press **Done**. The pill may read "Vault: securing your documents…" for a moment, the toast says "All your documents are now locked in your vault ✓", and the pill reads "Vault on". | VERIFIED 2026-10-16 on both accounts (OJ's own: 5 documents, 20 revisions, 1 m 44 s, completion toast missed by the observer; throwaway: toasts captured) |
| 4a | Go to the second tab (do not reload it). Click at the end of the text and type ` Deadlines feel far away.` | A window "🔒 Unlock your vault" asks "Type the passphrase that protects your documents." Press **Cancel**: the badge above the document turns amber and says "Unlock your vault to save your changes." Your new sentence stays in the document. | VERIFIED 2026-10-16 (unlock window about 14 s after typing; amber badge; sentence kept) |
| 4b | Still in the second tab, press the **Vault locked** pill. Type `wrong` and press OK. Then type `correct horse` and press OK. | After `wrong`: the toast "Wrong passphrase — nothing was unlocked. Try again." and the window stays open. After `correct horse`: the window closes, the badge says "Auto-save on" and the pill "Vault on". All three sentences are there. Close the second tab. | VERIFIED 2026-10-16 functionally; the wrong-passphrase toast was recorded but not seen by OJ (O9) |
| 4c | In the first tab reload the page (F5). Press **Cancel** when asked for the passphrase. Then press the **Vault locked** pill and type `correct horse`, OK. | After the reload the pill reads "Vault locked" and the unlock window opens before the document. After Cancel the document reads "This document is locked. Unlock your vault to read it." (no editor, never an empty page). After the passphrase all three sentences are back and the pill reads "Vault on". | VERIFIED 2026-10-16 |
| 5 | Open a private window (or another browser), open the site and sign in with the same email. | The pill reads "Vault locked" and the unlock window asks for the passphrase before the document opens. Type `correct horse`, OK: all three sentences appear and the pill reads "Vault on". Close the private window. | VERIFIED 2026-10-16 per OJ (private window) |
| 6 | Back in the first tab open **❓ Help** and press **Change passphrase**. Current passphrase `correct horse`; new passphrase `battery staple`, twice. Press **Change**. Then reload the page and type `correct horse` when asked; then `battery staple`. | The toast "Passphrase changed ✓" and the window closes. After the reload `correct horse` gives "Wrong passphrase — nothing was unlocked. Try again." and the window stays; `battery staple` opens the document with all three sentences. | VERIFIED 2026-10-16 (toast, audit passphrase-changed, no document rewritten; old refused, new opened) |
| 7a | Reload the page. In the unlock window press **Forgot it? Use your recovery sheet**. Type the recovery code from step 3, and `third pass` as the new passphrase, twice. Press **Recover and set passphrase**. | The toast "Vault recovered ✓ — a new recovery sheet is ready" and a new recovery sheet with a **different** code. Write the new code down, tick **I have saved it**, press **Done**. The document opens with all three sentences. | VERIFIED 2026-10-16 (with the real sheet on OJ's own account too) |
| 7b | Reload the page and type `third pass` when asked. | The document opens with all three sentences. | VERIFIED 2026-10-16 (clean test: 12 characters typed, no autofill); earlier refusals of a believed-correct passphrase on both accounts stay unexplained (O14) |
| 7c | Reload the page. Press **Forgot it? Use your recovery sheet** and type the **old** code from step 3, with `fourth passphrase` twice. Press **Recover and set passphrase**. Then press **Cancel**, press the **Vault locked** pill and type `third pass`. | "That code did not match. Check the sheet and try again." and the recovery window stays open. After Cancel the document reads "This document is locked. Unlock your vault to read it."; `third pass` still opens it with all three sentences. | VERIFIED 2026-10-16 (old code refused four times, window stayed) |
| 8 | Open **❓ Help** and press **⬇ Export all my work**. | A file `appuscholar-export-<today's date>.zip` downloads and the toast says "Export ready ✓". Unzip it: a document `.html` (and `.doc`) file holds all three sentences in readable text, next to `index.json` and `writing-process-record.txt`. | VERIFIED 2026-10-16 (zip saved after Chrome's save dialog; html and doc hold the three sentences; index.json; record) |
| 9 | In **❓ Help** press **Delete my account**. Type `delete` (lower case), then `DELETE`, and press **Delete everything**. | With `delete` the button stays greyed out; with `DELETE` it is enabled. After pressing it the toast "Your account has been deleted." and you are on the sign-in page. Opening the site again lands on the sign-in page. | VERIFIED 2026-10-16 (gate on the exact word; toast; sign-in page; Neon: zero rows outside audit_log, 8 audit rows kept) |
| 9b | Sign in again with the same email. | A fresh account: the terms window again, then the welcome window; afterwards the pill reads "Vault off" and the document is empty ("0 words"), with none of the three sentences.¹ | VERIFIED 2026-10-16 (fresh account, "Vault off", 0 words; new user id on the server) |

¹ For developers: the e2e marks step 9b `fixme`. On its local recipe the api (in-memory store) and the sign-in (the web's Postgres) use separate databases, so the erased user id comes back and the api refuses it. On the live site both share one database, so this row is the check.

## Not yet in this phase

These are part of the vault design but arrive later, or are absent on purpose. Do not mark them FAILED.

- **Sharing and roles**: sharing a document with a supervisor or co-author (grants and roles; the keypair made in step 3 is for this). Phase 7.
- **Datasets**: statistics data is not yet in the vault. Phase 4.
- **Hosted MCP**: the hosted MCP door's use of the vault keypair. Phase 6.
- **Revision retention pruning**: every save keeps a version for now; thinning old versions (30 days in full, then daily, then weekly) is a server job. Phase 4.

## Observations (none FAILED; carried to the ledger)

- O9: the wrong-passphrase verdict is a toast at the bottom while a modal holds focus; the student does not see it. Show it inside the window.
- O10: vault windows' fields rendered borderless until the hotfix 5b54f06 (the `.input` style was scoped to a wrapper). Fixed live during the walk.
- O11: after Continue on the terms, the provider window opened instead of the welcome window's "Later". Check the first-run order.
- O14: twice a passphrase believed correct was refused and the recovery sheet had to be used; the clean test passed and no defect was found in the code. Add a "show passphrase" toggle to every passphrase field.
- Migration of 20 revisions took 1 m 44 s on a cold api; the pill said "Securing document 3 of 5…" for most of it.
- Downloads started by an automated click open Chrome's save dialog, which waits for a person; the earlier Phase 2 download notes are explained by this.

## Sign-off

Walked by: OJ with Claude driving (OJ typed every passphrase and code)  Date: 2026-10-16  Build: a425068, then 5b54f06

Result: all 15 rows VERIFIED on the live URL (step 3 on OJ's own account and on the throwaway; the rest on the throwaway). Four observations open for Phase 3B (O9, O11, O14, migration speed).
