# SDD ledger — plan: docs/superpowers/plans/2026-10-21-wave-b-redesign.md

Tracked in git (not .superpowers/) because the build moved to a cloud session on 2026-10-21. Commit this file after every task, review and ruling. After any context loss, trust this file and `git log` over memory.

## Scope and order (OJ, 2026-10-21)
- OJ: "Accept your eight recommendations for wave B, patch W30 first, and start building slice B1." Then: "build most efficiently and do the work and redesign and all including the tools and libraries etc as intended.. than let me know when we need the mac".
- Build order: B1 (tasks 1-16) → B2 (17-26) → B3 (27-34) → B4 (35-41) → Q (Q1-Q3). Each slice: per-task implementer + task review, a final whole-slice review, one fix wave, a PR into phase-3a-vault with all three CI checks green (checks, e2e, golden-exact).
- Stack, do not wait: when a slice's PR is green, tell OJ the Mac is needed for that slice's release + live walk, then start the next slice on a branch cut from the previous slice's branch (wave-b2 from wave-b1, ...). Releases happen in slice order.

## Needs OJ's Mac (never in the cloud)
- Neon backup, migrations applied by hand (B1 adds 0006), `scripts/deploy-vercel.sh api|web` from the full clone `appuscholar-deploy-clone` (on the Mac at `"/Users/poojadudani/Documents/Claude cowork/Scholarly/appuscholar-deploy-clone"`, quoted: the path has a space; found by OJ 2026-10-21), the version pill check. Production secrets (DATABASE_URL, Vercel token) live only on the Mac; never ask for them in the cloud and never put them in an environment.
- Every live walk: OJ's Chrome, OJ types the passphrase and the AI key. Nothing is "done" until it runs on the live URL and OJ has walked it.
- Release order is always: Neon backup → migration by hand → API → web. Never roll the API back alone after the web ships.

