# Phase 2 walk-through: workspace and writing core

Definition of done for Phase 2: a student completes this journey on the live site. Tests passing is necessary, not sufficient.
The same steps run automatically, with the AI mocked, in `apps/web/e2e/phase2-walkthrough.spec.ts`; keep the two in step.

**Site:** https://appuscholar-web.vercel.app
**You need:** a new email address you can sign in with (a new account, so the terms and the welcome tour appear), a desktop browser at about 1440 px wide, and a real **Groq** API key (free at console.groq.com). Use a passphrase you will remember: the walk-through types it several times. Three small sample files for the import steps are in `apps/web/e2e/fixtures/`: `sample-essay.docx` (a heading and a tiny picture), `sample-paper.pdf` (one page) and `sample-notes.txt`.
**Record:** fill the last column for each step with `VERIFIED` or `FAILED` and the date (`YYYY-MM-DD`). Anything FAILED is fixed and re-run before the phase is called done. Build under test: read the "Version ..." pill in the header (top left) and write it here: `541f020` (walk of 2026-10-16)

| # | Do this | Expect to see | Result and date |
|---|---------|---------------|-----------------|
| 1 | Open the site and sign in with the new email. | The terms window ("Before you start") covers the workspace. Its footer says "Version 2, 16 October 2026." | Not run 2026-10-16 (account already past the terms and welcome windows; covered by the e2e) |
| 2 | Press **Escape**, then click outside the window. | The window stays open. After Escape the line "Tick both boxes to continue." appears. | Not run 2026-10-16 (account already past the terms and welcome windows; covered by the e2e) |
| 3 | Press **Continue** without ticking, then tick the 18+ box and the agree box and press **Continue**. | First the need line again. After the ticks the terms close and the Welcome window opens ("Welcome to Appuscholar"). | Not run 2026-10-16 (account already past the terms and welcome windows; covered by the e2e) |
| 4 | Press **Set up my key**. | The AI Provider / Key window opens. | Not run 2026-10-16 (account already past the terms and welcome windows; covered by the e2e) |
| 5 | Choose **Groq — free & very fast**. Paste your real Groq key. Choose **Protect with a passphrase**. Press **Save Key**. | A passphrase window asks "Choose a passphrase for your keys...". Type it, press OK. It asks "Type the passphrase once more to confirm:". Type it again, OK. The toast says "Groq connected ✓ and encrypted 🔒" and the window closes. | Pending OJ: reported done in own browser 2026-10-16, but no credentials row and no stored key were found; redo in the driven tab |
| 6 | Open **⚙ AI Provider / Key** again and press **🔌 Test my AI connection**. | "Working ✓ Provider: Groq. The AI replied:" followed by a short reply from Groq. Close the window (Escape). | Pending OJ at the laptop (needs the key/passphrase) |
| 7 | Press **✨ New project**. Name it `Thesis on academic procrastination`. Leave the stage as it is. Press **Save**. | The toast "Saved as research project: Thesis on academic procrastination", then the window "Your project has six stages" with the six stages listed. | VERIFIED 2026-10-16 (first save about 5 s on a cold API) |
| 8 | Press **Start with Idea & Feasibility →**. | The window closes. In the left list the first stage group is highlighted. The stage guide at the top of the right-hand panel (the dock) reads "Stage 1 of 6 · Idea & Feasibility". | VERIFIED 2026-10-16 |
| 9 | Click in the document and type: `Procrastination delays important work. Students often start essays late.` Wait a moment. | The badge above the document says "Auto-save on". The word count under the document says "9 words". | VERIFIED 2026-10-16 |
| 10 | Reload the page (F5). | Both sentences are still there. The project bar shows `Thesis on academic procrastination` with a stage badge "Idea & Feasibility". | VERIFIED 2026-10-16 (about 10 s cold render) |
| 11 | Press **🧱 Template**, choose **Essay**, press **Insert**. | The toast "Template inserted ✓ — Ctrl+Z to undo". The document now has the headings Introduction, Conclusion and References after your two sentences. | VERIFIED 2026-10-16 |
| 12 | Scroll the document to your two sentences. Select the first sentence with the mouse. | A small bar floats above the selection with "Find papers", "Cite" and "💜 Improve". | VERIFIED 2026-10-16 |
| 13 | Press **💜 Improve**. After the reload your key is locked: type your passphrase when asked and press OK. | The toast "Key unlocked for this session ✓". The AI tab opens and shows "💜 Polishing…", then an improved version of the sentence. | Pending OJ at the laptop (needs the key/passphrase) |
| 14 | Read the line under the suggestion. | A "Checked: every number, citation and quoted phrase in your text is unchanged." line when the AI added nothing new. If the AI added a number, a name or a quote, an amber line "New in the result and not in your text, so unverified: ..." instead. Either is correct; it must be one of the two. | Pending OJ at the laptop (needs the key/passphrase) |
| 15 | Click in the document so the cursor is in it, then press **Tab**. (If the cursor left the document, press **Accept** in the AI tab.) | Your sentence is replaced by the suggestion. The toast "Inserted ✓ — Ctrl+Z to undo". The rest of the document is unchanged. | Pending OJ at the laptop (needs the key/passphrase) |
| 16 | Press **👁 AI text**. | The inserted passage gets a pale gold background and the toast "AI-inserted text highlighted in the document". Press it again to switch the highlight off. | Pending OJ at the laptop (needs the key/passphrase) |
| 17 | Look at the badge at the right of the action row. | It reads "NN% yours" with NN below 100 (green from 80, amber from 50, red below 50). | PARTIAL 2026-10-16: badge present, reads "100% yours"; the below-100 value needs step 15 |
| 18 | Click that badge. | The "📊 My writing" window opens. Your document is listed with "AI passages: 1". | PARTIAL 2026-10-16: window opens, lists "My first document 44 words, typed here 100%"; "AI passages: 1" needs step 15 |
| 19 | Press **⬇ Download my writing-process record (.txt)**. | A file named `writing-process-record.txt` downloads. Open it: it names the document, the date and the version, and counts typed and AI words. Close the window. | VERIFIED (app) 2026-10-16: generated file is writing-process-record.txt with document, date, version 541f020, typed 44 / AI 0. Chrome in the driven tab registered no download (see O7); OJ presses it once |
| 20 | Press **✍ Draft first** (it turns on, toast "Draft first is ON..."). Press **✨ Continue Writing**. | The AI tab shows "Feedback on your draft. Nothing here is meant to be pasted in, so the writing stays yours." followed by numbered questions. Nothing is added to the document. | PARTIAL 2026-10-16: Draft first ON toast verified; the Continue Writing part needs the key |
| 21 | Press **Accept** in the AI tab. | The toast "No suggestion to accept yet". The document does not change. | VERIFIED 2026-10-16 |
| 22 | Press **✍ Draft first** again. | It turns off; the toast "Draft first is off." | VERIFIED 2026-10-16 |
| 23 | Press **⬇ Download (Word)**, then **⬇ LaTeX file**. | Two files download, named after the open document: `<document name>.doc` and `<document name>.tex`. Open each: your text and headings are in them. | VERIFIED (app) 2026-10-16: "My first document.doc" and "My first document.tex", sentence and headings in both; same Chrome download caveat as step 19 |
| 24 | Press **📂 Import** (in the document row) and choose `sample-essay.docx` and `sample-notes.txt` together. | A window "Whose writing is this?" says "Importing 2 file(s): sample-essay.docx, sample-notes.txt." | VERIFIED 2026-10-16 |
| 25 | Press **My own writing**. Then open the Doc list and choose `sample-essay`. | Both files are now in the Doc list. `sample-essay` shows the heading "Imported essay heading", its paragraph and the small purple picture. No "source paper" badge. | VERIFIED 2026-10-16 (Doc list refreshed a few seconds after the toast, O6) |
| 26 | Press **📂 Import** and choose `sample-paper.pdf`. | No question is asked. The toast says "PDF imported as a source paper, not counted as your writing." The Doc list shows `📄 sample-paper` and the badge "📄 source paper" appears next to it. | VERIFIED 2026-10-16 (toast has an extra sentence: "Change it with the 📄 button.") |
| 27 | In the Doc list choose `sample-notes`, then press **📄 Mark as source**. | The toast "Marked as a source paper. It no longer counts as your writing." The badge "📄 source paper" appears in the document row and where "% yours" was. Click that badge: the My writing window says "... words in 2 source paper(s) are left out of these counts." Close it and choose your thesis document again in the Doc list. | VERIFIED 2026-10-16 ("27 words in 2 source paper(s) are left out of these counts.") |
| 28 | At the end of your document press Enter and type `Write to asha@uni.ac.in about the survey.` Select that line and press **💜 Improve** on the bar. | A window "Personal details in this text" with "Found: 1 email address." Press **Cancel**: the AI tab shows "Cancelled. Nothing was sent to the AI provider." | VERIFIED 2026-10-16 (no request to /ai/ left the browser; see O3) |
| 29 | Select the same line and press **💜 Improve** again. This time press **Mask them and send**. | The AI tab shows "Polishing…" and then an improved line. (The text that left the browser had `[email]` where the address was.) Press **Dismiss**, then delete the line with the address. | Pending OJ at the laptop (needs the key/passphrase) |
| 30 | Press **💬 Ask Appuscholar** in the left list. Type `Give me a way to start my introduction` and press **Send**. | Your question and a reply bubble appear ("💜 thinking…" first). | Pending OJ at the laptop (needs the key/passphrase) |
| 31 | Press **+ Insert into document** under the reply. | The toast "Inserted into your document ✓ — Ctrl+Z to undo". The reply is the last paragraph of the document, as AI-inserted text. | Pending OJ at the laptop (needs the key/passphrase) |
| 32 | Press **⧉ Pop out** while Ask Appuscholar is open. Then press **📚 Citation Manager** in the left list and press **⧉ Pop out** again. | First "Only Citations and Research can open in their own window." Then "Pop out arrives in a later phase." | VERIFIED 2026-10-16 |
| 33 | Press **हि** (top right). | The tool list on the left turns Hindi; the first tool reads "विचार और व्यवहार्यता". The toast says "भाषा: हिन्दी". | VERIFIED 2026-10-16 (see O5) |
| 34 | Press **EN**. | Everything is English again ("Idea & Feasibility"). | VERIFIED 2026-10-16 |
| 35 | Reload the page. Press **✨ Continue Writing**. When asked for the passphrase, type a wrong one and press OK. | "Wrong passphrase — nothing was unlocked. Try again." in the AI tab and as a toast. Nothing is sent to the AI (no "Polishing" or "Thinking" appears). | Pending OJ at the laptop (needs the key/passphrase) |
| 36 | Press **✨ Continue Writing** again and type the right passphrase. | "Key unlocked for this session ✓", then a continuation appears in the AI tab. Press **Dismiss**. | Pending OJ at the laptop (needs the key/passphrase) |
| 37 | Open **⚙ AI Provider / Key**, choose **Remember on this computer** (no passphrase), paste your key and press **Save Key**. Open **❓ Help** and press **Sign out**. | A window "Forget the AI keys remembered on this computer?" with **Forget and sign out** and **Keep and sign out**. Press **Keep and sign out**: you are on the sign-in page. Sign in again, open Help, press **Sign out**, and this time press **Forget and sign out**. Sign in once more and open ⚙: no key is remembered. | Pending OJ at the laptop (needs the key/passphrase) |

