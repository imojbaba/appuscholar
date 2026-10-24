# QA layer: design

Date: 2026-10-24. Branch `qa-layer` off `phase-3a-vault` (f25f9e6). Written with OJ through the main session (OJ's words are quoted; everything else marked "my call" is open to OJ's change).

## 1. Why

The 2026-10-23 live walk passed 69 of 74 rows, and its faults were all situations no test had tried: the network dropping and coming back (F2), a line break inside a tagged passage (F3), a slow read with stale buttons (F4), a locked vault (F5), realistic open-answer data (F1). The app has about 2,156 web unit tests, about 5,000 golden checks against v1 and 21 browser journeys. Those prove each piece works the way its developer meant. They do not prove that a student who finishes a real piece of work gets the right outcome.

OJ asked for a QA layer and set its purpose (2026-10-24):

> "I need to have a qa run report with user stories, test cases passed with qualified type of each pass or fail item, like bug-- ui, error, unhandled use case that may not break things but is unexpected result."

> "For a simple form a qa/dev will run unit tests to find exceptions, bugs on all fields automated … but a qa will also check the expected outcome of the filled form as the right data, visually and conceptually even if there was not a tech issue. We don't want to have to run all form test cases by entering all right and wrong combinations in this pass … that should have been done by the developer and unit test … we want to do the later."

So this layer is the QA person who comes after the developer. A student completes a real piece of work with realistic data, and the layer checks that the **outcome** is right in data, looks and meaning, in the situations a student really meets.

## 2. Goals, non-goals, anti-goals

**Goals**
- A report per run, by user story. Each story lists its test cases, and each case says PASS or the kind of failure (§7).
- Every outcome checked three ways (§4): **Data**, **Visual** and **Conceptual**.
- Each story tried in the situations that can change its outcome (§6), chosen by reasoning about the story, not by working through combinations.
- Every fault and observation of the 2026-10-23 walk (F1–F5, O1–O24) has a case (§9).
- It runs on the same code that goes live, built the way production builds it (§10).
- Merged with CI green on the current build, with known faults marked as such.

**Non-goals**
- Re-testing every right and wrong value of every field. That is the unit tests' job (OJ's correction). When QA finds an input fault, the fix PR adds the unit test.
- Re-checking the engines' numbers. The goldens own them; QA spot-checks one number per result against core.
- Judging prose: how screens look to a person, the wording, the quality of the Hindi, the AI's writing. These stay with the hand walk. QA puts a screenshot of every outcome in the report so a person can glance at them.
- Signing in on the real live site (§10.2).
- Replacing the existing 21 browser journeys (`apps/web/e2e/`). They stay as they are: the developers' check on every PR.

**Anti-goals** (a failure even if it works)
- A suite that is green while students hit faults. A case that cannot check its outcome must say NOT CHECKED, never PASS.
- A flaky suite that people learn to ignore. A case that fails without a product fault is fixed or removed the same day.
- Any real credential or student data in the suite, the CI logs or the report.
- Any change to product code from this branch.

## 3. What a case is

- **Story:** a student's goal, in their words. Example: "I analyse my survey and put the result in my thesis."
- **Case:** one run of a story's path in one situation, or one focused regression. Example: "S5-04 survey with open answers, on a phone, in Hindi."
- **Check:** one expected outcome inside a case, of one kind (Data, Visual or Conceptual). A case holds many checks, and a failed check does not stop the case; the case carries on and every failed check is reported.

Cases are named `S<story>-<nn>`, regressions also carry their fault id (`S6-05 [F3]`).

## 4. The three kinds of outcome check

| Kind | Question it answers | How it is checked | Examples |
|---|---|---|---|
| **Data** | Did the right data come out, and does it stay? | The document's text read from the editor; downloaded files caught and opened (zips unpacked) in the test; the same outcome after a reload and in a second browser on the same account; numbers compared with core's own function on the same input, never retyped; the server's stored copies are ciphertext, searched for the case's marker strings | The t-test sentence in the document matches core's result for the data; the coded-passages file keeps "were long and quiet" (F3); the project zip holds every part the export window listed |
| **Visual** | Does it look right? | Layout rules measured in the page at each checkpoint (§8); axe accessibility scan; chart rules read from the drawn chart; a screenshot of every checkpoint for the report | Nothing past the edge at 375 px; buttons at least 44 px on a phone (O17); bar axis starts at zero (rule 14); no Hindi cut off |
| **Conceptual** | Does it make sense and is it honest, even though nothing broke? | Rules of the domain written per story, taken from the walk sheets' "Expect" columns, the plans' Review Focus, the register (`parity-deviations.md`) and Dr. Sharma's rules | A consent form for under-18s asks for a guardian and the child's agreement (O1); the AI-use statement never says "no AI" when the log has requests; open answers are not called names (F1); a locked vault is called locked, not "too short" (F5); Ethics never says "exempt" |

