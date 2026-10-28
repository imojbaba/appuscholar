# Appuscholar journey redesign: working draft

Started 2026-10-20 after the stage 2 live walk. Status: draft in conversation with OJ, not approved. Sources: the walk notes (`notes/2026-10-20-stage2-live-walk.md`, faults numbered F1 to F29 below), `VISION-VS-BUILD.md`, Dr. Sharma's note, and `DESIGN-SYSTEM.md`.

## 1. OJ's rules for this pass

- **What stays from v1:** v1 parity holds for what the tools do: the engines, prompts and checks.
- **What changes:** layout, flow and wording are redesigned as one workflow.
- **Not a waterfall:** the stages are defined, but students work on several in parallel and go back to iterate. Each project always shows clearly where it stands.
- **Every element earns its place:** it has a purpose, affordance, clarity and order within the workflow. Downloads are not scattered.
- **AI quality is a first-class track.** It covers the tools and the future copilot route (MCP).
- **Scope (Claude's recommendation, given to OJ):** set the frame for all six stages now, and detail stage 2 first. Stage 3 is built straight into the new design.

## 2. Heuristic evaluation of the current build (stage 2, build 6c38396)

Method: Nielsen's ten usability heuristics, scored on today's live walk. Severity runs from 0 (none) to 4 (catastrophe). Every finding names its evidence.

| # | Heuristic | Severity | What the walk showed |
|---|---|---|---|
| H1 | Visibility of system status | 3 | The idea boxes look empty for seconds while the vault loads (F8). The paper being analysed swaps silently (F20). "Next" moves the guide but not the project's stage (F29). There is no sign of how far along a project is. The version pill says "dev" (F9). |
| H2 | Match with the real world | 2 | Tool names come from the system: "Reading shelf", "Matrix", "Pop out", "Quick read". The idea check prints "Area:" instead of the area's name (F7). A PDF's first line becomes its title (F15). |
| H3 | User control and freedom | 2 | Undo exists in the editor. But one choice can silently replace another (F20), and a helper result throws you out of the helper (F25). |
| H4 | Consistency and standards | 3 | Each tool has its own download button. Results sit in a side panel in one place and a modal in another. A "Next" button means different things in different places (F10, F29). Copy on one screen contradicts another about where data lives (F14, F22, F24). |
| H5 | Error prevention | 3 | The capture saves a source with no authors and Crossref calls it a match (F1, F27). References drop authors, volume and pages (F2, F28). Two app tabs can be open on one project (F13). |
| H6 | Recognition rather than recall | 4 | The student has to remember which tab holds the results, where the CSV button is (F11), where the shelf is (F16), and to type a note before selecting (F17). The 14 tools are all visible at once with no sense of which comes next. |
| H7 | Flexibility and efficiency | 2 | The bookmark capture is the only fast path in, and it's clumsy (F4). There's no paste-a-DOI-or-link box, no keyboard flow, and no bulk "keep these papers". |
| H8 | Aesthetic and minimalist design | 3 | Every result card carries seven buttons. Buttons for features that don't exist are shown (F23). The long side panel buries key actions. |
| H9 | Help users recover from errors | 2 | "Select some text on the page first" doesn't say the note box cleared the selection (F17). "Nothing to download" doesn't say the results are in another tab (F13). |
| H10 | Help and documentation | 2 | Help exists, but the copy is v1's and partly false today: it says data stays "in this browser" (F14, F22, F24). |

**Worst failures, in order:** H6 (the student must remember too much), H1 (no clear status), H4 and H5 (inconsistency and silent data errors), then H8 (clutter).

**What already works, and must survive the redesign:**
- AI answers quote the paper and check every quotation.
- "Think first, then see the AI" gates are in place.
- The numbers check.
- Everything is locked in the vault.
- Gold marks what the AI wrote.

## 3. The student's first ten minutes (Claude's independent answer, given to OJ)

1. **Arrive.** One question: "What do you want to study?"
2. **Sharpen.** Three short questions, then a plain feasibility read with one fix per weakness. The result is a project card (question, people, limits), pinned on every screen.
3. **Find.** The search runs from the card. Ten strong papers, each with a one-line reason, badges, and editable term chips.
4. **Keep.** One main action per paper: Keep. The rest goes in a menu.
5. **Read.** Kept papers form a reading list, each opening one reader with tabs: summary after thinking first, questions, numbers check, highlights. Open-access PDFs come in automatically.
6. **Next step.** There is always one suggested next step. Saving is automatic, and export lives in one place.


## 4. Claude design (first take, 2026-10-20)

Canvas: https://claude.ai/artifact/RHiGvf9Vd5AhY8K5xKkfsE (private to OJ). Four screens: project home, first run, find papers, read a paper. Google Stitch was dropped by OJ on 2026-10-20 ("we can save time and tokens by taking the design route from your Claude designs; Stitch feels over-engineering"). The Claude design is the design route.

## 5. The frame for all six stages

**The model: stages are places, not steps.** A project has six stages: Idea, Literature, Design and ethics, Collection and analysis, Writing, Review. Every stage is open from day one. Each has its own state, which comes from the work in it:

| State | Meaning | Comes from |
|---|---|---|
| Not started | Nothing in it yet | No items |
| Started early | Work exists before the stages that usually come first | Items exist while an earlier stage has none |
| In progress | Work is under way | Items exist |
| Ready | The student marked it done | The student's "Mark ready" (reversible) |
| Reopened | Was ready; the student changed something | An edit after "Ready" |

This replaces the single "current stage" pointer, which caused fault 29 (the bar and the database disagreed with the guide). The project list shows each project's six states in one line.

**What every screen carries:**
- The project name, linking home.
- The vault state ("Locked to you").
- The AI key state, in gold.
- Help.

The question card shows on the project home and as a collapsible strip in each stage.

**Inside a stage:**
- The stage's own tabs show its parts in their usual order. They are not locked.
- One main action per item. Everything else goes in a "More" menu.
- A "Suggested next" line at the bottom of each tab.

**The document:**
- The thesis document is the Writing stage.
- It can also open beside any stage, so a student can read and write at once. This keeps v1's main use, writing with a tool beside the document, without making the editor the whole app.

**One export place.** "Export project" on the home screen and in the account menu. It offers the document (Word, LaTeX), references, the search list, reading notes, the comparison table and paper cards. Tools keep a small "Export" link that opens the same place, pre-selected.

**Attention, not toasts.** Data problems such as missing authors, missing volume or pages, retractions and failed numbers checks go to a "Needs your attention" list on the home screen and beside the item. They are written as a sentence with a fix. Toasts are only for "Saved" and "Inserted".

## 6. Stage 2 in the new frame: where each v1 tool lives

Parity of behaviour holds; only the place and the words change.

| v1 tool or part | New home | Notes |
|---|---|---|
| Idea and Feasibility | First run, then Idea stage (reopen) | Three questions plus the feasibility read; the read names each area (fault 7) |
| Research: search, related terms, filters, sort, quick read, connected papers | Literature, Find | One "Keep" per paper (adds to the library and the reading list); quick read and connected papers in "More" |
| Add a paper you found elsewhere; one-click capture | Literature, Find: "Paste a link, DOI or PubMed number" | Looks the paper up (Crossref, PubMed) and keeps it; the bookmark stays as an extra, opening a focused "Adding this paper" screen (faults 1, 4, 5, 6, 13) |
| Reading shelf | Literature, Reading list | Kept papers with or without a PDF; "Add your own PDF"; titles from the paper's metadata, not its first line (fault 15) |
| Analyse a paper (ask, numbers, references, walk-through, paper card) | Reader tabs: Your take first, Ask, Check numbers, Walk-through, Card | One paper at a time, named at the top of every answer (fault 20) |
| Shelf highlights | Reader: select, then a bar that holds the selection while you type (fault 17) | |
| Matrix; paper cards side by side | Literature, Compare | One table: rows are papers, columns are your notes and card fields |
| Draft literature review paragraph; find a research gap | Literature, Compare: "Draft from my papers", "Find the gap" | Results stay beside the tool (fault 25); gaps name the authors (fault 26) |
| Research helpers (literature review helper, challenge my argument, and others) | The document: actions on selected text | They work on the student's own writing, so they live where the writing is |
| Citation Manager | Literature, Citations, plus "Cite" in the document | Retraction and Crossref checks feed "Needs your attention"; Crossref fills missing fields with consent (faults 2, 27, 28) |
| Pop-out | Kept: open any stage in its own window | |
| Lectures, lessons | Hidden until built (fault 23) | |

## 7. Copy rules

- Plain words, from the student's side: "Keep", "Reading list", "Compare", "Check numbers". Avoid system words like "Matrix", "Shelf", "Quick read" and "Pop out".
- Honest about where data lives. Every sentence that says "this browser" or "this computer" is rewritten (faults 14, 22, 24). The standard line: "Saved to your account, locked with your passphrase. Only you can read it."
- No emoji in the interface. Icons come from one icon set. Dr. Sharma's emoji were part of v1's identity, so this is a decision for him.
- AI output always carries a gold edge and a label that says what it is and what to check, for example "AI summary from the whole paper. Compare it with your two lines."
- No em-dashes, no numbered stage labels, no capitals for labels.
- Hindi follows the English rewrite. Dr. Sharma's 701 Hindi strings need re-mapping, which is a cost to plan.

## 8. AI quality track (OJ, 2026-10-20)

For every AI feature in stage 2:
- A small test set of 3 to 5 real papers or ideas.
- A written description of a good answer.
- A grounding check: quotations found in the paper, numbers from code.

Known weak spots to start with:
- The idea read names no areas.
- The summary misses limitations, probably because it reads only the start of the paper.
- Weak gaps.
- Authors and references incomplete.

The same test sets later serve the MCP copilot route, so it is held to the same bar.

## 9. Heuristic check of the new frame (against section 2)

| Heuristic | Was | Redesign answer |
|---|---|---|
| H1 Status | 3 | Six stage states on home; one paper named per answer; loading shows a skeleton, not empty boxes |
| H6 Recognition | 4 | Stages as places with tabs in a usual order; one main action per item; suggested next step; one export place |
| H4 Consistency | 3 | One pattern per kind of thing: lists, readers, attention items, AI output |
| H5 Error prevention | 3 | Lookups fill metadata; problems surface on home with fixes; one tab per project |
| H8 Minimalism | 3 | Seven buttons per card become one plus "More"; unbuilt features hidden |

Re-score after the first build of the frame.

## 10. Faults: what the redesign removes, what stays a bug fix

- **Removed by the redesign (15, plus the capture flow in fault 1):** 4, 5, 6, 10, 11, 13, 14, 16, 17, 19, 22, 23, 24, 25, 29.
- **Bug or data fixes needed either way (14):** 1 (read citation_authors), 2 (keep every author), 3 (citing papers), 7 (prompt wording), 8 (loading state), 9 (version pill), 12 (search noise), 15 (titles), 18 (summary reads the whole paper), 20 (load race), 21 (typo), 26 (gap quality), 27 and 28 (Crossref fill, full references).

## 11. Decisions for OJ

1. **Approve the frame.** Stages are places with states, the document can open beside any stage, and there is one export place.
2. **Emoji.** Drop them from the interface. Dr. Sharma is the final word.
3. **Readable project titles.** Lock titles in the vault (lists show after unlock) or keep them readable. Recommendation: lock them.
4. **Order of work.** Recommendation: the bug fixes in section 10 first, since they're small and make the current build honest. Then build the frame and stage 2 in it, re-walk live, then stage 3 straight into the frame.

## 12. OJ's decisions (2026-10-20)

All four accepted as recommended ("go on these with your recommendations... make sure we don't make silly mistakes or omit or not see chain of cause and effect during the redesign"):
1. **The frame is approved:** stages as places, the document beside any stage, one export place.
2. **Emoji are dropped** from the interface, pending Dr. Sharma's word.
3. **Project titles are locked** in the vault.
4. **Order of work:** the 14 bug fixes first, then the frame with stage 2, then a live re-walk, then stage 3 into the frame.

The cause-and-effect map for every change is in `2026-10-20-impact-map.md`. Each plan cites it.

## 13. What the cause-and-effect map added (2026-10-20, `2026-10-20-impact-map.md`)

**Moved into the fix wave, because they hurt today:**
- **Export misses all stage data.** The account export (`apps/web/lib/vault/export.ts:57-88`) holds documents and the writing record only. Idea, library, shelf text, notes and cards are missing. This is a data-rights (DPDP) gap. The one export place must include every stage blob.
- **Blob saves overwrite each other.** `PUT /projects/:id/blobs/:kind` replaces the value with no version check (`apps/api/src/routes/blobs.ts:39-58`). The pop-out and a second tab can lose edits. Add a version or ETag check, and on conflict re-read and merge, or ask.

**Requirements for the frame (wave B), missing from sections 5 and 6:**
- A stable paper id across library, reading list, notes and cards, with a migration from position, title and random ids (`core/analyse.ts:72` keys notes by title plus length). This must exist before Keep, Compare and reader tabs, and before titles change (fault 15).
- `project.stage` is never updated and six places read it. Stage states need storage: "Mark ready" and "Reopened" need a home. The project list needs all six states without one request per project. All readers switch in one release.
- What a project opens on, and how Insert works when no document is open.
- **Locking titles (D3):** projects have no data key (`schema.ts:44-54`); the 200-character title limit rejects ciphertext; the vault migration is closed for accounts already complete; vault-off accounts keep plaintext. Breakage is client-side, in about 15 screens plus file names and the v1 import. Document titles leak too: source documents are named after the PDF file. Decide the design before the project home is built.
- **CSP:** the paste-a-link box and auto-fetched PDFs need new hosts in connect-src.
- **Selection limit:** the selection bubble takes at most 800 characters, but the helpers take up to 12,000. Moving helpers into the document needs a selection model that carries long selections.
- **Pop-out:** its write limits need redesigning if any stage can pop out.
- **AI quality track:** needs a harness (test sets plus a runner), not just a list.
- **AI-use log:** labels come from the prompt's opening words (`core/aiuse.ts`). Rewording prompts (faults 7, 18, 26) must keep the labels stable, or migrate them knowingly.
- **Whole-paper summary (fault 18):** hits the 60,000-character prompt cap (`apps/api/src/routes/ai.ts:16`) and costs 2 to 3 times the tokens. Use the existing passage retrieval (as Ask does), not the whole text.
- **Register:** every copy change needs a deviation row for Dr. Sharma. New rows start at D-S2-22, because fault numbers collide with existing ids.
- **Hindi:** the code has 1,131 keys, 366 of them English copies. Plan the Hindi re-map from that count, not 701.
- **CI:** the e2e job does not block merges. Make it required.
- **Deploy order for any storage change:** database migration by hand, then the API, then the web.