## Facts the cloud session needs
- Branch wave-b1 was cut from fix-w30 (W30 commit cc054e8), not from phase-3a-vault, because PR #11 (W30 → phase-3a-vault) was still in CI. Once #11 merges, wave-b1's PR shows only wave B commits. If #11 is green and unmerged, merging it is allowed (OJ asked for W30 first); deploying it waits for the Mac and ships with the B1 release.
- CI runs on pull_request only, not on a branch push. Open a draft PR wave-b1 → phase-3a-vault early so CI runs.
- v1 source for golden recording and i18n extraction: `git clone https://github.com/srssg74-crypto/appuscholer ../appuscholer && git -C ../appuscholer checkout c8c53735726040c028bd30b6f12ea72c1adf5c0f` (index.html sha256 starts e3ad7404efcc2684). The golden harness reads `../appuscholer/index.html` relative to the repo root's parent. i18n: `node apps/web/scripts/extract-v1-i18n.mjs ../appuscholer/index.html`, overrides in `apps/web/scripts/i18n-overrides.mjs` (V2_STRINGS, PANEL_FIXES).
- Goldens are never edited. New behaviour is a V2 sibling beside the v1 port; new recordings go in v2-manifest.json.
- Every behaviour or copy change gets a row in `docs/superpowers/specs/parity-deviations.md`. Wave B rows start at D-S2-38 (D-S2-37 = W30). Walk faults W1-W31 are never ids. W31 (export silent ~20 s) is fixed by task 13's progress line.
- Design source: `docs/design/2026-10-20-journey-canvas/` (nine .dc.html screens + canvas.json) is the target copy and layout; spec `docs/design/2026-10-20-journey-redesign-draft.md` §5-§13 (§12 = OJ's four decisions) and `docs/design/2026-10-20-impact-map.md`. Evidence: `docs/walkthroughs/notes/`. Wave A ledger (LATER minors): `docs/superpowers/ledgers/2026-10-20-fix-wave-a.md`.
- The superpowers SDD scripts (sdd-workspace, task-brief, review-package) may not exist in the cloud. Without them: extract a task's text with sed into a brief file, and write the review package as `git log --oneline BASE..HEAD; git diff --stat BASE..HEAD; git diff -U10 BASE..HEAD` to one file.

## How to report to OJ
- Brief plain points. Label claims VERIFIED (ran X, got Y) / SUPPORTED / BELIEVED / UNKNOWN. Report at milestones only (a slice's PR green, a blocker, Mac needed). Never offer a "done, everything matched" button; never call a slice done before its live walk.

## Task log
Task 1: complete (controller, inline, 2026-10-21) — branch wave-b1, plan copied with every wave B id shifted +1 (D-S2-37 taken by W30; the plan's Task 1 Step 2 text now says so, do not shift again), Ids bullet appended in parity-deviations.md, canvas (10 files), spec, impact map, walk notes and the wave A ledger copied in. Docs only; no review dispatched.
Pre-flight scan (tasks 2-16): done 2026-10-21 (cloud). VERIFIED: every path the tasks modify, delete or test exists; 0006 is the next free migration (0000-0005 + meta); `BLOB_KINDS` (web `lib/blobs/kinds.ts:8`, api `routes/blobWrite.ts:6`) is exactly Task 4's nine kinds; `PROJECT_STAGES` = `STAGE_ORDER` = idea, lit, design, collect, writing, review; `CIPHERTEXT` (`routes/docWrite.ts:12`), `WrappedDekSchema`, `PHONE_QUERY` (`lib/useMedia.ts:5`), `encryptBody`, `listDocuments(includeDeleted)` and the 60,000 cap (`routes/ai.ts:16`) exist as the plan assumes; the six `project.stage` readers are at the cited lines; v1 clone checks out at e3ad7404efcc2684. Rulings (binding on implementers and reviewers):
- R1 (line drift): `lib/vault/export.ts` refs moved in wave A (`stage` is at :7 and :111, not :6 and :84; Task 5's "62-84" is now ~62-111). Plan line refs are hints; implementers grep.
- R2 (StageKey home): `StageKey` and `STAGE_ORDER` live in `apps/web/lib/tools.ts:3,5`. Task 4 imports them from there; Task 6 keeps them there while removing `STAGE_EMOJI`, `nextStageTool`, `prevStageTool`, `STAGE_FIRST_TOOL`.
- R3 (Task 5 before Task 6): `listOrSeed` is still in `Workspace.tsx:41` during Task 5; Task 5 seals the seed there, and Task 6 moves the sealed version into `ProjectShell`.
- R4 (Task 6 interim places): Tasks 9 and 10 build the real places. Until then Task 6's `StagePlace` hosts today's panels: idea → `IdeaPanel`; lit/* → the current Research, Shelf/Analyse and Cite panels by tab; writing → the document; design, collect, review → a plain "Not built yet" line. `/projects` gets a minimal list, so the switcher and "All projects" work until Task 8 replaces it.
- R5 (Task 6 vs Popout.tsx): `components/popout/Popout.tsx:85` reads `project.stage` and survives until Task 13. Task 6 changes it so it no longer reads the stage (currentStage null or the URL's stage), so `noProjectStage.test.ts` passes. Task 13 deletes the file.
- R6 (Task 6 vs Task 11, `dockShow`): `lib/ai/actions.ts` and `lib/ai/suggestion.tsx` call `dockShow` until Task 11. Task 6 removes the Dock component but keeps `dockShow` on `ProjectValue`: "ai" makes sure the AI pane beside the document is visible, "tools" does nothing. Task 11 removes it as planned.
- R7 (Task 6 extras): `components/workspace/{Header,Subbar}.tsx` are not in the delete list. Task 6 replaces them with `AppHeader`/`PlaceHeader` and deletes them once nothing imports them; `VaultPill.tsx` and `ChromeDialogs` are reused.
- R8 (Task 7 needs Task 9's read): `homeFacts.verdict` comes from `idea_intake.read`, which Task 9 adds. Task 7 therefore takes the `IdeaIntakeSchema.read` field and `lib/frame/ideaRead.ts` (`parseIdeaRead`, with its tests); Task 9 consumes them. `verdict` = `parseIdeaRead(read.text)?.verdict ?? null`.
- R9 (unspecified sources): `HomeFacts.field` = the project's `field`. `list_meta` "Edited {date}" = the newest of `draftEditedAt`, the work blobs' `updatedAt` and `createdAt`.
- R10 (e2e between Tasks 6 and 15): removing the sidebar and the stage intro breaks `stage2-idea-literature`, `phase2-walkthrough`, `phase2-responsive` and `phase3a-vault`, and Tasks 14 and 15 rewrite exactly those. They may stay red from Task 6 until Task 15; each task's ledger line names the specs it leaves red. Any other spec a task breaks, it fixes in the same task (Global Constraints, Tests). PR #12's e2e check is expected red until Task 15, and the slice needs all three checks green before OJ is told.
- R11 (register order): ids are fixed as planned (38 T6, 39 T9, 40 T5, 41 T11, 42 T12, 43 T13, 44 T10); rows sit in the register in id order.
- R12 (title key ids, review risk): Task 5 seals a new project's title under `project:new:<uuid>` and later opens it under `project:<id>`. The task reviewer must check that the vault binds no id into the ciphertext and caches no dek by the temporary id in a way that breaks the later open; a test opens a newly created title by its real id.
- R13 (cloud vs Mac, Task 16): Steps 1-3 run in the cloud (tooling minors, full suites, PR green). Steps 4-8 (backup, migration, deploys, live walk) wait for OJ's Mac. Local e2e in the cloud uses a throwaway Docker postgres on 5433, never a Neon URL.
- R14 (mid-task note from OJ, 2026-10-21): "make sure we don't lose anything and stay on track... don't over engineer the handoff". This ledger plus git stays the only hand-over; no new process. Commit and push the ledger after every task.
W30 release: PR #11 merged into phase-3a-vault as 8dea9f4 (all three checks green). OJ deployed the web only from the Mac deploy clone, 2026-10-21: Vercel aliased appuscholar-web.vercel.app, and the script printed "Expect the header pill: Version 8dea9f4". The API was not redeployed (W30 is web-only: core citcapture plus web capture). Pill check on the live site: OJ, in Chrome (the cloud session's network policy blocks the site). B1's release no longer carries W30.
Task 2: implemented 4726386 (api 239 pass, db 11 pass, typecheck and lint clean, per the implementer); review in progress.
W30 pill: VERIFIED by OJ's screenshot, 2026-10-21: the live header reads "Version 8dea9f4". The Mac was released to sleep.
Task 2: review APPROVE (api 239, db 11, typecheck clean, rerun by the reviewer). Minor 1 fixed by the controller: the memory store's draftEditedAt now skips documents with no revision, matching drizzle's inner join. Minor 2 (a key version stored without a title) and Minor 3 (`routes/documents.ts:33` renames only when the text changes, so a PUT that changes only the key version is skipped) are carried to Task 3: the routes always send title and key version together and compare both. Task 2 complete.
R15 (for Task 9, from OJ's live screenshot 2026-10-21): the live idea read's lines begin with the literal word "Area: High. ..." (the model copies the prompt's placeholder), not "Time: Medium. ...". `parseIdeaRead` must handle a literal "Area" label: keep the regex, and when the area is "Area", show the line without an area name. The walk sheet's row 2 reads "each rated line, then the verdict". Test it with this exact line. Prompts stay unchanged (parity).
CI note (2026-10-21): PR #12's first run (4839be3, docs only) failed e2e after 24 min. A normal e2e run takes about 5 min, and checks and golden-exact passed. The same code passed e2e in PR #11. The next five runs on wave-b1 (ee16e42 to 0e3f57b) passed all three checks. Treated as a one-off hang. The cloud proxy blocks the log download, so the cause is UNKNOWN. If e2e hangs again before Task 6, look into it then (reuseExistingServer, the postgres service health check, Playwright timeouts).
Task 3: complete. Implemented f40dc87; review APPROVE: api 250 pass, web 1054 pass (2 skipped), typecheck clean. Both carried points hold: no key version without a title (400), and the PUT renames on a key version change. Deviations accepted: one `dek` field shared by body and title (Task 5 seals existing titles through PATCH); `?include=other` gives the plain list; ETag not exposed by CORS (no web code reads it). Minors left as they are: project create and patch drop unknown fields rather than 400; a sealed title on a plaintext PUT is unknown-key-version (vault off only); a rename is saved before its revision.
Task 4: complete. Implemented e434cc3; review APPROVE (13 tests; typecheck clean). Open choices accepted: an unreadable time is ignored; a Ready mark with no work counts as started; `Object.hasOwn`. Minor 1 fixed by the controller: Writing's last-work time keeps the newer of a blob time and the draft time. Nits left: an unreadable readyAt counts as no mark (the server never sends one); the "writing" exclusion in started-early gets its test when a Review kind exists.
OJ, 2026-10-21 morning: "Wait for B1 tonight": B1 and the update deck go to Dr. Sharma together today, after B1's release and OJ's live walk. OJ opens the Mac as soon as we are ready. Speed plan: Tasks 5 and 6 in sequence. After 6, the independent tasks run in parallel worktrees, each with its own implementer and review, merged in task order. Reviews are never skipped. The deck (https://claude.ai/artifact/Bevdgw3vQ4AdWb82mujgt5) gets real B1 screenshots before it is sent.
Task 5: implemented 66d8e21 (web 1082 pass, 2 skipped; typecheck and lint clean; i18n regenerates with no diff). The controller found that `renameDocument` sets documents.updatedAt, which Task 2's draftEditedAt read, so a title seal or a rename would reopen a Writing stage marked Ready. Fixed in 7b5b441: draftEditedAt is now the newest revision's createdAt, in both stores, with a contract test (api 252). Review in progress. Task 6 started in parallel in worktree /home/user/wt6, branch wave-b1-t6 from 7b5b441; it merges back into wave-b1 after Task 5's review, rebased onto any fixes the review asks for.
Task 5: complete. Review CHANGES REQUIRED: (1, Important) soft-deleted documents kept plain titles indefinitely, against D3; (2) the readers were not pinned by a test; (3) the rename dialog opened empty while locked. All fixed in 260b4a5:
- PATCH /documents/:id?includeDeleted=1 is accepted for a sealed title only.
- `documentTitlePath` in titles.ts is the one helper.
- titleReaders.test.tsx pins the readers.
- Rename unlocks first.
- D-S2-40 reworded.
Counts: api 255, web 1085 (2 skipped), typecheck and lint clean. The controller checked the API guard (a plain title, or no flag, still gets 404 on a deleted document). Deviations accepted: the vault migration test fakes gained the `deleted` argument; DocumentCard's test uses a plain body so a download can be checked while the title is locked.
Task 6: implemented d61e364 in worktree wt6 (branch wave-b1-t6, pushed as a backup); wave-b1 merged into it as 9c798f2 (ProjectShell uses documentTitlePath; titleReaders.test follows ProjectContext). Counts: web 1085 (2 skipped), api 255, typecheck, lint and build clean; platform.spec passes locally. Review CHANGES REQUIRED:
- (1) Leaving a project through the header skipped the unsaved-changes question, so a failed save could lose text.
- (2) Moving a document into a project was lost with SaveAsProject, and no wave B task restores it.
- Minors: a double active-project write; Undo after a switch; an aria-label; a stale comment; the version shown twice; useAccount mounted twice.
R16 (controller, 2026-10-21): restore "Move to project" in DocBar. It is an existing feature (v1's "Save as research project"), not a new product decision. Noted in D-S2-38.
For Task 16: scripts/deploy-vercel.sh:49 still says "Expect the header pill", but the version now lives in Help. Change the message.
Fix round in progress.
Task 6: complete. Fix round b79c9eb (web 1091): leaving a project asks about unsaved work, through `go`; "Move to project" restored in DocBar (R16), with "New project" going to /start?move=<docId>; one active-project write per switch; Undo after a switch goes through the mounted shell; aria-label restored; one version pill; one export guard. The controller accepted it on its tests.
Merged into wave-b1 in order: wave-b1-t6, wave-b1-t7a (09efb35, logic for tasks 7-9), wave-b1-t12a (cd09d2e, the export library). After the merge one export test failed: its sample idea read had no `at`, which the merged schema requires. The test data was fixed. Merged wave-b1: web 1137 pass (2 skipped), api 255, typecheck, lint and build clean, and i18n regenerates with no diff.
Logic for 7-9 (09efb35):
- `homeFacts(b, draftWords, field, highlightCounts)`: highlights live in the shelf_paper blobs.
- `parseIdeaRead` gives `area: null` for a literal "Area" label (R15).
- The state_sum_* keys are for the UI task to add.
Library for 12 (cd09d2e), to judge in Task 12's review:
- "kept papers" = the citation library until Task 17;
- the AI-use statement covers the whole account;
- some labels inside the export files are plain English;
- an empty part writes no file;
- an unreadable blob is skipped.
Next: Tasks 7, 8, 9 and 10 in parallel worktrees, then 11, 12 (UI) and 13, then 14 and 15.
Task 8: complete. Implemented d7d319f; review CHANGES REQUIRED (Important: at 375 px the buttons squeezed the six bars). The controller fixed it in d45c457: the row's link takes the full width on a phone, and the rs_prefs date test now holds in any time zone. Deviations accepted: Mark complete and Reopen kept; the vault line sits under the heading; the --flag-ink token; NOT_COPY gains the stage ids. Left: no test for Mark complete (minor).
Task 10: complete. Implemented ce060cc; review APPROVE. The controller fixed the wording in d559161: the helpers sit "above" the document; no tool renders StubPanel. Deviations accepted: Open my document goes to Writing until Task 11; the shelf's own backup and restore stay; the analyse.test expectation filters out the v2 Lesson tab, with the golden untouched (golden 7338 pass). StubPanel is dead code apart from one test, left for later cleanup.
Merged into wave-b1: t8 and t10. The i18n blocks were unioned and the dictionaries regenerated (en and hi 1240 keys; a second run gives no diff). Merged suite: web 1149 pass, 1 fail. The failure is citeBib's "2,000 entries under 2 s" timing test, which fails only while 3-4 worktrees run at once and passes alone (6/6). Watch it in CI. Typecheck, lint and build clean.
Task 9: complete. Implemented f0b366d; review APPROVE.
- Controller fixes a05fa25 and 47240d0: Save waits for a running check, Enter included; D-S2-39 names the new waiting line.
- Deviations accepted:
  - Save shows before a check (no AI key needed to start);
  - checkIdea keeps the prompt, temperature, max tokens and label;
  - "Write without a project" is gone from first run (scratch stays reachable from the header).
- For Task 11 after the merge: IdeaPlace's "Put in my document" must use requestInsert and insert_doc_closed, and drop idea_insert_none.
Merged into wave-b1 (ebe8c1e):
- StagePlace takes Task 10's version with IdeaPlace;
- the CSS and i18n blocks are unioned; en and hi have 1260 keys;
- places.test stubs IdeaPlace, as it stubbed IdeaPanel.
Merged suite: web 1165 pass (2 skipped); typecheck, lint and build clean.
Task 7: review CHANGES REQUIRED.
- Major: the home GETs and decrypts every shelf paper on each visit. Fix: cache by version.
- Medium: failed loads spin, or show a false "No question yet".
- Minor: an unparsed read loops "check again".
- Fix round in progress.
Tasks 11, 12 (UI) and 13 are building in parallel worktrees from 615a5aa.
Task 7: complete. Fix round 6f3528a, accepted on its tests (36 home tests; web 1150):
- highlight counts cached by projectId:paperId:version, so a repeat visit makes zero paper reads;
- load errors show Retry;
- an unparsed read counts as checked (`checked`, `readText`, `detail_idea_checked`);
- the Reopened test runs with the device clock 7 hours behind.
Merged into wave-b1 (29c8963):
- D-S2-38 takes Task 7's added sentence;
- the i18n blocks are unioned and `home_places` dropped again; en and hi have 1317 keys.
Merged suite: web 1177 pass, 1 fail. The failure is citeBib's 2-second timing test again (passes alone; three builds were running). Typecheck, lint and build clean.
Tasks 1-10 complete. Next: Tasks 11, 12 and 13 (building), then 14 and 15.
Task 13: complete. Implemented d762f53; review APPROVE.
- Controller fixes 5d6c78f: a pop-out never starts the vault migration; canPopOut removed.
- Deviations accepted: the window keeps its pop-out status in the shell; every fixed blob kind is broadcast (no loops; versions and 409 respected); the Literature window stores shelf columns; no new-window button in Writing.
Merged into wave-b1 (42bf29c): listOrSeed lives in lib/frame/firstDocument.ts since Task 9, so Task 13's guard ("a pop-out never creates a document") moved there.
For the Task 11 merge: hide "Open my document" and DocumentBeside when usePopout() is true; otherwise requestInsert waits for an editor that never mounts in a pop-out.
Task 16 step 1: ce2b91b, merged.
- Playwright's reuseExistingServer is off in CI;
- deploy-vercel.sh exits 6 "cannot reach origin" and ends "Expect Help to show: Version <sha7>";
- deployScript tests don't depend on order (6/6).
Merged suite: web 1170 pass, 1 fail (citeBib timing under a load average of about 15; passes alone). Typecheck, lint and build clean.
Task 11: complete. Implemented e2b741c; review APPROVE with 4 minors. Integrated into wave-b1 (merge d1c229d, integration 82ea2ee):
- in a pop-out, "Open my document" and DocumentBeside are hidden, and requestInsert posts to the main window (a new AI-text message type);
- IdeaPlace uses putAiInDocument;
- the minors are fixed: no insert into a switched document; setThinking doesn't open the document; insertReady removed.
- The integrator had a home insert refused, which the controller changed (13511f3) to the plan's intent: an insert from the home goes to Writing and lands there. D-S2-41 updated.
Task 12: complete. Library cd09d2e, UI 7252e0d; review CHANGES REQUIRED, fixed in 50aa4b7:
- (Important) a project's AI-use statement listed every project's AI use; /ai/log takes ?projectId and the project zip uses it (rows with no project are left out, per D-S2-42);
- unsent edits are saved before the zip (heldBlobs.saveAll), with a warning line if any remain;
- notes are joined by id, or by a unique title match.
Integrated (merge 75063ae, integration f1c014d): Export works in a pop-out (it only reads) and from the home (home_out_soon removed); accountMenuExport test added.
Merged suite: web 1205 pass (2 skipped), api 258; typecheck, lint and build clean; en and hi 1373 keys.
Tasks 1-13 complete. Next: Tasks 14 and 15 in parallel worktrees, each with its own e2e ports.
Whole-slice review of B1 (tasks 1-13 at f80992c): no Critical. Counts: web 1204 (citeBib timing under load), api 258, golden 7338, typecheck clean.
Important:
- (1) An old tab could store ciphertext as a plain title, which sealPlainTitles then seals twice.
- (2) The browser's Back button leaves a project without the unsaved question, so text can be lost.
Near-Important:
- (3) Export ignored a failed document save.
Minors: the NotBuilt dead button; hard-coded English moved from v1 code; register drift.
Noted, not fixed: a web shipped before the API would seal titles against the old API. The release order (migration, then API, then web) prevents it.
Moved or removed versus 8dea9f4 (for the walk notes):
- the stage choice on create;
- the one-card .txt download with its reference-check line;
- one-click downloads now go through Export;
- the provider switch is in the key dialog;
- Research helpers are now in Writing.
One fix wave dispatched on wave-b1.
Fix wave done:
- 98aaf1d: a ciphertext-looking plain title is refused on all 7 request shapes, and sealPlainTitles never seals one twice.
- f408c87: unsaved text survives Back, held in memory only and restored on reopen; Export warns on a failed document save; copy through t(); the register brought up to date.
Counts: api 259, web 1210 (2 skipped); typecheck, lint and build clean.
Task 14: complete. Implemented 72178c9; review CHANGES REQUIRED: (1) focus was lost on the phone's full-screen document; (2) e2e wasn't re-run after the last change. Fix round 6684274:
- focus moves to Back on open and returns on close;
- desktop header items are hidden by CSS at 700 px or less, so a phone never flashes the desktop header;
- scrollTo stubbed in the test;
- e2e frame-responsive 4/4 and platform 2/2 on the final commit (local pglite, ports 5441/8941/3141).
Deviations accepted: the More menu stays on a phone; the language item is in Menu; useMedia returns false without matchMedia.
Merged (ab7fc66): D-S2-38 keeps the fix wave's wording plus Task 14's phone sentence; en and hi 1385 keys. Merged suite: web 1216 pass (2 skipped); typecheck, lint and build clean.
Local e2e needs a config pointing Playwright 1.64 at /opt/pw-browsers/chromium-1194; CI installs its own browser.
Task 15: implemented 06629bb:
- stage2-idea-literature, phase2-walkthrough and phase3a-vault rewritten for the frame; locally 1/1, 2/2, 2/2, and platform 2/2;
- docs/walkthroughs/wave-b1.md (16 rows), with stage-2.md rows 1 and 12 updated.
App fix: a project saved with only a name no longer stores an empty idea_intake, which had made Idea read "In progress" (test added; D-S2-39).
Deviations: per-tool CSVs are checked through the export zip; the list allows 1-2 include=work requests in `next dev` (StrictMode); every frame mount with the vault open re-runs the seal pass (a small cost, noted).
Merged (2fcd1b1): web 1217 pass (2 skipped); typecheck and lint clean. Pushed so PR #12 runs all three checks on the complete slice. Task 15 review running in parallel.
Task 15: complete. Review CHANGES REQUIRED, on the walk sheet only. The controller fixed:
- row 2 per R15: the AI's "Area" lines show with no name;
- row 7: the query excludes the scratch project, whose title stays plain by design;
- row 5: the first project's Literature reads Not started until row 10;
- row 8: reload the Writing place;
- row 14: Menu and the focus moves.
Finding 8 fixed: the title-sealing pass runs once per unlock per tab (a module flag, reset on lock or failure), not on every frame mount.
Accepted: "Put in my document" is tested from Idea (the only place it exists in B1) and Literature by Insert reference list; 1-2 include=work requests under next dev; the per-tool CSVs through the zip.
Coverage removed by design: the Tab paste of the idea read; the pop-out "only Citations and Research" toast.
CI on a92095c and 7578c06: checks and golden-exact green, e2e red. The proxy blocks the CI logs, so the full e2e was run locally (pglite, CI=1). 10/11 passed. stage2-idea-literature step 12 expected "Open my document" while the document was open, but the fix wave (f408c87) hides it then. Both branches were merged in 2fcd1b1; the app is right and the test step was stale. The step now checks the button is absent while the document is open, then present after Close. stage2 passes locally (1/1, 1.7 min). Pushed for CI.
MILESTONE: PR #12 at bf75855 is green on all three checks (checks, e2e, golden-exact). B1 (tasks 1-15 and Task 16 step 1) is built and reviewed. Next: OJ's go-ahead to merge PR #12, then on the Mac: the Neon backup, migration 0006 by hand, the API, the web, the Help version check and the live walk of docs/walkthroughs/wave-b1.md. Not done until that walk passes.

## B1 DONE (2026-10-21, local Mac session)
- Release confirmed: Help "Version 8b227af", API stages route 200 on production, `~/appuscholar-release.env` gone. VERIFIED.
- Live walk of docs/walkthroughs/wave-b1.md: rows 1-11 and 13-15 VERIFIED; row 12 FAILED (the export's AI-use statement said no AI was used, because first run's check is logged with no project). Row 16 scored: H1 2, H4 2, H5 3, H6 2, H8 2. Notes: docs/walkthroughs/notes/2026-10-21-wave-b1-walk.md (faults W32 to W44).
- Fix wave PR #13 (merged as 825b2a3):
  - `POST /projects/:id/ai-use/claim {secondsAgo}`; first run claims its check's rows when the project is saved.
  - Citation Fill prefers a DOI or PubMed ID in the link box.
  - Copy: "Vault unlocked", one full stop on the Idea row, "Papers kept: n".
  - Three green checks. OJ deployed the API, then the web.
  - Re-walk: row 12 VERIFIED, and W41 to W44 VERIFIED live.
- Dr. Sharma deck updated (version 8): B1 status, versions 8b227af and 825b2a3, three screenshot slides from the live site.
- Next: slice B2 (Tasks 17-26) on branch wave-b2, cut from phase-3a-vault at 825b2a3 or later. Open faults W32 to W39 are listed in the walk notes.

## B2 (Tasks 17-26), local Mac session, 2026-10-24
- Branch wave-b2 from origin/phase-3a-vault 1ec773b (B1, the B1 walk fixes, tools a-e, PR 24-26 merged). Worktree `Scholarly/appuscholar-b2`. Upstream unset: push only with `git push -u origin wave-b2`.
- Method (OJ, 21 Oct, lean): a Sonnet implementer per task, tests first, one Opus review per task, nits deferred; then one whole-slice review and one fix wave. One line per task here.
- Europe PMC CORS check, VERIFIED 2026-10-24 14:10 UTC: curl with `Origin: https://appuscholar-web.vercel.app` and a real browser fetch from https://example.com both got `access-control-allow-origin: *` and readable bodies: `rest/search?query=DOI:10.1038/s41598-019-49466-6&format=json&resultType=lite` 200 JSON (pmcid PMC6746734); `rest/PMC6746734/fullTextXML` 200 XML (53,833 chars); an unknown PMCID answers 500 JSON. OJ's answer 2 therefore applies: `https://www.ebi.ac.uk` joins connect-src in B2.
- Ruling B2-R1: register ids. The plan's D-S2-45 to D-S2-52 are taken (tools a-e used D-S2-45 to D-S2-112; the participants branch holds D-S2-113 to D-S2-121 and merges first). B2 rows take the next free id from D-S2-122 at the time each row is added, and are renumbered if a merge collides. Costs if wrong: a renumbering pass.
- Baseline at 1ec773b, 2026-10-24 19:4x IST: web 2156 tests, 24 failed in the full run with a load average of 16 (other sessions' suites); the six failing files (citeChecks, analyseWalk, shelf, styleLib, wordsPanel, citeBib) pass alone, 184/184. VERIFIED: load timeouts, not faults. Full-suite counts in B2 are read with this in mind; a failure counts only if it fails alone.
- Pre-flight (tasks 17-25 against 1ec773b), by an Opus read-only pass; full report with file:line evidence and the cross-task table in the shared notes folder, `wave-b2-preflight-report.md`. Every path the tasks delete is under `components/tools/…` (the task texts drop `tools/`). Rulings (binding on implementers and reviewers; none changes what a student sees against the plan's intent, so the build continues):
- Ruling B2-R2 (P2): `stage2-idea-literature` may stay red from Task 18 until Task 25; each task's line names the steps it leaves red. Any other spec a task breaks it fixes (Task 23 fixes `phase2-walkthrough` step 17). — as B1's R10 — cost if wrong: a red e2e window.
- Ruling B2-R3 (P3): a web type for stored entries (core `CitationEntry` plus optional `pid`, `rl`, `abstract`, `oa`, `ack`) in `lib/blobs/kinds.ts`; core's port type is not edited. — ports are never edited — cost: none.
- Ruling B2-R4 (P4): `ensurePaperIds` starts only when the vault is off, or unlocked and complete (the title pass's gate, `ProjectShell.tsx:113-127`); it reads without prompting and never runs in a pop-out. — "waits for unlock" and the locked-vault rule — cost: a delay until unlock.
- Ruling B2-R5 (P5): it starts from the project shell (home and every Literature tab), once per project per unlock per tab, not only from LitPlace. — Task 24's home needs pids even if Literature was never opened — cost: one extra read pass per project per unlock.
- Ruling B2-R6 (P6): the citations step goes through the shell's shared library client (`useLibrary().update`); a Literature tab's body waits for the migration to settle, with PanelLoading meanwhile, and renders anyway on "broken", "busy" or an error. — open panels must not keep a copy without pids — cost: a short loading line on first open after B2.
- Ruling B2-R7 (P7): `cellsToNotes` writes `cells` (possibly `{}`) into each paper's note once; later runs skip notes that have `cells`, so a repeat run reads no `shelf_paper`. — Task 7's "every paper read per visit" Major — cost: none.
- Ruling B2-R8 (P8): if Literature is Ready (not reopened) before the run, the migration re-stamps Ready afterwards with `POST /projects/:id/stages/lit/ready` (server clock), so its own writes never show "Reopened". — the migration is not the student's work — cost: the Ready time moves to the migration time.
- Ruling B2-R9 (P9): every `ap_notes` reader skips notes with `movedTo` and joins notes to shelf papers by pid: homeFacts, the export's notes and compare parts, `acrossData`, and Across until Task 22. — a moved note must not count twice — cost: none.
- Ruling B2-R10 (P10): until B3, `notes.ts` follows `movedTo` in `note()` and `put()`, so Analyse a paper writes the same `p:<pid>` note that Compare reads. — one note per paper — cost: none.
- Ruling B2-R11 (P11): every note the migration or Compare writes carries `stages` and `card` (possibly empty); `ApNoteSchema` requires them, and a note without them breaks the whole blob. — also keeps a B1 rollback readable — cost: none.
- Ruling B2-R12 (P12): `restoreShelf` keeps a replaced entry's `pid` and `doi`; a backup record's pid is taken only if a library entry in this project has it, else `linkShelf` matches or mints one. — a restore must not split a paper in two — cost: none.
- Ruling B2-R13 (P13): the library file (`exportLibrary`, `citations/library.json`) is written without `pid`, `rl`, `abstract`, `oa`, `ack`. — it is v1's class-share format — cost: none.
- Ruling B2-R14 (P14): until B3, "Read it now" keeps the paper, opens the Reading list and loads the stored abstract into today's Analyse a paper (`fromPending`). — the abstract read stays reachable until the reader lands — cost: none.
- Ruling B2-R15 (P15): the bookmark keeps wave A's W1 fill: when `keepEntry` answers "already", the kept entry's empty fields (authors) are filled from the capture, with `cap_filled`'s sentence. — no regression of W1 — cost: none.
- Ruling B2-R16 (P16): `/add` never starts the vault's one-off migration (treated as a pop-out for that) and calls `window.close()` only after the keep is flushed. — a closed tab must not lose the keep — cost: none.
- Ruling B2-R17 (P17): `oaWorkByRef` sends `rsFetchOpenAlex`'s select plus `biblio`; `OaWork` is exported with `biblio`; the test states the select. — volume, issue, pages need `biblio` — cost: none.
- Ruling B2-R18 (P18): `pmPaperById` copies `rsFetchPubmed`'s item mapping into a new helper (the port is not refactored) and reuses the existing pm-pmid esummary recordings. — ports are never edited — cost: a small duplication.
- Ruling B2-R19 (P19): both `capture.mjs` scripts refuse an overwrite before fetching; core's script gains the paste and Europe PMC case names and its manifest regex is widened so new files reach `v2-manifest.json`. — wave A LATER T7 — cost: none.
- Ruling B2-R20 (P20): Task 19 asserts the paste box reaches only OpenAlex, PubMed and Crossref; `https://www.ebi.ac.uk` joins `proxy.ts` and `proxy.test.ts` in Task 21; Task 26 checks connect-src gains exactly that host. — OJ's answer 2 overrides "connect-src unchanged" — cost: none.
- Ruling B2-R21 (P21): Europe PMC is Task 21's: a core fetcher with recordings (DOI search for the PMCID, then `fullTextXML`; any non-200 or a thrown fetch is "no text"), sending only the DOI or PMCID; the text is stored as the paper's shelf text (`putNewPaper` path, entry with `pid` and `doi`). It runs once per kept paper with a DOI or PMCID: at Keep, and for older papers the first time the Reading list shows them, one request at a time; a "none" answer is remembered on the entry, a network or CORS failure is not (retried next session). Fallback: "Get the free PDF" in a new tab with the plan's line. — OJ: "comes in by itself" — cost: requests to Europe PMC for older papers on first view.
- Ruling B2-R22 (P22): Task 21 deletes only the ShelfDialog wrapper; the shelf reader (pages, highlights, Summarise), Search, Find passages, Rename, Remove and Restore stay reachable from the Reading list until B3, and ShelfMatrix until Task 22. — each slice leaves the live site whole (plan line 23) — cost: some old UI inside the Reading list until B3.
- Ruling B2-R23 (P23): from Task 21, the home's "Papers kept" and the Reading list tab count are `papersOf(...).length`. — one count of kept papers — cost: none.
- Ruling B2-R24 (P24, flagged student-visible by the pre-flight): Compare lists every Reading list paper in `papersOf` order, so a first cell can be typed for any paper; "with any cell or card field" applies to the export CSV only. — the canvas's own line "Empty cells are ones you have not written yet" (Compare.dc.html:72) shows rows with empty cells, so this is the plan's intent and the build continues — cost: a long table for a large library.
- Ruling B2-R25 (P25): `ap_cols` keeps core's AP_COLS keys. Compare's card columns are the `ap_cols` keys among `strengths`, `weak`, `verdict` and a new `notes` key; when `ap_cols` is empty or equals core's default list, all four show. — `ap_cols` stores AP_COLS keys, not the plan's four names — cost: none.
- Ruling B2-R26 (P26): Task 22 removes `<Across>` from AnalysePanel (`AnalysePanel.tsx:12,98`) and moves its tests (analyse.test.tsx's Across cases, exportDialog.test.tsx:31,181). — Compare replaces Across — cost: none.
- Ruling B2-R27 (P27): after Task 22 the export's `compare/table.csv` is built from Compare's table (`notes[p:<pid>].cells` and the card fields, by pid). — one table — cost: none.
- Ruling B2-R28 (P28): CitationsTab keeps per-source Insert citation and Remove (SourceRow's More menu), the caret chip's lit row, and the quote box inside "Add a source by hand". — features only CitePanel carried today — cost: none.
- Ruling B2-R29 (P29): Task 24's merge also repoints shelf entries from the dropped pid to the kept one and drops the dropped entry's `refcheck_cache` row. — one paper after a merge — cost: none.
- Ruling B2-R30 (P30): Task 20 removes CiteCapture from CitePanel when it adds "Add from any journal page" to Find. — one place for the bookmark — cost: none.
