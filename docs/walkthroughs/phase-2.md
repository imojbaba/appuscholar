# Phase 2 walk-through: workspace and writing core

Definition of done for Phase 2: a student completes this journey on the live site. Tests passing is necessary, not sufficient.
The same steps run automatically, with the AI mocked, in `apps/web/e2e/phase2-walkthrough.spec.ts`; keep the two in step.

**Site:** https://appuscholar-web.vercel.app
**You need:** a new email address you can sign in with (a new account, so the terms and the welcome tour appear), a desktop browser at about 1440 px wide, and a real **Groq** API key (free at console.groq.com). Use a passphrase you will remember: the walk-through types it several times. Three small sample files for the import steps are in `apps/web/e2e/fixtures/`: `sample-essay.docx` (a heading and a tiny picture), `sample-paper.pdf` (one page) and `sample-notes.txt`.
**Record:** fill the last column for each step with `VERIFIED` or `FAILED` and the date (`YYYY-MM-DD`). Anything FAILED is fixed and re-run before the phase is called done. Build under test: read the "Version ..." pill in the header (top left) and write it here: `__________`

| # | Do this | Expect to see | Result and date |
|---|---------|---------------|-----------------|
| 1 | Open the site and sign in with the new email. | The terms window ("Before you start") covers the workspace. Its footer says "Version 2, 16 October 2026." | |
| 2 | Press **Escape**, then click outside the window. | The window stays open. After Escape the line "Tick both boxes to continue." appears. | |
| 3 | Press **Continue** without ticking, then tick the 18+ box and the agree box and press **Continue**. | First the need line again. After the ticks the terms close and the Welcome window opens ("Welcome to Appuscholar"). | |
| 4 | Press **Set up my key**. | The AI Provider / Key window opens. | |
| 5 | Choose **Groq — free & very fast**. Paste your real Groq key. Choose **Protect with a passphrase**. Press **Save Key**. | A passphrase window asks "Choose a passphrase for your keys...". Type it, press OK. It asks "Type the passphrase once more to confirm:". Type it again, OK. The toast says "Groq connected ✓ and encrypted 🔒" and the window closes. | |
| 6 | Open **⚙ AI Provider / Key** again and press **🔌 Test my AI connection**. | "Working ✓ Provider: Groq. The AI replied:" followed by a short reply from Groq. Close the window (Escape). | |
| 7 | Press **✨ New project**. Name it `Thesis on academic procrastination`. Leave the stage as it is. Press **Save**. | The toast "Saved as research project: Thesis on academic procrastination", then the window "Your project has six stages" with the six stages listed. | |
| 8 | Press **Start with Idea & Feasibility →**. | The window closes. In the left list the first stage group is highlighted. The stage guide at the top of the right-hand panel (the dock) reads "Stage 1 of 6 · Idea & Feasibility". | |
| 9 | Click in the document and type: `Procrastination delays important work. Students often start essays late.` Wait a moment. | The badge above the document says "Auto-save on". The word count under the document says "9 words". | |
| 10 | Reload the page (F5). | Both sentences are still there. The project bar shows `Thesis on academic procrastination` with a stage badge "Idea & Feasibility". | |
| 11 | Press **🧱 Template**, choose **Essay**, press **Insert**. | The toast "Template inserted ✓ — Ctrl+Z to undo". The document now has the headings Introduction, Conclusion and References after your two sentences. | |
| 12 | Scroll the document to your two sentences. Select the first sentence with the mouse. | A small bar floats above the selection with "Find papers", "Cite" and "💜 Improve". | |
| 13 | Press **💜 Improve**. After the reload your key is locked: type your passphrase when asked and press OK. | The toast "Key unlocked for this session ✓". The AI tab opens and shows "💜 Polishing…", then an improved version of the sentence. | |
| 14 | Read the line under the suggestion. | A "Checked: every number, citation and quoted phrase in your text is unchanged." line when the AI added nothing new. If the AI added a number, a name or a quote, an amber line "New in the result and not in your text, so unverified: ..." instead. Either is correct; it must be one of the two. | |
| 15 | Click in the document so the cursor is in it, then press **Tab**. (If the cursor left the document, press **Accept** in the AI tab.) | Your sentence is replaced by the suggestion. The toast "Inserted ✓ — Ctrl+Z to undo". The rest of the document is unchanged. | |
| 16 | Press **👁 AI text**. | The inserted passage gets a pale gold background and the toast "AI-inserted text highlighted in the document". Press it again to switch the highlight off. | |
| 17 | Look at the badge at the right of the action row. | It reads "NN% yours" with NN below 100 (green from 80, amber from 50, red below 50). | |
| 18 | Click that badge. | The "📊 My writing" window opens. Your document is listed with "AI passages: 1". | |
| 19 | Press **⬇ Download my writing-process record (.txt)**. | A file named `writing-process-record.txt` downloads. Open it: it names the document, the date and the version, and counts typed and AI words. Close the window. | |
| 20 | Press **✍ Draft first** (it turns on, toast "Draft first is ON..."). Press **✨ Continue Writing**. | The AI tab shows "Feedback on your draft. Nothing here is meant to be pasted in, so the writing stays yours." followed by numbered questions. Nothing is added to the document. | |
| 21 | Press **Accept** in the AI tab. | The toast "No suggestion to accept yet". The document does not change. | |
| 22 | Press **✍ Draft first** again. | It turns off; the toast "Draft first is off." | |
| 23 | Press **⬇ Download (Word)**, then **⬇ LaTeX file**. | Two files download, named after the open document: `<document name>.doc` and `<document name>.tex`. Open each: your text and headings are in them. | |
| 24 | Press **📂 Import** (in the document row) and choose `sample-essay.docx` and `sample-notes.txt` together. | A window "Whose writing is this?" says "Importing 2 file(s): sample-essay.docx, sample-notes.txt." | |
| 25 | Press **My own writing**. Then open the Doc list and choose `sample-essay`. | Both files are now in the Doc list. `sample-essay` shows the heading "Imported essay heading", its paragraph and the small purple picture. No "source paper" badge. | |
| 26 | Press **📂 Import** and choose `sample-paper.pdf`. | No question is asked. The toast says "PDF imported as a source paper, not counted as your writing." The Doc list shows `📄 sample-paper` and the badge "📄 source paper" appears next to it. | |
| 27 | In the Doc list choose `sample-notes`, then press **📄 Mark as source**. | The toast "Marked as a source paper. It no longer counts as your writing." The badge "📄 source paper" appears in the document row and where "% yours" was. Click that badge: the My writing window says "... words in 2 source paper(s) are left out of these counts." Close it and choose your thesis document again in the Doc list. | |
| 28 | At the end of your document press Enter and type `Write to asha@uni.ac.in about the survey.` Select that line and press **💜 Improve** on the bar. | A window "Personal details in this text" with "Found: 1 email address." Press **Cancel**: the AI tab shows "Cancelled. Nothing was sent to the AI provider." | |
| 29 | Select the same line and press **💜 Improve** again. This time press **Mask them and send**. | The AI tab shows "Polishing…" and then an improved line. (The text that left the browser had `[email]` where the address was.) Press **Dismiss**, then delete the line with the address. | |
| 30 | Press **💬 Ask Appuscholar** in the left list. Type `Give me a way to start my introduction` and press **Send**. | Your question and a reply bubble appear ("💜 thinking…" first). | |
| 31 | Press **+ Insert into document** under the reply. | The toast "Inserted into your document ✓ — Ctrl+Z to undo". The reply is the last paragraph of the document, as AI-inserted text. | |
| 32 | Press **⧉ Pop out** while Ask Appuscholar is open. Then press **📚 Citation Manager** in the left list and press **⧉ Pop out** again. | First "Only Citations and Research can open in their own window." Then "Pop out arrives in a later phase." | |
| 33 | Press **हि** (top right). | The tool list on the left turns Hindi; the first tool reads "विचार और व्यवहार्यता". The toast says "भाषा: हिन्दी". | |
| 34 | Press **EN**. | Everything is English again ("Idea & Feasibility"). | |
| 35 | Reload the page. Press **✨ Continue Writing**. When asked for the passphrase, type a wrong one and press OK. | "Wrong passphrase — nothing was unlocked. Try again." in the AI tab and as a toast. Nothing is sent to the AI (no "Polishing" or "Thinking" appears). | |
| 36 | Press **✨ Continue Writing** again and type the right passphrase. | "Key unlocked for this session ✓", then a continuation appears in the AI tab. Press **Dismiss**. | |
| 37 | Open **⚙ AI Provider / Key**, choose **Remember on this computer** (no passphrase), paste your key and press **Save Key**. Open **❓ Help** and press **Sign out**. | A window "Forget the AI keys remembered on this computer?" with **Forget and sign out** and **Keep and sign out**. Press **Keep and sign out**: you are on the sign-in page. Sign in again, open Help, press **Sign out**, and this time press **Forget and sign out**. Sign in once more and open ⚙: no key is remembered. | |

## Not yet in this phase

These exist on the screen but say they arrive later, or are absent on purpose. Do not mark them FAILED.

- **Research tools and Cite tools** (Find papers, Cite on the selection bubble): the buttons open the tool, which is a placeholder.
- **Viva question** button: toast "Viva question arrives in a later phase."
- **Devil's advocate** and **recap**.
- **Backup** button: toast "Backup arrives in a later phase."
- **Theme toggle** (light and dark).
- **Pop-out pages**: the ⧉ Pop out button only says it arrives later.
- **Idea & Feasibility assessment** ("🔎 Assess feasibility"): the panel and its form are there; the button says "Idea & Feasibility arrives in the next phase."

## Sign-off

Walked by: ______________  Date: ____________  Build: ____________

Result: all 37 steps VERIFIED / failures listed above fixed and re-run.
