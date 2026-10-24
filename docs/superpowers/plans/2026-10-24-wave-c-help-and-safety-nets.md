# Wave C: Help and Safety Nets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the nine v1 help and safety-net features v2 lacks (Guide, Ask Appu, problem report, "page looks broken" FAQ entry, return-after-a-gap recap, backup items, install and offline bar, dark theme, "Erase the log"), so that v1 is fully present and stable before Dr. Sharma sees v2.

**Architecture:** Every feature is a self-contained folder under `apps/web/components/help/<feature>/` and `apps/web/lib/help/<feature>/`, plugged into the app through five fixed slot files (created in Task C0) so that parallel tasks never edit the same file. Its strings live in its own message file under `apps/web/messages/tools/`. Each task gets its own git worktree and branch (`wave-c/cN`); the controller merges them into `wave-c`. Nothing here changes an API route, a database table or the vault format; per-device state (last visit, last backup, snooze, theme) lives in `localStorage`, as v1's did.

**Tech Stack:** Next.js 16 (apps/web), React, Tailwind 4 tokens in `app/globals.css`, Radix dialogs, Vitest (`apps/web/test/**`), Playwright e2e, `jszip`, Web Crypto (AES-GCM, PBKDF2).

**Spec:** v1 is the spec: `Scholarly/appuscholer/index.html` (v1 line numbers below), `sw.js` and `manifest.webmanifest` beside it; notes `docs/v1-tools/04-citations-review-guide-and-rules.md` §3 and §"Theme, offline, install, version line, backup nudges"; gap list `Scholarly/appuscholar-blueprint/notes/2026-10-24-v1-gap-inventory.md`. The frame rules: `docs/design/2026-10-20-journey-redesign-draft.md` §7.

## Global Constraints

