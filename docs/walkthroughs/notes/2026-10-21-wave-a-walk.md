# Fix wave A live walk, 2026-10-21 (build 99e166a)

Sheet: appuscholar repo docs/walkthroughs/fix-wave-a.md. Account: the 20 October throwaway (key, passphrase and project already set up). Claude drives Chrome; OJ types the passphrase.

| # | Fault | Result | What was seen |
|---|---|---|---|
| 1 | W9 | VERIFIED 2026-10-21 | Pill reads "Version 99e166a", the merge commit of PR 10. |
| 2 | W7 | VERIFIED 2026-10-21 | Five lines start with the area names ("Topic clarity and researchability: High.", "Access to participants or data: Medium.", "Time: Medium.", "Resources and equipment: Low.", "Ethical complexity: Medium."), then "Verdict: Proceed with these modifications". |
| 3 | W8 | partly checked | After unlock the library showed 4 sources, never "0" or "No sources yet". The loading sign lasts under a second; asked OJ what was seen. Opening a panel while locked re-opens the passphrase window, so the locked sentences were not seen. |
| 4 | blob versions | VERIFIED 2026-10-21 | Tab 1 set Timeframe "Two semesters", tab 2 then set Anything else "No sleep-tracking devices; no budget for incentives." without a conflict toast; tab 1 reloaded (never saw tab 2's edit) shows both, topic and resources unchanged. |
| 5 | W12 | VERIFIED 2026-10-21 | PubMed only, "exam anxiety", Randomised trial: 6 papers, every card's text has "exam" and "anxiety"; no stroke or rehabilitation trial. Note (search quality): only 2 of 6 are squarely about test/exam anxiety. |
| 6 | W2, W28 | VERIFIED 2026-10-21 | "+ Citation library" on Vedrenne-Cloquet et al. 2026 (11 authors): library card and inserted reference list name all 11 authors through "& Roux, D." with "23, 19" (volume, pages; PubMed lists no issue). |
| 7 | W3 | VERIFIED 2026-10-21 | OpenAlex, most cited first (Creswell 2016, "Mindfulness Interventions"): "Papers that cite this one (8)" with eight titles. Note (search quality): OpenAlex results for "exam anxiety" + Randomised trial include loosely related papers (a yoga RCT bibliometric study, a mindfulness review); OpenAlex query is v1's, unchanged in wave A. |

OJ, during row 8 (2026-10-21): "This bookmark and drag isn't cool." Also asked "where is citation manager" (findability). Both are wave B items: the paste-a-link/DOI/PubMed box becomes the main path in Find, the bookmark an optional extra (plan B2); Citations becomes a Literature tab (plan B1/B2).
| 8 | W1 | VERIFIED 2026-10-21, with new fault W30 | Re-dragged bookmark on PubMed 31527684 (Claude gave the wrong PMID: it is a geology paper, Sibuet et al. 2019, not the placebo trial). Library card: all 5 authors as "Sibuet, J. C., He, E., Zhao, M., Pang, X., & Klingelhoefer, F." and "Scientific reports, 9(1)". NEW FAULT W30: the year saved as "09/1": the page's date is month-first and v1's capture takes the first four characters. Fix: take the 4-digit year from citation_publication_date / citation_date / citation_year. |
| 9 | W1 | VERIFIED 2026-10-21 | Second capture of the same page: library still holds one Sibuet card (6 sources in all). OJ did not notice the "Already in your library" toast. |
Note: yesterday's Schaefer entry still shows 4 authors and the "Author, 2011" capture still shows "Author" (stored before wave A; no bulk repair in wave A by design; row 10's Fill path repairs one at a time).
Row 10 (in progress): capture question reads 'Add this to your citation library? "State test-anxiety, selective attention and concentration in university students" (no author found) (2014)' as expected. Seen behind it before unlock: "Gemini no key" pill and "No research project yet — working in scratch space" although the account has an OpenAI key and a project (the misleading pre-unlock landing OJ flagged on 20 Oct; wave B "Adding this paper" screen).
| 10 | W27 | VERIFIED 2026-10-21 | Capture link: question "(no author found) (2014)"; Crossref check: card "⚠ First author differs. Crossref has: Fernández-Castillo" and "Missing here: author, volume, issue, pages. Crossref has them."; after Fill (OJ pressed, native confirm): "Fernández-Castillo, A., & Caurcel, M. J. (2014)… International Journal of Psychology, 50(4), 265–271" and "✓ Found in Crossref and the details match." OJ could not find where the Crossref check lives (findability; wave B Citations tab). |
| 11 | W15 | VERIFIED 2026-10-21 | Old garbled entry removed (Claude), PDF s41598-019-49466-6.pdf re-added (OJ): title "Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial". OJ could not find the paper or the shelf among similar-looking boxes (findability; wave B Reading list). |
| 12 | W18 | VERIFIED 2026-10-21 | Summary (about 20 s): Aim, Method (58 students, RCT), Key findings, "Limitations: The sample size was relatively small, classifying the study as a pilot. The trial duration was short, and long-term effects are unknown. The timing of information provided about placebos may have influenced results." Yesterday: "Limitations: Not reported." |
| 13 | W20 | VERIFIED 2026-10-21 | Chose the shelf paper, Use this paper, then at once Try a practice paper: after 5 s the practice paper is still loaded ("3 pages, 5,317 characters read…"); Ask answers with "About: Sleep and exam anxiety in first-year students: a fictional teaching paper" and its 60 students (38 women, 22 men). |
| 14 | W21 | VERIFIED 2026-10-21 | "Check what Appuscholar read"; "Appuscholer" appears nowhere on the page. |
| 15 | W26 | VERIFIED 2026-10-21 | Search "exam anxiety" (13 papers), ticked Hashmat et al. 2008 and Sarıkaya & Gemalmaz 2021, Find a research gap: "Gap 1 (Empirical)" and "Gap 2 (Contextual)", each naming "Hashmat et al. (2008)" and "Sarıkaya and Gemalmaz (2021)"; no "Paper N", no "other methods" gap, no shared strength called a gap. |
| 17 | storage | VERIFIED 2026-10-21 | 8 blobs, every body ciphertext (16-char IV, dot, base64url), key_version 1; no readable idea, title or author in any body. Versions: citations 4, idea_intake 2, refcheck 2, retraction 2, shelf_index 2, shelf_paper 2; ap_cols and ap_notes 0 because they have not been saved since migration 0005 (expected; the sheet's "every row 1 or more" is too strict and should say "every blob saved since the release"). |
| 16 | export | VERIFIED 2026-10-21, with new fault W31 | Zip "Sleep and exam anxiety/stage-data/" holds all 8 stage files (ap_cols, ap_notes, citations, idea_intake with "Two semesters", refcheck_cache, retraction_cache, shelf_index, shelf_paper); index.json lists all 8, none unreadable. NEW FAULT W31 (OJ): about 20 s of silence after "Export all my work" before the save window; no sign that anything is happening (heuristic H1, visibility of status). |

## Result

16 of 17 rows VERIFIED; row 3 partly checked (the loading sign lasts under a second and the locked sentences were not reachable, because opening a panel while locked re-opens the passphrase window; the e2e pins both). Fix wave A is done on the live site, build 99e166a.

New faults found by this walk:
- **W30 (data):** a PubMed capture whose page gives a month-first date saves the year as "09/1" (v1's first-four-characters rule). Fix: take the 4-digit year from citation_publication_date / citation_date / citation_year. Small; recommended as a patch before wave B ships.
- **W31 (status):** Export all my work is silent for about 20 s. Fix: a progress line ("Unlocking 12 of 30…") and a disabled button; belongs with wave B's one export place.

OJ's comments during this walk (wave B evidence): "this bookmark and drag isn't cool"; could not find the Citation Manager, the Crossref check, or the shelf paper "among boxes with similar-looking text"; the capture tab showed "Gemini no key" and "No research project yet" before unlock.

Walked by: OJ with Claude. Date: 2026-10-21. Build: 99e166a.
