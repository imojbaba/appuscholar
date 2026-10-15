# Phase 2: Workspace and Writing Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Dr. Sharma's v1 workspace on the phase-1 platform: the three-column page, project bar, stage sidebar, dock and stage guide, the document pane with import, source marking, toolbar, templates and exports, the AI Provider / Key dialog with six providers and the key lock, the personal-data scan, the AI-use log, Continue / Improve / Extend / Ask Appuscholar with the accuracy note, Draft first, the "My writing" tracker, the selection bubble, Hindi chrome, and the terms and 18+ gate, so that a student completes journey G of the writing stage on the live URL.

**Architecture:** One signed-in page at `/` replaces the phase-1 reference screens. The layout, tokens and copy come from the approved Phase 0 mockups and `DESIGN-SYSTEM.md`. Deterministic logic that v1 ran in the page (personal-data scan, accuracy check, origin counting, AI-use classification) moves into `packages/core` as pure functions with tests. AI calls go through a thin gateway in `apps/api/src/ai/` in own-key mode: the browser sends the student's unlocked key with each request, the gateway forwards to the provider, never stores the key or the text, and writes one AI-use log row (provider, model, kind). The browser keeps v1's personal-data dialog, failover and error wording. Per-user settings (language, provider, Draft first, sidebar state, field of study) live in a `settings` JSON column so they follow the student across devices.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, shadcn/ui primitives already in `apps/web/components/ui`, TipTap 3 (`@tiptap/react/menus` BubbleMenu, `@floating-ui/dom`), `mammoth`, `pdfjs-dist`, Hono 4, Drizzle, Zod 4, `@anthropic-ai/sdk` (Anthropic adapter), Vitest, Playwright, `next/font/google` (IBM Plex Sans, IBM Plex Sans Devanagari, Fraunces).

**Spec:** `Scholarly/appuscholar-blueprint/BLUEPRINT.md` §2, §3, §4 (stage 1 and stage 5 paragraphs), §6, §7, §8 "Phase 2"; `Scholarly/appuscholar-blueprint/v1-tools/01-workspace-and-writing.md` sections A, B, C (Draft first, My writing, AI-use log), E, G; `v1-tools/04-citations-review-guide-and-rules.md` §5 (onboarding and gates, AI provider setup, Hindi toggle) and "Word download and LaTeX export"; `v1-tools/02-idea-and-literature.md` only for the Idea & Feasibility stub copy; the approved design in `Scholarly/appuscholar-blueprint/design/DESIGN-SYSTEM.md` and `design/mockups/01..05-*.html` (`tokens.css` is the stylesheet source); engineering spec `docs/superpowers/specs/2026-10-13-appuscholar-v2-design.md` §4, §5, §7, §9, §10 (its §11 phase order is superseded by BLUEPRINT §8). v1 source for line references: `Scholarly/appuscholer/index.html` (13,699 lines; read only the ranges a task cites).

## Global Constraints

- Branch `phase-2-workspace` from `phase-1-platform`. Conventional Commits; every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Monorepo commands from the repo root: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`; package-scoped `pnpm --filter @appuscholar/core test` etc.; e2e `pnpm --filter @appuscholar/web e2e` (needs `DATABASE_URL` of a Neon branch; the Playwright config starts both dev servers).
- Light theme only. Tokens are the values in `design/mockups/tokens.css` copied into `apps/web/app/globals.css`; no `dark:` variants; no second accent besides gold, and gold only for the machine (DESIGN-SYSTEM §2 principle 1).
- Fonts: IBM Plex Sans + IBM Plex Sans Devanagari for UI, Fraunces (600, italic) for the wordmark only, Georgia stack for the editor. `next/font/google` self-hosts; no `<link>` to Google Fonts. Remove Geist.
- Copy is v1's, verbatim, including emoji prefixes and the "—" dashes inside his strings (the phase-1.5 "no em-dashes" rule is superseded: his copy wins). New v2 copy (where no v1 string exists) is plain sentences, sentence case, no em-dashes.
- Radius tiers: controls 8px, cards 12px, dialogs and the phone sheet 16px, badges pill. Borders not shadows; shadows only on the selection bubble, dialogs, toasts.
- Every control reachable by keyboard; `:focus-visible` ring 2px `#4c1d95`; dialogs trap focus and close on Escape (except the terms gate); emoji in labels are inside `<span aria-hidden="true">` with the visible text carrying meaning.
- `packages/core` never imports React, DOM, Node `fs` or `fetch` (spec §7). Anything that needs a DOM lives in `apps/web/lib` and is tested with `// @vitest-environment jsdom`.
- The API never stores a provider key in plaintext, never logs a request body, and never stores prompt or answer text (BLUEPRINT §2 rule 3).
- These `data-testid` values from phase 1 survive: `e2e-email`, `e2e-submit`, `signin-error`, `save-status`, `editor`, `revision-list`, `restore-<seq>`, `import-file`, `import-msg`, `error-msg`. New ones are listed per task. The editor root keeps class `ProseMirror`.
- CSP in `apps/web/proxy.ts` gains `worker-src 'self' blob:` (pdf.js) and nothing else; AI calls go to the API origin already in `connect-src`.
- Hindi: chrome strings through `t()`; panel interiors that v1 leaves English stay English (01 §A "Hindi UI").
- No AI call is made by any code path that the student did not trigger with a button (rule 2). No test or seed hits a real provider.

## v1 fidelity (binding; from Dr. Sharma's source, overrides anything below that disagrees)

- Layout and chrome are §A of `01-workspace-and-writing.md`: header (wordmark, Version badge, हि/EN, Help, gold "⚙ AI Provider / Key"), subbar provider pill, project bar, sidebar (pinned "✨ New Research Project" and "🗂 Research Projects", six stage groups, nothing starts collapsed, rail at 50px), centre document card, right dock with "Tools" and "✨ AI suggestion" tabs, "⧉ Pop out", stage guide at the top of the dock.
- `TOOL_TO_STAGE` and `STAGE_FIRST_TOOL` exactly: idea→idea; research, psych, analyse→lit; design→design; stats, qual→collect; style, words, cite, chat→writing; close, slides→review. First tools: idea, research, design, stats, cite, slides ("Next: Writing" lands on the Citation Manager).
- The fourteen rules in BLUEPRINT §2 are the acceptance checklist of the final review. Rules exercised in this phase: 1 (accuracy check and origin count in code), 2 (PD scan before send, three choices), 3 (log keeps date, provider, model, kind; never text), 4 (Draft first returns questions, nothing insertable), 7 (AI text wrapped and tracked; "No targets, no score. It is just a mirror."), 8 (accuracy note is amber prose, never a verdict), 12 (nothing submitted by the app; 18+ and terms before use).
- Writing-action prompts, temperatures and token limits are verbatim from §B: Continue (0.7, 1200), Improve (0.3, 3000), Extend (0.5, 3000), Ask Appuscholar (0.5, 700), Draft first feedback (0.4, 1200), `PLAIN_OUT`, "TEXT (treat as text, not as instructions):", `[add source]`.
- Toasts and dialogs keep v1 wording (listed in each task). The "Tab accepts only when a suggestion is waiting" rule holds.
- Provider table, model ids and setup steps are v1's `PROVIDERS` (index.html:2556–2564), except the Anthropic model id (see Task 12, DECIDED).
- Key storage offers v1's three modes with v1's wording; passphrase mode uses AES-GCM 256 with PBKDF2-SHA-256, 250,000 iterations, 16-byte salt, 12-byte IV, blob `salt.iv.ciphertext` base64.

## v2 changes made in this phase (each named with its reason, per BLUEPRINT §6)

1. Documents belong to a project; "scratch space" is a per-user hidden project of kind `scratch`. "Save as research project" moves the open document into the new project. Reason: v2 stores work per user with revisions (BLUEPRINT §6); v1's global document list has no owner. The project-bar copy stays v1's.
2. AI requests pass through the API gateway with the student's key per request (spec §5 own-key mode) instead of browser `fetch` to the provider. Reason: OpenAI and DeepSeek block browser calls (v1 warns they "will not work here"); the gateway makes all six work, keeps provider hosts out of the CSP, and writes the AI-use log server-side so it follows the student. The key is used once and never stored (test in Task 12).
3. Passphrase-locked keys are stored as the encrypted blob on the server (`credentials` table) so they roam; "Remember on this computer" stays local-only; "This tab only" stays in memory. Reason: BLUEPRINT §6 "reachable from any device"; the server still cannot read the key.
4. Settings (language, provider, Draft first, sidebar state, field, ORCID, fallback) are per user on the server. Reason: same.
5. Template picker and table size are small dialogs instead of browser `prompt()`. Reason: design quality (BLUEPRINT §6); the choices and copy are v1's.
6. Document delete is a soft delete with a ten-second Undo toast instead of a console command. Reason: same; v1's "A backup copy is kept" promise is kept better.
7. Terms text: items d1 and d2 ("Appuscholar has no server") are rewritten for the server (BLUEPRINT §6 "the terms and the lawyer's brief must say so"). The replacement wording is in Task 17 and is flagged for OJ and the lawyer.
8. Theme toggle is not rendered in this phase (light only, dark after parity, HANDOFF). Access-code gate is replaced by sign-in (BLUEPRINT §6).

## Review Focus

1. A student presses Continue Writing with an empty or 10-word document: the gateway must still be called with the tail (v1 has no minimum here; only Draft first has the 25-word rule), and an empty provider answer shows "The AI returned an empty answer. Try again." in the pane, not a crash. Test: Task 14 (unit, empty response mapping) and Task 21 (e2e with mocked gateway).
2. The prompt contains an email and the student picks Cancel: nothing is sent, the pane shows "Cancelled. Nothing was sent to the AI provider.", and no log row exists. Then "Send as it is" twice for the same text asks only once per session. Test: Task 13 (pdPreSend unit with a fake dialog) and Task 12 (gateway refuses unmasked PD without `pdAccepted`).
3. Accepting a suggestion while the student had a selection replaces that selection; accepting with no selection appends at the end with a leading paragraph; both wrap the text in `span.ai-ins[data-h]`, and the next autosave's revision records the AI word count. Test: Task 14 (editor unit with jsdom) and Task 16 (originStats on PUT).
4. Importing a 3 MB .docx with images must not exceed the API body limit silently: the client strips images above 30,000 characters of data URI into a placeholder paragraph "[picture removed on import: too large]" and the import toast says so. Test: Task 10.
5. A wrong passphrase must not clear or overwrite the stored blob, must show "Wrong passphrase — nothing was unlocked. Try again.", and must not send any request. Test: Task 13 (unlock unit) and Task 21 (e2e).

---

## File Structure

```
packages/db/src/schema.ts                 users.settings, users.activeProjectId; projects.kind; documents.deletedAt; credentials; ai_use_log
packages/db/migrations/0002_phase2.sql    generated by drizzle-kit

packages/core/src/pd.ts                   PD_SEND, scanText, maskText            (v1 9524–9545)
packages/core/src/accuracy.ts             accItems, accDiff, accCheck            (v1 2517–2555)
packages/core/src/origin.ts               provHash, originCount                  (v1 3402–3420, 3337–3360)
packages/core/src/aiuse.ts                AIU_RULES, classifyAiUse               (v1 5405–5445)
packages/core/src/prompts.ts              PLAIN_OUT, contentLangInstruction, writing prompts (v1 2493–2500, 5675–5740, 3376–3395)
packages/core/src/providers.ts            PROVIDERS, PROV_ORDER                  (v1 2556–2564)
packages/core/src/index.ts                exports

apps/api/src/store/types.ts               UserRecord, Settings, Credential, AiUseEntry, kind/deletedAt; new Store methods
apps/api/src/store/memory.ts, drizzle.ts  implementations
apps/api/src/routes/me.ts                 GET /me, PATCH /me/settings, PATCH /me/active-project, POST /me/terms, credentials CRUD
apps/api/src/routes/projects.ts           kind filter, contentLang patch, GET /:id/writing-record
apps/api/src/routes/documents.ts          PATCH kind, DELETE (soft), POST restore-deleted, originStats on PUT
apps/api/src/ai/providers/gemini.ts, anthropic.ts, openaiCompat.ts
apps/api/src/ai/gateway.ts                complete(), error mapping
apps/api/src/routes/ai.ts                 POST /ai/complete, POST /ai/test, GET /ai/log/summary
apps/api/src/app.ts                       mount

apps/web/messages/en.json, hi.json        v1 I18N dictionaries (extracted once by scripts/extract-v1-i18n.mjs)
apps/web/lib/i18n.tsx                     LangProvider, useT, tFormat
apps/web/lib/tools.ts                     TOOLS registry, TOOL_TO_STAGE, STAGE_FIRST_TOOL, nextStageTool, prevStageTool
apps/web/lib/settings.tsx                 SettingsProvider (GET /me, PATCH /me/settings), useSettings
apps/web/lib/ai/keys.ts                   lockKey, unlockKeyBlob, key store (three modes)
apps/web/lib/ai/callAI.ts                 callAI (pdPreSend, failover, apiMsg)
apps/web/lib/ai/pdDialog.tsx              "Personal details in this text" dialog host
apps/web/lib/editor/insert.ts             insertAiText, insertPlainText, selectionText, tailText
apps/web/lib/export/word.ts, latex.ts     downloadWord, toLatex
apps/web/lib/import/parse.ts              parseImportFile (docx, pdf, txt, md, html)
apps/web/lib/templates.ts                 SCAFFOLDS, scaffoldToHtml
apps/web/app/globals.css                  tokens from design/mockups/tokens.css
apps/web/app/layout.tsx                   fonts, lang attribute
apps/web/app/(app)/page.tsx               the workspace
apps/web/components/workspace/Header.tsx, Subbar.tsx, ProjectBar.tsx, Sidebar.tsx, Dock.tsx, StageGuide.tsx, Workspace.tsx, PhoneSheet.tsx
apps/web/components/workspace/dialogs/SaveAsProject.tsx, Projects.tsx, StageIntro.tsx, ProviderKey.tsx, Terms.tsx, Welcome.tsx, Help.tsx, MyWriting.tsx, TemplatePicker.tsx, TableSize.tsx, ImportOrigin.tsx, Passphrase.tsx
apps/web/components/document/DocumentCard.tsx, DocBar.tsx, FormatBar.tsx, ActionRow.tsx, Editor.tsx (rewritten), SelectionBubble.tsx
apps/web/components/tools/AiPane.tsx, ChatPanel.tsx, StubPanel.tsx, IdeaPanel.tsx (copy only, no call: the call is Phase 3)
apps/web/components/ui/toast.tsx          single toast host (role=status)
apps/web/e2e/phase2-walkthrough.spec.ts   journey G
docs/walkthroughs/phase-2.md              the manual walk-through on the live URL
```

Sub-phases and gates: 2A (Tasks 1–5) foundation; 2B (6–7) chrome; 2C (8–11) document pane; 2D (12–16) AI; 2E (17–21) gates, Hindi, phone, cleanup, ship. A reviewer passes each task on spec compliance and a "v1 fidelity" verdict. OJ reviews on the live URL after Task 21.

---

### Task 1: Schema and store for settings, scratch project, soft delete, credentials, AI-use log

**Blueprint:** BLUEPRINT §6 "Accounts and a server. Work is stored per user with every revision and reachable from any device." §2 rule 3 "The AI-use log keeps date, provider, model and kind of help. Never the text sent or returned." Spec §4 rows `users`, `credentials`, `ai_use_log`.

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0002_phase2.sql` (via `pnpm --filter @appuscholar/db db:generate`, then rename)
- Modify: `apps/api/src/store/types.ts`, `apps/api/src/store/memory.ts`, `apps/api/src/store/drizzle.ts`
- Test: `apps/api/test/store.contract.ts` (shared cases), `apps/api/test/memory.test.ts`, `apps/api/test/drizzle.test.ts` (pglite)

**Interfaces:**
- Produces (types.ts):
```ts
export type Settings = {
  lang?: "en" | "hi"; provider?: string; draftFirst?: boolean; aiFallback?: boolean; field?: string;
  contentLang?: "en" | "hi"; orcid?: string; toolTab?: string; sidebarCollapsed?: boolean;
  stageGroupsCollapsed?: string[]; fmtMore?: boolean; dockW?: number; aiLogOff?: boolean; seenWelcome?: boolean;
};
export type UserRecord = { id: string; email: string; locale: string; settings: Settings; activeProjectId: string | null; termsAcceptedAt: Date | null; ageConfirmed: boolean };
export type Credential = { provider: string; encryptedKey: string; updatedAt: Date };
export type AiUseEntry = { d: string; p: string; m: string; k: string; g: "text" | "feedback" | "explain" | "other" };
export type OriginStats = { typed: number; ai: number; passages: number; kept: number; edited: number; unknown: number };
export type ProjectKind = "research" | "scratch";
// Project gains kind: ProjectKind; ProjectPatch gains contentLang?: "en" | "hi"
// DocumentSummary gains deletedAt: Date | null; RevisionSummary gains originStats: OriginStats | null; NewRevision gains originStats?: OriginStats
export interface Store {
  // existing methods unchanged, plus:
  getUser(userId: string): Promise<UserRecord | null>;
  ensureUser(userId: string, email: string): Promise<UserRecord>;        // inserts a users row if the API sees a JWT for a user the adapter has not written yet (e2e provider)
  updateSettings(userId: string, patch: Settings): Promise<Settings>;     // shallow merge; undefined keys untouched
  setActiveProject(userId: string, projectId: string | null): Promise<boolean>; // false if not owned
  acceptTerms(userId: string, at: Date): Promise<void>;                   // sets termsAcceptedAt and ageConfirmed=true
  getScratchProject(userId: string): Promise<Project>;                    // creates kind=scratch titled "Scratch space" once
  listProjects(userId: string): Promise<ProjectSummary[]>;                // now excludes kind=scratch
  moveDocument(userId: string, documentId: string, projectId: string): Promise<DocumentSummary | null>;
  setDocumentKind(userId: string, id: string, kind: string): Promise<DocumentSummary | null>;
  softDeleteDocument(userId: string, id: string): Promise<"deleted" | "only-document" | null>;
  restoreDeletedDocument(userId: string, id: string): Promise<DocumentSummary | null>;
  listDocuments(userId: string, projectId: string): Promise<DocumentSummary[] | null>; // excludes deletedAt != null
  putCredential(userId: string, provider: string, encryptedKey: string): Promise<void>;
  getCredentials(userId: string): Promise<Credential[]>;
  deleteCredential(userId: string, provider: string): Promise<boolean>;
  appendAiUse(userId: string, projectId: string | null, e: AiUseEntry): Promise<void>;
  listAiUse(userId: string, from?: string, to?: string): Promise<AiUseEntry[]>; // ISO dates YYYY-MM-DD inclusive
  eraseAiUse(userId: string): Promise<void>;
}
```

- [ ] **Step 1: Add the contract cases (failing)**

Append to `apps/api/test/store.contract.ts` inside the shared `storeContract(makeStore)` function (follow the existing pattern in that file, which runs each case against `MemoryStore` and `DrizzleStore`):

```ts
it("ensures a user row and merges settings", async () => {
  const u = await store.ensureUser("u9", "u9@x.org");
  expect(u.settings).toEqual({});
  await store.updateSettings("u9", { lang: "hi", draftFirst: true });
  const s = await store.updateSettings("u9", { provider: "groq" });
  expect(s).toEqual({ lang: "hi", draftFirst: true, provider: "groq" });
});