## Not yet in this phase

These exist on the screen but say they arrive later, or are absent on purpose. Do not mark them FAILED.

- **Research tools and Cite tools** (Find papers, Cite on the selection bubble): the buttons open the tool, which is a placeholder.
- **Viva question** button: toast "Viva question arrives in a later phase."
- **Devil's advocate** and **recap**.
- **Backup** button: toast "Backup arrives in a later phase."
- **Theme toggle** (light and dark).
- **Pop-out pages**: the ⧉ Pop out button only says it arrives later.
- **Idea & Feasibility assessment** ("🔎 Assess feasibility"): the panel and its form are there; the button says "Idea & Feasibility arrives in the next phase."

## Live results, 2026-10-16 (build 541f020)

Walked in OJ's Chrome (Claude in Chrome, OJ signed in with Google) on https://appuscholar-web.vercel.app, project "Thesis on academic procrastination", document "My first document". Steps that need the Groq key or the passphrase were left for OJ at the laptop; nothing in the key steps was typed by the session.

- VERIFIED: 7, 8, 9, 10, 11, 12, 21, 22, 24, 25, 26, 27, 28, 32, 33, 34; app side of 19 and 23.
- PARTIAL (the key-free half passes): 17, 18, 20.
- Not run on this account: 1, 2, 3, 4 (OJ's account accepted the terms on 2026-10-15 and has seen the welcome; the e2e covers them; a new test account would exercise them live).
- Pending OJ: 5, 6, 13, 14, 15, 16, 29, 30, 31, 35, 36, 37, and the second half of 17, 18, 20. The test line `Write to asha@uni.ac.in about the survey.` is still the last paragraph of the document for step 29.

Observations (none FAILED; carried to the ledger as deferred minors):

- O1: the provider dialog's "sent only to the provider you choose" line is v1 wording; in v2 the key passes through the gateway.
- O2: toasts sit over the action row and covered the Draft first button for about 5 s.
- O3: the AI tab shows "💜 Polishing…" while the "Personal details in this text" dialog is still open, before the student decides.
- O4: a click in the editor's empty bottom padding puts the caret at the start of the document and scrolls to the top; a click inside a paragraph works. v1's contenteditable puts the caret at the end (BELIEVED).
- O5: in Hindi the editor toolbar stays English (Paragraph, Image, Table, Find, Dictate, More, the dictation language).
- O6: imported documents appear in the Doc list a few seconds after "Imported 2 of 2 files ✓".
- O7: three real presses of the download buttons registered no download in any Chrome profile's history on this Mac, while the generated files were correct when captured in the page. Likely the driven-tab environment; OJ confirms with one press at the laptop.

## Sign-off

Walked by: Claude (key-free steps) and OJ (key steps, pending)  Date: 2026-10-16 (partial)  Build: 541f020

Result: 16 steps VERIFIED, 3 PARTIAL, 4 not exercisable on this account, 12 pending OJ's key steps. Phase 2 is not called done until the pending steps pass on the live URL.
