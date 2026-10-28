# Stage 2 live walk: 2026-10-20

Build 6c38396 on https://appuscholar-web.vercel.app, on a fresh throwaway account. The old throwaway account was deleted from inside the app first.
Claude ran the steps in OJ's Chrome tab. OJ typed the passphrase and the key, and did the parts that need Chrome's own windows.

## Results

| Step | Result | Notes |
|---|---|---|
| 1 Create the project | PASSED | Checked on screen: vault on, key ready, project bar and stage guide correct. |
| 2 Test the idea | PASSED | Five rated lines and a verdict; Tab inserts them as AI text; boxes kept. Faults 7, 8. |
| 3 Search | PASSED | 14 papers from OpenAlex and PubMed; related terms and study types match. Fault 12. |
| 4 Capture and manual add | FAILED | The PubMed capture has no authors (fault 1). Manual add and Google Scholar work. Faults 4, 5, 6, 13. |
| 5 Quick read and filters | PASSED | Quick reads, every filter and connected papers match. Fault 3. |
| 6 Collect | PASSED | Citation and library work; 4 sources in order; search-results.csv checked. Faults 2, 11. |
| 7 Reading shelf | FAILED | Highlights fail in the natural order (fault 17). Summary, matrix and counts work. Faults 14, 15, 16, 18, 19. |
| 8 Analyse a paper | FAILED | A race can swap the paper silently (fault 20). Ask, numbers, references, walk-through and card work. Faults 21, 22, 23. |
| 9 Compare cards | PASSED | Table and Strengths column work; paper_cards.csv checked. Fault 24. |
| 10 Synthesise | PASSED | Draft, gap, helper and challenge work. Faults 25, 26. |
| 11 Check citations | PASSED with faults | Retraction, Crossref, reference list and pop-out insert work. References are wrong for APA (faults 27, 28). |
| 12 Move on | PASSED with fault | Guide shows "Stage 3 of 6 · Design & Ethics", but the project's own stage stays "idea" in the bar and the database (fault 29). Database: all 8 stage blobs key_version 1, no readable text. |

Summary: 8 of 12 steps pass; steps 4, 7 and 8 fail; 29 faults logged. Every tool works at its core, and the AI answers are grounded. The failures are flow, wording and data-quality problems.

## OJ's comments, in OJ's words

- "It seems to be not great UX to have to add to bookmark and then capture. We may have to find a better way to execute this, maybe even the URL being pasted, or like NotebookLM search sources, here within the tool."
- "The description of the capture button and UI is very sloppy."
- "On the new tab, once the bookmark is clicked, it shows the Appuscholar page with default blank info before the passphrase opens up. Again not great UX, UI or even copy."

## Faults and fixes to make after the walk

1. **The capture loses authors on PubMed.** PubMed gives its authors in a tag called citation_authors. The capture code, copied from v1, reads only citation_author. Volume and issue are dropped too. The fix is to read both tags. This is a v1 bug, so it needs a register row.
2. **References drop authors.** The Schaefer 2019 reference lists 4 authors, but the paper has more. APA 7 lists up to 20. Find where the list is cut to 4.
3. **"Papers that cite this one" always says none found.** It did so for a paper cited 44 times. OpenAlex can return citing papers through a different query, so this is fixable.
4. **A better capture, from OJ's comments.** Add a box inside the app where you paste a link, DOI or PubMed id and the app fetches the details. Consider a NotebookLM-style "find sources" search in the same place. Keep the bookmark as an extra, not the main way.
5. **The capture landing page, from OJ's comments.** When the bookmark opens the app, show a focused screen such as "Adding <title> to <project>" before the passphrase, not the blank workspace.
6. **The capture copy and layout, from OJ's comments.** Rewrite the description and tidy the button.
7. **The idea check's wording.** Each line starts with the word "Area:" instead of naming the area. This comes from v1's prompt. Propose the fix to Dr. Sharma.
8. **Boxes look empty while loading.** The idea boxes are blank for a few seconds when you return to them. Show a loading sign.
9. **The version pill reads "Version dev".** It should show the build number.
10. **Opening a tool moves the stage guide.** For example, opening the Citation Manager shows "Stage 5 of 6 · Writing". Check that this matches v1 and doesn't change the project's real stage.
11. **The CSV download is hard to find.** OJ couldn't see "Download this list (.csv)": it sits below every result card. Put it next to the results count and the sort control.
12. **Search noise.** An "exam anxiety" search returned a stroke rehabilitation trial from PubMed. Check how the related terms join the PubMed query, which may be too loose.
13. **The capture leaves a second app tab open.** OJ then worked in that tab, which had no search results, and "Download this list" said there was nothing to download. After a capture, close the capture tab or send the student back to their first tab. The same root cause as fix 4.
14. **The shelf's copy is now false, and it is a privacy claim.** It says the text is kept "on this computer", that "nothing is uploaded", and that "clearing your browser data erases the shelf". In v2 the shelf's text is kept in the vault on the server (register D-S2-14). The copy is v1's and must be rewritten: the PDF stays on the computer, its text is locked in your vault and kept with your account.
15. **The shelf names a paper by its first line of text.** Here that came out as "1 Scientific Repo R t S | (2019) 9:13317 | https://doi.org/…", which is garbage. Use the DOI on the page to look up the real title, or match it to the library.
16. **The Reading shelf is hard to find.** OJ had to search the page for "reading" to find its button in the Research panel.