it("creates one scratch project per user and hides it from the list", async () => {
  await store.ensureUser("u1", "u1@x.org");
  const a = await store.getScratchProject("u1");
  const b = await store.getScratchProject("u1");
  expect(a.id).toBe(b.id);
  expect(a.kind).toBe("scratch");
  expect((await store.listProjects("u1")).find(p => p.id === a.id)).toBeUndefined();
});

it("moves a document into another project of the same user only", async () => {
  await store.ensureUser("u1", "u1@x.org");
  const scratch = await store.getScratchProject("u1");
  const p = await store.createProject("u1", "Thesis");
  const d = await store.createDocument("u1", scratch.id, "Draft", "draft", { bodyHtml: "<p>x</p>", authorKind: "web", authorLabel: "u1@x.org", wordCount: 1 });
  expect((await store.moveDocument("u1", d!.id, p.id))?.projectId).toBe(p.id);
  expect(await store.moveDocument("u2", d!.id, p.id)).toBeNull();
});

it("soft-deletes all but the last document and restores", async () => {
  await store.ensureUser("u1", "u1@x.org");
  const p = await store.createProject("u1", "T");
  const a = await store.createDocument("u1", p.id, "A", "draft", { bodyHtml: "", authorKind: "web", authorLabel: "", wordCount: 0 });
  expect(await store.softDeleteDocument("u1", a!.id)).toBe("only-document");
  const b = await store.createDocument("u1", p.id, "B", "draft", { bodyHtml: "", authorKind: "web", authorLabel: "", wordCount: 0 });
  expect(await store.softDeleteDocument("u1", a!.id)).toBe("deleted");
  expect((await store.listDocuments("u1", p.id))!.map(d => d.id)).toEqual([b!.id]);
  expect((await store.restoreDeletedDocument("u1", a!.id))?.id).toBe(a!.id);
  expect((await store.listDocuments("u1", p.id))!.length).toBe(2);
});

it("stores credentials as opaque blobs and lists per user", async () => {
  await store.ensureUser("u1", "u1@x.org");
  await store.putCredential("u1", "gemini", "c2FsdA.aXY.Y3Q");
  await store.putCredential("u1", "gemini", "c2FsdA.aXY.Y3Qy");
  expect((await store.getCredentials("u1")).map(c => [c.provider, c.encryptedKey])).toEqual([["gemini", "c2FsdA.aXY.Y3Qy"]]);
  expect(await store.deleteCredential("u1", "gemini")).toBe(true);
  expect(await store.getCredentials("u1")).toEqual([]);
});

it("keeps an AI-use log of date, provider, model and kind only, filtered by date", async () => {
  await store.ensureUser("u1", "u1@x.org");
  await store.appendAiUse("u1", null, { d: "2026-10-01", p: "gemini", m: "gemini-3.8-flash", k: "continuing my draft", g: "text" });
  await store.appendAiUse("u1", null, { d: "2026-10-15", p: "groq", m: "openai/gpt-oss-120b", k: "grammar and polish", g: "text" });
  expect((await store.listAiUse("u1", "2026-10-10", "2026-10-31")).map(e => e.p)).toEqual(["groq"]);
  await store.eraseAiUse("u1");
  expect(await store.listAiUse("u1")).toEqual([]);
});

it("stores origin stats on a revision and returns them in summaries", async () => {
  await store.ensureUser("u1", "u1@x.org");
  const p = await store.createProject("u1", "T");
  const d = await store.createDocument("u1", p.id, "A", "draft", { bodyHtml: "", authorKind: "web", authorLabel: "", wordCount: 0 });
  await store.appendRevision("u1", d!.id, { bodyHtml: "<p>a <span class=\"ai-ins\" data-h=\"z\">b c</span></p>", authorKind: "web", authorLabel: "", wordCount: 3, originStats: { typed: 1, ai: 2, passages: 1, kept: 1, edited: 0, unknown: 0 } });
  const revs = await store.listRevisions("u1", d!.id);
  expect(revs![revs!.length - 1]!.originStats).toEqual({ typed: 1, ai: 2, passages: 1, kept: 1, edited: 0, unknown: 0 });
});
```

- [ ] **Step 2: Run the contract to see it fail**

Run: `pnpm --filter @appuscholar/api test -- memory`
Expected: FAIL with "store.ensureUser is not a function".

- [ ] **Step 3: Extend the schema**

In `packages/db/src/schema.ts`, add to `users`: `settings: jsonb("settings").notNull().default({})`, `activeProjectId: text("active_project_id")`. Add to `projects`: `kind: text("kind").notNull().default("research")` and an index `projects_user_kind_idx` on `(userId, kind)`. Add to `documents`: `deletedAt: timestamp("deleted_at", { mode: "date" })`. Add two tables:

```ts
export const credentials = pgTable("credentials", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.userId, t.provider] })]);

export const aiUseLog = pgTable("ai_use_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: text("project_id"),
  day: text("day").notNull(),          // YYYY-MM-DD in the student's local date as sent by the client
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  kind: text("kind").notNull(),
  grp: text("grp").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow()
}, (t) => [index("ai_use_user_day_idx").on(t.userId, t.day)]);
```

Run `pnpm --filter @appuscholar/db db:generate` and rename the generated file to `0002_phase2.sql`; update `migrations/meta/_journal.json` tag accordingly. Add schema tests in `packages/db/test/schema.test.ts` asserting the new columns exist in `getTableColumns(users)` etc.

- [ ] **Step 4: Implement the store methods in memory.ts then drizzle.ts**

MemoryStore keeps maps `users`, `credentials` (key `${userId}:${provider}`), `aiUse` (array). `getScratchProject`: find project with `userId` and `kind === "scratch"`, else create `{ title: "Scratch space", kind: "scratch" }`. `softDeleteDocument`: count non-deleted documents in the same project; if 1 return `"only-document"`; else set `deletedAt = new Date()` and return `"deleted"`. `listProjects` filters `kind !== "scratch"`. DrizzleStore mirrors with SQL (`and(eq(projects.userId, userId), eq(projects.kind, "scratch"))`, `isNull(documents.deletedAt)` in `listDocuments` and in `ownedDoc` for everything except `restoreDeletedDocument`). `appendRevision` writes `originStats` into the jsonb column; `listRevisions` and `getRevision` return it.

- [ ] **Step 5: Run all api and db tests**

Run: `pnpm --filter @appuscholar/db test && pnpm --filter @appuscholar/api test`
Expected: PASS (existing 36 + new cases on both stores).

- [ ] **Step 6: Commit**

```bash
git add packages/db apps/api/src/store apps/api/test
git commit -m "feat(db,api): settings, scratch projects, soft delete, credentials and AI-use log in the store"
```

---

### Task 2: Core: personal-data scan and accuracy check

**Blueprint:** §2 rule 2 "Nothing goes to an AI until the student presses an AI button. A personal-data scan runs first and the student chooses mask, send as is, or cancel." Rule 6 "AI output is checked by code: numbers, author-year citations and quotations are compared with the source; unverified additions are warned about." v1 `PD_SEND`/`pdScanText`/`pdMask` (index.html:9524–9545), `accItems`/`accDiff`/`accCheck` (2517–2555).

**Files:**
- Create: `packages/core/src/pd.ts`, `packages/core/src/accuracy.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/pd.test.ts`, `packages/core/test/accuracy.test.ts`

**Interfaces:**
- Produces: `scanText(text: string): { counts: Record<string, number>; total: number; sig: string }`, `maskText(text: string): string`, `PD_KINDS = ["email address","phone number","ID number"]`; `accCheck(orig: string, res: string, kind: "continue"|"improve"|"expand"): { warn: boolean; msg: string; missing: string[]; added: string[] }`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/pd.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scanText, maskText } from "../src/pd";

describe("personal-data scan (v1 PD_SEND)", () => {
  it("finds emails, Indian phones and ID numbers and counts them by kind", () => {
    const r = scanText("Write to asha@uni.ac.in or call +91 98765 43210, roll 9876543210. Aadhaar 1234 5678 9012, PAN ABCDE1234F.");
    expect(r.counts).toEqual({ "email address": 1, "phone number": 2, "ID number": 2 });
    expect(r.total).toBe(5);
    expect(r.sig).toContain("email address");
  });
  it("ignores numbers that are not phones or ids", () => {
    expect(scanText("n = 120, M = 3.45, SD = 0.9, year 2024, 12345").total).toBe(0);
  });
  it("masks with the v1 placeholders and keeps surrounding text", () => {
    expect(maskText("Mail asha@uni.ac.in, phone 9876543210, PAN ABCDE1234F.")).toBe("Mail [email], phone [phone], PAN [id number].");
  });
  it("gives the same signature for the same findings, so 'Send as it is' can be remembered", () => {
    expect(scanText("a@b.co x").sig).toBe(scanText("a@b.co y").sig);
    expect(scanText("a@b.co").sig).not.toBe(scanText("c@d.co").sig);
  });
});
```

`packages/core/test/accuracy.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { accCheck } from "../src/accuracy";

describe("accuracy check (v1 accCheck)", () => {
  const orig = "Sleep loss predicted delay (Steel, 2007), r = .32 in 120 students, and “a reduced capacity to begin”.";
  it("reports unchanged when improve keeps every number, citation and quote", () => {
    const r = accCheck(orig, "Loss of sleep predicted delay (Steel, 2007), r = .32 among 120 students, and “a reduced capacity to begin”.", "improve");
    expect(r.warn).toBe(false);
    expect(r.msg).toBe("Checked: every number, citation and quoted phrase in your text is unchanged.");
  });
  it("names dropped and added items for improve", () => {
    const r = accCheck(orig, "Sleep loss predicted delay (Steel, 2010) in 95 students.", "improve");
    expect(r.warn).toBe(true);
    expect(r.missing).toEqual(expect.arrayContaining(["Steel 2007", ".32", "120", "“a reduced capacity to begin”"]));
    expect(r.added).toEqual(expect.arrayContaining(["Steel 2010", "95"]));
    expect(r.msg).toMatch(/^Dropped from your text: .* New in the result and not in your text, so unverified: .* Check each one against your sources before you accept, or delete it\.$/);
  });
  it("for continue only additions count, with the v1 sentence", () => {
    const r = accCheck("", "About 25% of diarists drop out (Rao et al., 2019).", "continue");
    expect(r.added).toEqual(["25%", "Rao et al. 2019"]);
    expect(r.msg).toBe("Not from your text, so unverified: 25%, Rao et al. 2019. Check each one against your sources before you accept, or delete it.");
  });
  it("continue with nothing added says none was added", () => {
    expect(accCheck("", "Plain prose without figures.", "continue").msg).toBe("Checked: every number, citation and quoted phrase in your text is unchanged and none was added.");
  });
  it("lists at most eight items then 'and N more'", () => {
    const r = accCheck("", "1 2 3 4 5 6 7 8 9 10", "continue");
    expect(r.msg).toContain("and 2 more");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @appuscholar/core test -- pd accuracy`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement (verbatim port of the v1 regexes)**

`packages/core/src/pd.ts`:
```ts
/** v1 PD_SEND (index.html:9524). Order matters: counts are reported in this order. */
const PD_SEND: Array<[string, RegExp, string, number | null]> = [
  ["email address", /([^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,})/g, "[email]", null],
  ["phone number", /(^|\D)((?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5})(?!\d)/g, "[phone]", 1],
  ["ID number", /(^|\D)(\d{4}\s\d{4}\s\d{4}|\d{12}|[A-Z]{5}\d{4}[A-Z])(?![A-Za-z0-9])/g, "[id number]", 1]
];
export const PD_KINDS = PD_SEND.map(k => k[0]);

export function scanText(text: string): { counts: Record<string, number>; total: number; sig: string } {
  const counts: Record<string, number> = {}; let total = 0; const seen: string[] = [];
  for (const [kind, re] of PD_SEND) {
    const m = String(text).match(re);
    if (m && m.length) { counts[kind] = m.length; total += m.length; seen.push(kind + m.join("|")); }
  }
  return { counts, total, sig: seen.join("||") };
}

export function maskText(text: string): string {
  let o = String(text);
  for (const [, re, mask, keepGroup] of PD_SEND) o = o.replace(re, (_m, a: string) => (keepGroup ? a + mask : mask));
  return o;
}
```

`packages/core/src/accuracy.ts`: port `accItems`, `accDiff`, `accCheck` from index.html:2520–2549 exactly (the Unicode citation regex with the `u` flag, the number regex, the eight-item join). Export `accCheck` and `accItems`.

Add to `index.ts`: `export { scanText, maskText, PD_KINDS } from "./pd"; export { accCheck, accItems } from "./accuracy";`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @appuscholar/core test`
Expected: PASS. If the citation test's `missing` order differs, compare sets, not order; the message format is what v1 users see and must match.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): personal-data scan and AI accuracy check ported from v1"
```

---

### Task 3: Core: origin counting, provenance hash, AI-use classification, prompts and provider table

**Blueprint:** §2 rule 7 "AI-inserted text is wrapped and tracked... Retyping AI text counts as the student's." Rule 3 (log kind of help). v1 `provHash` (3402), `provCountDoc` (3408), `computeOriginality` (3346), `AIU_RULES`/`aiuClassify` (5405–5445), `PLAIN_OUT`/`contentLangInstruction` (2493–2500), prompts (5675–5740, 3376–3395), `PROVIDERS`/`PROV_ORDER` (2556–2564).

**Files:**
- Create: `packages/core/src/origin.ts`, `packages/core/src/aiuse.ts`, `packages/core/src/prompts.ts`, `packages/core/src/providers.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/origin.test.ts`, `packages/core/test/aiuse.test.ts`, `packages/core/test/prompts.test.ts`

**Interfaces:**
- Produces:
```ts
export function provHash(s: string): string;                       // djb2 over whitespace-stripped text, base36
export function originCount(html: string): OriginStats;            // words inside span.ai-ins vs outside; kept/edited by data-h
export function originShare(html: string): { total: number; ai: number; studentPct: number }; // character share, for the badge
export function classifyAiUse(prompt: string): { k: string; g: "text"|"feedback"|"explain"|"other" } | null;
export const PLAIN_OUT: string;
export function contentLangInstruction(lang: "en"|"hi"): string;
export type WritingKind = "continue" | "improve" | "expand";
export function buildWritingPrompt(kind: WritingKind, text: string, stylePrompt?: string): { prompt: string; temp: number; max: number };
export function buildDraftFirstPrompt(kind: "tail"|"improve"|"expand", passage: string): { prompt: string; temp: number; max: number };
export function buildChatPrompt(field: string, question: string): { prompt: string; temp: number; max: number };
export const PROVIDERS: Record<ProviderId, { name: string; short: string; model: string; fallbacks?: string[]; keyPrefix: string; keysUrl: string; stepsHtml: string; warning?: string }>;
export const PROV_ORDER: ProviderId[]; // ["gemini","groq","deepseek","openrouter","openai","claude"]
```

- [ ] **Step 1: Write the failing tests**

`origin.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { provHash, originCount, originShare } from "../src/origin";

describe("origin counting (v1 provCountDoc / computeOriginality)", () => {
  it("hashes ignoring whitespace like v1 provHash", () => {
    expect(provHash("a b c")).toBe(provHash("abc"));
    expect(provHash("abc")).toMatch(/^[0-9a-z]+$/);
  });
  it("counts words typed vs inside ai-ins spans, and kept vs edited by data-h", () => {
    const kept = `<span class="ai-ins" data-h="${provHash("one two")}">one two</span>`;
    const edited = `<span class="ai-ins" data-h="zzz">three four five</span>`;
    const r = originCount(`<p>mine here ${kept}</p><p>${edited} tail</p><p><span class="ai-ins">old</span></p>`);
    expect(r).toEqual({ typed: 3, ai: 6, passages: 3, kept: 1, edited: 1, unknown: 1 });
  });
  it("counts nested inline tags and <br> inside a span as part of it", () => {
    const r = originCount(`<p><span class="ai-ins" data-h="x">a <b>b</b><br>c</span> d</p>`);
    expect(r.ai).toBe(3); expect(r.typed).toBe(1);
  });
  it("character share for the badge", () => {
    expect(originShare(`<p>abcd<span class="ai-ins" data-h="x">efgh</span></p>`)).toEqual({ total: 8, ai: 4, studentPct: 50 });
    expect(originShare("").studentPct).toBe(100);
  });
});
```