**Cross-tool outcomes** are where QA earns its keep, because no single tool's tests see them. Each story checks that its outcome shows up correctly in the other places that use it. Examples: an AI request appears in the AI-use statement; an inserted result shows Current in Check numbers and Out of date after the data changes; a tagged passage appears in the passages view, the Markdown export and the project zip; the home's six stage states follow the work done.

## 5. The stories

Each story is a complete piece of work. The plan writes each story's cases and checks from the walk sheet named beside it (its "Expect" column is the source of truth for wording and data), and from the plan's Review Focus items that describe an outcome. Review Focus items about input handling stay with the unit tests.

| # | Story (the student's goal) | Places | Source sheets |
|---|---|---|---|
| S0 | "I take one project from idea to export." The whole journey, with the outcome of each stage carried into the next | all six stages, export | all below |
| S1 | "I start: account, key, vault, my idea checked, my project made" | first run, home | `stage-2.md` row 1, `wave-b1.md` rows 2–6 |
| S2 | "I find, read and cite the literature" | Literature (Find, Reading list, Compare, Citations), pop-out | `stage-2.md`, `fix-wave-a.md`, `wave-b1.md` rows 10–13 |
| S3 | "I plan my study and get the ethics paperwork ready" | Design and ethics, all eight tabs | `tools-a.md` |
| S4 | "I list my participants and keep their names out of my data" | Participants (Collection) and its links into Design, Statistics, documents and AI requests | the Participants walk sheet, when its PR merges |
| S5 | "I analyse my survey and report the result in my thesis" | Collection: Data, Run, Explain, Check numbers, Guide, Power, Charts, Scales | `tools-b.md` |
| S6 | "I code my interviews and export the coded passages" | Collection: Coding, across two documents | `tools-c.md` |
| S7 | "I write in my own voice and clean up my writing" | Writing: document, My style, Words, Continue Writing, Research helpers | `tools-d.md`, `phase-2.md` |
| S8 | "I check my draft before I submit" | Review: Closeness, Viva, Make PPT | `tools-e.md` |
| S9 | "I take my work out" | project export, Export all my work, AI-use statement, account deletion | `wave-b1.md` row 12, `phase-3a.md` rows 8–9 |
| S10 | "I keep my work private and safe" | vault: set up, lock, forget on this computer, remember, second tab, second browser, change passphrase, recovery | `phase-3a.md` |
| S11 | "I keep two projects apart" | a second project: nothing of the first shows in it | `wave-b1.md` row 5, `tools-a.md` row 12, `tools-e.md` rows 6 and 16 |

S4 is written from its walk sheet once the Participants PR merges. Until then it is listed as NOT RUN.

## 6. Situations: tried where they can change the outcome

The situations OJ agreed in principle: vault off / open / locked / forgotten on this computer; network fine / drops and comes back / slow; desktop 1440 px / phone 375 px; English / Hindi; data empty / huge / messy; AI answering / failing / slow, plus a small live-AI set.

Each story runs once in the **plain situation** (vault open, network fine, desktop, English, realistic data, AI answering). Each other situation is added only where it can change that story's outcome. The reason is written beside each mark, and the plan keeps these reasons with the cases.