- **Repo is public:** no secrets, keys, passwords, personal data or Dr. Sharma's documents in any commit, fixture or test. Use invented sample text.
- **Never** push to, merge into or rebase `phase-3a-vault`; never deploy. Push only `wave-c` and the `wave-c/cN` branches.
- **v1 is the spec** for what each feature does; words are v1's except where a sentence is untrue in v2 (below).
- **Untrue-in-v2 rule:** v1 said work "stays in this browser/on this device/on this computer". In v2 work is stored in the student's account, sealed by the vault when it is on. Every v1 sentence that says otherwise is rewritten to be true, and each rewritten sentence is one proposed register row (`D-C-n`, status `proposed`, "awaits Dr. Sharma"). Per-device things that stay true (the last-backup date, the theme, the snooze) say "on this device".
- **Register ids:** `D-C-1` onward, in blocks: C1 1-49, C2 and C3 50-59, C4 60-64, C5 65-69, C6 70-74, C7 75-79, C8 80-84, C9 85-89, C10 90-94. Rows go in the task's own file `docs/superpowers/specs/wave-c-rows/cN.md` (all eight cells as `parity-deviations.md` lists them; no `|` inside a cell); Task C11 appends them to `parity-deviations.md` once.
- **Copy:** every string through `t()`. New keys only in the task's own message file (listed per task); a key already in `messages/en.json` or another tool file throws at load, so reuse an existing key only when its text is still true, otherwise make a new `wc_`-prefixed key. Hindi is DRAFT (file starts with the `$draft` marker, as `messages/tools/design.hi.json`). Plain words, sentence case, no emoji (icons from `@phosphor-icons/react`), no em-dashes, toasts only "Saved" and "Inserted" (others inline).
- **Shared files** may be edited only where a task says so, in one small block: `Help.tsx`, `ChromeDialogs.tsx`, `AppHeader.tsx`, `layout.tsx`, `proxy.ts`, `globals.css`, `messages/tools/index.ts`.
- **Rules (the fourteen, as they bite here):** the app never sends anything itself (rule 12: the problem report opens the student's mail app); no participant data or document text in any report or log; AI help is never counted as help on the student's work for Appu's calls (v1 `aiuClassify` returns null for them).
- **Tests:** TDD; unit tests in `apps/web/test/wcN*.test.ts(x)`; one e2e per task in `apps/web/e2e/wave-cN.spec.ts`, AI answered from recordings as in `stage2-idea-literature.spec.ts`. Local e2e ports: each task takes its own triple `E2E_WEB_PORT=3082+N`, `E2E_API_PORT=8882+N`, database `5482+N` (N is the task number); check for stale servers on those ports first.
- **Done means** the three CI checks green, the suite and the journey e2e passing locally three times, and OJ's live walk (not in this plan).

## Review Focus

1. **Offline with a cached shell must never serve someone else's page or stale private data:** the service worker caches only hashed static assets, icons and one offline page; never HTML of the app, never `/api`, never a response with `Set-Cookie`. Test in C8 ("the worker's fetch handler ignores navigations that succeed, API calls and cross-origin requests").
2. **A backup restore must never overwrite or merge into existing work:** it makes new projects named "(restored)" and reports what it made. Tests in C7 ("restore adds projects and leaves every existing project untouched").
3. **A wrong passphrase on a locked backup** says so without crashing or leaving a half-restored project, and the passphrase is never stored. Tests in C6 and C7.
4. **A problem report must carry no document text, source, data, key or unmasked email/phone,** even when an error message contains them. Test in C4 ("an error message with an email address and a phone number is masked; the report holds no text from the open document").
5. **Dark theme must keep text readable everywhere the light theme is:** every page, dialog and the editor's paper stay legible; contrast of body text and the primary button at least 4.5:1 in both themes. Test in C9 (token contrast check, plus screenshots at 1440 and 375 px).
6. **Guide search and print with 26 sections:** an empty query shows all; a stemmed query ("consents") finds "consent"; print opens every section; a section's HTML cannot run script (rendered through `sanitizeHtml`). Tests in C2.

## File structure (mapped before tasks)

| Path | Responsibility | Task |
|---|---|---|
| `apps/web/components/help/slots/{GuideSlot,ReportSlot,BackupSlot,InstallSlot}.tsx` | One button/dialog hook each, rendered by Help; stubs return null | C0 creates; C2/C4/C6+C7/C8 fill |
| `apps/web/components/help/slots/{RecapSlot,NudgeSlot,OfflineSlot,ErrorSlot}.tsx` | Always-on mounts rendered by `ChromeExtras` | C0 creates; C5/C7/C8/C4 fill |
| `apps/web/components/help/ChromeExtras.tsx`, `HelpButtons.tsx` | Mount the always-on slots / the Help buttons | C0 |
| `apps/web/lib/help/guide/types.ts`, `content.ts` | `GuideSection` type; the 26 sections | C0 (type, empty array), C1 (content) |
| `apps/web/messages/tools/help-{guide,report,recap,backup,install,theme}.{en,hi}.json` | Each feature's strings | C0 registers empty files; tasks fill |

---

### Task C0: Scaffold (controller)

**Files:** Create the slot files, `ChromeExtras.tsx`, `HelpButtons.tsx`, `lib/help/guide/{types,content}.ts`, the twelve message files; Modify `components/workspace/ChromeDialogs.tsx` (add `<ChromeExtras />`), `components/workspace/dialogs/Help.tsx` (add `<HelpButtons />` in one block, add `broken` to `FAQ`), `messages/tools/index.ts` (list the six pairs).

**Interfaces:**
- Produces: `GuideSection = { id: string; group: "Begin" | "Tools" | "Practice" | "Help"; title: string; keywords: string; html: string }`; `export const GUIDE: GuideSection[] = []`.
- Produces: each `…Slot.tsx` exports one named component of the same name taking no props (`GuideSlot` renders a button and its dialog, and so on); `HelpButtons` renders `GuideSlot, ReportSlot, BackupSlot, InstallSlot` in a row inside Help; `ChromeExtras` renders `RecapSlot, NudgeSlot, OfflineSlot, ErrorSlot`.

- [ ] Write `test/wcScaffold.test.tsx`: Help renders without the slots drawing anything; `i18n.test.ts` still passes with the twelve new files; the `broken` FAQ entry shows (`faq_q_broken`/`faq_a_broken` exist already, task item 4).
- [ ] Implement, run `pnpm --filter @appuscholar/web exec vitest run test/wcScaffold.test.tsx test/i18n.test.ts test/i18n-coverage.test.ts`, typecheck, lint, commit on `wave-c`, push.

---

### Task C1: Guide content (26 sections)

**Files:** Modify `apps/web/lib/help/guide/content.ts`; Create `docs/superpowers/specs/wave-c-rows/c1.md`, `apps/web/test/wc1GuideContent.test.ts`.

**Consumes:** `GuideSection`, `GUIDE`.
**Produces:** `GUIDE` holding exactly v1's 26 sections in v1's order and ids (`start, stages, editor, idea, research, shelf, offline, psych, design, aiuse, stats, scales, numcheck, charts, pictures, qual, style, cite, appu, chat, slides, data, habits, never, faq, gloss`), groups and titles as v1 (v1 `GUIDE` 9561-9753).

- Port each section's text and `kw` keywords from v1, as `html` (only tags `sanitizeHtml` keeps).
- Rewrite every sentence that is untrue in v2 (where work, keys, backups, the log, offline use or installation are described: at least `start`, `offline`, `aiuse`, `data`, `habits`, `faq`, `gloss`, `never`) per the Untrue-in-v2 rule. Keys: v2 keeps them in the browser or locked under the passphrase in the account (see `faq_a_key`). Offline: the app does not work offline beyond what C8 ships; say so. Each rewrite = one row in `docs/superpowers/specs/wave-c-rows/c1.md` stating v1's sentence, the new one and why.
- Sections about v2 tools that now differ from v1 (Statistics Lab, Design and ethics, Closeness, Words) stay at v1's behaviour descriptions unless v2 differs in a way a student would hit; one row per such change.
- [ ] Tests: "has v1's 26 ids in order"; "every section has title, keywords and non-empty html"; "no section contains the phrases `only in this browser`, `on this device` (outside the install/backup copy that is true), `never leaves your computer`, `stored on your computer`" (list the exact v1 phrases found while porting in the test); "every html survives `sanitizeHtml` unchanged"; "no section says 'exempt'".
- [ ] Commit `feat(help): the Guide's 26 sections, rewritten where v1 said work stays on the device`.

---

### Task C2: Guide dialog (search, contents, print)

**Files:** Create `components/help/guide/{GuideDialog,search}.ts(x)`, `lib/help/guide/search.ts`; Modify `components/help/slots/GuideSlot.tsx`; Create `test/wc2Guide*.test.ts(x)`, `e2e/wave-c2.spec.ts`, rows `wave-c-rows/c2.md`; messages `help-guide.{en,hi}.json`.

**Interfaces:** `searchGuide(query: string, sections: GuideSection[]): { id: string; open: boolean }[]` and `guideCount(n, h, total)` in `lib/help/guide/search.ts`: every query word must appear in title + keywords + stripped body (v1 `guideRender`, 9755-9766, 9815-9826); one to three matches come back `open: true`. `GuideDialog` takes `{ open; onClose; sections?: GuideSection[] }` (default `GUIDE`) and an `extra?: ReactNode` slot below the search box (C3 plugs Ask Appu there).
- Behaviour from v1 (dialog 1272-1288, note §Guide): English-only banner "The guide is in English for now. A Hindi version is planned." (keep, it is true), search box and placeholder, counter "{n} sections" / "{h} of {N} sections match", empty-result line, contents grouped Begin/Tools/Practice/Help, sections as `<details>`, "Print or save as PDF" opens a new window with every section and "Appuscholar guide ... Printed from the app. Build {APP_VERSION}" then calls `print()` (use the v1 print template; the new window gets only sanitized HTML and no scripts except `print()` from the opener).
- Slot: a "Guide" button in Help (Phosphor `BookOpen`) opening the dialog.
- [ ] Tests (fixture sections, not the real content): search matches every word across title/keywords/body; "consents" finds "consent" only if v1 stems (read `guideRender`; if v1 does not stem here, say so in the test and do not add stemming); empty query lists all; 1 to 3 matches auto-open; no match shows the empty line; print builds a document containing every section title and the build id; a section with `<img src=x onerror=alert(1)>` renders without the handler.
- [ ] e2e `wave-c2.spec.ts`: sign in, open Help, open the Guide, 26 contents rows visible once C1 is merged (assert `>= 26` after merge; in the task's own branch assert the fixture-independent behaviours: search narrows the list, the counter text changes).

---

### Task C3: Ask Appu

**Files:** Create `lib/help/guide/appu.ts`, `components/help/guide/AskAppu.tsx`, `test/wc3Appu.test.ts(x)`, `e2e/wave-c3.spec.ts`, rows `c3.md`; Modify `GuideDialog` (pass `extra={<AskAppu/>}`, one line) and the AI-use classifier only if it does not already return null for Appu (see below); messages `help-guide`.

**Interfaces:** `appuRank(question: string, sections: GuideSection[]): GuideSection[]` (v1 `appuRank`: stem words, drop short and stop words, title 3, keyword 2, body 1, top three); `appuPrompt(question: string, hits: GuideSection[], tool: string): string` (v1 prompt 9778 verbatim, question cut to 500 chars, open tool as context); `AskAppu` calls `useCallAI` with temperature 0.2, max 700, `noLang`.
- Cases (note §Appu): no hits -> v1 line; no AI key -> list matching sections with v1's "Appu needs an AI key…" line; otherwise answer as plain text with "From the guide: <links>. Appu can be wrong. Check the section." Links open the section in the dialog. Copy "Appu answers only from this guide…" as v1 (check it is true: "Your question goes to your AI provider" is true in v2).
- Appu's calls are NOT logged as AI help on the student's work. Read `packages/core/src/aiuse.ts` `classifyAiUse`: v1 returns null for prompts starting "You are Appu, the help assistant". If the ported function covers it, add a test only. If not, report NEEDS_CONTEXT (core is never edited here; a `V2` sibling needs the controller).
- The personal-data scan runs before the call (callAI does it); the question is the only text sent, never document text.
- [ ] Tests: ranking weights on a fixture; prompt starts "You are Appu, the help assistant" and ends with the cut question; no hits, no key and answer paths with a fake `callAI`; "an instruction inside the question is passed as a question only" (the prompt contains v1's last line); the call is classified null by `classifyAiUse`.
- [ ] e2e: open the Guide, ask a question with the AI answered from a recording, see the answer and the "From the guide" links; ask with no key and see the section list.

---

### Task C4: Problem report, error ring, usage counts, FAQ entry

**Files:** Create `lib/help/report/{repFacts,errorRing,usage}.ts`, `components/help/report/ReportDialog.tsx`; Modify slots `ReportSlot.tsx`, `ErrorSlot.tsx`; Create `test/wc4Report*.test.ts(x)`, `e2e/wave-c4.spec.ts`, rows `c4.md`; messages `help-report`.

**Interfaces:** `repFacts(i: { build; tool; lang; ua; screen; online; provider; keySaved; errors: RingError[] }): string` (v1 `repFacts` 11355-11385: build, tool open, language, browser, screen and window size, online, "AI provider chosen: <name>, key saved: yes/no", up to the last 5 errors with message cut to 140 chars, passed through the personal-data mask `pdMask` from core, plus file:line); `RingError = { at: number; tool: string; message: string; where: string }`; `installErrorRing(): () => void` (window `error` and `unhandledrejection`, ring of 5, memory only); `bumpUsage(tool)` / `readUsage()` / `clearUsage()` (device-local counts, key `appu_usage`, v1 shape); `buildMailto(subject, body, support): { href: string; copied: boolean }` per v1 (body trimmed to 1,500 chars; when the encoded body exceeds 1,800 the caller also copies the report and says "The report is long, so it was copied too. Paste it into the email if it looks cut off.").
- Dialog (v1 1290-1306): describe box with "Do not type participant names or other personal details.", the exact "What the app adds to the report" panel (kept, it is true: nothing from documents, sources, data or keys), optional tick "Also include how often I opened each tool (counts only, no text)", buttons "Open an email to send", "Copy the report", "Clear the counts", closing line "The email opens in your own email app. You read it and press send yourself." Subject "Appuscholar problem report (<build>)". Without `NEXT_PUBLIC_SUPPORT_EMAIL`: hide the mail button and show Help's existing `help_contact_unset` line.
- `ErrorSlot` installs the ring on mount of `ChromeExtras`; `bumpUsage` is called from the report dialog only for the tool currently open (the active place/tab), kept deliberately minimal; if wiring tool opens needs a shared file, count only what the dialog can see and write a register row.
- FAQ entry: already added in C0 (`broken`); this task's e2e asserts it shows and opens.
- [ ] Tests: facts contain every listed field and no document text; "an error message with an email address and a phone number is masked; the report holds no text from the open document" (Review Focus 4); five-error cap; mailto subject and 1,500-char trim; long-body copy path; clear counts empties `appu_usage`; no mail button without the env var.
- [ ] e2e: open Help, "Report a problem", type a description, see the report preview, "Copy the report" puts text on a mocked clipboard; open the FAQ "page looks broken" entry.

---

### Task C5: Return-after-a-gap recap

**Files:** Create `lib/help/recap/{gap,facts}.ts`, `components/help/recap/RecapDialog.tsx`; Modify `slots/RecapSlot.tsx`; Create `test/wc5Recap*.test.ts(x)`, `e2e/wave-c5.spec.ts`, rows `c5.md`; messages `help-recap`.

**Interfaces:** `daysAway(lastActive: number, now: number): number`; `shouldRecap(i: { lastActive: number; now: number; gap: number; off: boolean; popout: boolean }): boolean` (v1 `recapCheck` 3587-3598: not in a pop-out, not switched off, away at least the gap, default gap 5 days, checked 2.5 s after load; `appu_last_active` is stamped on activity); `recapFacts(api): Promise<RecapFacts>` reads only what v2 can state truthfully from the account: project and stage, open document title and word count, new documents since the last visit (documents' `createdAt`), AI requests since (`GET /ai/log?from=`), tests run since (stats run records' times if present). Counts v2 cannot derive (sources added, passages coded) are omitted, never shown as zero; if nothing is countable show `ret_nolog` ("No activity was recorded since your last visit."). One register row lists each v1 count omitted and why.
- Dialog (v1 `ret_*` keys, 1125 and the i18n line): "Welcome back", away days, project and stage, open document, the counts, "Last time … you wrote:" (the first words of the last-edited document, shown only if the vault is unlocked; never when locked), three questions with a new intro in place of `ret_q_intro` (v1 said answers are saved on this computer; they are, as v1: saved on this device only under `appu_recap_answers`, and the intro says "on this device"), buttons Save my answers / Skip. The switch "Show a recap and three questions when I return after five days or more" (`appu_recap_off`) is a checkbox in the recap dialog's own footer; one register row notes v1 kept it in Settings.
- [ ] Tests: `shouldRecap` truth table; facts omit what cannot be counted; no document text when the vault is locked; answers save and reload on the device; Skip stamps last-active.
- [ ] e2e: set `appu_last_active` to eight days ago (via `addInitScript`), load the app, see the recap after the delay, answer, save, reload and see no recap.

---

### Task C6: Locked backup and "check a backup file"

**Files:** Create `lib/help/backup/{format,lockedBackup,checkBackup}.ts`, `components/help/backup/{LockedBackupDialog,CheckBackupDialog}.tsx`; Modify `slots/BackupSlot.tsx` (C7 shares this slot file: C6 creates `BackupMenu.tsx` that lists C6's actions and C7 adds its own file `RestoreBackup.tsx`; `BackupSlot.tsx` renders `<BackupMenu/>` and nothing else in C6; C7 changes it by one line); Create `test/wc6Backup*.test.ts`, `e2e/wave-c6.spec.ts`, rows `c6.md`; messages `help-backup`.

**Interfaces:**
- Produces `lib/help/backup/stamp.ts` with `stampBackup(now?)` and `lastBackup()` (key `appu_last_backup`, device-local) for C7.
- `lockBackup(zip: Uint8Array, passphrase: string): Promise<Uint8Array>` and `unlockBackup(file: Uint8Array, passphrase: string): Promise<Uint8Array>` (throws `BackupError("wrong-passphrase" | "not-a-backup")`): AES-GCM, PBKDF2-SHA-256 600,000 rounds (v1 4010-4070), passphrase of at least 10 characters (refuse shorter, v1 copy "so if you forget it nobody can open the file, and that includes us"); file = magic bytes `APPULOCK2` + JSON header `{kdf, iter, salt, iv}` + ciphertext; extension `.locked`.
- `checkBackup(file: Uint8Array, passphrase?: string): Promise<BackupReport>` where `BackupReport = { kind: "plain" | "locked"; ok: boolean; projects: number; documents: number; problems: string[] }`: reads the zip structure written by `exportAll` (`lib/vault/export.ts`: `index.json` plus the files it lists), verifies every listed file is present and `index.json` parses; writes nothing anywhere; records `appu_last_verify` (device) on success; says what it found in words, "Checking one proves you can get your work back." (v1 copy).
- "Locked backup" action: builds the zip through the same `exportAll` path Help's `exportWork` uses (read `Help.tsx`; do not edit it: call the same functions), asks for a passphrase twice, downloads `appuscholar-backup-YYYY-MM-DD.locked`, stamps `appu_last_backup`.
- Passphrases are never stored or logged.
- [ ] Tests: round trip; "a wrong passphrase rejects with wrong-passphrase and returns no bytes"; a 9-character passphrase is refused; tampering one ciphertext byte fails; check reports counts for a fixture zip, flags a missing listed file, rejects a non-zip with "not-a-backup"; check never calls the API (spy `apiFetch`).
- [ ] e2e: make a locked backup (download captured), check it with the right passphrase (counts shown) and a wrong one (error shown).

---

### Task C7: Restore your own backup, and the backup nudge

**Files:** Create `lib/help/backup/{restore,nudge}.ts` (and extend `stamp.ts` from C6), `components/help/backup/{RestoreBackup,BackupNudge}.tsx`; Modify `slots/BackupSlot.tsx` (one line), `slots/NudgeSlot.tsx`, `components/workspace/dialogs/Help.tsx` (in `useAccount.exportWork`: one line after `downloadBlob(...)` calls `stampBackup()`); Create tests, `e2e/wave-c7.spec.ts`, rows `c7.md`; messages `help-backup`.

**Interfaces:**
- Consumes from C6: `stampBackup(now = Date.now()): void` and `lastBackup(): number` in `lib/help/backup/stamp.ts`. Produces: `snoozeNudge(now)`, `nudgeDue(i: { words: number; lastBackup: number; snoozedUntil: number; now: number }): "new" | "old" | null` (v1 4133-4160: only with 150 or more words; never backed up -> "new"; last backup 7 or more days ago -> "old"; "Later" snoozes 3 days; shown 4 s after load; `BACKUP_SKIP`-style keys `appu_last_backup`, `appu_backup_snooze`).
- `restoreBackup(file: Uint8Array, passphrase: string | undefined, deps): Promise<{ projects: { id: string; title: string; documents: number }[] }>`: reads a plain zip or a locked file (via `unlockBackup`), then creates NEW projects titled "<title> (restored)" with their documents and blobs written the way `ImportV1.tsx` and `useProjectBlob` write them (sealed by the vault when it is on; if locked, ask to unlock first). It never changes an existing project, replaces nothing (v1 replaced; register row), and a failure part-way removes nothing but reports which parts were not restored.
- Nudge copy rewritten to be true (words are saved in the account; a backup is a copy on the student's own computer), v1 shape: "You have written {w} words and have not made a copy on this computer yet. Your work is saved in your account; a backup is a second copy that is yours." (finalise; one register row each). Buttons "Back up now" (runs the same export as Help's) / "Later". Words = sum of the projects' `draftWords` (`GET /projects`), no document text read.
- [ ] Tests: `nudgeDue` truth table; "restore adds projects and leaves every existing project untouched" (Review Focus 2, with a fake API that records writes: no PUT/DELETE on an existing id); locked restore with a wrong passphrase writes nothing; a half-failing write reports partial; nudge shows after 4 s with fake timers and "Later" snoozes; `exportWork` stamps.
- [ ] e2e: export through Help, restore that file, see "(restored)" project with the same document text; clear the stamp, write 150+ words, see the nudge, press Later, reload, no nudge.

---

### Task C8: Install as an app, offline bar, service worker

**Files:** Create `apps/web/public/{sw.js,offline.html,icon-192.png,icon-512.png}`, `apps/web/app/manifest.ts`, `lib/help/install/{register,online}.ts`, `components/help/install/{InstallButton,OfflineBar}.tsx`; Modify `slots/InstallSlot.tsx`, `slots/OfflineSlot.tsx`, `proxy.ts` (matcher: leave `sw.js`, `offline.html`, `manifest.webmanifest` and the icons outside any auth redirect only if the proxy redirects; today it only sets CSP, so check and change nothing if so); Create tests, `e2e/wave-c8.spec.ts`, rows `c8.md`; messages `help-install`.

**Interfaces:**
- Manifest: standalone, name "Appuscholar", `theme_color` `#4c1d95`, description "A writing and research helper for psychology students.", icons from v1 (`appuscholer/icon-192.png`, `icon-512.png`; product art only, no document content).
- `sw.js` (v1 `sw.js` for shape): `VER = "appu-wc-1"`; install precaches `/offline.html` and the icons; fetch: GET only, same origin only; `/_next/static/*`, fonts and icons cache-first; navigations network-first and, only on network failure, answer `/offline.html`; everything else (API, `/api`, other origins, non-GET, any response with `Set-Cookie`, any HTML other than `/offline.html`) is never cached and goes straight to the network; `activate` deletes old `appu-` caches. `?nosw=1` unregisters and clears (v1 "Offline copy switched off and cleared").
- `OfflineBar`: fixed bottom bar when `navigator.onLine` is false: "You are offline. Your last page is on screen, but saving, AI, paper search and new pages need a connection." (true for v2; v1's "writing still works" is not, register row: real offline writing against encrypted server data is out of scope.)
- `InstallButton`: appears in Help only when `beforeinstallprompt` fired; else a line "Use your browser menu: Install app, or Add to Home Screen" (v1 toast text, as inline copy).
- Register the worker from `InstallSlot`'s effect (production only).
- [ ] Tests: the worker's fetch handler is a pure function `decide(request, response?)` exported from a module the worker imports via `importScripts`-free inlining or tested by evaluating `sw.js` in a stub scope: "ignores navigations that succeed, API calls and cross-origin requests" (Review Focus 1); offline fallback only on failure; `activate` removes old caches; manifest has the fields; bar shows on `offline` event and hides on `online`; install button hidden until the event.
- [ ] e2e (Chromium): manifest link present and valid JSON; with the context set offline the bar appears; back online it goes. (A full offline reload is not asserted.)

---

### Task C9: Dark theme

**Files:** Modify `apps/web/app/globals.css` (one new block at the end: `:root[data-theme="dark"] { ... }` overriding the existing tokens, plus `color-scheme`), `apps/web/app/layout.tsx` (an inline script with the CSP nonce in `<head>` that sets `data-theme` from `localStorage.appu_theme` before paint; default is light regardless of the device's own setting, as v1 2610), `components/frame/AppHeader.tsx` (one theme button, Phosphor `Moon`/`Sun`); Create `lib/help/theme.ts`, `test/wc9Theme.test.ts(x)`, `e2e/wave-c9.spec.ts`, rows `c9.md`; messages `help-theme`.

**Interfaces:** `getTheme(): "light" | "dark"`, `setTheme(t)` (writes `appu_theme`, sets the attribute); `contrast(a: string, b: string): number` in the test helper only.
- Dark values redefine only the tokens in `:root` (purple scale lightened, `--bg`, `--card`, `--soft`, `--chip`, `--line`, `--ink`, `--muted`, flag/ok/danger pairs, shadows); components using Tailwind's `bg-white`, `text-gray-*` and hard-coded hex are listed by a grep in the task and either mapped through a token or given a `[data-theme=dark]` override in the same block. The document paper (the editor surface) stays a light page in dark mode, as in most editors? Decide by looking: v1 had no dark editor; use a dark paper with `--ink` text if the editor reads cleanly, else keep paper light; write the choice in the row.
- [ ] Tests: "every foreground/background token pair used for body text, the primary button, notes (flag/ok/danger) and links has contrast >= 4.5:1 in both themes" (computed from `globals.css` token values parsed in the test); `getTheme` defaults to light with no storage and ignores `prefers-color-scheme`; the script string sets the attribute before paint (unit test of the string); toggling persists.
- [ ] e2e + screenshots at 1440 and 375 px of project home, the Writing place with the document, Help and a dialog in dark; attach to the PR description via the PR's text (no committed images).

---

### Task C10: "Erase the log" button

**Files:** Modify `apps/web/components/tools/design/AiUse.tsx` (a button and a confirm dialog), `apps/web/messages/tools/design.{en,hi}.json`; Create `apps/web/test/wc10EraseLog.test.tsx`, `e2e/wave-c10.spec.ts`, rows `c10.md`.

**Interfaces:** `DELETE /ai/log` (exists, `apps/api/src/routes/ai.ts:114`, wipes the account's whole log).
- v1 `aiuClear` (5488-5491): a confirm, then the log is cleared and the statement list redraws empty. v2 copy must say what is true: it erases the AI-use log for **all projects in this account**, not only this one, and cannot be undone; the statement already built stays in its box. After success the tab shows the empty-log state. Failure shows an inline line, nothing else changes.
- [ ] Tests: the button opens a confirm that names "all your projects"; Cancel calls nothing; Confirm calls `DELETE /ai/log` once and the tab shows the empty state; a failed delete shows the error and keeps the rows; the statement text in the box is untouched.
- [ ] e2e: with a mocked log row, erase, see the empty-log message.

---

### Task C11: Integration (controller)

- [ ] Merge each `wave-c/cN` into `wave-c` as it passes review; resolve only the message index and slot files.
- [ ] Append `wave-c-rows/*.md` to `docs/superpowers/specs/parity-deviations.md` once; delete the folder.
- [ ] A journey e2e `e2e/wave-c-journey.spec.ts` tying the pieces (Help -> Guide search -> Ask Appu -> Report -> locked backup -> check -> restore -> theme toggle -> erase log) is NOT written; each task's own e2e covers its item. The "journey" run is the existing `phase2-walkthrough`, `stage2-idea-literature`, `tools-a` and `tools-g` specs.
- [ ] Run the full web suite and those e2e specs three times (record the three results in the ledger), typecheck, lint, core golden.
- [ ] Open one PR `wave-c` into `phase-3a-vault`; wait for three green checks; report to the main session with the built/tested table.

---

## Self-review

- **Coverage:** items 1 (C1, C2), 2 (C3), 3 (C4), 4 (C0 + C4 e2e), 5 (C5), 6 (C6, C7), 7 (C8, plus the offline register row in C8), 8 (C9), 9 (C10). Every register-row duty is in a task. Gap: none.
- **Parallelism:** C1, C2, C4, C5, C6, C8, C9, C10 touch disjoint files (slots, messages and rows are per task); C3 follows C2 (GuideDialog); C7 follows C6 (BackupSlot and backup lib).
- **Type consistency:** `GuideSection` and `GUIDE` are defined in C0 and used by C1 to C3; `stampBackup`, `lastBackup` and the key `appu_last_backup` are defined in C6 (`stamp.ts`) and used by C7, which only extends that file.
- **Review Focus:** all six lines have an owning test above.
