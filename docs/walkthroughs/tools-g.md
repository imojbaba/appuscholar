# Tools G walk-through: the stage 3 to 6 places and their tabs

Definition of done for session G of the stages 3 to 6 tools plan (`docs/superpowers/plans/2026-10-21-stages-3-6-tools.md`): the four later stages (Design and ethics, Collection and analysis, Writing, Review) are places with their tabs in order, each tab not yet built reads "Not built yet" with "Open my document", the blob kinds and the api allow-list are ready for the tool sessions, and there is no database migration. A student meets each of them on the live site. Tests passing is necessary, not sufficient.
Walked by OJ, in Chrome, on the live site. The same behaviour runs automatically in `apps/web/e2e/tools-g.spec.ts` (rows 1 to 5, with the document closed); row 0 and the live site are this sheet's alone. Keep the two in step.

**Site:** https://appuscholar-web.vercel.app
**You need:**
- **An account with a project** whose idea is saved (the walk account from wave B1 will do), signed in, with its passphrase.
- **A desktop browser** at about 1440 px wide, and the browser's device mode at 375 px wide (row 4).

**Record:** fill the last column for each row with `VERIFIED` or `FAILED` and the date (`YYYY-MM-DD`). Anything FAILED is fixed and re-run before G is called done. Build under test: open **Help** in the header and read the "Version ..." line at its top; write it here: `________`

| # | What | Do | Expect | Result and date |
|---|---|---|---|---|
| 0 | release check | Sign in, press **Help** in the header and read the version under its title. Compare it with the first seven characters of the merge commit that was deployed (`git fetch origin && git rev-parse --short=7 origin/phase-3a-vault`). Then open `<api>/health` in a browser tab, where `<api>` is the live API's address (the one the web app sends its requests to). | "Version <first 7 of the merge commit>". It never reads only "Version", "dev" or a placeholder. `<api>/health` answers `{"ok":true}`. | |
| 1 | places and tabs | Open a project's home. On the Design and ethics row press **Open**. Read the place's top line and its tabs. Go back to the home (the project's name at the top of the place) and do the same for Collection and analysis, Writing and Review. | Design and ethics: the top line reads "<project> / Design and ethics" and the place opens on its first tab, **Overview**, with eight tabs in this order: **Overview**, **Pathway**, **Protocol**, **Ethics and consent**, **Registration**, **Investigator**, **Budget**, **AI-use statement**. Collection and analysis opens on **Statistics** with six tabs: **Statistics**, **Sample size**, **Charts**, **Check numbers**, **Scales**, **Coding**. Writing opens on **Document** with three tabs: **Document**, **My style**, **Words**. Review opens on **Closeness** with three tabs: **Closeness**, **Viva**, **Make PPT**. The open tab is marked (underlined, in purple) and its address ends with the tab. | |
| 2 | not built | With the document closed, open each tab of Design and ethics, Collection and analysis and Review in turn (press the tab, read the page, press the next). Read the tab's body and its last line. | Every tab says "Not built yet. This tool comes in a later release. You can plan it in your document now." with the button **Open my document**, and ends with its own "Suggested next" line, for example Overview "Next: answer the four questions under Pathway to see which approvals usually apply.", Statistics "Next: run the test that fits your data, then put its result in your document.", Viva "Next: make your slides from your document's headings.". The line is the last thing on the page, below the button. Press **Open my document** on any tab: the document opens beside the place, and from then on the later tabs leave the button out. No tab has a button that does nothing. | |
| 3 | writing | Open Writing from the home. Read the tabs. Press **My style**, then **Words**, then **Document**. | The first tab is **Document** and it is the one open: your document is shown with the place. **My style** and **Words** each say "Not built yet. This tool comes in a later release. You can plan it in your document now." with the document still shown with the place, and no **Open my document** button on either (the document is already there). Each ends with its "Suggested next" line: "Next: write your draft in your document, in your own voice." (**My style**) and "Next: when your draft reads well, go to Review and check it before you hand it in." (**Words**). | |
| 4 | phone | At 375 px wide (the browser's device mode): open the Design and ethics place and its last tab, **AI-use statement**; then Collection and analysis; then Writing and Review. | The tabs sit in one line and scroll sideways with a finger or the mouse; the page itself does not scroll sideways. In Design and ethics and in Collection and analysis the line is wider than the screen, and you can scroll to the last tab (**AI-use statement**, **Coding**) and see all of it. Writing and Review show their three tabs, and the last (**Words**, **Make PPT**) is within reach. Every tab is at least 44 px tall. | |
| 5 | home rows | Open the project's home at about 1440 px wide. Read the Design and ethics, Collection and analysis and Review rows. | Each of the three rows reads "Not built yet. You can plan it in your document." with its state "Not started" (until you have marked it) and the button **Open**. Writing's row does not say that: it reads "Draft of <n> words". | |

## Observations

(none yet)

## Sign-off

Walked by: ________  Date: ________  Build: ________

Result: ________