| Story | Vault locked or forgotten | Network drops and returns | Slow network | Phone + Hindi | Huge or messy data | AI fails or is slow |
|---|---|---|---|---|---|---|
| S0 | covered by each story | once, mid-journey | | one run (plus one desktop Hindi run) | | |
| S1 | (no vault yet; S10 has set-up) | | "Save as my project" shows progress (O3) | yes | | idea check fails, then retried |
| S2 | adding to the library while locked asks once, then saves | one source failing keeps the other's results | | yes | a 2,000-source reference list | quick read fails |
| S3 | each tab says locked, nothing typed is lost | the budget typed while offline is saved after | keystrokes while a tab opens are not lost (O7) | yes | | |
| S4 | per its sheet | per its sheet | | yes | Devanagari spellings, shared names | the names dialog before an AI request |
| S5 | the data tab and Check numbers while locked | Explain while offline | | yes | 20,000 rows; ragged rows; open answers with and without commas (F1) | Explain fails or is slow |
| S6 | codes locked, then back after unlock | deleting a code while offline (`tools-c.md` row 12) | | yes, tagging by touch | a passage across a line break (F3), quotes, accents | |
| S7 | typing while locked | typing while offline is saved when it returns | | yes | a 50,000-word document stays usable | grammar and Continue Writing fail |
| S8 | Closeness and Make PPT say locked (F5) | | the old slides cleared while reading (F4) | yes | 50,000 words against 20 shelf papers (O19) | Viva fails |
| S9 | export while locked | export while offline, then retried | export progress (O10) | yes | a project with every part filled | |
| S10 | the core of the story | the pill stays right after the network returns (F2) | | yes | | |
| S11 | | | | | | |

"Phone + Hindi" is one run, because Devanagari is taller and longer, so a phone in Hindi is the hardest case for layout. Hindi checks do not depend on width. (My call, a pairing by risk.)