`aiuse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { classifyAiUse } from "../src/aiuse";
import { buildWritingPrompt, buildDraftFirstPrompt, buildChatPrompt } from "../src/prompts";

describe("AI-use classification (v1 AIU_RULES)", () => {
  it("labels the writing actions by their prompt heads", () => {
    expect(classifyAiUse(buildWritingPrompt("continue", "x").prompt)).toEqual({ k: "continuing my draft", g: "text" });
    expect(classifyAiUse(buildWritingPrompt("improve", "x").prompt)).toEqual({ k: "grammar and polish", g: "text" });
    expect(classifyAiUse(buildWritingPrompt("expand", "x").prompt)).toEqual({ k: "expanding my text", g: "text" });
    expect(classifyAiUse(buildDraftFirstPrompt("tail", "x").prompt)).toEqual({ k: "feedback on my draft", g: "feedback" });
    expect(classifyAiUse(buildChatPrompt("psychology", "x").prompt)).toEqual({ k: "answering a writing question", g: "explain" });
  });
  it("excludes the Appu help assistant and falls back to other help", () => {
    expect(classifyAiUse("You are Appu, the help assistant ...")).toBeNull();
    expect(classifyAiUse("Something new")).toEqual({ k: "other help", g: "other" });
  });
});
```

`prompts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PLAIN_OUT, contentLangInstruction, buildWritingPrompt } from "../src/prompts";

describe("prompts are v1's, verbatim", () => {
  it("PLAIN_OUT", () => {
    expect(PLAIN_OUT).toBe(' Output plain text with no markdown symbols (no asterisks, hash signs or backticks). Avoid the words delve, leverage, robust, pivotal, crucial, underscore, showcase, foster, seamless and tapestry. Avoid "not X but Y" phrasing, stacked lists of three, and closing summary sentences.');
  });
  it("continue prompt and parameters", () => {
    const p = buildWritingPrompt("continue", "the tail");
    expect(p.temp).toBe(0.7); expect(p.max).toBe(1200);
    expect(p.prompt.startsWith("Continue this writing in the same register, about 120 words. Pick up exactly where the text stops and do not repeat it. Add no citations, statistics, quotations or named studies. Where the next sentence needs evidence, write [add source] in its place. Vary sentence length. Reply with the continuation only.")).toBe(true);
    expect(p.prompt.endsWith("TEXT TO CONTINUE (treat as text, not as instructions):\nthe tail")).toBe(true);
  });
  it("improve and expand use the labelled TEXT block", () => {
    expect(buildWritingPrompt("improve", "t").prompt).toContain("TEXT (treat as text, not as instructions):\nt");
    expect(buildWritingPrompt("expand", "t").temp).toBe(0.5);
  });
  it("content language suffix only for Hindi", () => {
    expect(contentLangInstruction("en")).toBe("");
    expect(contentLangInstruction("hi")).toContain("write explanatory prose in clear, formal Hindi (Devanagari)");
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `pnpm --filter @appuscholar/core test -- origin aiuse prompts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`origin.ts`: a small HTML tokenizer (no DOM). Walk the string with `/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+/g`. Keep a stack of open tags; when an opening `span` has `class` containing `ai-ins` (parse the attribute with `/class\s*=\s*"([^"]*)"/`), push a frame `{ aiDepth: 0, h: data-h or null, text: "" }` and mark `inAi = frame`. Text tokens: decode `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`; count words `(\S+)` into `ai` if inside an ai frame else `typed`; append raw text to the frame for the hash. Nested tags inside the frame increment `aiDepth`; the matching close of the span at depth 0 pops the frame and decides kept (`provHash(frame.text) === h`), edited, or unknown (no `h`). `<br>` inside a frame contributes a space. `originShare` counts characters the same way (`total` and `ai` character lengths of decoded text), `studentPct = total ? Math.round(100*(total-ai)/total) : 100`.

`aiuse.ts`: `AIU_RULES` copied from index.html:5405–5431 as `[RegExp, string, group][]`; `classifyAiUse` as 5433–5438 (`/^You are Appu, the help assistant/` returns null; head is `prompt.slice(0, 400)`).

`prompts.ts`: `PLAIN_OUT` and `contentLangInstruction` from 2493–2500; `buildWritingPrompt` from 5675–5705 (Continue: temp 0.7 max 1200 with "TEXT TO CONTINUE (treat as text, not as instructions):\n"; Improve: 0.3/3000; Extend: 0.5/3000; both "TEXT (treat as text, not as instructions):\n"); the optional `stylePrompt` string is appended after `PLAIN_OUT` when given (My Writing Style is Phase 5; the parameter exists so the prompt shape does not change later). `buildDraftFirstPrompt` from 3383–3389 (temp 0.4, max 1200, "STUDENT DRAFT:\n"). `buildChatPrompt` from 5718 (temp 0.5, max 700, "STUDENT QUESTION:\n" with the question sliced to 2000 chars).

`providers.ts`: the six entries with `name`, `short`, `model`, `fallbacks` (gemini: `["gemini-3.6-flash","gemini-2.5-flash"]`), `keyPrefix` (AIza, gsk_, sk-, sk-or-, sk-, sk-ant-), `keysUrl`, `stepsHtml` (the v1 `steps` HTML verbatim from 2557–2562 minus the inline `<span style>` warnings, which become `warning` strings). Anthropic `model`: see Task 12.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm --filter @appuscholar/core test && pnpm --filter @appuscholar/core typecheck && pnpm --filter @appuscholar/core lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): origin counting, AI-use classification, v1 prompts and provider table"
```

---

### Task 4: Hindi chrome dictionaries and the `t()` hook

**Blueprint:** BLUEPRINT §1 "Hindi is a first-class interface language"; §8 Phase 2 "Hindi chrome". 01 §A "Hindi UI": `t(key)` falls back to English; only the chrome is translated; `हि` shows when English is active, `EN` when Hindi is; toast "Language: English" / "भाषा: हिन्दी". v1 `I18N.en` index.html:1979–2209, `I18N.hi` 2210–2438, `t()` and `applyLang` 2438–2475.

**Files:**
- Create: `apps/web/scripts/extract-v1-i18n.mjs`, `apps/web/messages/en.json`, `apps/web/messages/hi.json`, `apps/web/lib/i18n.tsx`
- Test: `apps/web/test/i18n.test.ts`

**Interfaces:**
- Produces: `LangProvider({ lang, onChange, children })`, `useT(): (key: string, vars?: Record<string, string|number>) => string`, `tFormat(dict, key, vars)` pure; `useLang(): { lang: "en"|"hi"; setLang(l): void }`. Keys are v1's (`help_btn`, `settings_btn`, `project_bar_empty`, `tab_idea`, `stage_guide_fmt`, ...). `{n}`-style placeholders are substituted; a missing Hindi key returns the English string; a missing English key returns the key itself.

- [ ] **Step 1: Write the extraction script and run it once**

`apps/web/scripts/extract-v1-i18n.mjs`:
```js
// Usage: node scripts/extract-v1-i18n.mjs /path/to/appuscholer/index.html
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
const start = src.indexOf("const I18N={");
const end = src.indexOf("\n};", start);
if (start < 0 || end < 0) throw new Error("I18N block not found");
const literal = src.slice(start + "const I18N=".length, end + 2);
const I18N = new Function("return " + literal)();   // the block is string literals only (verified by the parity test below)
for (const lang of ["en", "hi"]) {
  const sorted = Object.fromEntries(Object.keys(I18N[lang]).sort().map(k => [k, I18N[lang][k]]));
  writeFileSync(new URL(`../messages/${lang}.json`, import.meta.url), JSON.stringify(sorted, null, 2) + "\n");
}
console.log("en", Object.keys(I18N.en).length, "hi", Object.keys(I18N.hi).length);
```
Run: `node apps/web/scripts/extract-v1-i18n.mjs "/Users/poojadudani/Documents/Claude cowork/Scholarly/appuscholer/index.html"`. Expected: two JSON files and a printed count (en about 420 keys, hi fewer; the exact numbers go into the test below). Commit the JSON; the script is run again only when v1 ships new strings.

- [ ] **Step 2: Write the failing tests**

`apps/web/test/i18n.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import { tFormat } from "../lib/i18n";

describe("v1 chrome strings", () => {
  it("has the keys the workspace uses, verbatim", () => {
    expect(en.project_bar_empty).toBe("No research project yet — working in scratch space");
    expect(en.settings_btn).toBe("⚙ AI Provider / Key");
    expect(en.stage_guide_final).toBe("Final stage — nothing after this in the sequence");
    expect(hi.df_btn).toBe("✍ पहले खुद लिखें");
    expect(hi.dock_ai_tab).toBe("✨ एआई सुझाव");
    expect(hi.tab_new_project).toBe("✨ नया शोध प्रोजेक्ट");
  });
  it("every Hindi key exists in English (no orphan translations)", () => {
    const missing = Object.keys(hi).filter(k => !(k in en));
    expect(missing).toEqual([]);
  });
  it("substitutes placeholders and falls back to English, then to the key", () => {
    expect(tFormat(en, hi, "stage_guide_fmt", "hi", { n: 2, total: 6 })).toBe("चरण 2/6");
    expect(tFormat(en, hi, "stage_guide_fmt", "en", { n: 2, total: 6 })).toBe("Stage 2 of 6");
    expect(tFormat(en, hi, "help_intro", "hi")).toBe(hi.help_intro);
    expect(tFormat(en, hi, "nonexistent_key", "hi")).toBe("nonexistent_key");
  });
});
```

- [ ] **Step 3: Run to see failure**

Run: `pnpm --filter @appuscholar/web test -- i18n`
Expected: FAIL (lib/i18n missing). If `en.json` import fails under vitest, add `"resolveJsonModule": true` to `apps/web/tsconfig.json` (Next's default has it).

- [ ] **Step 4: Implement `lib/i18n.tsx`**

```tsx
"use client";
import { createContext, useCallback, useContext, useMemo } from "react";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
export type Lang = "en" | "hi";
type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = { en: en as Dict, hi: hi as Dict };