## OJ's overall comment (2026-10-20, during step 7)

"This is all so confusing and not designed well from UX, UI and copy perspective as a workflow. Everything is all over the place."

Claude's read: the parity rule copies v1's screens and copy faithfully, so the walk is checking v1's design, and v1 was not designed as one workflow. The faults are not one-off bugs. The Idea-to-Literature journey needs a design pass as a whole: where things live, what each screen says, and how a student moves from one tool to the next. This needs OJ's decision on how far to depart from v1.

## OJ's decision (2026-10-20)

"Keep v1 parity for what the tools do, drop it for layout, flow and wording. Finish steps 7 to 12 now (you drive, I do the file and passphrase parts), then plan a design pass on the whole Idea-to-Literature journey before anything goes to Dr. Sharma. Stage 3 waits."
17. **Highlights fail in the natural order (step 7 FAILED).** Select a passage, click the note box, type a note, press save: the toast says "Select some text on the page first", because clicking the note box clears the selection. It works only if the note is typed before selecting. Fix: hold the selection when it is made (on mouseup) and show it ("Selected: …") above the note box. Check v1, which may have the same bug.
18. **The AI summary missed the paper's limitations.** It said "Limitations: Not reported" for a paper that discusses them. Check how much of the paper's text the summary is sent; it may read only the start.
19. **The matrix's cells have no labels.** A screen reader can't tell which paper or column a box belongs to.