**How each situation is made** (builder's detail, stated so the plan can be checked against it):
- Vault states: set up through the vault window with a generated test passphrase; "locked" by cancelling the unlock after a reload; "forgotten" by "Forget on this computer" then a reload. Never a real passphrase.
- Network: Playwright's offline switch, which also fires the browser's `offline` and `online` events; slow by delaying the API's answers (e.g. 3 s) in the test.
- Phone: a 375 × 812 window with touch and a phone user agent.
- AI: the request goes through our API as it does live, and only the **provider** (Groq, OpenAI, Anthropic, Gemini …) is faked. A test-only script loaded when the API starts (`node --import <shim> dist/index.js`) answers the API's outgoing requests to the provider addresses. It uses recorded replies chosen by the prompt's opening words; fails the way the provider fails (an error status, a rate limit, a bad key, no answer); or answers after a delay for "slow". So the API's own code runs as built: the names check, the error messages, the fallback and the AI-use log (`appendAiUse`, `apps/api/src/routes/ai.ts`). That lets the cross-tool AI checks be real: a request shows up in the AI-use statement and in the writing record. (My call, after the builder check: faking in the browser, as the existing e2e specs do, would leave the AI-use log empty and those checks NOT CHECKED. The product's built code is unchanged; only the outside world is simulated, as OpenAlex is below. The release run's live-AI cases start the API without the script.)
- Outside services (OpenAlex, PubMed, Crossref, dictionaryapi.dev): answered from recordings. Any other address outside the test machine is refused and counted as an Error.
- Data: a fixture library of realistic, invented data (§11).

## 7. The marks

Each case gets one mark. A failing case lists every failed check, each with its own kind of failure.

| Mark | Meaning |
|---|---|
| **PASS** | every check met |
| **FAIL: UI** | a Visual check failed: looks or lays out wrong |
| **FAIL: Error** | something broke: a script error in the page, a failed request to our server, an unexpected reload, an error shown for an action that should have worked, a button that does nothing, a browser pop-up nobody expected, a request to a website the case did not allow, a blocked security rule (CSP) |
| **FAIL: Unexpected** | nothing broke, but a Data or Conceptual check failed: the wrong result, or a situation not handled (OJ's "unhandled use case") |
| **FAIL: Slow** | it worked but took longer than its time budget (§8) |
| **KNOWN FAULT** | fails as recorded under a fault id, waiting for a fix; does not turn CI red |
| **FIXED?** | a known fault now passes; someone should close it |
| **AWAITING DECISION** | the right outcome is OJ's or Dr. Sharma's call; the case records what happens |
| **BLOCKED** | the case could not go on: an outside service is down, a sign-in wall, or an earlier step failed so that the rest of the path cannot be reached |
| **NOT RUN** | the story is not built yet (S4 before the Participants merge) |

CI turns red only on a FAIL. The type of each check is written in the test, so the report sorts every failure without a person.

**A case never stops silently** (OJ, 2026-10-24: "the qa then should end at the login page or the blocked page if it can't"). A case goes as far as a student could go. When it cannot continue, it ends on the page that stopped it. The report then names that page and the step, shows its screenshot, and lists the checks that could not be reached, each marked NOT CHECKED (blocked at step n). A failed check that does not stop the path (a wrong number, say) is recorded, and the case carries on.

## 8. Checks every case gets for free

**The watcher** runs through every case and reports **Error** for:
- an uncaught script error in the page;
- a console error not on a short allow-list, where each entry gives its reason;
- an answer of 500 or more from the web or the API, or a 4xx the case did not expect;
- a request to any host the case did not allow;
- a full page reload the test did not ask for (W45);
- a browser `alert`, `confirm`, `prompt` or "Leave site?" the case did not expect;
- a security-policy (CSP) violation. This matters because the production build is stricter than the development server: production drops `'unsafe-eval'`.

**Layout rules (Visual)**, measured at each checkpoint a case names:
- no sideways page scroll;
- nothing past the window's edge, except inside a box that scrolls;
- no text cut off inside its box;
- no two controls on top of each other;
- on a phone, every control at least 44 px each way (O17);
- in Hindi, no English on the app's own screens (labels, buttons, messages, including text written into components rather than the dictionaries, such as the document toolbar in `FormatBar.tsx`), except the student's own text and the register's listed exceptions (D-S2-1, -2, -3, -18 and the like);
- axe accessibility scan: any serious or critical finding.

**Time budgets (Slow)**, my calls, adjustable:
- a sign of progress within 1 s of any press that takes longer;
- an ordinary action finished within 10 s on test data;
- huge data finished within 30 s, with typing in the page still answering while it runs (no freeze over 1 s).

**A screenshot of every checkpoint** goes into the report, one strip per case, so a person can glance at how the outcomes look.

## 9. The 2026-10-23 faults and observations as cases

Every F and O of `docs/walkthroughs/notes/2026-10-23-tools-walk.md` has a case. Where the right outcome is decided, the case checks it. Where it is not, the case is AWAITING DECISION.

| Id | Case checks | Mark on f25f9e6 (expected) |
|---|---|---|
| F1 | an open-answer column is not called names; Apply keeps the answers | KNOWN FAULT until Participants merges (it fixes F1) |
| F2 | after the network returns the pill and titles stay unlocked; a press works | PASS (fixed in #25) |
| F3 | a passage across a line break keeps a space, in the view, the file and the zip | PASS (fixed) |
| F4 | the old preview and its Download disappear while Generate reads | PASS (fixed) |
| F5 | locked Closeness says the document is locked | PASS (fixed) |
| O1 | under-18 answer → the consent form has a parent's permission and the child's agreement | KNOWN FAULT until Participants merges |
| O2 | "Not ready yet" is not shown while saved work is still opening | KNOWN FAULT |
| O3, O10 | a sign of progress within 1 s; export within its budget | per budget |
| O4, O14 | where the AI requests are said to go | AWAITING DECISION (OJ) |
| O5 | no self-declaration is ticked for the student | AWAITING DECISION (OJ) |
| O6 | the header never says "add your key" for an account that has one | KNOWN FAULT |
| O7 | keystrokes typed while a tab opens are kept, or the boxes cannot be typed in yet | KNOWN FAULT |
| O8 | the eight Design tabs at 1406 px | UI rule; outcome recorded |
| O9, O22 | Hindi wording | hand walk (NOT CHECKED here); the English-left-in-Hindi rule covers the toolbar |
| O11 | a bar axis above the data | AWAITING DECISION (rule 14 vs "Axis from", D-S2-107) |
| O12, O21 | "1 tagged result" (singular); the slides file's type | KNOWN FAULT |
| O13, O16 | the AI's explanation and grammar reason agree with the facts | live-AI set, NOT CHECKED in recorded runs |
| O15 | the dictionary failing does not blame the student's internet | KNOWN FAULT; live-services check marks BLOCKED when the service is down |
| O17 | phone controls at least 44 px | layout rule |
| O18 | a locked vault asks for the passphrase once per opening, not once per sealed item | KNOWN FAULT |
| O19, O24 | 50,000-word check and slide preview within their budgets | per budget |
| O20 | Tab on the Viva tab inserting AI text | AWAITING DECISION (OJ) |
| O23 | after "Forget on this computer", unlocking with Remember ticked means the next reload does not ask | case written; result UNKNOWN until run |

The "expected" column is my reading of the code and the record; the first run decides.

## 10. Where and how it runs

### 10.1 On CI, against a production build

- The web app is built and served the way Vercel builds it (`next build`, then `next start`), and so is the API (`tsup`, then `node dist/index.js`). Both run on one test database, as in production: the CI job's Postgres service with the migrations applied, or the pglite recipe on a Mac (`apps/web/e2e/support/pglite-postgres.mjs`).
- The build carries `GITHUB_SHA`, so the report names the commit it tested.
- **Sign-in.** The password-less test sign-in is switched off in production builds on purpose (`apps/web/lib/e2eAuth.ts`). So the test signs a student in the way the app's own session works: it creates the user row in the test database and writes a session cookie signed with the test `AUTH_SECRET`. Auth.js's own `encode`, with the cookie name `authjs.session-token` as its salt, does this; I've confirmed that by reading `@auth/core`'s `jwt.js`, and the plan's first task proves it on a real build. Product code is not touched. The secret is the CI's dummy test value, never production's.
- Screens are found the way a student finds them: by the words on screen, read from the dictionaries (`messages/*.json`), so EN and HI runs share one script. The `data-testid`s already in the product are used where words are ambiguous. No new test ids (no product change).

### 10.2 Against the real live site: a small check with no sign-in

The robot cannot sign in on the live site: Google sign-in is for people, and real credentials are never typed by a test. So one short job checks the live site from outside, going as far as a visitor can and ending at the sign-in page:
- the API's `/health` answers ok;
- the site's address leads to the sign-in page, which opens with its security headers (CSP without `'unsafe-eval'`, `nosniff`, referrer policy);
- the live build's version, where it can be read without signing in (if it cannot, the report says UNKNOWN);
- the report ends with "stopped at the sign-in page: signed-in checks are the hand walk's".

Signed-in checks on the live site stay in the hand walk with OJ, who types the passphrase.

### 10.3 Live AI and live services (release run only)

- **Live AI:** about six cases send real requests: idea check, statistics Explain, grammar check, Viva question, Continue Writing, a quick read. They check that the answer arrives, has the expected shape (five rated lines for the idea check, a question for Viva) and is shown under its AI label. Conceptual checks of the content are kept to rules a test can state (for example, an explanation of g above 0.8 does not call the effect small: O13). The key is a test key OJ makes, with a small spending cap, stored as a GitHub Actions secret; it never appears in the code, the logs or the report. Without the secret these cases are NOT RUN.
- **Live services:** one search each against the real OpenAlex, PubMed and Crossref, and one dictionary lookup. If a service is down the case is BLOCKED, not FAIL (O15).

### 10.4 How often and how long

| When | What runs | Time (my estimate, to be measured) |
|---|---|---|
| every PR into `phase-3a-vault` | the quick slice: each story's plain run and every F/O regression | 10–15 min |
| every merge into `phase-3a-vault` | the full grid | under 45 min, split across 4 machines |
| a button (`workflow_dispatch`) before each release | the full grid, plus live AI and live services | the same, plus a few minutes |
| after each production deploy (button) | the live-site check of §10.2 | under 1 min |

The repo is public now, so these Linux minutes are free. If it goes private again, a full run would use roughly 60 of the 2,000 free minutes a month (estimate). The full grid would then move to the button only.

Whether the quick slice blocks merging (a required check) is OJ's call; I recommend it does.

## 11. Test data

All data is invented and realistic, in `apps/web/qa/fixtures/`. Each file carries distinctive marker strings, so a leak into a stored copy can be found.
- **Survey:** about 120 rows, with names, villages, ages, Likert items, open answers with and without commas, a few answers in Devanagari, a ragged row, a semicolon version, and a decimal-comma column.
- **Huge:** 20,000 rows and a 50,000-word document, made by the test at run time (not committed).
- **Interviews:** two transcripts with Shift-Enter line breaks, curly and straight quotes, accents, speaker labels and Hindi lines.
- **Thesis draft:** about 3,000 words with headings, a table, a picture, citations and a sentence copied from a shelf paper.
- **Papers:** the existing `e2e/fixtures` PDFs, plus twenty two-page text PDFs that the test makes.
- **Recorded answers:** AI replies for the API's provider script (§6), and OpenAlex, PubMed, Crossref and dictionary responses for the browser-side router, reusing what the existing e2e specs recorded (`e2e/fixtures/recorded/` and the replies inside the specs). The browser-side router never answers `/ai/complete` or `/ai/log`: those go to our API.

## 12. The report

Each run writes `qa-report/` (kept with the CI run as an artifact, and a summary in the job's page):
1. **Header:** commit, date, what ran (slice, full, release), the time it took.
2. **Summary table:** one row per story, with counts of PASS / FAIL: UI / FAIL: Error / FAIL: Unexpected / FAIL: Slow / KNOWN / FIXED? / AWAITING / BLOCKED / NOT RUN.
3. **Per story:** the goal in the student's words, then each case: its situation, its mark, and for each failed check what was expected, what happened, its kind, a screenshot, the step, and the replay (Playwright trace).
4. **Screens:** the screenshot strip of each case.
5. **Not covered:** what this run did not check (§2's non-goals, NOT RUN stories, NOT CHECKED items), so a green report never reads as more than it is.
6. **The fix brief** (`qa-report/fix-brief.md`, §13): the same failures, written for a developer session to act on.

For the full run after Participants is live, I also write OJ the built / tested / usable table, with each line marked VERIFIED / SUPPORTED / BELIEVED / UNKNOWN.

## 13. When a QA case finds a fault: the report becomes the developer's brief

OJ (2026-10-24): "the report is the feedback in to developer session to fix", "but after my say so".

1. **The run writes the fix brief.** One entry per FAIL (and per FIXED?), each standing on its own so that a fresh developer session can act on it without this conversation:
   - case id, story, situation;
   - the steps to reproduce, as a student would do them;
   - what was expected, and where that expectation comes from (sheet row, register row, rule);
   - what happened, and the kind of failure;
   - the evidence (screenshot, trace, the failed check's message);
   - the command that re-runs only this case;
   - the place in the code the case touches, where the case knows it (the tool's folder).
2. **The fault gets an id.** It is recorded in `docs/qa/faults.md` (Q1, Q2 …), and the check is marked KNOWN FAULT with that id until it is fixed.
3. **OJ decides.** The report and the brief go to OJ. Nothing is handed to a developer session until OJ says so, and OJ may pick which faults go and in what order.
4. **A developer session fixes, on OJ's word.** It fixes the fault in its own PR, adds the unit test that pins it, re-runs the case from the brief, and moves the fault in `docs/qa/known.md` from KNOWN FAULT to fixed. This QA branch never changes product code.

## 14. Files

- `apps/web/qa/`: `playwright.qa.config.ts`, `stories/S*.qa.ts` (one file per story), `support/` (session, situations, AI and services router, watcher, layout rules, checks with their kinds, files and zips), `fixtures/`, `reporter.ts` (the report).
- `.github/workflows/qa.yml`: the slice on PRs, the full grid on merges, and the release and live-site buttons.
- `docs/qa/README.md` (how to run it on a Mac with one command, how to read the report), `docs/qa/faults.md`, `docs/qa/known.md` (known faults and awaiting decisions, with ids, read by the reporter).
- New dev dependencies only if needed (for example a zip reader is already in the app: `jszip`).

## 15. Left to the builder

- The exact case list and checks per story, written from the sheets named in §5 (each check names its sheet row or rule).
- Grouping cases into files and sharding them across the 4 machines.
- How a case prepares its account (UI or the API), so long as the screens under test are reached as a student reaches them.
- The console-error allow-list and the reasons for each entry.
- How the layout rules are measured, so long as each rule in §8 is met.

## 16. Calls I made (for OJ to check) and questions open

Calls I made:
- the test signs itself in on the production build with a session it makes in the test database (§10.1);
- AI is faked only at the provider, behind our API, by a test-only start-up script (§6);
- phone and Hindi are tried together, as one run (§6);
- the time budgets of 1 s, 10 s and 30 s, and the 44 px phone rule (§8);
- the marks FIXED? and AWAITING DECISION, alongside OJ's kinds of failure (§7);
- the full grid on every merge while the repo is public (§10.4);
- my reading of "end at the login page or the blocked page if it can't": a case goes as far as it can and ends on the page that stopped it, listing what it could not reach (§7).

Open, for OJ:
1. **Live AI key:** which provider, and when you will create the test key (with a small spending cap) and save it as a GitHub Actions secret. I'll give the exact steps when the release run is built. Until the key exists, the live-AI cases are NOT RUN.
2. **Required check:** should the quick slice block merging a PR when it fails? I recommend yes.

## 17. Done means

1. This design approved by OJ.
2. The suite built, merged into `phase-3a-vault` with CI green on the current build, and known faults marked as such.
3. After the Participants work is merged, deployed and walked live: S4 written, the full run on that commit, and the report to OJ (built / tested / usable, VERIFIED / SUPPORTED / BELIEVED / UNKNOWN, faults with evidence).