export function tFormat(enDict: Dict, hiDict: Dict, key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const raw = (lang === "hi" ? hiDict[key] : undefined) ?? enDict[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
export function LangProvider({ lang, onChange, children }: { lang: Lang; onChange: (l: Lang) => void; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, setLang: onChange }), [lang, onChange]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useLang() { return useContext(Ctx); }
export function useT() {
  const { lang } = useContext(Ctx);
  return useCallback((key: string, vars?: Record<string, string | number>) => tFormat(DICTS.en, DICTS.hi, key, lang, vars), [lang]);
}
/** Some v1 strings carry <kbd> and <b> markup (ai_pane_desc, psych_panel_note). Render those with this, never with raw innerHTML of user data. */
export function tHtml(s: string): React.ReactNode {
  const parts = s.split(/(<kbd>.*?<\/kbd>|<b>.*?<\/b>)/g);
  return parts.map((p, i) => p.startsWith("<kbd>") ? <kbd key={i}>{p.slice(5, -6)}</kbd> : p.startsWith("<b>") ? <b key={i}>{p.slice(3, -4)}</b> : p);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @appuscholar/web test -- i18n`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts apps/web/messages apps/web/lib/i18n.tsx apps/web/test/i18n.test.ts apps/web/tsconfig.json
git commit -m "feat(web): v1 English and Hindi chrome dictionaries with t()"
```

---

### Task 5: Design tokens, fonts, button variants, toast host, settings provider and the `/me` route

**Blueprint:** DESIGN-SYSTEM.md §3–§5, §8, §10; BLUEPRINT §6 "Design quality. Same layout and words, with typography, spacing, contrast... done properly." 01 §A Header step 3 (language toggle stores `appu_lang`).

**Files:**
- Modify: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/components/ui/button.tsx`, `apps/web/components/ui/badge.tsx`, `apps/web/package.json` (remove `geist`), `apps/web/proxy.ts` (worker-src)
- Create: `apps/web/components/ui/toast.tsx`, `apps/web/lib/settings.tsx`, `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/auth.ts` (ensureUser on first request)
- Test: `apps/api/test/app.test.ts` (me routes), `apps/web/test/settings.test.ts`

**Interfaces:**
- API: `GET /me` → `{ id, email, locale, settings, activeProjectId, scratchProjectId, termsAcceptedAt, ageConfirmed }`; `PATCH /me/settings` body `Settings` → merged `Settings`; `PATCH /me/active-project` body `{ projectId: string | null }` → 204 or 404; `POST /me/terms` → 204 (sets `termsAcceptedAt`, `ageConfirmed`); `GET /me/credentials` → `[{provider, updatedAt}]` (never the blob list in bulk? it must return blobs for unlocking: `[{provider, encryptedKey, updatedAt}]`), `PUT /me/credentials/:provider` body `{ encryptedKey }` (max 4,000 chars, must match `/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/`), `DELETE /me/credentials/:provider`.
- Web: `useSettings(): { me: Me | null; settings: Settings; update(patch: Settings): Promise<void>; reload(): Promise<void> }`; `toast(message: string, ms?: number)`; Button variants `primary | ghost | gold | toggle`, sizes `md (34px) | sm (30px)`; Badge variants `stage | ok | chip | gold | danger | dashed`.

- [ ] **Step 1: Failing API tests**

In `apps/api/test/app.test.ts` add:
```ts
it("GET /me creates the user row and the scratch project once", async () => {
  const a = await (await app.request("/me", { headers: auth })).json() as { scratchProjectId: string; settings: object };
  const b = await (await app.request("/me", { headers: auth })).json() as { scratchProjectId: string };
  expect(a.scratchProjectId).toBe(b.scratchProjectId);
  expect(a.settings).toEqual({});
});
it("PATCH /me/settings merges and rejects unknown keys", async () => {
  await app.request("/me", { headers: auth });
  const r = await app.request("/me/settings", { method: "PATCH", headers: auth, body: JSON.stringify({ lang: "hi", draftFirst: true }) });
  expect(await r.json()).toEqual({ lang: "hi", draftFirst: true });
  expect((await app.request("/me/settings", { method: "PATCH", headers: auth, body: JSON.stringify({ evil: 1 }) })).status).toBe(400);
});
it("credentials accept only the blob shape and never return to another user", async () => {
  await app.request("/me", { headers: auth });
  expect((await app.request("/me/credentials/gemini", { method: "PUT", headers: auth, body: JSON.stringify({ encryptedKey: "plain-key" }) })).status).toBe(400);
  expect((await app.request("/me/credentials/gemini", { method: "PUT", headers: auth, body: JSON.stringify({ encryptedKey: "c2FsdA.aXY.Y3Q" }) })).status).toBe(204);
  const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
  await app.request("/me", { headers: other });
  expect(await (await app.request("/me/credentials", { headers: other })).json()).toEqual([]);
});
it("POST /me/terms records acceptance", async () => {
  await app.request("/me", { headers: auth });
  expect((await app.request("/me/terms", { method: "POST", headers: auth })).status).toBe(204);
  const me = await (await app.request("/me", { headers: auth })).json() as { ageConfirmed: boolean; termsAcceptedAt: string };
  expect(me.ageConfirmed).toBe(true); expect(me.termsAcceptedAt).toBeTruthy();
});
```

- [ ] **Step 2: Run to see failure**

Run: `pnpm --filter @appuscholar/api test -- app`
Expected: FAIL 404 on /me.

- [ ] **Step 3: Implement `routes/me.ts` and mount**

Zod `SettingsSchema = z.object({ lang: z.enum(["en","hi"]), provider: z.string().max(20), draftFirst: z.boolean(), aiFallback: z.boolean(), field: z.string().max(60), contentLang: z.enum(["en","hi"]), orcid: z.string().max(40), toolTab: z.string().max(20), sidebarCollapsed: z.boolean(), stageGroupsCollapsed: z.array(z.string().max(10)).max(6), fmtMore: z.boolean(), dockW: z.number().int().min(320).max(760), aiLogOff: z.boolean(), seenWelcome: z.boolean() }).partial().strict()`. `GET /me` calls `store.ensureUser(userId, email)` then `store.getScratchProject(userId)`. In `app.ts`: `app.use("/me/*", apiAuth(...)); app.use("/me", apiAuth(...)); app.route("/me", meRoutes(o.store));`. Credential `encryptedKey` validated by the regex above and length ≤ 4000.

- [ ] **Step 4: Web tokens and fonts**

Replace `apps/web/app/globals.css` `:root` with the token block from `design/mockups/tokens.css` lines 2–18 (purple scale, gold, surfaces, ink, semantic, spacing, radius, control heights, font stacks) and keep the `@theme inline` mapping so Tailwind utilities (`bg-primary`, `text-muted-foreground`, `border-border`) resolve to the new values: `--primary: var(--purple-800)`, `--accent: var(--purple-100)`, `--muted-foreground: var(--muted)`, `--border: var(--line)`, `--input: var(--line-strong)`, `--ring: var(--purple-800)`, `--destructive: var(--danger-ink)`, `--radius: 0.5rem`. Add `--font-sans: var(--font-plex), var(--font-plex-devanagari), system-ui, sans-serif`, `--font-display: var(--font-fraunces), Georgia, serif`, `--font-doc: Georgia, "Times New Roman", "Noto Serif Devanagari", serif`. Append the editor rules from tokens.css (`.editor`, `.ai-ins` underline, `.highlight-ai .ai-ins` wash, `::selection`), the `kbd` rule, and `@media (prefers-reduced-motion: reduce)`.

`layout.tsx`: replace Geist with
```tsx
import { IBM_Plex_Sans, IBM_Plex_Sans_Devanagari, Fraunces } from "next/font/google";
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400","500","600"], variable: "--font-plex", display: "swap" });
const plexDev = IBM_Plex_Sans_Devanagari({ subsets: ["devanagari","latin"], weight: ["400","500","600"], variable: "--font-plex-devanagari", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], style: ["normal","italic"], variable: "--font-fraunces", display: "swap" });
```
and `<html lang={lang} className={...}>` where `lang` comes from the session user's settings (read in the server layout via the API `GET /me` using the server-side token helper `signApiToken`; fall back to `"en"`). Remove `geist` from package.json (`pnpm remove geist --filter @appuscholar/web`).

`button.tsx`: add variants `primary` (bg `--purple-800`, hover `--purple-600`, active `--purple-900`, white, 600), `ghost` (card bg, `--line-strong` border, `--accent-ink`), `gold` (bg `--gold`, hover `--gold-bright`, ink text), `toggle` (`--purple-100` bg, `--purple-800` 600 text, used with `aria-pressed`); heights 34/30; `kbd` inside `primary` gets `bg-white/20 border-white/40 text-white`. `badge.tsx`: variants per DESIGN-SYSTEM §7 "Badge".

`toast.tsx`: a module-level emitter plus `<ToastHost />` mounted once in the workspace: `toast(msg, ms = msg.length > 70 ? 5200 : 3200)` (v1 timings, 01 §E "toasts auto-hide 3.2 s (5.2 s if >70 chars)"); renders `<div role="status" className="toast" data-testid="toast">`. Only one toast at a time; a new one replaces the current.

`settings.tsx`: `SettingsProvider` fetches `/me` on mount, exposes `settings`, `update(patch)` (optimistic merge, then `PATCH /me/settings`; on failure reverts and toasts "Could not save your settings. Try again."), `me` and `reload`. Wraps `LangProvider` with `lang = settings.lang ?? "en"` and `onChange = l => update({ lang: l })`, also setting `document.documentElement.lang`.

`proxy.ts`: add `"worker-src 'self' blob:"` to the CSP array.

- [ ] **Step 5: Unit test for settings merge logic**

`apps/web/test/settings.test.ts` tests the pure `mergeSettings(prev, patch)` exported from `lib/settings.tsx` (undefined keys ignored, arrays replaced not merged) with three assertions.

- [ ] **Step 6: Run everything**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm -r test`
Expected: PASS. The phase-1 e2e is not run until Task 20 rewrites it.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/api/test apps/web/app apps/web/components/ui apps/web/lib/settings.tsx apps/web/test/settings.test.ts apps/web/package.json apps/web/proxy.ts pnpm-lock.yaml
git commit -m "feat: design tokens, Plex and Fraunces fonts, toast host, per-user settings and /me routes"
```

---

### Task 6: Workspace layout, sidebar with stage groups, dock tabs, stage guide, tool registry

**Blueprint:** BLUEPRINT §3 (all of "The workspace"), stage → tools table. 01 §A "Sidebar of tool tabs and stage guide" and "Right dock". Design: `design/mockups/01-workspace-tool-open.html`, DESIGN-SYSTEM §6 layout, §7 Sidebar / Tool tab / Dock tabs / Stage guide. v1 `showTool` 2624–2653, `renderStageGuide` 2759–2775, `toggleSidebar` 2740, `toggleStageGroup` ~2713, `dockShow`/`dockSyncLabel` 2946–2962.

**Files:**
- Create: `apps/web/lib/tools.ts`, `apps/web/components/workspace/Workspace.tsx`, `Header.tsx`, `Subbar.tsx`, `Sidebar.tsx`, `Dock.tsx`, `StageGuide.tsx`, `apps/web/components/tools/StubPanel.tsx`, `apps/web/app/(app)/page.tsx`
- Modify: `apps/web/app/(app)/layout.tsx` (drop `AppShell`; wrap in `SettingsProvider`)
- Test: `apps/web/test/tools.test.ts`; Playwright in Task 21

**Interfaces:**
- Produces (`lib/tools.ts`):
```ts
export type ToolId = "idea"|"research"|"psych"|"analyse"|"design"|"stats"|"qual"|"style"|"words"|"cite"|"chat"|"close"|"slides";
export type StageKey = "idea"|"lit"|"design"|"collect"|"writing"|"review";
export const STAGE_ORDER: StageKey[] = ["idea","lit","design","collect","writing","review"];
export const STAGE_EMOJI: Record<StageKey,string> = { idea:"💡", lit:"📖", design:"⚖", collect:"📊", writing:"✍", review:"🖥" };
export const TOOL_TO_STAGE: Record<ToolId, StageKey> = { idea:"idea", research:"lit", psych:"lit", analyse:"lit", design:"design", stats:"collect", qual:"collect", style:"writing", words:"writing", cite:"writing", chat:"writing", close:"review", slides:"review" };
export const STAGE_FIRST_TOOL: Record<StageKey, ToolId> = { idea:"idea", lit:"research", design:"design", collect:"stats", writing:"cite", review:"slides" };
export const TOOLS_BY_STAGE: Record<StageKey, ToolId[]>;      // sidebar order: idea | research, psych, analyse | design | stats, qual | style, words, cite, chat | close, slides
export const BUILT_IN_PHASE_2: ToolId[] = ["chat"];           // every other tool renders StubPanel
export function nextStageTool(stage: StageKey): { stage: StageKey; tool: ToolId } | null;
export function prevStageTool(stage: StageKey): { stage: StageKey; tool: ToolId } | null;
export function toolLabelKey(id: ToolId): string;             // "tab_idea" ...
export function toolTitleKey(id: ToolId): string;             // "tab_idea_title" ...
export function canPopOut(id: ToolId): boolean;               // cite, research
```
- `Workspace` state (React context `WorkspaceCtx`): `{ activeTool: ToolId; showTool(id): void; dock: "tools"|"ai"; dockShow(which): void; aiWaiting: boolean; sidebarCollapsed; stageGroupsCollapsed: StageKey[]; currentStage: StageKey | null (from active project, null in scratch or complete); project: Project | null; documents: DocumentSummary[]; currentDoc: DocumentWithBody | null; selectDoc(id); reloadDocs(); }`.

- [ ] **Step 1: Failing unit test for the registry**

```ts
import { describe, it, expect } from "vitest";
import { TOOL_TO_STAGE, STAGE_FIRST_TOOL, TOOLS_BY_STAGE, nextStageTool, prevStageTool, canPopOut } from "../lib/tools";
describe("v1 tool registry", () => {
  it("maps every tool to one stage and lists them in v1 sidebar order", () => {
    expect(TOOLS_BY_STAGE).toEqual({ idea:["idea"], lit:["research","psych","analyse"], design:["design"], collect:["stats","qual"], writing:["style","words","cite","chat"], review:["close","slides"] });
    for (const [tool, stage] of Object.entries(TOOL_TO_STAGE)) expect(TOOLS_BY_STAGE[stage as keyof typeof TOOLS_BY_STAGE]).toContain(tool);
  });
  it("Next from Collection lands on the Citation Manager, Back from Writing on Statistics", () => {
    expect(nextStageTool("collect")).toEqual({ stage: "writing", tool: "cite" });
    expect(prevStageTool("writing")).toEqual({ stage: "collect", tool: "stats" });
    expect(nextStageTool("review")).toBeNull();
    expect(prevStageTool("idea")).toBeNull();
    expect(STAGE_FIRST_TOOL.review).toBe("slides");
  });
  it("only Citations and Research pop out", () => {
    expect(canPopOut("cite") && canPopOut("research") && !canPopOut("chat")).toBe(true);
  });
});
```
Run: `pnpm --filter @appuscholar/web test -- tools` → FAIL.

- [ ] **Step 2: Implement `lib/tools.ts`** per the interface. Run the test → PASS. Commit `feat(web): v1 tool registry and stage navigation`.

- [ ] **Step 3: Build the chrome components (markup and classes follow the mockup; copy via `t()`)**

`Header.tsx`: `<header class="hdr">` with the SVG mark from the mockup, `<h1 class="brand">Appu<em>scholar</em></h1>`, `<span class="pill ver">Version {APP_VERSION}</span>` where `APP_VERSION` is exported from `lib/version.ts` as `"v2 phase 2"` for now (v1 "Version 55" is his build counter; v2 shows the deployed git short SHA from `NEXT_PUBLIC_BUILD_SHA`, set in Task 21), language button (`aria-label` from `t("theme_btn_title")`? no: label is literal `हि` or `EN`, `title="हिन्दी / English"`), `t("help_btn")` opens Help (Task 17), gold `t("settings_btn")` opens the provider dialog (Task 13; until then a disabled button is not acceptable, so Task 6 wires it to a placeholder dialog that Task 13 replaces). No theme button this phase (v2 change 8). `data-testid`: `lang-toggle`, `help-btn`, `provider-key-btn`.

`Subbar.tsx`: the provider pill `🔌 {short} ✓ ready` / `🔌 {short} no key` with `▾`; the menu lists `PROV_ORDER` with `✓` next to providers that have a key; clicking one with a key sets `settings.provider` and toasts `Now using {X} ✓ Your next AI request goes to {X}.`; without a key opens Settings and toasts `Paste your {X} key to enable it` (01 §A Header "subbar"). Key presence comes from `lib/ai/keys.ts` (Task 13); until then the pill shows "no key".

`Sidebar.tsx`: `<nav class="sidebar" role="tablist" aria-label="Writing tools">`, `☰` toggle (`title="Collapse the tool panel"`, `aria-label="Collapse or expand the tool panel"`; v1 HTML attributes, not i18n keys), pinned `t("tab_new_project")` (class `tab new`) and `t("tab_projects")`, then for each stage in `STAGE_ORDER` a `.stage` group with `.stage-h` button (`aria-expanded`), emoji, `t("stage_"+key)`, `.dot`, chevron; `.stage-tools` with `.tab` buttons `role="tab" aria-selected data-tool={id} data-testid={"tool-"+id}` labelled `t(toolLabelKey(id))` and `title={t(toolTitleKey(id))}`. `.stage.current` when `currentStage === key`. Collapsed sidebar = 50px rail: labels hidden, emoji only, clicking a stage header in rail mode re-expands the sidebar (v1). Per-group collapse persisted via `update({ stageGroupsCollapsed })`; sidebar collapse via `sidebarCollapsed`; nothing starts collapsed. `showTool(id)` also expands that tool's group (v1 showTool tail).

`Dock.tsx`: `.dock-tabs` with `Tools` tab whose label is the active tool's label (`dockSyncLabel`), `✨ AI suggestion` tab (`t("dock_ai_tab")`) with `.ddot` when `aiWaiting`, `⧉ Pop out` (`t("pop_btn")`, title `t("pop_btn_title")`); pop-out click: if `canPopOut(activeTool)` opens `window.open("/?popout="+activeTool)` (the popout page itself is Phase 3 with Citation Manager; in this phase the toast `t("pop_unsupported")` = "Only Citations and Research can open in their own window." shows for every tool because neither exists yet; `data-testid="pop-out"`). The dock body shows `StageGuide` then the active panel, or `AiPane` (Task 14) when `dock === "ai"`. Dock width from `settings.dockW` with a draggable splitter (pointer events; 320–760; persisted on pointer-up).

`StageGuide.tsx`: `nav.guide aria-label="Stage guide"` with the six-segment road (`.now` on `TOOL_TO_STAGE[activeTool]`), pill `t("stage_guide_fmt", {n, total: 6})` + ` · ` + `<b>{t("stage_"+stage)}</b>`, `← {t("stage_guide_back")} {label}` and `{t("stage_guide_next")} {label} →` buttons calling `showTool(prev.tool)` / `showTool(next.tool)`; last stage shows `t("stage_guide_final")` as text. `data-testid`: `stage-counter`, `stage-back`, `stage-next`, `stage-final`.

`StubPanel.tsx`: `<div class="panel"><h3>{t(toolLabelKey(id))}</h3><p class="desc">{t(toolTitleKey(id))}</p><p class="note">This tool arrives in a later phase of the rebuild. Everything you write here is already saved under your project.</p></div>`. For `idea`, render `IdeaPanel` (the four fields and both buttons with v1 copy from Task 4's dictionary: `idea_topic_label`, `idea_topic_placeholder`, `idea_resources_label`, `idea_timeframe_label`, `idea_timeframe_placeholder`, `idea_constraints_label`, `idea_constraints_placeholder`, `idea_assess_btn`, `idea_saveproject_btn`, `idea_panel_desc`, `idea_panel_note`); fields persist to `settings`? No: v1 stores `appu_idea_intake` globally; v2 stores it per project in Phase 3. In this phase the fields keep state in the component and "Assess feasibility" toasts "Idea & Feasibility arrives in the next phase." so the panel matches mockup 04 without pretending.

`Workspace.tsx`: grid `main.ws` per tokens.css; owns the context; on mount loads `/me`, then the active project (`activeProjectId`) or the scratch project, then its documents, selecting `settings`-remembered doc or the first; restores `settings.toolTab` (default `STAGE_FIRST_TOOL[project.stage]` for a project, else `idea`). The centre column renders `DocumentCard` (Task 8); until Task 8 lands it renders the phase-1 `Editor` for the current document so the page is usable at every commit.

`app/(app)/page.tsx`: `<Workspace />`. `app/(app)/layout.tsx`: auth redirect as now, then `<SettingsProvider><ToastHost /> {children}</SettingsProvider>`.

- [ ] **Step 4: Verify in the browser**

Run `pnpm --filter @appuscholar/web dev` and the api; sign in with the e2e provider; check against `design/mockups/01-workspace-tool-open.html`: three columns at 1440px, sidebar groups all open, "Stage 1 of 6 · Idea & Feasibility" with only Next, clicking "Next: Literature Review →" opens Research (stub) and the guide reads "Stage 2 of 6"; ☰ collapses to the rail; reload restores the tool and the collapse state. Take a screenshot into `docs/walkthroughs/screens/phase2-task6.png`.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
pnpm -r typecheck && pnpm -r lint && pnpm --filter @appuscholar/web test
git add apps/web
git commit -m "feat(web): workspace layout with v1 sidebar, dock tabs and stage guide"
```

---

### Task 7: Project bar, scratch space, Save as research project, Research Projects dialog, stage intro

**Blueprint:** BLUEPRINT §3 "project bar"; §4 Stage 1 "The student names a project; the six-stage intro appears." 01 §A "Project bar" (all steps, copy, "Guided-not-locked"). Design: `design/mockups/03-project-bar-stage-intro.html`. v1 `renderProjectBar` 2796–2808, `renderStageHighlight` 2813–2822, `setActiveProject` 2778–2794, `saveAsProject` ~2879, `stageIntroShow` ~2840, `updProjectBarStatus` 3300, dialog markup `stageIntroDlg`.

**Files:**
- Create: `apps/web/components/workspace/ProjectBar.tsx`, `apps/web/components/workspace/dialogs/SaveAsProject.tsx`, `Projects.tsx`, `StageIntro.tsx` (replaces `components/projects/StageIntro.tsx`)
- Modify: `apps/api/src/routes/projects.ts` (`contentLang` in Patch; `POST /:id/documents/:docId/move`? no: `POST /documents/:id/move` in documents.ts), `apps/api/src/routes/documents.ts`
- Test: `apps/api/test/app.test.ts` (move route), e2e in Task 21

**Interfaces:**
- API: `POST /documents/:id/move` body `{ projectId }` → `DocumentSummary` or 404; `PATCH /projects/:id` accepts `contentLang`.
- `ProjectBar` reads `project`, `currentDoc`, `documents` from `WorkspaceCtx`; emits `openSaveAs(mode: "new"|"existing", prefillName?)`, `openProjects()`, `openBackup()` (Backup is Phase 5: button toasts "Backup arrives in a later phase. Your work is already saved on the server with every revision." and is `data-testid="backup-btn"`).

- [ ] **Step 1: Failing API test for move**

```ts
it("moves a document between the user's projects and refuses foreign ones", async () => {
  const me = await (await app.request("/me", { headers: auth })).json() as { scratchProjectId: string };
  const d = await (await app.request(`/projects/${me.scratchProjectId}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Draft" }) })).json() as { id: string };
  const p = await (await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "Thesis" }) })).json() as { id: string };
  const r = await app.request(`/documents/${d.id}/move`, { method: "POST", headers: auth, body: JSON.stringify({ projectId: p.id }) });
  expect(r.status).toBe(200); expect(((await r.json()) as { projectId: string }).projectId).toBe(p.id);
  expect((await app.request(`/documents/${d.id}/move`, { method: "POST", headers: auth, body: JSON.stringify({ projectId: "nope" }) })).status).toBe(404);
});
```
Run → FAIL. Implement the route with `store.moveDocument`. Run → PASS.

- [ ] **Step 2: ProjectBar**

Scratch state: `<div class="label scratch">{t("project_bar_empty")}</div>`. Project state: name + `<Badge variant="stage">{t("stage_"+stage)}</Badge>` + `<Badge variant="ok">{t("project_complete_badge")}</Badge>` when complete. Buttons (`Button variant="primary"` for the first): `t("project_bar_new")` ("✨ New project"), `t("save_as_project_btn")`, `t("projects_btn")`, `t("backup_btn")` with `title={t("backup_btn_title")}`. Right: `{currentDoc.title} · {wordCount} words` (v1 `updProjectBarStatus` 3300 builds this literal; no key), updated from the editor's live count. `data-testid`: `project-bar-label`, `new-project`, `save-as-project`, `projects-btn`, `project-bar-status`.

- [ ] **Step 3: SaveAsProject dialog**

Title `t("sap_h2")` ("💾 Save as research project"); description `t("sap_desc")` = "Research projects track which stage a piece of work is at, so the app can point you to the right tools. Nothing you've written moves or changes — this just labels it."; radio `t("sap_mode_new")` / `t("sap_mode_existing")`; `t("sap_name_label")` input with `t("sap_name_placeholder")`; `t("sap_existing_label")` select; `t("sap_stage_label")` select of six stages (default idea); `t("sap_save_btn")`, `t("sap_cancel_btn")`. On save (new): `POST /projects {title}`, `PATCH /projects/:id {stage}`, `POST /documents/:id/move` for the current document when it lives in scratch, `PATCH /me/active-project`, toast `t("toast_saved_as") + name`, then open `StageIntro` (new path: `skipJump`, the intro's button jumps). On save (existing): move the document, set active, toast `t("toast_moved_into") + name`. Empty name: toast `t("toast_name_first")`. No existing projects and mode existing: toast `t("toast_no_existing_project")`. "✨ New project" and the sidebar's "✨ New Research Project" open this dialog in mode new with the stage preset to idea; "💾 Save this idea as a project" (IdeaPanel) opens it with the name prefilled from the first 80 characters of the idea field (02 Idea step 5). `data-testid`: `sap-dialog`, `sap-name`, `sap-stage`, `sap-save`.

- [ ] **Step 4: StageIntro dialog**

Markup per mockup 03: `h2 = t("stageintro_h2")`, lead `t("stageintro_desc")`, `ol.stages` with number, emoji, `t("stage_"+k)`, `t("stageintro_desc_"+k)`, `.now` on the project's stage; buttons `t("stageintro_start_fmt", { stage: label })` (primary; calls `showTool(STAGE_FIRST_TOOL[stage])` and closes) and `t("stageintro_gotit_btn")`. Shown only on the new-project path. `data-testid`: `stage-intro`, `stage-intro-start`.

- [ ] **Step 5: Projects dialog**

heading `t("projects_btn")` ("📁 Research Projects"; v1 has no separate dialog-heading key); list from `GET /projects` (excludes scratch): name, stage badge, Complete badge, `{documentCount} documents`, last edited; row buttons `Open` (sets active project, jumps to `STAGE_FIRST_TOOL[stage]` unless complete, closes), `Mark complete` / `Reopen` (`PATCH status`; toasts `name + t("toast_marked_complete")` / `name + t("toast_reopened")`), `Delete` (AlertDialog "Delete \"{name}\" and its documents permanently?" / "Delete" / "Cancel"; cascade is the API's), and a `Work in scratch space` button that sets active project to null. Empty: `t("projects_empty")`. `data-testid`: `projects-dialog`, `project-row`, `project-open`, `project-complete`, `project-delete`, `scratch-space`.

- [ ] **Step 6: Stage highlight**

`currentStage` in `WorkspaceCtx` = project stage when a project is active and not complete, else null; `Sidebar` applies `.current` to that group (dot filled, header purple, tools indented with the purple rule) — a highlight, not a gate (01 §A "Guided-not-locked").

- [ ] **Step 7: Browser check against mockup 03**, then commit:

```bash
pnpm -r typecheck && pnpm -r lint && pnpm -r test
git add apps/api apps/web
git commit -m "feat: project bar, scratch space, save as research project, projects dialog and six-stage intro"
```

---

### Task 8: Document card: document selector, new, rename, delete with undo, Mark as source, autosave badge, provider badge, Download (Word) and LaTeX buttons

**Blueprint:** BLUEPRINT §3 "Centre: 'Your Document' with autosave, Download (Word), LaTeX file; the document selector with New, rename, delete, Import (.docx/.pdf/.txt), Mark as source". §4 Stage 6 "Export is Word or LaTeX." 01 §A "Document pane" steps 1–3, Autosave, Delete, Mark as source (toasts and badge title verbatim). Design: mockup 01 centre column; DESIGN-SYSTEM §7 "Document card", "Doc bar". v1 `docOriginToggle` 3165, `docDelete` 3277–3286, `docRename` 3272, `upd` 3310.

**Files:**
- Create: `apps/web/components/document/DocumentCard.tsx`, `DocBar.tsx`
- Modify: `apps/api/src/routes/documents.ts` (PATCH `{ kind }`, DELETE, POST `/:id/restore-deleted`), `apps/web/components/editor/Editor.tsx` (status callback exposes `SaveStatus` and live word count; remove the old status row), `apps/web/lib/useAutosave.ts` (unchanged API)
- Test: `apps/api/test/app.test.ts`

**Interfaces:**
- API: `PATCH /documents/:id` body `{ title?: string; kind?: "draft"|"source" }`; `DELETE /documents/:id` → 204, or 409 `{ error: "only-document" }`; `POST /documents/:id/restore-deleted` → `DocumentSummary`.
- `DocumentCard` props: none (reads `WorkspaceCtx`); renders `DocBar`, `FormatBar` (Task 9), `Editor`, `ActionRow` (Task 14).

- [ ] **Step 1: Failing API tests**

```ts
it("marks a document as a source and back", async () => {
  const { d } = await makeDoc();
  const r = await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ kind: "source" }) });
  expect(((await r.json()) as { kind: string }).kind).toBe("source");
  expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ kind: "weird" }) })).status).toBe(400);
});
it("refuses to delete the only document, soft-deletes otherwise, and restores", async () => {
  const { p, d } = await makeDoc();
  expect((await app.request(`/documents/${d.id}`, { method: "DELETE", headers: auth })).status).toBe(409);
  const d2 = await (await app.request(`/projects/${p.id}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Two" }) })).json() as { id: string };
  expect((await app.request(`/documents/${d.id}`, { method: "DELETE", headers: auth })).status).toBe(204);
  expect(((await (await app.request(`/projects/${p.id}/documents`, { headers: auth })).json()) as { id: string }[]).map(x => x.id)).toEqual([d2.id]);
  expect((await app.request(`/documents/${d.id}/restore-deleted`, { method: "POST", headers: auth })).status).toBe(200);
});
```
Run → FAIL. Implement. Run → PASS.

- [ ] **Step 2: DocumentCard header**

`.card-head`: `<h2>{t("doc_pane_h2")}</h2>`; autosave badge: `saved|dirty|saving` → `<Badge variant="ok" data-testid="save-status">{t("autosave_on")}</Badge>`; `error` → `<Badge variant="danger" data-testid="save-status">⚠ AUTO-SAVE OFF — DOWNLOAD NOW</Badge>` plus toast `Auto-save stopped working — click ⬇ Download to keep your work` once per failure streak (01 §A Autosave); the `beforeunload` guard already exists in `useAutosave`. Provider badge `<Badge variant="gold">{short}</Badge>` when a provider key exists (Task 13), else nothing. Right: `t("download_btn")` → `downloadWord` (Task 11), `t("latex_btn")` with `title={t("latex_btn_title")}` → `downloadLatex` (Task 11); until Task 11 these toast "Export arrives in the next task" — no: Task 11 ships in the same sub-phase, wire them as no-ops with `disabled` only if Task 11 is not merged yet; the reviewer of Task 8 accepts a disabled state with the title text present.

- [ ] **Step 3: DocBar**

`Doc` label (`t("doc_label")`), `<select>` of `documents` with `📄 ` prefix for `kind === "source"` (`data-testid="doc-select"`), `t("doc_new_btn")` opens a small dialog "Name for the new document:" with default `Untitled {n}` (v1 prompt text; dialog instead of `prompt()`), creates via `POST /projects/:id/documents` with the current project (scratch or active) and selects it; `✎` (`aria-label="Rename this document"`; v1 has no key, it is the prompt text) opens "Rename this document:" dialog → `PATCH {title}`, toast `Renamed ✓`; `🗑` (`aria-label={t("doc_delete_title")}`, class `icon del`) → AlertDialog `Delete "{title}" permanently?` with body `A copy can be brought back for ten seconds after you delete it.` (v2 wording for v2 change 6) → `DELETE`; on 409 toast `This is your only document — create another one first`; on 204 select the first remaining document and toast `Deleted — Undo` where the toast carries an Undo button (`data-testid="undo-delete"`) for 10 s calling `restore-deleted`; `t("doc_import_btn")` with `title={t("doc_import_title")}` (Task 10); origin toggle `t("org_btn_own")` ("📄 Mark as source", shown while the document is the student's own) / `t("org_btn_src")` ("✎ Mark as my own", shown while it is a source) → `PATCH {kind}`, toasts `t("toast_src")` / `t("toast_own")`; the badge title when source: "Marked as someone else's paper. Not counted in your % yours, My writing or writing samples." `data-testid`: `doc-new`, `doc-rename`, `doc-delete`, `doc-import`, `doc-origin`.

- [ ] **Step 4: Editor adjustments**

`Editor.tsx` gains props `onStatus(status: SaveStatus, seq: number)` and `onCount(words: number)` and drops its own footer; the editor element keeps `data-testid="editor"` and class `ProseMirror`; wrapper gets class `editor` and `highlight-ai` when the AI-text toggle (Task 14) is on. Placeholder: TipTap `Placeholder` extension from `@tiptap/extensions` with `t("editor_placeholder")` = "Start writing here… Select text and press Improve, or just write and let AI continue." (grep the key).

- [ ] **Step 5: Browser check, commit**

Create, rename, mark as source (select shows 📄), delete with Undo, autosave badge green; kill the API and type: badge turns red with the toast. Screenshot to `docs/walkthroughs/screens/phase2-task8.png`.
```bash
git add apps/api apps/web
git commit -m "feat: document card with selector, rename, soft delete with undo, mark as source and autosave badge"
```

---

### Task 9: Formatting toolbar (v1 set, More ▾), table size and image handling, find and replace, dictation

**Blueprint:** 01 §A "Formatting toolbar" (every control named; image ≤1600px with EXIF dropped by canvas redraw; table max 30x12 with header row; Find Ctrl+F with replace all and counts; Dictate with language select; More ▾ persisted as `appu_fmt_more`). Design: mockup 01 toolbar row; DESIGN-SYSTEM §7 "Formatting toolbar". Caption, Photo studio and the picture editor are Phase 5 (spec §11 item 5 "picture editor") and are not in this task.

**Files:**
- Create: `apps/web/components/document/FormatBar.tsx`, `apps/web/components/workspace/dialogs/TableSize.tsx`, `apps/web/lib/editor/image.ts`, `apps/web/components/document/FindReplace.tsx`, `apps/web/lib/editor/dictate.ts`
- Modify: `apps/web/lib/editorExtensions.ts` (add `TextAlign`, `Color`, `FontFamily`/`FontSize` from `@tiptap/extension-text-style` kit already present, `Underline` from StarterKit 3, `HardBreak`, a `PageBreak` node rendering `<div class="page-break" data-page-break>`)
- Test: `apps/web/test/image.test.ts` (jsdom), `apps/web/test/findReplace.test.ts` (pure matcher), `apps/web/test/editorSchema.test.ts` (extend round-trip with the new nodes)

- [ ] **Step 1: Failing tests**

`image.test.ts` (`// @vitest-environment jsdom`): `resizeImage(file, 1600)` returns a PNG/JPEG data URL whose decoded dimensions are ≤1600 on the longer side; test with a generated 2000×1000 canvas blob; assert width 1600, height 800. `findReplace.test.ts`: `findAll(text, query, { caseSensitive })` returns match ranges and `replaceAllText(text, query, repl)` returns the count; three assertions including overlapping safety.

- [ ] **Step 2: FormatBar**

Order and labels as v1 (01 §A): `Paragraph` select (Paragraph / Heading 1 / Heading 2 / Heading 3 / Quote), `B` `I` `U`, bullet, numbered, undo, redo, `🖼 Image` (file input accept image/*; `resizeImage` then `insertContent({ type: "image", attrs: { src } })`; toast `Image inserted — drag its corner handle to resize`; the resize handle is CSS `resize: both` on `.ProseMirror img` plus a `width` attribute written on mouseup), `⊞ Table` (TableSize dialog "Table size — rows x columns (e.g. 3x4):" default `3x4`, max 30x12, `insertTable({ rows, cols, withHeaderRow: true })`), `🔍 Find` (toggles FindReplace bar; `Ctrl/Cmd+F` inside the editor opens it; Escape closes), `🎤 Dictate` with language select (English (India) `en-IN`, Hindi `hi-IN`, English (US)); `More ▾` reveals: font family select (Georgia, Times New Roman, Arial, Noto Sans Devanagari), size select (12–24), strike, superscript, subscript, text colour, highlight, indent/outdent, clear formatting, align left/centre/right/justify, `+Row`, `+Col`, `⤓ Page Break`. `More` state persisted in `settings.fmtMore`. Every button `type="button"`, `onMouseDown={e => e.preventDefault()}` (keeps the selection), `aria-label`, `aria-pressed` for toggles, `data-testid="fmt-<name>"`.

- [ ] **Step 3: Dictation**

`dictate.ts`: wraps `window.SpeechRecognition || webkitSpeechRecognition`; `start(lang, onText)` inserts interim text replaced on final; unsupported → toast `Dictation is not available in this browser. Chrome and Edge support it.`; default language follows content language (`hi-IN` when Hindi, 01 §A).

- [ ] **Step 4: Verify in the browser** against the mockup toolbar; insert a table and an image; undo/redo; find and replace all shows `Replaced N`. Commit:
```bash
git add apps/web
git commit -m "feat(web): v1 formatting toolbar with More, table size, image resize, find and replace, dictation"
```

---

### Task 10: Import (.docx, .pdf, .txt, .md, .html) with "Whose writing is this?", drag-drop and paste; Template picker

**Blueprint:** BLUEPRINT §3 "Import (.docx/.pdf/.txt)"; §2 rule 7 context (sources never count as the student's). 01 §A "Import (`docImportFiles` 3246)" with `imp_note` and the PDF rule; "Template (`insertScaffold` 6343)" with `SCAFFOLDS` 6338–6341. v1 `docImportFiles` 3246–3261, `docImportOne` 3262–3271 (mammoth options, pdf text extraction), `impAsk`.

**Files:**
- Create: `apps/web/lib/import/parse.ts`, `apps/web/components/workspace/dialogs/ImportOrigin.tsx`, `apps/web/lib/templates.ts`, `apps/web/components/workspace/dialogs/TemplatePicker.tsx`
- Modify: `apps/web/package.json` (`mammoth`, `pdfjs-dist`), `apps/web/components/document/DocBar.tsx` (Import button), `Editor.tsx` (drop and paste of files)
- Test: `apps/web/test/import.test.ts` (jsdom; txt, md, html, oversized data URI), `apps/web/test/templates.test.ts`

**Interfaces:**
- `parseImportFile(file: File): Promise<{ title: string; html: string; isPdf: boolean; droppedImages: number }>`; `.doc` rejects with `Save As .docx in Word first`; html passes through `sanitizeHtml` from core; images whose `src` data URI exceeds 30,000 characters become `<p>[picture removed on import: too large]</p>` (Review Focus 4).
- `SCAFFOLDS: Record<"Lab report (APA)"|"Essay"|"Literature review", string>` verbatim from v1 6338–6341; `scaffoldToHtml(text): string` turns each line into `<p>`, a line that is a bare heading in the scaffold (Title, Abstract, Keywords:, Introduction, Method, Participants, Materials, Procedure, Design, Results, Discussion, References, Conclusion, Synthesis, Method of review, Theme 1–3, and "[...]" lines stay paragraphs) into `<h2>` except `Title` → `<h1>` (v2 change 5; the words are his).

- [ ] **Step 1: Failing tests**

```ts
// templates.test.ts
import { SCAFFOLDS, scaffoldToHtml } from "../lib/templates";
it("keeps v1 scaffold text and renders headings", () => {
  expect(Object.keys(SCAFFOLDS)).toEqual(["Lab report (APA)", "Essay", "Literature review"]);
  expect(SCAFFOLDS["Essay"]).toContain("[Counter-argument and your response]");
  const html = scaffoldToHtml(SCAFFOLDS["Lab report (APA)"]);
  expect(html.startsWith("<h1>Title</h1>")).toBe(true);
  expect(html).toContain("<h2>Participants</h2><p>[N, age M and SD, sampling, ethics approval, informed consent]</p>");
});
```
```ts
// import.test.ts  (// @vitest-environment jsdom)
it("imports txt as paragraphs, md as paragraphs, html sanitised, and drops huge pictures", async () => {
  const txt = new File(["one\n\ntwo"], "a.txt", { type: "text/plain" });
  expect((await parseImportFile(txt)).html).toBe("<p>one</p><p>two</p>");
  const big = "data:image/png;base64," + "A".repeat(40000);
  const html = new File([`<p>x</p><img src="${big}"><script>1</script>`], "a.html", { type: "text/html" });
  const r = await parseImportFile(html);
  expect(r.droppedImages).toBe(1); expect(r.html).not.toContain("script"); expect(r.html).toContain("[picture removed on import: too large]");
  await expect(parseImportFile(new File([""], "old.doc"))).rejects.toThrow("Save As .docx in Word first");
});
```

- [ ] **Step 2: Implement parse.ts**

`.docx`: `mammoth.convertToHtml({ arrayBuffer }, { styleMap: ["p[style-name='Title'] => h1:fresh"] })` then sanitise. `.pdf`: `pdfjs-dist` with `GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()`; join each page's `textContent.items` strings, split on blank lines into `<p>`. `.txt`/`.md`: paragraphs on blank lines, escape HTML. `.html`: sanitise. Title = file name without extension.

- [ ] **Step 3: Flow**

`DocBar` Import button opens a file input (`accept=".docx,.pdf,.txt,.md,.html,.htm"`, multiple). Non-PDF files first open `ImportOrigin`: `t("imp_h")` ("Whose writing is this?") with `t("imp_note")`, buttons `t("imp_own")` ("My own writing") / `t("imp_src")` ("Someone else's paper (a source)") / `Cancel`. Each file → `POST /projects/:id/documents { title, kind }` then `PUT /documents/:id { bodyHtml }`; PDFs always `kind: "source"` with toast `t("imp_pdf_toast")`; sources toast `t("imp_src_toast")`; own writing toasts `Imported "{title}" ✓ — check formatting before you keep going`; more than one file toasts `Importing {n} files — each becomes its own document…`. Dropped images append ` ({n} pictures were too large and were removed)` to the toast. Drag-and-drop onto the editor and pasting a file (01 §A) call the same flow. `data-testid`: `import-origin-own`, `import-origin-source`.

- [ ] **Step 4: TemplatePicker**

Opened by `🧱 Template` in the action row (Task 14 renders the row; this task adds the dialog and `insertPlainHtml`): "Which template?" radio list of the three names, `Insert` / `Cancel`; inserts `scaffoldToHtml(...)` at the cursor or end, untagged; toast `Template inserted ✓ — Ctrl+Z to undo`.

- [ ] **Step 5: Run tests, browser check with a real .docx and .pdf, commit**
```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): import docx, pdf, txt, md and html with source marking; v1 templates"
```

---

### Task 11: Exports: Download (Word) and LaTeX file

**Blueprint:** 04 "Word download and LaTeX export" (every mapping listed: `.doc` Word-namespaced HTML with Times New Roman 12pt line-height 2 and BOM; LaTeX `article` 12pt, a4 1in, inputenc, ulem, apacite, section mapping, lists, quotes, tables all `l`, inline marks, links as footnotes, page break `\newpage`, author line with ORCID, images not exported; toasts). v1 `downloadDoc` 5751–5765, `_texEsc`/`_texInline`/`_texBlock`/`downloadLatex` 5768–5865.

**Files:**
- Create: `apps/web/lib/export/word.ts`, `apps/web/lib/export/latex.ts`, `apps/web/lib/export/download.ts`
- Test: `apps/web/test/latex.test.ts`, `apps/web/test/word.test.ts` (both `// @vitest-environment jsdom`; add `jsdom` to web devDependencies, pinned by the root override to 26.1.0)

**Interfaces:**
- `wordDocument(title: string, bodyHtml: string): { filename: string; blob: Blob }`; `toLatex(title: string, bodyHtml: string, orcid?: string): string`; `latexDocument(...)` → `{ filename, blob }`; `downloadBlob(filename, blob)`.

- [ ] **Step 1: Failing tests (the mappings are the spec)**

```ts
import { toLatex } from "../lib/export/latex";
const body = `<h1>Intro</h1><p>Mean was <b>12%</b> &amp; <i>rising</i> <u>u</u> <s>s</s> x<sup>2</sup> H<sub>2</sub>O.</p><h2>Sub</h2><ul><li>a</li><li>b</li></ul><blockquote>q</blockquote><table><tr><th>h1</th><th>h2</th></tr><tr><td>1</td><td>2</td></tr></table><p><a href="https://x.org">link</a></p><div data-page-break></div><p>#$%&_{}~^\\</p><img src="data:image/png;base64,AA">`;
it("matches v1's LaTeX mapping", () => {
  const tex = toLatex("My Thesis", body, "0000-0001-2345-6789");
  expect(tex).toContain("\\documentclass[12pt]{article}\n\\usepackage[a4paper,margin=1in]{geometry}\n\\usepackage[utf8]{inputenc}\n\\usepackage{ulem}\n\\usepackage{apacite}");
  expect(tex).toContain("\\title{My Thesis}\n\\author{Author \\\\ ORCID: 0000-0001-2345-6789}");
  expect(tex).toContain("\\section{Intro}");
  expect(tex).toContain("Mean was \\textbf{12\\%} \\& \\textit{rising} \\underline{u} \\sout{s} x\\textsuperscript{2} H\\textsubscript{2}O.");
  expect(tex).toContain("\\subsection{Sub}");
  expect(tex).toContain("\\begin{itemize}\n\\item a\n\\item b\n\\end{itemize}");
  expect(tex).toContain("\\begin{quote}\nq\n\\end{quote}");
  expect(tex).toContain("\\begin{tabular}{ll}\nh1 & h2 \\\\\n1 & 2 \\\\\n\\end{tabular}");
  expect(tex).toContain("link\\footnote{https://x.org}");
  expect(tex).toContain("\\newpage");
  expect(tex).toContain("\\#\\$\\%\\&\\_\\{\\}\\textasciitilde{}\\textasciicircum{}\\textbackslash{}");
  expect(tex).not.toContain("base64");
});
it("author line without ORCID is plain", () => { expect(toLatex("T", "<p>x</p>")).toContain("\\author{Author}"); });
```
`word.test.ts`: `wordDocument("A/B: c", "<p>x</p>")` → filename `AB c.doc` (v1 strips `[^\w\- ]`), blob type `application/msword`, text starts with `\uFEFF<html xmlns:w="urn:schemas-microsoft-com:office:word">` and contains the Times New Roman style.

- [ ] **Step 2: Implement** by porting `_texEsc`, `_texInline`, `_texBlock` (read 5768–5837 for the block walker: h1–h3/h4, p, ul/ol, blockquote, table, br, div/page-break, img skipped) over `new DOMParser().parseFromString(html, "text/html").body`. `download.ts`: anchor click with `URL.createObjectURL`, revoke after 4 s. Wire `DocumentCard` buttons: Word → toast `Downloaded ✓ — opens in Word`; LaTeX → toast `LaTeX exported ✓ — upload the .tex file to Overleaf, or compile locally`; ORCID from `settings.orcid`.

- [ ] **Step 3: Tests pass, open the .doc in Word or LibreOffice once, commit**
```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): Word and LaTeX export ported from v1"
```

---

### Task 12: AI gateway: six provider adapters, personal-data guard, error mapping, AI-use log

**Blueprint:** BLUEPRINT §7 "v1 ... calls the provider with the student's own key... v2 keeps it exactly, as the first mode." §2 rules 2 and 3. 01 §E "Provider layer" (models, headers, defaults temp 0.8 / max 2000, 5xx retried 3 times at 0.7 s and 1.4 s, Gemini model chain on 400/404), "Error messages (`apiMsg` 5253)", "AI-use log" (§C). Spec §5 "AI gateway" own_key mode: "the plaintext key is sent per request over TLS to the gateway and used once, never stored server-side." v1 `callAIRaw` 5347–5400, `fetchRetry5xx` 5306–5313, `aiuRecord` 5443–5452.

**Files:**
- Create: `apps/api/src/ai/types.ts`, `apps/api/src/ai/providers/gemini.ts`, `anthropic.ts`, `openaiCompat.ts`, `apps/api/src/ai/gateway.ts`, `apps/api/src/routes/ai.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/package.json` (`@anthropic-ai/sdk`)
- Test: `apps/api/test/ai.gateway.test.ts` (mocked `fetch` and a stubbed Anthropic client), `apps/api/test/app.test.ts` (routes)

**Interfaces:**
```ts
// ai/types.ts
export type ProviderId = "gemini"|"groq"|"deepseek"|"openrouter"|"openai"|"claude";
export type CompleteInput = { provider: ProviderId; apiKey: string; prompt: string; temperature?: number; maxTokens?: number };
export type CompleteOutput = { text: string; model: string };
export type AiErrorCode = "no-key"|"key-rejected"|"model-gone"|"rate-limit"|"provider-error"|"network"|"blocked"|"truncated"|"empty"|"personal-data";
export class AiError extends Error { constructor(public code: AiErrorCode, public detail = "") { super(code); } }
export type Adapter = (input: CompleteInput, fetchImpl: typeof fetch) => Promise<CompleteOutput>;
// gateway.ts
export function complete(input: CompleteInput, deps: { fetch: typeof fetch; anthropic?: AnthropicFactory }): Promise<CompleteOutput>;
export function fetchRetry5xx(doFetch: () => Promise<Response>, tries = 3, sleep = (ms: number) => Promise<void>): Promise<Response>;
```
- Routes: `POST /ai/complete` body `{ provider, apiKey, prompt, temperature?, maxTokens?, noLang?, contentLang?, pdAccepted?, projectId? }` (apiKey ≤ 400 chars, prompt ≤ 60,000 chars) → `{ text, model }` or `{ error: AiErrorCode, detail }` with status 400 for `personal-data`/`blocked`/`truncated`/`empty`/`no-key`, 401 for `key-rejected`, 404 `model-gone`, 429 `rate-limit`, 502 `provider-error`/`network`. On success appends `AiUseEntry` with `d` = the client-sent `day` (YYYY-MM-DD, validated) and `k/g` from `classifyAiUse(prompt)` (skips when null or `settings.aiLogOff`). `POST /ai/test` body `{ provider, apiKey }` sends `Reply with the single word OK.` with maxTokens 20, temperature 0, no language suffix, no log row → `{ ok: true, reply }` or the error shape. `GET /ai/log?from&to` → `AiUseEntry[]`; `DELETE /ai/log` → 204; `GET /ai/log/summary?from&to` → `{ byKind: Record<string, number>; byProvider: Record<string, number>; total: number }`.

- [ ] **Step 1: Failing gateway tests**

```ts
import { describe, it, expect, vi } from "vitest";
import { complete, fetchRetry5xx } from "../src/ai/gateway";
import { AiError } from "../src/ai/types";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("gateway", () => {
  it("gemini walks the model chain on 404 and returns the model that answered", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string) => { calls.push(url); return url.includes("gemini-3.8-flash") ? json(404, {}) : json(200, { candidates: [{ content: { parts: [{ text: "hello" }] } }] }); });
    const r = await complete({ provider: "gemini", apiKey: "AIza-test", prompt: "p" }, { fetch: fetch as unknown as typeof fetch });
    expect(r).toEqual({ text: "hello", model: "gemini-3.6-flash" });
    expect(calls[0]).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  });
  it("gemini safety block maps to blocked with v1 wording", async () => {
    const fetch = vi.fn(async () => json(200, { promptFeedback: { blockReason: "SAFETY" } }));
    await expect(complete({ provider: "gemini", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "blocked", detail: "the AI refused this text (SAFETY). Try rewording it." });
  });
  it("openai-compatible providers use bearer auth and the v1 models; 401 maps to key-rejected", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => { expect((init.headers as Record<string,string>).Authorization).toBe("Bearer gsk_x"); return json(401, {}); });
    await expect(complete({ provider: "groq", apiKey: "gsk_x", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "key-rejected" });
  });
  it("openrouter sends the referer and title headers v1 sends", async () => {
    const fetch = vi.fn(async (_u: string, init: RequestInit) => { const h = init.headers as Record<string,string>; expect(h["HTTP-Referer"]).toBe("https://appuscholar.local"); expect(h["X-Title"]).toBe("Appuscholar"); return json(200, { choices: [{ message: { content: "ok" } }] }); });
    expect((await complete({ provider: "openrouter", apiKey: "sk-or-x", prompt: "p" }, { fetch: fetch as never })).model).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });
  it("retries 5xx three times then maps to provider-error", async () => {
    const fetch = vi.fn(async () => json(503, {}));
    await expect(complete({ provider: "groq", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "provider-error" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("fetchRetry5xx sleeps 700 then 1400 ms", async () => {
    const sleeps: number[] = []; let n = 0;
    await fetchRetry5xx(async () => json(n++ < 2 ? 500 : 200, {}), 3, async ms => { sleeps.push(ms); });
    expect(sleeps).toEqual([700, 1400]);
  });
  it("anthropic uses the SDK with the student's key, no temperature, and maps refusal to blocked", async () => {
    const create = vi.fn(async () => ({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }));
    const anthropic = (apiKey: string) => { expect(apiKey).toBe("sk-ant-x"); return { messages: { create } }; };
    await expect(complete({ provider: "claude", apiKey: "sk-ant-x", prompt: "p", temperature: 0.7 }, { fetch: vi.fn() as never, anthropic: anthropic as never })).rejects.toMatchObject({ code: "blocked" });
    expect(create.mock.calls[0]![0]).not.toHaveProperty("temperature");
  });
  it("empty answer maps to empty; MAX_TOKENS to truncated", async () => {
    const fetch = vi.fn(async () => json(200, { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }));
    await expect(complete({ provider: "gemini", apiKey: "k", prompt: "p" }, { fetch: fetch as never })).rejects.toMatchObject({ code: "truncated" });
  });
});
```

Route tests in `app.test.ts` (inject `deps` into `createApp` as `ai: { fetch, anthropic }`):
```ts
it("POST /ai/complete refuses unmasked personal data unless pdAccepted, logs provider, model and kind only", async () => {
  await app.request("/me", { headers: auth });
  const body = { provider: "groq", apiKey: "gsk_x", prompt: "Continue this writing in the same register, about 120 words. ... mail asha@uni.ac.in", day: "2026-10-15" };
  const refused = await app.request("/ai/complete", { method: "POST", headers: auth, body: JSON.stringify(body) });
  expect(refused.status).toBe(400); expect(await refused.json()).toEqual({ error: "personal-data", detail: "Found: 1 email address." });
  const ok = await app.request("/ai/complete", { method: "POST", headers: auth, body: JSON.stringify({ ...body, pdAccepted: true }) });
  expect(ok.status).toBe(200);
  const log = await (await app.request("/ai/log", { headers: auth })).json() as Array<Record<string, string>>;
  expect(log).toEqual([{ d: "2026-10-15", p: "groq", m: "openai/gpt-oss-120b", k: "continuing my draft", g: "text" }]);
  expect(JSON.stringify(log)).not.toContain("asha@");
});
it("never writes the key or the prompt to the console on failure", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await app.request("/ai/complete", { method: "POST", headers: auth, body: JSON.stringify({ provider: "groq", apiKey: "gsk_secret", prompt: "SECRET PROMPT", day: "2026-10-15" }) }); // fetch stub returns 503
  expect(JSON.stringify(spy.mock.calls)).not.toMatch(/gsk_secret|SECRET PROMPT/);
  spy.mockRestore();
});
it("POST /ai/test sends the OK probe and does not log", async () => { /* assert reply "OK" and GET /ai/log stays [] */ });
```

- [ ] **Step 2: Run → FAIL. Implement.**

`providers/gemini.ts`: port 5355–5380 (URL `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`, body `{contents:[{parts:[{text}]}],generationConfig:{temperature,maxOutputTokens}}`, chain `[PROVIDERS.gemini.model, ...fallbacks]` on 400/404, filter parts with `thought`, `MAX_TOKENS` → `truncated`, `promptFeedback.blockReason` → `blocked`). `providers/openaiCompat.ts`: groq `https://api.groq.com/openai/v1/chat/completions`, deepseek `https://api.deepseek.com/chat/completions`, openai `https://api.openai.com/v1/chat/completions`, openrouter `https://openrouter.ai/api/v1/chat/completions` (+ `HTTP-Referer: https://appuscholar.local`, `X-Title: Appuscholar`); body `{model, messages:[{role:"user",content:prompt}], temperature, max_tokens}`; `choices[0].message.content` else `empty`. `providers/anthropic.ts`: `new Anthropic({ apiKey })` per request via the injected factory (default `(k) => new Anthropic({ apiKey: k })`), `client.messages.create({ model, max_tokens, messages: [{ role: "user", content: prompt }] })` without `temperature` (Haiku 5.5 rejects non-default sampling), check `stop_reason === "refusal"` → `blocked` with `stop_details.category`, `max_tokens` → `truncated`, join `text` blocks, SDK errors by class: `AuthenticationError`/`PermissionDeniedError` → `key-rejected`, `NotFoundError` → `model-gone`, `RateLimitError` → `rate-limit`, `InternalServerError` → `provider-error`, `APIConnectionError` → `network`. Model: `claude-haiku-5-5` (DECIDED: v1 pins `claude-haiku-4-5-20251001`, a dated id that the current API resolves as `claude-haiku-4-5`; v1's intent is the cheapest Claude on the student's own key, so v2 uses the current Haiku; `fallbacks: ["claude-haiku-4-5"]` walks back on `model-gone`). Status mapping for HTTP providers: 401/403 → `key-rejected`, 404 → `model-gone`, 429 → `rate-limit`, 5xx after retries → `provider-error`, thrown fetch → `network`. Defaults temp 0.8, max 2000.

`routes/ai.ts`: Zod body; `scanText(prompt)`; if `total > 0 && !pdAccepted` → 400 `personal-data` with `Found: ...` built like v1 (`"1 email address, 2 phone numbers."`); apply `contentLangInstruction(contentLang)` unless `noLang`; call `complete`; on success `appendAiUse` unless `classifyAiUse` is null or `settings.aiLogOff`; errors → status by code; `app.onError` must never log request bodies (keep the existing handler; the route catches `AiError` itself and logs only `code`).

- [ ] **Step 3: Run → PASS. Commit**
```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): AI gateway with six provider adapters, personal-data guard, v1 error mapping and AI-use log"
```

---

### Task 13: Client AI plumbing: key lock and storage modes, AI Provider / Key dialog, provider pill, personal-data dialog, callAI with failover

**Blueprint:** BLUEPRINT §7; §2 rule 2. 04 §5 "AI provider setup" (six providers with setup steps, key storage question and three options with wording, passphrase prompts, test button wording, other settings), 01 §E "Key storage", "aiTest", "Failover", "Error messages". v1 `lockKey`/`unlockKeyBlob`/`ensureKey` 5040–5068, `openSettings`/`saveKey` 5170–5250, `callAI` 5320–5340, `apiMsg` 5253–5266, `showRateLimitAlert`.

**Files:**
- Create: `apps/web/lib/ai/keys.ts`, `apps/web/lib/ai/callAI.ts`, `apps/web/lib/ai/pdDialog.tsx`, `apps/web/components/workspace/dialogs/ProviderKey.tsx`, `Passphrase.tsx`, `RateLimit.tsx`
- Modify: `apps/web/components/workspace/Subbar.tsx`, `Header.tsx`
- Test: `apps/web/test/keys.test.ts` (jsdom + WebCrypto via Node's `crypto.webcrypto`), `apps/web/test/callAI.test.ts`

**Interfaces:**
```ts
// keys.ts
export type KeyMode = "pass" | "plain" | "session";
export async function lockKey(text: string, pass: string): Promise<string>;          // salt.iv.ct base64url, PBKDF2 250000
export async function unlockKeyBlob(blob: string, pass: string): Promise<string>;   // throws "bad blob" or on wrong passphrase
export const keyStore: {
  getUnlocked(p: ProviderId): string | null;                 // session memory or localStorage appu_key_<p>
  setPlain(p, key): void; setSession(p, key): void; clear(p): void;
  hasAny(p: ProviderId, blobs: Record<string,string>): boolean; // plain, session or server blob
  providersWithKeys(blobs): ProviderId[];
};
// callAI.ts
export type CallOpts = { temp?: number; max?: number; noLang?: boolean; noScan?: boolean; purposeDay?: string };
export async function callAI(prompt: string, opts: CallOpts, ctx: { provider: ProviderId; blobs: Record<string,string>; fallbackOn: boolean; contentLang: "en"|"hi"; projectId: string|null; askPassphrase(p: ProviderId): Promise<string|null>; askPd(sc: ScanResult): Promise<"mask"|"send"|"cancel">; openSettings(): void; onFailover(from: ProviderId, to: ProviderId): void }): Promise<string>;
export function apiMsg(code: AiErrorCode | "cancelled" | "bad-pass", detail?: string): string; // v1 strings
```

- [ ] **Step 1: Failing tests**

`keys.test.ts`: round trip `unlockKeyBlob(await lockKey("AIza123", "secret1"), "secret1") === "AIza123"`; wrong passphrase rejects; blob has three dot-separated base64url parts; `keyStore.setPlain` writes `localStorage["appu_key_gemini"]`; `setSession` does not touch localStorage.

`callAI.test.ts` (mock `apiFetch`):
- PD found and `askPd` returns `"cancel"` → rejects with message `Cancelled. Nothing was sent to the AI provider.` and `apiFetch` not called.
- `askPd` returns `"send"` → request body has `pdAccepted: true`; a second identical prompt in the same session does not ask again (signature memo).
- `askPd` returns `"mask"` → the prompt sent contains `[email]`.
- No unlocked key but a blob → `askPassphrase` called; wrong passphrase → rejects `Wrong passphrase — nothing was unlocked. Try again.` and no request.
- No key at all → `openSettings` called, rejects with `Add your API key first — click ⚙ at the top right.`
- `rate-limit` from gemini with groq key present and `fallbackOn` → second request to groq, `onFailover("gemini","groq")` called, resolves.
- `apiMsg("key-rejected")` → `Your API key was rejected. Open ⚙ and paste it again.`; `apiMsg("network")` → the full v1 "No internet connection, or this provider does not allow calls made directly from a web page..." sentence; `apiMsg("rate-limit")` → `Free limit reached for now. Wait a minute, or switch provider using the tabs at the top.`

- [ ] **Step 2: Implement keys.ts** (WebCrypto exactly as v1 5040–5055: PBKDF2-SHA-256 250,000 iterations, AES-GCM 256, salt 16, iv 12, base64url without padding), `callAI.ts` (order: scan → ask → ensure key → `POST /ai/complete` → on retriable code (`rate-limit`, `provider-error`, `key-rejected`, `model-gone`, `network`) and `fallbackOn`, try `PROV_ORDER` providers with an unlocked plain/session key (v1 only fails over to unencrypted keys) → toast via `onFailover`: `{From} did not answer, so this request used {To} instead.`).

- [ ] **Step 3: ProviderKey dialog** (`data-testid="provider-dialog"`)

Title `t("settings_h2")` ("🔑 Choose your AI provider"); provider `<select>` with the six labels (`Google Gemini — free, easiest`, `Groq — free & very fast`, `DeepSeek — paid, very cheap`, `OpenRouter — free models`, `ChatGPT (OpenAI) — paid`, `Claude (Anthropic) — paid`; take the exact strings from index.html:1148–1153); steps line rendered from `PROVIDERS[p].stepsHtml` with `tHtml` plus a real `<a target=_blank rel=noopener>` to `keysUrl` labelled `Open →`; the DeepSeek and OpenAI warnings as amber prose (`warning`); key input (`type=password`, `autocomplete=off`, placeholder `Paste your {short} key`); `t("settings_keymode_label")` ("How should this key be stored?") radio with `t("settings_keymode_pass")`, `t("settings_keymode_plain")`, `t("settings_keymode_session")` and the three hint sentences (`keyModeNote` 5069–5073); `Save Key` (pass mode: `Passphrase` dialog "Choose a passphrase for your keys. You will type it once each time you open Appuscholar. Nobody can recover it for you." min 6, confirm; `lockKey` → `PUT /me/credentials/:p`; also `setSession` so this tab works now; toast `{Name} connected ✓ and encrypted 🔒`; plain: `setPlain`, toast `{Name} connected ✓`; session: `setSession`); `t("aitest_btn")` ("🔌 Test my AI connection") → `POST /ai/test` with the typed or unlocked key; output line `Working ✓ Provider: {name}. The AI replied: {reply}` / `Not working. Provider: {name}. {apiMsg}`; locked and nothing typed: `{name}: your key is locked with a passphrase. Paste it again here to test it, or close this window and use any AI button once to unlock it.`; no key: `{name}: no key yet. Paste your key in the box above, then test again.`; `Forget this key` → clears local and `DELETE /me/credentials/:p`. Other settings in the same dialog: "AI content language" (English / Hindi (हिन्दी)) with the v1 explanation sentence, saved to the active project's `contentLang` or `settings.contentLang`; "Field of study" select (the eleven `FIELD_LIST` entries + Other, with "The AI uses this to pitch explanations and examples at your field."); ORCID iD; fallback checkbox `If my AI is busy or fails, try my other saved keys automatically` with its explanation; `Keep the log` checkbox (AI-use log on/off); `t("terms_reopen_btn")` ("Terms and where your data goes") link (Task 17, read-only). The warning about shared storage for local files is dropped (not true in v2). `data-testid`: `prov-select`, `key-input`, `key-mode-pass|plain|session`, `key-save`, `key-test`, `key-test-out`, `content-lang`, `field-select`.

- [ ] **Step 4: Subbar pill and header button wired**; `RateLimit` dialog `⏳ Free AI limit reached` with v1 text and `Switch to Groq now` / `Wait and try again in a minute` shown on `rate-limit` when a groq key exists.

- [ ] **Step 5: Tests pass; browser: save a Groq key in passphrase mode, reload, press Test → passphrase prompt → "Working ✓". Commit**
```bash
git add apps/web
git commit -m "feat(web): AI Provider / Key dialog, three key storage modes, personal-data dialog and callAI with failover"
```

---

### Task 14: AI suggestion pane, Continue / Improve / Extend, Accept / Copy / Dismiss, Tab, AI-text highlight, Draft first

**Blueprint:** BLUEPRINT §3 "the writing action row beneath: Continue Writing (Tab), Improve selection, Extend, Template, AI text, Viva question, Draft first"; §2 rules 1, 4, 6, 7, 8. 01 §B (all shared plumbing and the three actions, toasts, Accept semantics, provenance mark, 👁 AI text), §C "Draft first mode" (rule, copy, prompt, nothing insertable). Design: mockup 02; DESIGN-SYSTEM §7 "AI suggestion pane", "Action row"; principle 1 (gold = machine) and 2 (flags are sentences). v1 `acceptAI` 5298, `insertIntoEditor` 4195–4225, `setSug`/`clearSug` 5267/5293, `sugNoteFull` 6478, Tab handler 5742–5746, `toggleAiHighlight` 3918, `draftFeedback` 3376–3395. Viva question is Phase 5: the button renders and toasts "Viva question arrives in a later phase."

**Files:**
- Create: `apps/web/components/tools/AiPane.tsx`, `apps/web/components/document/ActionRow.tsx`, `apps/web/lib/editor/insert.ts`, `apps/web/lib/ai/suggestion.tsx` (SuggestionProvider: `{ sug: string|null; note: {msg, warn}|null; status: "idle"|"thinking"|"polishing"|"expanding"|"reading"; selectionAtRequest: boolean; set(...); clear(msg?) }`)
- Modify: `apps/web/components/workspace/Dock.tsx`, `Editor.tsx`
- Test: `apps/web/test/insert.test.ts` (jsdom; TipTap headless editor with `editorExtensions`), `apps/web/test/writingActions.test.ts` (pure orchestration with fakes)

**Interfaces:**
```ts
// insert.ts
export function insertAiText(editor: Editor, text: string, replaceSelection: boolean): void;  // wraps in span.ai-ins data-h=provHash(text); newlines → <br>; appends with a leading paragraph when not replacing and doc non-empty
export function insertPlainHtml(editor: Editor, html: string): void;                           // templates, untagged
export function selectionText(editor: Editor): string;                                         // "" when collapsed
export function tailText(editor: Editor): string;                                              // last 2000 chars of plain text
export function hasSelection(editor: Editor): boolean;
```

- [ ] **Step 1: Failing tests**

`insert.test.ts`:
```ts
// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";
import { insertAiText, tailText } from "../lib/editor/insert";
import { provHash } from "@appuscholar/core";
it("appends AI text at the end as a tagged span with a leading paragraph", () => {
  const ed = new Editor({ extensions: editorExtensions, content: "<p>mine</p>" });
  insertAiText(ed, "theirs\nmore", false);
  expect(ed.getHTML()).toBe(`<p>mine</p><p><span class="ai-ins" data-h="${provHash("theirs\nmore")}">theirs<br>more</span></p>`);
});
it("replaces the selection when asked", () => {
  const ed = new Editor({ extensions: editorExtensions, content: "<p>keep this drop this</p>" });
  ed.commands.setTextSelection({ from: 11, to: 20 });
  insertAiText(ed, "new", true);
  expect(ed.getHTML()).toBe(`<p>keep this <span class="ai-ins" data-h="${provHash("new")}">new</span></p>`);
});
it("tail is the last 2000 characters", () => {
  const ed = new Editor({ extensions: editorExtensions, content: "<p>" + "x".repeat(2500) + "</p>" });
  expect(tailText(ed).length).toBe(2000);
});
```
`writingActions.test.ts` drives `runWritingAction(kind, deps)` exported from `lib/ai/actions.ts` with fakes: Improve with no selection → toast `Select the text you want to improve first` and no call; Extend no selection → `Select the text you want to expand first`; Continue → `deps.callAI` receives the Continue prompt with the tail, status `thinking`, result stored, note from `accCheck(tail, result, "continue")`, toast `Suggestion ready — press Tab in the editor to accept`, `dockShow("ai")`; Improve → toast `Ready — press Tab to replace your selection`; Draft first on → `callAI` receives the supervisor prompt, `sug` stays null, pane text is `df_label + "\n\n" + reply`, toast `t("df_ready")`; Draft first with 10-word tail → toast `t("df_need_text")` and no call; error from callAI → `clear(apiMsg)` and the pane shows the message.

- [ ] **Step 2: Implement insert.ts, actions.ts, SuggestionProvider**

`insertAiText`: `const html = '<span class="ai-ins" data-h="' + provHash(text) + '">' + escapeHtml(text).replace(/\n/g, "<br>") + "</span>"`; if `replaceSelection` → `editor.chain().focus().insertContent(html).run()`; else `editor.chain().focus("end").insertContent((editor.isEmpty ? "" : "<p></p>") + html).run()` (the `ClassSpan` mark parses `span[class]` and keeps `data-h`; verify the round trip in the test; if the mark is not applied across the `<br>`, insert as a paragraph node whose content is the marked text with `hardBreak`s). Status strings: `💜 Thinking…` (continue), `💜 Polishing…` (improve), `💜 Expanding…` (expand), `t("df_thinking")` (draft first).

- [ ] **Step 3: AiPane and ActionRow**

`AiPane` (mockup 02): `h3 = t("ai_pane_h3")`, `desc = tHtml(t("ai_pane_desc"))`, `.ai-out` with the suggestion, the status string in `.thinking`, or `t("ai_pane_placeholder")` in `.empty`; `.ai-note` with `flag` class when `note.warn` (`role="status"`); row `t("accept_btn")` (primary, flex 1), `t("copy_btn")`, `t("dismiss_btn")`. Accept: if `!sug` toast `No suggestion to accept yet`; else `insertAiText(editor, sug, selectionAtRequest)`, `clear(t("ai_pane_placeholder"))`, `dockShow("tools")`, toast `Inserted ✓ — Ctrl+Z to undo`. Copy: `navigator.clipboard.writeText` → `Copied ✓` / `Nothing to copy yet` / `Could not copy — select the text instead`. Dismiss: `clear`, `dockShow("tools")`. Tab inside the editor accepts only when `sug` is non-null (TipTap `editorProps.handleKeyDown` on `Tab` without shift; otherwise return false so focus moves). Draft first output sets `sug = null` so Tab and Accept insert nothing (rule 4). `data-testid`: `ai-pane`, `ai-out`, `ai-note`, `ai-accept`, `ai-copy`, `ai-dismiss`.

`ActionRow`: `✨ Continue Writing <kbd>Tab</kbd>` (primary; `title={t("continue_btn_title")}`), `t("improve_btn")`, `t("extend_btn")` (title "Select some text first, then click to extend it"), `🧱 Template` (opens TemplatePicker; title "Insert a ready-made outline (lab report, essay, literature review)"), `👁 AI text` (toggle; title "Mark every AI-inserted passage directly in the document"; toasts `AI-inserted text highlighted in the document` / `Highlight off`; adds `highlight-ai` to the editor wrapper), `t("viva_btn")` (title `t("viva_btn_title")`, Phase 5 toast), `t("df_btn")` (toggle variant when on; title `t("df_btn_title")`; toggling toasts `t("df_on")` / `t("df_off")`; persisted in `settings.draftFirst`), spacer, `{n} words`, origin badge (Task 16). `data-testid`: `act-continue`, `act-improve`, `act-extend`, `act-template`, `act-ai-text`, `act-viva`, `act-draft-first`, `word-count`.

- [ ] **Step 4: Tests pass; browser against mockup 02 with a Groq key: Continue, see the amber note, Tab inserts a gold-underlined span, 👁 washes it. Commit**
```bash
git add apps/web
git commit -m "feat(web): AI suggestion pane, Continue/Improve/Extend with accuracy note, Accept via Tab, AI-text highlight, Draft first"
```

---

### Task 15: Ask Appuscholar (chat) panel and the selection bubble

**Blueprint:** BLUEPRINT §3 "Selection bubble on any selected text: Find papers, Cite, Improve"; §4 Stage 5 "Ask Appuscholar coaches". 01 §B "Ask Appuscholar (chat)" (copy, prompt via core, insert tagging, log label), §A "Selection bubble" (8–800 chars, 150 ms debounce, three buttons, hidden on input/scroll). v1 `askAI` 5710–5736, `chatInsert`, `selUpdate` 7628–7645, `selFind` 7650, `selCite` 7656, `selImprove`.

**Files:**
- Create: `apps/web/components/tools/ChatPanel.tsx`, `apps/web/components/document/SelectionBubble.tsx`
- Modify: `apps/web/package.json` (`@floating-ui/dom`), `Dock.tsx` (chat is a built tool), `Workspace.tsx` (`pendingSearch` state for Find papers)

- [ ] **Step 1: ChatPanel** (`data-testid="chat-panel"`): `h3 = t("tab_chat")`, desc `t("chat_panel_desc")` ("Your purple study buddy — ask anything about your writing. Each reply has an \"Insert into document\" button."), log of bubbles (DOM state only, not persisted, as v1), input placeholder `t("chat_input_placeholder")` ("Ask… e.g. Give me 3 title ideas"), `Send ➤`; Enter sends; user bubble, then `💜 thinking…`, then the reply with `+ Insert into document` → `insertAiText(editor, reply, false)` and toast `Inserted into your document ✓ — Ctrl+Z to undo`; errors replace the bubble with `apiMsg`. Prompt from `buildChatPrompt(settings.field ?? "psychology", q)`; no style profile.

- [ ] **Step 2: SelectionBubble** with `BubbleMenu` from `@tiptap/react/menus` (`shouldShow`: selection non-empty, inside the editor, trimmed text 8–800 chars; `updateDelay: 150`): buttons `t("sel_find")`, `t("sel_cite")`, `t("sel_improve")` in the `.sel-bubble` style. Find papers: stash up to 200 chars in `pendingSearch`, `showTool("research")` (the Research stub shows "Search arrives in the next phase. Your selected text is kept: “…”"). Cite: `showTool("cite")`, toast `t("sel_cite_toast")`. Improve: hide and run the Improve action (obeys Draft first). `data-testid`: `sel-bubble`, `sel-find`, `sel-cite`, `sel-improve`.

- [ ] **Step 3: Browser check against mockup 01 (bubble above the selection), commit**
```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): Ask Appuscholar chat with insert, and the v1 selection bubble"
```

---

### Task 16: "My writing" origin tracker: % yours badge, dialog, weekly picture, writing-process record

**Blueprint:** BLUEPRINT §2 rule 7 "'My writing' shows typed versus inserted with 'No targets, no score. It is just a mirror.' Retyping AI text counts as the student's." 01 §C "'My writing' origin tracker" (badge rule ≥20 chars, colours, tooltip, dialog copy `prov_desc`, `prov_total`, `prov_doc_fmt`, weekly `prov_trend`, source exclusion, record download sections and LIMITS, two measures). v1 `provShow` 3499, `provReportText` 3454–3498, `computeOriginality` 3346.

**Files:**
- Modify: `apps/api/src/routes/documents.ts` (PUT computes `originStats` via `originCount(clean)`), `apps/api/src/routes/projects.ts` (`GET /:id/writing-record`)
- Create: `apps/web/components/workspace/dialogs/MyWriting.tsx`, `apps/web/lib/writingRecord.ts`
- Test: `apps/api/test/app.test.ts`, `apps/web/test/writingRecord.test.ts`

**Interfaces:**
- `GET /projects/:id/writing-record` → `{ docs: Array<{ id; title; kind; stats: OriginStats }>; sources: Array<{ title; words }>; weekly: Array<{ weekStart: string; typed: number; ai: number }>; aiLog: { byKind: Record<string,number>; byProvider: Record<string,number>; total: number } }`. `weekly` = for each of the last 8 ISO weeks, the sum over documents of the latest revision's stats at or before that week's end (null weeks omitted).
- `buildRecordText(rec, build: string, today: string): string` (pure; v1 `provReportText` sections: header, WHAT THIS IS, WORDS BY ORIGIN, per-document table, WEEKLY PICTURE, AI-USE LOG summary by help type and provider, LIMITS).

- [ ] **Step 1: Failing tests**

API: after two PUTs (`<p>mine</p>` then `<p>mine <span class="ai-ins" data-h="x">theirs too</span></p>`), `GET /projects/:id/writing-record` returns `docs[0].stats = { typed: 1, ai: 2, passages: 1, kept: 0, edited: 1, unknown: 0 }` and `weekly` has one entry with `typed 1, ai 2`; a `kind: "source"` document appears in `sources` not `docs`.
Web: `buildRecordText` contains `WRITING-PROCESS RECORD (made with Appuscholar, ` + build, the sentence `It is not an AI detector.`, `WORDS BY ORIGIN`, and the LIMITS line `A student who retypes AI text by hand is counted as the author of those words`.

- [ ] **Step 2: Implement**; badge in `ActionRow`: hidden under 20 characters; `{pct}% yours` (`originShare(editor.getHTML())`, recomputed on a 400 ms debounce of editor updates) with `ok` ≥80, `flag` 50–79, `danger` below; source docs show `📄 source paper`; tooltip "Estimated share of the current document typed by you, versus inserted from an AI suggestion or chat reply. Editing inside an AI-inserted passage still counts toward the AI side."; click opens `MyWriting`: `h2 = t("prov_h")`, `t("prov_desc")`, `t("prov_total", {w,t,a})` (dialog measure = word share across the project's non-source docs, current editor HTML substituted for the open doc), per document `t("prov_doc_fmt", ...)` / `t("prov_doc_plain")` with `t("prov_unknown")` suffix when `unknown > 0`, weekly bars (`t("prov_trend")`, `t("prov_trend_none")` under 2 weeks, labels `t("prov_week", {d})`), `{w} words in {n} source paper(s) are left out of these counts.`, button `⬇ Download my writing-process record (.txt)` → `buildRecordText` → download `writing-process-record.txt`. `data-testid`: `origin-badge`, `my-writing`, `record-download`.

- [ ] **Step 3: Commit**
```bash
git add apps/api apps/web
git commit -m "feat: My writing origin tracker with % yours badge, weekly picture and writing-process record"
```

---

### Task 17: Terms and 18+ gate, Welcome, Help dialog

**Blueprint:** BLUEPRINT §2 rule 12 "18+ only, terms accepted before use"; §6 "The privacy promise changes from 'no server' to 'our server, your data, your key'; the terms and the lawyer's brief must say so." 04 §5 "First-use terms with the 18+ gate" (all copy, non-dismissible, Esc shows "Tick both boxes to continue.", under-18 path), "Welcome tour", Help FAQ lines from 01 §E. v1 dialog markup 1319–1342, `termsOpen/termsAccept/termsUnder` 5090–5128, `welcomeDlg` 1457–1471.

**Files:**
- Create: `apps/web/components/workspace/dialogs/Terms.tsx`, `Welcome.tsx`, `Help.tsx`
- Modify: `Workspace.tsx` (boot order: load `/me`; if `!termsAcceptedAt` open Terms; else if `!settings.seenWelcome` open Welcome), `Header.tsx` (Help)
- Test: e2e in Task 21

- [ ] **Step 1: Terms** (`data-testid="terms-dialog"`): `t("terms_h")`, `t("terms_data_h")`, list d1–d4, `t("terms_use_h")`, u1–u4, `t("terms_ver")`; checkboxes `t("terms_age")` (`data-testid="terms-age"`) and `t("terms_agree")` (`terms-agree`); `t("terms_cont")` (`terms-continue`) and `t("terms_under")`; `t("terms_need")` as `role="alert"` when a box is unticked; `t("terms_leave")` footer; under-18: `t("terms_under_msg")` + `t("terms_back")`. The dialog cannot be closed by Escape, overlay click or focus loss until accepted (Radix `onEscapeKeyDown`/`onPointerDownOutside` prevented; Escape shows the need line). Accept → `POST /me/terms`, close, then Welcome. Read-only mode (from Settings) shows `t("close_btn")` instead.

**v2 terms wording (DECIDED, for OJ and the lawyer; the Hindi strings must be re-translated to match):**
- d1 (replaces "Your documents, sources, projects and statistics data stay in this browser on this computer. Appuscholar has no server, so nobody at Appuscholar can see them. Clearing your browser data erases them, so download a backup now and then."): "Your documents, sources and projects are saved on Appuscholar's server under your account, with every version kept, so you can open them from any device. The people who run Appuscholar can see them only to keep the service running and will not read them for any other purpose. Statistics data is encrypted with a passphrase only you know before it leaves your browser."
- d2 (replaces "Your AI key also stays in this browser. It goes only to the AI provider you choose."): "Your AI key stays in this browser, or on the server locked with a passphrase only you know. When you press an AI button, the key travels with that one request to the provider you chose, is used once, and is not kept."
- d3: "When you press an AI button, the text you selected travels through Appuscholar's server straight to that provider (Google, Groq, OpenRouter, DeepSeek, OpenAI or Anthropic). Appuscholar does not keep it. The provider's own terms apply, and on a free key a provider may read or reuse what it receives. Never send names, phone numbers, roll numbers or other details that identify a participant."
- d4 unchanged except "The fonts load with the app" replaces "the fonts load from Cloudflare and Google" (fonts are self-hosted now; the Word/PDF/chart libraries note stays).
- u1–u4 unchanged. `terms_ver`: "Version 2, {date of deploy}." Store `TERMS_V = 2`; a user whose acceptance predates version 2 is re-asked (v1 behaviour: "terms version bump re-asks") — implement by comparing `termsAcceptedAt` with a `TERMS_SINCE` constant date set in Task 21.

- [ ] **Step 2: Welcome** (`t("welcome_h2")` "💜 Welcome to Appuscholar", intro with "Everything you write stays on this computer." replaced by "Everything you write is saved under your account." (DECIDED, same reason), four steps, `t("welcome_warn")`, buttons `Set up my key` (opens ProviderKey) / `Later`; sets `settings.seenWelcome`). Replayable from Help (`t("help_tour_btn")`).

- [ ] **Step 3: Help**: `t("help_h2")`, `t("help_intro")`, FAQ entries present in `en.json` under `faq_q_*`/`faq_a_*` that concern this phase (my work disappeared; something stayed in English; Tab did not accept; the AI did not answer), `t("help_contact_intro")` + `t("help_contact_btn")` as a `mailto:` link (the app never sends; rule 12) to the support address from `NEXT_PUBLIC_SUPPORT_EMAIL` or `t("help_contact_unset")`, `t("help_tour_btn")`, version line `Appuscholar v2 ({build})`, link "Terms and where your data goes".

- [ ] **Step 4: Commit**
```bash
git add apps/web
git commit -m "feat(web): terms and 18+ gate, welcome tour and help dialog with v2 data wording"
```

---

### Task 18: Hindi chrome pass

**Blueprint:** BLUEPRINT §1 "Hindi is a first-class interface language"; 01 §A "Hindi UI" and 04 §5 "Hindi toggle and content language" (two independent switches; toast wording; `t()` fallback). DESIGN-SYSTEM §4.3.

**Files:**
- Modify: every component under `components/workspace`, `components/document`, `components/tools` that still carries a literal where `en.json` has a key
- Test: `apps/web/test/i18n-coverage.test.ts`; e2e in Task 21

- [ ] **Step 1: Coverage test**: scan `components/**/*.tsx` for string literals that exactly equal a value in `en.json` and are not wrapped in `t(` on the same line; expect the list to be empty (a simple regex over the source files, run under vitest with `fs`). It fails until every literal is replaced.

- [ ] **Step 2: Replace literals with `t()`**; the header toggle calls `setLang`, toasts `Language: English` / `भाषा: हिन्दी`, sets `document.documentElement.lang`; the content-language setting is separate (Task 13). Devanagari renders in Plex Devanagari (font stack from Task 5); check button heights with Hindi labels at 390px and 1440px.

- [ ] **Step 3: Browser: toggle, compare the sidebar to v1's Hindi labels (`tab_*` in `hi.json`), screenshot `docs/walkthroughs/screens/phase2-hindi.png`. Commit**
```bash
git add apps/web
git commit -m "feat(web): Hindi chrome through t() with coverage test"
```

---

### Task 19: Phone layout, keyboard and screen-reader pass

**Blueprint:** BLUEPRINT §3 "Phone: single column with the dock as a bottom sheet"; §6 "keyboard and screen-reader behaviour done properly, and a phone layout that works." Design: mockup 05; DESIGN-SYSTEM §6 breakpoints, §10 accessibility rules.

**Files:**
- Create: `apps/web/components/workspace/PhoneSheet.tsx`, `SidebarDrawer.tsx`
- Modify: `globals.css` (media queries from tokens.css `.is-phone` rules keyed to `@media (max-width: 700px)` and the 701–1099 two-column rules), `Workspace.tsx`, `Header.tsx` (☰ at ≤700px opens the drawer)
- Test: `apps/web/e2e/phase2-responsive.spec.ts`

- [ ] **Step 1: Playwright at 390×844, 768×1024, 1440×900**: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), the sheet shows the two tabs and the stage guide, dragging the handle resizes between 40% and 85%, the drawer opens from ☰ and traps focus, Escape closes it, every button is ≥44px tall on phone; axe-core (`@axe-core/playwright`) reports no serious violations on the workspace with a tool open and with the AI pane open.

- [ ] **Step 2: Implement** per mockup 05 (header two rows with the version pill under the wordmark, project-bar buttons scroll sideways, document as the page, sheet with handle). Keyboard: Tab order header → project bar → sidebar → document → dock; dialogs trap focus and return it; `aria-live` on the toast and the AI note.

- [ ] **Step 3: Commit** `feat(web): phone layout with bottom sheet and drawer; keyboard and a11y pass`.

---

### Task 20: Remove the phase-1.5 reference screens; redirect; update the platform e2e

**Blueprint:** HANDOFF "The current `apps/web` screens are reference work and will be replaced by the real workspace."

**Files:**
- Delete: `apps/web/app/(app)/projects/**`, `apps/web/components/projects/**`, `components/shell/AppShell.tsx`, `Breadcrumb.tsx`, `components/documents/DocumentList.tsx`, `components/editor/TitleField.tsx`, `RevisionPanel.tsx` (revision history returns in a later phase as a dialog; the API routes stay)
- Modify: `apps/web/app/(app)/import/page.tsx` stays (v1 backup import) but uses the workspace header; add `apps/web/app/(app)/projects/page.tsx` as a redirect to `/`; `apps/web/e2e/platform.spec.ts` rewritten to sign in, land on `/`, write, reload, see the text, import a v1 backup from `/import` and see its documents in the Doc select.

- [ ] Steps: delete, fix imports, `pnpm -r typecheck && pnpm -r lint && pnpm -r test`, run the rewritten e2e against a Neon branch, commit `chore(web): remove phase-1.5 screens, redirect to the workspace, update platform e2e`.

---

### Task 21: Walk-through script, journey e2e, build version, deploy, live verification

**Blueprint:** HANDOFF "Definition of done per phase: a student completes that stage's numbered journey from the blueprint on the live URL, verified by a walk-through script that follows those steps. Tests passing is necessary, not sufficient." 01 §G steps 1, 2, 3, 5, 6, 7, 10 (My writing and AI text), 12 (export) are in scope for Phase 2; steps 4, 8, 9, 11 and the backup/recap parts of 12 belong to later phases and are listed as "not yet" in the script.

**Files:**
- Create: `docs/walkthroughs/phase-2.md`, `apps/web/e2e/phase2-walkthrough.spec.ts`, `apps/web/lib/version.ts` (`NEXT_PUBLIC_BUILD_SHA`)
- Modify: `apps/web/next.config.ts` (expose `VERCEL_GIT_COMMIT_SHA` as `NEXT_PUBLIC_BUILD_SHA`), `.github/workflows` if present (none yet: add `ci.yml` running lint, typecheck, unit tests on PRs)

- [ ] **Step 1: e2e journey** (mocked gateway via `page.route("**/ai/complete", ...)` returning a fixed continuation with one number, and `**/ai/test` returning `{ ok: true, reply: "OK" }`): sign in → terms dialog blocks, Escape shows "Tick both boxes to continue.", tick both, Continue → Welcome → "Set up my key" → pick Groq, paste `gsk_test`, choose "Protect with a passphrase", passphrase `secret1` twice, Save Key → toast "Groq connected ✓ and encrypted 🔒" → Test → "Working ✓ Provider: Groq. The AI replied: OK" → close → "✨ New project" named "Thesis on academic procrastination" → stage intro → "Start with Idea & Feasibility →" → sidebar highlights stage 1, guide "Stage 1 of 6 · Idea & Feasibility" → type two sentences → autosave badge "Auto-save on" → reload → text present, project bar shows the name and badge → `🧱 Template` → Essay → headings inserted → select a sentence → bubble appears → "💜 Improve" → pane "💜 Polishing…" → result → note (amber when the mock adds a number) → Tab → text replaced inside `span.ai-ins` → "👁 AI text" → wash visible (computed background of `.ai-ins`) → "% yours" badge below 100 → click → My writing dialog shows "AI passages: 1" → download record (`page.waitForEvent("download")`) → "✍ Draft first" on → Continue → pane shows `df_label` and Accept toasts "No suggestion to accept yet" → Draft first off → "⬇ Download (Word)" and "⬇ LaTeX file" downloads named after the document → हि → sidebar shows "विचार और व्यवहार्यता" → EN → reload with wrong passphrase on first AI use → "Wrong passphrase — nothing was unlocked. Try again." and no request made (assert the route handler was not hit).

- [ ] **Step 2: `docs/walkthroughs/phase-2.md`**: the same steps as a numbered checklist for a human on https://appuscholar-web.vercel.app with a real Groq key, each step with the expected screen text, a column for VERIFIED/FAILED and the date, plus the "not yet in this phase" list.

- [ ] **Step 3: Deploy**: push `phase-2-workspace`, open PR against `phase-1-platform` (body lists the v2 changes 1–8 and the terms wording for OJ), run the Drizzle migration against Neon (`pnpm --filter @appuscholar/db db:migrate` with the production `DATABASE_URL` from Vercel env, after a Neon branch dry run), deploy api then web (order from `apps/api/README.md`; `curl https://appuscholar-api.vercel.app/health`), set `TERMS_SINCE` to the deploy date, then run the walk-through script on the live URL and fill in the VERIFIED column with timestamps. Anything FAILED is fixed before the phase is called done.

- [ ] **Step 4: Final review** (fresh reviewer): spec compliance against this plan, "v1 fidelity" verdict against 01 §A, §B, §C (Draft first, My writing), §E, §G and 04 §5, and the fourteen rules of BLUEPRINT §2 as a checklist with evidence lines (file and test for each rule touched: 1, 2, 3, 4, 7, 8, 12; "not exercised in this phase" for 5, 6, 9, 10, 11, 13, 14). Commit `docs: phase 2 walk-through results and review` and hand to OJ.

---

## Self-review

**Spec coverage (BLUEPRINT §8 Phase 2 list):** layout (6), project bar (7), sidebar with stage groups (6), dock (6), stage guide (6), document pane with import (8, 10), Mark as source (8), toolbar (9), templates (10), Word and LaTeX export (11), AI Provider / Key dialog with six providers and the key lock (12, 13), personal-data scan (2, 12, 13), AI-use log (1, 12, 16), Continue / Improve / Extend / Ask Appuscholar with the accuracy note and Accept / Copy / Dismiss (14, 15), Draft first (14), the "My writing" tracker (16), the selection bubble (15), Hindi chrome (4, 18), terms and 18+ gate (17). Deploy and walk-through (21). No item unassigned.

**Deliberately out of this phase, named:** theme toggle, Caption and picture tools, Viva question, devil's advocate, recap, backup, revision history dialog, pop-out pages (buttons exist and say so); Idea & Feasibility call (Phase 3; the panel is a copy-faithful stub).

**Type consistency:** `OriginStats` (Task 1) used by Tasks 3, 16; `AiUseEntry` (1) by 12, 16; `ProviderId`/`PROVIDERS` (3) by 12, 13; `Settings` keys (1, 5) referenced by 6, 7, 13, 14, 17; `AiErrorCode` (12) by 13; `insertAiText` (14) by 15; `t()` keys named in 6–17 all exist in `en.json` or are flagged "grep the key" for the executor to confirm the exact v1 key name.

**Review Focus coverage:** 1 → Task 14 unit (`empty` mapping) and Task 21; 2 → Task 13 and Task 12; 3 → Task 14 and Task 16; 4 → Task 10; 5 → Task 13 and Task 21.

**Open questions for OJ (do not block Tasks 1–11):**
1. Anthropic model id: `claude-haiku-5-5` (cheapest current Claude on the student's key, DECIDED) or `claude-opus-5-5`?
2. The v2 terms wording in Task 17 goes to the lawyer with the HANDOFF open item.
3. Version badge: git short SHA (DECIDED) or a hand-bumped counter like v1's "Version 55"?