Step 7 detail: PDF added (6 pages) ✓; summary greyed until two own lines ✓, then Aim/Method/Key findings/Limitations + the compare warning ✓; matrix cell kept ✓; Papers shows "6 pages · 2 highlights" ✓; highlight saved only when the note is written first (fault 17); reading_matrix.csv download left to OJ.
- Fault 2's root cause, found in search-results.csv: search results keep only the first 4 authors plus "et al.". The library entry is built from that, so APA references lose authors. Fix it in the search mapping by keeping every author.
- Files checked by Claude: search-results.csv (14 papers, quick-read columns filled for the two read) ✓; reading_matrix.csv (OJ's cell; paper named by its garbage first line, fault 15) ✓.

## OJ's comment on AI quality and MCP (2026-10-20)

"The AI summary and use of AI has to be exceptionally well and very optimized as well for the students. Same for the MCP route, which I don't think is there yet or tested."

Status: the MCP route (the copilot door: a student's own Claude or ChatGPT reaching Appuscholar through MCP) is NOT built. It is stage 5 in PROGRAMME.md. The design pass must include an AI-quality track: for each AI feature, a small set of real papers and questions, the expected good answer, and a check that the answer is grounded (summaries that miss limitations, idea lines that don't name the area, and so on).
20. **Analyse a paper: a race swaps the paper silently.** Choosing the shelf paper, then pressing "Try a practice paper" straight away, left the shelf paper loaded: its slower vault load finished last and replaced the practice paper with no notice. The next answer was about the wrong paper. Fix: ignore a load that a later choice has replaced, and always show which paper the answer is about.
21. **Typo on screen:** "Check what Appuscholer read" in Analyse a paper.
- Good, from real use: Ask on the real shelf paper (Schaefer 2019) gave a correct answer with three quotations, each "✓ found in the paper, page 2", and said which 11 of 24 passages were read.
22. **The paper card's copy is false too.** It says "it saves as you type, in this browser"; the card is kept in the vault (D-S2-16). Same family as fault 14: sweep every v1 sentence that says "this browser" or "this computer".
23. **Buttons for features that don't exist.** "📚 All lectures" and "🎓 Lesson on this paper" only toast "arrive in a later phase". In the redesign, hide what isn't built.

Step 8: PASSED apart from fault 20. Practice paper: Ask answered with three quotations "✓ found in the paper, page 2 (Method)"; numbers "✓ t(58) = 2.36, p = .022" and "✓ r(58) = .31, p = .016", each "consistent with what is printed."; reference check "The reference list prints no DOIs…"; walk-through "Stage 1 of 12: Research gap and aim", "Try first.", quotations, "Judge this yourself", "Check yourself.", suggested answer only on request; card "My words:"; lecture and lesson toasts as the sheet says.
24. **The cards table's copy is false and points nowhere.** "Cards live in this browser; back them up in Settings, Backup." The cards are in the vault, and there is no "Settings, Backup". Same sweep as faults 14 and 22.
Step 9: PASSED in the app (one row for the practice paper; ticking Strengths adds the column with OJ's words). paper_cards.csv download left to OJ.

## OJ's comment on the workflow (2026-10-20, after step 9)

"So many downloads, with [no] clarity on each section, the direction and workflow has confused me. Everything has to have purpose, affordance, clarity and order with workflow."

For the design pass: each screen states its purpose; each control looks like what it does; the journey has one visible order (idea → search → read → compare → write); downloads are gathered into one clear "export" place instead of a CSV button in every tool.
25. **Helpers vanish after use.** After a Research helper runs, the panel jumps to the AI suggestion tab and the helper buttons are gone; the student must reopen Research helpers for each one. Keep the result beside the tool.
26. **AI quality, research gap:** one "gap" was that the papers used randomised trials and so need "alternative methodologies", which is not a gap. The gaps name "Paper 1" and "Paper 2" instead of authors. For the AI-quality track.
Step 10: PASSED. "💜 Reading 2 abstracts and drafting…"; draft cites only Putwain (2008) and Schaefer et al. (2019); Tab inserts it as AI text; gap shown, Dismiss leaves the document unchanged; the literature review helper gives advice on the paragraph; Challenge my argument gives four numbered weaknesses quoting the paragraph.
27. **The Crossref check passes a source with no author.** The authorless PubMed capture was "✓ Found in Crossref and the details match". Crossref has the authors, so the check should flag the gap and offer to fill it.
28. **References are incomplete for APA.** The inserted list prints "Author. (2011)…" for the capture, and journal references carry no volume, issue or pages (Schaefer: Scientific Reports, 9, 13317). A student would submit wrong references.
Step 11 so far: retraction check "Checked 3 sources with a DOI for retractions: 0 flagged. 1 without a DOI could not be checked…" (3 not 4, because Putwain has no DOI here); Crossref "Checked 4 sources against Crossref: 2 match, 1 differ, 1 not found…" with "⚠ Year differs. Crossref has: 2013" for Cohen; "Reference list inserted ✓" with four references.
29. **"Next" doesn't move the project's stage.** After "Next: Design & Ethics →" the guide shows stage 3, but the project bar and the database still say Idea & Feasibility. Check what v1 does; a student expects the project to move.

## Decision for OJ: readable project titles

The vault design (2026-10-16) keeps project and document titles, field, stage and dates readable on the server, so lists work before unlock. On the live database this project's title reads "Sleep and exam anxiety". A title can reveal a sensitive topic. The design listed the alternative: encrypt titles and show lists only after unlock. Decide in the design pass.

## OJ's design principle (2026-10-20)

"So if this allows his vision to translate as not a forced waterfall workflow but clearly designed UX with defined stages, so that students can work in parallel on stages and iterate as well, but still keep a clear view of where each project is, etc., that is the right vision for design."

Design pass scope (Claude's recommendation, given to OJ): set the frame for all six stages now, detail stage 2 first, and build stage 3 straight into the new design.
